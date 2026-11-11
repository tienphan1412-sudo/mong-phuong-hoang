// MỘNG PHƯỢNG HOÀNG – phía người chơi
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildLocation, DECOR, makeGuzheng, makeFan, makeScroll } from './scenes.js';
import { spawn, seatPlacement, ready, loadModel, aim, v3, kneelOn } from './chars.js';
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
  feastHT = null;
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
async function enterScene(loc, players, venue, seatId) {
  const tok = ++loadToken;
  closeDecor(); seated = null;
  music.setMode(loc);
  // dựng cảnh mới ở hậu trường, cảnh cũ vẫn hiện cho tới khi xong
  const o = buildLocation(loc, { palace: me?.hasPalace, palaceName: me ? (me.name.split(' ').pop() + ' cung') : '', venue });
  o.loc = loc; chairSeat = null;
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
      if (n.kneel) kneelOn(c, n.x, n.kneel, n.z, n.ry); else c.play(n.idle || (n.model === 'cungnu' || n.model === 'mama' ? 'chap_tay' : 'dung_cho'));
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
  if (seatId) sitSelfAt(seatId); else sendMove('dung_cho');
  snapCam = true; refreshClueMarkers(); if (nb) renderNotebook(); syncFeastHT(); hideLoading();
  if (loc === 'tamcung' && !me.htTalked) setTimeout(() => { if (world?.loc === 'tamcung') startHtTalk(); }, 2500);
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
  applyAnim(holder, p.anim || 'dung_cho', false);
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
  if (world.brazier && ray.intersectObject(world.brazier, true).length) return clueTro();
  if (taiOn) return;
  if (world.seats && world.loc !== 'yentiec') { const hs = world.seats.find(st => ray.intersectObject(st.obj, true).length); if (hs) return socket.emit('sit', { seat: hs.id }); }
  if (chairSeat) { if (world.loc === 'yentiec') return; standChair(); }
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
  if (chairSeat || taiOn) return;
  if (selfC.target) {
    const dx = selfC.target.x - r.position.x, dz = selfC.target.z - r.position.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { selfC.target = null; }
    else {
      const sp = 1.35 * dt, k = Math.min(1, sp / d);
      const np = clampPos(r.position.x + dx * k, r.position.z + dz * k); r.position.x = np.x; r.position.z = np.z; r.position.y = world.floorAt ? world.floorAt(np.x, np.z) : 0;
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
function emote(a) { if (!selfC) return; if (seated) standUp(); if (chairSeat && world.loc !== 'yentiec') standChair(); selfC.target = null; selfC.play(a, { restart: true }); socket.emit('emote', a); }

// ---------------- vòng lặp ----------------
const clock = new THREE.Clock(); let T = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); T += dt;
  if (gateSpin) { camera.position.set(Math.sin(T * .08) * 5, 1.9, -2 + Math.cos(T * .08) * 5); camera.lookAt(0, .9, -2.5); }
  if (world) {
    stepSelf(dt);
    for (const n of world.npcs) if (n.c) n.c.update(dt);
    for (const [, o] of others) if (o.c && o.seated) o.c.update(dt); else if (o.c) { const r = o.c.root; r.position.y = world.floorAt ? world.floorAt(r.position.x, r.position.z) : 0; r.position.x += (o.tx - r.position.x) * Math.min(1, dt * 8); r.position.z += (o.tz - r.position.z) * Math.min(1, dt * 8); let diff = o.try - r.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); r.rotation.y += diff * Math.min(1, dt * 8); o.c.update(dt); }
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
  const g = document.createElement('button'); g.id = 'guidebtn'; g.innerHTML = '📖<span class="lbl"> Hướng dẫn</span>'; g.onclick = () => startTour(true); document.body.appendChild(g);
  const b = document.createElement('button'); b.id = 'musicbtn';
  const paint = () => b.innerHTML = music.isOn() ? '🎵<span class="lbl"> Nhạc: bật</span>' : '🔇<span class="lbl"> Nhạc: tắt</span>';
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
  const first = !me; const oldOutfit = me?.outfit; const prev = me;
  me = m;
  if (first) {
    $('gate').classList.add('hidden'); $('game').classList.remove('hidden'); gateSpin = false;
    const PRE = ['cungnu', 'thive', 'thaihau', 'mama', 'thaiy', 'thaigiam', 'hoangthuong'], PRE_PC = ['hoangthuong_dem', 'aongu', 'tunu', 'thuongtai_hong', 'quynhan', 'tan'];
    const slow = innerWidth < 760 || navigator.connection?.saveData || /2g|3g/.test(navigator.connection?.effectiveType || '');
    (async () => { await new Promise(r => setTimeout(r, slow ? 6000 : 1500)); for (const m of slow ? PRE : [...PRE, ...PRE_PC]) { await loadModel(m).catch(() => {}); } })();
    musicBtn();
  }
  if (me.latThe) latTheMe = true;
  if (prev) floatDeltas(prev, me);
  if (feast) feast.mine = me.feast?.names?.includes(`${me.name} ${me.rankName}`) || feast.mine;
  renderHud(); renderMap(); renderActs();
  if (selfC && world && oldOutfit && oldOutfit !== me.outfit && !stage) { const r = selfC.root; await respawnSelf(r.position.x, r.position.z, r.rotation.y); }
  if (selfC) { const r = selfC.label.element.querySelector('.r'); if (r) { const t = rankTier(me.rankName); r.className = 'r ' + t; r.textContent = (t === 't3' ? '★ ' : '') + me.rankName; } }
  if (!caseOpenId && me.cases?.length && !me.lanh) { caseOpenId = me.cases[0].id; nbMin = true; }
  if (caseOpenId) socket.emit('caseDetail', caseOpenId);
});
socket.on('scene', async d => { pendingScene = d; if (!stage) { await enterScene(d.loc, d.players, d.venue, d.seat); pendingScene = null; setTimeout(() => startTour(), 1200); } });
let pendingScene = null;
socket.on('pjoin', p => addOther(p));
socket.on('pleave', id => removeOther(id));
socket.on('pmove', d => { const o = others.get(d.id); if (!o) return; o.tx = d.x; o.tz = d.z; o.try = d.ry; o.p.x = d.x; o.p.z = d.z; if (o.c) applyAnim(o, d.anim, !!d.once); });
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
socket.on('npcSay', d => { const n = world?.npcs.find(x => x.name === d.who); if (d.long) { say(n?.model || 'aongu', d.who, esc(d.text), [['Đa tạ', 0, 'gold']]).then(dlgClose); return; } if (n?.label) bubble(n.label, d.text); else toast(`${d.who}: ${d.text}`); });
function toast(text, kind = 'info') { const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text; $('toasts').appendChild(d); setTimeout(() => d.remove(), 5200); }

