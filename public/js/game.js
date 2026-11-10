// MỘNG PHƯỢNG HOÀNG – phía người chơi
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildLocation, DECOR } from './scenes.js';
import { spawn, seatPlacement, ready, loadModel, aim, v3 } from './chars.js';
import * as music from './music.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const socket = io();

// ---------------- dựng hình ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const labels = new CSS2DRenderer({ element: $('labels') });
const scene = new THREE.Scene();
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5); scene.add(hemi);
const fill = new THREE.DirectionalLight(0xffe8d0, 1.0); fill.position.set(2, 3, 6); scene.add(fill);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 120);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let world = null;        // địa điểm hiện tại
let me = null;           // thông tin bản thân từ máy chủ
let selfC = null;        // nhân vật của mình
const others = new Map();
let camYaw = 0, camDist = 3.2, camH = 1.6, snapCam = false;
let loadToken = 0;

function applyLights(L) {
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  scene.background = new THREE.Color(L.bg); scene.fog = new THREE.FogExp2(L.fog[0], L.fog[1]);
  renderer.toneMappingExposure = L.exposure;
  fill.intensity = L.exposure > 1.15 ? 1.0 : 0.15;
}
function rankTier(r) {
  if (/Hoàng hậu|Hoàng quý phi/.test(r)) return 't3';
  if (/Phi|phi/.test(r) && !/Phế/.test(r)) return 't2';
  if (/Quý nhân|Tần/.test(r)) return 't1';
  if (/Phế|lãnh/.test(r)) return 'tx';
  return 't0';
}
function makeLabel(name, rank, npc, onClick) {
  const d = document.createElement('div'); d.className = 'label' + (npc ? ' npc' : '');
  d.innerHTML = `<div class="bbl"></div>${esc(name)}${rank ? `<br><span class="r ${rankTier(rank)}">${rankTier(rank) === 't3' ? '★ ' : ''}${esc(rank)}</span>` : ''}`;
  if (onClick) { d.style.pointerEvents = 'auto'; d.style.cursor = 'pointer'; d.title = 'Bấm để nói chuyện'; d.onclick = e => { e.stopPropagation(); onClick(); }; }
  const o = new CSS2DObject(d); o.position.set(0, 1.12, 0); return o;
}
function bubble(label, text) {
  const b = label.element.querySelector('.bbl'); if (!b) return;
  b.className = 'bbl bubble'; b.textContent = text; clearTimeout(b._t); b._t = setTimeout(() => { b.className = 'bbl'; b.textContent = ''; }, 5000);
}

function clearWorld() {
  if (!world) return;
  scene.remove(world.group);
  for (const n of world.npcs) if (n.c) { n.c.dispose(); }
  for (const [, o] of others) o.c.dispose();
  others.clear();
  if (selfC) { selfC.dispose(); selfC = null; }
  world.group.traverse(o => { if (o.isCSS2DObject) o.element.remove(); });
  $('labels').innerHTML = '';
  world = null;
}
async function enterScene(loc, players) {
  const tok = ++loadToken;
  closeDecor(); seated = null;
  music.setMode(loc);
  // dựng cảnh mới ở hậu trường, cảnh cũ vẫn hiện cho tới khi xong
  const o = buildLocation(loc, { palace: me?.hasPalace, palaceName: me ? (me.name.split(' ').pop() + ' cung') : '' });
  o.loc = loc;
  await ready();
  await Promise.all([...o.npcs.map(n => loadModel(n.model)), loadModel(me.outfit), ...(players || []).map(p => loadModel(p.outfit))]).catch(() => {});
  if (tok !== loadToken) return;
  for (const n of o.npcs) {
    const c = await spawn(n.model); if (tok !== loadToken) { c.dispose(); o.npcs.forEach(x => x.c && x.c !== c && x.c.dispose()); return; }
    n.c = c; o.group.add(c.root);
    if (n.sit && o.throne) {
      c.root.position.set(0, o.dais.y, o.dais.z); const s = seatPlacement(c);
      o.throne.position.set(s.x, s.y - .04, s.z); o.throne.rotation.y = s.ry;
      for (const l of o.throne.userData.legs) { const h = s.y - .04 - o.dais.y; l.scale.y = h; l.position.y = -h / 2; }
      c.play('ngoi');
    } else {
      c.root.position.set(n.x, 0, n.z); c.root.rotation.y = n.ry || 0;
      c.play(n.idle || (n.model === 'cungnu' || n.model === 'mama' ? 'chap_tay' : 'dung_cho'));
    }
    const lb = makeLabel(n.name, '', true, n.talk ? () => talk(n) : null); c.root.add(lb); n.label = lb;
  }
  if (tok !== loadToken) return;
  if (o.bed) { // chỉnh chiều cao giường cho vừa tư thế ngồi
    const ht = o.npcs.find(n => n.model === 'hoangthuong_dem');
    if (ht?.c) { const r = ht.c.root, px = r.position.x, pz = r.position.z, ry = r.rotation.y; r.position.set(0, 0, 0); r.rotation.y = 0; const sp = seatPlacement(ht.c); o.bedTop = sp.y; o.bed.scale.y = Math.max(.6, sp.y / .38); r.position.set(px, 0, pz); r.rotation.y = ry; ht.c.play(ht.idle || 'dung_cho'); ht.home = { x: px, z: pz, ry }; }
  }
  clearWorld();
  world = o; scene.add(o.group); applyLights(o.lights);
  camDist = o.cam.dist; camH = o.cam.height; camYaw = 0;
  if (o.decorable) renderDecor(me.decor);
  // bản thân
  const sp = clampPos(o.spawn.x + (Math.random() - .5) * 1.4, o.spawn.z + (Math.random() - .5) * .6);
  await respawnSelf(sp.x, sp.z, Math.PI);
  if (tok !== loadToken) return;
  sendMove('dung_cho'); snapCam = true;
  for (const p of players || []) addOther(p);
  renderMap(); renderActs();
}
async function respawnSelf(x, z, ry) {
  const tok = loadToken;
  const c = await spawn(me.outfit);
  if (tok !== loadToken) return c.dispose();
  if (selfC) { selfC.label?.element.remove(); selfC.root.parent?.remove(selfC.root); selfC.dispose(); }
  selfC = c; c.root.position.set(x, 0, z); c.root.rotation.y = ry; world.group.add(c.root);
  c.label = makeLabel(me.name, me.rankName); c.root.add(c.label);
  c.target = null; c.outfit = me.outfit;
}
async function addOther(p) {
  if (others.has(p.id) || !world) return;
  const holder = { p, c: null, tx: p.x, tz: p.z, try: p.ry };
  others.set(p.id, holder);
  const c = await spawn(p.outfit);
  if (others.get(p.id) !== holder || !world) return c.dispose();
  holder.c = c; c.root.position.set(p.x, 0, p.z); c.root.rotation.y = p.ry; world.group.add(c.root);
  c.label = makeLabel(p.name, p.rankName); c.root.add(c.label);
  c.play(p.anim || 'dung_cho');
}
function removeOther(id) { const o = others.get(id); if (!o) return; if (o.c) { o.c.root.remove(o.c.label); o.c.label.element.remove(); o.c.dispose(); } others.delete(id); }

