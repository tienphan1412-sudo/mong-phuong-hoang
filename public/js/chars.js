// Nhân vật: tải mô hình, nhân bản, động tác dùng chung
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = {};
let FEMALE = null, MALE = null;
export const MALE_MODELS = new Set(['hoangthuong', 'hoangthuong_dem', 'thaigiam', 'thive', 'thaiy', 'hoangtu1', 'hoangtu2', 'hoangtu3']);

function lock(clips) {
  const LOCK = ['di', 'chay', 'mua', 'dung_cho', 'vo_tay', 'khoc', 'gian', 'nga', 'cuoi', 'ngoi', 'khoanh_tay', 'gio_tay', 'nam_tay', 'dung_cho_nam'];
  for (const c of clips) if (LOCK.includes(c.name)) for (const t of c.tracks) if (/Hips\.position$/.test(t.name)) {
    const v = t.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clips;
}
export function loadModel(name) {
  if (!cache[name]) cache[name] = loader.loadAsync(`models/${name}.glb`).then(g => {
    if (name === 'hoangtu1' || name === 'congchua3' || name === 'phi_bau') { const REN = { 'walk.001': 'di', 'female walk.001': 'di', 'run.001': 'chay', 'sit.001': 'ngoi', 'cry.001': 'khoc', 'laugh_01.001': 'cuoi', 'dance_01.001': 'mua' }; g.animations = g.animations.filter(a => REN[a.name]); g.animations.forEach(a => a.name = REN[a.name]); }
    if (name === 'thuongtai') FEMALE = lock(g.animations);
    if (name === 'hoangthuong') MALE = lock(g.animations); else lock(g.animations);
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    return g;
  });
  return cache[name];
}
let GRACE = null; // dáng đi yểu điệu: phi tần (người chơi), công chúa, Thái hậu; cung nữ và ma ma giữ dáng đi cũ
const OLD_WALK = new Set(['cungnu', 'mama']);
export async function ready() {
  await Promise.all([loadModel('thuongtai'), loadModel('hoangthuong')]);
  // dáng đi yểu điệu (lấy từ model phi tần mang thai) dùng cho mọi nhân vật nữ
  try { GRACE = (await loadModel('phi_bau')).animations.find(a => a.name === 'di') || null; } catch {}
}

const MAPB = { Hips: 'hips', Spine: 'spine', Spine1: 'spine1', Spine2: 'spine2', Head: 'head', LeftArm: 'lArm', LeftForeArm: 'lFore', LeftHand: 'lHand', RightArm: 'rArm', RightForeArm: 'rFore', RightHand: 'rHand', LeftLeg: 'kneeL', RightLeg: 'kneeR', LeftShoulder: 'lSh', RightShoulder: 'rSh', Neck: 'neck', LeftUpLeg: 'hipL', RightUpLeg: 'hipR', LeftFoot: 'footL', RightFoot: 'footR' };
const v3 = a => new THREE.Vector3(...a).normalize();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
function aim(root, bone, child, dir) {
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, false); child.updateWorldMatrix(false, false);
  bone.getWorldPosition(_a); child.getWorldPosition(_b); _d.subVectors(_b, _a).normalize();
  const t = dir.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize();
  _q.setFromUnitVectors(_d, t); bone.getWorldQuaternion(_wq); _wq.premultiply(_q);
  bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(_wq)); bone.updateWorldMatrix(false, true);
}
const POSES = {
  // ngồi quỳ trên đệm (kiểu yến tiệc trong phim): đùi ngang về trước, cẳng chân gập dưới đùi, lưng thẳng, tay đặt lên đùi
  seiza: (c) => { const r = c.root, B = c.B;
    aim(r, B.spine, B.spine1, v3([0, 1, .02])); aim(r, B.spine2, B.neck, v3([0, 1, .05])); aim(r, B.neck, B.head, v3([0, 1, .08]));
    aim(r, B.hipL, B.kneeL, v3([.1, -.12, 1])); aim(r, B.hipR, B.kneeR, v3([-.1, -.12, 1]));
    aim(r, B.kneeL, B.footL, v3([.02, -.18, -1])); aim(r, B.kneeR, B.footR, v3([-.02, -.18, -1]));
    aim(r, B.lArm, B.lFore, v3([.2, -.85, .45])); aim(r, B.lFore, B.lHand, v3([-.3, -.3, .9]));
    aim(r, B.rArm, B.rFore, v3([-.2, -.85, .45])); aim(r, B.rFore, B.rHand, v3([.3, -.3, .9])); },
  chap_tay: (c) => { aim(c.root, c.B.lArm, c.B.lFore, v3([.12, -.92, .3])); aim(c.root, c.B.lFore, c.B.lHand, v3([-.62, -.15, .75])); aim(c.root, c.B.rArm, c.B.rFore, v3([-.12, -.92, .3])); aim(c.root, c.B.rFore, c.B.rHand, v3([.62, -.15, .75])); },
  che_mieng: (c, t) => { const sh = Math.sin(t * 14) * .04; aim(c.root, c.B.rArm, c.B.rFore, v3([-.25, -.55, .8])); aim(c.root, c.B.rFore, c.B.rHand, v3([.35, .88 + sh, .3])); aim(c.root, c.B.lArm, c.B.lFore, v3([.12, -.92, .3])); aim(c.root, c.B.lFore, c.B.lHand, v3([-.45, -.35, .8])); },
  doc_chi: (c) => { aim(c.root, c.B.lArm, c.B.lFore, v3([.35, -.45, .8])); aim(c.root, c.B.lFore, c.B.lHand, v3([-.2, .15, 1])); aim(c.root, c.B.rArm, c.B.rFore, v3([-.35, -.45, .8])); aim(c.root, c.B.rFore, c.B.rHand, v3([.2, .15, 1])); },
};

