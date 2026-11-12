// MỘNG PHƯỢNG HOÀNG – phía người chơi
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildLocation, DECOR, makeGuzheng, makeFan, makeScroll, makeSword, makeCup, makeRibbon, makeCleaver, makeLadle } from './scenes.js';
import { makeIngredient, makeDish } from './food.js';
import * as GOL from './go.js';
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
function makeLabel(name, rank, npc, onClick, tt) {
  const d = document.createElement('div'); d.className = 'label' + (npc ? ' npc' : '');
  d.innerHTML = `<div class="bbl"></div><div class="tt">${tt ? '「' + esc(tt) + '」' : ''}</div>${esc(name)}${rank ? `<br><span class="r ${rankTier(rank)}">${rankTier(rank) === 't3' ? '★ ' : ''}${esc(rank)}</span>` : ''}`;
  if (onClick) { d.style.pointerEvents = 'auto'; d.style.cursor = 'pointer'; d.title = 'Bấm để nói chuyện'; d.onclick = e => { e.stopPropagation(); onClick(); }; }
  const o = new CSS2DObject(d); o.position.set(0, 1.12, 0); return o;
}
function myTitle() { return me?.ach?.find(a => a.id === me.titleSel && a.got)?.name || ''; }
socket.on('ptitle', d => { const o = others.get(d.id); const el = o?.c?.label?.element.querySelector('.tt'); if (el) el.textContent = d.tt ? '「' + d.tt + '」' : ''; });
function bubble(label, text) {
  const b = label.element.querySelector('.bbl'); if (!b) return;
  b.className = 'bbl bubble'; b.textContent = text; clearTimeout(b._t); b._t = setTimeout(() => { b.className = 'bbl'; b.textContent = ''; }, 5000);
}

function clearWorld() {
  feastHT = null; FX.length = 0; showChars.forEach(c => c.dispose?.()); showChars.length = 0; reactHide();
  if (!world) return;
  scene.remove(world.group);
  for (const n of world.npcs) if (n.c) { n.c.dispose(); }
  for (const [, o] of others) o.c?.dispose();
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
  const H = loc === 'phong' && sceneHost ? sceneHost : null, hName = H ? H.name : me?.name || '';
  const o = buildLocation(loc, { palace: H ? H.palace : me?.hasPalace, palaceName: hName.split(' ').pop() + ' cung', venue });
  if (H && H.id !== me.id) o.decorable = false;
  // phi tần NPC có mặt
  const FS = { hoavien: [[1.6, 1.4, 2.6], [2.6, -.4, -2], [-.8, 2.6, 3], [.6, -2.2, .4], [3.2, 2.2, -2.4], [-1.6, 4, 2.2]], tuninh: [[-1.6, 2.4, 2.4], [1.6, 2.4, -2.4], [-2.4, 1.6, 1.6], [2.4, 1.4, -1.6], [-1, 3.2, 3], [1, 3.2, -3]] };
  if (FS[loc]) sceneFei.forEach((f, i) => { const sp = FS[loc][i % FS[loc].length]; o.npcs.push({ model: f.model, x: sp[0], z: sp[1], ry: sp[2], name: '🎭 ' + f.name, talk: 'fei:' + f.id }); });
  if (loc === 'yentiec') { let k = 0; for (const n of o.npcs) { if (n.model === 'hoangthuong' || n.sit) continue; const f = sceneFei[k++]; if (!f) break; n.name = '🎭 ' + f.name; n.model = f.model; n.talk = 'fei:' + f.id; } }
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
  if (o.steamAt) startSteam(o);
  camDist = o.cam.dist; camH = o.cam.height; camYaw = 0;
  if (selfC) selfC.root.rotation.x = 0; lying = false;
  if (loc === 'phong') { renderDecor(H ? H.decor : me.decor); roomSeats(o); }
  // bản thân
  const sp = clampPos(o.spawn.x + (Math.random() - .5) * 1.4, o.spawn.z + (Math.random() - .5) * .6);
  await respawnSelf(sp.x, sp.z, Math.PI);
  if (tok !== loadToken) return;
  if (seatId) sitSelfAt(seatId); else sendMove('dung_cho');
  if (sceneLying && o.myBed) { lying = true; lieOn(selfC); }
  if (!window._updChk) { window._updChk = 1; setTimeout(() => showUpdate(), 3000); }
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
  c.label = makeLabel(me.name, me.rankName, false, null, myTitle()); c.root.add(c.label);
  c.target = null; c.outfit = me.outfit;
}
async function addOther(p) {
  if (others.has(p.id) || !world) return;
  const holder = { p, c: null, tx: p.x, tz: p.z, try: p.ry };
  others.set(p.id, holder);
  const c = await spawn(p.outfit);
  if (others.get(p.id) !== holder || !world) return c.dispose();
  holder.c = c; c.root.position.set(p.x, 0, p.z); c.root.rotation.y = p.ry; world.group.add(c.root);
  c.label = makeLabel(p.name, p.rankName, false, null, p.tt); c.root.add(c.label);
  applyAnim(holder, p.anim || 'dung_cho', false);
}
function removeOther(id) { const o = others.get(id); if (!o) return; if (o.c) { o.c.root.remove(o.c.label); o.c.label.element.remove(); o.c.dispose(); } others.delete(id); }

// ---------------- di chuyển ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null;
canvas.addEventListener('pointerdown', e => { if (specCam?.loc !== 'ngutien') specCam = null; drag = { x: e.clientX, y: e.clientY, yaw: camYaw, moved: false }; });
addEventListener('pointermove', e => { if (!drag || specCam?.loc === 'ngutien') return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; camYaw = drag.yaw - dx * 0.006; });
addEventListener('pointerup', e => { const d = drag; drag = null; if (!d || d.moved || e.target !== canvas) return; clickWorld(e); });
canvas.addEventListener('wheel', e => { camDist = Math.min(7, Math.max(1.4, camDist + e.deltaY * 0.002)); }, { passive: true });
function clickWorld(e) {
  if (!world || !selfC || cutActive) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (decor.on) return decorClick();
  if (world.bed && ray.intersectObject(world.bed, true).length) return openBed();
  if (world.brazier && ray.intersectObject(world.brazier, true).length) return clueTro();
  if (cookTarget && ray.intersectObject(cookTarget.g, true).length) return cookTarget.fn();
  if (taiOn) return;
  if (world.myBed && !lying && ray.intersectObject(world.myBed.obj, true).length) return openMyBed();
  if (world.kangs?.length && !lying) { const K = world.kangs.find(k => ray.intersectObject(k.obj, true).length); if (K) return openKang(K); }
  if (lying) return getUp();
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
  if (chairSeat || taiOn || lying) return;
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
let specCam = null; // camera khán giả: nhìn sân khấu yến tiệc
function watchStage(z, ms) { if (world?.loc !== 'yentiec' || taiOn || dancing || mgOn) return; specCam = { loc: 'yentiec', pos: new THREE.Vector3(.4, 2.05, z + 4.4), look: new THREE.Vector3(0, .95, z), until: Date.now() + ms }; }
function kitchenCam(on) { for (const o of world?.overhead || []) o.visible = !on; specCam = on ? { loc: 'ngutien', pos: new THREE.Vector3(0, 6.6, 5.2), look: new THREE.Vector3(0, .3, -.7), until: Date.now() + 36e5 } : null; }
const FX = []; // hiệu ứng: hàm(dt) trả false khi xong
const clock = new THREE.Clock(); let T = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); T += dt;
  if (gateSpin) { camera.position.set(Math.sin(T * .08) * 5, 1.9, -2 + Math.cos(T * .08) * 5); camera.lookAt(0, .9, -2.5); }
  if (world) {
    stepSelf(dt);
    for (const n of world.npcs) if (n.c) n.c.update(dt);
    for (const [, o] of others) if (o.c && o.seated) o.c.update(dt); else if (o.c) { const r = o.c.root; r.position.y = world.floorAt ? world.floorAt(r.position.x, r.position.z) : 0; r.position.x += (o.tx - r.position.x) * Math.min(1, dt * 8); r.position.z += (o.tz - r.position.z) * Math.min(1, dt * 8); let diff = o.try - r.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); r.rotation.y += diff * Math.min(1, dt * 8); o.c.update(dt); }
    if (selfC) selfC.update(dt);
    for (let i = FX.length; i--;) if (FX[i](dt) === false) FX.splice(i, 1);
    if (world.flicker) for (const L of world.flicker) L.intensity = 2 + Math.sin(T * 9 + L.id) * .25 + Math.random() * .2;
    if (stage) stage.update(dt);
    else if (specCam && Date.now() < specCam.until && world.loc === specCam.loc) {  camera.position.lerp(specCam.pos, Math.min(1, dt * 3)); camera.lookAt(specCam.look); }
    else if (selfC && !gateSpin) {
      let p = selfC.root.position;
      if (seated?.ht?.c) { p = p.clone().add(seated.ht.c.root.position).multiplyScalar(.5); p.y = 0; }
      const want = new THREE.Vector3(p.x + Math.sin(camYaw) * camDist, camH, p.z + Math.cos(camYaw) * camDist);
      if (['phong', 'tamcung', 'lanhcung', 'ngutien'].includes(world.loc)) { const b = world.bounds, m = .3; want.x = Math.min(b.maxX + m, Math.max(b.minX - m, want.x)); want.z = Math.min(b.maxZ + m, Math.max(b.minZ - m, want.z)); }
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
  const g = document.createElement('button'); g.id = 'guidebtn'; g.innerHTML = '📖<span class="lbl"> Hướng dẫn</span>'; g.onclick = openGuide; document.body.appendChild(g);
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
  if (selfC) { const tt = selfC.label.element.querySelector('.tt'); if (tt) tt.textContent = myTitle() ? '「' + myTitle() + '」' : ''; }
  if (selfC) { const r = selfC.label.element.querySelector('.r'); if (r) { const t = rankTier(me.rankName); r.className = 'r ' + t; r.textContent = (t === 't3' ? '★ ' : '') + me.rankName; } }
  if (!caseOpenId && me.cases?.length && !me.lanh) { caseOpenId = me.cases[0].id; nbMin = true; }
  if (caseOpenId) socket.emit('caseDetail', caseOpenId);
});
let sceneHost = null, sceneLying = false, sceneFei = [];
socket.on('scene', async d => { pendingScene = d; sceneHost = d.host || null; sceneLying = !!d.lying; sceneFei = d.fei || []; if (!stage) { await enterScene(d.loc, d.players, d.venue, d.seat); pendingScene = null; setTimeout(() => startTour(), 1200); } });
let pendingScene = null;
socket.on('pjoin', p => addOther(p));
socket.on('pleave', id => removeOther(id));
socket.on('pmove', d => { const o = others.get(d.id); if (!o) return; o.tx = d.x; o.tz = d.z; o.try = d.ry; o.p.x = d.x; o.p.z = d.z; if (o.c) applyAnim(o, d.anim, !!d.once); });
socket.on('poutfit', async d => { const o = others.get(d.id); if (!o) return; o.p.outfit = d.outfit; const p = { ...o.p, x: o.tx, z: o.tz, ry: o.try }; removeOther(d.id); addOther(p); });
socket.on('chat', m => {
  const log = $('chatlog'); const div = document.createElement('div'); if (m.ch === 'tm') div.className = 'tm'; div.innerHTML = `${m.ch === 'tm' ? '<i>[Tỷ muội]</i> ' : ''}<b>${esc(m.name)}:</b> ${esc(m.text)}`; log.appendChild(div); log.scrollTop = 1e6;
  if (m.ch === 'tm' && m.id !== me?.id) return;
  const who = m.id === me?.id ? selfC : others.get(m.id)?.c; if (who?.label) bubble(who.label, m.text);
});
let chatCh = 'all';
$('chatin').addEventListener('keydown', e => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value; socket.emit('chat', chatCh === 'tm' && !v.startsWith('/') ? { text: v, ch: 'tm' } : v); e.target.value = ''; } e.stopPropagation(); });
socket.on('newsAll', list => { $('newslist').innerHTML = ''; list.slice().reverse().forEach(addNews); });
socket.on('news', n => { addNews(n); if (['phong', 'latthe', 'an', 'latan', 'phat'].includes(n.kind)) toast('📜 ' + n.text); });
function addNews(n) { const d = document.createElement('div'); d.className = 'n'; d.innerHTML = `<time>${new Date(n.t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</time>${esc(n.text)}`; $('newslist').prepend(d); }
$('newsbtn').onclick = () => $('news').classList.toggle('hidden');
socket.on('toast', t => toast(t.text, t.kind));
socket.on('npcSay', d => { const n = world?.npcs.find(x => x.name === d.who); if (d.long) { say(n?.model || 'aongu', d.who, esc(d.text), [['Đa tạ', 0, 'gold']]).then(dlgClose); return; } if (n?.label) bubble(n.label, d.text); else toast(`${d.who}: ${d.text}`); });
function toast(text, kind = 'info') {
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text;
  const long = /🎁|🏮|lật thẻ/.test(text);
  if (long) { d.classList.add('sticky'); const x = document.createElement('button'); x.className = 'tx'; x.textContent = '✕'; x.title = 'Đóng'; x.onclick = () => d.remove(); d.appendChild(x); }
  $('toasts').appendChild(d); setTimeout(() => d.remove(), long ? 5 * 60e3 : 5200);
}