// ---------------- di chuyển ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: camYaw, moved: false }; });
addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; camYaw = drag.yaw - dx * 0.006; });
addEventListener('pointerup', e => { const d = drag; drag = null; if (!d || d.moved || e.target !== canvas) return; clickWorld(e); });
canvas.addEventListener('wheel', e => { camDist = Math.min(7, Math.max(1.4, camDist + e.deltaY * 0.002)); }, { passive: true });
function clickWorld(e) {
  if (!world || !selfC || cutActive) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (decor.on) return decorClick();
  if (world.bed && ray.intersectObject(world.bed, true).length) return openBed();
  if (seated) standUp();
  const ground = []; world.group.traverse(o => { if (o.name === 'ground') ground.push(o); });
  const hit = ray.intersectObjects(ground, false)[0]; if (!hit) return;
  selfC.target = clampPos(hit.point.x, hit.point.z);
}
function clampPos(x, z) {
  const b = world.bounds; x = Math.min(b.maxX, Math.max(b.minX, x)); z = Math.min(b.maxZ, Math.max(b.minZ, z));
  for (const k of world.blocks || []) { const dx = x - k.x, dz = z - k.z, d = Math.hypot(dx, dz); if (d < k.r) { x = k.x + dx / (d || 1) * k.r; z = k.z + dz / (d || 1) * k.r; } }
  return { x, z };
}
let lastSend = 0, wasMoving = false;
function stepSelf(dt) {
  if (!selfC) return;
  const r = selfC.root;
  if (selfC.target) {
    const dx = selfC.target.x - r.position.x, dz = selfC.target.z - r.position.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { selfC.target = null; }
    else {
      const sp = 1.35 * dt, k = Math.min(1, sp / d);
      const np = clampPos(r.position.x + dx * k, r.position.z + dz * k); r.position.x = np.x; r.position.z = np.z;
      const want = Math.atan2(dx, dz); let diff = want - r.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); r.rotation.y += diff * Math.min(1, dt * 10);
      if (selfC.curName !== 'di') selfC.play('di');
    }
  }
  const moving = !!selfC.target;
  if (!moving && wasMoving) { selfC.play('dung_cho'); sendMove('dung_cho'); }
  if (moving && performance.now() - lastSend > 120) sendMove('di');
  wasMoving = moving;
}
function sendMove(anim) { lastSend = performance.now(); const r = selfC.root; socket.emit('move', { x: r.position.x, z: r.position.z, ry: r.rotation.y, anim }); }
function emote(a) { if (!selfC) return; if (seated) standUp(); selfC.target = null; selfC.play(a, { restart: true }); socket.emit('emote', a); }

// ---------------- vòng lặp ----------------
const clock = new THREE.Clock(); let T = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); T += dt;
  if (gateSpin) { camera.position.set(Math.sin(T * .08) * 5, 1.9, -2 + Math.cos(T * .08) * 5); camera.lookAt(0, .9, -2.5); }
  if (world) {
    stepSelf(dt);
    for (const n of world.npcs) if (n.c) n.c.update(dt);
    for (const [, o] of others) if (o.c) { const r = o.c.root; r.position.x += (o.tx - r.position.x) * Math.min(1, dt * 8); r.position.z += (o.tz - r.position.z) * Math.min(1, dt * 8); let diff = o.try - r.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); r.rotation.y += diff * Math.min(1, dt * 8); o.c.update(dt); }
    if (selfC) selfC.update(dt);
    if (world.flicker) for (const L of world.flicker) L.intensity = 2 + Math.sin(T * 9 + L.id) * .25 + Math.random() * .2;
    if (stage) stage.update(dt);
    else if (selfC && !gateSpin) {
      let p = selfC.root.position;
      if (seated?.ht?.c) { p = p.clone().add(seated.ht.c.root.position).multiplyScalar(.5); p.y = 0; }
      const want = new THREE.Vector3(p.x + Math.sin(camYaw) * camDist, camH, p.z + Math.cos(camYaw) * camDist);
      if (['phong', 'tamcung', 'lanhcung'].includes(world.loc)) { const b = world.bounds, m = .3; want.x = Math.min(b.maxX + m, Math.max(b.minX - m, want.x)); want.z = Math.min(b.maxZ + m, Math.max(b.minZ - m, want.z)); }
      if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) snapCam = true;
      if (!Number.isFinite(want.x + want.y + want.z)) { want.set(0, 1.6, 3); }
      if (snapCam) { camera.position.copy(want); snapCam = false; } else camera.position.lerp(want, Math.min(1, dt * 6)); camera.lookAt(p.x, seated ? (world.bedTop || .4) + .32 : .85, p.z);
    }
  }
  renderer.render(scene, camera); labels.render(scene, camera);
});

// ---------------- nhạc ----------------
addEventListener('pointerdown', () => music.start(), { once: true });
addEventListener('keydown', () => music.start(), { once: true });
function musicBtn() {
  const g = document.createElement('button'); g.id = 'guidebtn'; g.textContent = '📖 Hướng dẫn'; g.onclick = () => startTour(true); document.body.appendChild(g);
  const b = document.createElement('button'); b.id = 'musicbtn';
  const paint = () => b.textContent = music.isOn() ? '🎵 Nhạc: bật' : '🔇 Nhạc: tắt';
  b.onclick = () => { music.toggle(); paint(); }; paint(); document.body.appendChild(b);
}

// ---------------- màn hình vào cung ----------------
let gateSpin = true;
world = buildLocation('tuninh'); world.loc = 'gate'; scene.add(world.group); applyLights(world.lights);
const ORIGINS = { vanquan: ['Con nhà quan văn', '+5 Đức hạnh'], voquan: ['Con nhà võ tướng', '+5 Mưu kế'], thuongnhan: ['Con nhà thương nhân', 'Nhiều bạc hơn khi vào cung'], hocgia: ['Con nhà học giả', '+5 Tài nghệ'] };
const PATHS = { tainghe: ['Tài nghệ', 'Luyện tài nghệ được thêm 50% điểm'], duchanh: ['Đức hạnh', 'Thỉnh an được gấp đôi hài lòng Thái hậu'], giaote: ['Giao tế', 'Tặng quà được gấp đôi tình cảm, thêm 1 lượt/ngày'], muuke: ['Mưu kế', 'Điều tra có 1 manh mối miễn phí, ra tay rẻ hơn'] };
let pick = { origin: null, path: null };
function choices(el, data, key) { el.innerHTML = ''; for (const [k, [n, d]] of Object.entries(data)) { const b = document.createElement('button'); b.className = 'choice'; b.innerHTML = `${n}<small>${d}</small>`; b.onclick = () => { pick[key] = k; [...el.children].forEach(x => x.classList.toggle('on', x === b)); }; el.appendChild(b); } }
choices($('origins'), ORIGINS, 'origin'); choices($('paths'), PATHS, 'path');
$('bToReg').onclick = () => { $('loginCard').classList.add('hidden'); $('regCard').classList.remove('hidden'); };
$('bBack').onclick = () => { $('regCard').classList.add('hidden'); $('loginCard').classList.remove('hidden'); };
$('bLogin').onclick = () => socket.emit('login', { user: $('lu').value, pass: $('lp').value });
$('lp').addEventListener('keydown', e => { if (e.key === 'Enter') $('bLogin').click(); });
$('bReg').onclick = () => socket.emit('register', { user: $('ru').value, pass: $('rp').value, name: $('rn').value, origin: pick.origin, path: pick.path });
socket.on('err', m => { $('err').textContent = m; $('err2').textContent = m; });
socket.on('connect', () => { const t = localStorage.getItem('mph_token'); if (t) socket.emit('resume', { token: t }); });
socket.on('needLogin', () => localStorage.removeItem('mph_token'));
socket.on('auth', d => { localStorage.setItem('mph_token', d.token); });
socket.on('kicked', () => { toast('Tài khoản vừa đăng nhập ở nơi khác.', 'bad'); });

