// Dựng các địa điểm trong cung bằng code
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// ---------- hoa văn ----------
const T = {};
function textures() {
  if (T.ready) return T;
  T.floor = tex(1024, 1024, (g, w, h) => {
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = rnd(70, 88); g.fillStyle = `rgb(${v + 6},${v + 2},${v - 2})`; g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 50; k++) { g.fillStyle = `rgba(255,240,220,${rnd(0, .03)})`; g.fillRect(i * s + rnd(0, s), j * s + rnd(0, s), rnd(2, 30), rnd(1, 3)); }
    }
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 4;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  }, [5, 5]);
  T.ceil = tex(512, 512, (g, w) => {
    g.fillStyle = '#1f4a3f'; g.fillRect(0, 0, w, w); g.fillStyle = '#c99a3c'; g.fillRect(14, 14, w - 28, w - 28);
    g.fillStyle = '#163a5c'; g.fillRect(26, 26, w - 52, w - 52); g.strokeStyle = '#d8b25a'; g.lineWidth = 6; g.strokeRect(60, 60, w - 120, w - 120);
    const cx = w / 2; g.fillStyle = '#2d6a57'; g.beginPath(); g.arc(cx, cx, 150, 0, 7); g.fill(); g.strokeStyle = '#e2bf6b'; g.lineWidth = 8; g.stroke();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(cx + Math.cos(a) * 90, cx + Math.sin(a) * 90, 34, 18, a, 0, 7); g.fill(); }
    g.fillStyle = '#e8c35e'; g.beginPath(); g.arc(cx, cx, 46, 0, 7); g.fill();
  }, [6, 5]);
  T.lattice = tex(512, 1024, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h * .4, 20, w / 2, h * .4, h * .7);
    grd.addColorStop(0, 'rgba(255,232,180,1)'); grd.addColorStop(1, 'rgba(190,110,50,1)'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7a1414'; g.lineWidth = 5; const s = 34;
    for (let y = 0; y < h * .62; y += s) for (let x = 0; x < w; x += s) { g.strokeRect(x + 8, y + 8, s - 16, s - 16); g.beginPath(); g.moveTo(x + s / 2, y + 8); g.lineTo(x + s / 2, y + s / 2 - 8); g.stroke(); }
    g.fillStyle = '#6e1010'; g.fillRect(0, h * .62, w, h * .38); g.strokeStyle = '#d4a548'; g.lineWidth = 6; g.strokeRect(40, h * .66, w - 80, h * .3);
    g.lineWidth = 26; g.strokeStyle = '#8a1a17'; g.strokeRect(0, 0, w, h);
  });
  T.screen = tex(1024, 640, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#f3dc96'); grd.addColorStop(1, '#c7a052'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(190,50,35,.85)'; g.beginPath(); g.arc(w * .72, h * .22, 46, 0, 7); g.fill();
    [['rgba(60,90,80,.25)', .5], ['rgba(40,75,65,.4)', .6], ['rgba(30,60,50,.6)', .7], ['rgba(25,45,38,.85)', .82]].forEach(([col, base], li) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * base); let x = 0;
      while (x < w) { const pw = rnd(70, 160), ph = rnd(60, 170) * (1 - li * .12); g.quadraticCurveTo(x + pw * .3, h * base - ph, x + pw * .5, h * base - ph * .95); g.quadraticCurveTo(x + pw * .75, h * base - ph * .6, x + pw, h * base - rnd(0, 30)); x += pw; }
      g.lineTo(w, h); g.closePath(); g.fill();
    });
    g.strokeStyle = '#6e1010'; g.lineWidth = 30; g.strokeRect(0, 0, w, h); g.strokeStyle = '#e8c35e'; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40);
  });
  T.carpet = tex(512, 1024, (g, w, h) => {
    g.fillStyle = '#9c1a18'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d4a548'; g.lineWidth = 14; g.strokeRect(24, 24, w - 48, h - 48);
    for (let y = 160; y < h - 100; y += 220) { g.lineWidth = 6; g.beginPath(); g.arc(w / 2, y, 70, 0, 7); g.stroke(); g.fillStyle = '#e2bf6b'; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * 32, y + Math.sin(a) * 32, 16, 8, a, 0, 7); g.fill(); } }
  });
  T.grass = tex(512, 512, (g, w) => { g.fillStyle = '#6f9a4a'; g.fillRect(0, 0, w, w); for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(${rnd(40, 120)},${rnd(110, 170)},${rnd(40, 80)},.6)`; g.fillRect(rnd(0, w), rnd(0, w), 2, rnd(3, 8)); } }, [12, 12]);
  T.stone = tex(512, 512, (g, w) => { g.fillStyle = '#c9c2b4'; g.fillRect(0, 0, w, w); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const v = rnd(180, 215); g.fillStyle = `rgb(${v},${v - 6},${v - 16})`; g.fillRect(i * 85 + 3, j * 85 + 3, 79, 79); } }, [2, 8]);
  T.water = tex(512, 512, (g, w) => { g.fillStyle = '#3f7d8a'; g.fillRect(0, 0, w, w); for (let k = 0; k < 300; k++) { g.strokeStyle = `rgba(255,255,255,${rnd(.05, .2)})`; g.beginPath(); const x = rnd(0, w), y = rnd(0, w); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 20, y); g.stroke(); } }, [3, 3]);
  T.plaster = tex(256, 256, (g, w) => { g.fillStyle = '#9a8f86'; g.fillRect(0, 0, w, w); for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${rnd(60, 120)},${rnd(60, 110)},${rnd(60, 100)},.25)`; g.fillRect(rnd(0, w), rnd(0, w), rnd(2, 10), rnd(2, 10)); } }, [4, 2]);
  T.ready = true;
  return T;
}
function plaqueTex(text, bg = '#122a4a') {
  return tex(1024, 360, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = '#e2bf6b'; g.lineWidth = 26; g.strokeRect(0, 0, w, h); g.lineWidth = 6; g.strokeRect(36, 36, w - 72, h - 72);
    g.fillStyle = '#f0cf73'; g.font = `bold ${text.length > 3 ? 150 : 190}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 8);
  });
}

// ---------- vật liệu ----------
let M = null;
function mats() {
  if (M) return M; const t = textures();
  M = {
    floor: new THREE.MeshStandardMaterial({ map: t.floor, roughness: 0.3, metalness: 0.1, color: 0xe8d6c4 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa3201a, roughness: 0.38 }),
    darkRed: new THREE.MeshStandardMaterial({ color: 0x6a1410, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9a845, roughness: 0.3, metalness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xe4ddd0, roughness: 0.75 }),
    ceil: new THREE.MeshStandardMaterial({ map: t.ceil, roughness: 0.8 }),
    beam: new THREE.MeshStandardMaterial({ color: 0x2a5a4c, roughness: 0.7 }),
    lattice: new THREE.MeshStandardMaterial({ map: t.lattice, emissive: 0xffc070, emissiveMap: t.lattice, emissiveIntensity: 0.6, roughness: 0.9 }),
    screen: new THREE.MeshStandardMaterial({ map: t.screen, roughness: 0.4, metalness: 0.3 }),
    carpet: new THREE.MeshStandardMaterial({ map: t.carpet, roughness: 0.95 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.45, metalness: 0.8 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x8a2018, roughness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a2a16, roughness: 0.55 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.9 }),
    silk: new THREE.MeshStandardMaterial({ color: 0xf2d9d2, roughness: 0.8, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.25 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x2f4f8a, roughness: 0.3 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8 }),
    blossom: new THREE.MeshStandardMaterial({ color: 0xf4b6c8, roughness: 0.8 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.9 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.95, flatShading: true }),
    roofTile: new THREE.MeshStandardMaterial({ color: 0xc89a2e, roughness: 0.5, metalness: 0.3 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.95 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a3c, emissiveIntensity: 2.2, roughness: 0.6 }),
    candle: new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffb050, emissiveIntensity: 3, roughness: 0.5 }),
  };
  return M;
}
const shade = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
function box(g, w, h, d, m, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; }
function cyl(g, rt, rb, h, m, x, y, z, seg = 24) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); g.add(o); return o; }

// ---------- đồ vật dùng chung (cũng là nội thất trang trí) ----------
export const DECOR = {
  binhphong: { name: 'Bình phong sơn thủy', make: () => { const m = mats(), g = new THREE.Group(); for (const [i, a] of [[-1, .35], [0, 0], [1, -.35]]) { const p = new THREE.Group(); p.add(new THREE.Mesh(new THREE.BoxGeometry(.55, 1.0, .04), [m.red, m.red, m.red, m.red, m.screen, m.red])); p.position.set(i * .52, .5, Math.abs(i) * .09); p.rotation.y = a; g.add(p); } return shade(g); } },
  banTra: { name: 'Bàn trà gỗ', make: () => { const m = mats(), g = new THREE.Group(); box(g, .7, .04, .45, m.wood, 0, .32, 0); for (const [x, z] of [[-.3, -.18], [.3, -.18], [-.3, .18], [.3, .18]]) box(g, .04, .3, .04, m.wood, x, .15, z); cyl(g, .05, .04, .07, m.porcelain, -.12, .37, 0, 14); cyl(g, .035, .03, .05, m.porcelain, .08, .36, .05, 12); cyl(g, .035, .03, .05, m.porcelain, .16, .36, -.05, 12); return shade(g); } },
  ghedon: { name: 'Đôn sứ', make: () => { const m = mats(), g = new THREE.Group(); cyl(g, .13, .13, .4, m.porcelain, 0, .2, 0, 32); cyl(g, .133, .133, .035, m.blue, 0, .33, 0, 32); cyl(g, .133, .133, .035, m.blue, 0, .07, 0, 32); return shade(g); } },
  chaucay: { name: 'Chậu tùng cảnh', make: () => { const m = mats(), g = new THREE.Group(); cyl(g, .16, .12, .2, m.blue, 0, .1, 0, 20); const tr = cyl(g, .025, .04, .45, m.trunk, 0, .4, 0, 8); tr.rotation.z = .25; for (const [x, y, z] of [[-.12, .6, 0], [.08, .7, .05], [-.02, .55, -.08]]) { const f = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), m.leaf); f.scale.y = .45; f.position.set(x, y, z); g.add(f); } return shade(g); } },
  denlong: { name: 'Đèn đứng cung đình', make: () => { const m = mats(), g = new THREE.Group(); cyl(g, .03, .05, 1.3, m.red, 0, .65, 0, 10); cyl(g, .14, .17, .06, m.gold, 0, .03, 0, 6); cyl(g, .15, .18, .32, m.lantern, 0, 1.42, 0, 6); const L = new THREE.PointLight(0xffc088, 2.5, 4, 1.5); L.position.y = 1.42; g.add(L); return shade(g); } },
  binhsu: { name: 'Bình sứ hoa lam', make: () => { const m = mats(), g = new THREE.Group(); const pts = [[0, 0], [.09, .02], [.13, .15], [.12, .3], [.06, .42], [.05, .5], [.07, .53]].map(([x, y]) => new THREE.Vector2(x, y)); const v = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), m.porcelain); g.add(v); cyl(g, .132, .132, .04, m.blue, 0, .18, 0, 24); return shade(g); } },
  giuong: { name: 'Giường có màn', make: () => { const m = mats(), g = new THREE.Group(); box(g, 1.1, .3, .75, m.wood, 0, .15, 0); box(g, 1.04, .08, .7, m.cloth, 0, .34, 0); box(g, .3, .08, .2, m.red, -.38, .41, 0); for (const [x, z] of [[-.52, -.34], [.52, -.34], [-.52, .34], [.52, .34]]) box(g, .05, 1.3, .05, m.wood, x, .65, z); box(g, 1.1, .06, .75, m.red, 0, 1.3, 0); const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 1.0), m.silk); cur.position.set(0, .8, .36); g.add(cur); const back = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 1.0), m.silk); back.position.set(0, .8, -.36); g.add(back); return shade(g); } },
  tham: { name: 'Thảm đỏ hoa văn', make: () => { const m = mats(), g = new THREE.Group(); const c = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), m.carpet); c.rotation.x = -Math.PI / 2; c.position.y = .006; c.receiveShadow = true; g.add(c); return g; } },
  luhuong: { name: 'Lư hương đồng', make: () => { const m = mats(), g = new THREE.Group(); cyl(g, .12, .15, .06, m.bronze, 0, .03, 0); cyl(g, .04, .06, .22, m.bronze, 0, .17, 0); const b = new THREE.Mesh(new THREE.SphereGeometry(.15, 20, 12, 0, 7, 0, 1.9), m.bronze); b.rotation.x = Math.PI; b.position.y = .4; g.add(b); const l = new THREE.Mesh(new THREE.ConeGeometry(.12, .16, 20), m.bronze); l.position.y = .48; g.add(l); return shade(g); } },
};

function lanternHang(g, x, y, z, light = true) {
  const m = mats(), L = new THREE.Group(); L.position.set(x, y, z); g.add(L);
  L.add(new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .42, 6), m.lantern));
  for (const yy of [.23, -.23]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .05, 6), m.red); r.position.y = yy; L.add(r); }
  const tas = new THREE.Mesh(new THREE.ConeGeometry(.05, .25, 8), m.red); tas.position.y = -.38; tas.rotation.x = Math.PI; L.add(tas);
  if (light) { const p = new THREE.PointLight(0xffb878, 4, 8, 1.4); L.add(p); }
  return L;
}

// ---------- chính điện (Từ Ninh cung, Dưỡng Tâm điện) ----------
function hall(o, { plaque, screenGold = false }) {
  const m = mats(), g = o.group, W = 9, D = 11, H = 3.6;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.floor); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.name = 'ground'; g.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.ceil); ce.rotation.x = Math.PI / 2; ce.position.y = H; g.add(ce);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.9, H - .4), m.lattice); p.position.set(s * (W / 2 - .02), (H - .4) / 2, -D / 2 + 1.2 + k * 2.1); p.rotation.y = -s * Math.PI / 2; g.add(p); }
    box(g, .08, H, D, m.wall, s * (W / 2 + .04), H / 2, 0);
  }
  box(g, W, H, .1, m.wall, 0, H / 2, -D / 2 - .05); box(g, W, H, .1, m.wall, 0, H / 2, D / 2 + .05);
  for (let k = -2; k <= 2; k++) { if (!k) continue; const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, H - .4), m.lattice); p.position.set(k * 1.7, (H - .4) / 2, -D / 2 + .01); g.add(p); }
  for (const x of [-3.2, -1.7, 1.7, 3.2]) for (const z of [-3.6, -1.2, 1.2, 3.6]) {
    if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
    cyl(g, .2, .2, H, m.red, x, H / 2, z, 24); cyl(g, .3, .32, .12, m.stone, x, .06, z, 24);
    for (const y of [H - .35, .4]) cyl(g, .215, .215, .05, m.gold, x, y, z, 24);
  }
  for (const x of [-3.2, -1.7, 1.7, 3.2]) box(g, .22, .32, D, m.beam, x, H - .16, 0);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(2, .7), new THREE.MeshStandardMaterial({ map: plaqueTex(plaque), roughness: .5 })); pl.position.set(0, H - .75, -D / 2 + .12); g.add(pl);
  const cp = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7.2), m.carpet); cp.rotation.x = -Math.PI / 2; cp.position.set(0, .005, .6); cp.receiveShadow = true; g.add(cp);
  const dz = -D / 2 + 1.7;
  box(g, 3.4, .12, 2.2, m.stone, 0, .06, dz); box(g, 3, .12, 1.9, m.darkRed, 0, .18, dz - .08); box(g, 2.6, .12, 1.6, m.darkRed, 0, .3, dz - .14);
  const scr = DECOR.binhphong.make(); scr.scale.set(2, 1.9, 2); scr.position.set(0, .37, dz - .7); g.add(scr);
  if (screenGold) scr.traverse(x => { if (x.isMesh && Array.isArray(x.material)) x.material = [m.gold, m.gold, m.gold, m.gold, m.screen, m.gold]; });
  // ngai
  const th = new THREE.Group(); g.add(th); th.name = 'throne';
  box(th, .8, .08, .55, m.red, 0, 0, 0); box(th, .72, .05, .48, m.cloth, 0, .06, .02); box(th, .8, .62, .07, m.red, 0, .33, -.25); box(th, .84, .06, .1, m.gold, 0, .66, -.25);
  for (const s of [-1, 1]) box(th, .07, .28, .5, m.red, s * .39, .16, 0);
  th.userData.legs = [];
  for (const s of [-1, 1]) for (const z of [-.22, .22]) th.userData.legs.push(box(th, .06, 1, .06, m.red, s * .35, -.5, z));
  shade(th);
  for (const s of [-1, 1]) { const lh = DECOR.luhuong.make(); lh.scale.setScalar(1.6); lh.position.set(s * 1.25, 0, dz + 1.45); g.add(lh); }
  for (const x of [-2.45, 2.45]) for (const z of [-2.4, 0, 2.4]) lanternHang(g, x, H - .9, z);
  for (const s of [-1, 1]) { const d = DECOR.denlong.make(); d.position.set(s * 1.6, .37, dz + .2); g.add(d); }
  shade(g);
  const key = new THREE.SpotLight(0xfff0d8, 15, 14, Math.PI / 5, .6, 1.2); key.position.set(0, H - .2, 2.5); key.target.position.set(0, .5, dz + .5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); g.add(key, key.target);
  o.lights = { hemi: [0xfff0dc, 0x6a3a2a, 1.6], bg: 0x3a1c18, fog: [0x4a2a22, .02], exposure: 1.4 };
  o.bounds = { minX: -4, maxX: 4, minZ: dz + 1.4, maxZ: 5 };
  o.dais = { y: .37, z: dz };
  o.throne = th;
  o.spawn = { x: 0, z: 3.5 };
  o.cam = { dist: 3.2, height: 1.6 };
}

// ---------- Ngự hoa viên ----------
function garden(o) {
  const m = mats(), t = textures(), g = o.group;
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: t.grass, roughness: 1 })); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; gr.name = 'ground'; g.add(gr);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 16), new THREE.MeshStandardMaterial({ map: t.stone, roughness: .8 })); path.rotation.x = -Math.PI / 2; path.position.set(0, .01, 0); path.receiveShadow = true; g.add(path);
  const path2 = path.clone(); path2.rotation.z = Math.PI / 2; path2.position.set(0, .011, -2); path2.scale.y = .7; g.add(path2);
  // hồ nước + cầu vòm
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ map: t.water, roughness: .1, metalness: .3, color: 0xbfe6ee })); pond.rotation.x = -Math.PI / 2; pond.position.set(-4.5, .02, -1); g.add(pond);
  for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(.2, .4)), m.rock); r.position.set(-4.5 + Math.cos(a) * 3.1, .1, -1 + Math.sin(a) * 3.1); g.add(r); }
  for (let k = 0; k < 6; k++) { const lp = new THREE.Mesh(new THREE.CircleGeometry(rnd(.15, .25), 12), m.leaf); lp.rotation.x = -Math.PI / 2; lp.position.set(-4.5 + rnd(-2, 2), .03, -1 + rnd(-2, 2)); g.add(lp); const fl = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), m.blossom); fl.position.copy(lp.position).y += .04; g.add(fl); }
  const arc = new THREE.Mesh(new THREE.TorusGeometry(1.4, .12, 8, 24, Math.PI), m.stone); arc.position.set(-4.5, -.9, -1); arc.rotation.y = Math.PI / 2; g.add(arc);
  // đình bát giác
  const pv = new THREE.Group(); pv.position.set(4, 0, -3); g.add(pv);
  cyl(pv, 1.7, 1.8, .25, m.stone, 0, .12, 0, 8);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; cyl(pv, .08, .08, 2, m.red, Math.cos(a) * 1.45, 1.25, Math.sin(a) * 1.45, 12); }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.1, 8, 1, true), m.roofTile); roof.position.y = 2.75; roof.rotation.y = Math.PI / 8; pv.add(roof);
  const roofIn = new THREE.Mesh(new THREE.ConeGeometry(2.28, 1.08, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a5a4c, side: THREE.BackSide })); roofIn.position.y = 2.74; roofIn.rotation.y = Math.PI / 8; pv.add(roofIn);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 8), m.gold); fin.position.y = 3.4; pv.add(fin);
  box(pv, 2.9, .06, .06, m.gold, 0, 2.25, 0).rotation.y = 0;
  const tb = DECOR.banTra.make(); tb.position.set(0, .25, 0); pv.add(tb);
  for (const a of [0, 2.1, 4.2]) { const s = DECOR.ghedon.make(); s.position.set(Math.cos(a) * .7, .25, Math.sin(a) * .7); pv.add(s); }
  // cây hoa đào
  const tree = (x, z, s = 1, pink = true) => { const tg = new THREE.Group(); tg.position.set(x, 0, z); tg.scale.setScalar(s); g.add(tg); const tr = cyl(tg, .08, .14, 1.6, m.trunk, 0, .8, 0, 8); tr.rotation.z = rnd(-.15, .15); for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(.45, .7), 1), pink ? m.blossom : m.leaf); f.position.set(rnd(-.6, .6), rnd(1.5, 2.3), rnd(-.6, .6)); tg.add(f); } };
  for (const [x, z, s, p] of [[-2, 4, 1, true], [2.5, 4.5, .9, true], [-7, 3, 1.2, false], [7, 2, 1.1, true], [-1.8, -5, 1, false], [2.2, -6, 1.2, true], [8, -6, 1.1, false], [-8, -5, 1, true], [5, 6, 1, false]]) tree(x, z, s, p);
  // non bộ đá
  for (const [x, z] of [[1.8, -1], [-1.8, 1.5], [6, 3.5]]) { for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(.25, .55)), m.rock); r.position.set(x + rnd(-.4, .4), rnd(.2, .6), z + rnd(-.4, .4)); r.scale.y = rnd(1, 1.8); g.add(r); } }
  // tường cung đỏ ngói vàng bao quanh
  for (const [x, z, w, ry] of [[0, -10, 20, 0], [0, 10, 20, 0], [-10, 0, 20, Math.PI / 2], [10, 0, 20, Math.PI / 2]]) { const wall = new THREE.Group(); wall.position.set(x, 0, z); wall.rotation.y = ry; g.add(wall); box(wall, w, 2.4, .4, m.wall, 0, 1.2, 0); const rf = box(wall, w, .18, .8, m.roofTile, 0, 2.5, 0); rf.rotation.x = 0; }
  // đèn đá
  for (const [x, z] of [[1, 2.5], [-1, 2.5], [1, -4.5], [-1, -4.5]]) { const s = new THREE.Group(); s.position.set(x, 0, z); g.add(s); cyl(s, .12, .16, .7, m.stone, 0, .35, 0, 6); box(s, .3, .25, .3, m.stone, 0, .82, 0); const c = cyl(s, .22, .02, .18, m.stone, 0, 1.03, 0, 6); c.rotation.y = .5; const lt = new THREE.Mesh(new THREE.BoxGeometry(.16, .14, .16), m.candle); lt.position.y = .82; s.add(lt); }
  shade(g);
  const sun = new THREE.DirectionalLight(0xfff2d8, 3); sun.position.set(6, 10, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 }); g.add(sun);
  o.lights = { hemi: [0xdff0ff, 0x6a7a4a, 1.8], bg: 0xa9d3ea, fog: [0xcfe3ea, .02], exposure: 1.2 };
  o.bounds = { minX: -9, maxX: 9, minZ: -9, maxZ: 9 };
  o.blocks = [{ x: -4.5, z: -1, r: 3.1 }, { x: 4, z: -3, r: 1.9 }];
  o.spawn = { x: 0, z: 2 };
  o.cam = { dist: 4, height: 2.2 };
}

// ---------- phòng riêng / cung riêng ----------
function room(o, { big, palaceName }) {
  const m = mats(), g = o.group, W = big ? 8 : 5, D = big ? 7 : 4.6, H = big ? 3.2 : 2.6;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.floor); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.name = 'ground'; g.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.ceil); ce.rotation.x = Math.PI / 2; ce.position.y = H; g.add(ce);
  for (const s of [-1, 1]) { box(g, .08, H, D, m.wall, s * (W / 2 + .04), H / 2, 0); const n = big ? 3 : 2; for (let k = 0; k < n; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, H - .4), m.lattice); p.position.set(s * (W / 2 - .02), (H - .4) / 2, -D / 2 + 1 + k * (D - 2) / Math.max(1, n - 1)); p.rotation.y = -s * Math.PI / 2; g.add(p); } }
  box(g, W, H, .1, m.wall, 0, H / 2, -D / 2 - .05); box(g, W, H, .1, m.wall, 0, H / 2, D / 2 + .05);
  for (let k = -1; k <= 1; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, H - .4), m.lattice); p.position.set(k * 1.5, (H - .4) / 2, -D / 2 + .01); g.add(p); }
  for (const x of [-W / 2 + .3, W / 2 - .3]) for (const z of [-D / 2 + .3, D / 2 - .3]) cyl(g, .14, .14, H, m.red, x, H / 2, z, 16);
  if (palaceName) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .56), new THREE.MeshStandardMaterial({ map: plaqueTex(palaceName, '#4a1010'), roughness: .5 })); pl.position.set(0, H - .5, -D / 2 + .08); g.add(pl); }
  lanternHang(g, 0, H - .7, 0);
  if (big) { lanternHang(g, -2.5, H - .7, -1.5); lanternHang(g, 2.5, H - .7, -1.5); }
  shade(g);
  o.lights = { hemi: [0xfff0dc, 0x6a3a2a, 1.8], bg: 0x3a1c18, fog: [0x4a2a22, .015], exposure: 1.4 };
  o.bounds = { minX: -W / 2 + .4, maxX: W / 2 - .4, minZ: -D / 2 + .4, maxZ: D / 2 - .4 };
  o.spawn = { x: 0, z: big ? .6 : .3 };
  o.cam = { dist: big ? 3.2 : 2.6, height: 1.5 };
  o.roomSize = { W, D };
}

// ---------- tẩm cung buổi tối ----------
function bedroom(o) {
  const m = mats(), g = o.group, W = 6, D = 5.5, H = 3;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.floor); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.name = 'ground'; g.add(fl);
  for (const s of [-1, 1]) box(g, .08, H, D, m.wall, s * (W / 2 + .04), H / 2, 0);
  box(g, W, H, .1, m.wall, 0, H / 2, -D / 2 - .05); box(g, W, H, .1, m.wall, 0, H / 2, D / 2 + .05);
  const bed = DECOR.giuong.make(); bed.scale.setScalar(1.8); bed.position.set(0, 0, -D / 2 + .9); g.add(bed); o.bed = bed; bed.children.filter(m => m.isMesh && m.geometry.type === 'PlaneGeometry' && m.position.z > .3).forEach(m => m.visible = false); // vén rèm trước o.bedFront = -D / 2 + .9 + .75 * 1.8 / 2;
  const tham = DECOR.tham.make(); tham.position.set(0, 0, .5); g.add(tham);
  const candles = [];
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-2.2, .8], [2.2, .8], [-.9, 1.6], [.9, 1.6]]) {
    const c = new THREE.Group(); c.position.set(x, 0, z); g.add(c);
    cyl(c, .1, .14, .7, m.gold, 0, .35, 0, 10); const cd = cyl(c, .045, .045, .2, m.candle, 0, .8, 0, 10);
    const L = new THREE.PointLight(0xffa850, 2.2, 3.5, 1.6); L.position.y = 1; c.add(L); candles.push(L);
  }
  const scr = DECOR.binhphong.make(); scr.position.set(2, 0, 1.6); scr.rotation.y = -.6; g.add(scr);
  shade(g);
  o.lights = { hemi: [0x6a4a6a, 0x1a0a10, .45], bg: 0x0e0608, fog: [0x140a0c, .08], exposure: 1.0 };
  o.bounds = { minX: -2.6, maxX: 2.6, minZ: -1.4, maxZ: 2.4 };
  o.spawn = { x: 0, z: .6 };
  o.cam = { dist: 2.8, height: 1.5 };
  o.flicker = candles;
}

// ---------- lãnh cung ----------
function coldPalace(o) {
  const m = mats(), t = textures(), g = o.group;
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: t.stone, color: 0x9a948c, roughness: 1 })); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; gr.name = 'ground'; g.add(gr);
  for (const [x, z, w, ry] of [[0, -6, 12, 0], [-6, 0, 12, Math.PI / 2], [6, 0, 12, Math.PI / 2]]) { const wall = new THREE.Group(); wall.position.set(x, 0, z); wall.rotation.y = ry; g.add(wall); box(wall, w, 2.6, .35, new THREE.MeshStandardMaterial({ map: t.plaster, roughness: 1 }), 0, 1.3, 0); box(wall, w, .15, .7, m.grey, 0, 2.65, 0); }
  const hut = new THREE.Group(); hut.position.set(0, 0, -4.2); g.add(hut);
  box(hut, 4, 2.2, 2.4, new THREE.MeshStandardMaterial({ map: t.plaster, roughness: 1 }), 0, 1.1, 0);
  const door = box(hut, .9, 1.6, .05, new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 1 }), 0, .8, 1.22); door.rotation.y = .3;
  const rf = new THREE.Mesh(new THREE.ConeGeometry(3, 1, 4), m.grey); rf.position.y = 2.7; rf.rotation.y = Math.PI / 4; rf.scale.z = .7; hut.add(rf);
  const tree = new THREE.Group(); tree.position.set(3.5, 0, 1); g.add(tree); for (let k = 0; k < 5; k++) { const b = cyl(tree, .03, .07, 1.4, m.trunk, rnd(-.2, .2), .7 + k * .2, 0, 6); b.rotation.z = rnd(-.8, .8); }
  const well = new THREE.Group(); well.position.set(-3, 0, 1.5); g.add(well); cyl(well, .5, .55, .6, m.rock, 0, .3, 0, 12);
  const bl = lanternHang(g, -1.2, 2, -2.8, false); bl.rotation.z = .4;
  for (let k = 0; k < 40; k++) { const lf = new THREE.Mesh(new THREE.PlaneGeometry(.08, .05), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, side: THREE.DoubleSide })); lf.rotation.x = -Math.PI / 2; lf.rotation.z = rnd(0, 6); lf.position.set(rnd(-5, 5), .01, rnd(-5, 5)); g.add(lf); }
  shade(g);
  const moon = new THREE.DirectionalLight(0xc8d4ff, 1.6); moon.position.set(-4, 8, 4); moon.castShadow = true; g.add(moon);
  o.lights = { hemi: [0xc0c8d8, 0x3a3a40, 1.1], bg: 0x5a6070, fog: [0x6a7080, .05], exposure: 1.1 };
  o.bounds = { minX: -5.3, maxX: 5.3, minZ: -2.6, maxZ: 5.3 };
  o.spawn = { x: 0, z: 2 };
  o.cam = { dist: 3.6, height: 2 };
}

export function buildLocation(loc, opts = {}) {
  const o = { group: new THREE.Group(), npcs: [], lights: null };
  if (loc === 'tuninh') { hall(o, { plaque: '慈寧宮' }); o.npcs = [{ model: 'thaihau', sit: true, name: 'Thái hậu', talk: 'thinhan' }, { model: 'thaiy', x: 2.4, z: 0, ry: -Math.PI / 2, name: 'Thái y', talk: 'thaiy' }, { model: 'mama', x: -2.4, z: 0.4, ry: Math.PI / 2, name: 'Quế ma ma', talk: 'mama' }]; }
  else if (loc === 'duongtam') { hall(o, { plaque: '養心殿', screenGold: true }); o.npcs = [{ model: 'hoangthuong', sit: true, male: true, name: 'Hoàng thượng', talk: 'dangcanh' }, { model: 'thaigiam', x: 1.6, z: -2, ry: -Math.PI / 3, male: true, name: 'Tổng quản Lý Đức Toàn', talk: 'thaigiam' }, { model: 'thive', x: -3.6, z: 4.2, ry: Math.PI / 2, male: true, name: 'Thị vệ' }]; }
  else if (loc === 'hoavien') { garden(o); o.npcs = [{ model: 'cungnu', x: 3, z: -1.2, ry: -1, name: 'Cung nữ Tiểu Thúy', talk: 'dotin' }, { model: 'thive', x: 0, z: 8.6, ry: Math.PI, male: true, name: 'Thị vệ' }]; }
  else if (loc === 'phong') { room(o, { big: !!opts.palace, palaceName: opts.palace ? opts.palaceName : null }); o.npcs = [{ model: 'cungnu', x: (o.roomSize.W / 2 - .8), z: -o.roomSize.D / 2 + 1, ry: -2.3, name: 'Cung nữ thân tín', talk: 'cungnu' }]; o.decorable = true; }
  else if (loc === 'tamcung') { bedroom(o); o.npcs = [{ model: 'hoangthuong_dem', x: -.5, z: -.4, ry: .4, male: true, name: 'Hoàng thượng', idle: 'khoanh_tay' }]; }
  else if (loc === 'lanhcung') { coldPalace(o); o.npcs = [{ model: 'mama', x: 2, z: -2.2, ry: -2.5, name: 'Lão ma ma lãnh cung', talk: 'lanh' }]; }
  return o;
}