// ---------------- HUD, bản đồ, hành động ----------------
function renderHud() {
  if (!me) return;
  $('hName').textContent = me.name; $('hRank').textContent = `${me.rankName} · ${me.pathName}${me.waiting ? ' · chờ ghế' : ''}`;
  const lo = me.nextPts ? (me.pts / me.nextPts) : 1; $('hBar').style.width = Math.min(100, lo * 100) + '%';
  $('hPts').textContent = me.nextPts ? `Công trạng ${me.pts}/${me.nextPts}` : `Công trạng ${me.pts}`;
  const t = me.tasks || {};
  $('stats').innerHTML = `<span class="pill">💰 Bạc <b>${me.silver}</b></span><span class="pill" title="Cứ 90 phút hồi 1 lượt (tối đa ${me.turnCap}). Làm đủ 3 nhiệm vụ ngày, dự yến tiệc, được lật thẻ cũng được thêm lượt.">⏳ Lượt <b>${me.turns}</b>${me.nextTurn ? ` <small id="turnT" style="opacity:.75"></small>` : ''}</span><span class="pill">💗 Sủng ái <b>${me.sung}</b></span><span class="pill">🍵 Thái hậu <b>${me.haiLong}</b></span><span class="pill">Nhiệm vụ: ${t.thinhan ? '✅' : '⬜'} thỉnh an ${t.luyen ? '✅' : '⬜'} luyện ${t.dotin ? '✅' : '⬜'} dò tin</span>${me.camTuc ? `<span class="pill" style="border-color:#c0503a">🔒 Cấm túc còn ${Math.max(1, Math.ceil((me.camTuc - Date.now()) / 3600e3))} giờ</span>` : ''}${htPill()}${feast ? `<span class="pill feast">🎎 Yến tiệc · <b id="feastT"></b> · ${feast.n} tiết mục</span>` : ''}${me.cases.length ? `<button class="pill" id="caseBtn" style="border-color:#c0503a">⚖️ Vụ án đang mở (${me.cases.length})</button>` : ''}`;
  const cb = $('caseBtn'); if (cb) cb.onclick = () => openCase(me.cases[0].id);
}
const LOCNAMES = { yentiec: '🎎 Yến tiệc', hoavien: 'Ngự hoa viên', tuninh: 'Từ Ninh cung', duongtam: 'Dưỡng Tâm điện', phong: 'Phòng riêng', tamcung: 'Tẩm cung', lanhcung: 'Lãnh cung' };
function renderMap() {
  if (!me) return;
  const m = $('map'); m.innerHTML = '';
  const list = me.lanh ? ['lanhcung'] : me.camTuc ? ['phong'] : ['hoavien', 'tuninh', 'duongtam', 'phong'];
  if (latTheMe && !me.lanh) list.push('tamcung');
  if (feast && !me.lanh) list.push('yentiec');
  for (const l of list) { const b = document.createElement('button'); b.textContent = l === 'phong' && me.hasPalace ? 'Cung riêng' : LOCNAMES[l]; b.classList.toggle('on', world?.loc === l); b.onclick = () => socket.emit('goto', l); m.appendChild(b); }
}
function act(type, extra = {}) { socket.emit('action', { type, ...extra }); }
function renderActs() {
  if (!me || !world) return;
  const a = $('acts'); a.innerHTML = `<div class="ttl">${LOCNAMES[world.loc] || ''}</div>`;
  const add = (label, sub, fn, dis) => { const b = document.createElement('button'); b.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`; b.onclick = fn; if (dis) b.disabled = true; a.appendChild(b); };
  const L = world.loc;
  if (L === 'tuninh') { add('🙇 Thỉnh an Thái hậu', me.thinhAn ? 'Hôm nay đã thỉnh an' : 'Miễn phí, mỗi sáng 1 lần', () => { emote('hanh_le'); act('thinhan'); }, me.thinhAn); }
  if (L === 'duongtam') add('🍲 Dâng canh Hoàng thượng', '1 lượt · 30 bạc · nấu đúng món người thèm được sủng nhiều', gameCanh);
  if (L === 'yentiec') { if (!feast?.mine) add('🎎 Dâng tiết mục', 'Bước ra giữa, đàn, múa hay ngâm thơ cho Hoàng thượng', performFeast); add('🚪 Rời yến tiệc', '', () => socket.emit('goto', 'hoavien')); }
  if (L === 'hoavien') { if (feast) add('🎎 Dự yến tiệc', 'Đang có yến tiệc, vào ngồi cùng mọi người', () => socket.emit('goto', 'yentiec')); add('👂 Dò tin', '1 lượt · nghe sở thích Hoàng thượng, chuyện trong cung', () => act('dotin')); add('🎐 Luyện tài nghệ', '1 lượt · chơi càng hay càng nhiều điểm', () => chooseTai(t => gameRhythm(t, q => act('luyen', { tai: t, q })))); }
  if (L === 'phong') { add('🎐 Luyện tài nghệ', '1 lượt · chơi càng hay càng nhiều điểm', () => chooseTai(t => gameRhythm(t, q => act('luyen', { tai: t, q })))); add('🎁 Ban thưởng cung nữ', `20 bạc · trung thành ${me.loyal ?? 50}/100 · mỗi ngày 1 lần`, () => act('thuongcn')); add('👘 Thay trang phục', '', openWardrobe); add('🏮 Bài trí ' + (me.hasPalace ? 'cung' : 'phòng'), 'Đặt, xoay đồ nội thất', openDecor); }
  if (L === 'tamcung') { add('🛏 Lên giường', 'Ngồi cùng Hoàng thượng', openBed); add('🌙 Rời tẩm cung', 'Trời sắp sáng', () => socket.emit('goto', 'phong')); }
  if (L === 'lanhcung') { add('🧹 Làm việc lãnh cung', `Phục vị ${me.lanh?.tasks || 0}/3 · mỗi ngày 1 lần`, gameLanh); add('🕯 Hỏi chuyện phế phi', 'Mỗi ngày một lần · bà biết nhiều bí mật', () => act('phephi')); if (me.lanh?.caseId) add('📜 Kêu oan', 'Điều tra lại vụ án cũ', () => openCase(me.lanh.caseId)); }
  if (!me.lanh) { add('👥 Danh sách hậu cung', 'Tặng quà · ra tay', openRoster); add('🏪 Nội vụ phủ', 'Mua nhân sâm, hương, đồ bài trí', openShop); }
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
  else if (n.talk === 'dangcanh') gameCanh();
  else if (n.talk === 'dotin') act('dotin');
  else if (n.talk === 'lanh') gameLanh();
  else if (n.talk === 'phephi') act('phephi');
  else if (n.talk === 'thaiy') { if (c && clueOpen('thaiy')) clueThaiY(n); else bubble(n.label, 'Nương nương khí sắc tốt lắm, không có gì đáng lo.'); }
  else if (n.talk === 'cungnu') { if (c && clueOpen('hoi')) clueCungNu(n); else bubble(n.label, ['Nương nương nghỉ ngơi chút đi ạ.', 'Nô tỳ đã pha trà hoa cúc.', 'Hôm nay trong cung có vẻ yên ắng.'][Math.floor(Math.random() * 3)]); }
  else if (n.talk === 'mama') bubble(n.label, 'Trong cung quy củ nghiêm ngặt, các vị chủ tử nhớ giữ mình.');
  else if (n.talk === 'thaigiam' && c && clueOpen('so')) clueSoQua(n);
  else if (n.talk === 'thaigiam') bubble(n.label, 'Hoàng thượng đang phê tấu chương, chủ tử muốn dâng canh thì nô tài thông báo giúp.');
}

// ---------------- hộp thoại ----------------
function modal(html) { $('mcard').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }
window._close = closeModal;
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

// vụ án: xem sổ điều tra ở cuối file
let caseOpenId = null;
function openCase(id) { caseOpenId = id; nbMin = false; socket.emit('caseDetail', id); }
socket.on('caseClosed', d => { if (trial) return trialResult(d); closeNotebook(); showScroll('Phán quyết', d.text, [['Đóng', hideCut]]); });
let witnessFor = null, rosterMode = null;

// danh sách hậu cung
function openRoster() { witnessFor = null; socket.emit('roster'); }
socket.on('roster', r => {
  if (witnessFor) {
    const id = witnessFor;
    modal(`<button class="close" onclick="window._close()">✕</button><h3>Chọn người làm chứng</h3><table>${r.list.filter(p => p.id !== me.id).map(p => `<tr><td>${p.online ? '🟢' : '⚪'} ${esc(p.name)}</td><td>${esc(p.rankName)}</td><td><button data-w="${p.id}">Nhờ làm chứng</button></td></tr>`).join('') || '<tr><td>Chưa có ai khác trong cung.</td></tr>'}</table>`);
    $('mcard').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { socket.emit('case', { caseId: id, op: 'witness', who: b.dataset.w }); caseOpenId = id; witnessFor = null; closeModal(); });
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
  bar.innerHTML = Object.entries(DECOR).map(([k, v]) => DECOR_PRICE[k] && !me.decorOwned?.includes(k) ? `<button data-lock="${k}">🔒 ${v.name}</button>` : `<button data-d="${k}">${v.name}</button>`).join('') + '<button id="dRot">↻ Xoay</button><button id="dDel">🗑 Bỏ</button><button class="gold" id="dSave">Lưu</button><button id="dExit">Xong</button>';
  bar.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => openShop());
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
  if (d.type === 'latan' && trial) return; // đã diễn trong phiên xử
  // nhiều lần tấn phong liền nhau: chỉ diễn lần cao nhất
  if (d.type === 'sacphong') { const i = cutQ.findIndex(x => x.type === 'sacphong'); if (i >= 0) { cutQ[i] = d; return; } }
  cutQ.push(d); nextCut();
});
async function nextCut() {
  if (cutBusy || trial || !cutQ.length) return; cutBusy = true;
  await new Promise(r => setTimeout(r, 500)); // gom các lần tấn phong liền nhau
  const d = cutQ.shift();
  await new Promise(done => { cutDone = done; playCut(d); });
  cutBusy = false; nextCut();
}
let cutDone = () => {};
async function playCut(d) {
  if (d.type === 'tiencung') showScroll('Tiến cung', `Tú nữ <b>${esc(d.name)}</b> đã vào cung với lối sống <b>${esc(d.path)}</b>.<br><br>Mỗi ngày: thỉnh an Thái hậu ở <b>Từ Ninh cung</b>, luyện tài nghệ và dò tin ở <b>Ngự hoa viên</b>, dâng canh ở <b>Dưỡng Tâm điện</b>. Đủ công trạng sẽ được tấn phong. Tối nào Hoàng thượng cũng lật thẻ bài.<br><br>Bấm xuống đất để đi, kéo để xoay góc nhìn, bấm tên NPC để nói chuyện.`, [['Vào cung', () => { hideCut(); setTimeout(() => startTour(), 600); }]]);
  else if (d.type === 'sacphong' || d.type === 'phucvi') runSacPhong(d);
  else if (d.type === 'phatgiac') runPhatGiac(d);
  else if (d.type === 'doncung') runDonCung(d);
  else if (d.type === 'phatgiac_old') showScroll('Phát giác', `Quế ma ma khám phòng và tìm thấy <b>${esc(d.methodName)}</b>. Bổn cung bị nghi <b>${esc(d.crime)}</b>.<br><br>Có <b>${d.hours} giờ</b> trước phiên xử ở Từ Ninh cung. Hỏi cung nữ, dò sổ quà, lục tro, nhờ thái y, hoặc nhờ người làm chứng để tìm ra kẻ hãm hại.`, [['Để sau', hideCut], ['Xem vụ án', () => { hideCut(); openCase(d.caseId); }]]);
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
      if (pendingScene) { const ps = pendingScene; pendingScene = null; await enterScene(ps.loc, ps.players, ps.venue, ps.seat); }
      else if (selfC && selfC.outfit !== me.outfit) { const r = selfC.root; await respawnSelf(r.position.x, r.position.z, r.rotation.y); }
      document.body.classList.remove('staging'); cutActive = false; await fade(false); sacBusy = false; { const f = cutDone; cutDone = () => {}; f(); }
      if (d.palace) { cutQ.unshift({ type: 'doncung', name: d.name, rankName: d.rankName }); nextCut(); } else if (d.type === 'phucvi') socket.emit('goto', 'phong');
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
  { el: '#stats', title: 'Bạc, lượt và nhiệm vụ', text: '<b>Bạc</b> để tặng quà, dâng canh, mua đồ ở Nội vụ phủ. <b>Lượt</b>: đầu ngày có 5, cứ 90 phút hồi thêm 1 (tối đa 10). Làm đủ 3 nhiệm vụ ngày được thêm 2 lượt, dự yến tiệc và được lật thẻ cũng được thêm. <b>Sủng ái</b> càng cao càng dễ được lật thẻ bài. <b>Thái hậu</b> là độ hài lòng của Thái hậu.<br>Làm đủ 3 <b>nhiệm vụ</b> thỉnh an, luyện, dò tin mỗi ngày được thưởng thêm công trạng.' },
  { el: '#top5', title: 'Bảng xếp hạng', text: 'Top 5 phi tần cao nhất hậu cung, cập nhật liên tục. <b style="color:#2e9d4f">▲ xanh</b> là vừa thăng cấp, <b style="color:#c0392b">▼ đỏ</b> là vừa bị giáng cấp trong 24 giờ qua. Chấm xanh là đang online.<br>Bấm vào tiêu đề để thu gọn.' },
  { el: '#map', title: 'Đi lại trong cung', text: 'Bấm để đến <b>Ngự hoa viên</b>, <b>Từ Ninh cung</b> (Thái hậu), <b>Dưỡng Tâm điện</b> (Hoàng thượng) và <b>phòng riêng</b>. Đêm nào được lật thẻ bài sẽ hiện thêm <b>Tẩm cung</b>.' },
  { el: '#acts', title: 'Việc làm ở nơi đang đứng', text: 'Mỗi nơi có việc riêng: thỉnh an ở Từ Ninh cung, dâng canh ở Dưỡng Tâm điện, luyện tài nghệ và dò tin ở Ngự hoa viên, thay đồ và bài trí ở phòng riêng.' },
  { el: 'center', title: 'Di chuyển và nói chuyện', text: '<b>Bấm xuống đất</b> để đi tới đó. <b>Kéo chuột</b> để xoay góc nhìn, <b>lăn chuột</b> để phóng to thu nhỏ. Bấm vào <b>tên NPC</b> màu vàng để nói chuyện, cung nữ và thái y còn giúp điều tra vụ án.' },
  { el: () => [...document.querySelectorAll('#acts button')].find(b => b.textContent.includes('Danh sách')), title: 'Tranh sủng', text: 'Xem các phi tần đang ở trong cung. <b>Tặng quà</b> để kết thân. Từ <b>Quý nhân</b> trở lên được <b>ra tay</b> hãm hại người khác.<br>Bị hại sẽ có 24 giờ <b>điều tra lật án</b>: tìm manh mối, nhờ nhân chứng, chỉ đích danh thủ phạm. Thua thì vào lãnh cung, nhưng vẫn có đường phục vị.' },
  { el: () => document.querySelector('.pill.ht'), title: 'Sở thích Hoàng thượng hôm nay', text: 'Mỗi ngày Hoàng thượng thèm một món canh, thích một màu áo, muốn xem một tài nghệ và có một tâm trạng. Ra <b>Ngự hoa viên dò tin</b> để biết dần. Dâng đúng món, mặc đúng màu, diễn đúng tài nghệ sẽ được sủng ái hơn hẳn.' },
  { el: 'center', title: 'Yến tiệc và lật thẻ', text: '<b>Yến tiệc</b> mỗi ngày lúc <b>9h30, 12h30</b> (ngoài trời) và <b>17h, 20h</b> (trong điện), mỗi tiệc 20 phút. Vào ngồi cùng mọi người, bước ra dâng tiết mục, ai hay nhất được trọng thưởng.<br><b>Lật thẻ</b> lúc <b>11h30 trưa</b> và <b>21h tối</b>. Được chọn thì vào tẩm cung hầu chuyện Hoàng thượng; không được chọn cũng có quà an ủi.' },
  { el: () => [...document.querySelectorAll('#acts button')].find(b => b.textContent.includes('Nội vụ phủ')), title: 'Nội vụ phủ', text: 'Tiệm trong cung: nhân sâm thêm lượt, hương mê điệp dễ được lật thẻ, lễ vật cho Thái hậu, và đồ bài trí phòng.' },
  { el: 'center', title: 'Ngồi ở đình Ngự hoa viên', text: 'Trong đình bát giác ở Ngự hoa viên có 3 đôn sứ. Bấm vào đôn để ngồi, bấm xuống đất để đứng dậy nhường chỗ. Chỗ tụ tập tán gẫu của các tỷ muội.' },
  { el: '#chat', title: 'Trò chuyện', text: 'Gõ rồi nhấn Enter để nói với mọi người cùng chỗ. Xưng "tui", gọi "bà" sẽ tự đổi thành <b>thần thiếp</b>, <b>bổn cung</b>, <b>tỷ tỷ</b>.' },
  { el: '#newsbtn', title: 'Bảng tin hậu cung', text: 'Tin mới trong cung: ai vừa được tấn phong, đêm nay ai được lật thẻ, vụ án nào bị lật.' },
  { el: '#musicbtn', title: 'Nhạc nền', text: 'Bật hoặc tắt nhạc. Mỗi nơi có nhạc riêng.' },
  { el: '#guidebtn', title: 'Xem lại hướng dẫn', text: 'Quên cách chơi thì bấm vào đây bất cứ lúc nào.<br><br>Chúc chủ tử sớm bước lên ngôi Hoàng hậu!' },
];
let tourOn = false;
function startTour(force) {
  if (tourOn || !me || !world) return;
  const key = 'mph_tour2_' + me.id;
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
if (innerWidth < 760) $('top5').classList.add('min');
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

// =====================================================================
// SỔ ĐIỀU TRA (thay cho bảng chữ): thẻ nghi phạm có chân dung, tự đóng dấu LOẠI
// =====================================================================
let nb = null, nbMin = false;
const TRAIT_ICON = { cung: '🏯', gio: '🕯', dau: '👣' };
const TRAIT_NAME = { cung: 'Nơi ở', gio: 'Giờ lui tới', dau: 'Dấu vết' };
const CLUE_BTNS = [['hoi', '👧 Hỏi cung nữ thân tín', 'miễn phí · biết giờ', 'phong', 'Phòng riêng', 'cung nữ'], ['so', '📖 Dò sổ quà Nội vụ phủ', '1 lượt · 40 bạc · biết nơi ở', 'duongtam', 'Dưỡng Tâm điện', 'Tổng quản thái giám'], ['tro', '🔥 Lục tro trong lò than', '1 lượt · biết dấu vết', 'hoavien', 'Ngự hoa viên', 'lò than 🔍'], ['thaiy', '⚕️ Nhờ thái y kiểm nghiệm', '80 bạc · biết dấu vết, không bị xóa', 'tuninh', 'Từ Ninh cung', 'Thái y'], ['theodoi', '👀 Theo dõi nghi phạm', '1 lượt · biết một đặc điểm còn thiếu', 'hoavien', 'Ngự hoa viên', 'bóng người khả nghi']];
const nbEl = document.createElement('div'); nbEl.id = 'case'; nbEl.className = 'hidden'; document.body.appendChild(nbEl);
function closeNotebook() { nb = null; caseOpenId = null; nbEl.classList.add('hidden'); document.body.classList.remove('nbopen'); }
socket.on('caseDetail', c => {
  if (trial?.waiting) { trial.detail = c; return; }
  if (caseOpenId !== c.id) return;
  nb = c; renderNotebook(); refreshClueMarkers();
  for (const w of clueWaiters.splice(0)) w(c);
});
function analyse(c) {
  const known = {}; for (const f of c.found) if (f.value !== null && f.value !== undefined) known[f.trait] = f.value;
  const w = c.witness;
  return c.table.map(s => {
    const chips = ['cung', 'gio', 'dau'].map(t => {
      let st = '';
      if (t in known) st = s.ti[t] === known[t] ? 'ok' : 'no';
      else if (w && w.trait === t) st = s.ti[t] === w.value ? 'maybe' : 'doubt';
      return { t, word: s[t], st };
    });
    const ex = c.found.some(f => f.exclude === s.id);
    return { ...s, chips, out: ex || chips.some(x => x.st === 'no') };
  });
}
function fmtLeft(ms) { ms = Math.max(0, ms); const h = Math.floor(ms / 3600e3), m = Math.floor(ms % 3600e3 / 60e3), sec = Math.floor(ms % 60e3 / 1000); return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; }
setInterval(() => { const t = $('nbTimer'); if (t && nb) t.textContent = fmtLeft(nb.deadline - Date.now()); }, 1000);
async function renderNotebook() {
  const c = nb; if (!c) return;
  nbEl.classList.remove('hidden'); nbEl.classList.toggle('min', nbMin); document.body.classList.toggle('nbopen', !nbMin);
  const open = c.status === 'open' || c.reopen;
  if (nbMin) { nbEl.innerHTML = `<div class="nbtab">📒 Sổ điều tra · ⏳ <span id="nbTimer">${fmtLeft(c.deadline - Date.now())}</span></div>`; nbEl.onclick = () => { nbMin = false; renderNotebook(); }; return; }
  nbEl.onclick = null;
  const S = analyse(c), left = S.filter(s => !s.out);
  nbEl.innerHTML = `
  <div class="nbhead"><div><b>⚖️ ${esc(c.methodName)}</b><small>Tội danh: ${esc(c.crime)}</small></div><button class="nbx" title="Thu gọn">–</button></div>
  ${c.status === 'open' ? `<div class="nbtime">⏳ Phiên xử ở Từ Ninh cung sau <b id="nbTimer">${fmtLeft(c.deadline - Date.now())}</b></div>` : c.reopen ? '<div class="nbtime">📜 Kêu oan từ lãnh cung: chỉ đúng thủ phạm sẽ được phục vị</div>' : '<div class="nbtime">Vụ án đã khép</div>'}
  <div class="cards">${S.map(s => `<div class="sus ${s.out ? 'out' : ''} ${!s.out && left.length === 1 ? 'top' : ''}" data-id="${esc(s.id)}">
    <img class="pt" data-m="${esc(s.model)}" alt=""><div class="sn">${esc(s.name)}</div>
    ${s.chips.map(x => `<div class="chip ${x.st}" title="${TRAIT_NAME[x.t]}">${TRAIT_ICON[x.t]} ${esc(x.word)}</div>`).join('')}
    ${s.out ? '<div class="stamp">LOẠI</div>' : ''}</div>`).join('')}</div>
  ${left.length === 1 && c.found.length ? `<div class="hint">🔎 Chỉ còn <b>${esc(left[0].name)}</b> khả nghi. Ra phiên xử để buộc tội!</div>` : ''}
  <div class="clues">${c.found.length || c.witness ? '' : '<div class="none">Chưa có manh mối. Mỗi manh mối cho biết một đặc điểm thật của thủ phạm, ai không khớp sẽ bị đóng dấu LOẠI.</div>'}
  ${c.found.map(f => `<div class="cl">• <b>${esc(f.name)}:</b> ${esc(f.text)}</div>`).join('')}
  ${c.witness ? `<div class="cl wit">• <b>Nhân chứng ${esc(c.witness.name)}:</b> ${esc(c.witness.text)} <i>(có thể khai gian)</i></div>` : ''}</div>
  ${open ? `<div class="nbacts">${CLUE_BTNS.filter(([k]) => !c.found.some(f => f.kind === k)).map(([k, n, sub, loc, locName, who]) => me.lanh ? `<button data-clue="${k}">${n}<small>${sub}</small></button>` : world?.loc === loc ? `<button class="here" data-here="${k}">${n}<small>✨ Đang ở ${locName}: bấm vào ${who} có dấu 🔍</small></button>` : `<button data-go="${loc}">${n}<small>${sub} · đi tới ${locName} ➜</small></button>`).join('')}
    ${c.witness ? '' : c.witnessWait ? `<button disabled>⏳ Đang chờ ${esc(c.witnessWait)} khai…<small>tối đa 5 phút, quá hạn sẽ tự khai</small></button>` : '<button id="nbWit">🙋 Nhờ người làm chứng<small>1 lượt · người thật tự chọn lời khai, có thể khai gian</small></button>'}
    ${c.status === 'open' ? '<button id="nbConf">🙇 Nhận tội<small>giảm nhẹ: cấm túc 1 ngày hoặc giáng 1 bậc</small></button>' : ''}
    <button class="gold big" id="nbTrial">⚖️ Ra phiên xử<small>buộc tội trước mặt Thái hậu · chỉ 1 lần</small></button></div>` : ''}`;
  nbEl.querySelector('.nbx').onclick = (e) => { e.stopPropagation(); nbMin = true; renderNotebook(); };
  nbEl.querySelectorAll('[data-clue]').forEach(b => b.onclick = () => socket.emit('case', { caseId: c.id, op: 'clue', kind: b.dataset.clue }));
  nbEl.querySelectorAll('[data-go]').forEach(b => b.onclick = () => socket.emit('goto', b.dataset.go));
  nbEl.querySelectorAll('[data-here]').forEach(b => b.onclick = () => startClueHere(b.dataset.here));
  const bw = $('nbWit'); if (bw) bw.onclick = () => { witnessFor = c.id; socket.emit('roster'); };
  const bc = $('nbConf'); if (bc) bc.onclick = () => { modal(`<button class="close" onclick="window._close()">✕</button><h3>🙇 Nhận tội</h3><div style="color:var(--muted)">Nhận tội thì vụ án khép lại, được giảm nhẹ. Chọn hình phạt:</div><div class="btns" style="flex-direction:column;align-items:stretch"><button data-m="camtuc">🔒 Cấm túc 1 ngày<small style="display:block;color:var(--muted)">Giữ nguyên cấp bậc, nhưng 24 giờ chỉ được ở phòng, không dự yến tiệc, không được lật thẻ</small></button><button data-m="giang">⬇️ Giáng 1 bậc<small style="display:block;color:var(--muted)">Mất cấp ngay, nhưng vẫn tự do đi lại</small></button></div>`); $('mcard').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { closeModal(); socket.emit('case', { caseId: c.id, op: 'confess', mode: b.dataset.m }); }); };
  const bt = $('nbTrial'); if (bt) bt.onclick = () => runTrial(c);
  for (const img of nbEl.querySelectorAll('img.pt')) portrait(img.dataset.m).then(u => { img.src = u; }).catch(() => {});
}

// chân dung nhỏ cho thẻ nghi phạm
const ptCache = new Map(); let ptR = null;
function portrait(model) {
  if (ptCache.has(model)) return ptCache.get(model);
  const pr = (async () => {
    if (!ptR) { ptR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); ptR.setSize(112, 112); ptR.toneMapping = THREE.ACESFilmicToneMapping; ptR.toneMappingExposure = 1.3; }
    const c = await spawn(model); c.play('dung_cho'); c.update(0.1);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x664444, 2.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(1, 2, 3); sc.add(dl); sc.add(c.root);
    c.root.updateMatrixWorld(true); const hp = new THREE.Vector3(); c.B.head.getWorldPosition(hp);
    const cam = new THREE.PerspectiveCamera(30, 1, .01, 10); cam.position.set(0, hp.y + .01, hp.z + .62); cam.lookAt(0, hp.y - .04, hp.z);
    ptR.render(sc, cam); const url = ptR.domElement.toDataURL('image/png'); c.dispose(); return url;
  })();
  ptCache.set(model, pr); return pr;
}

// =====================================================================
// CẢNH DIỄN DÙNG CHUNG
// =====================================================================
let trial = null;
async function stageBegin(loc) {
  sacBusy = true; cutActive = true; closeModal();
  await fade(true); document.body.classList.add('staging');
  const saved = world; scene.remove(saved.group);
  const o = buildLocation(loc, { palace: me?.hasPalace, palaceName: me ? (me.name.split(' ').pop() + ' cung') : '' }); scene.add(o.group); applyLights(o.lights);
  const S = { o, saved, chars: [], movers: [], extra: [] };
  stage = { update: dt => { for (const m of S.movers.slice()) m(dt); for (const c of S.chars) c.update(dt); if (stage._cam) stage._cam(dt); if (stage.post) stage.post(); } };
  return S;
}
async function stageChar(S, model, x, z, ry, anim) { const c = await spawn(model); c.root.position.set(x, 0, z); c.root.rotation.y = ry; S.o.group.add(c.root); if (anim) c.play(anim); S.chars.push(c); return c; }
function walkTo(S, c, x, z, dur) {
  return new Promise(res => { const fx = c.root.position.x, fz = c.root.position.z; let t = 0; c.root.rotation.y = Math.atan2(x - fx, z - fz); c.play('di');
    const f = dt => { t += dt; const k = Math.min(1, t / dur); c.root.position.x = fx + (x - fx) * k; c.root.position.z = fz + (z - fz) * k; if (k >= 1) { S.movers.splice(S.movers.indexOf(f), 1); c.play('dung_cho'); res(); } };
    S.movers.push(f); });
}
function camTo(pos, look, dur) {
  return new Promise(res => { const p0 = camera.position.clone(), l0 = camera.userData.look?.clone() || look.clone(); let t = 0; const st = stage;
    const f = dt => { t += dt; const k = Math.min(1, t / dur), e = k * k * (3 - 2 * k); camera.position.lerpVectors(p0, pos, e); const l = l0.clone().lerp(look, e); camera.lookAt(l); camera.userData.look = l; if (k >= 1) { st._cam = null; res(); } };
    st._cam = f; });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function stageEnd(S, queued) {
  hideBar(); $('cut').classList.add('hidden');
  await fade(true);
  S.chars.forEach(c => c.dispose()); scene.remove(S.o.group); stage = null;
  scene.add(S.saved.group); applyLights(S.saved.lights); world = S.saved;
  if (pendingScene) { const ps = pendingScene; pendingScene = null; await enterScene(ps.loc, ps.players, ps.venue, ps.seat); }
  else if (selfC && selfC.outfit !== me.outfit) { const r = selfC.root; await respawnSelf(r.position.x, r.position.z, r.rotation.y); }
  document.body.classList.remove('staging'); cutActive = false; snapCam = true;
  await fade(false); sacBusy = false;
  if (queued) { const f = cutDone; cutDone = () => {}; f(); }
}
// thanh lời thoại phía trên (không bị ẩn khi diễn)
const barEl = document.createElement('div'); barEl.id = 'sbar'; barEl.className = 'hidden'; document.body.appendChild(barEl);
function showBar(who, html, buttons = []) {
  barEl.classList.remove('hidden');
  barEl.innerHTML = `${who ? `<div class="who">${esc(who)}</div>` : ''}<div class="txt">${html}</div>${buttons.length ? `<div class="btns">${buttons.map((b, i) => `<button data-i="${i}" class="${b[2] || ''}">${b[0]}</button>`).join('')}</div>` : ''}`;
  barEl.querySelectorAll('[data-i]').forEach(b => b.onclick = () => buttons[+b.dataset.i][1]());
}
function hideBar() { barEl.classList.add('hidden'); }

// =====================================================================
// 1. CẢNH PHÁT GIÁC
// =====================================================================
function makeEvidence(method) {
  const g = new THREE.Group(); const M = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: .6 });
  if (method === 'tuithom') { const b = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 12), M(0xb3202a, .35)); b.scale.y = 1.25; b.position.y = .06; g.add(b); const k = new THREE.Mesh(new THREE.TorusGeometry(.022, .006, 6, 16), M(0xe2bf6b, .4)); k.position.y = .125; k.rotation.x = Math.PI / 2; g.add(k); const t = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .09), M(0xe2bf6b, .4)); t.position.y = .0; g.add(t); }
  else if (method === 'thu') { const p = new THREE.Mesh(new THREE.BoxGeometry(.16, .004, .11), M(0xf3ead2, .25)); p.position.y = .01; p.rotation.y = .3; g.add(p); for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(.005, .005, .08), M(0x222222)); l.position.set(-.05 + i * .03, .014, 0); l.rotation.y = .3; g.add(l); } }
  else if (method === 'canh') { const b = new THREE.Mesh(new THREE.CylinderGeometry(.065, .04, .05, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf4f0e6, side: THREE.DoubleSide })); b.position.y = .025; g.add(b); const l = new THREE.Mesh(new THREE.CircleGeometry(.06, 24), M(0x2a3d12, .5)); l.rotation.x = -Math.PI / 2; l.position.y = .042; g.add(l); }
  else { const p = new THREE.Mesh(new THREE.BoxGeometry(.06, .004, .16), M(0xf2c63a, .35)); p.position.y = .01; g.add(p); const r = new THREE.Mesh(new THREE.BoxGeometry(.035, .006, .035), M(0xc0201b, .4)); r.position.set(0, .013, -.03); g.add(r); }
  const light = new THREE.PointLight(0xffd27a, 0, 1.6); light.position.y = .25; g.add(light); g.userData.light = light;
  return g;
}
async function runPhatGiac(d) {
  const S = await stageBegin('phong');
  const ev = makeEvidence(d.method || 'tuithom'); ev.position.set(.75, 0, -.55); S.o.group.add(ev);
  let glow = 0; S.movers.push(dt => { glow += dt; ev.userData.light.intensity = 1.2 + Math.sin(glow * 5) * .6; ev.rotation.y += dt * .6; });
  const me3 = await stageChar(S, me.outfit === 'aongu' ? 'tunu' : me.outfit, -.2, -.1, Math.PI * .85, 'dung_cho');
  const mama = await stageChar(S, 'mama', 0, 2.4, Math.PI, 'dung_cho');
  const g1 = await stageChar(S, 'thive', -.55, 2.6, Math.PI, 'dung_cho'), g2 = await stageChar(S, 'thive', .55, 2.6, Math.PI, 'dung_cho');
  camera.position.set(1.7, 1.25, 2.3); camera.lookAt(0, .6, .3); camera.userData.look = new THREE.Vector3(0, .6, .3);
  await fade(false);
  showBar('Quế ma ma', 'Phụng ý chỉ Thái hậu, khám xét phòng này!');
  walkTo(S, g1, -.7, 1.3, 1.6); walkTo(S, g2, .7, 1.3, 1.6);
  await walkTo(S, mama, .45, -.05, 2.4);
  mama.root.rotation.y = Math.atan2(.75 - .45, -.55 + .05);
  me3.root.rotation.y = Math.atan2(.45 + .2, -.05 + .1);
  await camTo(new THREE.Vector3(1.05, .55, .2), new THREE.Vector3(.75, .08, -.55), 1.4);
  music.gong(); mama.play('gian');
  showBar('Quế ma ma', `Tìm thấy rồi! <b>${esc(d.methodName)}</b> giấu ngay trong phòng!`);
  await sleep(2600);
  await camTo(new THREE.Vector3(1.5, 1.15, 2.1), new THREE.Vector3(0, .55, 0), 1.2);
  me3.play('quy'); mama.root.rotation.y = Math.atan2(-.2 - .45, -.1 + .05);
  showBar('Quế ma ma', `Chủ tử bị nghi <b>${esc(d.crime)}</b>. Thái hậu cho <b>${d.hours} giờ</b> để tự minh oan, sau đó lên Từ Ninh cung chịu xét xử!`,
    [['📒 Mở sổ điều tra', async () => { await stageEnd(S, true); openCase(d.caseId); }, 'gold']]);
}

// =====================================================================
// 4. PHIÊN XỬ ÁN Ở TỪ NINH CUNG
// =====================================================================
const tagWrap = document.createElement('div'); tagWrap.id = 'ttags'; document.body.appendChild(tagWrap);
async function runTrial(c) {
  if (trial || stage) return;
  trial = { c, waiting: null };
  closeNotebook();
  const S = await stageBegin('tuninh'); trial.S = S;
  const o = S.o;
  const th = await stageChar(S, 'thaihau', 0, 0, 0, null);
  th.root.position.set(0, o.dais.y, o.dais.z); const sp = seatPlacement(th);
  o.throne.position.set(sp.x, sp.y - .04, sp.z); o.throne.rotation.y = sp.ry;
  for (const l of o.throne.userData.legs) { const h = sp.y - .04 - o.dais.y; l.scale.y = h; l.position.y = -h / 2; }
  th.play('ngoi');
  const n = c.table.length, xs = c.table.map((_, i) => (i - (n - 1) / 2) * .78);
  trial.sus = [];
  for (let i = 0; i < n; i++) { const s = c.table[i]; const ch = await stageChar(S, s.model, xs[i], 1.05, 0, 'quy'); trial.sus.push({ s, ch }); }
  const self3 = await stageChar(S, me.outfit === 'aongu' ? 'tunu' : me.outfit, 0, 2.45, Math.PI, 'dung_cho'); trial.self = self3;
  const mama = await stageChar(S, 'mama', -2.2, .3, Math.PI / 2, 'dung_cho');
  stage.post = placeTags;
  camera.position.set(.85, 1.2, 4.25); camera.lookAt(0, .5, 1.1); camera.userData.look = new THREE.Vector3(0, .5, 1.1);
  // thẻ tên bấm được trên đầu từng nghi phạm
  tagWrap.innerHTML = ''; tagWrap.classList.remove('hidden');
  const A = analyse(c);
  for (const t of trial.sus) {
    const a = A.find(x => x.id === t.s.id); const el = document.createElement('button'); el.className = 'ttag' + (a?.out ? ' out' : '');
    el.innerHTML = `${esc(t.s.name)}${a?.out ? '<small>đã loại</small>' : ''}`;
    el.onclick = () => pickAccused(t); tagWrap.appendChild(el); t.el = el;
  }
  await fade(false); music.gong();
  showBar('Thái hậu', 'Kẻ nào to gan dám hãm hại hậu cung? Ngươi nói đi, ai là thủ phạm?<br><small>Bấm vào tên người muốn buộc tội.</small>', [['Lui về', () => endTrial()]]);
}
function placeTags() {
  if (!trial?.sus) return; const v = new THREE.Vector3();
  for (const t of trial.sus) { if (!t.el) continue; t.ch.root.getWorldPosition(v); v.y += .82; v.project(camera); t.el.style.left = (v.x * .5 + .5) * innerWidth + 'px'; t.el.style.top = (-v.y * .5 + .5) * innerHeight + 'px'; }
}
function pickAccused(t) {
  if (trial.waiting) return;
  trial.sus.forEach(x => x.el.classList.toggle('sel', x === t));
  showBar('Thái hậu', `Ngươi buộc tội <b>${esc(t.s.name)}</b>? Nếu sai, ngươi sẽ mang thêm tội vu cáo.`, [['Chọn lại', () => { trial.sus.forEach(x => x.el.classList.remove('sel')); showBar('Thái hậu', 'Ai là thủ phạm? Bấm vào tên người muốn buộc tội.', [['Lui về', () => endTrial()]]); }], ['⚖️ Buộc tội', () => accuse(t), 'gold']]);
}
function accuse(t) {
  trial.waiting = t; showBar('', 'Thái hậu đang cân nhắc chứng cứ…');
  t.ch.root.rotation.y = 0; trial.self.play('chap_tay');
  socket.emit('case', { caseId: trial.c.id, op: 'accuse', who: t.s.id });
  trial.timer = setTimeout(() => { if (trial?.waiting) trialResult({ verdict: 'reopenfail' }); }, 2500);
}
async function trialResult(d) {
  if (!trial?.waiting) return; clearTimeout(trial.timer);
  const t = trial.waiting; trial.waiting = null; tagWrap.classList.add('hidden');
  const self3 = trial.self;
  await camTo(new THREE.Vector3(t.ch.root.position.x * .5 + .5, 1.2, 3.5), new THREE.Vector3(t.ch.root.position.x, .4, 1.05), 1.0);
  music.gong();
  if (d.verdict === 'latan') {
    t.ch.play('khoc'); setTimeout(() => t.ch.play('nga'), 2200);
    for (const x of trial.sus) if (x !== t) x.ch.play('cui_chao');
    self3.play('hanh_le');
    showBar('Thái hậu', `Chứng cứ rành rành! <b>${esc(t.s.name)}</b> chính là kẻ hãm hại. Trả lại trong sạch cho ${esc(me.name)}, kẻ có tội phải chịu phạt gấp đôi!`, [['🙇 Tạ ơn Thái hậu', () => endTrial(), 'gold']]);
  } else if (d.verdict === 'vucao') {
    t.ch.play('gian'); self3.play('quy'); setTimeout(() => self3.play('khoc'), 1600);
    showBar('Thái hậu', `<b>${esc(t.s.name)}</b> vô can! Ngươi không tìm ra thủ phạm lại còn vu cáo người khác. Phạt thêm tội vu cáo!`, [['Lui ra', () => endTrial()]]);
  } else {
    t.ch.play('gian'); self3.play('khoc');
    showBar('Thái hậu', `<b>${esc(t.s.name)}</b> không phải thủ phạm. Kêu oan sai người, hãy về tìm thêm chứng cứ.`, [['Lui ra', () => endTrial()]]);
  }
}
async function endTrial() {
  if (!trial) return; const S = trial.S, id = trial.c.id; tagWrap.classList.add('hidden'); tagWrap.innerHTML = '';
  await stageEnd(S, false); trial = null;
  if (me.cases?.some(x => x.id === id) || me.lanh?.caseId === id) openCase(id);
  nextCut();
}

// =====================================================================
// 2. ĐI TÌM MANH MỐI TẬN NƠI
// =====================================================================
const clueWaiters = [];
const CLUE_AT = { theodoi: { loc: 'hoavien' }, hoi: { loc: 'phong', talk: 'cungnu' }, so: { loc: 'duongtam', talk: 'thaigiam' }, thaiy: { loc: 'tuninh', talk: 'thaiy' }, tro: { loc: 'hoavien' } };
function clueOpen(kind) { return nb && (nb.status === 'open' || nb.reopen) && !nb.found.some(f => f.kind === kind); }
function getClue(kind) {
  return new Promise(res => {
    let done = false; const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 3500);
    clueWaiters.push(function w(c) { const f = c.found.find(x => x.kind === kind); if (f && !done) { done = true; clearTimeout(t); res(f); } else if (!done) clueWaiters.push(w); });
    socket.emit('case', { caseId: nb.id, op: 'clue', kind });
  });
}
function startClueHere(kind) {
  if (kind === 'tro') return clueTro();
  if (kind === 'theodoi') return clueTheoDoi();
  const n = world?.npcs.find(x => x.talk === CLUE_AT[kind].talk); if (n) talk(n);
}
function refreshClueMarkers() {
  if (!world) return;
  for (const n of world.npcs) if (n.label) { const want = Object.entries(CLUE_AT).some(([k, v]) => v.talk === n.talk && v.loc === world.loc && clueOpen(k)); n.label.element.classList.toggle('clue', want); }
  // lò than ở Ngự hoa viên
  if (world.loc === 'hoavien' && clueOpen('tro') && !world.brazier) {
    const g = new THREE.Group(); g.position.set(1.8, 0, 4.3); const mt = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, metalness: .5, roughness: .5 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.32, .2, .28, 16), mt); bowl.position.y = .42; g.add(bowl);
    for (const a of [0, 2.1, 4.2]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .3, 6), mt); l.position.set(Math.cos(a) * .18, .14, Math.sin(a) * .18); g.add(l); }
    const ash = new THREE.Mesh(new THREE.CircleGeometry(.29, 16), new THREE.MeshStandardMaterial({ color: 0x8a8580, emissive: 0xff5a1a, emissiveIntensity: .25 })); ash.rotation.x = -Math.PI / 2; ash.position.y = .55; g.add(ash);
    const pl = new THREE.PointLight(0xff8a3a, 1.2, 2); pl.position.y = .8; g.add(pl);
    const d = document.createElement('div'); d.className = 'label npc clue'; d.innerHTML = '<div class="bbl"></div>Lò than'; d.style.pointerEvents = 'auto'; d.style.cursor = 'pointer'; d.onclick = e => { e.stopPropagation(); clueTro(); };
    const lb = new CSS2DObject(d); lb.position.set(0, 1.0, 0); g.add(lb);
    world.group.add(g); world.brazier = g; world.blocks = [...(world.blocks || []), { x: 1.8, z: 4.3, r: .45 }];
  }
  if (world.loc === 'hoavien' && clueOpen('theodoi') && !world.spy) {
    const w = world; world.spy = 'loading';
    spawn('cungnu').then(c => { if (world !== w || !clueOpen('theodoi')) return c.dispose(); c.root.position.set(-2.5, 0, 2.3); c.root.rotation.y = 2.3; c.play('chap_tay'); w.group.add(c.root);
      c.root.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color?.multiplyScalar(.45); } });
      const d = document.createElement('div'); d.className = 'label npc clue'; d.innerHTML = '<div class="bbl"></div>Bóng người khả nghi'; d.style.pointerEvents = 'auto'; d.style.cursor = 'pointer'; d.onclick = e => { e.stopPropagation(); clueTheoDoi(); };
      const lb = new CSS2DObject(d); lb.position.set(0, 1.1, 0); c.root.add(lb); w.spy = c; w.npcs.push({ c, name: 'Bóng người', label: lb, spy: true }); });
  } else if (world.spy && world.spy !== 'loading' && !clueOpen('theodoi')) { world.spy.root.traverse(o => { if (o.isCSS2DObject) o.element.remove(); }); world.spy.dispose(); world.spy = null; }
  if (world.brazier && !clueOpen('tro')) { world.brazier.traverse(o => { if (o.isCSS2DObject) o.element.remove(); }); world.group.remove(world.brazier); world.brazier = null; }
}
// khung hội thoại kiểu truyện tranh, có chân dung
const dlgEl = document.createElement('div'); dlgEl.id = 'dlg'; dlgEl.className = 'hidden'; document.body.appendChild(dlgEl);
function say(model, name, text, choices = [['Tiếp', null]]) {
  return new Promise(res => {
    dlgEl.classList.remove('hidden');
    dlgEl.innerHTML = `<img class="pt" alt=""><div class="body"><div class="who">${esc(name)}</div><div class="txt">${text}</div><div class="btns">${choices.map((c, i) => `<button data-i="${i}" class="${c[2] || ''}">${c[0]}</button>`).join('')}</div></div>`;
    portrait(model).then(u => { const im = dlgEl.querySelector('img.pt'); if (im) im.src = u; }).catch(() => {});
    dlgEl.querySelectorAll('[data-i]').forEach(b => b.onclick = () => res(+b.dataset.i));
  });
}
const dlgClose = () => dlgEl.classList.add('hidden');
const meModel = () => (me.outfit === 'aongu' ? 'tunu' : me.outfit);
async function clueCungNu(n) {
  const L = me.loyal ?? 50;
  if (L < 30) {
    const k = await say('cungnu', n.name, `Nương nương… nô tỳ… nô tỳ không dám nói. Lỡ người ta biết thì nô tỳ mất mạng. <br><small>Trung thành: ${L}/100. Thấp quá nên nàng sợ.</small>`, [['Ban 30 bạc cho nàng yên tâm', 1, 'gold'], ['Thôi', 0]]);
    if (k !== 1) return dlgClose();
    const f = await new Promise(res => { let done = false; const t = setTimeout(() => { done = true; res(null); }, 3500); clueWaiters.push(function w(c) { const x = c.found.find(y => y.kind === 'hoi'); if (x && !done) { done = true; clearTimeout(t); res(x); } else if (!done) clueWaiters.push(w); }); socket.emit('case', { caseId: nb.id, op: 'clue', kind: 'hoi', bribe: true }); });
    if (f) await say('cungnu', n.name, `Đa tạ nương nương… Nô tỳ nhớ: <i>“${esc(f.text)}”</i><br><small>📒 Đã ghi vào sổ điều tra.</small>`, [['Tốt lắm', 0, 'gold']]);
    return dlgClose();
  }
  if (await say('cungnu', n.name, 'Nương nương… chuyện tang vật, nô tỳ có điều muốn bẩm. Đêm ấy nô tỳ trực ngoài cửa, hình như có người lén vào phòng.', [['Ngươi thấy gì? Nói mau!', 1, 'gold'], ['Để sau', 0]]) === 0) {
    const f = await getClue('hoi'); if (!f) return dlgClose();
    const ex = nb?.found.find(x => x.kind === 'hoi2');
    await say('cungnu', n.name, `Nô tỳ không dám nhìn kỹ… <i>“${esc(f.text)}”</i>${ex ? `<br>${esc(ex.text)}` : ''}<br><small>📒 Đã ghi vào sổ điều tra. Trung thành: ${me.loyal ?? 50}/100${(me.loyal ?? 50) >= 80 ? ' · nàng khai thêm vì rất trung thành' : ''}</small>`, [['Tốt lắm', 0, 'gold']]);
  }
  dlgClose();
}
async function clueThaiY(n) {
  if (await say('thaiy', n.name, `Thần nghe nói phòng của nương nương có ${esc(nb.methodName.toLowerCase())}. Nếu nương nương mang tang vật tới, thần có thể kiểm nghiệm xem nó dính thứ gì. Phí thuốc thử 80 lượng bạc.`, [['Nhờ thái y kiểm nghiệm (80 bạc)', 1, 'gold'], ['Thôi', 0]]) === 0) {
    await say('thaiy', n.name, 'Để thần xem… <i>(thái y ngửi, soi dưới đèn, nhỏ thuốc thử)</i>', [['…', 0]]);
    const f = await getClue('thaiy'); if (!f) return dlgClose();
    await say('thaiy', n.name, `Bẩm nương nương: <b>${esc(f.text)}</b> Thứ này không thể giả được.<br><small>📒 Đã ghi vào sổ điều tra.</small>`, [['Đa tạ thái y', 0, 'gold']]);
  }
  dlgClose();
}
// sổ quà Nội vụ phủ: tìm dòng ghi món đồ khả nghi
const DECOY_GIFTS = ['Lụa Tô Châu hai xấp', 'Trâm ngọc phỉ thúy', 'Trà Long Tỉnh thượng hạng', 'Phấn sáp Giang Nam', 'Đèn lồng sa vẽ hoa', 'Hộp mứt táo đỏ', 'Quạt lụa thêu điệp', 'Gối ngọc mát'];
async function clueSoQua(n) {
  if (await say('thaigiam', n.name, 'Sổ ghi quà của Nội vụ phủ đây ạ. Mọi món đồ ra vào hậu cung đều được ghi lại, chủ tử muốn tra thì nô tài mở cho. Phí bôi trơn 40 lượng bạc, tốn 1 lượt.', [['Mở sổ ra xem', 1, 'gold'], ['Thôi', 0]]) !== 0) return dlgClose();
  dlgClose();
  const rows = DECOY_GIFTS.sort(() => Math.random() - .5).slice(0, 5); const pos = Math.floor(Math.random() * 6); rows.splice(pos, 0, '★');
  const days = ['Mùng 3', 'Mùng 5', 'Mùng 8', 'Mười hai', 'Mười lăm', 'Mười chín'];
  modal(`<button class="close" onclick="window._close()">✕</button><div class="ledger"><h3>📖 Sổ quà Nội vụ phủ</h3><div class="sub">Tìm dòng ghi món đồ giống tang vật trong vụ án: <b>${esc(nb.methodName)}</b></div>
  ${rows.map((r, i) => `<div class="lrow" data-i="${i}"><span class="d">${days[i]}</span><span class="it">${r === '★' ? esc(nb.methodName) : esc(r)}</span><span class="fr">gửi từ: <i>${r === '★' ? '<span class="blot">▒▒▒▒▒▒</span>' : '…'}</i></span></div>`).join('')}</div>`);
  $('mcard').querySelectorAll('.lrow').forEach(el => el.onclick = async () => {
    if (+el.dataset.i !== pos) { el.classList.add('shake'); el.querySelector('.fr').innerHTML = 'món này không liên quan'; setTimeout(() => el.classList.remove('shake'), 500); return; }
    el.classList.add('hit'); el.querySelector('.fr').innerHTML = 'đang dò…';
    const f = await getClue('so'); if (!f) return closeModal();
    el.querySelector('.fr').innerHTML = `<b>${esc(f.text)}</b>`;
    $('mcard').insertAdjacentHTML('beforeend', '<div class="btns"><button class="gold" onclick="window._close()">📒 Ghi vào sổ điều tra</button></div>');
  });
}
// lục tro: kéo chuột phủi tro để lộ mảnh thư cháy dở
async function clueTro() {
  if (!clueOpen('tro')) return toast('Lò than này đã lục rồi.');
  if (!confirm('Lục tro trong lò than? (tốn 1 lượt)')) return;
  const f = await getClue('tro'); if (!f) return;
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🔥 Lục tro tàn</h3><div class="sub" style="color:var(--muted);font-size:13px">Kéo chuột để phủi lớp tro, xem mảnh giấy cháy dở bên dưới viết gì.</div><canvas id="ash" width="440" height="240" style="width:100%;max-width:440px;border-radius:10px;display:block;margin:8px auto;cursor:grab;touch-action:none"></canvas><div id="ashDone" class="btns hidden"><button class="gold" onclick="window._close()">📒 Ghi vào sổ điều tra</button></div>`);
  const cv = $('ash'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  // lớp dưới: giấy cháy có chữ
  const under = document.createElement('canvas'); under.width = W; under.height = H; const u = under.getContext('2d');
  u.fillStyle = '#2a1a12'; u.fillRect(0, 0, W, H);
  u.fillStyle = '#e9d7b0'; u.beginPath(); u.moveTo(40, 40); for (let x = 40; x <= 400; x += 20) u.lineTo(x, 32 + Math.random() * 16); for (let y = 40; y <= 200; y += 20) u.lineTo(400 + Math.random() * 14, y); for (let x = 400; x >= 40; x -= 20) u.lineTo(x, 200 + Math.random() * 14); for (let y = 200; y >= 40; y -= 20) u.lineTo(32 + Math.random() * 14, y); u.fill();
  u.fillStyle = '#3a1408'; u.font = 'italic 17px "Noto Serif", serif'; u.textAlign = 'center';
  const words = f.text.split(' '); let line = '', y = 92; const lines = [];
  for (const w of words) { if ((line + ' ' + w).length > 34) { lines.push(line); line = w; } else line = (line + ' ' + w).trim(); } lines.push(line);
  lines.forEach((l, i) => u.fillText(l, W / 2, y + i * 26));
  // lớp trên: tro
  const ashC = document.createElement('canvas'); ashC.width = W; ashC.height = H; const a = ashC.getContext('2d');
  for (let i = 0; i < 9000; i++) { const v = 90 + Math.random() * 70; a.fillStyle = `rgb(${v},${v - 4},${v - 8})`; a.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 5, 3 + Math.random() * 5); }
  a.fillStyle = 'rgba(120,115,108,.9)'; a.globalCompositeOperation = 'destination-over'; a.fillRect(0, 0, W, H); a.globalCompositeOperation = 'destination-out';
  const draw = () => { g.clearRect(0, 0, W, H); g.drawImage(under, 0, 0); g.drawImage(ashC, 0, 0); };
  draw(); let down = false, done = false;
  const rub = e => { if (!down) return; const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width, y2 = (e.clientY - r.top) * H / r.height; const gr = a.createRadialGradient(x, y2, 2, x, y2, 34); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = gr; a.beginPath(); a.arc(x, y2, 34, 0, 7); a.fill(); draw(); check(); };
  const check = () => { if (done) return; const d = a.getImageData(0, 0, W, H).data; let clear = 0; for (let i = 3; i < d.length; i += 64) if (d[i] < 60) clear++; if (clear / (d.length / 64) > .45) { done = true; a.clearRect(0, 0, W, H); draw(); $('ashDone').classList.remove('hidden'); } };
  cv.onpointerdown = e => { down = true; cv.setPointerCapture(e.pointerId); rub(e); }; cv.onpointermove = rub; cv.onpointerup = () => { down = false; };
}