// ---------------- HUD, bản đồ, hành động ----------------
function renderHud() {
  if (!me) return;
  $('hName').textContent = me.name; $('hRank').textContent = `${me.rankName} · ${me.pathName}${me.waiting ? ' · chờ ghế' : ''}`;
  const lo = me.nextPts ? (me.pts / me.nextPts) : 1; $('hBar').style.width = Math.min(100, lo * 100) + '%';
  $('hPts').textContent = me.nextPts ? `Công trạng ${me.pts}/${me.nextPts}` : `Công trạng ${me.pts}`;
  let qd = $('hQuest'); if (!qd) { qd = document.createElement('div'); qd.id = 'hQuest'; $('who').appendChild(qd); }
  qd.innerHTML = me.quest ? `🎯 <b>${me.quest.i + 1}/${me.quest.n}</b> ${esc(me.quest.t)}${me.quest.need > 1 && me.quest.need < 50 && !/^Lên/.test(me.quest.t) ? ` (${me.quest.cur}/${me.quest.need})` : ''}` : ''; qd.style.display = me.quest ? '' : 'none';
  const t = me.tasks || {};
  $('stats').innerHTML = `<span class="pill">💰 Bạc <b>${me.silver}</b></span><span class="pill" title="Cứ 30 phút hồi 1 lượt (tối đa ${me.turnCap}). Làm đủ 3 nhiệm vụ ngày, dự yến tiệc, được lật thẻ cũng được thêm lượt.">⏳ Lượt <b>${me.turns}</b>${me.nextTurn ? ` <small id="turnT" style="opacity:.75"></small>` : ''}</span><span class="pill">💗 Sủng ái <b>${me.sung}</b></span><span class="pill">🍵 Thái hậu <b>${me.haiLong}</b></span><span class="pill" title="Nhiệm vụ ngày: thỉnh an, luyện tài nghệ, dò tin. Làm đủ 3 được thêm lượt và công trạng.">📋 ${t.thinhan ? '✅' : '⬜'}${t.luyen ? '✅' : '⬜'}${t.dotin ? '✅' : '⬜'}</span>${me.camTuc ? `<span class="pill" style="border-color:#c0503a">🔒 Cấm túc còn ${Math.max(1, Math.ceil((me.camTuc - Date.now()) / 3600e3))} giờ</span>` : ''}${me.thai ? `<span class="pill" style="border-color:#f3a6c8" title="Mỗi ngày uống thuốc an thai ở chỗ Thái y (Từ Ninh cung). Uống đủ 2 ngày trở lên thì sinh thuận.">🤰 Long thai · còn ${Math.max(0, Math.ceil((me.thai.due - Date.now()) / 3600e3))} giờ · an thai ${me.thai.antai ? '✅' : '⬜'}</span>` : ''}${me.isHH ? '<button class="pill" id="hhBtn" style="border-color:#e8c25a">👑 Hoàng hậu</button>' : ''}${me.hhVote ? `<button class="pill" id="voteBtn" style="border-color:#e8c25a">👑 Bầu phượng ấn · còn ${Math.max(1, Math.ceil((me.hhVote.end - Date.now()) / 3600e3))} giờ</button>` : ''}${me.big ? `<button class="pill" id="bigBtn" style="border-color:#c0503a">📜 Đại án${me.big.done ? ' · kết quả' : ` · ${me.big.mine.length} manh mối`}</button>` : ''}${me.fest && !me.fest.done ? `<button class="pill" id="festBtn" style="border-color:#e8c25a">🏮 Đại lễ <b id="festPct">${Math.min(100, Math.floor(me.fest.pts / me.fest.goal * 100))}%</b></button>` : ''}<button class="pill" id="todayBtn">🗓 Hôm nay</button>${htPill()}${feast ? `<span class="pill feast">🎎 Yến tiệc · <b id="feastT"></b> · ${feast.n} tiết mục</span>` : ''}${me.cases.length ? `<button class="pill" id="caseBtn" style="border-color:#c0503a">${me.cases[0].det ? '🔍 Đang tra án' : '⚖️ Vụ án đang mở'}${me.cases.length > 1 ? ` (${me.cases.length})` : ''}</button>` : ''}`;
  const cb = $('caseBtn'); if (cb) cb.onclick = () => openCase(me.cases[0].id);
  const tb = $('todayBtn'); if (tb) tb.onclick = openToday; const bb = $('bigBtn'); if (bb) bb.onclick = openBig; const fb = $('festBtn'); if (fb) fb.onclick = openFest;
  const hb = $('hhBtn'); if (hb) hb.onclick = openHH; const vb = $('voteBtn'); if (vb) vb.onclick = openVote;
}
const LOCNAMES = { yentiec: '🎎 Yến tiệc', hoavien: 'Ngự hoa viên', tuninh: 'Từ Ninh cung', duongtam: 'Dưỡng Tâm điện', phong: 'Phòng riêng', tamcung: 'Tẩm cung', lanhcung: 'Lãnh cung', ngutien: '🍳 Ngự thiện phòng' };
function renderMap() {
  if (!me) return;
  const m = $('map'); m.innerHTML = '';
  const list = me.lanh ? ['lanhcung'] : me.camTuc ? ['phong'] : ['hoavien', 'tuninh', 'duongtam', 'phong'];
  if (latTheMe && !me.lanh) list.push('tamcung');
  if (feast && !me.lanh) list.push('yentiec');
  if (!me.lanh && !me.camTuc && me.rank >= 4) list.splice(3, 0, 'ngutien');
  for (const l of list) { const b = document.createElement('button'); b.textContent = l === 'phong' && me.hasPalace ? 'Cung riêng' : LOCNAMES[l]; b.classList.toggle('on', world?.loc === l); b.onclick = () => socket.emit('goto', l); m.appendChild(b); }
}
function act(type, extra = {}) { socket.emit('action', { type, ...extra }); }
function renderActs() {
  if (!me || !world) return;
  const a = $('acts'); a.innerHTML = `<div class="ttl">${LOCNAMES[world.loc] || ''}</div>`;
  const add = (label, sub, fn, dis) => { const b = document.createElement('button'); b.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`; b.onclick = fn; if (dis) b.disabled = true; a.appendChild(b); };
  const L = world.loc;
  if (L === 'tuninh' && !me.lanh) add('🔍 Tra án giúp Quế ma ma', me.detDay ? 'Hôm nay đã nhận · mai quay lại' : 'Mỗi ngày 1 vụ · phá đúng được 20 công trạng, 50 bạc · sai không bị phạt', () => socket.emit('npc', { npc: 'mama', op: 'tran' }), me.detDay || me.cases?.length);
  if (L === 'tuninh') { add('🙇 Thỉnh an Thái hậu', me.thinhAn ? 'Hôm nay đã thỉnh an' : 'Miễn phí, mỗi ngày 1 lần · trả lời khéo được thêm điểm', thinhAn, me.thinhAn); if (me.group) for (const m of me.group.members) if (m.id !== me.id && (m.lanh || m.camTuc)) add(`🙏 Cầu tình cho ${esc(m.name)}`, `1 lượt · 50 bạc · ${m.lanh ? 'giúp tiến độ phục vị' : 'giảm 8 giờ cấm túc'}`, () => socket.emit('sis', { op: 'cautinh', who: m.id })); }
  if (L === 'duongtam' && me.goldFish > 0) add(`🐟 Dâng cá chép vàng (${me.goldFish})`, 'Điềm lành · sủng ái +10', () => { emote('cui_chao'); act('dangca'); });
  if (L === 'duongtam' && me.dish) add(`🍽 Dâng ${me.dish.name} tự tay nấu`, Date.now() - me.dish.t > 2 * 3600e3 ? 'Đã nguội · sủng ái giảm nhiều' : `Còn nóng · ${me.dish.q > .85 ? 'tuyệt hảo' : me.dish.q > .6 ? 'ngon' : 'hơi vụng'}`, () => { emote('cui_chao'); act('dangmon'); });
  if (L === 'ngutien') { if (me.dish) add(`🍽 ${me.dish.name} đã xong`, 'Mang lên Dưỡng Tâm điện dâng Hoàng thượng', () => socket.emit('goto', 'duongtam')); else add('📖 Bí kíp nhà bếp · nấu món', `1 lượt · 40 bạc · còn ${3 - (me.cookN || 0)} lần hôm nay`, () => openBiKip(), cooking); }
  if (L === 'duongtam') add('🍲 Dâng canh Hoàng thượng', '1 lượt · 30 bạc · nấu đúng món người thèm được sủng nhiều', gameCanh);
  if (L === 'yentiec') { if (!feast?.mine) add('🎎 Dâng tiết mục', 'Đàn, múa quạt, múa lụa, kiếm vũ, ngâm thơ, hát', performFeast); add('🍶 Kính rượu', 'Kính Hoàng thượng hoặc các tỷ muội trong tiệc', openRuou); add('💃 Ra múa cùng mọi người', 'Đủ người cùng múa thì Hoàng thượng thưởng', danceTogether); add('🍶 Tửu lệnh', 'Mỗi 4 phút một câu: gõ vế sau thành ngữ vào chat, ai nhanh nhất thắng', () => toast('Chờ Tửu lệnh hiện ở trên màn hình rồi gõ đáp án vào ô chat.')); add('🚪 Rời yến tiệc', '', () => socket.emit('goto', 'hoavien')); }
  if (L === 'hoavien') { if (feast) add('🎎 Dự yến tiệc', 'Đang có yến tiệc, vào ngồi cùng mọi người', () => socket.emit('goto', 'yentiec')); add('🎣 Câu cá ở hồ', `Miễn phí · cá bán lấy bạc${me.fishN >= 15 ? ' (hôm nay đã bán đủ)' : ''}, hiếm khi gặp cá chép vàng`, gameFish); add('👂 Dò tin', '1 lượt · nghe sở thích Hoàng thượng, chuyện trong cung', () => act('dotin')); add('🎐 Luyện tài nghệ', '1 lượt · chơi càng hay càng nhiều điểm', () => chooseTai(t => gameRhythm(t, q => act('luyen', { tai: t, q })))); }
  if (L === 'phong') { add('🎐 Luyện tài nghệ', '1 lượt · chơi càng hay càng nhiều điểm', () => chooseTai(t => gameRhythm(t, q => act('luyen', { tai: t, q })))); add('🎁 Ban thưởng cung nữ', `20 bạc · trung thành ${me.loyal ?? 50}/100 · mỗi ngày 1 lần`, () => act('thuongcn')); add('👘 Thay trang phục', '', openWardrobe); add('🏮 Bài trí ' + (me.hasPalace ? 'cung' : 'phòng'), 'Đặt, xoay đồ nội thất', openDecor); }
  if (L === 'phong' && !me.visit && me.rank >= 6 && !me.lanh) { const cc = me.ccDay || {};
    add('📒 Hiệp lý lục cung', cc.so ? 'Hôm nay đã duyệt sổ' : 'Duyệt sổ chi tiêu, tìm khoản khai khống · mỗi ngày 1 lần', () => socket.emit('caocap', { op: 'so' }), cc.so);
    add('📚 Dạy dỗ người mới', cc.day ? 'Hôm nay đã dạy' : 'Chỉ bảo một người từ Thường tại trở xuống (họ +15 công trạng)', openDay, cc.day);
    add('🎎 Thiết yến', me.ccFeastOk ? '150 bạc · 15 phút · mỗi tiết mục +4 công trạng cho chủ tiệc' : 'Mỗi 2 ngày một lần', () => socket.emit('caocap', { op: 'yentiec' }), !me.ccFeastOk); }
  if (L === 'phong') { if (!me.visit) { add('🍵 Mời bạn bè thưởng trà', 'Mời sang cung riêng, ngồi đôn uống trà', inviteTra); add('🫖 Pha trà mời khách', 'Khách mới đến được +5 công trạng (mỗi người 1 lần/ngày)', () => socket.emit('tra', { op: 'serve' })); } else add('🚪 Cáo từ về cung', '', () => socket.emit('goto', 'phong'));
    if (world?.myBed && !me.visit) add(lying ? '🧍 Ngồi dậy' : '🛏 Lên giường', lying ? (me.selfSick ? 'Ngồi dậy là khỏi bệnh' : '') : 'Ngồi mép giường · nằm nghỉ · cáo bệnh', lying ? getUp : openMyBed); }
  if (L === 'tamcung') { const N = me.night || {};
    if (!me.htTalked) add('💬 Hầu chuyện Hoàng thượng', 'Nghe tâm sự, chọn lời an ủi', startHtTalk);
    add('🛏 Lên giường', 'Ngồi cùng Hoàng thượng', openBed);
    add('🗣 Gối đầu tâu chuyện', N.tau ? 'Đêm nay đã tâu' : me.htTalked ? 'Tiến cử tỷ muội · xin tha người lãnh cung · nói xấu đối thủ' : 'Hầu chuyện xong mới tâu được', openTau, N.tau || !me.htTalked);
    add('🌙 Ngắm trăng đối thơ', N.tho ? 'Đêm nay đã đối thơ' : 'Hoàng thượng đọc câu trên, chọn câu dưới', gameDoiTho, N.tho);
    add('🎁 Tín vật được ban', `${Object.keys(me.tinvat || {}).length}/8 món`, openTinVat);
    add('📔 Nhật ký sủng hạnh', '', openDiary);
    add('🌙 Rời tẩm cung', 'Trời sắp sáng', () => socket.emit('goto', 'phong')); }
  if (me.night && L !== 'tamcung' && !me.lanh) add('🌸 Chuẩn bị thị tẩm', me.night.prep ? `Đã chuẩn bị: ${esc(me.night.prep.text)}` : 'Tắm hoa, chọn áo ngủ, xông hương hợp tâm trạng Hoàng thượng', openPrep, !!me.night.prep);
  if (L === 'phong') { add('📔 Nhật ký sủng hạnh', `${(me.diary || []).length} trang`, openDiary); add('🎁 Tín vật được ban', `${Object.keys(me.tinvat || {}).length}/8 món`, openTinVat); }
  if (L === 'lanhcung') { add('🧹 Làm việc lãnh cung', `Phục vị ${me.lanh?.tasks || 0}/3 · mỗi ngày 1 lần`, gameLanh); add('🕯 Hỏi chuyện phế phi', 'Mỗi ngày một lần · bà biết nhiều bí mật', () => act('phephi')); if (me.lanh?.caseId) add('📜 Kêu oan', 'Điều tra lại vụ án cũ', () => openCase(me.lanh.caseId)); }
  const ev = me.event; if (ev?.loc && ev.loc === L && !me.lanh) add(ev.act, ev.done ? 'Hôm nay đã tham gia · mai quay lại' : `${ev.sub} · sự kiện tuần`, () => act('event'), ev.done);
  if (L === 'tuninh' && me.hhVote) add('👑 Bầu phượng ấn', me.hhVote.mine ? 'Đã tiến cử · có thể đổi' : 'Tiến cử người xứng làm Hoàng hậu', openVote);
  const B = me.big; if (B && !B.done && !me.lanh && ['hoavien', 'tuninh', 'duongtam'].includes(L)) add('📜 Tra đại án ở đây', B.invToday.length >= 2 ? 'Hôm nay đã tra đủ 2 lần · mai quay lại' : B.invToday.includes(L) ? 'Hôm nay đã tra ở đây · thử nơi khác' : `1 lượt · còn ${2 - B.invToday.length} lần hôm nay · mỗi người nhận manh mối khác nhau`, () => socket.emit('big', { op: 'inv' }), B.invToday.includes(L) || B.invToday.length >= 2);
  const F = me.fest; if (F && !F.done && !me.lanh) { if (L === 'phong') add('🧵 Thêu gấm cho đại lễ', F.today.theu ? 'Hôm nay đã thêu' : '1 lượt · mỗi ngày 1 lần · thêu khéo được nhiều điểm', () => gameRhythm('múa', q => socket.emit('fest', { op: 'theu', q })), F.today.theu); if (L === 'tuninh') add('📿 Chép kinh cho đại lễ', F.today.kinh ? 'Hôm nay đã chép' : '1 lượt · mỗi ngày 1 lần · +15 điểm đại lễ', () => socket.emit('fest', { op: 'kinh' }), F.today.kinh); }
  if (me.isHH) add('👑 Quyền Hoàng hậu', 'Ân xá · phạt cấm túc · thiết yến', openHH);
  renderMenu();
}
// thanh công cụ dưới đáy: các việc làm được ở mọi nơi
function renderMenu() {
  let m = $('menubar'); if (!m) { m = document.createElement('div'); m.id = 'menubar'; $('game').appendChild(m); }
  const items = [];
  if (!me.lanh) items.push(['👥', 'Hậu cung', openRoster]);
  items.push(['💞', 'Tỷ muội', openSis, me.group ? '' : null]);
  items.push(['✉️', 'Thư', openMail, me.mailUnread || null]);
  if (!me.lanh) items.push(['🏪', 'Nội vụ', openShop]);
  items.push(['🏅', 'Danh hiệu', openAch]);
  items.push(['💃', 'Động tác', openEmotes]);
  items.push([me.pushOn ? '🔔' : '🔕', 'Thông báo', openPush]);
  if (me.admin) items.push(['📊', 'Thống kê', () => window.open('/admin.html', '_blank')]);
  m.innerHTML = ''; for (const [ic, lb, fn, badge] of items) { const b = document.createElement('button'); b.innerHTML = `<span class="ic">${ic}</span><span class="lb">${lb}</span>${badge ? `<i class="bd">${badge}</i>` : ''}`; b.title = lb; b.onclick = fn; m.appendChild(b); }
}
function openEmotes() {
  const E = [['hanh_le', 'Hành lễ'], ['cui_chao', 'Cúi chào'], ['chap_tay', 'Chắp tay'], ['che_mieng', 'Che miệng cười'], ['mua', 'Múa'], ['vo_tay', 'Vỗ tay'], ['quy', 'Quỳ'], ['khoc', 'Khóc'], ['gian', 'Giận'], ['nga', 'Ngất xỉu'], ['dung_cho', 'Đứng thẳng']];
  modal(`<button class="close" onclick="window._close()">✕</button><h3>Động tác</h3><div class="btns">${E.map(([k, n]) => `<button data-e="${k}">${n}</button>`).join('')}</div>`);
  $('mcard').querySelectorAll('[data-e]').forEach(b => b.onclick = () => { emote(b.dataset.e); closeModal(); });
}

// ---------------- nói chuyện với NPC ----------------
function talk(n) {
  const c = me.cases[0];
  if (NPC_OF[n.talk]) return npcMenu(n);
  if (String(n.talk).startsWith('fei:')) return socket.emit('fei', { op: 'talk', id: n.talk.slice(4) });
  if (n.talk === 'ngutru') { bubble(n.label, me.dish ? `${me.dish.name} xong rồi, chủ tử mau mang lên Dưỡng Tâm điện kẻo nguội!` : 'Chủ tử muốn tự tay nấu món dâng Hoàng thượng? Nô tài chuẩn bị bếp ngay!'); if (!me.dish && !cooking) setTimeout(() => openBiKip(), 900); return; }
  if (n.talk === 'thinhan') { if (world.loc === 'tuninh') thinhAn(); }
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
let bigOpen = false;
function modal(html) { bigOpen = false; $('mcard').classList.remove('wide'); $('mcard').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { bigOpen = false; $('modal').classList.add('hidden'); }
window._close = closeModal;
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

// vụ án: xem sổ điều tra ở cuối file
let caseOpenId = null;
function openCase(id) { caseOpenId = id; nbMin = false; socket.emit('caseDetail', id); }
socket.on('caseClosed', d => { if (trial) return trialResult(d); closeNotebook(); showScroll('Phán quyết', d.text, [['Đóng', hideCut]]); });
let witnessFor = null, rosterMode = null;

// danh sách hậu cung
function openRoster() { witnessFor = null; socket.emit('roster'); }
let rosterSilent = false;
socket.on('roster', r => {
  if (hhMode || rosterSilent) return;
  if (witnessFor) {
    const id = witnessFor;
    modal(`<button class="close" onclick="window._close()">✕</button><h3>Chọn người làm chứng</h3><table>${r.list.filter(p => p.id !== me.id).map(p => `<tr><td>${p.online ? '🟢' : '⚪'} ${esc(p.name)}</td><td>${esc(p.rankName)}</td><td><button data-w="${p.id}">Nhờ làm chứng</button></td></tr>`).join('') || '<tr><td>Chưa có ai khác trong cung.</td></tr>'}</table>`);
    $('mcard').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { socket.emit('case', { caseId: id, op: 'witness', who: b.dataset.w }); caseOpenId = id; witnessFor = null; closeModal(); });
    return;
  }
  const seats = r.seats.filter(s => s.seats).map(s => `${s.name} ${s.used}/${s.seats}`).join(' · ');
  modal(`<button class="close" onclick="window._close()">✕</button><h3>Danh sách hậu cung</h3><div style="color:var(--muted);font-size:12.5px">Ghế: ${seats}. Hoàng hậu: ${r.hh ? esc(r.hh) : 'NPC giữ ngôi, chờ bầu phượng ấn'}.</div>
  <table><tr><th>Phi tần</th><th>Cấp bậc</th><th>Sủng ái</th><th></th></tr>${r.list.map(p => `<tr><td>${p.online ? '🟢' : '⚪'} ${esc(p.name)}${p.thai ? ' 🤰' : ''}${p.kids ? ' 👶' + (p.kids > 1 ? '×' + p.kids : '') : ''}</td><td>${p.rankName === 'Hoàng hậu' ? '👑 ' : ''}${esc(p.rankName)}</td><td>${p.sung}</td><td>${p.id === me.id ? '' : `<button data-g="${p.id}">Tặng quà</button> ${me.canFight && p.canTarget ? `<button data-r="${p.id}" style="border-color:#c0503a">Ra tay</button>` : ''}`}</td></tr>`).join('')}</table>
  ${r.npcs?.length ? `<h4 style="margin:12px 0 4px">🎭 Phi tần trong cung (NPC)</h4><div style="color:var(--muted);font-size:12px">Họ cũng giành ghế và giành lật thẻ. Vượt công trạng của họ thì họ bị giáng để nhường ghế.${me.canFight ? ` Hãm hại: 1 lượt · 80 bạc · mỗi ngày 1 lần · có thể bị bắt quả tang.` : ''}</div>
  <table>${r.npcs.map(n => `<tr><td>🎭 ${esc(n.short)}</td><td>${esc(n.rankName)}</td><td>${n.pts} ct</td><td>${me.canFight && !me.hamDay ? `<button data-hh="${n.id}">🗡 Hãm hại</button>` : ''}</td></tr>`).join('')}</table>` : ''}
  <div style="color:var(--muted);font-size:12px">Tặng quà: 1 lượt · 40 bạc. ${me.canFight ? `Ra tay: 1 lượt · ${me.path === 'muuke' ? 80 : 120} bạc, còn ${me.attacksLeft} lần hôm nay.` : 'Từ Quý nhân mới được ra tay.'}</div>`);
  const mc = $('mcard');
  mc.querySelectorAll('[data-g]').forEach(b => b.onclick = () => act('tangqua', { target: b.dataset.g }));
  mc.querySelectorAll('[data-hh]').forEach(b => b.onclick = () => { const n = r.npcs.find(x => x.id === b.dataset.hh); if (confirm(`Bỏ 80 bạc và 1 lượt sai người hãm hại ${n.short}? 60% thành công, nếu bị bắt quả tang sẽ mất sủng ái.`)) { act('hamhai', { target: n.id }); closeModal(); } });
  mc.querySelectorAll('tr').forEach(tr => { const g = tr.querySelector('[data-g]'); if (!g) return; const id = g.dataset.g; if (me.group?.members.some(m => m.id === id)) { g.insertAdjacentHTML('afterend', ' <span style="color:#f3a6c8">💞 tỷ muội</span>'); tr.querySelector('[data-r]')?.remove(); } else if (!me.group || me.group.members.length < 4) { const b = document.createElement('button'); b.textContent = '💞 Kết nghĩa'; b.onclick = () => inviteSis(id); g.after(' ', b); }
    const mb = document.createElement('button'); mb.textContent = '✉️ Thư'; mb.onclick = () => composeMail(id, r.list.find(x => x.id === id)?.name); g.parentNode.appendChild(mb);
    const rp = r.list.find(x => x.id === id); if (rp?.inTam && !me.keoDay && !me.group?.members.some(m => m.id === id)) { const kb = document.createElement('button'); kb.textContent = '🌙 Giả bệnh kéo Hoàng thượng'; kb.title = '1 lượt · 50 bạc · mỗi ngày 1 lần · phải ở phòng riêng'; kb.onclick = () => { if (confirm(`Sai cung nữ sang báo bổn cung đau bụng để kéo Hoàng thượng khỏi tẩm cung của ${rp.name}?`)) { act('keoht', { target: id }); closeModal(); } }; g.parentNode.appendChild(kb); }
    const cb = document.createElement('button'); cb.textContent = '🕵️ Mua chuộc'; cb.title = `${80} bạc · mỗi ngày 1 lần · dò bí mật cung này`; cb.disabled = !!me.mcDay; cb.onclick = () => { if (confirm(`Bỏ 80 bạc mua chuộc cung nữ nhà ${r.list.find(x => x.id === id)?.name}? Có thể bị phát hiện.`)) { act('muachuoc', { target: id }); closeModal(); } }; g.parentNode.appendChild(cb); });
  mc.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    const t = r.list.find(p => p.id === b.dataset.r);
    modal(`<button class="close" onclick="window._close()">✕</button><h3>Ra tay với ${esc(t.name)}</h3><label>Mưu kế</label><select id="meth">${(t.thai ? r.thaiMethods : []).map(m => `<option value="${m.id}">🤰 ${esc(m.name)} — hại long thai</option>`).join('')}${r.methods.map(m => `<option value="${m.id}">${esc(m.name)} — tội ${esc(m.crime)}</option>`).join('')}</select>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="blur" style="width:auto"> Chi thêm 100 bạc xóa bớt dấu vết (một manh mối sẽ bị mờ)</label>
    <div style="color:var(--muted);font-size:12.5px;margin-top:8px">Nạn nhân sẽ có ${24} giờ điều tra. Nếu bị lật án, bổn cung chịu phạt nặng gấp đôi.</div>
    <div class="btns"><button class="gold" id="goR">Cài tang vật</button></div>`);
    $('goR').onclick = () => { act('ratay', { target: t.id, method: $('meth').value, blur: $('blur').checked }); closeModal(); };
  });
});

// tủ đồ
const OUTFIT_NAMES = { tunu: 'Tú nữ · xanh lá', thuongtai: 'Đáp ứng · tím mũ hoa', thuongtai_hong: 'Thường tại · hồng gile kem', quynhan: 'Quý nhân · xanh dương', quynhan_lam: 'Quý nhân · xanh lam thêu bạc', tan: 'Tần · cam áo khoác', tan_tim: 'Tần · tím hoa mẫu đơn', phi: 'Phi · tím chuỗi ngọc', phi_lam: 'Phi · xanh lam thêu vàng', quyphi: 'Quý phi · đỏ vân kiên', quyphi_phuong: 'Quý phi · đỏ kim phượng', hoangquyphi: 'Hoàng quý phi · cam rồng phượng', hoangquyphi_kim: 'Hoàng quý phi · đỏ rượu áo choàng kim', hoanghau: 'Hoàng hậu · vàng mũ phượng', aongu: 'Áo ngủ · trắng' };
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
  $('dSave').onclick = () => { socket.emit('decor', decor.list.map(({ item, x, z, ry }) => ({ item, x, z, ry }))); roomSeats(world); };
  $('dExit').onclick = closeDecor;
  toast('Chọn món đồ rồi bấm xuống sàn. Bấm vào món đã đặt để chọn, xoay hoặc bỏ.');
}
function closeDecor() { decor.on = false; $('decorbar').classList.add('hidden'); if (world?.loc === 'phong') roomSeats(world); }
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
  else if (d.type === 'tran') showScroll('Quế ma ma nhờ tra án', `Quế ma ma kéo bổn cung ra một góc: <b>${esc(d.methodName)}</b>! Lão nô nghi có 4 kẻ, nhờ chủ tử tra giúp trong <b>${d.hours} giờ</b>.<br><br>Thu thập manh mối, loại dần nghi phạm, rồi <b>ra phiên xử</b> chỉ đúng thủ phạm: được ${'20 công trạng, 50 bạc'} và ma ma thân thiết hơn. Chỉ sai hay hết hạn thì không bị phạt, chỉ mất công.`, [['📒 Mở sổ điều tra', () => { hideCut(); openCase(d.caseId); }]]);
  else if (d.type === 'baohy') showScroll('Báo hỷ', `Thái y quỳ xuống chúc mừng: <b>${esc(d.name)}</b> có hỷ mạch!<br><br>Long thai sẽ chào đời sau <b>${d.days} ngày</b>. Mỗi ngày đến Từ Ninh cung nhờ Thái y sắc <b>thuốc an thai</b>: uống đủ 2 ngày thì sinh thuận, và nếu có kẻ giở trò thì phát hiện sớm hơn.<br><br><i>Cẩn thận, trong cung nhiều người không muốn thấy đứa trẻ này ra đời.</i>`, [['Tạ ơn trời phật', () => { hideCut(); emote('chap_tay'); }]]);
  else if (d.type === 'thainguy') showScroll('Long thai lâm nguy', `Bổn cung đau bụng dữ dội. Thái y phát hiện <b>${esc(d.methodName)}</b>!<br><br>Có <b>${d.hours} giờ</b> để tìm ra kẻ hãm hại. Chỉ đúng hung thủ thì giữ được long thai và kẻ đó vào lãnh cung. Chỉ sai người hoặc hết hạn thì <b>sảy thai</b>.`, [['📒 Mở sổ điều tra', () => { hideCut(); openCase(d.caseId); }]]);
  else if (d.type === 'saythai') showScroll('Sảy thai', `Long thai không giữ được${d.why ? ' vì ' + esc(d.why) : ''}…<br><br>Thái hậu thở dài, Hoàng thượng ban an ủi. Ngày còn dài, chủ tử giữ gìn sức khỏe rồi sẽ lại có tin vui.`, [['Lau nước mắt', () => { hideCut(); emote('khoc'); }]]);
  else if (d.type === 'sinhcon') showScroll('Hỷ sự', `${d.hard ? 'Sau một đêm khó sinh, ' : ''}<b>${esc(d.name)}</b> hạ sinh ${d.sex === 'trai' ? '<b>hoàng tử</b>' : '<b>công chúa</b>'}. Hoàng thượng ban tên <b>${esc(d.child)}</b>.<br><br>Được thưởng sủng ái, bạc và công trạng${d.hard ? ' (giảm một nửa vì thai yếu)' : ', đủ để lên một bậc'}. Từ nay mỗi ngày <b>thêm 1 lượt</b> và dễ được lật thẻ hơn.`, [['Bế con', () => { hideCut(); emote('che_mieng'); }]]);
  else if (d.type === 'latan') showScroll('Lật án', `Chân tướng đã rõ: thủ phạm là <b>${esc(d.culprit)}</b>. Thái hậu minh xét, trả lại trong sạch cho ${esc(d.name)}.`, [['Tạ ơn Thái hậu', () => { hideCut(); emote('hanh_le'); }]]);
}
socket.on('latthe', d => {
  if (d.id === me?.id) { latTheMe = true; renderMap(); showScroll('Lật thẻ bài', `Tổng quản thái giám đến truyền: đêm nay Hoàng thượng lật thẻ bài của <b>${esc(d.name)}</b>.<br>Mời chủ tử tắm gội, thay áo, đến tẩm cung hầu giá.`, [['Để sau', hideCut], ['Đến tẩm cung', () => { hideCut(); socket.emit('goto', 'tamcung'); }]]); }
  else toast(`🏮 ${d.when || 'Đêm nay'} Hoàng thượng lật thẻ bài của ${d.name}.`);
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
  { el: '#who', title: 'Thân phận của bổn cung', text: 'Tên, chức vị, thanh <b>công trạng</b>. Đầy thanh sẽ được tấn phong lên bậc tiếp theo, từ Tú nữ tới Hoàng quý phi, rồi tranh ngôi Hoàng hậu.<br><br>Dòng <b>🎯</b> bên dưới là nhiệm vụ tân thủ: làm theo là biết cách chơi, xong mỗi bước có thưởng.' },
  { el: '#stats', title: 'Bạc, lượt, sủng ái', text: '<b>Lượt</b> dùng cho đa số việc, cứ 30 phút hồi 1. Bấm <b>🗓 Hôm nay</b> để xem sự kiện tuần, giờ lật thẻ, giờ yến tiệc và sở thích Hoàng thượng.' },
  { el: '#map', title: 'Đi lại trong cung', text: 'Ngự hoa viên, Từ Ninh cung (Thái hậu), Dưỡng Tâm điện (Hoàng thượng), phòng riêng.' },
  { el: '#acts', title: 'Việc làm ở nơi đang đứng', text: 'Mỗi nơi có việc riêng. Câu cá ở hồ không tốn lượt, hết lượt vẫn chơi được.' },
  { el: 'center', title: 'Di chuyển và nói chuyện', text: '<b>Bấm xuống đất</b> để đi. Kéo chuột để xoay, lăn chuột để phóng to. Bấm vào <b>tên NPC màu vàng</b> (Thái hậu, Quế ma ma, Thái y…) để trò chuyện, biếu quà, nhận tra án.' },
  { isNew: 5, el: '#menubar', title: 'Thanh công cụ', text: '<b>👥 Hậu cung</b>: tặng quà, kết nghĩa, gửi thư, mua chuộc, ra tay. <b>✉️ Thư</b>: thư từ, lời mời, quà gửi khi người kia offline. <b>🔔</b>: bật thông báo để biết khi bị hãm hại, được lật thẻ dù đang không mở game. <b>🏅</b> danh hiệu, <b>🏪</b> Nội vụ phủ (có trang sức).' },
  { isNew: 5, el: '#who', title: 'Mới: phá án cho mọi người', text: 'Ở Từ Ninh cung, mỗi ngày nhận <b>tra án giúp Quế ma ma</b>: thu manh mối, loại nghi phạm, ra phiên xử. Đúng thì có thưởng, sai không bị phạt. Hoàng thượng giờ <b>lật thẻ mỗi 2 tiếng</b> từ 8h tới 22h.' },
  { el: '#chat', title: 'Trò chuyện', text: 'Gõ rồi Enter để nói với người cùng chỗ. Nút 💞 để nói riêng với tỷ muội.' },
  { el: '#guidebtn', title: 'Cẩm nang', text: 'Bấm đây để xem lại hướng dẫn hoặc đọc cẩm nang chi tiết từng phần.<br><br>Chúc chủ tử sớm bước lên ngôi Hoàng hậu!' },
];
let tourOn = false;
function startTour(force) {
  if (tourOn || !me || !world) return;
  const key = 'mph_tour5_' + me.id;
  try { if (!force && localStorage.getItem(key)) return; } catch {}
  if (cutActive || stage || !$('modal').classList.contains('hidden')) { if (!force) setTimeout(() => startTour(), 1500); return; }
  let T = TOUR; try { const seen = ['mph_tour4_', 'mph_tour3_', 'mph_tour2_'].some(k => localStorage.getItem(k + me.id)) ? 4 : 0; if (!force && seen) T = TOUR.filter(st => (st.isNew || 0) > seen); } catch {}
  tourOn = true; let i = 0;
  const wrap = document.createElement('div'); wrap.id = 'tour';
  wrap.innerHTML = '<div class="hole"></div><div class="tip"><div class="step"></div><h4></h4><div class="txt"></div><div class="btns"><button class="skip">Bỏ qua</button><button class="gold next">Tiếp tục</button></div></div>';
  document.body.appendChild(wrap);
  const hole = wrap.querySelector('.hole'), tip = wrap.querySelector('.tip');
  const finish = () => { tourOn = false; wrap.remove(); removeEventListener('resize', show); try { localStorage.setItem(key, '1'); } catch {} };
  wrap.querySelector('.skip').onclick = finish;
  wrap.querySelector('.next').onclick = () => { if (i >= T.length - 1) return finish(); i++; show(); };
  function show() {
    const st = T[i]; let r;
    if (st.el === 'center') { const w = Math.min(320, innerWidth * .5), h = Math.min(380, innerHeight * .5); r = { left: innerWidth / 2 - w / 2, top: innerHeight / 2 - h / 2, width: w, height: h }; }
    else { const el = typeof st.el === 'function' ? st.el() : document.querySelector(st.el); if (!el || !el.getClientRects().length) { if (i < T.length - 1) { i++; return show(); } return finish(); } r = el.getBoundingClientRect(); }
    const pad = 6; Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    wrap.querySelector('.step').textContent = `${i + 1} / ${T.length}`;
    tip.querySelector('h4').textContent = st.title; tip.querySelector('.txt').innerHTML = st.text;
    wrap.querySelector('.next').textContent = i === T.length - 1 ? 'Xong' : 'Tiếp tục';
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
  <div class="nbhead"><div><b>⚖️ ${esc(c.methodName)}</b><small>${c.det ? '🔍 Tra án giúp Quế ma ma · không bị phạt' : c.thai ? '🤰 Kẻ nào đó mưu hại long thai' : 'Tội danh: ' + esc(c.crime)}</small></div><button class="nbx" title="Thu gọn">–</button></div>
  ${c.status === 'open' ? `<div class="nbtime">⏳ ${c.det ? 'Hạn tra án còn' : c.thai ? 'Long thai chỉ giữ được thêm' : 'Phiên xử ở Từ Ninh cung sau'} <b id="nbTimer">${fmtLeft(c.deadline - Date.now())}</b></div>` : c.reopen ? '<div class="nbtime">📜 Kêu oan từ lãnh cung: chỉ đúng thủ phạm sẽ được phục vị</div>' : '<div class="nbtime">Vụ án đã khép</div>'}
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
    ${c.status === 'open' && !c.thai && !c.det ? '<button id="nbConf">🙇 Nhận tội<small>giảm nhẹ: cấm túc 1 ngày hoặc giáng 1 bậc</small></button>' : ''}
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
  return parts.length ? `<span class="pill ht" title="Dò tin ở Ngự hoa viên để biết thêm">👑 ${parts.join(' · ')}</span>` : '<span class="pill ht dim" title="Dò tin ở Ngự hoa viên để biết Hoàng thượng thèm canh gì, thích áo màu gì">👑 Sở thích HT: chưa dò</span>';
}

// =====================================================================
// TRÒ NHỎ (nhân vật diễn, khung nhỏ phía dưới không che nhân vật)
// =====================================================================
const mgEl = document.createElement('div'); mgEl.id = 'mg'; mgEl.className = 'hidden'; document.body.appendChild(mgEl);
let mgOn = false;
function mgOpen(html) { mgOn = true; mgEl.innerHTML = html; mgEl.classList.remove('hidden'); document.body.classList.add('mgopen'); camDistSaved = camDist; camDist = Math.max(2.2, camDist * .8); }
let camDistSaved = null;
function mgClose() { mgOn = false; mgEl.classList.add('hidden'); document.body.classList.remove('mgopen'); if (camDistSaved) camDist = camDistSaved; camDistSaved = null; }
const TMS = [['đàn', '🎵 Đàn tranh'], ['múa', '🪭 Múa quạt'], ['lụa', '🎀 Múa lụa'], ['kiếm', '⚔️ Kiếm vũ'], ['thơ', '📜 Ngâm thơ'], ['hát', '🎶 Hát khúc Giang Nam']];
const TMCAT = t => ({ 'lụa': 'múa', 'kiếm': 'múa', 'hát': 'đàn' })[t] || t;
function chooseTai(cb) {
  if (mgOn) return;
  if (me.turns < 1 && world?.loc !== 'yentiec') return toast('Hết lượt hôm nay.', 'bad');
  const fav = me.htKnown?.tai;
  mgOpen(`<div class="mgt">Chọn tài nghệ</div><div class="row">${TMS.map(([k, n]) => `<button data-t="${k}" class="${fav === TMCAT(k) ? 'gold' : ''}">${n}${fav === TMCAT(k) ? ' ★' : ''}</button>`).join('')}<button data-x>✕</button></div>`);
  mgEl.querySelectorAll('[data-t]').forEach(b => b.onclick = () => cb(b.dataset.t));
  mgEl.querySelector('[data-x]').onclick = mgClose;
}
// nhịp phách: nốt chạy sang phải, bấm khi nốt vào ô vàng
function gameRhythm(tai, done) {
  if (selfC) { selfC.target = null; taiStart(selfC, tai); socket.emit('emote', 'tai:' + tai); camYaw = selfC.root.rotation.y + (tai === 'đàn' ? .5 : 0); }
  if (tai === 'thơ') poemShow();
  const N = 8, notes = []; let t0 = performance.now() + 900, hits = 0, judged = 0, raf;
  for (let i = 0; i < N; i++) notes.push({ t: t0 + i * (520 + Math.random() * 380), st: 0 });
  mgOpen(`<div class="mgt">${(TMS.find(x => x[0] === tai) || ['', '💃 Múa'])[1]} · bấm khi nốt chạm ô vàng <small>(phím cách hoặc chạm)</small></div><div class="lane"><div class="zone"></div></div><div class="mgs">Trúng <b id="mgHit">0</b>/${N}</div>`);
  const lane = mgEl.querySelector('.lane'); const els = notes.map(() => { const d = document.createElement('div'); d.className = 'note'; d.textContent = { 'đàn': '♪', 'hát': '♫', 'thơ': '字', 'kiếm': '⚔', 'lụa': '〰' }[tai] || '❀'; lane.appendChild(d); return d; });
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
  let ts = 0; if (d.tamsu) { htGesture('dung_cho_nam'); ts = await say('hoangthuong_dem', 'Hoàng thượng tâm sự', esc(d.tamsu.q), d.tamsu.opts.map((o, i) => [esc(o), i, ''])); }
  const ans = [];
  for (const q of d.qs) ans.push(await say('hoangthuong_dem', 'Hoàng thượng', esc(q.q), q.opts.map((o, i) => [esc(o), i, ''])));
  act('httalk', { ans, ts });
});
socket.on('htTalkResult', async r => { htGesture(r.score >= 2 ? 'nam_tay' : 'dung_cho_nam'); await say('hoangthuong_dem', 'Hoàng thượng', `${esc(r.line)}<br><small>💗 Sủng ái +${r.sung}${r.gift ? ` · 🎁 Hoàng thượng ban <b>${esc(r.gift)}</b>` : ''}</small>`, [['Tạ ơn Hoàng thượng', 0, 'gold']]); dlgClose(); htTalking = false; });

// =====================================================================
// TIỆM NỘI VỤ PHỦ
// =====================================================================
const SHOP = { sam: ['🌿 Nhân sâm bồi bổ', '+1 lượt (mỗi ngày 1 lần)', 80], huong: ['🪷 Hương mê điệp', 'Lần lật thẻ tới dễ được chọn hơn', 120], le: ['🎁 Lễ vật tiến Thái hậu', 'Thái hậu hài lòng +8', 60] };
const DECOR_PRICE = { denlong: 60, binhsu: 80, luhuong: 100, tham: 40, giuong: 200, lahan: 350 };
const JEWELS = { hoatai: ['📿 Hoa tai trân châu', 'Mỗi lần thỉnh an Thái hậu hài lòng thêm 1', 250], tramthuy: ['💚 Trâm phỉ thúy', 'Luôn dễ được lật thẻ hơn một chút', 300], vongngoc: ['🟢 Vòng ngọc Hòa Điền', 'Mỗi ngày tự được thêm 2 sủng ái', 400], tramphuong: ['👑 Trâm phượng vàng', 'Dâng tiết mục ở yến tiệc được cộng điểm', 600] };
function openShop() {
  closeModal();
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🏪 Nội vụ phủ</h3><div style="color:var(--muted);font-size:13px">Bạc hiện có: <b style="color:var(--gold2)">${me.silver}</b> · thắng yến tiệc, luyện xuất sắc để có thêm bạc</div>
  <div class="shop">${Object.entries(SHOP).map(([k, [n, d, p]]) => `<div class="it"><b>${n}</b><small>${d}${k === 'huong' && me.huong ? ' · <i>đang có</i>' : ''}</small><button data-b="${k}" ${me.silver < p ? 'disabled' : ''}>${p} bạc</button></div>`).join('')}
  ${Object.entries(JEWELS).map(([k, [n, d, p]]) => `<div class="it"><b>${n}</b><small>Trang sức · ${d} · dùng mãi mãi</small>${me.jewels?.includes(k) ? '<button disabled>Đã có</button>' : `<button data-b="${k}" ${me.silver < p ? 'disabled' : ''}>${p} bạc</button>`}</div>`).join('')}
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
  if (anim === 'tai:rượu') { cheers(c); return; }
  if (String(anim).startsWith('lie:')) { if (world?.myBed) { o.seated = { lie: 1 }; lieOn(c); } return; }
  if (c.root.rotation.x) c.root.rotation.x = 0;
  if (String(anim).startsWith('sit:')) { const st = world?.seats?.find(x => x.id === anim.slice(4)); if (st) { o.seated = st; seatPose(c, st); return; } }
  if (o.seated) { o.seated = null; c.pose = null; c.root.position.set(o.tx, world?.floorAt ? world.floorAt(o.tx, o.tz) : 0, o.tz); c.root.rotation.y = o.try; }
  if (String(anim).startsWith('tai:')) { o.taiK = anim.slice(4); c.root.position.set(o.tx, 0, o.tz); c.root.rotation.y = o.try; taiStart(c, o.taiK);
    // người ngồi dưới: quay camera về phía người đang biểu diễn
    if (world?.loc === 'yentiec' && selfC && !taiOn && !dancing && !mgOn && o.taiK !== 'câu') { watchStage(o.tz, 12000); const nm = (TMS.find(x => x[0] === o.taiK) || [])[1]; if (nm) toast(`🎎 ${o.p.name} đang biểu diễn ${nm.replace(/^\S+\s/, '')}`); }
    return; }
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
  } else if (tai === 'thai') {
    c.play('dung_cho'); const k = makeCleaver(); world.group.add(k); c._taiProp = k; const hp = new THREE.Vector3();
    c.post = (cc, t) => { const ch = Math.abs(Math.sin(t * 11)); aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.2, -.55, .8])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([.25, -.4 + ch * .8, .85])); aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.25, -.6, .75])); aim(cc.root, cc.B.lFore, cc.B.lHand, v3([-.4, -.3, .85])); cc.root.updateMatrixWorld(true); cc.B.rHand.getWorldPosition(hp); k.position.copy(hp); k.rotation.set(Math.PI / 2, cc.root.rotation.y, 0); };
  } else if (tai === 'nau') {
    c.play('dung_cho'); const l = makeLadle(); world.group.add(l); c._taiProp = l; const hp = new THREE.Vector3();
    c.post = (cc, t) => { aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.15, -.35, .9])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([Math.sin(t * 5) * .45, -.35, .8 + Math.cos(t * 5) * .2])); aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.3, -.7, .5])); cc.root.updateMatrixWorld(true); cc.B.rHand.getWorldPosition(hp); l.position.copy(hp); l.rotation.set(-.9, cc.root.rotation.y, Math.sin(t * 5) * .3); };
  } else if (tai.startsWith('bung')) {
    c.play('dung_cho'); const rr = RECIPES[+tai.split(':')[1]] || RECIPES[0]; const b = makeDish(rr.name); b.scale.setScalar(.6); world.group.add(b); c._taiProp = b; dishLabel(b, rr.name); const a = new THREE.Vector3(), b2 = new THREE.Vector3();
    c.post = (cc) => { aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.15, -.5, .85])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([.5, .1, .85])); aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.15, -.5, .85])); aim(cc.root, cc.B.lFore, cc.B.lHand, v3([-.5, .1, .85])); cc.root.updateMatrixWorld(true); cc.B.rHand.getWorldPosition(a); cc.B.lHand.getWorldPosition(b2); b.position.copy(a).add(b2).multiplyScalar(.5); b.position.y += .05; };
  } else if (tai === 'lụa') {
    c.play('mua', { restart: true });
    const g = new THREE.Group(); world.group.add(g); c._taiProp = g;
    const r1 = makeRibbon(0xe0457b), r2 = makeRibbon(0xf2c14e); g.add(r1, r2); const a = new THREE.Vector3(), b = new THREE.Vector3();
    c.post = (cc, t) => { cc.B.rHand.getWorldPosition(a); cc.B.lHand.getWorldPosition(b); r1.userData.update(a, t, 1); r2.userData.update(b, t + 1.3, -1); };
  } else if (tai === 'kiếm') {
    c.play('mua', { restart: true });
    const sw = makeSword(); world.group.add(sw); c._taiProp = sw;
    const hp = new THREE.Vector3(), q = new THREE.Quaternion();
    c.post = (cc, t) => { cc.B.rHand.getWorldPosition(hp); cc.B.rHand.getWorldQuaternion(q); sw.position.copy(hp); sw.quaternion.copy(q); sw.rotateZ(Math.PI / 2 + Math.sin(t * 4) * .5); };
  } else if (tai === 'hát') {
    c.play('dung_cho');
    const LY = ['♪ Giang Nam mưa bụi bay ngang cửa…', '♪ Sen nở hồ thu, thuyền ai qua…', '♪ Trăng soi lầu ngọc, gió đưa hương…', '♪ Chúc người trường thọ tựa non xanh…'];
    let k = -1;
    c.post = (cc, t) => {
      aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.3, -.3, .8])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([.3, .2, .9]));
      aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.7, -.1 + Math.sin(t * 1.5) * .15, .6])); aim(cc.root, cc.B.lFore, cc.B.lHand, v3([.8, .1, .5]));
      const n = Math.floor(t / 1.6) % LY.length; if (n !== k && cc.label) { k = n; bubble(cc.label, LY[n]); }
    };
  } else if (tai === 'câu') {
    c.play('dung_cho');
    const g = new THREE.Group(); world.group.add(g); c._taiProp = g;
    const rodM = new THREE.MeshStandardMaterial({ color: 0x7a5a2a, roughness: .7 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.006, .012, 1.1, 6), rodM); rod.geometry.translate(0, .55, 0); g.add(rod);
    const bob = new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd9342a, roughness: .4 })); g.add(bob); c._bob = bob;
    const lineG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const line = new THREE.Line(lineG, new THREE.LineBasicMaterial({ color: 0xeeeeee })); g.add(line);
    const hp = new THREE.Vector3(), tip = new THREE.Vector3(), dirV = new THREE.Vector3(Math.sin(ry), .9, Math.cos(ry)).normalize();
    const bp = new THREE.Vector3(P.x + fx * 1.5, .06, P.z + fz * 1.5);
    c.post = (cc, t) => {
      aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.15, -.35, .9])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([0, .1, 1])); aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.2, -.5, .8])); aim(cc.root, cc.B.lFore, cc.B.lHand, v3([-.4, 0, .9]));
      cc.root.updateMatrixWorld(true); cc.B.rHand.getWorldPosition(hp); rod.position.copy(hp); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirV);
      tip.copy(dirV).multiplyScalar(1.1).add(hp); const dip = c._bite ? Math.abs(Math.sin(t * 18)) * .05 : Math.sin(t * 2) * .008; bob.position.set(bp.x, bp.y - dip, bp.z);
      const a = line.geometry.attributes.position; a.setXYZ(0, tip.x, tip.y, tip.z); a.setXYZ(1, bob.position.x, bob.position.y, bob.position.z); a.needsUpdate = true; };
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
let sched = null; const noticeEl = document.createElement('div'); noticeEl.id = 'notice'; noticeEl.className = 'hidden'; $('toasts').prepend(noticeEl);
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

// =====================================================================
// GIAI ĐOẠN 2 · NPC CÓ TRÍ NHỚ
// =====================================================================
const NPC_OF = { thinhan: 'thaihau', mama: 'mama', thaiy: 'thaiy', thaigiam: 'tonggiam' };
const NPC_MODEL = { thaihau: 'thaihau', mama: 'mama', thaiy: 'thaiy', tonggiam: 'thaigiam' };
const relWord = r => r >= 60 ? '💖 rất thân thiết' : r >= 30 ? '💗 thân thiết' : r <= -30 ? '💢 có hiềm khích' : r < 0 ? 'hơi lạnh nhạt' : 'bình thường';
const REL_PERK = { thaihau: 'Thân thiết: một lần mỗi tuần được tha tội vu cáo', mama: 'Thân thiết: khi bị phát giác được thêm 6 giờ điều tra (có hiềm khích thì bị bớt 6 giờ)', thaiy: 'Thân thiết: kiểm nghiệm tang vật giảm nửa giá', tonggiam: 'Thân thiết: tra sổ quà Nội vụ phủ miễn phí' };
async function npcMenu(n) {
  const k = NPC_OF[n.talk], r = me.rel?.[k] || 0, day = me.relDay || {};
  const opts = [];
  if (k === 'thaihau' && !me.thinhAn) opts.push(['🙇 Thỉnh an', 'th', 'gold']);
  if (k === 'thaiy' && me.cases[0] && clueOpen('thaiy')) opts.push(['⚕️ Nhờ kiểm nghiệm tang vật', 'clue', 'gold']);
  if (k === 'tonggiam' && me.cases[0] && clueOpen('so')) opts.push(['📖 Xem sổ quà Nội vụ phủ', 'clue', 'gold']);
  if (k === 'mama' && !me.lanh) opts.push([me.detDay ? '🔍 Hôm nay đã nhận tra án' : '🔍 Nhận tra án giúp ma ma', 'tran', me.detDay ? '' : 'gold']);
  if (k === 'thaiy' && !me.relDayMach) opts.push(['🩺 Bắt mạch', 'mach', me.thai ? '' : 'gold']);
  if (k === 'thaiy' && me.thai) opts.push([me.thai.antai ? '🍵 Hôm nay đã uống thuốc an thai' : `🍵 Uống thuốc an thai (${me.event?.id === 'dichbenh' ? 'miễn phí' : '20 bạc'})`, 'antai', me.thai.antai ? '' : 'gold']);
  opts.push([day[k + ':talk'] ? '💬 Trò chuyện' : '💬 Trò chuyện (+thân thiết)', 'talk', '']);
  opts.push([day[k + ':gift'] ? '🎁 Đã biếu quà hôm nay' : '🎁 Biếu quà (30 bạc)', 'gift', '']);
  opts.push(['Thôi', 'x', '']);
  const i = await say(NPC_MODEL[k], n.name, `<small>Quan hệ: <b>${relWord(r)}</b> (${r}) · ${REL_PERK[k]}</small>`, opts.map((o, j) => [o[0], j, o[2]]));
  const op = opts[i][1]; dlgClose();
  if (op === 'th') return thinhAn();
  if (op === 'clue') return k === 'thaiy' ? clueThaiY(n) : clueSoQua(n);
  if (op === 'tran' && me.detDay) return toast('Hôm nay đã nhận tra án rồi.');
  if (op === 'mach' || op === 'antai' || op === 'tran') return socket.emit('npc', { npc: k, op });
  if (op === 'talk' || op === 'gift') { if (op === 'gift' && day[k + ':gift']) return toast('Hôm nay đã biếu quà rồi.'); socket.emit('npc', { npc: k, op }); }
}
socket.on('npcTalk', async d => { await say(NPC_MODEL[d.npc], { thaihau: 'Thái hậu', mama: 'Quế ma ma', thaiy: 'Thái y', tonggiam: 'Tổng quản Lý Đức Toàn' }[d.npc], `${esc(d.line)}<br><small>Quan hệ: ${relWord(d.rel)} (${d.rel})${d.first || d.gift ? ' · đã tăng' : ''}</small>`, [['Lui', 0, 'gold']]); dlgClose(); });
function thinhAn() {
  if (me.thinhAn) return toast('Hôm nay đã thỉnh an rồi.');
  if (world?.loc !== 'tuninh') return toast('Phải đến Từ Ninh cung.');
  emote('hanh_le'); socket.emit('thQ');
}
socket.on('thQ', async d => {
  const i = await say('thaihau', 'Thái hậu', esc(d.q), d.opts.map((o, j) => [esc(o), j, '']));
  dlgClose(); act('thinhan', { ans: i });
});

// =====================================================================
// CÂU CÁ (miễn phí)
// =====================================================================
const POND = { x: -4.5, z: -1, r: 3.25 };
async function gameFish() {
  if (mgOn || taiOn || world?.loc !== 'hoavien' || !selfC) return;
  const r = selfC.root; let dx = r.position.x - POND.x, dz = r.position.z - POND.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const sx = POND.x + dx * POND.r, sz = POND.z + dz * POND.r;
  selfC.target = { x: sx, z: sz };
  await new Promise(res => { let n = 0; const iv = setInterval(() => { if (!selfC?.target || ++n > 60) { if (selfC) selfC.target = null; clearInterval(iv); res(); } }, 100); });
  r.rotation.y = Math.atan2(-dx, -dz); sendMove('dung_cho');
  taiStart(selfC, 'câu'); socket.emit('emote', 'tai:câu'); camYaw = r.rotation.y + Math.PI + .6;
  const loop = () => {
    mgOpen(`<div class="mgt">🎣 Câu cá · chờ phao giật thì bấm <b>Giật cần!</b> (phím cách)</div><div class="mgs" id="fishSt">Đang chờ cá cắn câu…</div><div class="row" style="justify-content:center"><button class="gold" id="fishBtn" style="min-width:160px">Giật cần!</button><button id="fishX">Thôi, về</button></div>`);
    let bite = false, done = false, t1, t2;
    const wait = 1500 + Math.random() * 4500;
    t1 = setTimeout(() => { bite = true; selfC._bite = true; $('fishSt').innerHTML = '<b style="color:#c0201b;font-size:18px">❗ Cá cắn câu!</b>'; t2 = setTimeout(() => { bite = false; selfC._bite = false; if (!done) $('fishSt').textContent = 'Cá ăn mồi rồi chạy mất… chờ tiếp.'; }, 900); }, wait);
    const pull = () => { if (done) return; done = true; clearTimeout(t1); clearTimeout(t2); selfC._bite = false; removeEventListener('keydown', key);
      const ok = bite; act('cauca', { q: ok ? 1 : 0 }); $('fishSt').textContent = ok ? 'Kéo lên…' : 'Giật sớm quá, cá sợ bỏ đi.';
      setTimeout(() => { if (mgOn) loop(); }, 1600); };
    const key = e => { if (e.code === 'Space') { e.preventDefault(); pull(); } };
    addEventListener('keydown', key); $('fishBtn').onclick = pull;
    $('fishX').onclick = () => { done = true; clearTimeout(t1); clearTimeout(t2); removeEventListener('keydown', key); mgClose(); taiEnd(selfC); socket.emit('emote', 'dung_cho'); };
  };
  loop();
}
socket.on('fishGot', d => { const st = $('fishSt'); if (st) st.innerHTML = d.gold ? '🐟✨ <b style="color:#c99a1c">Cá chép vàng!</b>' : `🐟 Được <b>${esc(d.name)}</b>`; });

// =====================================================================
// TỶ MUỘI KẾT NGHĨA
// =====================================================================
function inviteSis(id) {
  if (me.group) return socket.emit('sis', { op: 'invite', who: id });
  const name = prompt('Đặt tên cho nhóm tỷ muội (ví dụ: Kim Lan, Đào Viên, Tam Hoa):', 'Kim Lan'); if (name === null) return;
  socket.emit('sis', { op: 'invite', who: id, name });
}
socket.on('sisInvite', d => {
  modal(`<h3>🌸 Lời kết nghĩa</h3><div style="line-height:1.6"><b>${esc(d.fromName)}</b> muốn cùng bổn cung thắp hương kết nghĩa tỷ muội, nhóm <b>"${esc(d.name)}"</b>.<br><small style="color:var(--muted)">Thành viên: ${d.members.map(esc).join(', ')}</small><br><br>Tỷ muội có kênh trò chuyện riêng, góp bạc may áo dâng Thái hậu, cầu tình cứu nhau khi bị phạt, cùng dâng tiết mục ở yến tiệc được thêm điểm, và không thể ra tay hãm hại nhau.</div><div class="btns"><button id="sisNo">Khéo từ chối</button><button class="gold" id="sisYes">🌸 Kết nghĩa</button></div>`);
  $('sisYes').onclick = () => { socket.emit('sis', { op: 'accept' }); closeModal(); };
  $('sisNo').onclick = () => { socket.emit('sis', { op: 'decline' }); closeModal(); };
});
const LOCN = { hoavien: 'Ngự hoa viên', tuninh: 'Từ Ninh cung', duongtam: 'Dưỡng Tâm điện', phong: 'phòng riêng', tamcung: 'tẩm cung', lanhcung: 'lãnh cung', yentiec: 'yến tiệc' };
function openSis() {
  const g = me.group;
  if (!g) { modal(`<button class="close" onclick="window._close()">✕</button><h3>💞 Tỷ muội</h3><div style="line-height:1.6;color:var(--muted)">Chưa kết nghĩa với ai. Mở <b>Danh sách hậu cung</b>, bấm <b>💞 Kết nghĩa</b> cạnh người muốn kết thân (họ cần đang online). Nhóm tối đa 4 người.</div><div class="btns"><button class="gold" id="sisRoster">Mở danh sách hậu cung</button></div>`); $('sisRoster').onclick = () => { closeModal(); openRoster(); }; return; }
  modal(`<button class="close" onclick="window._close()">✕</button><h3>💞 Tỷ muội "${esc(g.name)}"</h3>
  <table>${g.members.map(m => `<tr><td>${m.online ? '🟢' : '⚪'} ${esc(m.name)}${m.id === me.id ? ' (bổn cung)' : ''}</td><td>${esc(m.rankName)}</td><td style="color:var(--muted)">${m.lanh ? '⛓ lãnh cung' : m.camTuc ? '🔒 cấm túc' : m.online ? 'ở ' + (LOCN[m.loc] || '') : ''}</td></tr>`).join('')}</table>
  <div style="margin-top:8px"><b>🧵 Quỹ may áo dâng Thái hậu</b> <small style="color:var(--muted)">đủ quỹ thì cả nhóm được Thái hậu hài lòng +10, công trạng +30</small>
  <div style="height:10px;background:rgba(255,255,255,.1);border-radius:6px;margin:5px 0;overflow:hidden"><div style="height:100%;width:${Math.min(100, g.fund / g.goal * 100)}%;background:linear-gradient(90deg,#e2bf6b,#f3dc96)"></div></div>${g.fund}/${g.goal} bạc
  <div class="btns">${[20, 50, 100].map(v => `<button data-don="${v}" ${me.silver < v ? 'disabled' : ''}>Góp ${v} bạc</button>`).join('')}</div></div>
  <div style="color:var(--muted);font-size:12.5px;margin-top:6px">• Trò chuyện riêng: bấm nút <b>💞</b> cạnh khung chat để chuyển kênh.<br>• Tỷ muội bị lãnh cung hoặc cấm túc: đến <b>Từ Ninh cung</b> bấm "Cầu tình".<br>• Cùng dâng tiết mục trong một buổi yến tiệc: mỗi người được cộng thêm điểm hợp tấu.</div>
  <div class="btns"><button id="sisLeave" style="border-color:#c0503a">✂️ Cắt áo đoạn nghĩa</button></div>`);
  $('mcard').querySelectorAll('[data-don]').forEach(b => b.onclick = () => { socket.emit('sis', { op: 'donate', amount: +b.dataset.don }); setTimeout(openSis, 500); });
  $('sisLeave').onclick = () => { if (confirm('Rời nhóm tỷ muội? Cả cung sẽ biết chuyện này.')) { socket.emit('sis', { op: 'leave' }); closeModal(); } };
}
// nút đổi kênh chat
{ const b = document.createElement('button'); b.id = 'chBtn'; b.title = 'Đổi kênh: chung / tỷ muội'; b.textContent = '🗨'; $('chat').appendChild(b);
  b.onclick = () => { if (!me?.group) { chatCh = 'all'; return toast('Chưa kết nghĩa tỷ muội nên chỉ có kênh chung.'); } chatCh = chatCh === 'tm' ? 'all' : 'tm'; b.textContent = chatCh === 'tm' ? '💞' : '🗨'; $('chatin').placeholder = chatCh === 'tm' ? 'Nói riêng với tỷ muội… (Enter)' : 'Nói gì đó… (Enter để gửi)'; $('chat').classList.toggle('tm', chatCh === 'tm'); }; }

// ---------------- giai đoạn 3: Hoàng hậu, bầu phượng ấn, danh hiệu ----------------
function openVote() {
  const v = me.hhVote; if (!v) return toast('Hiện không bầu phượng ấn.');
  const here = world?.loc === 'tuninh';
  modal(`<button class="close" onclick="window._close()">✕</button><h3>👑 Bầu phượng ấn</h3>
  <div style="color:var(--muted);font-size:12.5px">Còn ${Math.max(1, Math.ceil((v.end - Date.now()) / 3600e3))} giờ. Điểm = số người tiến cử × 15 + hài lòng của Thái hậu + thân thiết với Thái hậu + sủng ái + hoàng tự. Mỗi người tiến cử 1 người (đổi được), không tự tiến cử mình.</div>
  <table><tr><th>Ứng cử</th><th>Tiến cử</th><th>Hoàng tự</th><th>Điểm</th><th></th></tr>${v.cands.map(c => `<tr><td>${esc(c.name)}</td><td>${c.votes}</td><td>${c.children || '–'}</td><td><b>${c.score}</b></td><td>${c.id === me.id ? '<small>bổn cung</small>' : v.mine === c.id ? '<span style="color:#e8c25a">✓ đã chọn</span>' : here ? `<button data-v="${c.id}">Tiến cử</button>` : ''}</td></tr>`).join('')}</table>
  ${here ? '' : '<div class="btns"><button class="gold" id="goTN">Đến Từ Ninh cung để tiến cử ➜</button></div>'}`);
  $('mcard').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { socket.emit('hh', { op: 'vote', who: b.dataset.v }); closeModal(); });
  const g = $('goTN'); if (g) g.onclick = () => { socket.emit('goto', 'tuninh'); closeModal(); };
}
let hhMode = null;
function openHH() {
  if (!me.isHH) return; const d = me.hhDay || {};
  modal(`<button class="close" onclick="window._close()">✕</button><h3>👑 Quyền Hoàng hậu</h3>
  <div style="color:var(--muted);font-size:12.5px">Mỗi quyền dùng 1 lần mỗi ngày. Hoàng hậu bị giáng cấp hay vào lãnh cung thì mất phượng ấn. Mỗi ngày được thêm ${100} bạc và 2 lượt.</div>
  <div class="btns" style="flex-direction:column;align-items:stretch">
    <button data-h="anxa" ${d.anxa ? 'disabled' : ''}>🕊 Ân xá<small style="display:block;color:var(--muted)">Cho một người ra khỏi cấm túc hoặc lãnh cung${d.anxa ? ' · hôm nay đã dùng' : ''}</small></button>
    <button data-h="phat" ${d.phat ? 'disabled' : ''}>🔒 Phạt cấm túc 6 giờ<small style="display:block;color:var(--muted)">Không phạt được người mang long thai hay đang được bảo hộ${d.phat ? ' · hôm nay đã dùng' : ''}</small></button>
    <button data-h="yentiec" ${d.yentiec ? 'disabled' : ''}>🎎 Thiết yến ngay<small style="display:block;color:var(--muted)">Mở yến tiệc 10 phút trong điện cho cả cung${d.yentiec ? ' · hôm nay đã dùng' : ''}</small></button>
  </div>`);
  $('mcard').querySelectorAll('[data-h]').forEach(b => b.onclick = () => { const op = b.dataset.h; if (op === 'yentiec') { socket.emit('hh', { op }); closeModal(); } else { hhMode = op; socket.emit('roster'); } });
}
socket.on('roster', r => {
  if (!hhMode) return; const op = hhMode; hhMode = null;
  const list = r.list.filter(p => p.id !== me.id && (op === 'anxa' ? (p.lanh || p.camTuc) : (!p.lanh && !p.camTuc && !p.thai)));
  modal(`<button class="close" onclick="window._close()">✕</button><h3>${op === 'anxa' ? '🕊 Ân xá cho ai?' : '🔒 Phạt ai cấm túc?'}</h3>
  ${op === 'phat' ? '<label>Lý do (cả cung sẽ đọc trên bảng tin)</label><input id="hhWhy" maxlength="40" placeholder="thất lễ với bổn cung">' : ''}
  <table>${list.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.rankName)}</td><td><button data-p="${p.id}">${op === 'anxa' ? 'Ân xá' : 'Phạt'}</button></td></tr>`).join('') || `<tr><td>${op === 'anxa' ? 'Không có ai đang bị phạt.' : 'Không có ai để phạt.'}</td></tr>`}</table>`);
  $('mcard').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { socket.emit('hh', { op, who: b.dataset.p, why: $('hhWhy')?.value || '' }); closeModal(); });
});
function openAch() {
  const A = me.ach || [];
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🏅 Danh hiệu</h3>
  <div style="color:var(--muted);font-size:12.5px">Đạt danh hiệu nào thì chọn để hiện trên đầu nhân vật cho cả cung thấy.</div>
  <table>${A.map(a => `<tr style="${a.got ? '' : 'opacity:.6'}"><td>${a.got ? '🏅' : '🔒'} <b>${esc(a.name)}</b><br><small>${esc(a.desc)}</small></td><td>${a.cur}/${a.need}</td><td>${a.got ? (me.titleSel === a.id ? '<span style="color:#e8c25a">✓ đang hiện</span>' : `<button data-t="${a.id}">Hiện</button>`) : ''}</td></tr>`).join('')}</table>
  <div class="btns">${me.titleSel ? '<button id="tOff">Ẩn danh hiệu</button>' : ''}<span style="color:var(--muted);font-size:12px;align-self:center">📅 Điểm danh liên tục: ${me.streak || 0} ngày</span></div>`);
  $('mcard').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { socket.emit('title', b.dataset.t); closeModal(); });
  const o = $('tOff'); if (o) o.onclick = () => { socket.emit('title', ''); closeModal(); };
}

// ---------------- hôm nay trong cung ----------------
function openToday() {
  const ev = me.event, k = me.htKnown || {}, hm = ([h, m]) => `${h}h${m ? String(m).padStart(2, '0') : ''}`;
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🗓 Hôm nay trong cung</h3>
  ${ev ? `<div class="today"><b>🎐 Sự kiện tuần: ${esc(ev.name)}</b><div>${esc(ev.desc)}${ev.act ? `<br>${ev.done ? '✅ Hôm nay đã tham gia' : `👉 ${esc(ev.act)} (${ev.loc === 'hoavien' ? 'Ngự hoa viên' : ev.loc === 'tuninh' ? 'Từ Ninh cung' : 'Dưỡng Tâm điện'})`}` : ''}</div></div>` : ''}
  <div class="today"><b>👑 Hoàng thượng hôm nay</b><div>Thèm canh: ${esc(k.canh || '?')} · Thích áo: ${esc(k.mau || '?')} · Muốn xem: ${esc(k.tai || '?')} · Tâm trạng: ${esc(k.mood || '?')}<br><small>Dấu ? là chưa biết: ra Ngự hoa viên dò tin.</small></div></div>
  <div class="today"><b>🏮 Lật thẻ bài</b><div>${sched ? sched.latThe.map(hm).join(' · ') : ''}<br><small>Mặc đúng màu áo Hoàng thượng thích, dâng hương mê điệp để dễ được chọn.</small></div></div>
  <div class="today"><b>🎎 Yến tiệc</b><div>${sched ? sched.feast.map(([h, m, v]) => `${hm([h, m])} ${v === 'in' ? 'trong điện' : 'ngoài trời'}`).join(' · ') : ''}</div></div>
  <div class="today"><b>📅 Điểm danh</b><div>Chuỗi ${me.streak || 0} ngày liền. Ngày thứ 7 được 200 bạc, 1 lượt, 10 sủng ái.</div></div>`);
}