// dáng đứng nam: vai mở rộng, ngực thẳng, hai chân dang nhẹ
function maleStance(c) {
  const B = c.B, r = c.root;
  aim(r, B.spine, B.spine1, v3([0, 1, -.02])); aim(r, B.spine2, B.neck, v3([0, 1, .04])); aim(r, B.neck, B.head, v3([0, 1, .06]));
  aim(r, B.lSh, B.lArm, v3([1, -.06, -.04])); aim(r, B.rSh, B.rArm, v3([-1, -.06, -.04]));
  aim(r, B.lArm, B.lFore, v3([.2, -.97, -.02])); aim(r, B.rArm, B.rFore, v3([-.2, -.97, -.02]));
  aim(r, B.lFore, B.lHand, v3([.06, -.97, .2])); aim(r, B.rFore, B.rHand, v3([-.06, -.97, .2]));
  aim(r, B.hipL, B.kneeL, v3([.09, -1, 0])); aim(r, B.hipR, B.kneeR, v3([-.09, -1, 0]));
  aim(r, B.kneeL, B.footL, v3([.06, -1, -.02])); aim(r, B.kneeR, B.footR, v3([-.06, -1, -.02]));
}
export { aim, v3 };

let HT_IDLE = null, HT_G = []; // Hoàng thượng đứng khoanh tay (cắt đoạn giữa của động tác, lặp mượt)
export async function spawn(modelName) {
  const g = await loadModel(modelName);
  await ready();
  const isHT = modelName.startsWith('hoangthuong');
  if (isHT && !HT_IDLE) {
    const d = await loadModel('hoangthuong_dem'); const k = d.animations.find(a => a.name === 'khoanh_tay');
    if (k) HT_IDLE = THREE.AnimationUtils.subclip(k, 'khoanh_tay', 78, 432, 30);
    HT_G = d.animations.filter(a => ['gio_tay', 'nam_tay', 'dung_cho_nam'].includes(a.name));
  }
  const male = MALE_MODELS.has(modelName);
  const root = SkeletonUtils.clone(g.scene);
  if (modelName.startsWith('hoangthuong')) root.scale.setScalar(1.08); // Hoàng thượng cao hơn phi tần
  const KIDC = modelName.startsWith('hoangtu') ? (await loadModel('hoangtu1')).animations : modelName.startsWith('congchua') ? (await loadModel('congchua3')).animations : null; // trẻ con dùng chung động tác
  const B = {};
  root.traverse(o => { if (o.isBone) { const n = o.name.replace(/^mixamorig:?/, ''); if (MAPB[n]) B[MAPB[n]] = o; } if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of FEMALE) actions[clip.name] = mixer.clipAction(clip);
  if (male) for (const clip of MALE) actions[clip.name] = mixer.clipAction(clip);
  for (const clip of g.animations || []) if (!actions[clip.name] || male) actions[clip.name] = mixer.clipAction(clip);
  if (isHT) for (const g2 of HT_G) if (!actions[g2.name]) actions[g2.name] = mixer.clipAction(g2);
  const oldWalk = OLD_WALK.has(modelName); if (!male && !oldWalk && GRACE) actions.di = mixer.clipAction(GRACE);
  if (KIDC) for (const k of KIDC) actions[k.name] = mixer.clipAction(k);
  if (isHT && HT_IDLE) { actions.khoanh_tay = mixer.clipAction(HT_IDLE); actions.dung_cho = actions.khoanh_tay; }
  const idle = actions.dung_cho; idle.play(); mixer.update(0); root.updateMatrixWorld(true);
  const idlePose = new Map(); root.traverse(o => { if (o.isBone) idlePose.set(o, o.quaternion.clone()); });
  idle.stop();
  const c = { root, B, mixer, actions, idlePose, male, model: modelName, cur: null, curName: '', pose: null, t: 0, sitFix: false };
  c.play = (name, opts = {}) => {
    let pose = null;
    if (POSES[name]) { pose = name; name = 'dung_cho'; }
    c.pose = pose;
    const a = actions[name] || actions.dung_cho;
    if (c.cur === a && !opts.restart) return;
    const once = ['nga', 'quy', 'hanh_le', 'cui_chao'].includes(name);
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once;
    a.timeScale = name === 'di' ? (male ? 1.4 : oldWalk ? 1.25 : 1.15) : 1;
    if (c.cur && c.cur !== a) a.crossFadeFrom(c.cur, 0.3, false);
    a.play(); c.cur = a; c.curName = name; c.sitFix = name === 'ngoi';
  };
  c.update = (dt) => {
    c.t += dt; mixer.update(dt);
    if (c.curName === 'di' && oldWalk) for (const [bone, q] of idlePose) { // dáng đi cũ của cung nữ, ma ma
      const n = bone.name;
      if (/(Shoulder|Arm|ForeArm|Hand)$/.test(n)) bone.quaternion.slerp(q, .85);
      else if (/UpLeg$/.test(n)) bone.quaternion.slerp(q, .45);
      else if (/Leg$/.test(n)) bone.quaternion.slerp(q, .35);
      else if (/Spine|Neck|Head$/.test(n)) bone.quaternion.slerp(q, .6);
    }
    if (c.sitFix) {
      for (const [bone, q] of idlePose) if (/(Spine|Spine1|Spine2|Neck|Head)$/.test(bone.name)) bone.quaternion.slerp(q, .85);
      root.updateMatrixWorld(true);
      aim(root, B.spine, B.spine1, v3([0, 1, .06]));
      aim(root, B.lArm, B.lFore, v3([.18, -.9, .38])); aim(root, B.lFore, B.lHand, v3([-.35, -.25, .9]));
      aim(root, B.rArm, B.rFore, v3([-.18, -.9, .38])); aim(root, B.rFore, B.rHand, v3([.35, -.25, .9]));
    }
    if (male && !isHT && c.curName === 'dung_cho' && !c.pose) { root.updateMatrixWorld(true); maleStance(c); }
    if (c.pose) { root.updateMatrixWorld(true); POSES[c.pose](c, c.t); }
    if (c.post) { root.updateMatrixWorld(true); c.post(c, c.t); }
    if (c.post2) { root.updateMatrixWorld(true); c.post2(c, c.t); }
    if (c.braid) c.braid(dt);
  };
  if (isHT) c.braid = makeBraid(c);
  c.dispose = () => { mixer.stopAllAction(); root.parent && root.parent.remove(root); };
  c.play('dung_cho');
  return c;
}
// chiều cao ghế: đo hông khi ngồi
export function seatPlacement(c) {
  c.play('ngoi'); c.update(.6); c.root.updateMatrixWorld(true);
  const hp = new THREE.Vector3(), kl = new THREE.Vector3(), kr = new THREE.Vector3();
  c.B.hips.getWorldPosition(hp); c.B.kneeL.getWorldPosition(kl); c.B.kneeR.getWorldPosition(kr);
  const fwd = kl.add(kr).multiplyScalar(.5).sub(hp); fwd.y = 0; fwd.normalize();
  return { x: hp.x + fwd.x * .05, z: hp.z + fwd.z * .05, y: hp.y - .07, ry: Math.atan2(fwd.x, fwd.z) };
}

// ---------------- bím tóc dài sau lưng (Hoàng thượng) ----------------
// chuỗi điểm có trọng lực, tính trong hệ toạ độ của nhân vật, không xuyên qua lưng
const BRAID_MAT = new THREE.MeshStandardMaterial({ color: 0x17100c, roughness: .42, metalness: .05 });
function makeBraid(c) {
  const root = c.root, B = c.B, N = 14;
  const lobe = new THREE.SphereGeometry(1, 10, 8);
  const inst = new THREE.InstancedMesh(lobe, BRAID_MAT, N * 2); inst.frustumCulled = false; inst.castShadow = true;
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 10), BRAID_MAT);
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: .6 }));
  root.add(inst, tassel, tie);
  const inv = new THREE.Matrix4(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const loc = (bone, out) => { bone.getWorldPosition(out); return out.applyMatrix4(inv); };
  let P = null, O = null, L = 1, seg = 0;
  const head = new THREE.Vector3(), neck = new THREE.Vector3(), hips = new THREE.Vector3(), sp = new THREE.Vector3();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), sc = new THREE.Vector3();
  return (dt) => {
    root.updateMatrixWorld(true); inv.copy(root.matrixWorld).invert();
    loc(B.head, head); loc(B.neck, neck); loc(B.hips, hips); loc(B.spine2, sp);
    if (!P) { L = Math.max(.2, head.y - hips.y); seg = L * 1.45 / N; P = []; O = [];
      for (let i = 0; i <= N; i++) { const p = new THREE.Vector3(head.x, head.y - L * .06 - i * seg, head.z - L * .2); P.push(p); O.push(p.clone()); } }
    const anchor = new THREE.Vector3(head.x, head.y + L * .02, head.z - L * .15);
    const back = L * .2; // độ dày lưng
    P[0].copy(anchor); c._bt = (c._bt || 0) + dt;
    const sway = Math.sin(c._bt * 1.3) * .06;
    for (let i = 1; i <= N; i++) {
      const p = P[i], a = P[i - 1];
      // hướng rủ xuống, hơi đung đưa; mượt theo khung trước để có quán tính nhẹ
      dir.set(sway * i / N, -1, -.05).normalize();
      w.copy(a).addScaledVector(dir, seg);
      const t = THREE.MathUtils.clamp((sp.y - w.y) / Math.max(.01, sp.y - hips.y), 0, 1);
      const bz = THREE.MathUtils.lerp(sp.z, hips.z, t) - back;
      if (w.z > bz) w.z = bz;
      v.copy(w).sub(a).setLength(seg); w.copy(a).add(v);
      p.lerp(w, Math.min(1, dt * 12)); v.copy(p).sub(a).setLength(seg); p.copy(a).add(v);
    }
    // vẽ: mỗi đoạn hai múi lệch trái phải như bím tết
    const r = L * .05;
    for (let i = 0; i < N; i++) {
      const a = P[i], b = P[i + 1]; dir.copy(b).sub(a).normalize(); q.setFromUnitVectors(up, dir);
      const taper = 1 - i / N * .35;
      for (let k = 0; k < 2; k++) {
        const side = (k === 0 ? 1 : -1) * (i % 2 ? 1 : -1);
        v.copy(a).lerp(b, k ? .75 : .25); v.x += side * r * .18;
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * .25);
        sc.set(r * .68 * taper, seg * .62, r * .6 * taper);
        m.compose(v, q.clone().multiply(tilt), sc); inst.setMatrixAt(i * 2 + k, m);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    const e = P[N], e1 = P[N - 1]; dir.copy(e).sub(e1).normalize(); q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    tassel.position.copy(e).addScaledVector(dir, L * .035); tassel.quaternion.copy(q); tassel.scale.set(r * .8, L * .08, r * .8);
    tie.position.copy(e).addScaledVector(dir, -L * .005); tie.quaternion.copy(q); tie.scale.set(r * .55, L * .02, r * .55);
  };
}

// đặt nhân vật ngồi quỳ trên đệm: hạ người cho đầu gối chạm mặt đệm
export function kneelOn(c, x, top, z, ry) {
  c.play('dung_cho'); c.pose = 'seiza'; c.root.position.set(x, 0, z); c.root.rotation.y = ry; c.update(.02); c.root.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), h = new THREE.Vector3(); c.B.kneeL.getWorldPosition(a); c.B.footL.getWorldPosition(b); c.B.hips.getWorldPosition(h);
  const low = Math.min(a.y, b.y);
  // kéo hông về đúng tâm đệm
  c.root.position.set(x - (h.x - x) * 0 , top - low + .03, z);
}