// =====================================================================
// 5. NHÂN CHỨNG LÀ NGƯỜI CHƠI THẬT
// =====================================================================
socket.on('witnessAsk', d => {
  const end = Date.now() + d.waitMs;
  modal(`<h3>🙋 Lời nhờ làm chứng</h3>
  <div style="line-height:1.6"><b>${esc(d.victimName)}</b> nhờ bổn cung làm chứng trong vụ <b>${esc(d.methodName)}</b>.<br>
  Hôm ấy bổn cung có thấy một người lảng vảng gần phòng. Điều bổn cung thật sự nhớ về <b>${esc(d.traitName)}</b> của người đó: <b style="color:var(--gold2)">${esc(d.options[d.truth])}</b>.</div>
  ${d.guilty ? '<div class="clue" style="border-color:#c0503a;margin-top:8px">🤫 <b>Chính bổn cung là kẻ đã ra tay vụ này.</b> Khai thật sẽ tự tố mình; khai gian có thể thoát… nếu người kia không tìm thêm chứng cứ.</div>' : ''}
  <div style="margin-top:8px;color:var(--muted);font-size:13px">Chọn lời khai (<span id="wTimer"></span> nữa sẽ tự khai):</div>
  <div class="btns" style="flex-direction:column;align-items:stretch">${d.options.map((o, i) => `<button data-v="${i}" class="${i === d.truth ? 'gold' : ''}">${i === d.truth ? '✓ Khai thật: ' : 'Khai: '}${esc(o)}</button>`).join('')}<button data-v="-1">Từ chối làm chứng</button></div>`);
  const tick = setInterval(() => { const el = $('wTimer'); if (!el) return clearInterval(tick); const l = Math.max(0, end - Date.now()); el.textContent = `${Math.floor(l / 60e3)}:${String(Math.floor(l % 60e3 / 1000)).padStart(2, '0')}`; if (l <= 0) { clearInterval(tick); closeModal(); } }, 500);
  $('mcard').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const v = +b.dataset.v; socket.emit('witnessAnswer', v < 0 ? { caseId: d.caseId, refuse: true } : { caseId: d.caseId, value: v }); clearInterval(tick); closeModal(); });
});