// ---------------- thư từ ----------------
let mailOpen = false;
function openMail() { mailOpen = true; socket.emit('mail', { op: 'list' }); }
socket.on('mailNew', d => { toast(d.kind === 'nacdanh' ? '✉️ Có người lén đưa một lá thư nặc danh tới. Bấm ✉️ Thư ở thanh dưới để đọc.' : `✉️ ${d.kind === 'moi' ? 'Lời mời kết nghĩa' : d.kind === 'he' ? 'Tin' : 'Thư'} từ ${d.from}. Bấm ✉️ Thư ở thanh dưới để đọc.`, 'good'); });
socket.on('mailList', list => {
  if (!mailOpen) return;
  const icon = { thu: '✉️', qua: '🎁', nacdanh: '🕯', moi: '💞', he: '📜' };
  modal(`<button class="close" onclick="window._close()">✕</button><h3>✉️ Thư từ</h3>
  <div style="color:var(--muted);font-size:12.5px">Gửi thư từ <b>👥 Hậu cung</b> (nút ✉️ cạnh mỗi người). Người nhận đang offline vẫn nhận được, lúc vào game sẽ thấy.</div>
  <div class="mails">${list.map(m => `<div class="mail ${m.kind}"><div class="mh">${icon[m.kind] || '✉️'} <b>${esc(m.fromName)}</b><small>${new Date(m.t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</small></div>
    <div class="mt">${esc(m.text)}${m.silver ? `<br><b style="color:var(--gold2)">Kèm ${m.silver} bạc (đã cộng vào túi)</b>` : ''}</div>
    <div class="ma">${m.kind === 'moi' ? `<button class="gold" data-acc="${m.id}">Nhận lời</button><button data-dec="${m.id}">Từ chối</button>` : ''}${m.from ? `<button data-rep="${m.from}" data-nm="${esc(m.fromName)}">Hồi âm</button>` : ''}<button data-del="${m.id}">Xóa</button></div></div>`).join('') || '<div style="color:var(--muted);padding:12px 0">Chưa có thư nào.</div>'}</div>`);
  const mc = $('mcard');
  mc.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { socket.emit('sis', { op: 'accept', mail: b.dataset.acc }); mailOpen = false; closeModal(); });
  mc.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { socket.emit('sis', { op: 'decline', mail: b.dataset.dec }); setTimeout(openMail, 300); });
  mc.querySelectorAll('[data-rep]').forEach(b => b.onclick = () => composeMail(b.dataset.rep, b.dataset.nm));
  mc.querySelectorAll('[data-del]').forEach(b => b.onclick = () => socket.emit('mail', { op: 'del', id: b.dataset.del }));
});
function composeMail(to, name) {
  mailOpen = false;
  modal(`<button class="close" onclick="window._close()">✕</button><h3>✉️ Gửi thư cho ${esc(name || '')}</h3>
  <textarea id="mTxt" maxlength="300" rows="5" style="width:100%;box-sizing:border-box" placeholder="Viết gì đó… (tối đa 300 chữ)"></textarea>
  <label>Gửi kèm bạc (tối đa 100 mỗi ngày)</label><input id="mSil" type="number" min="0" max="100" value="0">
  <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="mAnon" style="width:auto"> Gửi nặc danh: nhờ thái giám lén đưa, người nhận không biết ai gửi (30 bạc)</label>
  <div class="btns"><button class="gold" id="mGo">Gửi thư</button></div>`);
  $('mGo').onclick = () => { socket.emit('mail', { op: 'send', to, text: $('mTxt').value, silver: +$('mSil').value || 0, anon: $('mAnon').checked }); closeModal(); };
  setTimeout(() => $('mTxt')?.focus(), 50);
}