// ---------------- dữ liệu từ máy chủ ----------------
socket.on('me', async m => {
  const first = !me; const oldOutfit = me?.outfit;
  me = m;
  if (first) {
    $('gate').classList.add('hidden'); $('game').classList.remove('hidden'); gateSpin = false;
    setTimeout(() => { for (const m of ['thaihau', 'cungnu', 'thaigiam', 'mama', 'thaiy', 'thive', 'hoangthuong_dem', 'tunu', 'thuongtai_hong', 'quynhan', 'tan', 'phi', 'quyphi', 'hoangquyphi', 'hoanghau', 'aongu']) loadModel(m).catch(() => {}); }, 1500);
    musicBtn();
  }
  if (me.latThe) latTheMe = true;
  renderHud(); renderMap(); renderActs();
  if (selfC && world && oldOutfit && oldOutfit !== me.outfit && !stage) { const r = selfC.root; await respawnSelf(r.position.x, r.position.z, r.rotation.y); }
  if (selfC) { const r = selfC.label.element.querySelector('.r'); if (r) { const t = rankTier(me.rankName); r.className = 'r ' + t; r.textContent = (t === 't3' ? '★ ' : '') + me.rankName; } }
  if (caseOpenId) socket.emit('caseDetail', caseOpenId);
});
socket.on('scene', async d => { pendingScene = d; if (!stage) { await enterScene(d.loc, d.players); pendingScene = null; setTimeout(() => startTour(), 1200); } });
let pendingScene = null;
socket.on('pjoin', p => addOther(p));
socket.on('pleave', id => removeOther(id));
socket.on('pmove', d => { const o = others.get(d.id); if (!o) return; o.tx = d.x; o.tz = d.z; o.try = d.ry; if (o.c) o.c.play(d.anim, { restart: !!d.once }); });
socket.on('poutfit', async d => { const o = others.get(d.id); if (!o) return; o.p.outfit = d.outfit; const p = { ...o.p, x: o.tx, z: o.tz, ry: o.try }; removeOther(d.id); addOther(p); });
socket.on('chat', m => {
  const log = $('chatlog'); const div = document.createElement('div'); div.innerHTML = `<b>${esc(m.name)}:</b> ${esc(m.text)}`; log.appendChild(div); log.scrollTop = 1e6;
  const who = m.id === me?.id ? selfC : others.get(m.id)?.c; if (who?.label) bubble(who.label, m.text);
});
$('chatin').addEventListener('keydown', e => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter' && e.target.value.trim()) { socket.emit('chat', e.target.value); e.target.value = ''; } e.stopPropagation(); });
socket.on('newsAll', list => { $('newslist').innerHTML = ''; list.slice().reverse().forEach(addNews); });
socket.on('news', n => { addNews(n); if (['phong', 'latthe', 'an', 'latan', 'phat'].includes(n.kind)) toast('📜 ' + n.text); });
function addNews(n) { const d = document.createElement('div'); d.className = 'n'; d.innerHTML = `<time>${new Date(n.t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</time>${esc(n.text)}`; $('newslist').prepend(d); }
$('newsbtn').onclick = () => $('news').classList.toggle('hidden');
socket.on('toast', t => toast(t.text, t.kind));
socket.on('npcSay', d => { const n = world?.npcs.find(x => x.name === d.who); if (n?.label) bubble(n.label, d.text); else toast(`${d.who}: ${d.text}`); });
function toast(text, kind = 'info') { const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text; $('toasts').appendChild(d); setTimeout(() => d.remove(), 5200); }

// ---------------- HUD, bản đồ, hành động ----------------
function renderHud() {
  if (!me) return;
  $('hName').textContent = me.name; $('hRank').textContent = `${me.rankName} · ${me.pathName}${me.waiting ? ' · chờ ghế' : ''}`;
  const lo = me.nextPts ? (me.pts / me.nextPts) : 1; $('hBar').style.width = Math.min(100, lo * 100) + '%';
  $('hPts').textContent = me.nextPts ? `Công trạng ${me.pts}/${me.nextPts}` : `Công trạng ${me.pts}`;
  const t = me.tasks || {};
  $('stats').innerHTML = `<span class="pill">💰 Bạc <b>${me.silver}</b></span><span class="pill">⏳ Lượt <b>${me.turns}</b></span><span class="pill">💗 Sủng ái <b>${me.sung}</b></span><span class="pill">🍵 Thái hậu <b>${me.haiLong}</b></span><span class="pill">Nhiệm vụ: ${t.thinhan ? '✅' : '⬜'} thỉnh an ${t.luyen ? '✅' : '⬜'} luyện ${t.dotin ? '✅' : '⬜'} dò tin</span>${me.cases.length ? `<button class="pill" id="caseBtn" style="border-color:#c0503a">⚖️ Vụ án đang mở (${me.cases.length})</button>` : ''}`;
  const cb = $('caseBtn'); if (cb) cb.onclick = () => openCase(me.cases[0].id);
}
const LOCNAMES = { hoavien: 'Ngự hoa viên', tuninh: 'Từ Ninh cung', duongtam: 'Dưỡng Tâm điện', phong: 'Phòng riêng', tamcung: 'Tẩm cung', lanhcung: 'Lãnh cung' };
function renderMap() {
  if (!me) return;
  const m = $('map'); m.innerHTML = '';
  const list = me.lanh ? ['lanhcung'] : ['hoavien', 'tuninh', 'duongtam', 'phong'];
  if (latTheMe && !me.lanh) list.push('tamcung');
  for (const l of list) { const b = document.createElement('button'); b.textContent = l === 'phong' && me.hasPalace ? 'Cung riêng' : LOCNAMES[l]; b.classList.toggle('on', world?.loc === l); b.onclick = () => socket.emit('goto', l); m.appendChild(b); }
}
function act(type, extra = {}) { socket.emit('action', { type, ...extra }); }
function renderActs() {
  if (!me || !world) return;
  const a = $('acts'); a.innerHTML = `<div class="ttl">${LOCNAMES[world.loc] || ''}</div>`;
  const add = (label, sub, fn, dis) => { const b = document.createElement('button'); b.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`; b.onclick = fn; if (dis) b.disabled = true; a.appendChild(b); };
  const L = world.loc;
  if (L === 'tuninh') { add('🙇 Thỉnh an Thái hậu', me.thinhAn ? 'Hôm nay đã thỉnh an' : 'Miễn phí, mỗi sáng 1 lần', () => { emote('hanh_le'); act('thinhan'); }, me.thinhAn); }
  if (L === 'duongtam') add('🍲 Dâng canh Hoàng thượng', '1 lượt · 30 bạc · sủng ái +5', () => { emote('cui_chao'); act('dangcanh'); });
  if (L === 'hoavien') { add('👂 Dò tin', '1 lượt · nghe ngóng chuyện trong cung', () => act('dotin')); add('🎐 Luyện tài nghệ', '1 lượt · công trạng +8', () => { emote('mua'); act('luyen'); }); }
  if (L === 'phong') { add('🎐 Luyện tài nghệ', '1 lượt · công trạng +8', () => { emote('mua'); act('luyen'); }); add('👘 Thay trang phục', '', openWardrobe); add('🏮 Bài trí ' + (me.hasPalace ? 'cung' : 'phòng'), 'Đặt, xoay đồ nội thất', openDecor); }
  if (L === 'tamcung') { add('🛏 Lên giường', 'Ngồi cùng Hoàng thượng', openBed); add('🌙 Rời tẩm cung', 'Trời sắp sáng', () => socket.emit('goto', 'phong')); }
  if (L === 'lanhcung') { add('🧹 Làm việc lãnh cung', `Phục vị ${me.lanh?.tasks || 0}/3 · mỗi ngày 1 lần`, () => act('lanh')); if (me.lanh?.caseId) add('📜 Kêu oan', 'Điều tra lại vụ án cũ', () => openCase(me.lanh.caseId)); }
  if (!me.lanh) add('👥 Danh sách hậu cung', 'Tặng quà · ra tay', openRoster);
  add('💃 Động tác', 'Hành lễ, múa, che miệng cười…', openEmotes);
}
function openEmotes() {
  const E = [['hanh_le', 'Hành lễ'], ['cui_chao', 'Cúi chào'], ['chap_tay', 'Chắp tay'], ['che_mieng', 'Che miệng cười'], ['mua', 'Múa'], ['vo_tay', 'Vỗ tay'], ['quy', 'Quỳ'], ['khoc', 'Khóc'], ['gian', 'Giận'], ['nga', 'Ngất xỉu'], ['dung_cho', 'Đứng thẳng']];
  modal(`<button class="close" onclick="window._close()">✕</button><h3>Động tác</h3><div class="btns">${E.map(([k, n]) => `<button data-e="${k}">${n}</button>`).join('')}</div>`);
  $('mcard').querySelectorAll('[data-e]').forEach(b => b.onclick = () => { emote(b.dataset.e); closeModal(); });
}

// ---------------- nói chuyện với NPC ----------------
function talk(n) {
  const c = me.cases[0];
  if (n.talk === 'thinhan') { if (world.loc === 'tuninh') { emote('hanh_le'); act('thinhan'); } }
  else if (n.talk === 'dangcanh') { emote('cui_chao'); act('dangcanh'); }
  else if (n.talk === 'dotin') act('dotin');
  else if (n.talk === 'lanh') act('lanh');
  else if (n.talk === 'thaiy') { if (c) socket.emit('case', { caseId: c.id, op: 'clue', kind: 'thaiy' }); else bubble(n.label, 'Nương nương khí sắc tốt lắm, không có gì đáng lo.'); }
  else if (n.talk === 'cungnu') { if (c) socket.emit('case', { caseId: c.id, op: 'clue', kind: 'hoi' }); else bubble(n.label, ['Nương nương nghỉ ngơi chút đi ạ.', 'Nô tỳ đã pha trà hoa cúc.', 'Hôm nay trong cung có vẻ yên ắng.'][Math.floor(Math.random() * 3)]); }
  else if (n.talk === 'mama') bubble(n.label, 'Trong cung quy củ nghiêm ngặt, các vị chủ tử nhớ giữ mình.');
  else if (n.talk === 'thaigiam') bubble(n.label, 'Hoàng thượng đang phê tấu chương, chủ tử muốn dâng canh thì nô tài thông báo giúp.');
}

// ---------------- hộp thoại ----------------
function modal(html) { $('mcard').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); caseOpenId = null; }
window._close = closeModal;
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

// vụ án
let caseOpenId = null;
function openCase(id) { caseOpenId = id; socket.emit('caseDetail', id); }
socket.on('caseDetail', c => {
  if (caseOpenId !== c.id) return;
  const left = Math.max(0, c.deadline - Date.now()), hh = Math.floor(left / 3600e3), mm = Math.floor(left % 3600e3 / 60e3);
  const TN = { cung: 'Nơi ở', gio: 'Giờ lui tới', dau: 'Dấu vết' };
  const clueBtns = [['hoi', 'Hỏi cung nữ', 'miễn phí · biết giờ'], ['so', 'Dò sổ quà Nội vụ phủ', '1 lượt · 40 bạc · biết nơi ở'], ['tro', 'Lục tro tàn', '1 lượt · biết dấu vết'], ['thaiy', 'Nhờ thái y kiểm nghiệm', '80 bạc · biết dấu vết, không thể bị xóa']];
  const open = c.status === 'open' || c.reopen;
  modal(`<button class="close" onclick="window._close()">✕</button>
  <h3>⚖️ Vụ ${esc(c.methodName)}</h3>
  <div style="color:var(--muted)">Tội danh: ${esc(c.crime)}. ${c.status === 'open' ? `Còn <b style="color:var(--gold2)">${hh} giờ ${mm} phút</b> trước phiên xử ở Từ Ninh cung.` : c.reopen ? 'Đang kêu oan từ lãnh cung: chỉ đúng thủ phạm sẽ được phục vị.' : 'Vụ án đã khép.'}</div>
  <table><tr><th>Nghi phạm</th><th>${TN.cung}</th><th>${TN.gio}</th><th>${TN.dau}</th>${open ? '<th></th>' : ''}</tr>
  ${c.table.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.cung)}</td><td>${esc(s.gio)}</td><td>${esc(s.dau)}</td>${open ? `<td><button data-acc="${esc(s.id)}">Chỉ đích danh</button></td>` : ''}</tr>`).join('')}</table>
  <div style="font-weight:600;color:var(--gold);margin-top:8px">Manh mối đã có</div>
  ${c.found.length || c.witness ? '' : '<div style="color:var(--muted);font-size:13px">Chưa có manh mối nào. Mỗi manh mối cho biết một đặc điểm thật của thủ phạm.</div>'}
  ${c.found.map(f => `<div class="clue"><b>${esc(f.name)}:</b> ${esc(f.text)}</div>`).join('')}
  ${c.witness ? `<div class="clue"><b>Nhân chứng ${esc(c.witness.name)}:</b> ${esc(c.witness.text)} <i style="color:var(--muted)">(lời khai có thể sai nếu chính người này là thủ phạm)</i></div>` : ''}
  ${open ? `<div class="btns">${clueBtns.filter(([k]) => !c.found.some(f => f.kind === k)).map(([k, n, s]) => `<button data-clue="${k}">${n}<small style="display:block;color:var(--muted);font-size:11px">${s}</small></button>`).join('')}
  ${c.witness ? '' : '<button id="bWit">Nhờ người làm chứng<small style="display:block;color:var(--muted);font-size:11px">1 lượt</small></button>'}
  ${c.status === 'open' ? '<button id="bConf">Nhận tội<small style="display:block;color:var(--muted);font-size:11px">giảm nhẹ: giáng 1 bậc</small></button>' : ''}</div>` : ''}`);
  const mc = $('mcard');
  mc.querySelectorAll('[data-clue]').forEach(b => b.onclick = () => socket.emit('case', { caseId: c.id, op: 'clue', kind: b.dataset.clue }));
  mc.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { if (confirm('Chỉ đích danh người này? Sai sẽ bị phạt thêm tội vu cáo.')) socket.emit('case', { caseId: c.id, op: 'accuse', who: b.dataset.acc }); });
  const bc = $('bConf'); if (bc) bc.onclick = () => { if (confirm('Nhận tội để được giảm nhẹ?')) socket.emit('case', { caseId: c.id, op: 'confess' }); };
  const bw = $('bWit'); if (bw) bw.onclick = () => { witnessFor = c.id; socket.emit('roster'); };
});
socket.on('caseClosed', d => { closeModal(); showScroll('Phán quyết', d.text, [['Đóng', hideCut]]); });
let witnessFor = null, rosterMode = null;