// =====================================================================
// MÀN CHỜ, CHỮ BAY, GỢI Ý HOÀNG THƯỢNG
// =====================================================================
function hideLoading() { const l = $('loading'); if (l && !l.classList.contains('gone')) { l.classList.add('gone'); setTimeout(() => l.remove(), 900); } }
// màn chờ cổng cung chỉ hiện khi máy chủ đang thức dậy (chưa kết nối được sau 1,2 giây)
setTimeout(() => { if (!socket.connected) $('loading')?.classList.remove('hidden'); }, 1200);
socket.on('connect', hideLoading);
function floatDeltas(a, b) {
  const D = [['silver', '💰', 'bạc'], ['sung', '💗', 'sủng ái'], ['pts', '⭐', 'công trạng'], ['haiLong', '🍵', 'Thái hậu'], ['turns', '⏳', 'lượt']];
  let i = 0;
  for (const [k, ic, nm] of D) { const d = (b[k] ?? 0) - (a[k] ?? 0); if (!d || a.rank !== b.rank && k === 'pts' && Math.abs(d) > 500) continue;
    const el = document.createElement('div'); el.className = 'fdelta ' + (d > 0 ? 'up' : 'down'); el.textContent = `${d > 0 ? '+' : ''}${d} ${ic} ${nm}`;
    el.style.animationDelay = (i++ * .25) + 's'; document.body.appendChild(el); setTimeout(() => el.remove(), 2600 + i * 250); }
}
function htPill() {
  const k = me?.htKnown || {}; const parts = [];
  if (k.canh) parts.push('thèm ' + k.canh); if (k.mau) parts.push('thích áo ' + k.mau); if (k.tai) parts.push('muốn xem ' + k.tai); if (k.mood) parts.push('tâm trạng ' + k.mood);
  return parts.length ? `<span class="pill ht" title="Dò tin ở Ngự hoa viên để biết thêm">👑 Hôm nay Hoàng thượng ${parts.join(', ')}</span>` : '<span class="pill ht dim" title="Dò tin ở Ngự hoa viên">👑 Sở thích Hoàng thượng hôm nay: chưa dò</span>';
}