// ---------------- thông báo đẩy ----------------
async function openPush() {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iPhone|iPad/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🔔 Thông báo</h3>
  <div style="font-size:13.5px;line-height:1.5">Khi không mở game, bổn cung vẫn được báo lúc: <b>bị phát giác tang vật</b>, <b>long thai lâm nguy</b>, <b>được lật thẻ</b>, <b>có thư mới</b>, <b>bầu phượng ấn</b>, bị giáng cấp.</div>
  ${!ok ? (ios && !standalone ? `<div class="today" style="margin-top:10px"><b>Trên iPhone</b><div>Bấm nút <b>Chia sẻ</b> của Safari, chọn <b>Thêm vào Màn hình chính</b>, rồi mở game từ biểu tượng 鳳 ngoài màn hình và bật thông báo ở đây.</div></div>` : '<div class="today" style="margin-top:10px">Trình duyệt này không hỗ trợ thông báo.</div>')
    : me.pushOn ? '<div class="btns"><button id="pTest">Đã bật ✓</button><button id="pOff">Tắt thông báo</button></div>' : '<div class="btns"><button class="gold" id="pOn">Bật thông báo</button></div>'}`);
  const on = $('pOn'); if (on) on.onclick = async () => {
    try {
      const perm = await Notification.requestPermission(); if (perm !== 'granted') return toast('Bổn cung đã chặn thông báo. Mở lại trong cài đặt trình duyệt.', 'bad');
      const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
      const key = await new Promise(r => { socket.once('pushKey', r); socket.emit('pushKey'); });
      const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)); const arr = new Uint8Array([...raw].map(c => c.charCodeAt(0)));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr });
      socket.emit('pushSub', sub.toJSON()); closeModal(); toast('Đã bật thông báo.', 'good');
    } catch (e) { toast('Không bật được thông báo: ' + e.message, 'bad'); }
  };
  const off = $('pOff'); if (off) off.onclick = async () => { try { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); await sub?.unsubscribe(); } catch {} socket.emit('pushOff'); closeModal(); };
}

// ---------------- cẩm nang ----------------
const CAMNANG = [
  ['🌱 Bắt đầu', 'Làm theo dòng <b>🎯 nhiệm vụ tân thủ</b> dưới tên nhân vật. Mỗi ngày: thỉnh an Thái hậu, luyện tài nghệ, dò tin là 3 nhiệm vụ ngày, làm đủ được thêm lượt. Lượt hồi 1 mỗi 30 phút. 3 ngày đầu mỗi ngày được thêm 2 lượt, người từ Thường tại trở xuống được thêm 30% công trạng.'],
  ['👑 Hoàng thượng', 'Mỗi ngày Hoàng thượng thèm một món canh, thích một màu áo, muốn xem một tài nghệ. Dò tin ở Ngự hoa viên để biết. Dâng đúng canh được nhiều sủng ái. Hoàng thượng <b>lật thẻ mỗi 2 tiếng từ 8h tới 22h</b>: mặc đúng màu, dâng hương mê điệp, đeo trâm phỉ thúy để dễ được chọn. Được lật thẻ thì vào tẩm cung trong 2 giờ, hầu chuyện khéo được thêm sủng.'],
  ['🎎 Yến tiệc', 'Mỗi ngày 9h, 11h (ngoài trời ở Ngự hoa viên), 15h, 17h (trong điện), mỗi buổi 20 phút. Vào ngồi, bước ra dâng tiết mục (đàn tranh, múa quạt, múa lụa, kiếm vũ, ngâm thơ, hát): hay nhất được thưởng lớn, tiệc có từ 3 loại tiết mục trở lên thì mọi người diễn được thêm sủng ái. <b>Kính rượu</b> Hoàng thượng và các tỷ muội. <b>Ra múa cùng mọi người</b>: đủ người múa cùng lúc thì Hoàng thượng thưởng. Diễn xong có <b>pháo hoa</b>, người ngồi dưới chọn <b>👏 vỗ tay, 🌸 tung hoa</b> (cộng điểm cho người diễn) hoặc <b>😒 chề môi, 🙄 quay mặt</b> (trừ điểm), nhân vật làm động tác đó. Giữa tiệc có <b>Đoàn ca vũ Giáo phường</b> biểu diễn: thị vệ múa kiếm rồi xoay người hóa áo trắng, cung nữ múa lụa. <b>Tửu lệnh</b> mỗi 4 phút: Hoàng thượng ra nửa câu thành ngữ, ai gõ vế sau vào chat nhanh nhất được thưởng rượu.'],
  ['🔍 Phá án', 'Ở Từ Ninh cung, mỗi ngày <b>nhận tra án giúp Quế ma ma</b>. Mỗi manh mối cho biết một đặc điểm thật của thủ phạm, ai không khớp bị đóng dấu LOẠI. Còn một người thì ra phiên xử. Từ Quý nhân, bổn cung có thể bị người khác vu oan: khi đó phải tự điều tra để minh oan, sai là bị giáng cấp.'],
  ['📜 Đại án (cả cung cùng tra)', 'Mỗi tuần một vụ án lớn cho cả cung. Mỗi ngày tra 2 lần ở Ngự hoa viên, Từ Ninh cung, Dưỡng Tâm điện: mỗi người nhận <b>manh mối khác nhau, chỉ mình thấy</b>. Công bố cho cả cung hoặc kể trong chat (người khác có thể nói dối!). Tin đồn ⚠️ có thể sai. Cuối hạn người bị nhiều phiếu nhất bị xử: đúng thì ai góp sức cũng được 100 bạc, 40 công trạng (bỏ phiếu đúng thêm 20).'],
  ['🏮 Đại lễ (cả cung góp sức)', '2 tuần một lần, 5 ngày. Góp bạc, thêu gấm ở phòng, chép kinh ở Từ Ninh cung, câu cá, dâng tiết mục ở yến tiệc đều cộng vào thanh tiến độ chung. Đạt 25%, 50%, 75%, 100% thì cả cung có quà (người đã góp nhận đủ, chưa góp nhận một nửa). Đủ 100% Hoàng thượng mở đại yến.'],
  ['🤰 Long thai', 'Được lật thẻ có thể mang thai. Nhờ Thái y bắt mạch, uống thuốc an thai mỗi ngày. 3 ngày sau sinh hoàng tự: lên bậc, mỗi ngày thêm 1 lượt. Kẻ khác có thể hại thai: tìm đúng hung thủ trước hạn thì giữ được.'],
  ['💞 Tỷ muội', 'Kết nghĩa tối đa 4 người: kênh chat riêng (nút 💞 ở ô chat), góp bạc may áo dâng Thái hậu, cầu tình khi tỷ muội bị phạt, cùng diễn yến tiệc được cộng điểm. Tỷ muội không được ra tay với nhau.'],
  ['✉️ Thư từ', 'Gửi thư, quà, lời mời kết nghĩa cho cả người đang offline. Thư nặc danh tốn 30 bạc. <b>🕵️ Mua chuộc</b> cung nữ nhà người khác (80 bạc/ngày) để dò bí mật: họ từng hại ai, tiến cử ai, có điều gì giấu giếm.'],
  ['👑 Ngôi Hoàng hậu', 'Từ Tần trở lên được ứng cử. Định kỳ 14 ngày cả cung tiến cử ở Từ Ninh cung trong 24 giờ. Hoàng hậu mỗi ngày được ân xá, phạt cấm túc, thiết yến. Bị giáng cấp là mất phượng ấn.'],
  ['🐟 Khi hết lượt', 'Câu cá ở hồ (miễn phí, 15 con đầu bán được bạc, cá chép vàng dâng Hoàng thượng), trò chuyện và biếu quà NPC để thân thiết, tra án, sự kiện tuần, gửi thư, ngồi đình tán gẫu.'],
];
function openGuide() {
  modal(`<button class="close" onclick="window._close()">✕</button><h3>📖 Cẩm nang hậu cung</h3>
  <div class="btns" style="margin-top:0"><button class="gold" id="gTour">Xem lại hướng dẫn nhanh</button><button id="gNew">📜 Có gì mới</button></div>
  ${CAMNANG.map(([t, x]) => `<details class="cn"><summary>${t}</summary><div>${x}</div></details>`).join('')}`);
  $('gTour').onclick = () => { closeModal(); startTour(true); };
  $('gNew').onclick = () => showUpdate(true);
}

// ---------------- ĐẠI ÁN: mỗi người một mảnh manh mối ----------------
socket.on('bigClue', c => { if (bigOpen) setTimeout(openBig, 400); else toast('📜 ' + c.text, 'good'); });
function bigAnalyse(B) {
  // manh mối chắc chắn (của mình + đã công bố, trừ tin đồn): loại người không khớp
  const sure = [...B.mine, ...B.board].filter(c => c.kind !== 'don');
  return B.sus.map(s => {
    let out = null;
    for (const c of sure) {
      if (c.kind === 'ngoai' && c.s === s.id) out = 'ngoại phạm';
      if (c.kind === 'dac' && s.t[c.k] !== c.v) out = `không có ${B.traits[c.k][c.v]}`;
    }
    return { ...s, out };
  });
}
function openBig() {
  const B = me.big; if (!B) return;
  const S = bigAnalyse(B), left = S.filter(s => !s.out);
  const chip = (s, k) => `<div class="chip">${{ cung: '🏯', gio: '🕰', dau: '👣', mau: '👘' }[k]} ${esc(B.traits[k][s.t[k]])}</div>`;
  const clue = (c, mine) => `<div class="cl ${c.kind === 'don' ? 'don' : ''}">${c.kind === 'don' ? '⚠️' : c.kind === 'ngoai' ? '🛡' : '🔎'} ${esc(c.text)}${mine ? (c.shared ? ' <small>· đã công bố</small>' : ` <button data-sh="${c.id}">📢 Công bố</button>`) : ` <small>· ${esc(c.by)} công bố</small>`}</div>`;
  modal(`<button class="close" onclick="window._close()">✕</button><h3>📜 Đại án: ${esc(B.title)}</h3>
  <div style="color:var(--muted);font-size:12.5px">${esc(B.intro)}</div>
  ${B.done ? `<div class="today" style="border-color:#e8c25a"><b>⚖️ Phán quyết</b>${esc(B.verdict)}</div>` : `<div class="today"><b>⏳ Còn ${fmtLeft(B.end - Date.now()).split(':').slice(0, 2).join(' giờ ')} phút · ${B.people} người đang tra</b>Tra ở <b>Ngự hoa viên, Từ Ninh cung, Dưỡng Tâm điện</b>: mỗi ngày tra được 2 lần ở 2 nơi khác nhau. Manh mối của mỗi người <b>khác nhau và chỉ mình thấy</b>. Công bố cho cả cung, hoặc kể trong chat (có thể nói dối!). Người không khớp manh mối chắc chắn sẽ tự bị gạch. Cuối hạn, người bị nhiều phiếu nhất bị xử.</div>`}
  <div class="bigsus">${S.map(s => `<div class="sus ${s.out ? 'out' : ''} ${B.done && s.guilty ? 'top' : ''}"><img class="pt" data-m="${esc(s.model)}" alt=""><div class="sn">${esc(s.name)}</div>${['cung', 'gio', 'dau', 'mau'].map(k => chip(s, k)).join('')}
    ${s.out ? `<div class="stamp">LOẠI</div><small class="why">${esc(s.out)}</small>` : ''}${B.done && s.guilty ? '<div class="stamp red">THỦ PHẠM</div>' : ''}
    <div class="vt">🗳 ${s.votes} phiếu ${B.done ? '' : B.vote === s.id ? '<b>✓ phiếu của bổn cung</b>' : `<button data-v="${s.id}">Buộc tội</button>`}</div></div>`).join('')}</div>
  ${!B.done && left.length === 1 && B.mine.length ? `<div class="hint">🔎 Theo manh mối chắc chắn, chỉ còn <b>${esc(left[0].name)}</b> khả nghi.</div>` : ''}
  <h4 style="margin:12px 0 4px">🗝 Manh mối của bổn cung (${B.mine.length})</h4>${B.mine.map(c => clue(c, true)).join('') || '<div class="none">Chưa có. Đi tra ở 3 nơi trên.</div>'}
  <h4 style="margin:12px 0 4px">📢 Cả cung đã công bố (${B.board.length})</h4>${B.board.filter(b => !B.mine.some(m => m.id === b.cid)).map(c => clue(c, false)).join('') || '<div class="none">Chưa ai công bố. Rủ mọi người góp manh mối trong chat.</div>'}`);
  const mc = $('mcard'); mc.classList.add('wide'); bigOpen = true;
  mc.querySelectorAll('img.pt').forEach(img => portrait(img.dataset.m).then(u => { img.src = u; }).catch(() => {}));
  mc.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { socket.emit('big', { op: 'share', cid: b.dataset.sh }); setTimeout(openBig, 400); });
  mc.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { socket.emit('big', { op: 'vote', s: b.dataset.v }); setTimeout(openBig, 400); });
}

// ---------------- ĐẠI LỄ: cả cung góp sức ----------------
socket.on('festUp', d => { if (me?.fest) { me.fest.pts = d.pts; const e = $('festPct'); if (e) e.textContent = Math.min(100, Math.floor(d.pts / d.goal * 100)) + '%'; } });
function openFest() {
  const F = me.fest; if (!F) return; const pct = Math.min(100, F.pts / F.goal * 100);
  const MILES = [[.25, '30 bạc'], [.5, '50 bạc + 1 lượt'], [.75, '80 bạc + 10 sủng ái'], [1, '150 bạc + 15 hài lòng + đại yến']];
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🏮 ${esc(F.name)}</h3>
  <div style="color:var(--muted);font-size:12.5px">${esc(F.desc)} ${F.done ? 'Đại lễ đã khép lại.' : `Còn ${Math.max(1, Math.ceil((F.end - Date.now()) / 3600e3))} giờ.`}</div>
  <div class="fbar"><i style="width:${pct}%"></i>${MILES.map(([m, t]) => `<span class="ml ${F.hit.includes(MILES.findIndex(x => x[0] === m)) ? 'ok' : ''}" style="left:${m * 100}%" title="${t}">${F.hit.includes(MILES.findIndex(x => x[0] === m)) ? '✅' : '🎁'}</span>`).join('')}</div>
  <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted)"><span><b style="color:var(--gold2)">${Math.floor(F.pts)}</b> / ${F.goal} điểm · ${F.people} người góp sức</span><span>Bổn cung góp: <b style="color:var(--gold2)">${Math.floor(F.mine)}</b></span></div>
  <div class="today"><b>🎁 Mốc thưởng cho cả cung</b>${MILES.map(([m, t]) => `${Math.round(m * 100)}%: ${t}`).join(' · ')}<br><small>Người đã góp sức nhận đủ, người chưa góp chỉ nhận một nửa.</small></div>
  <div class="today"><b>🙌 Cách góp sức</b>
    • Góp bạc: 10 bạc = 1 điểm, mỗi ngày tối đa 300 bạc (hôm nay đã góp ${F.today.silver}) ${F.done ? '' : '<span class="btns" style="display:inline-flex;margin:4px 0 0"><button data-g="50">50 bạc</button><button data-g="100">100 bạc</button><button data-g="300">300 bạc</button></span>'}<br>
    • Thêu gấm ở phòng riêng: 1 lượt, 10–30 điểm ${F.today.theu ? '✅' : ''}<br>
    • Chép kinh ở Từ Ninh cung: 1 lượt, 15 điểm ${F.today.kinh ? '✅' : ''}<br>
    • Câu cá: mỗi con +2 điểm (15 con đầu mỗi ngày, hôm nay ${F.today.fish}/15)<br>
    • Dâng tiết mục ở yến tiệc: +20 điểm</div>
  <div class="today"><b>🏅 Góp sức nhiều nhất</b>${F.top.map((t, i) => `${i + 1}. ${esc(t.name)} · ${Math.floor(t.n)}`).join('<br>') || 'Chưa ai góp.'}</div>`);
  $('mcard').querySelectorAll('[data-g]').forEach(b => b.onclick = () => { socket.emit('fest', { op: 'silver', amount: +b.dataset.g }); setTimeout(openFest, 400); });
}