// danh sách hậu cung
function openRoster() { witnessFor = null; socket.emit('roster'); }
socket.on('roster', r => {
  if (witnessFor) {
    const id = witnessFor;
    modal(`<button class="close" onclick="window._close()">✕</button><h3>Chọn người làm chứng</h3><table>${r.list.filter(p => p.id !== me.id).map(p => `<tr><td>${p.online ? '🟢' : '⚪'} ${esc(p.name)}</td><td>${esc(p.rankName)}</td><td><button data-w="${p.id}">Nhờ làm chứng</button></td></tr>`).join('') || '<tr><td>Chưa có ai khác trong cung.</td></tr>'}</table>`);
    $('mcard').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { socket.emit('case', { caseId: id, op: 'witness', who: b.dataset.w }); caseOpenId = id; witnessFor = null; });
    return;
  }
  const seats = r.seats.filter(s => s.seats).map(s => `${s.name} ${s.used}/${s.seats}`).join(' · ');
  modal(`<button class="close" onclick="window._close()">✕</button><h3>Danh sách hậu cung</h3><div style="color:var(--muted);font-size:12.5px">Ghế: ${seats}. Hoàng hậu: NPC giữ ngôi.</div>
  <table><tr><th>Phi tần</th><th>Cấp bậc</th><th>Sủng ái</th><th></th></tr>${r.list.map(p => `<tr><td>${p.online ? '🟢' : '⚪'} ${esc(p.name)}</td><td>${esc(p.rankName)}</td><td>${p.sung}</td><td>${p.id === me.id ? '' : `<button data-g="${p.id}">Tặng quà</button> ${me.canFight && p.canTarget ? `<button data-r="${p.id}" style="border-color:#c0503a">Ra tay</button>` : ''}`}</td></tr>`).join('')}</table>
  <div style="color:var(--muted);font-size:12px">Tặng quà: 1 lượt · 40 bạc. ${me.canFight ? `Ra tay: 1 lượt · ${me.path === 'muuke' ? 80 : 120} bạc, còn ${me.attacksLeft} lần hôm nay.` : 'Từ Quý nhân mới được ra tay.'}</div>`);
  const mc = $('mcard');
  mc.querySelectorAll('[data-g]').forEach(b => b.onclick = () => act('tangqua', { target: b.dataset.g }));
  mc.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    const t = r.list.find(p => p.id === b.dataset.r);
    modal(`<button class="close" onclick="window._close()">✕</button><h3>Ra tay với ${esc(t.name)}</h3><label>Mưu kế</label><select id="meth">${r.methods.map(m => `<option value="${m.id}">${esc(m.name)} — tội ${esc(m.crime)}</option>`).join('')}</select>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="blur" style="width:auto"> Chi thêm 100 bạc xóa bớt dấu vết (một manh mối sẽ bị mờ)</label>
    <div style="color:var(--muted);font-size:12.5px;margin-top:8px">Nạn nhân sẽ có ${24} giờ điều tra. Nếu bị lật án, bổn cung chịu phạt nặng gấp đôi.</div>
    <div class="btns"><button class="gold" id="goR">Cài tang vật</button></div>`);
    $('goR').onclick = () => { act('ratay', { target: t.id, method: $('meth').value, blur: $('blur').checked }); closeModal(); };
  });
});

