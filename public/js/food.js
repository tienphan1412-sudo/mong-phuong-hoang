// Nguyên liệu, nồi niêu, chén dĩa và món ăn hoàn chỉnh cho Ngự thiện phòng (dựng bằng hình khối có dáng thật)
import * as THREE from 'three';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .6, ...o });
const V = (x, y) => new THREE.Vector2(x, y);
const lathe = (pts, mat, seg = 32) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => V(x, y)), seg), mat);
function sph(r, mat, sx = 1, sy = 1, sz = 1, seg = 14) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), mat); m.scale.set(sx, sy, sz); return m; }
function cyl(rt, rb, h, mat, seg = 12) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); }
const rnd = (a, b) => a + Math.random() * (b - a);
const shade = g => { g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };

// ---------- men sứ hoa lam ----------
let porcTex = null;
function porcelainTex() {
  if (porcTex) return porcTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#f6f2e8'; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#1f4f9a';
  x.fillRect(0, 222, 512, 8); x.fillRect(0, 238, 512, 4); x.fillRect(0, 18, 512, 5); // viền miệng và đáy
  x.strokeStyle = '#2a5aa8'; x.lineWidth = 4;
  for (let k = 0; k < 8; k++) { const cx = 32 + k * 64; x.beginPath(); x.arc(cx, 150, 18, 0, Math.PI * 2); x.stroke(); for (let p = 0; p < 6; p++) { const a = p / 6 * Math.PI * 2; x.beginPath(); x.ellipse(cx + Math.cos(a) * 26, 150 + Math.sin(a) * 26, 10, 5, a, 0, Math.PI * 2); x.stroke(); } x.beginPath(); x.moveTo(cx + 32, 150); x.bezierCurveTo(cx + 40, 110, cx + 56, 190, cx + 64, 150); x.stroke(); }
  for (let k = 0; k < 32; k++) { x.beginPath(); x.moveTo(k * 16, 196); x.lineTo(k * 16 + 8, 208); x.lineTo(k * 16 + 16, 196); x.stroke(); }
  porcTex = new THREE.CanvasTexture(c); porcTex.colorSpace = THREE.SRGBColorSpace; porcTex.wrapS = THREE.RepeatWrapping;
  return porcTex;
}
const porc = () => new THREE.MeshStandardMaterial({ map: porcelainTex(), roughness: .2, metalness: .05, side: THREE.DoubleSide });

// ---------- chén, dĩa ----------
export function makeDishware(kind) {
  const g = new THREE.Group();
  if (kind === 'dĩa') { // dĩa sứ bầu dục
    const p = lathe([[0, 0], [.055, 0], [.06, .006], [.11, .014], [.14, .028], [.146, .032], [.14, .034], [.105, .02], [.05, .012], [0, .012]], porc(), 40); p.scale.set(1.25, 1, .95); g.add(p);
    g.userData = { fillY: .016, fillR: .1, oval: [1.25, .95] };
  } else { // chén sứ có chân đế
    const b = lathe([[0, 0], [.03, 0], [.032, .008], [.03, .012], [.05, .02], [.068, .045], [.078, .072], [.081, .078], [.076, .078], [.07, .05], [.048, .025], [0, .02]], porc(), 40); g.add(b);
    g.userData = { fillY: .058, fillR: .07 };
  }
  return shade(g);
}