// ---------------- YẾN TIỆC SÔI ĐỘNG ----------------
function cheers(c) {
  if (!c || c._cheer) return; const cup = makeCup(); world?.group.add(cup); c._cheer = cup; const prev = c.post, hp = new THREE.Vector3();
  c.post = (cc, t) => { if (prev) prev(cc, t); aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.1, .15, 1])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([0, .6, .8])); cc.root.updateMatrixWorld(true); cc.B.rHand.getWorldPosition(hp); cup.position.copy(hp); cup.position.y += .04; };
  setTimeout(() => { cup.parent?.remove(cup); c._cheer = null; if (c.post !== prev) c.post = prev; }, 2600);
}
function openRuou() {
  const ppl = [...others.values()].filter(o => o.p && o.c).map(o => o.p);
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🍶 Kính rượu</h3>
  <div style="color:var(--muted);font-size:12.5px">Kính Hoàng thượng 1 lần mỗi buổi tiệc (sủng ái +3). Kính người khác tối đa 3 chén: cả hai cùng được công trạng và thân nhau hơn.</div>
  <div class="btns" style="flex-direction:column;align-items:stretch"><button class="gold" data-to="ht">👑 Kính Hoàng thượng</button>${ppl.map(p => `<button data-to="${p.id}">🍶 Kính ${esc(p.name)}</button>`).join('') || '<div style="color:var(--muted);font-size:13px;padding:6px">Chưa có ai khác trong tiệc.</div>'}</div>`);
  $('mcard').querySelectorAll('[data-to]').forEach(b => b.onclick = () => { act('ruou', { to: b.dataset.to }); cheers(selfC); closeModal(); });
}
let dancing = false;
async function danceTogether() {
  if (dancing || mgOn || taiOn || !world?.stage || !selfC) return; dancing = true;
  const home = chairSeat; chairSeat = null; socket.emit('stand');
  const r = selfC.root; r.position.y = 0; selfC.pose = null; selfC.play('dung_cho');
  if (home) { r.position.x = home.x - Math.sin(home.ry) * .45; r.position.z = home.z - Math.cos(home.ry) * .45; }
  const walk = (x, z) => new Promise(res => { selfC.target = { x, z }; let n = 0; const iv = setInterval(() => { if (!selfC?.target || ++n > 80) { selfC && (selfC.target = null); clearInterval(iv); res(); } }, 100); });
  const S = world.stage; await walk(S.x + (Math.random() - .5) * 1.6, S.z + (Math.random() - .5) * .8);
  selfC.root.rotation.y = S.ry; const tai = ['múa', 'lụa', 'kiếm', 'lụa'][Math.floor(Math.random() * 4)];
  taiStart(selfC, tai); socket.emit('emote', 'tai:' + tai); act('dance');
  setTimeout(async () => {
    taiEnd(selfC); socket.emit('emote', 'dung_cho'); dancing = false;
    if (world?.loc === 'yentiec' && home) { await walk(Math.sign(home.x) * .55, home.z); socket.emit('sit', { seat: home.id }); }
  }, 14000);
}
// khung tửu lệnh
const tlEl = document.createElement('div'); tlEl.id = 'tuulenh'; tlEl.className = 'hidden'; document.body.appendChild(tlEl);
let tl = null;
socket.on('tuulenh', d => { tl = d; renderTL(); });
function renderTL() {
  if (!tl || world?.loc !== 'yentiec' || Date.now() > tl.end) { tlEl.classList.add('hidden'); return; }
  tlEl.classList.remove('hidden');
  tlEl.innerHTML = `<div class="tt">🍶 TỬU LỆNH · còn <b>${Math.max(0, Math.ceil((tl.end - Date.now()) / 1000))}</b> giây</div><div class="tq">${esc(tl.q)} <span>…?</span></div><div class="th">Gõ vế còn lại vào ô chat rồi Enter. Ai nhanh nhất được Hoàng thượng thưởng rượu!</div>`;
}
setInterval(() => { if (tl) renderTL(); }, 1000);
window.__mph = { kang() { openKang(world.kangs[0]); }, get renderer() { return renderer; }, get cam() { return camera.position.toArray(); }, get others() { return others; }, get selfC() { return selfC; }, get camYaw() { return camYaw; } };

// =====================================================================
// PHÁO HOA, PHẢN ỨNG KHÁN GIẢ, ĐOÀN CA VŨ GIÁO PHƯỜNG
// =====================================================================
let dotTex = null; function getDot() { if (dotTex) return dotTex; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); dotTex = new THREE.CanvasTexture(c); return dotTex; }
const PALETTE = [0xffd77a, 0xff5a5a, 0xff9ad5, 0x9ae6ff, 0xb6ff9a, 0xffffff, 0xffa63d];
function burst(x, y, z, n = 90, speed = 1.6, colors = PALETTE, life = 1.8, grav = 1.2, size = .07) {
  if (!world) return;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
  const base = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
  for (let i = 0; i < n; i++) {
    pos.set([x, y, z], i * 3); const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = speed * (.6 + Math.random() * .5);
    vel.push(new THREE.Vector3(r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp));
    const c = Math.random() < .3 ? new THREE.Color(colors[Math.floor(Math.random() * colors.length)]) : base; col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: size * 1.6, map: getDot(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; world.group.add(pts); let t = 0;
  FX.push(dt => { t += dt; const a = g.attributes.position.array; for (let i = 0; i < n; i++) { vel[i].y -= grav * dt; vel[i].multiplyScalar(1 - dt * .8); a[i * 3] += vel[i].x * dt; a[i * 3 + 1] += vel[i].y * dt; a[i * 3 + 2] += vel[i].z * dt; } g.attributes.position.needsUpdate = true; m.opacity = Math.max(0, 1 - t / life); if (t > life) { pts.parent?.remove(pts); g.dispose(); m.dispose(); return false; } });
}
function fireworks(x, z, big) {
  const k = big ? 6 : 3;
  for (let i = 0; i < k; i++) setTimeout(() => burst(x + (Math.random() - .5) * 2.4, 2.2 + Math.random() * 1.3, z + (Math.random() - .5) * 1.2, big ? 110 : 80), i * 380);
  // kim tuyến vàng rơi
  burst(x, 1.9, z, 70, .9, [0xffd77a, 0xffe9b0, 0xff9ad5], 2.6, .5, .05);
  if (music?.gong) try { music.gong(); } catch {}
}
function puff(x, z) { burst(x, .9, z, 60, .9, [0xffffff, 0xfff1d0, 0xffd77a], 1.1, -.2, .12); }

// ----- phản ứng khán giả -----
const REACTS = { khen: ['👏', 'Vỗ tay'], hoa: ['🌸', 'Tung hoa'], che: ['😒', 'Chề môi'], quay: ['🙄', 'Quay mặt đi'] };
function playReact(c, r) {
  if (!c) return; const prev = c.post; const e = REACTS[r];
  if (c.label) bubble(c.label, `${e[0]} ${r === 'khen' ? 'Hay quá!' : r === 'hoa' ? 'Tuyệt!' : r === 'che' ? 'Xì… thường thôi.' : 'Hừ!'}`);
  const hp = new THREE.Vector3(); let oldRy = null;
  if (r === 'quay') { oldRy = c.root.rotation.y; c.root.rotation.y += Math.PI; }
  c.post = (cc, t) => {
    if (prev) prev(cc, t);
    if (r === 'khen') { const s = Math.abs(Math.sin(t * 14)) * .22; aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.2, -.35, .9])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([.55 + s, .25, .7])); aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.2, -.35, .9])); aim(cc.root, cc.B.lFore, cc.B.lHand, v3([-.55 - s, .25, .7])); }
    else if (r === 'hoa') { aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.2, .7, .6])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([0, 1, .3])); }
    else if (r === 'che') { aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.3, -.5, .6])); aim(cc.root, cc.B.rFore, cc.B.rHand, v3([.8, .5, .2])); aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.3, -.5, .6])); aim(cc.root, cc.B.lFore, cc.B.lHand, v3([-.8, .4, .2])); }
    else if (r === 'quay') { aim(cc.root, cc.B.rArm, cc.B.rFore, v3([-.4, -.6, .5])); aim(cc.root, cc.B.lArm, cc.B.lFore, v3([.4, -.6, .5])); }
  };
  if (r === 'hoa') setTimeout(() => { if (!c.B?.rHand) return; c.root.updateMatrixWorld(true); c.B.rHand.getWorldPosition(hp); burst(hp.x, hp.y + .1, hp.z, 50, 1.1, [0xff9ad5, 0xffc2e2, 0xffffff, 0xffd77a], 2.4, .7, .06); }, 300);
  setTimeout(() => { if (c.post !== prev) c.post = prev; if (oldRy !== null) c.root.rotation.y = oldRy; }, 3200);
}
const reactEl = document.createElement('div'); reactEl.id = 'reactbar'; reactEl.className = 'hidden'; document.body.appendChild(reactEl);
let reactT = null;
function reactHide() { reactEl.classList.add('hidden'); clearTimeout(reactT); }
function reactAsk(target, label, key) {
  if (world?.loc !== 'yentiec') return;
  reactEl.innerHTML = `<div class="rt">${esc(label)} vừa diễn xong. Bổn cung thấy sao?</div><div class="rb">${Object.entries(REACTS).map(([k, [ic, n]]) => `<button data-r="${k}" class="${k === 'khen' || k === 'hoa' ? 'good' : 'bad'}"><span>${ic}</span>${n}</button>`).join('')}</div><div class="rbar"><i></i></div>`;
  reactEl.classList.remove('hidden'); const bar = reactEl.querySelector('.rbar i'); bar.style.transition = 'none'; bar.style.width = '100%'; requestAnimationFrame(() => { bar.style.transition = 'width 15s linear'; bar.style.width = '0%'; });
  reactEl.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { socket.emit('react', { r: b.dataset.r, to: target, k: key }); reactHide(); });
  clearTimeout(reactT); reactT = setTimeout(reactHide, 15000);
}
socket.on('react', d => { if (d.id === me?.id) playReact(selfC, d.r); else playReact(others.get(d.id)?.c, d.r); });
socket.on('perfDone', d => {
  if (world?.loc !== 'yentiec') return; const S = world.stage || { x: 0, z: -2.6 };
  fireworks(S.x, S.z, d.q > .8);
  if (d.id !== me?.id) { setTimeout(() => reactAsk(d.id, `${d.name} (${d.tai})`, String(Date.now())), 1200); watchStage(S.z, 5000); }
  else toast(d.q > .8 ? '🎆 Tiết mục xuất sắc! Pháo hoa rợp trời.' : '🎆 Diễn xong rồi! Chờ mọi người khen chê…', 'good');
});

// ----- Đoàn ca vũ Giáo phường (NPC biểu diễn) -----
const showChars = []; let showOn = false;
async function runNpcShow(at) {
  if (showOn || world?.loc !== 'yentiec') return; showOn = true;
  const w = world, S = world.stage || { x: 0, z: -2.6, ry: Math.PI }, base = S.z + 1.1;
  let t0 = at; const sleepUntil = ms => new Promise(r => setTimeout(r, Math.max(0, t0 + ms - Date.now())));
  watchStage(base, 60000); toast('🎭 Đoàn ca vũ Giáo phường vào diễn: thị vệ kiếm vũ, cung nữ múa lụa!', 'good');
  const alive = () => world === w;
  // tải trước toàn bộ diễn viên (ẩn), tới lượt thì hiện ra
  const gx = [-.9, 0, .9], cx = [-.55, .55, 0], cz = [base + .9, base + .9, base + 1.5];
  const load = (model, x, z) => spawn(model).then(c => { if (!alive()) { c.dispose(); return null; } c.root.position.set(x, 0, z); c.root.rotation.y = S.ry ?? Math.PI; c.root.visible = false; w.group.add(c.root); showChars.push(c); FX.push(dt => { if (!c.root.parent) return false; if (c.root.visible) c.update(dt); }); return c; });
  const [G, W, Gi] = await Promise.all([Promise.all(gx.map(x => load('thive', x, base))), Promise.all(gx.map(x => load('hoangthuong_dem', x, base))), Promise.all(cx.map((x, i) => load('cungnu', x, cz[i])))]);
  t0 = Math.max(at, Date.now()); watchStage(base, 40000);
  const put = c => { if (c) { c.root.visible = true; puff(c.root.position.x, c.root.position.z); } return c; };
  const drop = c => { if (!c) return; taiEnd(c); c.root.parent?.remove(c.root); c.dispose?.(); const i = showChars.indexOf(c); if (i >= 0) showChars.splice(i, 1); };
  try {
    await sleepUntil(0); if (!alive()) return;
    // 1) ba thị vệ múa kiếm
    const guards = G.map(put);
    guards.forEach(c => c && taiStart(c, 'kiếm'));
    await sleepUntil(12000); if (!alive()) return;
    // 2) xoay một vòng, khói trắng, hóa thành bộ đồ trắng của Hoàng thượng
    guards.forEach(c => { if (!c) return; taiEnd(c); c.play('dung_cho'); const r0 = c.root.rotation.y; let t = 0; FX.push(dt => { t += dt; c.root.rotation.y = r0 + Math.min(1, t / 1.2) * Math.PI * 4; return t < 1.2; }); });
    await sleepUntil(13000); if (!alive()) return;
    const whites = [];
    for (let i = 0; i < 3; i++) { burst(gx[i], 1.2, base, 40, 1.2, [0xffffff, 0xffd77a], 1, .4, .09); drop(guards[i]); whites.push(put(W[i])); }
    whites.forEach(c => c && c.play('mua', { restart: true }));
    await sleepUntil(18000); if (!alive()) return;
    // 3) cung nữ múa lụa phía trước
    const girls = Gi.map(put);
    girls.forEach(c => c && taiStart(c, 'lụa'));
    await sleepUntil(32000); if (!alive()) return;
    // 4) cúi chào, pháo hoa
    [...whites, ...girls].forEach(c => { if (!c) return; taiEnd(c); c.play('hanh_le', { restart: true }); });
    fireworks(S.x, base, true);
    await sleepUntil(36000); if (!alive()) return;
    [...whites, ...girls].forEach(c => { if (c) { puff(c.root.position.x, c.root.position.z); drop(c); } });
    reactAsk('giaophuong', 'Đoàn ca vũ Giáo phường', 'show' + at);
  } finally { showOn = false; if (world === w) [...showChars].forEach(c => { c.root.parent?.remove(c.root); }); }
}
socket.on('npcShow', d => { if (d && Date.now() < d.at + 30000) runNpcShow(d.at).catch(e => { console.error('npcShow', e); showOn = false; }); });

// =====================================================================
// NGỰ THIỆN PHÒNG: tự tay nấu món dâng Hoàng thượng (từ Quý nhân)
// =====================================================================
const RECIPES = [
  { name: 'Canh sen hạt', nl: ['hạt sen', 'táo đỏ', 'đường phèn'], cut: [], vessel: 'nồi', dish: 'chén' },
  { name: 'Canh gà hầm sâm', nl: ['gà', 'nhân sâm', 'táo đỏ'], cut: ['gà'], vessel: 'nồi', dish: 'chén' },
  { name: 'Chè tổ yến', nl: ['tổ yến', 'đường phèn', 'long nhãn'], cut: [], vessel: 'nồi', dish: 'chén' },
  { name: 'Canh cá chép', nl: ['cá chép', 'gừng', 'hành'], cut: ['cá chép', 'gừng'], vessel: 'nồi', dish: 'chén' },
  { name: 'Canh bí đao', nl: ['bí đao', 'tôm khô', 'hành'], cut: ['bí đao', 'hành'], vessel: 'nồi', dish: 'chén' },
  { name: 'Chè long nhãn', nl: ['long nhãn', 'hạt sen', 'đường phèn'], cut: [], vessel: 'nồi', dish: 'chén' },
  { name: 'Gà xào Cung Bảo', nl: ['gà', 'ớt khô', 'đậu phộng'], cut: ['gà', 'ớt khô'], vessel: 'chảo', dish: 'dĩa' },
  { name: 'Cá chép hấp gừng', nl: ['cá chép', 'gừng', 'hành'], cut: ['gừng', 'hành'], vessel: 'xửng', dish: 'dĩa' },
];
const NL_ICON = { 'hạt sen': '🪷', 'táo đỏ': '🔴', 'đường phèn': '🧊', 'gà': '🐔', 'nhân sâm': '🌿', 'tổ yến': '🪺', 'long nhãn': '🟤', 'cá chép': '🐟', 'gừng': '🫚', 'hành': '🧅', 'bí đao': '🍈', 'tôm khô': '🦐', 'ớt khô': '🌶️', 'đậu phộng': '🥜' };
const VESSEL = { 'chảo': ['🥘', 'Chảo gang (xào)', 0], 'nồi': ['🍲', 'Nồi đất (hầm, nấu canh)', 1], 'xửng': ['🧺', 'Xửng tre (hấp)', 2] };
function startSteam(o) {
  let t = 0; FX.push(dt => { if (world !== o) return false; t += dt; if (t > .35) { t = 0; for (const p of o.steamAt) burst(p.x + (Math.random() - .5) * .15, p.y, p.z, 6, .18, [0xffffff, 0xf0ece4], 1.8, -.35, .14); } });
}
const cookWalk = st => new Promise(res => { if (!selfC || !st) return res(); selfC.target = { x: st.x, z: st.z }; let n = 0; const iv = setInterval(() => { if (!selfC?.target || ++n > 70) { if (selfC) { if (selfC.target) selfC.root.position.set(st.x, 0, st.z); selfC.target = null; if (st.ry != null) selfC.root.rotation.y = st.ry; sendMove('dung_cho'); } clearInterval(iv); res(); } }, 100); });
// ---------- vòng xanh chỉ chỗ, thanh tiến độ trên đầu bếp ----------
let cookTarget = null;
function ringAt(x, y, z, r = .32) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .022, 8, 40), new THREE.MeshBasicMaterial({ color: 0x5dff4a, transparent: true, opacity: .95, depthTest: false }));
  ring.rotation.x = Math.PI / 2; ring.renderOrder = 10; g.add(ring);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.3, .9, 12), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = -.3; g.add(hit);
  world.group.add(g); let t = 0; FX.push(dt => { if (!g.parent) return false; t += dt; const k = 1 + Math.sin(t * 5) * .08; ring.scale.set(k, k, k); ring.rotation.z += dt * 1.2; });
  return { g, hit };
}
function setCookTarget(pos, label, fn) {
  clearCookTarget(); const R = ringAt(pos.x, pos.y, pos.z, pos.r);
  const d = document.createElement('div'); d.innerHTML = `<div class="cktip">${esc(label)}</div>`; const lb = new CSS2DObject(d); lb.position.set(pos.x, pos.y + .4, pos.z); world.group.add(lb);
  cookTarget = { ...R, lb, fn: () => { const f = fn; clearCookTarget(); f(); } };
}
function clearCookTarget() { if (!cookTarget) return; cookTarget.lb.element.remove(); cookTarget.lb.parent?.remove(cookTarget.lb); cookTarget.g.parent?.remove(cookTarget.g); cookTarget = null; }
function worldBar(pos, ms, label) {
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'ckwbar'; d.innerHTML = `<i></i><span>${esc(label)}</span>`; const o = new CSS2DObject(d); o.position.set(pos.x, pos.y + .45, pos.z); world.group.add(o);
    const bar = d.querySelector('i'); bar.style.width = '100%'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${ms}ms linear`; bar.style.width = '0%'; }));
    setTimeout(() => { d.remove(); o.parent?.remove(o); res(); }, ms);
  });
}
function propAt(obj, pos) { obj.scale.multiplyScalar(.6); obj.position.set(pos.x, pos.y, pos.z); world.group.add(obj); return obj; }
function flyTo(obj, to, ms) { const from = obj.position.clone(); let t = 0; return new Promise(res => FX.push(dt => { t += dt * 1000 / ms; const k = Math.min(1, t); obj.position.lerpVectors(from, to, k); obj.position.y += Math.sin(k * Math.PI) * .25; if (k >= 1) { res(); return false; } })); }
function dishLabel(obj, name) { const d = document.createElement('div'); d.innerHTML = `<div class="cktip dish">🍽 ${esc(name)}</div>`; const lb = new CSS2DObject(d); lb.position.set(0, .16, 0); obj.add(lb); obj.userData.lb = lb; return lb; }
// ảnh món ăn cho bí kíp
let dishR = null; const dishCache = new Map();
function dishSnap(name) {
  if (dishCache.has(name)) return dishCache.get(name);
  if (!dishR) { dishR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); dishR.setSize(220, 150); dishR.toneMapping = THREE.ACESFilmicToneMapping; dishR.outputColorSpace = THREE.SRGBColorSpace; }
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e0, 0x664433, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(.5, 2, 1.2); sc.add(dl);
  const d = makeDish(name); sc.add(d); const cam = new THREE.PerspectiveCamera(32, 220 / 150, .01, 5); cam.position.set(0, .3, .32); cam.lookAt(0, .02, 0);
  dishR.render(sc, cam); const url = dishR.domElement.toDataURL('image/png'); dishCache.set(name, url); return url;
}
// ---------- bí kíp nhà bếp ----------
const RECIPE_TIP = ['Hầm lửa nhỏ đến khi hạt sen bở tơi, ngọt thanh mát gan.', 'Gà ta chặt miếng, hầm cùng sâm và táo đỏ cho nước trong, bổ khí huyết.', 'Tổ yến ngâm mềm, chưng cách thủy với đường phèn, thêm long nhãn cho thơm.', 'Cá chép làm sạch, nấu cùng gừng hành cho hết tanh, nước canh trắng sữa.', 'Bí đao thái miếng, nấu với tôm khô, rắc hành xanh, giải nhiệt mùa hè.', 'Long nhãn và hạt sen nấu cùng đường phèn, an thần dễ ngủ.', 'Gà thái hạt lựu xào lửa lớn cùng ớt khô và đậu phộng, đậm đà cay thơm.', 'Cá chép để nguyên con, phủ gừng hành thái sợi, hấp cách thủy cho ngọt thịt.'];
function recipeSteps(R) { return [`🧺 Lấy nguyên liệu ở kệ: ${R.nl.join(', ')}`, `🔪 Sơ chế ở thớt: ${R.cut.length ? 'thái ' + R.cut.join(', ') : 'rửa sạch'}${R.cut.length < 3 ? ', rửa phần còn lại' : ''}`, `${VESSEL[R.vessel][0]} Cho vào ${VESSEL[R.vessel][1].toLowerCase()} trên bếp lò`, `🔥 ${R.vessel === 'chảo' ? 'Xào' : R.vessel === 'xửng' ? 'Hấp' : 'Hầm'} rồi tắt bếp đúng lúc vừa chín`, `🍽 Bày ra ${R.dish} ở bàn dọn món`, '🙇 Mang lên Dưỡng Tâm điện dâng Hoàng thượng']; }
function openBiKip(sel = null) {
  const fav = me.htKnown?.canh; let i = sel ?? Math.max(0, RECIPES.findIndex(r => r.name === fav));
  const draw = () => { const R = RECIPES[i];
    modal(`<button class="close" onclick="window._close()">✕</button><h3>📖 Bí kíp Ngự thiện</h3>
    <div class="bk"><div class="bkl">${RECIPES.map((r, k) => `<button data-i="${k}" class="${k === i ? 'on' : ''}">${r.dish === 'dĩa' ? '🍽' : '🥣'} ${esc(r.name)}${r.name === fav ? ' <b>★</b>' : ''}</button>`).join('')}</div>
    <div class="bkp"><img class="bkimg" src="${dishSnap(R.name)}" alt=""><div class="bkn">${esc(R.name)}${R.name === fav ? '<small>★ Hôm nay Hoàng thượng đang thèm</small>' : ''}</div><div class="bkt">${esc(RECIPE_TIP[i])}</div>
    <div class="bknl">${R.nl.map(n => `<span>${NL_ICON[n]} ${esc(n)}</span>`).join('')}</div>
    <ol>${recipeSteps(R).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    <div class="btns"><button class="gold" id="bkGo" ${me.dish || (me.cookN || 0) >= 3 ? 'disabled' : ''}>🍳 Nấu món này (1 lượt · 40 bạc)</button></div>${me.dish ? `<small style="color:var(--muted)">Đang có ${esc(me.dish.name)} chưa dâng.</small>` : (me.cookN || 0) >= 3 ? '<small style="color:var(--muted)">Hôm nay đã nấu đủ 3 món.</small>' : ''}</div></div>`);
    $('mcard').classList.add('wide');
    $('mcard').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { i = +b.dataset.i; draw(); });
    const go = $('bkGo'); if (go) go.onclick = () => { closeModal(); gameCook(i); };
  };
  draw();
}
// ---------- thanh công thức dưới màn hình ----------
const ckBar = document.createElement('div'); ckBar.id = 'cookbar'; ckBar.className = 'hidden'; document.body.appendChild(ckBar);
function drawCookBar(R, got, step) {
  ckBar.classList.remove('hidden');
  ckBar.innerHTML = `<img src="${dishSnap(R.name)}" alt=""><div class="cki"><b>${esc(R.name)}</b><div class="ckn">${R.nl.map(n => `<span class="${got.has(n) ? 'ok' : ''}">${NL_ICON[n]}${got.has(n) ? '✓' : ''}</span>`).join('')}</div><div class="cks">Bước ${step + 1}/6 · ${esc(recipeSteps(R)[step])}</div></div><div class="ckb"><button id="ckBook">📖</button><button id="ckQuit">✕</button></div>`;
  $('ckBook').onclick = () => openBiKip(RECIPES.indexOf(R)); $('ckQuit').onclick = () => cookAbort && cookAbort();
}
let cooking = false, cookAbort = null;
async function gameCook(ri) {
  if (ri == null) return openBiKip();
  if (mgOn || cooking || world?.loc !== 'ngutien' || !selfC) return;
  if (me.dish) return toast(`Đang có ${me.dish.name}, mang lên Dưỡng Tâm điện dâng trước đã.`);
  if ((me.cookN || 0) >= 3) return toast('Hôm nay đã nấu 3 món rồi.'); if (me.turns < 1) return toast('Hết lượt.', 'bad'); if (me.silver < 40) return toast('Cần 40 bạc mua nguyên liệu.', 'bad');
  const R = RECIPES[ri], K = world.kst, w = world; let mistakes = 0, step = 0; const got = new Set(), props = [];
  cooking = true; kitchenCam(true);
  let aborted = false; cookAbort = () => { aborted = true; done(); };
  const done = () => { cooking = false; cookAbort = null; kitchenCam(false); clearCookTarget(); ckBar.classList.add('hidden'); props.forEach(p => p.parent?.remove(p)); if (mgOn) mgClose(); if (selfC && taiOn) { taiEnd(selfC); socket.emit('emote', 'dung_cho'); } };
  const goStation = async (st, ring, label) => { drawCookBar(R, got, step); await new Promise(res => setCookTarget(ring, label, res)); if (aborted || world !== w) throw 'quit'; await cookWalk(st); if (aborted || world !== w) throw 'quit'; };
  const board = w.board, serve = w.servePt, vIdx = VESSEL[R.vessel][2], vPos = { x: K.stove[vIdx].x, y: R.vessel === 'nồi' ? .8 : .68, z: w.steamAt[vIdx].z };
  try {
    // 1) kệ nguyên liệu
    await goStation(K.shelf, { x: K.shelf.x + .45, y: .62, z: K.shelf.z, r: .35 }, 'Lấy nguyên liệu');
    const pool = Object.keys(NL_ICON).sort(() => Math.random() - .5);
    await new Promise((res, rej) => {
      const draw = () => { mgOpen(`<div class="mgt">🧺 Lấy đủ nguyên liệu cho <b>${esc(R.name)}</b> <small>(${got.size}/3${mistakes ? ` · lấy nhầm ${mistakes}` : ''})</small></div><div class="row wrap nlgrid">${pool.map(k => `<button data-n="${esc(k)}" ${got.has(k) ? 'class="gold" disabled' : ''}><span>${NL_ICON[k]}</span>${esc(k)}</button>`).join('')}<button data-x>✕</button></div>`);
        mgEl.querySelector('[data-x]').onclick = () => rej('quit');
        mgEl.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { const k = b.dataset.n; if (R.nl.includes(k)) { got.add(k); drawCookBar(R, got, step); selfC.play('cui_chao', { restart: true }); if (got.size >= 3) { mgClose(); res(); } else draw(); } else { mistakes++; b.classList.add('wrong'); b.disabled = true; toast(`Ngự trù: "${k} không có trong bí kíp món này đâu chủ tử!"`); } }); };
      draw();
    });
    // 2) thớt: nguyên liệu hiện ra, thái từng thứ
    step = 1; await goStation(K.board, { x: board.x, y: board.y + .02, z: board.z, r: .25 }, 'Sơ chế');
    const items = R.nl.map((n, k) => propAt(makeIngredient(n), { x: board.x - .08 + k * .08, y: board.y, z: board.z + (k - 1) * .07 }));
    props.push(...items);
    for (let k = 0; k < 3; k++) { const n = R.nl[k], cut = R.cut.includes(n);
      taiStart(selfC, 'thai'); socket.emit('emote', 'tai:thai');
      await worldBar({ x: board.x, y: board.y, z: board.z }, cut ? 1600 : 900, cut ? `Thái ${n}` : `Rửa ${n}`);
      taiEnd(selfC); socket.emit('emote', 'dung_cho'); if (aborted) throw 'quit';
      if (cut) { const p = items[k]; const c = makeIngredient(n, true); c.scale.setScalar(.6); c.position.copy(p.position); p.parent?.remove(p); w.group.add(c); items[k] = c; props.push(c); }
    }
    // 3) bếp lò: cho vào nồi/chảo/xửng
    step = 2; await goStation(K.stove[vIdx], { ...vPos, r: .3 }, `Cho vào ${R.vessel}`);
    // nguyên liệu bay từ thớt vào nồi
    await Promise.all(items.map((p, k) => new Promise(r => setTimeout(() => flyTo(p, new THREE.Vector3(vPos.x, vPos.y - .1, vPos.z), 700).then(() => { p.visible = false; r(); }), k * 180))));
    step = 3; drawCookBar(R, got, step);
    taiStart(selfC, 'nau'); socket.emit('emote', 'tai:nau');
    const steamOn = { on: true }; let st = 0; FX.push(dt => { if (!steamOn.on || world !== w) return false; st += dt; if (st > .15) { st = 0; burst(vPos.x, vPos.y + .05, vPos.z, 8, .3, [0xffffff, 0xfff0d8], 1.4, -.5, .16); } });
    await worldBar(vPos, 2000, R.vessel === 'chảo' ? 'Đang xào' : R.vessel === 'xửng' ? 'Đang hấp' : 'Đang hầm');
    const heat = await new Promise(res => {
      let k = 0, dir = 1, raf; const zone = .45 + Math.random() * .25;
      mgOpen(`<div class="mgt">🔥 Canh lửa: bấm <b>Tắt bếp</b> khi kim vào vùng xanh (vừa chín) · phím cách</div><div class="heat"><div class="ok"></div><div class="nd"></div></div><div class="row"><button class="gold" id="ckOff">Tắt bếp</button></div>`);
      mgEl.querySelector('.ok').style.left = (zone - .1) * 100 + '%'; const nd = mgEl.querySelector('.nd');
      const loop = () => { k += dir * .016; if (k > 1) { k = 1; dir = -1; } if (k < 0) { k = 0; dir = 1; } nd.style.left = k * 100 + '%'; raf = requestAnimationFrame(loop); };
      const stop = () => { cancelAnimationFrame(raf); removeEventListener('keydown', key); const h = Math.max(0, 1 - Math.abs(k - zone) * 4); mgEl.querySelector('.heat').classList.add(h > .6 ? 'good' : 'bad'); toast(h > .8 ? 'Vừa chín tới, thơm nức!' : h > .5 ? 'Chín rồi, hơi lố một chút.' : k < zone ? 'Hơi sống…' : 'Cháy mất rồi!'); setTimeout(() => { mgClose(); res(h); }, 700); };
      const key = e => { if (e.code === 'Space') { e.preventDefault(); stop(); } }; addEventListener('keydown', key);
      mgEl.querySelector('#ckOff').onclick = stop; raf = requestAnimationFrame(loop);
    });
    steamOn.on = false; taiEnd(selfC); socket.emit('emote', 'dung_cho');
    // 4) bàn dọn món: món hiện ra trong chén/dĩa
    step = 4; await goStation(K.serve, { x: serve.x, y: serve.y + .02, z: serve.z, r: .22 }, `Bày ra ${R.dish}`);
    await worldBar(serve, 1200, `Bày ra ${R.dish}`);
    const dish = propAt(makeDish(R.name), { x: serve.x, y: serve.y, z: serve.z }); props.push(dish); dishLabel(dish, R.name);
    burst(serve.x, serve.y + .15, serve.z, 40, .7, [0xffd77a, 0xffffff], 1.3, .3, .06);
    const q = Math.max(0, Math.min(1, .4 + heat * .6 - mistakes * .15));
    act('nauan', { r: ri, q }); step = 5; drawCookBar(R, got, step);
    await new Promise(r => setTimeout(r, 1300));
    dish.userData.lb?.element.remove(); dish.parent?.remove(dish);
    taiStart(selfC, 'bung:' + ri); socket.emit('emote', 'tai:bung:' + ri);
    mgOpen(`<div class="mgt">✨ <b>${esc(R.name)}</b> đã xong · ${q > .85 ? 'tuyệt hảo' : q > .6 ? 'ngon' : 'hơi vụng'}. Mang lên Dưỡng Tâm điện dâng Hoàng thượng trong 2 giờ kẻo nguội.</div><div class="row"><button class="gold" id="ckGo">Mang lên Dưỡng Tâm điện ➜</button><button id="ckStay">Ở lại</button></div>`);
    await new Promise(res => { mgEl.querySelector('#ckGo').onclick = () => { socket.emit('goto', 'duongtam'); res(); }; mgEl.querySelector('#ckStay').onclick = res; });
    done();
  } catch (e) { done(); if (e !== 'quit') console.error(e); }
}