// =====================================================================
// TRÒ NHỎ (nhân vật diễn, khung nhỏ phía dưới không che nhân vật)
// =====================================================================
const mgEl = document.createElement('div'); mgEl.id = 'mg'; mgEl.className = 'hidden'; document.body.appendChild(mgEl);
let mgOn = false;
function mgOpen(html) { mgOn = true; mgEl.innerHTML = html; mgEl.classList.remove('hidden'); document.body.classList.add('mgopen'); camDistSaved = camDist; camDist = Math.max(2.2, camDist * .8); }
let camDistSaved = null;
function mgClose() { mgOn = false; mgEl.classList.add('hidden'); document.body.classList.remove('mgopen'); if (camDistSaved) camDist = camDistSaved; camDistSaved = null; }
function chooseTai(cb) {
  if (mgOn) return;
  if (me.turns < 1 && world?.loc !== 'yentiec') return toast('Hết lượt hôm nay.', 'bad');
  const fav = me.htKnown?.tai;
  mgOpen(`<div class="mgt">Chọn tài nghệ</div><div class="row">${[['đàn', '🎵 Đàn tranh'], ['múa', '💃 Múa quạt'], ['thơ', '📜 Ngâm thơ']].map(([k, n]) => `<button data-t="${k}" class="${fav === k ? 'gold' : ''}">${n}${fav === k ? ' ★' : ''}</button>`).join('')}<button data-x>✕</button></div>`);
  mgEl.querySelectorAll('[data-t]').forEach(b => b.onclick = () => cb(b.dataset.t));
  mgEl.querySelector('[data-x]').onclick = mgClose;
}
// nhịp phách: nốt chạy sang phải, bấm khi nốt vào ô vàng
function gameRhythm(tai, done) {
  if (selfC) { selfC.target = null; taiStart(selfC, tai); socket.emit('emote', 'tai:' + tai); camYaw = selfC.root.rotation.y + (tai === 'đàn' ? .5 : 0); }
  if (tai === 'thơ') poemShow();
  const N = 8, notes = []; let t0 = performance.now() + 900, hits = 0, judged = 0, raf;
  for (let i = 0; i < N; i++) notes.push({ t: t0 + i * (520 + Math.random() * 380), st: 0 });
  mgOpen(`<div class="mgt">${tai === 'đàn' ? '🎵 Gảy đàn' : tai === 'múa' ? '💃 Múa quạt' : '📜 Ngâm thơ'} · bấm khi nốt chạm ô vàng <small>(phím cách hoặc chạm)</small></div><div class="lane"><div class="zone"></div></div><div class="mgs">Trúng <b id="mgHit">0</b>/${N}</div>`);
  const lane = mgEl.querySelector('.lane'); const els = notes.map(() => { const d = document.createElement('div'); d.className = 'note'; d.textContent = tai === 'đàn' ? '♪' : tai === 'múa' ? '❀' : '字'; lane.appendChild(d); return d; });
  const W = () => lane.clientWidth, ZX = () => W() * .82, SPEED = .32; // px/ms
  const hit = () => { const now2 = performance.now(); let best = null; for (const n of notes) if (!n.st) { const dt = Math.abs(now2 - n.t); if (dt < 170 && (!best || dt < Math.abs(now2 - best.t))) best = n; } if (best) { best.st = 1; hits++; judged++; poemStep(); els[notes.indexOf(best)].className = 'note ok'; $('mgHit').textContent = hits; } else { lane.classList.add('miss'); setTimeout(() => lane.classList.remove('miss'), 150); } };
  const key = e => { if (e.code === 'Space') { e.preventDefault(); hit(); } };
  addEventListener('keydown', key); lane.onpointerdown = hit;
  const loop = () => { const now2 = performance.now(); notes.forEach((n, i) => { const x = ZX() - (n.t - now2) * SPEED; els[i].style.transform = `translateX(${x}px)`; if (!n.st && now2 - n.t > 170) { n.st = 2; judged++; poemStep(); els[i].className = 'note miss'; } });
    if (judged >= N) { finish(); return; } raf = requestAnimationFrame(loop); };
  const finish = () => { cancelAnimationFrame(raf); removeEventListener('keydown', key); const q = hits / N;
    mgEl.querySelector('.mgs').innerHTML = `${q > .8 ? '🌟 Xuất sắc!' : q > .5 ? '👏 Khá lắm' : '😅 Còn vụng'} · trúng ${hits}/${N}`;
    poemHide();
    setTimeout(() => { mgClose(); if (selfC) { taiEnd(selfC); selfC.play(q > .5 ? 'hanh_le' : 'dung_cho'); socket.emit('emote', q > .5 ? 'hanh_le' : 'dung_cho'); } done(q); }, 1300); };
  raf = requestAnimationFrame(loop);
}
// nấu canh: chọn món rồi canh lửa
const CANH = ['Canh sen hạt', 'Canh gà hầm sâm', 'Chè tổ yến', 'Canh cá chép', 'Canh bí đao', 'Chè long nhãn'];
function gameCanh() {
  if (mgOn) return; if (world?.loc !== 'duongtam') return toast('Phải đến Dưỡng Tâm điện mới dâng canh được.');
  if (me.turns < 1) return toast('Hết lượt hôm nay.', 'bad'); if (me.silver < 30) return toast('Không đủ 30 bạc.', 'bad');
  const fav = me.htKnown?.canh;
  mgOpen(`<div class="mgt">🍲 Chọn món dâng Hoàng thượng ${fav ? `<small>(nghe nói người thèm <b>${esc(fav)}</b>)</small>` : '<small>(chưa dò được người thèm món gì)</small>'}</div><div class="row wrap">${CANH.map((c, i) => `<button data-s="${i}" class="${fav === c ? 'gold' : ''}">${esc(c)}</button>`).join('')}<button data-x>✕</button></div>`);
  mgEl.querySelector('[data-x]').onclick = mgClose;
  mgEl.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    const soup = +b.dataset.s; if (selfC) { selfC.target = null; selfC.play('chap_tay'); }
    let k = 0, dir = 1, raf, taps = 0, good = 0;
    mgEl.innerHTML = `<div class="mgt">🔥 Canh lửa: bấm khi kim nằm trong vùng xanh (3 lần)</div><div class="heat"><div class="ok"></div><div class="nd"></div></div><div class="mgs">Lần <b id="mgT">0</b>/3</div>`;
    const nd = mgEl.querySelector('.nd'), heat = mgEl.querySelector('.heat'); const zone = [.4 + Math.random() * .2]; mgEl.querySelector('.ok').style.left = (zone[0] - .1) * 100 + '%';
    const loop = () => { k += dir * .018 * (1 + taps * .35); if (k > 1) { k = 1; dir = -1; } if (k < 0) { k = 0; dir = 1; } nd.style.left = k * 100 + '%'; raf = requestAnimationFrame(loop); };
    const tap = () => { taps++; if (Math.abs(k - zone[0]) < .1) { good++; heat.classList.add('good'); } else heat.classList.add('bad'); setTimeout(() => heat.classList.remove('good', 'bad'), 200); $('mgT').textContent = taps;
      if (taps >= 3) { cancelAnimationFrame(raf); removeEventListener('keydown', key); heat.onpointerdown = null; const q = good / 3; if (selfC) selfC.play('cui_chao');
        setTimeout(() => { mgClose(); act('dangcanh', { soup, q }); }, 900); } };
    const key = e => { if (e.code === 'Space') { e.preventDefault(); tap(); } };
    addEventListener('keydown', key); heat.onpointerdown = tap; raf = requestAnimationFrame(loop);
  });
}
// lãnh cung: quét lá
function gameLanh() {
  if (mgOn || !me.lanh) return; if (me.lanhToday) return toast('Hôm nay đã làm xong việc ở lãnh cung.');
  if (selfC) { selfC.target = null; selfC.play('cui_chao'); }
  const N = 10; let got = 0, end = performance.now() + 15000, raf;
  mgOpen(`<div class="mgt">🍂 Quét sân lãnh cung: bấm vào lá rụng trước khi hết giờ</div><div class="yard"></div><div class="mgs">Đã quét <b id="mgL">0</b>/${N} · còn <b id="mgS">15</b>s</div>`);
  const yard = mgEl.querySelector('.yard');
  const spawnLeaf = () => { const l = document.createElement('div'); l.className = 'leaf'; l.textContent = ['🍂', '🍁', '🍃'][Math.floor(Math.random() * 3)]; l.style.left = (5 + Math.random() * 85) + '%'; l.style.animationDuration = (2.6 + Math.random() * 1.8) + 's';
    l.onpointerdown = () => { l.remove(); got++; $('mgL').textContent = got; if (got >= N) fin(); }; l.addEventListener('animationend', () => l.remove()); yard.appendChild(l); };
  const iv = setInterval(spawnLeaf, 550); spawnLeaf();
  const loop = () => { const l = Math.max(0, end - performance.now()); $('mgS').textContent = Math.ceil(l / 1000); if (l <= 0) return fin(); raf = requestAnimationFrame(loop); };
  const fin = () => { if (!mgOn) return; clearInterval(iv); cancelAnimationFrame(raf); const q = got / N; mgEl.querySelector('.mgs').innerHTML = q >= .4 ? `Sân đã sạch (${got}/${N}).` : `Chưa sạch (${got}/${N}), lão ma ma không vừa ý.`;
    setTimeout(() => { mgClose(); act('lanh', { q }); if (selfC) selfC.play('dung_cho'); }, 1100); };
  raf = requestAnimationFrame(loop);
}