// ---------- nồi, chảo, xửng ----------
export function makeVessel(kind) {
  const g = new THREE.Group();
  if (kind === 'chảo') {
    const iron = M(0x2a2a2a, { metalness: .75, roughness: .4, side: THREE.DoubleSide });
    g.add(lathe([[0, 0], [.12, .01], [.24, .05], [.33, .12], [.36, .16], [.35, .165], [.32, .125], [.23, .06], [.11, .022], [0, .015]], iron));
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(.04, .009, 8, 16), iron); h.position.set(s * .38, .15, 0); h.rotation.y = Math.PI / 2; g.add(h); }
  } else if (kind === 'nồi') {
    const clay = M(0x8a4026, { roughness: .85 }), glaze = M(0x3a1a10, { roughness: .35 });
    g.add(lathe([[0, 0], [.16, 0], [.22, .06], [.25, .16], [.24, .26], [.2, .3], [.2, .32], [.21, .33], [0, .33]], clay));
    const lid = lathe([[0, .1], [.03, .1], [.04, .07], [.12, .05], [.21, .015], [.22, 0], [0, 0]], glaze); lid.position.y = .33; g.add(lid);
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(.035, .012, 8, 14, Math.PI), clay); h.position.set(s * .245, .24, 0); h.rotation.set(0, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI / 2); g.add(h); }
  } else { // xửng tre
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#c9a46a'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#a8844a'; for (let k = 0; k < 32; k++) x.fillRect(k * 8, 0, 2, 64); x.fillStyle = '#7a5a2a'; x.fillRect(0, 4, 256, 5); x.fillRect(0, 55, 256, 5);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3; t.colorSpace = THREE.SRGBColorSpace;
    const bam = new THREE.MeshStandardMaterial({ map: t, roughness: .85 });
    for (let k = 0; k < 2; k++) { const r = cyl(.27, .27, .13, bam, 28); r.position.y = .065 + k * .135; g.add(r); }
    const lid = lathe([[0, .12], [.06, .11], [.2, .05], [.28, .0], [0, 0]], M(0xb8935a, { roughness: .85 })); lid.position.y = .27; g.add(lid);
  }
  return shade(g);
}

