// Nhân vật: tải mô hình, nhân bản, động tác dùng chung
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = {};
let FEMALE = null, MALE = null;
export const MALE_MODELS = new Set(['hoangthuong', 'hoangthuong_dem', 'thaigiam', 'thive', 'thaiy']);

function lock(clips) {
  const LOCK = ['di', 'mua', 'dung_cho', 'vo_tay', 'khoc', 'gian', 'nga', 'cuoi', 'ngoi'];
  for (const c of clips) if (LOCK.includes(c.name)) for (const t of c.tracks) if (/Hips\.position$/.test(t.name)) {
    const v = t.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clips;
}
export function loadModel(name) {
  if (!cache[name]) cache[name] = loader.loadAsync(`models/${name}.glb`).then(g => {
    if (name === 'thuongtai') FEMALE = lock(g.animations);
    if (name === 'hoangthuong') MALE = lock(g.animations);
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    return g;
  });
  return cache[name];
}
export async function ready() { await Promise.all([loadModel('thuongtai'), loadModel('hoangthuong')]); }

const MAPB = { Hips: 'hips', Spine: 'spine', Spine1: 'spine1', Spine2: 'spine2', Head: 'head', LeftArm: 'lArm', LeftForeArm: 'lFore', LeftHand: 'lHand', RightArm: 'rArm', RightForeArm: 'rFore', RightHand: 'rHand', LeftLeg: 'kneeL', RightLeg: 'kneeR' };
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
  chap_tay: (c) => { aim(c.root, c.B.lArm, c.B.lFore, v3([.12, -.92, .3])); aim(c.root, c.B.lFore, c.B.lHand, v3([-.62, -.15, .75])); aim(c.root, c.B.rArm, c.B.rFore, v3([-.12, -.92, .3])); aim(c.root, c.B.rFore, c.B.rHand, v3([.62, -.15, .75])); },
  che_mieng: (c, t) => { const sh = Math.sin(t * 14) * .04; aim(c.root, c.B.rArm, c.B.rFore, v3([-.25, -.55, .8])); aim(c.root, c.B.rFore, c.B.rHand, v3([.35, .88 + sh, .3])); aim(c.root, c.B.lArm, c.B.lFore, v3([.12, -.92, .3])); aim(c.root, c.B.lFore, c.B.lHand, v3([-.45, -.35, .8])); },
  doc_chi: (c) => { aim(c.root, c.B.lArm, c.B.lFore, v3([.35, -.45, .8])); aim(c.root, c.B.lFore, c.B.lHand, v3([-.2, .15, 1])); aim(c.root, c.B.rArm, c.B.rFore, v3([-.35, -.45, .8])); aim(c.root, c.B.rFore, c.B.rHand, v3([.2, .15, 1])); },
};

export async function spawn(modelName) {
  const g = await loadModel(modelName);
  await ready();
  const male = MALE_MODELS.has(modelName);
  const root = SkeletonUtils.clone(g.scene);
  const B = {};
  root.traverse(o => { if (o.isBone) { const n = o.name.replace(/^mixamorig:?/, ''); if (MAPB[n]) B[MAPB[n]] = o; } if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of FEMALE) actions[clip.name] = mixer.clipAction(clip);
  if (male) for (const clip of MALE) actions[clip.name] = mixer.clipAction(clip);
  for (const clip of g.animations || []) if (!actions[clip.name] || male) actions[clip.name] = mixer.clipAction(clip);
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
    a.timeScale = name === 'di' ? (male ? 1.4 : 1.25) : 1;
    if (c.cur && c.cur !== a) a.crossFadeFrom(c.cur, 0.3, false);
    a.play(); c.cur = a; c.curName = name; c.sitFix = name === 'ngoi';
  };
  c.update = (dt) => {
    c.t += dt; mixer.update(dt);
    if (c.curName === 'di' && !male) for (const [bone, q] of idlePose) {
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
    if (c.pose) { root.updateMatrixWorld(true); POSES[c.pose](c, c.t); }
  };
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