// =====================================================================
// YẾN TIỆC
// =====================================================================
let feast = null, feastHT = null;
socket.on('feast', f => { feast = f ? { ...f, mine: feast?.id === f?.id ? feast.mine : false } : null; renderHud(); renderActs(); syncFeastHT(); });
socket.on('feastUpdate', f => { if (feast && f) { feast.n = f.n; renderHud(); } });
socket.on('feastEnd', d => { feast = null; renderHud(); renderActs(); syncFeastHT(); if (d.winner) toast(`🏮 ${d.winner.name} thắng yến tiệc với tiết mục ${d.winner.tai}!`, d.winner.id === me?.id ? 'good' : 'info'); });
setInterval(() => { const el = $('feastT'); if (el && feast) { const l = Math.max(0, feast.end - Date.now()); el.textContent = `${Math.floor(l / 60e3)}:${String(Math.floor(l % 60e3 / 1000)).padStart(2, '0')}`; } }, 1000);
async function syncFeastHT() { return;
  const want = !!(feast && world?.loc === 'hoavien');
  if (!want && feastHT) { feastHT.label?.element.remove(); feastHT.root.parent?.remove(feastHT.root); feastHT.dispose(); feastHT = null; }
  if (want && !feastHT) { const w = world; const c = await spawn('hoangthuong'); if (world !== w || feastHT) return c.dispose(); c.root.position.set(2.4, 0, -1.4); c.root.rotation.y = -.9; c.play('dung_cho'); world.group.add(c.root); const lb = makeLabel('Hoàng thượng', '', true); c.root.add(lb); c.label = lb; feastHT = c; world.npcs.push({ c, name: 'Hoàng thượng', model: 'hoangthuong', label: lb, feast: true }); }
}