// ---------- nguyên liệu ----------
export function makeIngredient(name, cut = false) {
  const g = new THREE.Group();
  const add = (m, x = 0, y = 0, z = 0, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  if (name === 'hạt sen') { const m = M(0xf2e6c0, { roughness: .5 }); for (let k = 0; k < 7; k++) add(sph(.014, m, 1, .9, 1), rnd(-.04, .04), .012, rnd(-.03, .03)); }
  else if (name === 'táo đỏ') { const m = M(0x7a1410, { roughness: .3 }), st = M(0x5a3a1a); for (let k = 0; k < 4; k++) { const j = add(sph(.02, m, 1, 1.35, 1), rnd(-.04, .04), .022, rnd(-.03, .03)); j.rotation.z = rnd(-1, 1); const s = cyl(.002, .002, .012, st, 4); s.position.y = .03; j.add(s); } }
  else if (name === 'đường phèn') { const m = M(0xfdf8ea, { roughness: .05, transparent: true, opacity: .8, metalness: .1 }); for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(.018), m); c.scale.set(1, rnd(.8, 1.4), 1); c.rotation.set(rnd(0, 3), rnd(0, 3), 0); add(c, rnd(-.035, .035), .016, rnd(-.025, .025)); } }
  else if (name === 'gà') {
    const skin = M(0xf0c890, { roughness: .55 });
    if (cut) { for (let k = 0; k < 8; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.03, .022, .028), skin); b.rotation.set(rnd(0, .5), rnd(0, 3), 0); add(b, rnd(-.06, .06), .012, rnd(-.04, .04)); } }
    else { add(sph(.07, skin, 1.25, .8, 1), 0, .055, 0); add(sph(.035, skin, 1, .8, 1), .08, .065, 0); // thân, cổ
      for (const s of [-1, 1]) { const leg = cyl(.012, .02, .07, skin, 8); leg.rotation.z = Math.PI / 2.6 * -1; leg.position.set(-.07, .06, s * .045); g.add(leg); add(sph(.012, M(0xf6e6d0), 1, 1, 1), -.1, .085, s * .045); const w = sph(.035, skin, 1.3, .35, .8); w.position.set(0, .07, s * .07); w.rotation.x = s * .4; g.add(w); } }
  }
  else if (name === 'nhân sâm') { const m = M(0xe8d2a0, { roughness: .7 }), lf = M(0x3f8a3a, { side: THREE.DoubleSide });
    const root = cyl(.006, .02, .13, m, 10); root.rotation.z = Math.PI / 2.3; add(root, 0, .02, 0);
    for (let k = 0; k < 4; k++) { const r = cyl(.002, .006, .07, m, 6); r.rotation.set(rnd(-.6, .6), 0, Math.PI / 2 + rnd(-.6, .6)); add(r, -.08 + rnd(-.01, .01), .01, rnd(-.02, .02)); }
    for (let k = 0; k < 3; k++) { const l = new THREE.Mesh(new THREE.CircleGeometry(.02, 8), lf); l.scale.set(.5, 1, 1); l.rotation.set(-1, k * 2, 0); add(l, .07, .04, (k - 1) * .012); } }
  else if (name === 'tổ yến') { const m = M(0xf6f0e2, { roughness: .9, side: THREE.DoubleSide }); add(lathe([[0, 0], [.03, 0], [.05, .015], [.055, .03], [.05, .032], [.04, .015], [0, .01]], m, 20)).scale.set(1, 1, .7);
    for (let k = 0; k < 6; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.045 - k * .004, .002, 4, 18, Math.PI), m); t.rotation.set(Math.PI / 2 + rnd(-.2, .2), 0, rnd(0, 6)); add(t, 0, .02 + k * .002, 0).scale.z = .7; } }
  else if (name === 'long nhãn') { const m = M(0x7a4a22, { roughness: .8 }), inner = M(0xf3e8c8, { roughness: .3 }); for (let k = 0; k < 6; k++) add(sph(.016, k % 3 === 0 ? inner : m), rnd(-.04, .04), .016, rnd(-.03, .03)); }
  else if (name === 'cá chép') {
    const body = M(0xd9622a, { roughness: .35, metalness: .15 }), fin = M(0xc0401a, { side: THREE.DoubleSide, roughness: .5 }), eye = M(0x111111, { roughness: .2 });
    if (cut) { for (let k = 0; k < 5; k++) { const s = sph(.032, body, 1, .55, .5); s.rotation.y = rnd(0, 3); add(s, -.08 + k * .04, .016, rnd(-.01, .01)); } }
    else {
      add(sph(.06, body, 2.1, .85, .5, 18), 0, .05, 0);
      const tail = new THREE.Shape(); tail.moveTo(0, 0); tail.lineTo(.07, .045); tail.quadraticCurveTo(.05, 0, .07, -.045); tail.lineTo(0, 0);
      const tm = new THREE.Mesh(new THREE.ShapeGeometry(tail), fin); tm.position.set(.12, .05, 0); g.add(tm);
      const dor = new THREE.Shape(); dor.moveTo(-.05, 0); dor.quadraticCurveTo(0, .05, .06, 0); const dm = new THREE.Mesh(new THREE.ShapeGeometry(dor), fin); dm.position.set(0, .095, 0); g.add(dm);
      for (const s of [-1, 1]) { const e = sph(.007, eye); e.position.set(-.1, .06, s * .022); g.add(e); const pf = new THREE.Mesh(new THREE.CircleGeometry(.02, 6, 0, Math.PI), fin); pf.position.set(-.05, .035, s * .028); pf.rotation.set(0, s * .5, -.8); g.add(pf); }
    } }
  else if (name === 'gừng') { const m = M(0xcfa868, { roughness: .8 }); if (cut) { for (let k = 0; k < 10; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.04, .003, .004), M(0xf0d890)); s.rotation.y = rnd(0, 3); add(s, rnd(-.03, .03), .004, rnd(-.03, .03)); } } else for (const [x, z, r] of [[0, 0, .025], [.03, .01, .018], [-.025, .015, .016], [.01, -.025, .015]]) add(sph(r, m, 1.3, .8, 1), x, .02, z); }
  else if (name === 'hành') { const wh = M(0xf4f2e6, { roughness: .5 }), gr = M(0x4f9a3a, { roughness: .5 });
    if (cut) { for (let k = 0; k < 14; k++) { const s = cyl(.004, .004, .008, k % 3 ? gr : wh, 6); s.rotation.z = Math.PI / 2; add(s, rnd(-.035, .035), .004, rnd(-.03, .03)); } }
    else for (let k = 0; k < 3; k++) { const st = new THREE.Group(); st.position.set(0, .008, (k - 1) * .016); st.rotation.y = rnd(-.15, .15); g.add(st); const bl = sph(.008, wh, 1.6, 1, 1); bl.position.x = -.09; st.add(bl); const w = cyl(.005, .005, .06, wh, 6); w.rotation.z = Math.PI / 2; w.position.x = -.055; st.add(w); const gg = cyl(.004, .005, .12, gr, 6); gg.rotation.z = Math.PI / 2; gg.position.x = .035; st.add(gg); } }
  else if (name === 'bí đao') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#3d6a42'; x.fillRect(0, 0, 128, 64); for (let k = 0; k < 160; k++) { x.fillStyle = `rgba(220,235,215,${rnd(.15, .4)})`; x.fillRect(rnd(0, 128), rnd(0, 64), 2, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (cut) { const flesh = M(0xdcebc8, { roughness: .5 }); for (let k = 0; k < 9; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.025, .025, .025), flesh); b.rotation.y = rnd(0, 3); add(b, rnd(-.05, .05), .013, rnd(-.04, .04)); } }
    else { const b = sph(.07, new THREE.MeshStandardMaterial({ map: t, roughness: .5 }), 1.8, 1, 1, 20); b.rotation.y = Math.PI / 2; add(b, 0, .07, 0); }
  }
  else if (name === 'tôm khô') { const m = M(0xe8783a, { roughness: .5 }); for (let k = 0; k < 7; k++) { const s = new THREE.Mesh(new THREE.TorusGeometry(.014, .006, 6, 10, Math.PI * 1.3), m); s.rotation.set(Math.PI / 2, 0, rnd(0, 6)); add(s, rnd(-.04, .04), .006, rnd(-.03, .03)); } }
  else if (name === 'ớt khô') { const m = M(0xa8140c, { roughness: .45 }), st = M(0x4a6a2a); for (let k = 0; k < 6; k++) { const ch = new THREE.Group(); ch.position.set(rnd(-.04, .04), .008, rnd(-.03, .03)); ch.rotation.y = rnd(0, 6); g.add(ch); if (cut) { for (let j = 0; j < 2; j++) { const p = cyl(.006, .007, .015, m, 8); p.rotation.z = Math.PI / 2; p.position.x = j * .018; ch.add(p); } } else { const c = new THREE.Mesh(new THREE.ConeGeometry(.008, .06, 8), m); c.rotation.z = Math.PI / 2; ch.add(c); const s = cyl(.002, .002, .012, st, 4); s.rotation.z = Math.PI / 2; s.position.x = -.035; ch.add(s); } } }
  else if (name === 'đậu phộng') { const m = M(0xc89a5a, { roughness: .8 }); for (let k = 0; k < 7; k++) { const p = new THREE.Group(); p.position.set(rnd(-.04, .04), .008, rnd(-.03, .03)); p.rotation.y = rnd(0, 6); g.add(p); const a = sph(.009, m, 1, .85, 1); a.position.x = -.006; p.add(a); const b = sph(.009, m, 1, .85, 1); b.position.x = .007; p.add(b); } }
  return shade(g);
}