// =====================================================================
// THỊ TẨM: chuẩn bị, tâu chuyện, đối thơ, tín vật, tranh sủng, nhật ký
// =====================================================================
const PREP_UI = { hoa: ['🛁 Tắm hoa', ['🌹 Cánh hồng', '🤍 Hoa nhài', '🪷 Hoa sen']], ao: ['👘 Áo ngủ', ['💗 Lụa hồng thắm', '🤍 Lụa trắng mỏng', '🌺 Gấm thêu mẫu đơn']], huong: ['🪔 Hương xông', ['🟤 Trầm hương', '🌸 Hương lan', '❄️ Hương mai thanh']] };
function openPrep() {
  const sel = { hoa: 0, ao: 0, huong: 0 }, mood = me.htKnown?.mood;
  const draw = () => {
    modal(`<button class="close" onclick="window._close()">✕</button><h3>🌸 Chuẩn bị thị tẩm</h3>
    <div style="color:var(--muted);font-size:12.5px">Chọn hợp tâm trạng Hoàng thượng thì được thêm sủng ái và đêm hầu chuyện suôn sẻ hơn. ${mood ? `Nghe nói hôm nay người <b style="color:var(--gold2)">${esc(mood)}</b>.` : 'Chưa biết hôm nay người vui hay mệt, dò tin ở Ngự hoa viên để biết.'}<br><small>Gợi ý: vui thì rực rỡ, mệt thì nhẹ nhàng thư thái, buồn thì thanh tao.</small></div>
    ${Object.entries(PREP_UI).map(([k, [t, opts]]) => `<div class="today"><b>${t}</b><div class="btns" style="margin:4px 0 0">${opts.map((o, i) => `<button data-k="${k}" data-i="${i}" class="${sel[k] === i ? 'gold' : ''}">${o}</button>`).join('')}</div></div>`).join('')}
    <div class="btns"><button class="gold" id="prGo">Xong, chờ Hoàng thượng</button></div>`);
    $('mcard').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { sel[b.dataset.k] = +b.dataset.i; draw(); });
    $('prGo').onclick = () => { act('chuanbi', sel); closeModal(); if (selfC) { const c = selfC.root; burst(c.position.x, 1.2, c.position.z, 50, .7, [0xffc2e2, 0xffffff, 0xff9ad5], 2, .2, .07); } };
  };
  draw();
}
function openTau() {
  if (me.night?.tau || !me.htTalked) return;
  rosterSilent = true; socket.emit('roster'); socket.once('roster', r => { rosterSilent = false;
    const others2 = r.list.filter(p => p.id !== me.id);
    const sis = others2.filter(p => me.group?.members.some(m => m.id === p.id) && !p.lanh), lanh = others2.filter(p => p.lanh), foes = others2.filter(p => !p.lanh && !me.group?.members.some(m => m.id === p.id));
    const row = (p, kind, lb) => `<button data-w="${p.id}" data-k="${kind}">${lb} ${esc(p.name)}</button>`;
    setTimeout(() => {
      modal(`<button class="close" onclick="window._close()">✕</button><h3>🗣 Gối đầu tâu chuyện</h3><div style="color:var(--muted);font-size:12.5px">Mỗi đêm chỉ tâu một chuyện. Nói xấu người khác có thể bị Hoàng thượng cho là đố kỵ.</div>
      <div class="today"><b>💞 Tiến cử tỷ muội</b> (+30 công trạng cho người đó)<div class="btns" style="margin:4px 0 0;flex-wrap:wrap">${sis.map(p => row(p, 'thangcap', '💞')).join('') || '<small>Chưa có tỷ muội kết nghĩa.</small>'}</div></div>
      <div class="today"><b>🙏 Xin tha người ở lãnh cung</b> (+1 tiến độ phục vị)<div class="btns" style="margin:4px 0 0;flex-wrap:wrap">${lanh.map(p => row(p, 'thalanh', '🙏')).join('') || '<small>Không ai ở lãnh cung.</small>'}</div></div>
      <div class="today"><b>🐍 Thì thầm nói xấu</b> (thành công: người đó -15 sủng ái · lộ: bổn cung -10)<div class="btns" style="margin:4px 0 0;flex-wrap:wrap">${foes.map(p => row(p, 'noixau', '🐍')).join('') || '<small>Không có ai.</small>'}</div></div>`);
      $('mcard').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { act('tauchuyen', { who: b.dataset.w, kind: b.dataset.k }); closeModal(); });
    }, 50);
  });
}
const DOI_THO_C = [
  ['Sàng tiền minh nguyệt quang', 'Nghi thị địa thượng sương', ['Xứ xứ văn đề điểu', 'Hoàng Hà nhập hải lưu']],
  ['Cử đầu vọng minh nguyệt', 'Đê đầu tư cố hương', ['Dạ bán chung thanh đáo khách thuyền', 'Phục chiếu thanh đài thượng']],
  ['Xuân miên bất giác hiểu', 'Xứ xứ văn đề điểu', ['Nghi thị địa thượng sương', 'Đãn văn nhân ngữ hưởng']],
  ['Dạ lai phong vũ thanh', 'Hoa lạc tri đa thiểu', ['Cánh thượng nhất tầng lâu', 'Đê đầu tư cố hương']],
  ['Bạch nhật y sơn tận', 'Hoàng Hà nhập hải lưu', ['Hoa lạc tri đa thiểu', 'Giang phong ngư hỏa đối sầu miên']],
  ['Dục cùng thiên lý mục', 'Cánh thượng nhất tầng lâu', ['Xuân miên bất giác hiểu', 'Nghi thị địa thượng sương']],
  ['Không sơn bất kiến nhân', 'Đãn văn nhân ngữ hưởng', ['Hoàng Hà nhập hải lưu', 'Dạ lai phong vũ thanh']],
  ['Nguyệt lạc ô đề sương mãn thiên', 'Giang phong ngư hỏa đối sầu miên', ['Cử đầu vọng minh nguyệt', 'Phản cảnh nhập thâm lâm']],
];
async function gameDoiTho() {
  if (me.night?.tho) return; const qs = [...DOI_THO_C].sort(() => Math.random() - .5).slice(0, 3); let ok = 0;
  await say('hoangthuong_dem', 'Hoàng thượng', 'Trăng đêm nay đẹp quá. Trẫm đọc câu trên, nàng đối câu dưới nhé.', [['Thần thiếp xin hầu', 0, 'gold']]);
  for (const [a, b, wrong] of qs) {
    const opts = [b, ...wrong].sort(() => Math.random() - .5);
    const i = await say('hoangthuong_dem', 'Hoàng thượng', `<i>“${esc(a)}…”</i>`, opts.map((o, k) => [esc(o), k, '']));
    if (opts[i] === b) { ok++; htGesture('nam_tay'); } else toast(`Câu đúng là: “${b}”`);
  }
  dlgClose(); act('doitho', { ok });
}
function openTinVat() {
  const ALL = ['Ngọc bội song ngư', 'Quạt đề thơ ngự bút', 'Trâm bạch ngọc', 'Hộp phấn Tô Châu', 'Khăn lụa thêu long phượng', 'Chuỗi trầm hương', 'Gương đồng chạm hoa', 'Bức họa chân dung'];
  const IC = ['🐟', '🪭', '🪮', '🧴', '🧣', '📿', '🪞', '🖼'], tv = me.tinvat || {};
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🎁 Tín vật Hoàng thượng ban</h3><div style="color:var(--muted);font-size:12.5px">Mỗi đêm hầu chuyện xong, sáng ra Hoàng thượng ban một tín vật. Gom đủ 8 món được danh hiệu "Châu ngọc mãn lâu".</div>
  <div class="tvgrid">${ALL.map((n, i) => `<div class="tv ${tv[n] ? '' : 'no'}"><span>${tv[n] ? IC[i] : '❔'}</span>${tv[n] ? esc(n) : '???'}${tv[n] > 1 ? `<small>×${tv[n]}</small>` : ''}</div>`).join('')}</div>`);
}
function openDiary() {
  const D = me.diary || [];
  modal(`<button class="close" onclick="window._close()">✕</button><h3>📔 Nhật ký sủng hạnh</h3>
  <div class="diary">${D.map(d => `<div class="dl"><small>${new Date(d.t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>${esc(d.text)}</div>`).join('') || '<div style="color:var(--muted)">Chưa có trang nào. Được lật thẻ bài sẽ có kỷ niệm đầu tiên.</div>'}</div>`);
}
// bị người khác giả bệnh kéo Hoàng thượng đi
socket.on('keoHT', d => {
  let n = 0; const need = 6;
  modal(`<h3>🌙 Có biến giữa đêm!</h3><div style="font-size:13.5px">${esc(d.from)} hớt hải chạy tới: <i>"Chủ tử nhà nô tỳ đau bụng dữ dội, xin Hoàng thượng qua xem!"</i><br>Hoàng thượng đứng dậy định đi… Bấm thật nhanh để <b>níu tay giữ người lại</b>!</div>
  <div class="ckbar" style="margin-top:10px"><i id="kpBar" style="width:0%;transition:width .15s"></i><span id="kpT">0/${need}</span></div>
  <div class="btns"><button class="gold big" id="kpBtn">💕 Níu tay Hoàng thượng</button></div><div style="color:var(--muted);font-size:12px">Còn <b id="kpS">20</b> giây</div>`);
  const fin = () => { clearInterval(iv); act('giuchan', { q: n / need }); closeModal(); };
  $('kpBtn').onclick = () => { n++; $('kpBar').style.width = Math.min(100, n / need * 100) + '%'; $('kpT').textContent = `${n}/${need}`; htGesture('dung_cho_nam'); if (n >= need) fin(); };
  const iv = setInterval(() => { const l = Math.ceil((d.until - Date.now()) / 1000); const e = $('kpS'); if (e) e.textContent = Math.max(0, l); if (l <= 0) fin(); }, 300);
});
socket.on('keoKet', () => showScroll('Đêm dài', 'Hoàng thượng đã bỏ đi giữa đêm… Trong cung, ai cũng biết chuyện này. Lần sau nhớ giữ chân người cho chặt.', [['Lau nước mắt', () => { hideCut(); emote('khoc'); }]]));

// =====================================================================
// CUNG RIÊNG: ngồi đôn, giường (ngồi, nằm, cáo bệnh), mời bạn thưởng trà
// =====================================================================
let lying = false;
function roomSeats(o) {
  if (!o || o.loc !== 'phong') return;
  const L = decor.list || [], tables = L.filter(d => d.item === 'banTra'); o.seats = []; o.myBed = null; o.kangs = [];
  L.forEach((d, i) => {
    if (d.item === 'ghedon') { const t = tables.sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z))[0]; const ry = t && Math.hypot(t.x - d.x, t.z - d.z) < 1.4 ? Math.atan2(t.x - d.x, t.z - d.z) : d.ry; o.seats.push({ id: 'd' + i, x: d.x, z: d.z, ry, top: .22, kind: 'chair', obj: d.obj }); }
    if (d.item === 'lahan') { const c = Math.cos(d.ry), sn = Math.sin(d.ry), at = lx => ({ x: d.x + lx * c + .06 * sn, z: d.z - lx * sn + .06 * c });
      const a = at(-.56), b = at(.56), K = { i, obj: d.obj, board: d.obj.userData.board, seats: ['k' + i + 'a', 'k' + i + 'b'] }; o.kangs.push(K);
      o.seats.push({ id: K.seats[0], ...a, ry: d.ry + Math.PI / 2, top: .36, kind: 'chair', obj: new THREE.Object3D() }, { id: K.seats[1], ...b, ry: d.ry - Math.PI / 2, top: .36, kind: 'chair', obj: new THREE.Object3D() }); }
    if (d.item === 'giuong' && !o.myBed) { const c = Math.cos(d.ry), sn = Math.sin(d.ry); o.myBed = { obj: d.obj, x: d.x, z: d.z, ry: d.ry, c, s: sn }; o.seats.push({ id: 'b0', x: d.x + sn * .22, z: d.z + c * .22, ry: d.ry, top: .32, kind: 'chair', obj: new THREE.Object3D() }); }
  });
  o.blocks = [...(o.blocks || []).filter(b => !b.decor), ...L.filter(d => d.item !== 'tham').map(d => ({ x: d.x, z: d.z, r: d.item === 'giuong' ? .6 : d.item === 'lahan' ? .55 : d.item === 'ghedon' ? .12 : .28, decor: 1 }))];
}
function lieOn(c) {
  const B = world?.myBed; if (!B || !c) return;
  c.pose = null; c.play('dung_cho'); const r = c.root; r.rotation.order = 'YXZ';
  r.rotation.set(-Math.PI / 2, B.ry + Math.PI / 2, 0);
  r.position.set(B.x + B.c * .5, .4, B.z - B.s * .5);
}
function openMyBed() {
  const B = world?.myBed; if (!B || me.visit) return;
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🛏 Giường</h3>
  <div class="btns" style="flex-direction:column;align-items:stretch">
    <button data-b="sit">🪑 Ngồi mép giường</button>
    <button data-b="lie">😴 Nằm nghỉ</button>
    <button data-b="sick" ${me.selfSickDay ? 'disabled' : ''}>🤒 Cáo bệnh nằm nghỉ<small style="display:block;color:var(--muted)">${me.selfSickDay ? 'Hôm nay đã cáo bệnh rồi' : '2 giờ không ai ra tay được, nhưng Hoàng thượng cũng không lật thẻ · mỗi ngày 1 lần'}</small></button>
  </div>`);
  $('mcard').querySelectorAll('[data-b]').forEach(b => b.onclick = () => { closeModal(); const k = b.dataset.b;
    if (k === 'sit') return socket.emit('sit', { seat: 'b0' });
    if (chairSeat) { chairSeat = null; socket.emit('stand'); }
    lying = true; lieOn(selfC); socket.emit('nam', { on: true, sick: k === 'sick' ? true : undefined }); renderActs();
  });
}
function getUp() {
  if (!lying || !selfC) return; lying = false; const B = world.myBed, r = selfC.root;
  r.rotation.x = 0; r.rotation.y = B ? B.ry : r.rotation.y; if (B) r.position.set(B.x + B.s * .65, 0, B.z + B.c * .65); else r.position.y = 0;
  selfC.play('dung_cho'); socket.emit('nam', { on: false, sick: false }); sendMove('dung_cho'); renderActs();
}
socket.on('me', m => { if (lying && !m.lying && world?.loc === 'phong') { lying = false; if (selfC) selfC.root.rotation.x = 0; } });
function inviteTra() {
  rosterSilent = true; socket.emit('roster'); socket.once('roster', r => { rosterSilent = false;
    const list = r.list.filter(p => p.id !== me.id && !p.lanh);
    modal(`<button class="close" onclick="window._close()">✕</button><h3>🍵 Mời ai sang thưởng trà?</h3><div style="color:var(--muted);font-size:12.5px">Người đang online sẽ nhận lời mời, người offline nhận thư.</div>
    <table>${list.map(p => `<tr><td>${p.online ? '🟢' : '⚪'} ${esc(p.name)}</td><td>${esc(p.rankName)}</td><td><button data-w="${p.id}">Mời</button></td></tr>`).join('')}</table>`);
    $('mcard').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { socket.emit('tra', { op: 'invite', who: b.dataset.w }); b.disabled = true; b.textContent = 'Đã mời'; });
  });
}
socket.on('traInvite', d => {
  modal(`<h3>🍵 Lời mời thưởng trà</h3><div style="font-size:14px">Cung nữ của <b>${esc(d.name)}</b> sang thưa: "Chủ tử nhà nô tỳ mời chủ tử qua cung thưởng trà ạ."</div>
  <div class="btns"><button class="gold" id="trOk">Sang ngay</button><button id="trNo">Để lần khác</button></div>`);
  $('trOk').onclick = () => { closeModal(); socket.emit('tra', { op: 'accept', host: d.host }); };
  $('trNo').onclick = closeModal;
});
socket.on('traCheers', d => { for (const id of d.ids) { const c = id === me?.id ? selfC : others.get(id)?.c; if (c) cheers(c); } });