// tủ đồ
const OUTFIT_NAMES = { tunu: 'Tú nữ · xanh lá', thuongtai: 'Đáp ứng · tím mũ hoa', thuongtai_hong: 'Thường tại · hồng gile kem', quynhan: 'Quý nhân · xanh dương', quynhan_lam: 'Quý nhân · xanh lam thêu bạc', tan: 'Tần · cam áo khoác', tan_tim: 'Tần · tím hoa mẫu đơn', phi: 'Phi · tím chuỗi ngọc', quyphi: 'Quý phi · đỏ vân kiên', quyphi_phuong: 'Quý phi · đỏ kim phượng', hoangquyphi: 'Hoàng quý phi · cam rồng phượng', hoangquyphi_kim: 'Hoàng quý phi · đỏ rượu áo choàng kim', hoanghau: 'Hoàng hậu · vàng mũ phượng', aongu: 'Áo ngủ · trắng' };
function openWardrobe() {
  modal(`<button class="close" onclick="window._close()">✕</button><h3>Tủ trang phục</h3><div style="color:var(--muted);font-size:12.5px">Mở khóa theo cấp bậc. Bị giáng cấp vẫn giữ trong tủ, nhưng chỉ mặc được bộ từ cấp hiện tại trở xuống.</div><div class="btns">${Object.entries(OUTFIT_NAMES).map(([k, n]) => `<button data-o="${k}" ${me.outfits.includes(k) ? '' : 'disabled'} ${me.outfit === k ? 'class="gold"' : ''}>${me.outfits.includes(k) ? '' : '🔒 '}${n}</button>`).join('')}</div>`);
  $('mcard').querySelectorAll('[data-o]').forEach(b => b.onclick = () => { socket.emit('wardrobe', b.dataset.o); closeModal(); });
}

// ---------------- bài trí phòng ----------------
const decor = { on: false, list: [], sel: -1, placing: null, group: null };
function renderDecor(list) {
  if (!world) return;
  if (decor.group) world.group.remove(decor.group);
  decor.group = new THREE.Group(); world.group.add(decor.group);
  decor.list = (list || []).map(d => ({ ...d }));
  decor.list.forEach((d, i) => { const m = DECOR[d.item].make(); m.position.set(d.x, 0, d.z); m.rotation.y = d.ry; m.userData.idx = i; decor.group.add(m); d.obj = m; });
}
function openDecor() {
  decor.on = true; decor.sel = -1; decor.placing = null;
  const bar = $('decorbar'); bar.classList.remove('hidden');
  bar.innerHTML = Object.entries(DECOR).map(([k, v]) => `<button data-d="${k}">${v.name}</button>`).join('') + '<button id="dRot">↻ Xoay</button><button id="dDel">🗑 Bỏ</button><button class="gold" id="dSave">Lưu</button><button id="dExit">Xong</button>';
  bar.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { decor.placing = b.dataset.d; bar.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('on', x === b)); toast('Bấm xuống sàn để đặt ' + DECOR[b.dataset.d].name); });
  $('dRot').onclick = () => { const d = decor.list[decor.sel]; if (d) { d.ry += Math.PI / 4; d.obj.rotation.y = d.ry; } };
  $('dDel').onclick = () => { const d = decor.list[decor.sel]; if (d) { decor.group.remove(d.obj); decor.list.splice(decor.sel, 1); decor.list.forEach((x, i) => x.obj.userData.idx = i); decor.sel = -1; } };
  $('dSave').onclick = () => socket.emit('decor', decor.list.map(({ item, x, z, ry }) => ({ item, x, z, ry })));
  $('dExit').onclick = closeDecor;
  toast('Chọn món đồ rồi bấm xuống sàn. Bấm vào món đã đặt để chọn, xoay hoặc bỏ.');
}
function closeDecor() { decor.on = false; $('decorbar').classList.add('hidden'); }
function decorClick() {
  const hitD = ray.intersectObjects(decor.group?.children || [], true)[0];
  if (hitD && !decor.placing) { let o = hitD.object; while (o && o.userData.idx === undefined) o = o.parent; decor.sel = o?.userData.idx ?? -1; toast('Đã chọn ' + DECOR[decor.list[decor.sel]?.item]?.name); return; }
  const ground = []; world.group.traverse(o => { if (o.name === 'ground') ground.push(o); });
  const hit = ray.intersectObjects(ground, false)[0]; if (!hit || !decor.placing) return;
  if (decor.list.length >= 24) return toast('Phòng đã đầy đồ.', 'bad');
  const p = clampPos(hit.point.x, hit.point.z);
  const d = { item: decor.placing, x: p.x, z: p.z, ry: 0 }; const m = DECOR[d.item].make(); m.position.set(p.x, 0, p.z); m.userData.idx = decor.list.length; decor.group.add(m); d.obj = m; decor.list.push(d); decor.sel = decor.list.length - 1;
}