// ---------- món ăn hoàn chỉnh ----------
const LOOK = {
  'Canh sen hạt': { broth: 0xf0dca0, op: .75, bits: [['hạt sen', 6], ['táo đỏ', 2]] },
  'Canh gà hầm sâm': { broth: 0xd9a84a, op: .8, bits: [['gàcut', 5], ['táo đỏ', 2], ['sâm', 2]] },
  'Chè tổ yến': { broth: 0xfaf4e8, op: .55, bits: [['yến', 6], ['long nhãn', 2]] },
  'Canh cá chép': { broth: 0xf2ecdc, op: .9, bits: [['cácut', 4], ['hànhcut', 8], ['gừngcut', 4]] },
  'Canh bí đao': { broth: 0xd8e6c0, op: .7, bits: [['bícut', 6], ['tôm', 4], ['hànhcut', 5]] },
  'Chè long nhãn': { broth: 0xd99a4a, op: .7, bits: [['long nhãn', 6], ['hạt sen', 4]] },
  'Gà xào Cung Bảo': { plate: true, sauce: 0x8a2a14, bits: [['gàxào', 12], ['ớt', 7], ['đậu', 8], ['hànhcut', 6]] },
  'Cá chép hấp gừng': { plate: true, sauce: 0x6a4a1a, fish: true, bits: [['gừngcut', 10], ['hànhcut', 10]] },
};
function bit(kind) {
  if (kind === 'hạt sen') return sph(.009, M(0xf2e6c0, { roughness: .4 }));
  if (kind === 'táo đỏ') return sph(.011, M(0x7a1410, { roughness: .3 }), 1, 1.3, 1);
  if (kind === 'long nhãn') return sph(.01, M(0xf3e8c8, { roughness: .3 }));
  if (kind === 'gàcut') return new THREE.Mesh(new THREE.BoxGeometry(.022, .014, .02), M(0xe8c080, { roughness: .5 }));
  if (kind === 'gàxào') return new THREE.Mesh(new THREE.BoxGeometry(.018, .014, .016), M(0x9a4a1e, { roughness: .35 }));
  if (kind === 'sâm') return cyl(.006, .006, .004, M(0xf0dcae), 10);
  if (kind === 'yến') { const t = new THREE.Mesh(new THREE.TorusGeometry(.01, .002, 4, 10, Math.PI), M(0xffffff, { roughness: .6 })); t.rotation.x = Math.PI / 2; return t; }
  if (kind === 'cácut') return sph(.016, M(0xf4ece0, { roughness: .5 }), 1.4, .5, 1);
  if (kind === 'hànhcut') return cyl(.0035, .0035, .007, M(0x4f9a3a), 6);
  if (kind === 'gừngcut') return new THREE.Mesh(new THREE.BoxGeometry(.03, .002, .003), M(0xf0d890));
  if (kind === 'bícut') return new THREE.Mesh(new THREE.BoxGeometry(.016, .016, .016), M(0xcfe3b8, { roughness: .4, transparent: true, opacity: .9 }));
  if (kind === 'tôm') { const t = new THREE.Mesh(new THREE.TorusGeometry(.009, .004, 6, 10, Math.PI * 1.3), M(0xe8783a)); t.rotation.x = Math.PI / 2; return t; }
  if (kind === 'ớt') return cyl(.004, .005, .016, M(0xb01810, { roughness: .4 }), 6);
  if (kind === 'đậu') return sph(.0075, M(0xd8aa6a, { roughness: .6 }), 1.3, .9, 1);
  return sph(.01, M(0xffffff));
}
export function makeDish(name) {
  const L = LOOK[name] || LOOK['Canh sen hạt'];
  const g = makeDishware(L.plate ? 'dĩa' : 'chén'), u = g.userData;
  if (L.plate) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(u.fillR * .85, 28), M(L.sauce, { roughness: .15, transparent: true, opacity: .85 })); s.rotation.x = -Math.PI / 2; s.position.y = u.fillY + .001; s.scale.set(u.oval[0], u.oval[1], 1); g.add(s);
    if (L.fish) { const f = makeIngredient('cá chép'); f.scale.setScalar(.95); f.position.y = u.fillY - .02; f.traverse(o => { if (o.isMesh && o.material.color?.getHex() === 0xd9622a) { o.material = o.material.clone(); o.material.color.set(0xb8642a); } }); g.add(f); }
    else { const mound = sph(.07, M(0x7a3414, { roughness: .4 }), 1.2, .3, 1); mound.position.y = u.fillY; g.add(mound); }
    for (const [k, n] of L.bits) for (let i = 0; i < n; i++) { const b = bit(k); b.position.set(rnd(-.075, .075), u.fillY + .012 + rnd(0, .012), rnd(-.05, .05)); b.rotation.y = rnd(0, 6); g.add(b); }
  } else {
    const s = new THREE.Mesh(new THREE.CircleGeometry(u.fillR, 28), M(L.broth, { roughness: .08, metalness: .1, transparent: true, opacity: L.op })); s.rotation.x = -Math.PI / 2; s.position.y = u.fillY; g.add(s);
    for (const [k, n] of L.bits) for (let i = 0; i < n; i++) { const b = bit(k); const a = rnd(0, 6.28), r = rnd(0, u.fillR * .75); b.position.set(Math.cos(a) * r, u.fillY + .002, Math.sin(a) * r); b.rotation.y = rnd(0, 6); g.add(b); }
  }
  return shade(g);
}