// =====================================================================
// SẬP LA HÁN: ngồi, uống trà, đánh cờ vây (với cung nữ hoặc người cùng phòng)
// =====================================================================
function openKang(K) {
  const ppl = [...others.values()].filter(o => o.p && o.c).map(o => o.p);
  const mySide = chairSeat && K.seats.includes(chairSeat.id);
  modal(`<button class="close" onclick="window._close()">✕</button><h3>🪷 Sập La Hán</h3>
  <div class="btns" style="flex-direction:column;align-items:stretch">
    ${mySide ? '<button data-k="tea">🍵 Nâng chén trà</button><button data-k="up">🧍 Đứng dậy</button>' : '<button data-k="a">🪑 Ngồi bên trái</button><button data-k="b">🪑 Ngồi bên phải</button>'}
    <button data-k="ai" class="gold">⚫⚪ Đánh cờ vây với cung nữ</button>
    ${ppl.map(p => `<button data-w="${p.id}">⚫⚪ Mời ${esc(p.name)} đánh cờ</button>`).join('')}
  </div><div style="color:var(--muted);font-size:12px">Cờ vây 9×9: bao vây quân đối phương để bắt, cuối ván ai chiếm nhiều đất hơn thì thắng. Hai bên cùng bỏ lượt là hết ván.</div>`);
  $('mcard').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { closeModal(); const k = b.dataset.k;
    if (k === 'a' || k === 'b') return socket.emit('sit', { seat: K.seats[k === 'a' ? 0 : 1] });
    if (k === 'up') return standChair();
    if (k === 'tea') { cheers(selfC); socket.emit('emote', 'tai:rượu'); return; }
    if (k === 'ai') { if (!mySide) socket.emit('sit', { seat: K.seats[0] }); return goOpen({ K, ai: true, my: 1, names: [me.name, 'Cung nữ Tiểu Thúy'] }); }
  });
  $('mcard').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { closeModal(); if (!mySide) socket.emit('sit', { seat: K.seats[0] }); socket.emit('co', { op: 'invite', who: b.dataset.w, k: K.i }); });
}
socket.on('coInvite', d => {
  modal(`<h3>⚫⚪ Lời mời đánh cờ</h3><div style="font-size:14px"><b>${esc(d.name)}</b> mời bổn cung một ván cờ vây trên sập La Hán.</div><div class="btns"><button class="gold" id="coOk">Nhận lời</button><button id="coNo">Để khi khác</button></div>`);
  $('coOk').onclick = () => { closeModal(); const K = world?.kangs?.find(k => k.i === d.k); if (K) socket.emit('sit', { seat: K.seats[1] }); socket.emit('co', { op: 'accept', from: d.from, k: d.k }); };
  $('coNo').onclick = closeModal;
});
let GOV = null; // ván đang xem/chơi
function goStones(K, g) {
  if (!K?.board) return; const B = K.board; [...B.children].slice(2).forEach(c => B.remove(c));
  const blk = goStones.b || (goStones.b = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: .25 })), wht = goStones.w || (goStones.w = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: .3 })), geo = goStones.g || (goStones.g = new THREE.SphereGeometry(.0135, 10, 6));
  g.b.forEach((v, i) => { if (!v) return; const m = new THREE.Mesh(geo, v === 1 ? blk : wht); m.scale.y = .45; m.position.set(((i % 9) - 4) * .0315, .022, (((i / 9) | 0) - 4) * .0315); B.add(m); });
}
function goOpen(o) { GOV = { ...o, g: GOL.newGame() }; goStones(o.K, GOV.g); goDraw(); if (o.ai && GOV.my !== 1) setTimeout(goAI, 600); }
function goDraw(msg) {
  const V = GOV; if (!V) return; const g = V.g, S = 300, c = S / 10;
  const turnName = g.turn === 1 ? V.names[0] : V.names[1];
  modal(`<h3>⚫⚪ Cờ vây · ${esc(V.names[0])} (đen) đấu ${esc(V.names[1])} (trắng)</h3>
  <div style="font-size:12.5px;color:var(--muted)">${g.over ? '' : `Lượt: <b style="color:var(--gold2)">${g.turn === 1 ? '⚫' : '⚪'} ${esc(turnName)}</b>${g.turn === V.my ? ' (bổn cung)' : ''} · `}Bắt được: ⚫ ${g.cap[1]} · ⚪ ${g.cap[2]}${msg ? ` · ${esc(msg)}` : ''}</div>
  <canvas id="goC" width="${S}" height="${S}" style="display:block;margin:8px auto;border-radius:8px;cursor:pointer;max-width:100%"></canvas>
  <div class="btns">${g.over ? '<button class="gold" id="goX">Đóng</button>' : `<button id="goP" ${g.turn !== V.my ? 'disabled' : ''}>Bỏ lượt</button><button id="goR">Chịu thua</button><button id="goX">Thu nhỏ</button>`}</div>`);
  const cv = $('goC'), x = cv.getContext('2d');
  x.fillStyle = '#dcae62'; x.fillRect(0, 0, S, S); x.strokeStyle = '#3a2410'; x.lineWidth = 1;
  for (let k = 0; k < 9; k++) { x.beginPath(); x.moveTo(c, c + k * c); x.lineTo(9 * c, c + k * c); x.stroke(); x.beginPath(); x.moveTo(c + k * c, c); x.lineTo(c + k * c, 9 * c); x.stroke(); }
  x.fillStyle = '#3a2410'; for (const [a, b] of [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]]) { x.beginPath(); x.arc(c + a * c, c + b * c, 3, 0, 7); x.fill(); }
  g.b.forEach((v, i) => { if (!v) return; const px = c + (i % 9) * c, py = c + ((i / 9) | 0) * c; const gr = x.createRadialGradient(px - 4, py - 4, 2, px, py, c * .45); if (v === 1) { gr.addColorStop(0, '#666'); gr.addColorStop(1, '#0a0a0a'); } else { gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#cfcac0'); } x.fillStyle = gr; x.beginPath(); x.arc(px, py, c * .45, 0, 7); x.fill(); });
  if (V.last != null && V.last >= 0) { x.strokeStyle = '#d23a2a'; x.lineWidth = 2; x.beginPath(); x.arc(c + (V.last % 9) * c, c + ((V.last / 9) | 0) * c, c * .2, 0, 7); x.stroke(); }
  cv.onclick = e => { if (g.over || g.turn !== V.my) return; const r = cv.getBoundingClientRect(), sx = S / r.width; const i = Math.round((e.clientX - r.left) * sx / c) - 1, j = Math.round((e.clientY - r.top) * sx / c) - 1; if (i < 0 || j < 0 || i > 8 || j > 8) return; goMove(j * 9 + i); };
  const P = $('goP'); if (P) P.onclick = () => goMove(-1);
  const Rz = $('goR'); if (Rz) Rz.onclick = () => { if (!confirm('Chịu thua ván này?')) return; if (V.ai) goFinish(false, 'Bổn cung chịu thua.'); else socket.emit('co', { op: 'move', id: V.id, resign: true }); };
  $('goX').onclick = () => { closeModal(); if (g.over) GOV = null; };
}
function goMove(i) {
  const V = GOV; if (!V) return;
  if (!V.ai) { if (i >= 0 && !GOL.legal(V.g, i)) return toast('Không đặt được ở đây (tự sát hoặc cướp ko).'); return socket.emit('co', { op: 'move', id: V.id, i }); }
  if (GOL.play(V.g, i) === null) return toast('Không đặt được ở đây (tự sát hoặc cướp ko).');
  V.last = i; goStones(V.K, V.g); if (V.g.over) return goEndAI(); goDraw(i < 0 ? 'Bổn cung bỏ lượt' : ''); setTimeout(goAI, 500 + Math.random() * 500);
}
function goAI() { const V = GOV; if (!V?.ai || V.g.over) return; const m = GOL.aiMove(V.g); GOL.play(V.g, m); V.last = m; goStones(V.K, V.g); if (V.g.over) return goEndAI(); goDraw(m < 0 ? 'Cung nữ bỏ lượt' : ''); }
function goEndAI() { const s = GOL.score(GOV.g); goFinish(s.winner === GOV.my, `Đếm đất: đen ${s.black}, trắng ${s.white} (chấp 5.5).`); }
function goFinish(win, text) { const V = GOV; V.g.over = true; socket.emit('co', { op: 'ai', win }); goDraw(text + (win ? ' Bổn cung thắng!' : ' Cung nữ thắng.')); if (win) fireworksSmall(); }
function fireworksSmall() { if (selfC) { const p = selfC.root.position; burst(p.x, 1.1, p.z, 50, .8, [0xffd77a, 0xffffff], 1.4, .3, .06); } }
socket.on('coStart', d => {
  const K = world?.kangs?.find(k => k.i === d.k), my = d.black.id === me.id ? 1 : d.white.id === me.id ? 2 : 0;
  const V = { id: d.id, K, my, names: [d.black.name, d.white.name], g: GOL.newGame() };
  if (my) { GOV = V; goStones(K, V.g); goDraw(); } else { (window._watch = window._watch || {})[d.id] = V; goStones(K, V.g); }
});
socket.on('coMove', d => {
  const V = GOV?.id === d.id ? GOV : window._watch?.[d.id]; if (!V) return;
  if (d.resign) V.g.over = true; else { GOL.play(V.g, d.i, d.col); V.last = d.i; }
  goStones(V.K, V.g); if (V === GOV) goDraw(d.i === -1 ? `${V.names[d.col - 1]} bỏ lượt` : '');
});
socket.on('coEnd', d => { const V = GOV?.id === d.id ? GOV : null; if (V) { V.g.over = true; goDraw(d.text); if (d.winner === me.id) fireworksSmall(); } if (window._watch) delete window._watch[d.id]; });

// ---------------- phi tần NPC: trò chuyện ----------------
socket.on('feiTalk', async d => {
  const model = (sceneFei.find(f => f.id === d.id) || {}).model || 'phi';
  const relTxt = d.rel <= -40 ? '😠 Thù địch' : d.rel <= -10 ? '😒 Không ưa' : d.rel >= 40 ? '💞 Thân thiết' : d.rel >= 10 ? '🙂 Có thiện cảm' : '😐 Bình thường';
  const text = `${esc(d.line)}${d.tip ? `<br><i style="color:var(--gold2)">${esc(d.tip)}</i>` : ''}<br><small>Quan hệ: ${relTxt} (${d.rel})${d.done ? ' · hôm nay đã trò chuyện' : ''}</small>`;
  const opts = d.opts.length ? d.opts.map(([k, t]) => [esc(t), k, '']) : [['Lui', null, '']];
  const i = await say(model, d.name, text, opts); dlgClose();
  if (d.opts[i]) socket.emit('fei', { op: 'ans', id: d.id, a: d.opts[i][0] });
});
// ---------------- việc riêng bậc cao ----------------
socket.on('ccSo', items => {
  modal(`<button class="close" onclick="window._close()">✕</button><h3>📒 Sổ chi tiêu lục cung</h3><div style="color:var(--muted);font-size:12.5px">Tổng quản trình sổ tháng này. Có một khoản bị khai khống gấp ba, chủ tử chỉ ra khoản nào?</div>
  <table>${items.map((x, i) => `<tr><td>${esc(x.t)}</td><td style="text-align:right">${x.v} lượng</td><td><button data-i="${i}">Khoản này sai</button></td></tr>`).join('')}</table>`);
  $('mcard').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { socket.emit('caocap', { op: 'so', ok: +b.dataset.i }); closeModal(); });
});
function openDay() {
  rosterSilent = true; socket.emit('roster'); socket.once('roster', r => { rosterSilent = false;
    const lows = r.list.filter(p => p.id !== me.id && !p.lanh && ['Tú nữ', 'Quan nữ tử', 'Đáp ứng', 'Thường tại'].includes(p.rankName));
    modal(`<button class="close" onclick="window._close()">✕</button><h3>📚 Dạy dỗ người mới</h3><div style="color:var(--muted);font-size:12.5px">Chỉ bảo lễ nghi cho người cấp thấp: họ +15 công trạng, bổn cung +10 và Thái hậu thêm quý mến.</div>
    <table>${lows.map(p => `<tr><td>${p.online ? '🟢' : '⚪'} ${esc(p.name)}</td><td>${esc(p.rankName)}</td><td><button data-w="${p.id}">Dạy dỗ</button></td></tr>`).join('')}</table>
    <div class="btns"><button id="dTn">Dạy các tú nữ mới tuyển (+8 công trạng)</button></div>`);
    $('mcard').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { socket.emit('caocap', { op: 'day', who: b.dataset.w }); closeModal(); });
    $('dTn').onclick = () => { socket.emit('caocap', { op: 'day' }); closeModal(); };
  });
}