// ---------------- cảnh diễn ----------------
let cutActive = false, stage = null, latTheMe = false;
function showScroll(title, html, buttons) {
  cutActive = true; const c = $('cut'); c.classList.remove('hidden'); c.classList.toggle('top', title === 'Thánh chỉ');
  c.innerHTML = `<div class="scroll${title === 'Thánh chỉ' ? ' edict' : ''}"><h3>${esc(title)}</h3><div>${html}</div><div class="btns">${buttons.map((b, i) => `<button class="${i === buttons.length - 1 ? 'gold' : ''}" data-i="${i}">${b[0]}</button>`).join('')}</div></div>`;
  c.querySelectorAll('[data-i]').forEach(b => b.onclick = () => buttons[+b.dataset.i][1]());
}
function hideCut() { $('cut').classList.add('hidden'); cutActive = false; if (!stage && !sacBusy) { const f = cutDone; cutDone = () => {}; f(); } }
let sacBusy = false;
const fade = (on) => new Promise(r => { $('fade').style.opacity = on ? 1 : 0; setTimeout(r, 650); });

const cutQ = []; let cutBusy = false;
socket.on('cutscene', d => {
  // nhiều lần tấn phong liền nhau: chỉ diễn lần cao nhất
  if (d.type === 'sacphong') { const i = cutQ.findIndex(x => x.type === 'sacphong'); if (i >= 0) { cutQ[i] = d; return; } }
  cutQ.push(d); nextCut();
});
async function nextCut() {
  if (cutBusy || !cutQ.length) return; cutBusy = true;
  await new Promise(r => setTimeout(r, 500)); // gom các lần tấn phong liền nhau
  const d = cutQ.shift();
  await new Promise(done => { cutDone = done; playCut(d); });
  cutBusy = false; nextCut();
}
let cutDone = () => {};
async function playCut(d) {
  if (d.type === 'tiencung') showScroll('Tiến cung', `Tú nữ <b>${esc(d.name)}</b> đã vào cung với lối sống <b>${esc(d.path)}</b>.<br><br>Mỗi ngày: thỉnh an Thái hậu ở <b>Từ Ninh cung</b>, luyện tài nghệ và dò tin ở <b>Ngự hoa viên</b>, dâng canh ở <b>Dưỡng Tâm điện</b>. Đủ công trạng sẽ được tấn phong. Tối nào Hoàng thượng cũng lật thẻ bài.<br><br>Bấm xuống đất để đi, kéo để xoay góc nhìn, bấm tên NPC để nói chuyện.`, [['Vào cung', () => { hideCut(); setTimeout(() => startTour(), 600); }]]);
  else if (d.type === 'sacphong' || d.type === 'phucvi') runSacPhong(d);
  else if (d.type === 'phatgiac') showScroll('Phát giác', `Quế ma ma khám phòng và tìm thấy <b>${esc(d.methodName)}</b>. Bổn cung bị nghi <b>${esc(d.crime)}</b>.<br><br>Có <b>${d.hours} giờ</b> trước phiên xử ở Từ Ninh cung. Hỏi cung nữ, dò sổ quà, lục tro, nhờ thái y, hoặc nhờ người làm chứng để tìm ra kẻ hãm hại.`, [['Để sau', hideCut], ['Xem vụ án', () => { hideCut(); openCase(d.caseId); }]]);
  else if (d.type === 'lanhcung') { await fade(true); showScroll('Lãnh cung', `Bổn cung bị đày vào lãnh cung vì <b>${esc(d.reason)}</b>.<br><br>Ở đây vẫn có đường về: làm việc lãnh cung 3 ngày để được phục vị, hoặc tiếp tục điều tra và kêu oan.<br><i>“Được, chờ bổn cung quay về.”</i>`, [['Bước vào lãnh cung', async () => { hideCut(); socket.emit('goto', 'lanhcung'); await fade(false); }]]); }
  else if (d.type === 'latan') showScroll('Lật án', `Chân tướng đã rõ: thủ phạm là <b>${esc(d.culprit)}</b>. Thái hậu minh xét, trả lại trong sạch cho ${esc(d.name)}.`, [['Tạ ơn Thái hậu', () => { hideCut(); emote('hanh_le'); }]]);
}
socket.on('latthe', d => {
  if (d.id === me?.id) { latTheMe = true; renderMap(); showScroll('Lật thẻ bài', `Tổng quản thái giám đến truyền: đêm nay Hoàng thượng lật thẻ bài của <b>${esc(d.name)}</b>.<br>Mời chủ tử tắm gội, thay áo, đến tẩm cung hầu giá.`, [['Để sau', hideCut], ['Đến tẩm cung', () => { hideCut(); socket.emit('goto', 'tamcung'); }]]); }
  else toast(`🏮 Đêm nay Hoàng thượng lật thẻ bài của ${d.name}.`);
});

async function runSacPhong(d) {
  sacBusy = true; cutActive = true; await fade(true); document.body.classList.add('staging');
  const saved = world; scene.remove(saved.group);
  const o = buildLocation('tuninh'); o.loc = 'stage'; scene.add(o.group); applyLights(o.lights);
  const prevOutfit = selfC?.outfit || 'tunu';
  const tg = await spawn('thaigiam'); tg.root.position.set(0, 0, 1.2); tg.root.rotation.y = 0; o.group.add(tg.root); tg.play('doc_chi');
  const edict = makeEdictProp(); o.group.add(edict);
  let pc = await spawn(prevOutfit); pc.root.position.set(0, 0, 2.4); pc.root.rotation.y = Math.PI; o.group.add(pc.root); pc.play('quy');
  const maids = [];
  stage = { update: dt => { tg.update(dt); pc.update(dt); maids.forEach(m => m.update(dt)); holdEdict(tg, edict); } };
  camera.position.set(1.2, 1.1, 4.7); camera.lookAt(-.1, .6, 1.7);
  await fade(false); music.gong();
  const edictText = d.type === 'phucvi'
    ? `Phụng thiên thừa vận, Hoàng đế chiếu viết: <b>${esc(d.name)}</b> nhận lỗi thành tâm, nay cho phục vị <b>${esc(d.rankName)}</b>. Khâm thử!`
    : `Phụng thiên thừa vận, Hoàng đế chiếu viết: <b>${esc(d.name)}</b> tính tình hiền thục, cẩn trọng đoan trang, từ ngày nhập cung hầu hạ chu toàn, được Thái hậu khen ngợi. Nay đặc phong làm <b>${esc(d.rankName)}</b>${d.palace ? `, ban cho cung riêng` : ''}. Khâm thử!`;
  showScroll('Thánh chỉ', edictText, [['Thần thiếp tạ ơn', async () => {
    hideCut(); cutActive = true; await fade(true); edict.visible = false;
    pc.dispose(); pc = await spawn(d.outfit); pc.root.position.set(0, 0, 2.0); pc.root.rotation.y = 0; o.group.add(pc.root); pc.play('hanh_le');
    tg.root.position.set(-1.5, 0, 1.6); tg.root.rotation.y = Math.atan2(1.5, .4); tg.play('cui_chao');
    for (const x of [-.85, .85]) { const m = await spawn('cungnu'); m.root.position.set(x, 0, 2.9); m.root.rotation.y = Math.atan2(-x, -.9); m.play('cui_chao'); o.group.add(m.root); maids.push(m); }
    camera.position.set(0, 1.0, 5.4); camera.lookAt(0, .72, 2.2);
    await fade(false);
    setTimeout(() => pc.play('dung_cho'), 4200);
    showScroll(d.type === 'phucvi' ? 'Phục vị' : 'Sắc phong', `${esc(d.name)} · <b>${esc(d.rankName)}</b>${d.palace ? '<br>Được ban cung riêng. Vào mục Cung riêng để bài trí.' : ''}`, [['📷 Lưu ảnh kỷ niệm', () => snapPhoto(d)], ['Tiếp tục', async () => {
      hideCut(); await fade(true);
      [tg, pc, ...maids].forEach(c => c.dispose()); scene.remove(o.group); stage = null;
      scene.add(saved.group); applyLights(saved.lights); world = saved;
      if (pendingScene) { const ps = pendingScene; pendingScene = null; await enterScene(ps.loc, ps.players); }
      else if (selfC && selfC.outfit !== me.outfit) { const r = selfC.root; await respawnSelf(r.position.x, r.position.z, r.rotation.y); }
      document.body.classList.remove('staging'); cutActive = false; await fade(false); sacBusy = false; { const f = cutDone; cutDone = () => {}; f(); }
      if (d.palace || d.type === 'phucvi') socket.emit('goto', 'phong');
    }]]);
  }]]);
}
function snapPhoto(d) {
  renderer.render(scene, camera);
  const src = renderer.domElement, w = 1280, h = Math.round(1280 * src.height / src.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h + 120; const g = c.getContext('2d');
  g.fillStyle = '#4a1010'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, w, h);
  g.strokeStyle = '#e2bf6b'; g.lineWidth = 14; g.strokeRect(7, 7, c.width - 14, c.height - 14);
  g.fillStyle = '#f3dc96'; g.textAlign = 'center'; g.font = 'bold 40px "Noto Serif", serif'; g.fillText(`${d.name} · ${d.rankName}`, w / 2, h + 55);
  g.font = 'italic 22px "Noto Serif", serif'; g.fillStyle = '#e2bf6b'; g.fillText(`MỘNG PHƯỢNG HOÀNG · ${new Date().toLocaleDateString('vi-VN')}`, w / 2, h + 92);
  const a = document.createElement('a'); a.download = `mong-phuong-hoang-${d.rankName}.png`; a.href = c.toDataURL('image/png'); a.click();
  toast('Đã lưu ảnh kỷ niệm.', 'good');
}

