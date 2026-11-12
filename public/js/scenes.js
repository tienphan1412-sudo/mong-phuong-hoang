// Dựng các địa điểm trong cung bằng code
import { makeIngredient, makeVessel, makeDishware } from './food.js';
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

function bedOld() { const m = mats(), g = new THREE.Group(); box(g, 1.1, .3, .75, m.wood, 0, .15, 0); box(g, 1.04, .08, .7, m.cloth, 0, .34, 0); box(g, .3, .08, .2, m.red, -.38, .41, 0); for (const [x, z] of [[-.52, -.34], [.52, -.34], [-.52, .34], [.52, .34]]) box(g, .05, 1.3, .05, m.wood, x, .65, z); box(g, 1.1, .06, .75, m.red, 0, 1.3, 0); const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 1.0), m.silk); cur.position.set(0, .8, .36); g.add(cur); const back = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 1.0), m.silk); back.position.set(0, .8, -.36); g.add(back); return shade(g); }

// ---------- đồ vật dùng chung (cũng là nội thất trang trí) ----------
export const DECOR = {
  binhphong: { name: 'Bình phong sơn thủy', make: () => { const m = mats(), g = new THREE.Group(); for (const [i, a] of [[-1, .35], [0, 0], [1, -.35]]) { const p = new THREE.Group(); p.add(new THREE.Mesh(new THREE.BoxGeometry(.55, 1.0, .04), [m.red, m.red, m.red, m.red, m.screen, m.red])); p.position.set(i * .52, .5, Math.abs(i) * .09); p.rotation.y = a; g.add(p); } return shade(g); } },
  banTra: { name: 'Bàn trà gỗ', make: () => { const m = mats(), g = new THREE.Group(); box(g, .7, .04, .45, m.wood, 0, .32, 0); for (const [x, z] of [[-.3, -.18], [.3, -.18], [-.3, .18], [.3, .18]]) box(g, .04, .3, .04, m.wood, x, .15, z); cyl(g, .05, .04, .07, m.porcelain, -.12, .37, 0, 14); cyl(g, .035, .03, .05, m.porcelain, .08, .36, .05, 12); cyl(g, .035, .03, .05, m.porcelain, .16, .36, -.05, 12); return shade(g); } },
  ghedon: { name: 'Đôn sứ', make: () => { const m = mats(), g = new THREE.Group(); const pts = [[0, 0], [.1, 0], [.12, .03], [.135, .11], [.12, .2], [.125, .22], [0, .22]].map(([x, y]) => new THREE.Vector2(x, y)); g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 32), m.porcelain)); cyl(g, .137, .137, .025, m.blue, 0, .11, 0, 32); cyl(g, .127, .127, .018, m.blue, 0, .2, 0, 32); g.userData.seatTop = .22; return shade(g); } },
  chaucay: { name: 'Chậu tùng cảnh', make: () => { const m = mats(), g = new THREE.Group(); cyl(g, .16, .12, .2, m.blue, 0, .1, 0, 20); const tr = cyl(g, .025, .04, .45, m.trunk, 0, .4, 0, 8); tr.rotation.z = .25; for (const [x, y, z] of [[-.12, .6, 0], [.08, .7, .05], [-.02, .55, -.08]]) { const f = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), m.leaf); f.scale.y = .45; f.position.set(x, y, z); g.add(f); } return shade(g); } },
  denlong: { name: 'Đèn đứng cung đình', make: () => { const m = mats(), g = new THREE.Group(); cyl(g, .03, .05, 1.3, m.red, 0, .65, 0, 10); cyl(g, .14, .17, .06, m.gold, 0, .03, 0, 6); cyl(g, .15, .18, .32, m.lantern, 0, 1.42, 0, 6); const L = new THREE.PointLight(0xffc088, 2.5, 4, 1.5); L.position.y = 1.42; g.add(L); return shade(g); } },
  binhsu: { name: 'Bình sứ hoa lam', make: () => { const m = mats(), g = new THREE.Group(); const pts = [[0, 0], [.09, .02], [.13, .15], [.12, .3], [.06, .42], [.05, .5], [.07, .53]].map(([x, y]) => new THREE.Vector2(x, y)); const v = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), m.porcelain); g.add(v); cyl(g, .132, .132, .04, m.blue, 0, .18, 0, 24); return shade(g); } },
  giuong: { name: 'Giường có màn', make: () => { const m = mats(), g = new THREE.Group(), L = 1.3, Wd = .8;
    box(g, L, .2, Wd, m.wood, 0, .1, 0); box(g, L + .04, .04, Wd + .04, m.darkRed || m.red, 0, .21, 0); // khung giường
    box(g, L - .06, .09, Wd - .06, m.cloth, 0, .275, 0); // nệm, mặt nệm cao .32
    const pil = box(g, .18, .07, .42, m.red, -L / 2 + .16, .355, 0); pil.scale.y = 1;
    box(g, .5, .05, Wd - .1, m.silk, .3, .345, 0); // chăn gấp
    box(g, .05, .55, Wd + .04, m.wood, -L / 2 - .02, .45, 0); box(g, .05, .4, Wd + .04, m.wood, L / 2 + .02, .38, 0); // đầu giường, cuối giường
    box(g, L + .04, .5, .04, m.wood, 0, .5, -Wd / 2 - .02); // vách sau
    for (const [x, z] of [[-L / 2, -Wd / 2], [L / 2, -Wd / 2], [-L / 2, Wd / 2], [L / 2, Wd / 2]]) box(g, .05, 1.55, .05, m.wood, x, .78, z);
    box(g, L + .1, .07, Wd + .1, m.red, 0, 1.56, 0); box(g, L + .1, .14, .03, m.gold, 0, 1.47, Wd / 2 + .05);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.0), m.silk); back.position.set(0, 1.0, -Wd / 2 + .01); g.add(back);
    for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(.22, 1.2), m.silk); c.position.set(s * (L / 2 - .1), .92, Wd / 2); g.add(c); const t = cyl(g, .025, .025, .05, m.gold, s * (L / 2 - .1), .8, Wd / 2 + .01, 8); t.rotation.x = Math.PI / 2; }
    g.userData.bed = { L, top: .32 }; return shade(g); } },
  lahan: { name: 'Sập La Hán · bàn cờ', make: () => {
    const m = mats(), g = new THREE.Group(), L = 1.7, Dp = .72, H = .26;
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a1f12, roughness: .45 }), wood2 = new THREE.MeshStandardMaterial({ color: 0x55301c, roughness: .5 });
    const cush = new THREE.MeshStandardMaterial({ color: 0xd8b242, roughness: .85 }), edge = new THREE.MeshStandardMaterial({ color: 0x5f8f5a, roughness: .8 });
    // thân sập: mặt, viền, chân quỳ
    box(g, L, .05, Dp, wood, 0, H, 0); box(g, L - .06, .14, Dp - .06, wood2, 0, H - .1, 0);
    for (const [x, z] of [[-L / 2 + .06, -Dp / 2 + .06], [L / 2 - .06, -Dp / 2 + .06], [-L / 2 + .06, Dp / 2 - .06], [L / 2 - .06, Dp / 2 - .06]]) { const leg = box(g, .07, H - .05, .07, wood, x, (H - .05) / 2, z); }
    box(g, L, .04, .04, wood, 0, .06, Dp / 2 - .04); // thanh ngang dưới
    // vây lưng và hai tay vịn (song gỗ)
    box(g, L, .03, .03, wood, 0, H + .3, -Dp / 2 + .02); for (let k = 0; k <= 10; k++) box(g, .022, .3, .022, wood, -L / 2 + k * L / 10, H + .15, -Dp / 2 + .02);
    for (const sx of [-1, 1]) { box(g, .03, .03, Dp, wood, sx * (L / 2 - .015), H + .24, 0); for (let k = 0; k <= 4; k++) box(g, .022, .24, .022, wood, sx * (L / 2 - .015), H + .12, -Dp / 2 + .02 + k * (Dp - .04) / 4); }
    // nệm và gối tựa hai bên
    for (const sx of [-1, 1]) { const x = sx * (L / 2 - .32);
      box(g, .56, .06, Dp - .1, edge, x, H + .055, .01); box(g, .52, .03, Dp - .14, cush, x, H + .095, .01);
      const bol = cyl(g, .07, .07, .42, cush, sx * (L / 2 - .1), H + .15, -.05, 18); bol.rotation.x = Math.PI / 2;
      for (const z of [-.26, .16]) { const e = cyl(g, .072, .072, .02, edge, sx * (L / 2 - .1), H + .15, z, 18); e.rotation.x = Math.PI / 2; }
      const back = box(g, .5, .22, .07, cush, x, H + .22, -Dp / 2 + .1); back.rotation.x = -.15; }
    // bàn trà thấp (kháng kỷ) ở giữa
    const tb = new THREE.Group(); tb.position.set(0, H + .03, 0); g.add(tb);
    box(tb, .46, .03, .5, wood, 0, .15, 0); box(tb, .42, .06, .46, wood2, 0, .11, 0);
    for (const [x, z] of [[-.2, -.22], [.2, -.22], [-.2, .22], [.2, .22]]) box(tb, .035, .1, .035, wood, x, .05, z);
    // bàn cờ vây
    const bc = document.createElement('canvas'); bc.width = bc.height = 256; const x = bc.getContext('2d');
    x.fillStyle = '#d9a95a'; x.fillRect(0, 0, 256, 256); for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(120,70,20,${Math.random() * .12})`; x.beginPath(); x.moveTo(0, Math.random() * 256); x.lineTo(256, Math.random() * 256); x.stroke(); }
    x.strokeStyle = '#3a2410'; x.lineWidth = 2; for (let k = 0; k < 9; k++) { const p = 20 + k * 27; x.beginPath(); x.moveTo(20, p); x.lineTo(236, p); x.stroke(); x.beginPath(); x.moveTo(p, 20); x.lineTo(p, 236); x.stroke(); }
    x.fillStyle = '#3a2410'; for (const [a, b] of [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]]) { x.beginPath(); x.arc(20 + a * 27, 20 + b * 27, 4, 0, 7); x.fill(); }
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Group(); board.position.set(0, .18, -.02); tb.add(board);
    box(board, .3, .035, .3, new THREE.MeshStandardMaterial({ color: 0xb8843a, roughness: .5 }), 0, 0, 0);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(.29, .29), new THREE.MeshStandardMaterial({ map: bt, roughness: .55 })); top.rotation.x = -Math.PI / 2; top.position.y = .018; board.add(top);
    g.userData.board = board; // quân cờ thêm vào đây: ô (i,j) ở x = (i-4)*.0315
    // hũ quân trắng đen, chén trà có nắp
    const blk = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .3 }), wht = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: .3 });
    for (const [sx, mt] of [[-1, blk], [1, wht]]) { cyl(tb, .045, .035, .05, wood2, sx * .17, .19, .17, 16); const st = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), mt); st.scale.y = .45; st.position.set(sx * .17, .215, .17); tb.add(st); }
    for (const sx of [-1, 1]) { cyl(tb, .028, .018, .03, m.porcelain, sx * .17, .18, -.17, 14); cyl(tb, .03, .028, .012, m.blue, sx * .17, .2, -.17, 14); cyl(tb, .007, .007, .012, m.porcelain, sx * .17, .212, -.17, 6); }
    // đèn lồng nhỏ để bàn
    cyl(tb, .02, .03, .07, wood, 0, .2, .2, 8); const lamp = cyl(tb, .045, .05, .09, new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xff7a2a, emissiveIntensity: .9, roughness: .6 }), 0, .28, .2, 14);
    g.userData.kang = { L, top: H + .1 };
    return shade(g); } },
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
// Ngự hoa viên mở rộng phía nam: cổng, vườn mẫu đơn, hồ sen + cầu đá, đình Vọng Nguyệt
function gardenSouth(o, m, t, tree) {
  const g = o.group, B = o.southBlocks = [];
  const pathM = new THREE.MeshStandardMaterial({ map: t.stone, roughness: .8 });
  for (const [z, l] of [[10.2, 4.4], [21, 1.4]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, l), pathM); p.rotation.x = -Math.PI / 2; p.position.set(0, .012, z); p.receiveShadow = true; g.add(p); }
  // cổng hoa nối hai khu vườn
  const gate = new THREE.Group(); gate.position.set(0, 0, 8.9); g.add(gate);
  for (const sx of [-1, 1]) { cyl(gate, .13, .15, 3, m.red, sx * 1.15, 1.5, 0, 12); cyl(gate, .24, .26, .2, m.stone, sx * 1.15, .1, 0, 12); B.push({ x: sx * 1.15, z: 8.9, r: .3 }); }
  box(gate, 2.9, .22, .3, m.red, 0, 2.8, 0); box(gate, 3.4, .14, .7, m.roofTile, 0, 3.05, 0); box(gate, 1.4, .4, .06, m.gold, 0, 2.45, .16);
  for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 7.1, 0, 8.9); g.add(w); box(w, 9.8, 1.6, .35, m.wall, 0, .8, 0); box(w, 9.8, .14, .6, m.roofTile, 0, 1.68, 0); B.push(...[-4, -2, 0, 2, 4].map(k => ({ x: sx * 7.1 + k, z: 8.9, r: 1.05 }))); }
  // vườn mẫu đơn
  const pet = [0xe0457b, 0xf6c1d3, 0xffffff, 0xf2c14e, 0xc23b5a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .7 })), soil = new THREE.MeshStandardMaterial({ color: 0x4a3324 });
  for (const [x, z] of [[-3, 11], [3, 11], [-6.6, 11], [6.6, 11], [-3, 21.2], [3, 21.2]]) {
    const bed = new THREE.Group(); bed.position.set(x, 0, z); g.add(bed); box(bed, 2.6, .28, 1.3, m.stone, 0, .14, 0); box(bed, 2.45, .05, 1.15, soil, 0, .29, 0);
    for (let k = 0; k < 9; k++) { const bx = rnd(-1.05, 1.05), bz = rnd(-.45, .45); const bu = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(.18, .26), 1), m.leaf); bu.position.set(bx, .45, bz); bed.add(bu);
      for (let f = 0; f < 3; f++) { const fl = new THREE.Mesh(new THREE.SphereGeometry(rnd(.07, .1), 10, 8), pet[(k + f) % pet.length]); fl.position.set(bx + rnd(-.15, .15), .58 + rnd(0, .08), bz + rnd(-.15, .15)); fl.scale.y = .7; bed.add(fl); } }
    B.push({ x: x - .7, z, r: .75 }, { x: x + .7, z, r: .75 }); }
  // hồ sen
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshStandardMaterial({ map: t.water, roughness: .1, metalness: .3, color: 0xa9dccf })); lake.rotation.x = -Math.PI / 2; lake.scale.set(6.4, 3.5, 1); lake.position.set(0, .02, 16); g.add(lake);
  for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; if (Math.abs(Math.sin(a)) > .93) continue; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(.18, .34)), m.rock); r.position.set(Math.cos(a) * 6.5, .1, 16 + Math.sin(a) * 3.6); g.add(r); }
  const pad = new THREE.MeshStandardMaterial({ color: 0x4f8f45, roughness: .7, side: THREE.DoubleSide }), lot = new THREE.MeshStandardMaterial({ color: 0xf3a6c0, roughness: .6 });
  for (let k = 0; k < 40; k++) { const x = rnd(-5.6, 5.6), z = 16 + rnd(-2.8, 2.8); if (Math.abs(x) < 1.1 || (x * x) / 31 + ((z - 16) ** 2) / 8.4 > 1) continue; const lp = new THREE.Mesh(new THREE.CircleGeometry(rnd(.2, .34), 14, .3, Math.PI * 1.85), pad); lp.rotation.x = -Math.PI / 2; lp.rotation.z = rnd(0, 6); lp.position.set(x, .035, z); g.add(lp);
    if (k % 3 === 0) { const fl = new THREE.Group(); fl.position.set(x + .05, .05, z); g.add(fl); for (let p = 0; p < 6; p++) { const pe = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), lot); pe.scale.set(.6, 1.3, .35); pe.position.set(Math.cos(p) * .05, .08, Math.sin(p) * .05); pe.rotation.set(Math.sin(p) * .5, 0, -Math.cos(p) * .5); fl.add(pe); } const c = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), m.gold); c.position.y = .1; fl.add(c); } }
  B.push({ x: -3.55, z: 16, r: 2.85 }, { x: 3.55, z: 16, r: 2.85 }, { x: -5.2, z: 16, r: 2.5 }, { x: 5.2, z: 16, r: 2.5 });
  // cầu đá lan can son đỏ
  const br = new THREE.Group(); br.position.set(0, 0, 16); g.add(br);
  box(br, 1.4, .14, 7.8, m.stone, 0, .09, 0);
  for (const sx of [-1, 1]) { for (let k = 0; k <= 10; k++) cyl(br, .035, .035, .48, m.red, sx * .66, .38, -3.9 + k * .78, 8); box(br, .05, .05, 7.8, m.red, sx * .66, .62, 0); box(br, .04, .04, 7.8, m.red, sx * .66, .38, 0); }
  for (const z of [-3.9, 3.9]) for (const sx of [-1, 1]) { const ball = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), m.gold); ball.position.set(sx * .66, .7, z); br.add(ball); }
  // đình Vọng Nguyệt
  const pv = new THREE.Group(); pv.position.set(0, 0, 23.4); g.add(pv);
  box(pv, 4.4, .2, 4, m.stone, 0, .1, 0); box(pv, 4.1, .16, 3.7, m.stone, 0, .27, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(pv, .1, .1, 2.6, m.red, sx * 1.75, 1.65, sz * 1.55, 12); B.push({ x: sx * 1.75, z: 23.4 + sz * 1.55, r: .2 }); }
  for (const sz of [-1, 1]) box(pv, 3.7, .18, .14, m.red, 0, 2.85, sz * 1.55); for (const sx of [-1, 1]) box(pv, .14, .18, 3.3, m.red, sx * 1.75, 2.85, 0);
  const rf = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.4, 4, 1, true), m.roofTile); rf.rotation.y = Math.PI / 4; rf.position.y = 3.6; pv.add(rf);
  const rfIn = new THREE.Mesh(new THREE.ConeGeometry(3.38, 1.38, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a5a4c, side: THREE.BackSide })); rfIn.rotation.y = Math.PI / 4; rfIn.position.y = 3.59; pv.add(rfIn);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 8), m.gold); fin.position.y = 4.35; pv.add(fin);
  const plq = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .42), new THREE.MeshStandardMaterial({ map: plaqueTex('望月亭'), roughness: .5 })); plq.position.set(0, 2.6, -1.63); plq.rotation.y = Math.PI; pv.add(plq);
  const tb = new THREE.Group(); tb.position.set(0, .35, .1); pv.add(tb); cyl(tb, .45, .45, .06, m.stone, 0, .44, 0, 20); cyl(tb, .12, .22, .42, m.stone, 0, .21, 0, 12);
  B.push({ x: 0, z: 23.5, r: .55 });
  [-.85, .85].forEach((dx, i) => { const sd = DECOR.ghedon.make(); sd.position.set(dx, .35, .1); pv.add(sd); o.seats.push({ id: 'hv' + (3 + i), x: dx, z: 23.5, ry: dx < 0 ? Math.PI / 2 : -Math.PI / 2, top: .57, kind: 'chair', obj: sd }); });
  // liễu, đào quanh hồ
  for (const [x, z, s, p] of [[-8.4, 13, 1.2, false], [8.2, 13.6, 1.1, false], [-8, 19.5, 1.15, false], [8.6, 19, 1.2, false], [-9.5, 23.5, 1.1, true], [9.5, 23.5, 1.1, true], [-5.5, 24.3, .9, true], [5.5, 24.3, .9, true]]) { tree(x, z, s, p); B.push({ x, z, r: .3 }); }
  // đèn đá dọc lối
  for (const [x, z] of [[1.15, 11.6], [-1.15, 11.6], [1.15, 20.7], [-1.15, 20.7]]) { const s = new THREE.Group(); s.position.set(x, 0, z); g.add(s); cyl(s, .12, .16, .7, m.stone, 0, .35, 0, 6); box(s, .3, .25, .3, m.stone, 0, .82, 0); const c = cyl(s, .22, .02, .18, m.stone, 0, 1.03, 0, 6); c.rotation.y = .5; const lt = new THREE.Mesh(new THREE.BoxGeometry(.16, .14, .16), m.candle); lt.position.y = .82; s.add(lt); B.push({ x, z, r: .22 }); }
}
// ---------- Sân cung lúc chuyển dạ: cổng cung, nhà chờ, đèn lồng ----------
function sansinh(o, name) {
  const m = mats(), t = textures(), g = o.group;
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), new THREE.MeshStandardMaterial({ map: t.stone, roughness: .85 })); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; gr.name = 'ground'; g.add(gr);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(4, 8, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); g.add(sun);
  // tường bao và mặt tiền cung (người cao ~1 đơn vị)
  const wallM = m.wall, red = m.red, tile = m.roofTile;
  for (const [x, z, w, ry] of [[0, -5, 16, 0], [-8, 0, 10, Math.PI / 2], [8, 0, 10, Math.PI / 2], [0, 5, 16, 0]]) { const wl = new THREE.Group(); wl.position.set(x, 0, z); wl.rotation.y = ry; g.add(wl); box(wl, w, 1.5, .25, wallM, 0, .75, 0); box(wl, w + .2, .1, .55, tile, 0, 1.55, 0); }
  const fa = new THREE.Group(); fa.position.set(0, 0, -4.7); g.add(fa);
  box(fa, 6, .18, 1.2, m.stone, 0, .09, .2); // bậc thềm
  for (let k = 0; k < 2; k++) box(fa, 1.6, .06, .25, m.stone, 0, .03 + k * .06, .95 - k * .2);
  box(fa, 6, 1.7, .3, wallM, 0, 1.03, -.2);
  for (const x of [-2.6, -1.2, 1.2, 2.6]) cyl(fa, .08, .08, 1.7, red, x, 1.03, .3, 12);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(.01, 1, 6.8, 4, 1, false, Math.PI / 4), tile); roof.rotation.z = Math.PI / 2; roof.scale.set(.75, 1, 1.2); roof.position.set(0, 2.25, 0); fa.add(roof);
  box(fa, 6.6, .12, 1.5, red, 0, 1.92, 0);
  // cửa cung hai cánh son đỏ đinh vàng
  for (const sx of [-1, 1]) { const dr = box(fa, .5, 1.25, .06, red, sx * .26, .8, -.03); for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const nail = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 4), m.gold); nail.position.set(sx * .26 + (c - 1) * .13, .35 + r * .27, 0); fa.add(nail); } }
  box(fa, 1.15, .08, .1, m.gold, 0, 1.45, -.02);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .42), new THREE.MeshStandardMaterial({ map: plaqueTex(name || 'Cung'), roughness: .5 })); pl.position.set(0, 1.68, -.03); fa.add(pl);
  o.gate = { x: 0, z: -4.1 };
  // đèn lồng đỏ treo cổng (cung có hỷ)
  for (const x of [-.95, .95]) { const ln = new THREE.Mesh(new THREE.SphereGeometry(.14, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd62a2a, emissive: 0xc81e1e, emissiveIntensity: .7 })); ln.scale.y = 1.15; ln.position.set(x, 1.32, .35); fa.add(ln); const lt = new THREE.PointLight(0xff6a3c, .8, 3); lt.position.set(x, 1.3, .55); fa.add(lt); cyl(fa, .004, .004, .2, m.gold, x, 1.55, .35, 4); }
  // nhà chờ (đình lục giác thấp) bên phải sân
  const pv = new THREE.Group(); pv.position.set(2.7, 0, .3); g.add(pv);
  cyl(pv, 1.9, 2, .14, m.stone, 0, .07, 0, 6);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; cyl(pv, .055, .055, 1.55, red, Math.cos(a) * 1.75, .9, Math.sin(a) * 1.75, 10); }
  const pr = new THREE.Mesh(new THREE.ConeGeometry(2.25, .9, 6, 1, true), tile); pr.position.y = 2.1; pr.rotation.y = Math.PI / 6; pv.add(pr);
  const prIn = new THREE.Mesh(new THREE.ConeGeometry(2.23, .88, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a5a4c, side: THREE.BackSide })); prIn.position.y = 2.09; prIn.rotation.y = Math.PI / 6; pv.add(prIn);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), m.gold); fin.position.y = 2.6; pv.add(fin);
  // ngai Hoàng thượng và ghế ngồi chờ
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a2410, roughness: .45 });
  const th = new THREE.Group(); th.position.set(0, .14, -.95); pv.add(th); box(th, .6, .06, .45, wood, 0, .28, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(th, .05, .28, .05, wood, sx * .26, .14, sz * .19); box(th, .6, .5, .05, wood, 0, .56, -.2); box(th, .64, .06, .08, m.gold, 0, .82, -.2); box(th, .5, .03, .38, new THREE.MeshStandardMaterial({ color: 0xe8c04a }), 0, .325, .02);
  const tb = new THREE.Group(); tb.position.set(0, .14, -.25); pv.add(tb); cyl(tb, .3, .3, .035, wood, 0, .42, 0, 18); cyl(tb, .05, .1, .4, wood, 0, .2, 0, 10); for (const [x, z] of [[-.08, .05], [.1, -.05]]) cyl(tb, .035, .03, .05, new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), x, .465, z, 10);
  o.npcSeats = { ht: { x: 2.7, z: .3 - .95, ry: 0, top: .14 + .33, kind: 'chair' } };
  o.seats = [];
  const seatPos = [[-1.15, -.55], [-1.2, .35], [-.7, 1.05], [.7, 1.05], [1.2, .35], [1.15, -.55], [-.4, .05], [.4, .05]];
  seatPos.forEach(([x, z], i) => { const d = DECOR.ghedon.make(); d.position.set(x, .14, z); pv.add(d); const ry = Math.atan2(-x, -z + -.25 * 0); o.seats.push({ id: 'ss' + i, x: 2.7 + x, z: .3 + z, ry: Math.atan2(0 - x, -.25 - z), top: .14 + .22, kind: 'chair', obj: d }); });
  o.feiSeats = o.seats.slice(0, 3); o.seats = o.seats.slice(3); // 3 ghế đầu cho phi tần NPC, còn lại cho người chơi
  // chậu cây, lư hương
  for (const [x, z] of [[-2.2, -3.3], [2.2, -3.3]]) { const pt = new THREE.Group(); pt.position.set(x, 0, z); g.add(pt); cyl(pt, .22, .17, .3, new THREE.MeshStandardMaterial({ color: 0x2b4a7a, roughness: .4 }), 0, .15, 0, 16); const bu = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 1), m.leaf); bu.position.y = .5; pt.add(bu); }
  const lh = new THREE.Group(); lh.position.set(-.9, 0, -2.2); g.add(lh); cyl(lh, .2, .16, .22, m.gold, 0, .36, 0, 14); for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; cyl(lh, .02, .025, .26, m.gold, Math.cos(a) * .13, .13, Math.sin(a) * .13, 6); }
  o.lights = { hemi: [0xfff0dc, 0x6a5a4a, 1.6], bg: 0x9ec9e3, fog: [0xd9c7b0, .02], exposure: 1.25 };
  o.bounds = { minX: -7.4, maxX: 7.4, minZ: -3.6, maxZ: 4.5 };
  o.blocks = [{ x: 2.7, z: .3 - .95, r: .4 }, { x: 2.7, z: .05, r: .35 }, ...o.seats.map(s => ({ x: s.x, z: s.z, r: .18 })), ...o.feiSeats.map(s => ({ x: s.x, z: s.z, r: .18 })), { x: -.9, z: -2.2, r: .25 }];
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; o.blocks.push({ x: 2.7 + Math.cos(a) * 1.75, z: .3 + Math.sin(a) * 1.75, r: .12 }); }
  o.spawn = { x: 0, z: 2.5 }; o.cam = { dist: 3.2, height: 1.6 };
}
// ---------- A ca sở · Thượng thư phòng: nơi nuôi dạy hoàng tự ----------
function acaso(o) {
  const m = mats(), g = o.group, W = 9, D = 7, H = 2.4;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.floor); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.name = 'ground'; g.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.ceil); ce.rotation.x = Math.PI / 2; ce.position.y = H; g.add(ce);
  for (const s of [-1, 1]) { box(g, .1, H, D, m.wall, s * (W / 2 + .05), H / 2, 0); for (let k = -1; k <= 1; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, H - .6), m.lattice); p.position.set(s * (W / 2 - .01), (H - .6) / 2 + .2, k * 2.4); p.rotation.y = -s * Math.PI / 2; g.add(p); } }
  box(g, W, H, .1, m.wall, 0, H / 2, -D / 2 - .05); box(g, W, H, .1, m.wall, 0, H / 2, D / 2 + .05);
  for (const x of [-W / 2 + .3, -1.7, 1.7, W / 2 - .3]) for (const z of [-D / 2 + .3, D / 2 - .3]) cyl(g, .14, .14, H, m.red, x, H / 2, z, 16);
  for (let k = -1; k <= 1; k++) box(g, W, .16, .2, m.red, 0, H - .1, k * 2.6);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .4), new THREE.MeshStandardMaterial({ map: plaqueTex('上書房', '#4a1010'), roughness: .5 })); pl.position.set(0, H - .45, -D / 2 + .02); g.add(pl);
  const paper = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: .9 }), ink = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .4 }), wood = new THREE.MeshStandardMaterial({ color: 0x5a2e16, roughness: .5 }), cush = new THREE.MeshStandardMaterial({ color: 0xb8323a, roughness: .8 });
  for (const x of [-1.3, 1.3]) { box(g, .4, 1, .02, paper, x, 1.2, -D / 2 + .03); for (let k = 0; k < 4; k++) box(g, .035, .15, .01, ink, x, 1.5 - k * .2, -D / 2 + .05); box(g, .46, .035, .035, wood, x, 1.71, -D / 2 + .05); box(g, .46, .035, .035, wood, x, .69, -D / 2 + .05); }
  // bàn Thái phó
  const td = new THREE.Group(); td.position.set(0, 0, -2.5); g.add(td); box(td, 1.05, .04, .4, wood, 0, .44, 0); for (const sx of [-1, 1]) box(td, .05, .43, .36, wood, sx * .48, .215, 0);
  for (let k = 0; k < 3; k++) box(td, .15, .025, .11, k % 2 ? paper : new THREE.MeshStandardMaterial({ color: 0x2b4a7a }), -.33, .475 + k * .025, 0); box(td, .2, .006, .14, paper, .07, .463, .03);
  // bàn học của các hoàng tự
  o.kidDesks = [];
  for (const [x, z] of [[-1.5, -.9], [0, -.9], [1.5, -.9], [-1.5, .4], [0, .4], [1.5, .4]]) {
    const d = new THREE.Group(); d.position.set(x, 0, z); g.add(d); box(d, .55, .025, .26, wood, 0, .18, 0); for (const sx of [-1, 1]) box(d, .03, .17, .24, wood, sx * .25, .085, 0);
    box(d, .17, .004, .13, paper, -.06, .195, 0); box(d, .06, .012, .045, ink, .16, .198, 0); const cs = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .04, 16), cush); cs.position.set(0, .02, .3); d.add(cs);
    o.kidDesks.push({ x, z: z + .3, ry: Math.PI });
  }
  // góc A ca sở: nôi và bình phong
  const bp = DECOR.binhphong.make(); bp.position.set(-3.2, 0, .9); bp.rotation.y = Math.PI / 2; g.add(bp);
  o.cradles = [[-3.95, -2.3], [-3.95, -1.5], [-3.95, -.7], [-3.95, .1]].map(([x, z]) => { const cr = makeCradle(); cr.position.set(x, 0, z); cr.rotation.y = Math.PI / 2; g.add(cr); return { x, z, obj: cr }; });
  // bia bắn cung, giá sách
  const tg = new THREE.Group(); tg.position.set(3.9, 0, -2.9); tg.rotation.y = -.6; g.add(tg); cyl(tg, .025, .025, .8, wood, -.2, .4, 0, 8); cyl(tg, .025, .025, .8, wood, .2, .4, 0, 8);
  [[.26, 0xf2e6c8], [.2, 0xb8323a], [.12, 0xf2e6c8], [.06, 0xd9a845]].forEach(([r, c], i) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .02, 32), new THREE.MeshStandardMaterial({ color: c, roughness: .7 })); d.rotation.x = Math.PI / 2; d.position.set(0, .66, .02 + i * .005); tg.add(d); });
  o.target = { x: 4.3, z: -3.2 };
  for (const z of [-.9, 1.3]) { const sh = new THREE.Group(); sh.position.set(4.37, 0, z); g.add(sh); box(sh, .24, 1.25, .9, wood, 0, .625, 0); for (let k = 0; k < 4; k++) { box(sh, .2, .02, .84, wood, -.02, .22 + k * .28, 0); for (let b = 0; b < 7; b++) box(sh, .13, .19, .06, [paper, new THREE.MeshStandardMaterial({ color: 0x2b4a7a }), new THREE.MeshStandardMaterial({ color: 0x7a2b2b })][(b + k) % 3], -.04, .33 + k * .28, -.36 + b * .12); } }
  lanternHang(g, -2.2, H - .5, .4); lanternHang(g, 2.2, H - .5, .4);
  shade(g);
  o.lights = { hemi: [0xfff0dc, 0x6a3a2a, 1.9], bg: 0x3a1c18, fog: [0x4a2a22, .012], exposure: 1.4 };
  o.bounds = { minX: -W / 2 + .4, maxX: W / 2 - .4, minZ: -D / 2 + .4, maxZ: D / 2 - .4 };
  o.blocks = [{ x: 0, z: -2.5, r: .55 }, ...o.kidDesks.map(d => ({ x: d.x, z: d.z - .3, r: .3 })), ...o.cradles.map(c => ({ x: c.x, z: c.z, r: .3 })), { x: 4.4, z: -.9, r: .45 }, { x: 4.4, z: 1.3, r: .45 }];
  o.spawn = { x: 0, z: 2.6 }; o.cam = { dist: 2.6, height: 1.4 };
}
// nôi gỗ đung đưa
export function makeCradle() {
  const g = new THREE.Group(), m = mats(), wood = new THREE.MeshStandardMaterial({ color: 0x7a3a1a, roughness: .45 }), cloth = new THREE.MeshStandardMaterial({ color: 0xf3d6a0, roughness: .9 });
  const rock = new THREE.Group(); rock.name = 'rock'; g.add(rock);
  for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(.5, .025, 6, 20, Math.PI * .5), wood); r.rotation.set(0, Math.PI / 2, Math.PI * .75); r.position.set(sx * .22, .5, 0); g.add(r); }
  box(rock, .5, .05, .78, wood, 0, .24, 0); for (const sx of [-1, 1]) box(rock, .03, .22, .78, wood, sx * .25, .36, 0); for (const sz of [-1, 1]) box(rock, .5, .3, .03, wood, 0, .38, sz * .39);
  box(rock, .44, .06, .72, cloth, 0, .29, 0); const pil = box(rock, .3, .05, .14, new THREE.MeshStandardMaterial({ color: 0xd94a5a, roughness: .8 }), 0, .33, -.26);
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .3, 16, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xc23b3b, roughness: .8, side: THREE.DoubleSide })); hood.rotation.set(0, 0, Math.PI / 2); hood.position.set(0, .52, -.28); rock.add(hood);
  g.scale.setScalar(.62); g.userData.bed = { y: .2 }; return g;
}
// Dưỡng Tâm điện: án thư trước ngai (mài mực hầu bút) và sập cờ bên hông (hầu cờ)
function duongtamProps(o) {
  const m = mats(), g = o.group, dz = o.dais.z, y = o.dais.y;
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a1a0e, roughness: .4 }), lac = new THREE.MeshStandardMaterial({ color: 0x7a1a12, roughness: .35 });
  const desk = new THREE.Group(); desk.position.set(0, y, dz + .55); g.add(desk);
  box(desk, 1.5, .05, .36, lac, 0, .4, 0); box(desk, 1.44, .07, .3, wood, 0, .34, 0);
  for (const sx of [-1, 1]) { box(desk, .06, .38, .32, wood, sx * .68, .19, 0); box(desk, .1, .03, .38, m.gold, sx * .68, .02, 0); }
  const yel = new THREE.MeshStandardMaterial({ color: 0xe8c04a, roughness: .7 }), paper = new THREE.MeshStandardMaterial({ color: 0xf5ecd6, roughness: .9 }), ink = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .25 });
  for (let k = 0; k < 4; k++) { const b = box(desk, .2, .028, .13, k % 2 ? yel : paper, -.52, .44 + k * .03, -.02); b.rotation.y = (k - 1.5) * .08; }
  const sc = box(desk, .36, .006, .22, paper, -.08, .428, .02); sc.rotation.y = .06;
  for (let k = 0; k < 6; k++) box(desk, .004, .007, .16, ink, -.22 + k * .05, .432, .02);
  box(desk, .16, .05, .05, wood, .22, .45, -.1); for (let k = 0; k < 4; k++) { cyl(desk, .006, .004, .2, wood, .16 + k * .04, .55, -.1, 6); }
  const stone = box(desk, .17, .035, .12, new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: .5 }), .5, .44, .04); box(desk, .12, .01, .07, ink, .5, .46, .03);
  o.anthu = { y, z: dz + .55, top: y + .425, ink: { x: .5, y: y + .47, z: dz + .59 }, mai: { x: .98, z: dz + .3, ry: Math.atan2(.5 - .98, .59 - .3) } };
  // sập La Hán đặt bàn cờ vây
  const lh = DECOR.lahan.make(), X = 2.45, Z = .6, ry = Math.PI / 2; lh.position.set(X, 0, Z); lh.rotation.y = ry; g.add(lh);
  const c = Math.cos(ry), sn = Math.sin(ry), at = lx => ({ x: X + lx * c + .06 * sn, z: Z - lx * sn + .06 * c });
  o.goTable = { obj: lh, board: lh.userData.board, seats: [{ ...at(.56), ry: ry - Math.PI / 2, top: .36, kind: 'chair' }, { ...at(-.56), ry: ry + Math.PI / 2, top: .36, kind: 'chair' }] };
  o.blocks = [...(o.blocks || []), { x: X, z: Z - .5, r: .5 }, { x: X, z: Z + .5, r: .5 }];
}
function garden(o) {
  const m = mats(), t = textures(), g = o.group;
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(36, 50), new THREE.MeshStandardMaterial({ map: t.grass, roughness: 1 })); gr.rotation.x = -Math.PI / 2; gr.position.z = 8; gr.receiveShadow = true; gr.name = 'ground'; g.add(gr);
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
  o.seats = [];
  [0, 2.1, 4.2].forEach((a, i) => { const s = DECOR.ghedon.make(); s.position.set(Math.cos(a) * .72, .25, Math.sin(a) * .72); pv.add(s);
    o.seats.push({ id: 'hv' + i, x: 4 + Math.cos(a) * .72, z: -3 + Math.sin(a) * .72, ry: Math.atan2(-Math.cos(a), -Math.sin(a)), top: .65, kind: 'chair', obj: s }); });
  // cây hoa đào
  const tree = (x, z, s = 1, pink = true) => { const tg = new THREE.Group(); tg.position.set(x, 0, z); tg.scale.setScalar(s); g.add(tg); const tr = cyl(tg, .08, .14, 1.6, m.trunk, 0, .8, 0, 8); tr.rotation.z = rnd(-.15, .15); for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(.45, .7), 1), pink ? m.blossom : m.leaf); f.position.set(rnd(-.6, .6), rnd(1.5, 2.3), rnd(-.6, .6)); tg.add(f); } };
  for (const [x, z, s, p] of [[-2, 4, 1, true], [2.5, 4.5, .9, true], [-7, 3, 1.2, false], [7, 2, 1.1, true], [-1.8, -5, 1, false], [2.2, -6, 1.2, true], [8, -6, 1.1, false], [-8, -5, 1, true], [5, 6, 1, false]]) tree(x, z, s, p);
  // non bộ đá
  for (const [x, z] of [[1.8, -1], [-1.8, 1.5], [6, 3.5]]) { for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(.25, .55)), m.rock); r.position.set(x + rnd(-.4, .4), rnd(.2, .6), z + rnd(-.4, .4)); r.scale.y = rnd(1, 1.8); g.add(r); } }
  // tường cung đỏ ngói vàng bao quanh
  for (const [x, z, w, ry] of [[0, -10, 24, 0], [0, 26, 24, 0], [-12, 8, 36, Math.PI / 2], [12, 8, 36, Math.PI / 2]]) { const wall = new THREE.Group(); wall.position.set(x, 0, z); wall.rotation.y = ry; g.add(wall); box(wall, w, 2.4, .4, m.wall, 0, 1.2, 0); const rf = box(wall, w, .18, .8, m.roofTile, 0, 2.5, 0); rf.rotation.x = 0; }
  // đèn đá
  for (const [x, z] of [[1, 2.5], [-1, 2.5], [1, -4.5], [-1, -4.5]]) { const s = new THREE.Group(); s.position.set(x, 0, z); g.add(s); cyl(s, .12, .16, .7, m.stone, 0, .35, 0, 6); box(s, .3, .25, .3, m.stone, 0, .82, 0); const c = cyl(s, .22, .02, .18, m.stone, 0, 1.03, 0, 6); c.rotation.y = .5; const lt = new THREE.Mesh(new THREE.BoxGeometry(.16, .14, .16), m.candle); lt.position.y = .82; s.add(lt); }
  shade(g);
  const sun = new THREE.DirectionalLight(0xfff2d8, 3); sun.position.set(6, 10, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.position.set(7, 14, 14); sun.target.position.set(0, 0, 8); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 20, bottom: -20, far: 60 }); g.add(sun, sun.target);
  gardenSouth(o, m, t, tree);
  o.lights = { hemi: [0xdff0ff, 0x6a7a4a, 1.8], bg: 0xa9d3ea, fog: [0xcfe3ea, .013], exposure: 1.2 };
  o.bounds = { minX: -11, maxX: 11, minZ: -9, maxZ: 25 };
  o.blocks = [{ x: -4.5, z: -1, r: 3.1 }, { x: 4, z: -3, r: .55 }, ...o.seats.map(s => ({ x: s.x, z: s.z, r: .2 })), ...o.southBlocks];
  o.floorAt = (x, z) => Math.hypot(x - 4, z + 3) < 1.72 ? .25 : (Math.abs(x) < .7 && z > 12.1 && z < 19.9) ? .16 : (Math.abs(x) < 2.05 && Math.abs(z - 23.4) < 1.85) ? .34 : 0;
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
  const bed = bedOld(); bed.scale.setScalar(1.8); bed.position.set(0, 0, -D / 2 + .9); g.add(bed); o.bed = bed; bed.children.filter(m => m.isMesh && m.geometry.type === 'PlaneGeometry' && m.position.z > .3).forEach(m => m.visible = false); // vén rèm trước o.bedFront = -D / 2 + .9 + .75 * 1.8 / 2;
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


// ---------- Ngự thiện phòng: bếp cung đình ----------
function brickTex() {
  if (T.brick) return T.brick;
  T.brick = tex(512, 512, (g, w) => { g.fillStyle = '#4a2a1e'; g.fillRect(0, 0, w, w); const bh = 32, bw = 96; for (let r = 0; r < w / bh; r++) for (let c = -1; c < w / bw + 1; c++) { const x = c * bw + (r % 2) * bw / 2; const v = rnd(110, 150); g.fillStyle = `rgb(${v},${v * .48},${v * .32})`; g.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6); } }, [2, 1]);
  return T.brick;
}
function kitchen(o) {
  o.overhead = [];
  const m = mats(), t = textures(), g = o.group, W = 9, D = 7.4, H = 3.4;
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: .8 }), iron = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: .45, metalness: .7 });
  const clay = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: .9 }), bamboo = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: .85 }), brick = new THREE.MeshStandardMaterial({ map: brickTex(), roughness: .95 });
  const fireM = new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff4a08, emissiveIntensity: 1.3 });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: t.stone, color: 0x9a8a78, roughness: .95 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.name = 'ground'; g.add(fl);
  const plaster = new THREE.MeshStandardMaterial({ map: t.plaster, color: 0xd8c8b0, roughness: 1 });
  for (const sx of [-1, 1]) box(g, .1, H, D, plaster, sx * (W / 2 + .05), H / 2, 0);
  box(g, W, H, .1, plaster, 0, H / 2, -D / 2 - .05); o.overhead.push(box(g, W, H, .1, plaster, 0, H / 2, D / 2 + .05));
  // khung gỗ, xà nhà lộ
  for (const x of [-W / 2 + .15, -1.5, 1.5, W / 2 - .15]) for (const z of [-D / 2 + .15, D / 2 - .15]) box(g, .22, H, .22, dark, x, H / 2, z);
  for (let k = -3; k <= 3; k++) o.overhead.push(box(g, .16, .2, D, dark, k * 1.3, H - .1, 0));
  for (const z of [-D / 2 + .15, 0, D / 2 - .15]) o.overhead.push(box(g, W, .22, .2, dark, 0, H - .3, z));
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .56), new THREE.MeshStandardMaterial({ map: plaqueTex('御膳房', '#3a1a10'), roughness: .5 })); pl.position.set(0, H - .75, -D / 2 + .02); g.add(pl);
  // dãy bếp lò gạch ở vách sau
  const stoves = [];
  // nhân vật cao ~1.05 nên đồ bếp làm theo tỉ lệ 0.6
  box(g, 6.4, .5, .85, brick, 0, .25, -D / 2 + .5); box(g, 6.5, .05, .9, dark, 0, .525, -D / 2 + .5);
  box(g, 6.6, .35, 1.0, dark, 0, 1.75, -D / 2 + .5); // chụp khói
  for (const x of [-2.2, 0, 2.2]) {
    box(g, .5, 1.5, .4, brick, x, 2.65, -D / 2 + .3); // ống khói
    const mouth = box(g, .3, .18, .05, fireM, x, .2, -D / 2 + .93); stoves.push({ x, z: -D / 2 + .6 });
    const L = new THREE.PointLight(0xff7a2a, 2.4, 3.2, 1.5); L.position.set(x, .35, -D / 2 + 1.1); g.add(L); (o.flicker = o.flicker || []).push(L);
  }
  // chảo gang lớn
  const wok = makeVessel('chảo'); wok.position.set(-2.2, .55, -D / 2 + .5); wok.scale.setScalar(.6); g.add(wok);
  // nồi đất có nắp
  const pot = makeVessel('nồi'); pot.position.set(0, .55, -D / 2 + .5); pot.scale.setScalar(.6); g.add(pot);
  // xửng hấp tre
  const stm = makeVessel('xửng'); stm.position.set(2.2, .55, -D / 2 + .5); stm.scale.setScalar(.6); g.add(stm);
  o.steamAt = [{ x: -2.2, y: .66, z: -D / 2 + .5 }, { x: 0, y: .8, z: -D / 2 + .5 }, { x: 2.2, y: .76, z: -D / 2 + .5 }];
  // bàn thớt bên trái
  const tbl = new THREE.Group(); tbl.position.set(-3.4, 0, .2); tbl.scale.setScalar(.6); g.add(tbl);
  box(tbl, 1.6, .12, .8, m.wood, 0, .78, 0); for (const [x, z] of [[-.7, -.32], [.7, -.32], [-.7, .32], [.7, .32]]) box(tbl, .12, .78, .12, dark, x, .39, z);
  cyl(tbl, .28, .3, .12, new THREE.MeshStandardMaterial({ color: 0xa87a4a, roughness: .9 }), .2, .9, 0, 24); // thớt gỗ tròn
  box(tbl, .22, .015, .12, iron, -.35, .85, .15); // dao
  for (const [n, x, z, ry] of [['bí đao', -.55, -.22, .3], ['hành', -.45, .2, .2], ['ớt khô', .62, .22, 0], ['gừng', .6, -.2, 0], ['tỏi', -.7, .05, 0]]) { if (n === 'tỏi') continue; const v = makeIngredient(n); v.position.set(x, .84, z); v.rotation.y = ry; tbl.add(v); }
  o.board = { x: -3.28, y: .58, z: .2 };
  // kệ hũ, vại bên phải
  const sh = new THREE.Group(); sh.position.set(W / 2 - .3, 0, -.6); sh.rotation.y = -Math.PI / 2; sh.scale.setScalar(.6); g.add(sh);
  for (const y of [.4, 1.0, 1.6, 2.2]) box(sh, 2.4, .05, .45, m.wood, 0, y, 0); for (const x of [-1.18, 1.18]) box(sh, .06, 2.3, .45, dark, x, 1.15, 0);
  const jarMats = [m.blue, clay, m.porcelain, new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: .5 })];
  for (const y of [.4, 1.0, 1.6]) for (let k = 0; k < 5; k++) { const r = rnd(.08, .13), h = rnd(.18, .3); cyl(sh, r * .7, r, h, jarMats[(k + Math.round(y * 3)) % 4], -.95 + k * .47, y + h / 2 + .03, 0, 14); }
  // dây tỏi, ớt khô, thịt khô treo xà
  for (let k = 0; k < 7; k++) { const x = -2.8 + k * .9, str = new THREE.Group(); o.overhead.push(str); str.position.set(x, H - .45, -1.2 + (k % 2) * .6); g.add(str); cyl(str, .006, .006, .7, dark, 0, -.35, 0, 4);
    for (let j = 0; j < 6; j++) { const c = k % 3 === 0 ? 0xf2ead8 : k % 3 === 1 ? 0xc0221a : 0x7a2a18; const b = new THREE.Mesh(new THREE.SphereGeometry(k % 3 === 1 ? .03 : .045, 8, 6), new THREE.MeshStandardMaterial({ color: c, roughness: .7 })); b.scale.y = k % 3 === 1 ? 2.2 : 1; b.position.set(rnd(-.04, .04), -.15 - j * .09, rnd(-.03, .03)); str.add(b); } }
  // vại nước, bao gạo, củi
  cyl(g, .3, .25, .5, clay, -3.6, .25, -2.2, 20); const wtr = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), new THREE.MeshStandardMaterial({ map: t.water, roughness: .1 })); wtr.rotation.x = -Math.PI / 2; wtr.position.set(-3.6, .49, -2.2); wtr.scale.setScalar(.67); g.add(wtr);
  for (const [x, z] of [[3.4, 2.3], [3.0, 2.6], [3.6, 2.8]]) { const sk = cyl(g, .16, .19, .34, new THREE.MeshStandardMaterial({ color: 0xcdb98a, roughness: 1 }), x, .27, z, 10); sk.scale.z = .8; }
  for (let k = 0; k < 9; k++) { const lg = cyl(g, .06, .06, .7, new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 }), 3.3 + (k % 3) * .1, .05 + Math.floor(k / 3) * .09, 1.0, 8); lg.scale.set(.7, .7, .7); lg.rotation.z = Math.PI / 2; }
  // bàn dọn món phía trước
  const sv = new THREE.Group(); sv.position.set(1.9, 0, 1.2); sv.scale.setScalar(.6); g.add(sv);
  box(sv, 1.5, .08, .6, m.red, 0, .75, 0); for (const [x, z] of [[-.65, -.24], [.65, -.24], [-.65, .24], [.65, .24]]) box(sv, .07, .75, .07, m.darkRed, x, .375, z);
  for (let k = 0; k < 3; k++) { const b = makeDishware('chén'); b.position.set(-.55 + k * .2, .79, -.12); sv.add(b); }
  const plate = makeDishware('dĩa'); plate.position.set(.45, .79, -.1); sv.add(plate);
  box(sv, .5, .03, .32, m.gold, 0, .8, .14);
  o.servePt = { x: 1.9, y: .49, z: 1.14 };
  o.overhead.push(lanternHang(g, -2, H - .9, .8), lanternHang(g, 2, H - .9, .8, false));
  shade(g);
  o.lights = { hemi: [0xffe2c0, 0x5a3020, 1.5], bg: 0x2a1810, fog: [0x3a2418, .03], exposure: 1.35 };
  o.bounds = { minX: -W / 2 + .5, maxX: W / 2 - .7, minZ: -D / 2 + 1.15, maxZ: D / 2 - .5 };
  o.spawn = { x: 0, z: 1.4 };
  o.cam = { dist: 3.2, height: 1.7 };
  o.kst = { shelf: { x: W / 2 - .75, z: -.6, ry: Math.PI / 2 }, board: { x: -2.72, z: .2, ry: -Math.PI / 2 }, stove: [{ x: -2.2, z: -D / 2 + 1.22, ry: Math.PI }, { x: 0, z: -D / 2 + 1.22, ry: Math.PI }, { x: 2.2, z: -D / 2 + 1.22, ry: Math.PI }], serve: { x: 1.9, z: 1.62, ry: Math.PI } };
}

// ---------- yến tiệc: ngoài trời (Ngự hoa viên trang hoàng) hoặc trong điện ----------
const FEAST_NPC = [['Lệ Tần', 'tan'], ['Hân Quý nhân', 'quynhan'], ['Uyển Quý nhân', 'quynhan_lam'], ['Mai Đáp ứng', 'thuongtai']];
function lowTable(m) {
  const g = new THREE.Group();
  box(g, .46, .05, .78, m.red, 0, .27, 0); box(g, .48, .02, .8, m.gold, 0, .30, 0);
  for (const [x, z] of [[-.19, -.34], [.19, -.34], [-.19, .34], [.19, .34]]) box(g, .05, .25, .05, m.darkRed, x, .125, z);
  const dish = (x, z, c, r = .07) => { cyl(g, r, r * .7, .025, m.porcelain, x, .325, z, 16); for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(r * .32, 8, 6), new THREE.MeshStandardMaterial({ color: c, roughness: .6 })); f.position.set(x + (k % 2 - .5) * r * .5, .35, z + (k > 1 ? .5 : -.5) * r * .5); g.add(f); } };
  dish(0, -.22, 0xd9452a); dish(-.05, .05, 0xf2c94c); dish(.05, .26, 0x8bc34a, .06);
  cyl(g, .025, .03, .1, m.gold, .14, .36, -.02, 12); cyl(g, .025, .03, .1, m.gold, .14, .36, .1, 12);
  return shade(g);
}
function feastVenue(o, outdoor) {
  const m = mats(), t = textures(), g = o.group;
  const throneZ = -4.3;
  if (outdoor) {
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: t.grass, roughness: 1 })); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; g.add(gr);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(8, 11), new THREE.MeshStandardMaterial({ map: t.stone, roughness: .8 })); yard.rotation.x = -Math.PI / 2; yard.position.set(0, .01, -.3); yard.receiveShadow = true; yard.name = 'ground'; g.add(yard);
    // tường + mái
    for (const [x, z, w, ry] of [[0, -7, 20, 0], [-8, 0, 20, Math.PI / 2], [8, 0, 20, Math.PI / 2]]) { const wall = new THREE.Group(); wall.position.set(x, 0, z); wall.rotation.y = ry; g.add(wall); box(wall, w, 2.4, .4, m.wall, 0, 1.2, 0); box(wall, w, .18, .8, m.roofTile, 0, 2.5, 0); }
    // lọng che ngai
    const cv = new THREE.Group(); cv.position.set(0, 0, throneZ); g.add(cv);
    for (const x of [-1.3, 1.3]) for (const z of [-.6, .9]) cyl(cv, .06, .06, 2.4, m.red, x, 1.2, z, 12);
    box(cv, 3, .06, 1.8, m.red, 0, 2.45, .15); box(cv, 3.1, .18, .06, m.gold, 0, 2.35, 1.05);
    for (let k = 0; k < 9; k++) { const tas = new THREE.Mesh(new THREE.ConeGeometry(.04, .22, 6), m.gold); tas.rotation.x = Math.PI; tas.position.set(-1.4 + k * .35, 2.15, 1.06); cv.add(tas); }
    // cây đào hai bên
    const tree = (x, z, sc) => { const tg = new THREE.Group(); tg.position.set(x, 0, z); tg.scale.setScalar(sc); g.add(tg); cyl(tg, .08, .14, 1.6, m.trunk, 0, .8, 0, 8); for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(.45, .7), 1), m.blossom); f.position.set(rnd(-.6, .6), rnd(1.5, 2.3), rnd(-.6, .6)); tg.add(f); } };
    for (const [x, z, sc] of [[-5, -4, 1.2], [5, -4, 1.1], [-5.5, 1, 1], [5.5, 1.5, 1.2], [-5, 4.5, 1], [5, 5, 1.1]]) tree(x, z, sc);
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.6); sun.position.set(5, 10, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 }); g.add(sun);
    o.lights = { hemi: [0xfff0dc, 0x7a6a4a, 1.9], bg: 0xa9d3ea, fog: [0xd8e6ea, .018], exposure: 1.25 };
  } else {
    const W = 8.4, D = 11.6, H = 3.8;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.floor); fl.rotation.x = -Math.PI / 2; fl.position.z = -.3; fl.receiveShadow = true; fl.name = 'ground'; g.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.ceil); ce.rotation.x = Math.PI / 2; ce.position.set(0, H, -.3); g.add(ce);
    for (const s of [-1, 1]) { box(g, .08, H, D, m.wall, s * (W / 2 + .04), H / 2, -.3); for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.9, H - .4), m.lattice); p.position.set(s * (W / 2 - .02), (H - .4) / 2, -5 + k * 2.3); p.rotation.y = -s * Math.PI / 2; g.add(p); } }
    box(g, W, H, .1, m.wall, 0, H / 2, -6.15); box(g, W, H, .1, m.wall, 0, H / 2, 5.55);
    for (const x of [-3.4, 3.4]) for (const z of [-4.6, -2.3, 0, 2.3, 4.6]) { cyl(g, .2, .2, H, m.red, x, H / 2, z, 24); cyl(g, .3, .32, .12, m.stone, x, .06, z, 24); cyl(g, .215, .215, .05, m.gold, x, H - .35, z, 24); }
    for (const x of [-3.4, 3.4]) box(g, .22, .32, D, m.beam, x, H - .16, -.3);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2, .7), new THREE.MeshStandardMaterial({ map: plaqueTex('御花宴'), roughness: .5 })); pl.position.set(0, H - .7, -6.08); g.add(pl);
    const scr = DECOR.binhphong.make(); scr.scale.set(2.2, 2, 2); scr.position.set(0, .37, throneZ - .75); g.add(scr);
    for (const x of [-2.6, -1, 1, 2.6]) for (const z of [-3.5, -1, 1.5, 4]) lanternHang(g, x, H - .9, z, (x === -1 || x === 1));
    const key = new THREE.SpotLight(0xfff0d8, 14, 14, Math.PI / 4, .6, 1.2); key.position.set(0, H - .2, 2.5); key.target.position.set(0, .4, -2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); g.add(key, key.target);
    o.lights = { hemi: [0xfff0dc, 0x6a3a2a, 1.7], bg: 0x3a1c18, fog: [0x4a2a22, .018], exposure: 1.45 };
  }
  // bục + ngai Hoàng thượng
  box(g, 3.2, .12, 1.8, m.stone, 0, .06, throneZ); box(g, 2.8, .12, 1.5, m.darkRed, 0, .18, throneZ - .06); box(g, 2.4, .12, 1.2, m.darkRed, 0, .3, throneZ - .1);
  const th = new THREE.Group(); g.add(th);
  box(th, .8, .08, .55, m.red, 0, 0, 0); box(th, .72, .05, .48, m.cloth, 0, .06, .02); box(th, .8, .62, .07, m.red, 0, .33, -.25); box(th, .84, .06, .1, m.gold, 0, .66, -.25);
  for (const sd of [-1, 1]) box(th, .07, .28, .5, m.red, sd * .39, .16, 0);
  th.userData.legs = []; for (const sd of [-1, 1]) for (const z of [-.22, .22]) th.userData.legs.push(box(th, .06, 1, .06, m.red, sd * .35, -.5, z));
  shade(th); o.throne = th; o.dais = { y: .37, z: throneZ };
  const ht = lowTable(m); ht.scale.set(1.5, 1, 1.4); ht.rotation.y = Math.PI / 2; ht.position.set(0, .37, throneZ + .75); g.add(ht);
  // thảm giữa
  const cp = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7.6), m.carpet); cp.rotation.x = -Math.PI / 2; cp.position.set(0, .02, -.1); cp.receiveShadow = true; g.add(cp);
  // hai dãy bàn thấp + đệm ngồi
  const cushion = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: .7 });
  const rows = [-2.6, -1.55, -.5, .55, 1.6, 2.65];
  o.seats = []; o.npcSeats = [];
  let npcI = 0;
  for (const sd of [-1, 1]) rows.forEach((z, i) => {
    const tb = lowTable(m); tb.position.set(sd * 1.45, 0, z); g.add(tb);
    const cu = new THREE.Mesh(new THREE.BoxGeometry(.48, .07, .48), cushion); cu.position.set(sd * 1.98, .035, z); cu.castShadow = cu.receiveShadow = true; g.add(cu);
    const seat = { x: sd * 1.98, z, ry: sd < 0 ? Math.PI / 2 : -Math.PI / 2, top: .07, kind: 'floor', obj: cu };
    if ((i === 0 || i === 3) && npcI < FEAST_NPC.length) { const [name, model] = FEAST_NPC[npcI++]; o.npcSeats.push({ ...seat, name, model }); }
    else { seat.id = 'f' + o.seats.length; o.seats.push(seat); }
    if (outdoor) { const pole = new THREE.Group(); pole.position.set(sd * 3.3, 0, z); g.add(pole); cyl(pole, .025, .03, 1.6, m.red, 0, .8, 0, 8); const ln = lanternHang(pole, 0, 1.6, 0, i % 2 === 0); ln.scale.setScalar(.55); }
  });
  for (const sd of [-1, 1]) { const lh = DECOR.luhuong.make(); lh.scale.setScalar(1.5); lh.position.set(sd * 1.5, 0, throneZ + .9); g.add(lh); }
  shade(g);
  o.stage = { x: 0, z: -2.6, ry: Math.PI }; // chỗ dâng tiết mục, quay mặt về Hoàng thượng
  o.bounds = { minX: -3.1, maxX: 3.1, minZ: throneZ + 1.3, maxZ: 4.6 };
  o.blocks = [...rows.flatMap(z => [{ x: -1.45, z, r: .32 }, { x: 1.45, z, r: .32 }])];
  o.spawn = { x: 0, z: 3.8 };
  o.cam = { dist: 3.4, height: 1.8 };
}
// đạo cụ biểu diễn
export function makeGuzheng() {
  const m = mats(), g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 1.05, 24, 1, false, Math.PI / 2 - .22, .44), m.wood); body.rotation.z = Math.PI / 2; body.position.y = -.5; body.scale.set(1, 1, 1); g.add(body);
  const strMat = new THREE.MeshStandardMaterial({ color: 0xf6efe0, roughness: .3, metalness: .4 });
  for (let k = 0; k < 13; k++) { const z = -.1 + k * .0165; const st = box(g, 1.0, .004, .003, strMat, 0, .063, z); const br = box(g, .012, .03, .012, m.porcelain, -.25 + k * .035, .05, z); }
  box(g, .05, .03, .26, m.gold, -.48, .055, .006); box(g, .05, .03, .26, m.gold, .48, .055, .006);
  for (const x of [-.36, .36]) { box(g, .04, .3, .2, m.darkRed, x, -.13, 0); }
  return shade(g);
}
export function makeFan() {
  const g = new THREE.Group();
  const tex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'); const gr = x.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, '#f6d8d0'); gr.addColorStop(.6, '#d23a3a'); gr.addColorStop(1, '#8a1010'); x.fillStyle = gr; x.fillRect(0, 0, 256, 128); x.strokeStyle = '#f3d27a'; x.lineWidth = 3; for (let k = 0; k <= 12; k++) { const a = Math.PI + k / 12 * Math.PI; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); x.stroke(); } x.fillStyle = '#f3d27a'; x.beginPath(); x.arc(70, 70, 10, 0, 7); x.arc(175, 60, 7, 0, 7); x.fill(); return new THREE.CanvasTexture(c); })();
  tex.colorSpace = THREE.SRGBColorSpace;
  const fan = new THREE.Mesh(new THREE.CircleGeometry(.2, 24, 0, Math.PI), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .6 }));
  fan.geometry.attributes.uv.array.forEach((v, i, a) => {}); g.add(fan);
  const rim = new THREE.Mesh(new THREE.RingGeometry(.195, .205, 24, 1, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd9a845, metalness: .8, roughness: .3, side: THREE.DoubleSide })); g.add(rim);
  return g;
}
export function makeScroll() {
  const m = mats(), g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#f3e7c8'; x.fillRect(0, 0, 256, 160); x.fillStyle = '#3a1408'; x.font = '26px serif'; for (let col = 0; col < 6; col++) for (let r = 0; r < 4; r++) x.fillText('詩月花風山水'[(col + r) % 7], 210 - col * 36, 36 + r * 34);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(.3, .19), new THREE.MeshStandardMaterial({ map: tx, side: THREE.DoubleSide, roughness: .8 })); g.add(p);
  for (const sd of [-1, 1]) { const r = cyl(g, .012, .012, .22, m.wood, sd * .155, 0, 0, 8); r.rotation.x = 0; }
  return g;
}

export function buildLocation(loc, opts = {}) {
  const o = { group: new THREE.Group(), npcs: [], lights: null };
  if (loc === 'tuninh') { hall(o, { plaque: '慈寧宮' }); o.npcs = [{ model: 'thaihau', sit: true, name: 'Thái hậu', talk: 'thinhan' }, { model: 'thaiy', x: 2.4, z: 0, ry: -Math.PI / 2, name: 'Thái y', talk: 'thaiy' }, { model: 'mama', x: -2.4, z: 0.4, ry: Math.PI / 2, name: 'Quế ma ma', talk: 'mama' }]; }
  else if (loc === 'duongtam') { hall(o, { plaque: '養心殿', screenGold: true }); duongtamProps(o); o.npcs = [{ model: 'hoangthuong', sit: true, male: true, name: 'Hoàng thượng', talk: 'dangcanh' }, { model: 'thaigiam', x: 1.6, z: -2, ry: -Math.PI / 3, male: true, name: 'Tổng quản Lý Đức Toàn', talk: 'thaigiam' }, { model: 'thive', x: -3.6, z: 4.2, ry: Math.PI / 2, male: true, name: 'Thị vệ' }]; }
  else if (loc === 'hoavien') { garden(o); o.npcs = [{ model: 'cungnu', x: 3, z: -1.2, ry: -1, name: 'Cung nữ Tiểu Thúy', talk: 'dotin' }, { model: 'thive', x: 1.75, z: 9.3, ry: Math.PI, male: true, name: 'Thị vệ' }]; }
  else if (loc === 'phong') { room(o, { big: !!opts.palace, palaceName: opts.palace ? opts.palaceName : null }); o.npcs = [{ model: 'cungnu', x: (o.roomSize.W / 2 - .8), z: -o.roomSize.D / 2 + 1, ry: -2.3, name: 'Cung nữ thân tín', talk: 'cungnu' }]; o.decorable = true; }
  else if (loc === 'tamcung') { bedroom(o); o.npcs = [{ model: 'hoangthuong_dem', x: -.5, z: -.4, ry: .4, male: true, name: 'Hoàng thượng', idle: 'khoanh_tay' }]; }
  else if (loc === 'yentiec') { feastVenue(o, opts.venue !== 'in'); o.npcs = [{ model: 'hoangthuong', sit: true, male: true, name: 'Hoàng thượng' }, ...o.npcSeats.map(s => ({ model: s.model, x: s.x, z: s.z, ry: s.ry, name: s.name, kneel: s.top })), { model: 'thaigiam', x: -1.6, z: -3.6, ry: .6, male: true, name: 'Tổng quản Lý Đức Toàn' }, { model: 'cungnu', x: 1.6, z: -3.6, ry: -.6, name: 'Cung nữ dâng rượu' }]; }
  else if (loc === 'lanhcung') { coldPalace(o); o.npcs = [{ model: 'mama', x: 2, z: -2.2, ry: -2.5, name: 'Lão ma ma lãnh cung', talk: 'lanh' }, { model: 'aongu', x: -1.8, z: -1.6, ry: 2.2, name: 'Phế phi Trần thị', talk: 'phephi', idle: 'khoc' }]; }
  else if (loc === 'sansinh') { sansinh(o, opts.sinhName); const S = o.npcSeats.ht; o.npcs = [{ model: 'hoangthuong', x: S.x, z: S.z, ry: S.ry, male: true, name: 'Hoàng thượng', sit: true, talk: 'sinhHT', seat: S }, { model: 'thaihau', x: 1.9, z: -.75, ry: .5, name: 'Thái hậu', talk: 'sinhTH' }, { model: 'cungnu', x: -.7, z: -3.2, ry: 0, name: 'Cung nữ', talk: 'sinhCN' }, ...(opts.sinhFei || []).map((f, i) => ({ model: f.model, x: o.feiSeats[i].x, z: o.feiSeats[i].z, ry: o.feiSeats[i].ry, name: f.name, sit: true, seat: o.feiSeats[i], talk: 'sinhFei', tinh: f.tinh }))]; }
  else if (loc === 'acaso') { acaso(o); o.npcs = [{ model: 'thaiy', x: 0, z: -3.05, ry: 0, male: true, name: 'Thái phó Trương đại nhân', talk: 'thaipho' }, { model: 'mama', x: -3.3, z: .7, ry: -2.2, name: 'Nhũ mẫu A ca sở', talk: 'nhumau' }]; }
  else if (loc === 'ngutien') { kitchen(o); o.npcs = [{ model: 'thaigiam', x: 3.4, z: 2.2, ry: -2.2, male: true, name: 'Ngự trù Trương công công', talk: 'ngutru' }, { model: 'cungnu', x: -3.2, z: 1.1, ry: Math.PI, name: 'Cung nữ phụ bếp' }]; }
  return o;
}

// ---------- đạo cụ yến tiệc ----------
export function makeSword() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(.018, .62, .004), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: .9, roughness: .2 })); blade.position.y = .38; g.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(.07, .015, .02), new THREE.MeshStandardMaterial({ color: 0xd9a845, metalness: .8, roughness: .3 })); guard.position.y = .065; g.add(guard);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .11, 8), new THREE.MeshStandardMaterial({ color: 0x7a1210, roughness: .6 })); g.add(hilt);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(.015, .08, 6), new THREE.MeshStandardMaterial({ color: 0xd23a3a, roughness: .8 })); tassel.position.y = -.09; tassel.rotation.x = Math.PI; g.add(tassel);
  return g;
}
export function makeCup() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(.028, .018, .035, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8c25a, metalness: .85, roughness: .25, side: THREE.DoubleSide })); g.add(cup);
  const wine = new THREE.Mesh(new THREE.CircleGeometry(.026, 12), new THREE.MeshStandardMaterial({ color: 0x8a2a14, roughness: .2 })); wine.rotation.x = -Math.PI / 2; wine.position.y = .012; g.add(wine);
  return g;
}
// dải lụa: dải mỏng uốn lượn, cập nhật từng khung hình
export function makeRibbon(color = 0xe0457b) {
  const N = 24, geo = new THREE.BufferGeometry(), pos = new Float32Array((N + 1) * 2 * 3), idx = [];
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: .5, transparent: true, opacity: .92 }));
  mesh.frustumCulled = false; mesh.userData.N = N;
  mesh.userData.update = (start, t, side) => {
    const p = geo.attributes.position.array, L = 1.3;
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = start.x + side * u * L * .55 + Math.sin(t * 4 + u * 6) * .18 * u, y = start.y - u * .35 + Math.sin(t * 5 - u * 8) * .22 * u + .05, z = start.z + Math.cos(t * 3 + u * 5) * .25 * u;
      p.set([x, y, z], i * 6); p.set([x, y + .045, z], i * 6 + 3);
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  };
  return mesh;
}

export function makeCleaver() { const g = new THREE.Group(); const bl = new THREE.Mesh(new THREE.BoxGeometry(.11, .16, .006), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: .85, roughness: .25 })); bl.position.set(0, .12, 0); g.add(bl); const h = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .09, 8), new THREE.MeshStandardMaterial({ color: 0x4a2a16 })); g.add(h); return g; }
export function makeLadle() { const g = new THREE.Group(); const h = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .45, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a2a })); h.position.y = .22; g.add(h); const b = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: .7, roughness: .4, side: THREE.DoubleSide })); b.position.y = .46; b.rotation.x = Math.PI; g.add(b); return g; }
export function makeBowl(dish) { const m = mats(), g = new THREE.Group(); if (dish === 'dĩa') { cyl(g, .13, .09, .025, m.porcelain, 0, 0, 0, 20); cyl(g, .132, .132, .006, m.blue, 0, .014, 0, 20); const f = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc8662a, roughness: .5 })); f.scale.set(1.5, .5, 1); f.position.y = .03; g.add(f); } else { cyl(g, .085, .05, .07, m.porcelain, 0, 0, 0, 18); cyl(g, .088, .088, .008, m.blue, 0, .033, 0, 18); const s = new THREE.Mesh(new THREE.CircleGeometry(.078, 16), new THREE.MeshStandardMaterial({ color: 0xe8c890, roughness: .3 })); s.rotation.x = -Math.PI / 2; s.position.y = .028; g.add(s); } return g; }