// =====================================================================
// TẨM CUNG: HẦU CHUYỆN HOÀNG THƯỢNG
// =====================================================================
let htTalking = false;
function startHtTalk() { if (htTalking || me.htTalked) return; htTalking = true; socket.emit('htTalkQ'); }
socket.on('htTalkQ', async d => {
  const open = { vui: 'Hôm nay trẫm vui, nàng đến thật đúng lúc!', mệt: 'Haizz… trẫm hơi mệt.', buồn: 'Trẫm có chút tâm sự…' }[d.mood] || 'Nàng đến rồi.';
  htGesture('gio_tay');
  await say('hoangthuong_dem', 'Hoàng thượng', open, [['Thần thiếp tham kiến Hoàng thượng', 0, 'gold']]);
  const ans = [];
  for (const q of d.qs) ans.push(await say('hoangthuong_dem', 'Hoàng thượng', esc(q.q), q.opts.map((o, i) => [esc(o), i, ''])));
  act('httalk', { ans });
});
socket.on('htTalkResult', async r => { htGesture(r.score >= 2 ? 'nam_tay' : 'dung_cho_nam'); await say('hoangthuong_dem', 'Hoàng thượng', `${esc(r.line)}<br><small>💗 Sủng ái +${r.sung}</small>`, [['Tạ ơn Hoàng thượng', 0, 'gold']]); dlgClose(); htTalking = false; });