// thánh chỉ trên tay tổng quản thái giám
let edictTex = null;
function makeEdictProp() {
  if (!edictTex) { edictTex = new THREE.TextureLoader().load('img/thanhchi_s.png'); edictTex.colorSpace = THREE.SRGBColorSpace; }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(.34, .22), new THREE.MeshStandardMaterial({ map: edictTex, transparent: true, alphaTest: .4, side: THREE.DoubleSide, roughness: .6 }));
  m.castShadow = true; return m;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3();
function holdEdict(c, m) {
  if (!m.visible || !c.B.lHand || !c.B.rHand) return;
  c.B.lHand.getWorldPosition(_a); c.B.rHand.getWorldPosition(_b);
  m.parent.worldToLocal(_a); m.parent.worldToLocal(_b);
  m.position.copy(_a).add(_b).multiplyScalar(.5);
  _f.set(Math.sin(c.root.rotation.y), 0, Math.cos(c.root.rotation.y));
  m.position.addScaledVector(_f, .03); m.position.y += .05;
  m.rotation.set(-.35, c.root.rotation.y + Math.PI, 0, 'YXZ');
}

// ---------------- hướng dẫn người chơi mới ----------------
const TOUR = [
  { el: '#who', title: 'Thân phận của bổn cung', text: 'Tên, chức vị và lối sống. Thanh vàng là <b>công trạng</b>: đầy thanh sẽ được Hoàng thượng tấn phong lên bậc tiếp theo, từ Tú nữ cho tới Hoàng quý phi.' },
  { el: '#stats', title: 'Bạc, lượt và nhiệm vụ', text: '<b>Bạc</b> để tặng quà, dâng canh, điều tra. <b>Lượt</b>: mỗi ngày 5 lượt, làm việc sẽ tốn lượt, sang ngày mới được hồi lại. <b>Sủng ái</b> càng cao càng dễ được lật thẻ bài. <b>Thái hậu</b> là độ hài lòng của Thái hậu.<br>Làm đủ 3 <b>nhiệm vụ</b> thỉnh an, luyện, dò tin mỗi ngày được thưởng thêm công trạng.' },
  { el: '#top5', title: 'Bảng xếp hạng', text: 'Top 5 phi tần cao nhất hậu cung, cập nhật liên tục. <b style="color:#2e9d4f">▲ xanh</b> là vừa thăng cấp, <b style="color:#c0392b">▼ đỏ</b> là vừa bị giáng cấp trong 24 giờ qua. Chấm xanh là đang online.<br>Bấm vào tiêu đề để thu gọn.' },
  { el: '#map', title: 'Đi lại trong cung', text: 'Bấm để đến <b>Ngự hoa viên</b>, <b>Từ Ninh cung</b> (Thái hậu), <b>Dưỡng Tâm điện</b> (Hoàng thượng) và <b>phòng riêng</b>. Đêm nào được lật thẻ bài sẽ hiện thêm <b>Tẩm cung</b>.' },
  { el: '#acts', title: 'Việc làm ở nơi đang đứng', text: 'Mỗi nơi có việc riêng: thỉnh an ở Từ Ninh cung, dâng canh ở Dưỡng Tâm điện, luyện tài nghệ và dò tin ở Ngự hoa viên, thay đồ và bài trí ở phòng riêng.' },
  { el: 'center', title: 'Di chuyển và nói chuyện', text: '<b>Bấm xuống đất</b> để đi tới đó. <b>Kéo chuột</b> để xoay góc nhìn, <b>lăn chuột</b> để phóng to thu nhỏ. Bấm vào <b>tên NPC</b> màu vàng để nói chuyện, cung nữ và thái y còn giúp điều tra vụ án.' },
  { el: () => [...document.querySelectorAll('#acts button')].find(b => b.textContent.includes('Danh sách')), title: 'Tranh sủng', text: 'Xem các phi tần đang ở trong cung. <b>Tặng quà</b> để kết thân. Từ <b>Quý nhân</b> trở lên được <b>ra tay</b> hãm hại người khác.<br>Bị hại sẽ có 24 giờ <b>điều tra lật án</b>: tìm manh mối, nhờ nhân chứng, chỉ đích danh thủ phạm. Thua thì vào lãnh cung, nhưng vẫn có đường phục vị.' },
  { el: '#chat', title: 'Trò chuyện', text: 'Gõ rồi nhấn Enter để nói với mọi người cùng chỗ. Xưng "tui", gọi "bà" sẽ tự đổi thành <b>thần thiếp</b>, <b>bổn cung</b>, <b>tỷ tỷ</b>.' },
  { el: '#newsbtn', title: 'Bảng tin hậu cung', text: 'Tin mới trong cung: ai vừa được tấn phong, đêm nay ai được lật thẻ, vụ án nào bị lật.' },
  { el: '#musicbtn', title: 'Nhạc nền', text: 'Bật hoặc tắt nhạc. Mỗi nơi có nhạc riêng.' },
  { el: '#guidebtn', title: 'Xem lại hướng dẫn', text: 'Quên cách chơi thì bấm vào đây bất cứ lúc nào.<br><br>Chúc chủ tử sớm bước lên ngôi Hoàng hậu!' },
];
let tourOn = false;
function startTour(force) {
  if (tourOn || !me || !world) return;
  const key = 'mph_tour_' + me.id;
  try { if (!force && localStorage.getItem(key)) return; } catch {}
  if (cutActive || stage || !$('modal').classList.contains('hidden')) { if (!force) setTimeout(() => startTour(), 1500); return; }
  tourOn = true; let i = 0;
  const wrap = document.createElement('div'); wrap.id = 'tour';
  wrap.innerHTML = '<div class="hole"></div><div class="tip"><div class="step"></div><h4></h4><div class="txt"></div><div class="btns"><button class="skip">Bỏ qua</button><button class="gold next">Tiếp tục</button></div></div>';
  document.body.appendChild(wrap);
  const hole = wrap.querySelector('.hole'), tip = wrap.querySelector('.tip');
  const finish = () => { tourOn = false; wrap.remove(); removeEventListener('resize', show); try { localStorage.setItem(key, '1'); } catch {} };
  wrap.querySelector('.skip').onclick = finish;
  wrap.querySelector('.next').onclick = () => { if (i >= TOUR.length - 1) return finish(); i++; show(); };
  function show() {
    const st = TOUR[i]; let r;
    if (st.el === 'center') { const w = Math.min(320, innerWidth * .5), h = Math.min(380, innerHeight * .5); r = { left: innerWidth / 2 - w / 2, top: innerHeight / 2 - h / 2, width: w, height: h }; }
    else { const el = typeof st.el === 'function' ? st.el() : document.querySelector(st.el); if (!el || !el.getClientRects().length) { if (i < TOUR.length - 1) { i++; return show(); } return finish(); } r = el.getBoundingClientRect(); }
    const pad = 6; Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    wrap.querySelector('.step').textContent = `${i + 1} / ${TOUR.length}`;
    tip.querySelector('h4').textContent = st.title; tip.querySelector('.txt').innerHTML = st.text;
    wrap.querySelector('.next').textContent = i === TOUR.length - 1 ? 'Xong' : 'Tiếp tục';
    // đặt khung chú thích bên cạnh chỗ được làm sáng
    const tw = Math.min(330, innerWidth - 24); tip.style.width = tw + 'px';
    const th = tip.offsetHeight, gap = 14; let x, y;
    if (r.left + r.width + gap + tw < innerWidth - 8) { x = r.left + r.width + gap; y = r.top; }
    else if (r.left - gap - tw > 8) { x = r.left - gap - tw; y = r.top; }
    else { x = r.left + r.width / 2 - tw / 2; y = r.top + r.height + gap; if (y + th > innerHeight - 8) y = r.top - gap - th; }
    x = Math.max(8, Math.min(innerWidth - tw - 8, x)); y = Math.max(8, Math.min(innerHeight - th - 8, y));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  addEventListener('resize', show);
  show();
}

// ---------------- tẩm cung: ngồi trên giường ----------------
let seated = null;
function openBed() {
  if (!world?.bed || !selfC) return;
  modal(`<button class="close" onclick="window._close()">✕</button><h3>Long sàng</h3><div style="color:var(--muted);font-size:13px">Chọn cách ngồi cùng Hoàng thượng</div>
  <div class="btns"><button data-b="face">💞 Ngồi đối mặt</button><button data-b="lean">🌙 Tựa vào lòng Hoàng thượng</button>${seated ? '<button data-b="up">Đứng dậy</button>' : ''}</div>`);
  $('mcard').querySelectorAll('[data-b]').forEach(b => b.onclick = () => { closeModal(); b.dataset.b === 'up' ? standUp() : sitBed(b.dataset.b); });
}
function placeSeated(c, x, z, ry) {
  const r = c.root; r.position.set(x, 0, z); r.rotation.y = ry; r.updateMatrixWorld(true);
  const s = seatPlacement(c); // đã chuyển sang động tác ngồi
  r.position.x += x - s.x; r.position.z += z - s.z; r.position.y = world.bedTop - s.y;
}
function sitBed(kind) {
  const ht = world.npcs.find(n => n.model === 'hoangthuong_dem'); if (!ht?.c || !selfC) return toast('Hoàng thượng chưa tới, chờ chút nhé.');
  if (!Number.isFinite(world.bedTop)) world.bedTop = .42;
  if (!Number.isFinite(world.bedFront)) world.bedFront = -1.1;
  if (!ht.home) ht.home = { x: ht.c.root.position.x, z: ht.c.root.position.z, ry: ht.c.root.rotation.y };
  try { sitBedInner(kind, ht); } catch (e) { console.error(e); standUp(); toast('Chưa ngồi được, thử lại nhé.', 'bad'); }
  const ok = [selfC.root.position, ht.c.root.position].every(v => Number.isFinite(v.x + v.y + v.z));
  if (!ok) { standUp(); toast('Chưa ngồi được, thử lại nhé.', 'bad'); }
}
function sitBedInner(kind, ht) {
  standUp(true);
  const zf = world.bedFront - .2;
  selfC.target = null;
  if (kind === 'face') {
    placeSeated(ht.c, -.3, zf, 1.0); placeSeated(selfC, .3, zf, -1.0);
    ht.c.post = null; selfC.post = null;
  } else {
    placeSeated(ht.c, -.14, zf - .02, .3); placeSeated(selfC, .2, zf + .02, -.75);
    // nàng nghiêng người tựa vào vai, Hoàng thượng choàng tay ôm
    selfC.post = (c) => { aim(c.root, c.B.spine1, c.B.spine2, v3([-.42, .9, -.05])); aim(c.root, c.B.neck, c.B.head, v3([-.6, .8, 0])); };
    ht.c.post = (c) => { aim(c.root, c.B.lArm, c.B.lFore, v3([.72, -.3, -.62])); aim(c.root, c.B.lFore, c.B.lHand, v3([.45, -.15, .88])); aim(c.root, c.B.neck, c.B.head, v3([.22, .97, .05])); };
  }
  seated = { kind, ht };
  camYaw = 0; camDist = 2.3; camH = .95;
}
function standUp(keepCam) {
  if (!seated) return;
  const { ht } = seated; seated = null;
  if (ht?.c && ht.home) { ht.c.post = null; ht.c.root.position.set(ht.home.x, 0, ht.home.z); ht.c.root.rotation.y = ht.home.ry; ht.c.play(ht.idle || 'dung_cho'); }
  if (selfC) { selfC.post = null; const r = selfC.root; r.position.set(.3, 0, world.bedFront + .45); r.position.y = 0; selfC.play('dung_cho'); }
  if (!keepCam && world) { camDist = world.cam.dist; camH = world.cam.height; }
}

// ---------------- bảng xếp hạng top 5 ----------------
let lastTopIds = [];
$('top5').querySelector('.t').onclick = () => $('top5').classList.toggle('min');
socket.on('top5', list => {
  const ol = $('top5list'); ol.innerHTML = '';
  list.forEach((p, i) => {
    const li = document.createElement('li'); if (p.id === me?.id) li.className = 'me';
    const tr = p.trend > 0 ? '<span class="tr up" title="Vừa thăng cấp">▲</span>' : p.trend < 0 ? '<span class="tr down" title="Vừa bị giáng cấp">▼</span>' : '<span class="tr"></span>';
    li.innerHTML = `<span class="no">${i + 1}</span><span class="on ${p.online ? 'y' : ''}"></span><span class="nm">${esc(p.name)}</span><span class="rk">${esc(p.rankName)}</span>${tr}`;
    if (lastTopIds.length && lastTopIds[i] !== p.id) { li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1500); }
    ol.appendChild(li);
  });
  if (!list.length) ol.innerHTML = '<li style="color:var(--muted)">Chưa có ai</li>';
  lastTopIds = list.map(p => p.id);
});