// =====================================================================
// THÁNH CHỈ CẬP NHẬT: hiện một lần cho mỗi bản mới
// =====================================================================
const UPDATE_VER = 'u2026-11-12';
const UPDATE_NOTES = [
  ['🎭 Hậu cung có thêm 6 phi tần', 'Tuệ Quý phi, Mẫn Phi, Uyển Tần, Lệ Tần, Hân Quý nhân, Mai Thường tại cũng tranh ghế, tranh lật thẻ. Gặp họ ở Ngự hoa viên, Từ Ninh cung, yến tiệc, bấm vào tên để trò chuyện: có người nói khích, có người lấy lòng. Thân thì được mách sở thích Hoàng thượng.'],
  ['🗡 Ân oán có trả có vay', 'Hãm hại phi tần NPC trong Danh sách hậu cung (từ Quý nhân). Nhưng họ nhớ mặt: vài ngày sau sẽ gài tang vật trả thù. Tìm đúng hung thủ thì họ bị giáng cấp, chỉ sai thì chủ tử bị phạt.'],
  ['🪑 Ghế có hạn, phải vượt mặt mà lên', 'Mỗi cấp có số ghế. Ghế đầy thì phải có công trạng cao hơn phi tần NPC đang ngồi, họ sẽ bị giáng để nhường chỗ. Lên Quý phi giờ cần 1300 công trạng, Hoàng quý phi 2000.'],
  ['👑 Việc riêng cho Phi trở lên', 'Ở cung riêng: Hiệp lý lục cung (bắt sổ sách gian lận), Dạy dỗ người mới (người được dạy +15 công trạng), Thiết yến mời cả cung.'],
  ['🌙 Thị tẩm nhiều chuyện hơn', 'Lật thẻ mỗi 2 tiếng (8h–22h). Chuẩn bị tắm hoa, áo ngủ, hương xông; nghe Hoàng thượng tâm sự; gối đầu tâu chuyện; ngắm trăng đối thơ; nhận tín vật; nhật ký sủng hạnh. Coi chừng người khác giả bệnh kéo Hoàng thượng đi, nhớ níu tay giữ lại!'],
  ['🍳 Ngự thiện phòng (từ Quý nhân)', 'Mở Bí kíp nhà bếp, chọn món, lấy nguyên liệu, thái, nấu, bày ra chén rồi bưng lên Dưỡng Tâm điện dâng Hoàng thượng. Món Hoàng thượng đang thèm được thưởng nhiều nhất.'],
  ['🏠 Cung riêng ấm cúng hơn', 'Giường mới: ngồi, nằm nghỉ, cáo bệnh (2 giờ không ai hại được). Đôn sứ ngồi được. Mời bạn bè sang thưởng trà. Nội vụ phủ có thêm Sập La Hán để ngồi đánh cờ vây với tỷ muội hoặc cung nữ.'],
  ['🎎 Yến tiệc rộn ràng', 'Giờ yến tiệc: 9h, 11h, 15h, 17h. Thêm múa lụa, kiếm vũ, hát; kính rượu; ra múa cùng nhau; tửu lệnh nối thành ngữ; pháo hoa sau tiết mục và khen chê; đoàn ca vũ Giáo phường biểu diễn.'],
  ['📜 Đại án và 🏮 Đại lễ', 'Mỗi tuần một đại án cả cung cùng tra, mỗi người giữ một mảnh manh mối. Đại lễ thì cả cung góp sức, đạt mốc là ai cũng có quà.'],
  ['✨ Lặt vặt', 'Lượt hồi mỗi 30 phút. Trang phục mới: Phi · xanh lam thêu vàng. Thư từ, thông báo về điện thoại (bấm 🔔), danh hiệu, nhiệm vụ tân thủ, điểm danh 7 ngày.'],
];
function showUpdate(force) {
  try { if (!force && localStorage.getItem('mph_upd_' + me.id) === UPDATE_VER) return; } catch {}
  if (!force && (tourOn || !$('modal').classList.contains('hidden'))) return setTimeout(() => showUpdate(), 4000);
  modal(`<button class="close" onclick="window._close()">✕</button>
  <div class="updhead"><div class="ut">聖旨</div><h3>Thánh chỉ · Hậu cung có biến</h3><small>Cập nhật ngày 12/11 · phụng thiên thừa vận, Hoàng đế chiếu viết…</small></div>
  <div class="updlist">${UPDATE_NOTES.map(([t, x]) => `<div class="ud"><b>${t}</b><div>${x}</div></div>`).join('')}</div>
  <div class="btns"><button class="gold" id="updOk">Thần thiếp lĩnh chỉ</button></div>
  <div style="color:var(--muted);font-size:12px;text-align:center">Xem lại bất cứ lúc nào ở 📖 Hướng dẫn → Có gì mới</div>`);
  $('mcard').classList.add('wide');
  $('updOk').onclick = () => { try { localStorage.setItem('mph_upd_' + me.id, UPDATE_VER); } catch {} closeModal(); };
}