// =====================================================================
// TIỆM NỘI VỤ PHỦ
// =====================================================================
const SHOP = { sam: ['🌿 Nhân sâm bồi bổ', '+1 lượt (mỗi ngày 1 lần)', 80], huong: ['🪷 Hương mê điệp', 'Lần lật thẻ tới dễ được chọn hơn', 120], le: ['🎁 Lễ vật tiến Thái hậu', 'Thái hậu hài lòng +8', 60] };
const DECOR_PRICE = { denlong: 60, binhsu: 80, luhuong: 100, tham: 40, giuong: 200 };
function openShop() {
  closeModal();
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🏪 Nội vụ phủ</h3><div style="color:var(--muted);font-size:13px">Bạc hiện có: <b style="color:var(--gold2)">${me.silver}</b> · thắng yến tiệc, luyện xuất sắc để có thêm bạc</div>
  <div class="shop">${Object.entries(SHOP).map(([k, [n, d, p]]) => `<div class="it"><b>${n}</b><small>${d}${k === 'huong' && me.huong ? ' · <i>đang có</i>' : ''}</small><button data-b="${k}" ${me.silver < p ? 'disabled' : ''}>${p} bạc</button></div>`).join('')}
  ${Object.entries(DECOR_PRICE).map(([k, p]) => `<div class="it"><b>🏮 ${DECOR[k].name}</b><small>Đồ bài trí phòng</small>${me.decorOwned?.includes(k) ? '<button disabled>Đã có</button>' : `<button data-b="${k}" ${me.silver < p ? 'disabled' : ''}>${p} bạc</button>`}</div>`).join('')}</div>`);
  $('mcard').querySelectorAll('[data-b]').forEach(b => b.onclick = () => { act('shop', { item: b.dataset.b }); setTimeout(openShop, 500); });
}

// =====================================================================
// GHẾ NGỒI (đình Ngự hoa viên, yến tiệc)
// =====================================================================
let chairSeat = null, taiOn = false;
function seatPose(c, st) {
  const r = c.root; r.rotation.y = st.ry;
  if (st.kind === 'floor') { kneelOn(c, st.x, st.top, st.z, st.ry); return; }
  r.position.set(st.x, 0, st.z); r.updateMatrixWorld(true); const sp = seatPlacement(c);
  r.position.x += st.x - sp.x; r.position.z += st.z - sp.z; r.position.y = st.top - sp.y; c.play('ngoi');
}
function sitSelfAt(id) { const st = world?.seats?.find(x => x.id === id); if (!st || !selfC) return; selfC.target = null; chairSeat = st; seatPose(selfC, st); }
socket.on('sitOk', d => { sitSelfAt(d.seat); });
function standChair() { if (!chairSeat || !selfC) return; const st = chairSeat; chairSeat = null; const r = selfC.root; const bx = st.x - Math.sin(st.ry) * .45, bz = st.z - Math.cos(st.ry) * .45; r.position.set(bx, world.floorAt ? world.floorAt(bx, bz) : 0, bz); selfC.pose = null; selfC.play('dung_cho'); socket.emit('stand'); sendMove('dung_cho'); }
// hiển thị động tác của người khác (ngồi ghế, biểu diễn)
function applyAnim(o, anim, once) {
  const c = o.c; if (!c) return;
  if (o.taiK && !String(anim).startsWith('tai:')) { taiEnd(c); o.taiK = null; c.root.position.set(o.tx, world?.floorAt ? world.floorAt(o.tx, o.tz) : 0, o.tz); }
  if (String(anim).startsWith('sit:')) { const st = world?.seats?.find(x => x.id === anim.slice(4)); if (st) { o.seated = st; seatPose(c, st); return; } }
  if (o.seated) { o.seated = null; c.pose = null; c.root.position.set(o.tx, world?.floorAt ? world.floorAt(o.tx, o.tz) : 0, o.tz); c.root.rotation.y = o.try; }
  if (String(anim).startsWith('tai:')) { o.taiK = anim.slice(4); c.root.position.set(o.tx, 0, o.tz); c.root.rotation.y = o.try; taiStart(c, o.taiK); return; }
  c.play(anim, { restart: once });
}
// =====================================================================
// ĐẠO CỤ BIỂU DIỄN
// =====================================================================
function taiStart(c, tai) {
  taiEnd(c); if (c === selfC) taiOn = true;
  const r = c.root, P = r.position.clone(), ry = r.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
  c._taiHome = { x: P.x, z: P.z, y: P.y, ry };
  if (tai === 'đàn') {
    const g = new THREE.Group(); world.group.add(g); c._taiProp = g;
    const stool = DECOR.ghedon.make(); stool.position.set(P.x, P.y, P.z); stool.scale.y = .95; g.add(stool);
    seatPose(c, { x: P.x, z: P.z, ry, top: P.y + .38, kind: 'chair' });
    c.update(.05); c.root.updateMatrixWorld(true);
    const kn = new THREE.Vector3(); c.B.kneeL.getWorldPosition(kn); const kr = new THREE.Vector3(); c.B.kneeR.getWorldPosition(kr); kn.add(kr).multiplyScalar(.5);
    const zh = makeGuzheng(); zh.position.set(P.x + fx * .3, kn.y + .04, P.z + fz * .3); zh.rotation.y = ry + .1; g.add(zh);
    c.post = (cc, t) => { // tay gảy dây
      aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.25, -.55, .75])); aim(cc.root, cc.B.lFore, cc.B.lHand, v3([-.35 + Math.sin(t * 7) * .12, -.2, .9]));
      aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.25, -.55, .75])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([.35 + Math.sin(t * 9 + 1) * .15, -.2, .9]));
    };
  } else if (tai === 'múa') {
    c.play('mua', { restart: true });
    const fan = makeFan(); world.group.add(fan); c._taiProp = fan;
    const hp = new THREE.Vector3(), q = new THREE.Quaternion();
    c.post = (cc, t) => { cc.B.rHand.getWorldPosition(hp); cc.B.rHand.getWorldQuaternion(q); fan.position.copy(hp); fan.quaternion.copy(q); fan.rotateX(-Math.PI / 2); fan.rotateZ(Math.PI / 2 + Math.sin(t * 3) * .3); fan.translateY(.02); };
  } else {
    c.play('dung_cho'); c.pose = 'doc_chi';
    const sc = makeScroll(); world.group.add(sc); c._taiProp = sc;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    c.post = (cc) => { cc.B.lHand.getWorldPosition(a); cc.B.rHand.getWorldPosition(b); sc.position.copy(a).add(b).multiplyScalar(.5); sc.position.y += .06; sc.rotation.set(-.5, cc.root.rotation.y + Math.PI, 0, 'YXZ'); sc.position.x += Math.sin(cc.root.rotation.y) * .04; sc.position.z += Math.cos(cc.root.rotation.y) * .04; };
  }
}
function taiEnd(c) {
  if (c === selfC) taiOn = false;
  if (c._taiProp) { c._taiProp.parent?.remove(c._taiProp); c._taiProp = null; }
  c.post = null; c.pose = null;
  if (c._taiHome) { const h = c._taiHome; c._taiHome = null; c.root.position.set(h.x, h.y, h.z); c.root.rotation.y = h.ry; c.play('dung_cho'); }
}
// thơ Đường (Hán Việt) chạy trên màn hình khi ngâm thơ
const POEMS = [
  ['Tĩnh dạ tứ · Lý Bạch', ['Sàng tiền minh nguyệt quang', 'Nghi thị địa thượng sương', 'Cử đầu vọng minh nguyệt', 'Đê đầu tư cố hương']],
  ['Xuân hiểu · Mạnh Hạo Nhiên', ['Xuân miên bất giác hiểu', 'Xứ xứ văn đề điểu', 'Dạ lai phong vũ thanh', 'Hoa lạc tri đa thiểu']],
  ['Phong Kiều dạ bạc · Trương Kế', ['Nguyệt lạc ô đề sương mãn thiên', 'Giang phong ngư hỏa đối sầu miên', 'Cô Tô thành ngoại Hàn San tự', 'Dạ bán chung thanh đáo khách thuyền']],
  ['Lộc sài · Vương Duy', ['Không sơn bất kiến nhân', 'Đãn văn nhân ngữ hưởng', 'Phản cảnh nhập thâm lâm', 'Phục chiếu thanh đài thượng']],
  ['Đăng Quán Tước lâu · Vương Chi Hoán', ['Bạch nhật y sơn tận', 'Hoàng Hà nhập hải lưu', 'Dục cùng thiên lý mục', 'Cánh thượng nhất tầng lâu']],
];
const poemEl = document.createElement('div'); poemEl.id = 'poem'; poemEl.className = 'hidden'; document.body.appendChild(poemEl);
let poemN = 0;
function poemShow() { const [t, lines] = POEMS[Math.floor(Math.random() * POEMS.length)]; poemN = 0; poemEl.innerHTML = `<div class="pt">${esc(t)}</div>${lines.map(l => `<div class="pl">${esc(l)}</div>`).join('')}`; poemEl.classList.remove('hidden'); poemStep(true); }
function poemStep(first) { if (poemEl.classList.contains('hidden')) return; if (!first) poemN++; const ls = poemEl.querySelectorAll('.pl'); ls.forEach((l, i) => l.classList.toggle('on', i <= Math.floor(poemN / 2))); }
function poemHide() { setTimeout(() => poemEl.classList.add('hidden'), 1200); }
// =====================================================================
// YẾN TIỆC: bước ra giữa biểu diễn rồi về chỗ
// =====================================================================
async function performFeast() {
  if (mgOn || !world?.stage || taiOn) return;
  if (feast?.mine) return toast('Bổn cung đã dâng tiết mục rồi.');
  const home = chairSeat; chairSeat = null; socket.emit('stand');
  const r = selfC.root; r.position.y = 0; selfC.pose = null; selfC.play('dung_cho');
  if (home) { r.position.x = home.x - Math.sin(home.ry) * .45; r.position.z = home.z - Math.cos(home.ry) * .45; }
  const walk = (x, z) => new Promise(res => { selfC.target = { x, z }; let n = 0; const iv = setInterval(() => { if (!selfC?.target || ++n > 80) { selfC && (selfC.target = null); clearInterval(iv); res(); } }, 100); });
  r.position.x = Math.sign(r.position.x || 1) * .55; r.rotation.y = Math.PI; await walk(world.stage.x, world.stage.z);
  r.rotation.y = world.stage.ry; sendMove('dung_cho');
  chooseTai(t => gameRhythm(t, q => { act('yentiec', { tai: t, q }); if (feast) feast.mine = true; renderActs();
    setTimeout(async () => { if (world?.loc === 'yentiec' && home) { await walk(Math.sign(home.x) * .55, home.z); socket.emit('sit', { seat: home.id }); } }, 1500); }));
}

// đồng hồ hồi lượt
setInterval(() => { const el = $('turnT'); if (!el || !me?.nextTurn) return; const l = me.nextTurn - Date.now(); if (l <= 0) { el.textContent = ''; me.nextTurn = null; socket.emit('refresh'); return; } el.textContent = `+1 sau ${Math.floor(l / 3600e3) ? Math.floor(l / 3600e3) + 'g' : ''}${Math.floor(l % 3600e3 / 60e3)}p`; }, 1000);

// cử chỉ của Hoàng thượng (động tác Tiên làm thêm trong Tripo)
function htGesture(name) {
  const n = world?.npcs.find(x => x.model?.startsWith('hoangthuong') && x.c && !x.sit); if (!n || seated) return;
  const a = n.c.actions[name]; if (!a) return;
  n.c.play(name, { restart: true }); clearTimeout(n._g); n._g = setTimeout(() => n.c.play('dung_cho'), Math.min(6000, a.getClip().duration * 1000));
}
// =====================================================================
// THEO DÕI NGHI PHẠM: nấp kịp lúc kẻ khả nghi ngoái lại
// =====================================================================
function clueTheoDoi() {
  if (mgOn || !clueOpen('theodoi')) return;
  if (me.turns < 1) return toast('Hết lượt hôm nay.', 'bad');
  const spy = world.spy && world.spy !== 'loading' ? world.spy : null;
  if (selfC) { selfC.target = null; selfC.play('chap_tay'); }
  let round = 0, ok = 0, k = 0, dir = 1, raf;
  mgOpen(`<div class="mgt">👀 Rình kẻ khả nghi: bấm "Nấp!" khi kim vào vùng xanh, lúc người đó sắp ngoái lại (3 lần)</div><div class="heat"><div class="ok"></div><div class="nd"></div></div><div class="mgs">Nấp kịp <b id="tdOk">0</b>/3 · <button id="tdHide" class="gold" style="padding:4px 14px">Nấp!</button></div>`);
  const zone = .25 + Math.random() * .5; mgEl.querySelector('.ok').style.left = (zone - .1) * 100 + '%';
  const nd = mgEl.querySelector('.nd'), heat = mgEl.querySelector('.heat');
  const loop = () => { k += dir * .02 * (1 + round * .4); if (k > 1) { k = 1; dir = -1; } if (k < 0) { k = 0; dir = 1; } nd.style.left = k * 100 + '%'; raf = requestAnimationFrame(loop); };
  const tap = () => { round++; const hit = Math.abs(k - zone) < .1; if (hit) ok++; heat.classList.add(hit ? 'good' : 'bad'); setTimeout(() => heat.classList.remove('good', 'bad'), 220); $('tdOk').textContent = ok;
    if (spy) { spy.root.rotation.y += Math.PI; setTimeout(() => spy.root.rotation.y -= Math.PI, 500); }
    if (round >= 3) { cancelAnimationFrame(raf); removeEventListener('keydown', key); const success = ok >= 2;
      setTimeout(async () => { mgClose(); if (!success) { socket.emit('case', { caseId: nb.id, op: 'clue', kind: 'theodoi', fail: true }); if (selfC) selfC.play('dung_cho'); return; }
        const f = await getClue('theodoi'); if (selfC) selfC.play('dung_cho'); if (f) { await say(spy ? 'cungnu' : 'cungnu', 'Nghe lén được', `Kẻ khả nghi thì thầm với đồng bọn: <i>“${esc(f.text)}”</i><br><small>📒 Đã ghi vào sổ điều tra.</small>`, [['Ghi nhớ', 0, 'gold']]); dlgClose(); } }, 700); } };
  const key = e => { if (e.code === 'Space') { e.preventDefault(); tap(); } };
  addEventListener('keydown', key); $('tdHide').onclick = tap; heat.onpointerdown = tap; raf = requestAnimationFrame(loop);
}
// =====================================================================
// DỌN SANG CUNG MỚI (khi lên Tần)
// =====================================================================
async function runDonCung(d) {
  const S = await stageBegin('phong');
  const o = S.o, D = o.roomSize.D, W = o.roomSize.W;
  const me3 = await stageChar(S, me.outfit, 0, D / 2 - .4, Math.PI, 'dung_cho');
  const m1 = await stageChar(S, 'cungnu', -.75, D / 2 - 1.6, Math.PI / 2, 'chap_tay');
  const m2 = await stageChar(S, 'cungnu', .75, D / 2 - 1.6, -Math.PI / 2, 'chap_tay');
  const tg = await stageChar(S, 'thaigiam', 1.2, -D / 2 + 1.4, -.6, 'dung_cho');
  camera.position.set(0, 1.5, -D / 2 + 1.0); camera.lookAt(0, .7, D / 2 - 1.5); camera.userData.look = new THREE.Vector3(0, .7, D / 2 - 1.5);
  await fade(false);
  showBar('Cung nữ', `Cung nghênh nương nương dọn về cung mới!`);
  m1.play('cui_chao'); m2.play('cui_chao');
  await walkTo(S, me3, 0, 0, 3.2);
  me3.root.rotation.y = 0; tg.play('cui_chao');
  await camTo(new THREE.Vector3(1.6, 1.2, 1.4), new THREE.Vector3(0, .7, -.5), 1.4);
  showBar('Tổng quản thái giám', `Từ nay nơi này là cung riêng của ${esc(d.rankName)} ${esc(d.name)}. Nội vụ phủ đã chuẩn bị đầy đủ, nương nương cứ tùy ý bài trí.`,
    [['Vào cung', async () => { await stageEnd(S, true); socket.emit('goto', 'phong'); }, 'gold']]);
}

// =====================================================================
// THÔNG BÁO SỰ KIỆN SẮP DIỄN RA (hiện trước 15 phút, mất khi tới giờ)
// =====================================================================
let sched = null; const noticeEl = document.createElement('div'); noticeEl.id = 'notice'; noticeEl.className = 'hidden'; document.body.appendChild(noticeEl);
const announced = new Set();
socket.on('schedule', d => { sched = d; tickNotice(); });
function tickNotice() {
  if (!sched || !me) { noticeEl.classList.add('hidden'); return; }
  const tz = (sched.tz ?? 7) * 3600e3, nowVN = Date.now() + tz, dayStart = Math.floor(nowVN / 864e5) * 864e5;
  const ev = [];
  for (const [h, m, when] of sched.latThe) ev.push({ t: dayStart + (h * 60 + m) * 60e3, icon: '🏮', text: `${when} Hoàng thượng lật thẻ bài`, hint: me.lanh ? '' : 'Mặc đúng màu áo người thích, dâng hương mê điệp để dễ được chọn' });
  for (const [h, m, venue] of sched.feast) ev.push({ t: dayStart + (h * 60 + m) * 60e3, icon: '🎎', text: `Yến tiệc ${venue === 'in' ? 'trong điện' : 'ngoài trời'}`, hint: 'Chuẩn bị tiết mục đàn, múa hoặc thơ' });
  const lead = (sched.lead || 15) * 60e3;
  const up = ev.filter(e => e.t > nowVN && e.t - nowVN <= lead).sort((a, b) => a.t - b.t);
  if (!up.length || stage) { noticeEl.classList.add('hidden'); return; }
  noticeEl.classList.remove('hidden');
  noticeEl.innerHTML = up.map(e => { const l = e.t - nowVN, hh = new Date(e.t).toISOString().slice(11, 16);
    const key = e.text + e.t; if (!announced.has(key)) { announced.add(key); try { music.gong(); } catch {} }
    return `<div class="nt"><span class="ic">${e.icon}</span><div><b>${esc(e.text)}</b> lúc ${hh} · còn <b class="cd">${Math.floor(l / 60e3)}:${String(Math.floor(l % 60e3 / 1000)).padStart(2, '0')}</b>${e.hint ? `<small>${esc(e.hint)}</small>` : ''}</div></div>`; }).join('');
}
setInterval(tickNotice, 1000);
