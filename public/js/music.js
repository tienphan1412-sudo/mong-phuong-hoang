// Nhạc nền cổ trang tự sinh, có hòa âm:
// đệm dây (pad) theo vòng hợp âm + đàn tranh rải hợp âm + sáo trúc hát giai điệu có motif lặp lại + bass + trống nhẹ
let ctx = null, master = null, wet = null, timer = null, noiseBuf = null;
let on = (() => { try { return localStorage.getItem('mph_music') !== 'off'; } catch { return true; } })();
let mode = 'day', barT = 0, bar = 0, song = null, songMode = '';
const D4 = 293.66;
const hz = (semi) => D4 * Math.pow(2, semi / 12); // semi tính từ Rê 4

// hợp âm: [nốt gốc (tính từ Rê), 'M' trưởng | 'm' thứ]
const C = { D: [0, 'M'], Em: [2, 'm'], 'F#m': [4, 'm'], G: [5, 'M'], A: [7, 'M'], Bm: [-3, 'm'], Dm: [0, 'm'], Gm: [5, 'm'], Bb: [-4, 'M'], F: [3, 'M'], C: [-2, 'M'], Am: [7, 'm'] };
const MODES = {
  day:   { bpm: 84, vol: .36, prog: ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'Em', 'A', 'G', 'A', 'F#m', 'Bm', 'G', 'A', 'D', 'D'], scale: [0, 2, 4, 7, 9], arp: 'run', drum: .16, flute: 1 },
  hall:  { bpm: 66, vol: .32, prog: ['D', 'G', 'D', 'A', 'Bm', 'G', 'A', 'D'], scale: [0, 2, 4, 7, 9], arp: 'strum', drum: .26, flute: 1 },
  night: { bpm: 54, vol: .24, prog: ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em', 'F#m'], scale: [0, 2, 4, 7, 9], arp: 'slow', drum: 0, flute: .7 },
  cold:  { bpm: 50, vol: .24, prog: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Gm', 'Bb', 'A'], scale: [0, 3, 5, 7, 10], arp: 'slow', drum: 0, flute: .8 },
};
const LOC_MODE = { hoavien: 'day', phong: 'day', tuninh: 'hall', duongtam: 'hall', tamcung: 'night', lanhcung: 'cold' };

function chordNotes(name) { const [r, q] = C[name]; return [r, r + (q === 'M' ? 4 : 3), r + 7]; }
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

function impulse(sec) {
  const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.4); }
  return b;
}
export function start() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = .003; const lim = ctx.createGain(); lim.gain.value = .8; comp.connect(lim).connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = on ? MODES[mode].vol : 0; master.connect(comp);
  const rev = ctx.createConvolver(); rev.buffer = impulse(3.6);
  wet = ctx.createGain(); wet.gain.value = .5; wet.connect(rev); rev.connect(master);
  barT = ctx.currentTime + .3;
  timer = setInterval(tick, 150);
}

// ---------- nhạc cụ ----------
function out(node, dry = 1, rv = 1) { const d = ctx.createGain(); d.gain.value = dry; node.connect(d).connect(master); const w = ctx.createGain(); w.gain.value = rv; node.connect(w).connect(wet); }
function zheng(t, f, vel = .3, len = 2.4) { // đàn tranh
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .005); g.gain.exponentialRampToValueAtTime(.0006, t + len);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 8), t); lp.frequency.exponentialRampToValueAtTime(f * 1.8, t + len * .5);
  for (const [type, mul, amp] of [['triangle', 1, 1], ['sawtooth', 1, .18], ['sine', 2, .15]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f * mul * .99, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + .05);
    const a = ctx.createGain(); a.gain.value = amp; o.connect(a).connect(lp); o.start(t); o.stop(t + len + .05);
  }
  lp.connect(g); out(g, .8, .7);
}
function flute(t, f, dur, vel = .14) { // sáo trúc: thổi mềm, rung về cuối nốt
  const g = ctx.createGain(); const end = t + dur;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .07); g.gain.setValueAtTime(vel * .85, Math.max(t + .08, end - .12)); g.gain.linearRampToValueAtTime(0, end + .08);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * .985, t); o.frequency.linearRampToValueAtTime(f, t + .06);
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f; const g2 = ctx.createGain(); g2.gain.value = .25;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; const ld = ctx.createGain(); ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(f * .006, t + Math.min(.4, dur));
  lfo.connect(ld); ld.connect(o.frequency); ld.connect(o2.frequency);
  // hơi thở
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .3, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; }
  const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(vel * .35, t); ng.gain.exponentialRampToValueAtTime(.001, t + .25);
  ns.connect(bp).connect(ng).connect(g);
  o.connect(g); o2.connect(g2).connect(g);
  for (const x of [o, o2, lfo]) { x.start(t); x.stop(end + .15); } ns.start(t);
  out(g, .9, .9);
}
function pad(t, notes, dur, vel = .045) { // dàn dây nền
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + Math.min(1.2, dur * .4)); g.gain.setValueAtTime(vel, t + dur - .3); g.gain.linearRampToValueAtTime(0, t + dur + .6);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = .5;
  for (const n of notes) for (const det of [-7, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + .7); }
  lp.connect(g); out(g, .7, 1);
}
function bass(t, f, len, vel = .2) {
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .03); g.gain.exponentialRampToValueAtTime(.001, t + len);
  o.connect(lp).connect(g); out(g, 1, .3); o.start(t); o.stop(t + len + .05);
}
function drum(t, vel) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(50, t + .2);
  const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .5);
  o.connect(g); out(g, 1, .2); o.start(t); o.stop(t + .55);
}
function woodblock(t, vel) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
  const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .08);
  o.connect(g); out(g, .8, .4); o.start(t); o.stop(t + .1);
}

// ---------- sáng tác giai điệu: motif lặp lại theo hợp âm ----------
const RHY = [[2, 1, 1, 2, 2], [3, 1, 2, 2], [1, 1, 2, 4], [2, 2, 1, 1, 2], [4, 2, 2], [2, 1, 1, 4], [1, 1, 1, 1, 2, 2]]; // đơn vị móc đơn, 8 = 1 ô nhịp
function scaleNotes(M) { const out = []; for (let o = 0; o <= 1; o++) for (const s of M.scale) out.push(s + 12 * o); out.push(24); return out; } // Rê4..Rê6
function nearest(list, target) { let b = list[0]; for (const x of list) if (Math.abs(x - target) < Math.abs(b - target)) b = x; return b; }
function compose(M) {
  const S = scaleNotes(M);
  const motifR = rnd(RHY.slice(0, 4)), motifShape = motifR.map(() => rnd([-2, -1, 1, 1, 2, 0]));
  const answerR = rnd(RHY), endR = rnd([[4, 4], [2, 6], [8]]);
  const bars = [];
  let last = 9; // La 4
  M.prog.forEach((ch, i) => {
    const pos = i % 4;
    const r = pos === 3 ? endR : (pos === 2 ? answerR : motifR);
    const tones = chordNotes(ch).flatMap(n => [n, n + 12, n + 24]).filter(n => n >= 0 && n <= 24);
    const notes = []; let cur = nearest(tones, last + (pos === 1 ? 2 : 0));
    r.forEach((len, k) => {
      if (k === 0 || len >= 4) cur = nearest(tones, cur + (k === 0 ? 0 : motifShape[k % motifShape.length] * 2)); // phách mạnh/nốt dài: nốt trong hợp âm
      else { const si = S.indexOf(nearest(S, cur)); cur = S[Math.max(0, Math.min(S.length - 1, si + (pos === 2 ? -motifShape[k] : motifShape[k])))]; }
      notes.push([len, cur]);
    });
    if (pos === 3 && i === M.prog.length - 1) notes[notes.length - 1][1] = nearest([0, 12, 7, 19], cur); // kết về chủ âm
    last = cur; bars.push(notes);
  });
  return bars;
}

function playBar(t, M, i) {
  const beat = 60 / M.bpm, barLen = beat * 4, eighth = beat / 2;
  const chName = M.prog[i % M.prog.length], ch = chordNotes(chName);
  pad(t, ch.map(n => n - 12 + (n < 0 ? 12 : 0)), barLen, mode === 'night' || mode === 'cold' ? .035 : .04);
  bass(t, hz(ch[0] - 24), beat * 2); bass(t + beat * 2, hz(ch[2] - 24 - (ch[2] > 9 ? 12 : 0)), beat * 2, .14);
  // đàn tranh
  const up = ch.flatMap(n => [n - 12, n]).sort((a, b) => a - b).concat([ch[0] + 12]);
  if (M.arp === 'run') { up.concat([ch[1] + 12, ch[2]]).forEach((n, k) => zheng(t + k * eighth, hz(n), k === 0 ? .24 : .14, 1.8)); }
  else if (M.arp === 'strum') { for (const b of [0, 2]) up.forEach((n, k) => zheng(t + b * beat + k * .035, hz(n), .16, 2.6)); }
  else { [0, 1, 2].forEach(k => zheng(t + k * beat * 1.3, hz(up[k * 2]), .14, 3.2)); }
  // trống
  if (M.drum) { drum(t, M.drum); drum(t + beat * 2, M.drum * .6); if (mode === 'day') { woodblock(t + beat * 1.5, .05); woodblock(t + beat * 3.5, .05); } }
  // sáo: nghỉ ở vòng đầu mỗi bài cho đàn dạo trước
  if (song && Math.floor(i / M.prog.length) % 3 !== 0) {
    let k = t; for (const [len, n] of song[i % M.prog.length]) { if (Math.random() < .93) flute(k, hz(n + 12 * (mode === 'night' ? 0 : 0)), len * eighth * .95, .12 * M.flute); k += len * eighth; }
  } else if (song) { // vòng dạo: đàn tranh gảy giai điệu nhẹ
    let k = t; for (const [len, n] of song[i % M.prog.length]) { zheng(k, hz(n), .1, 1.6); k += len * eighth; }
  }
}
function tick() {
  if (!ctx || !on) return;
  const M = MODES[mode];
  if (!song || songMode !== mode || (bar % (M.prog.length * 3) === 0 && bar > 0 && Math.random() < .5 && !song.fresh)) { song = compose(M); songMode = mode; }
  if (song) song.fresh = bar % (M.prog.length * 3) === 0;
  while (barT < ctx.currentTime + 1.2) { playBar(barT, M, bar); barT += 60 / M.bpm * 4; bar++; }
}
export function setMode(loc) {
  const m = LOC_MODE[loc] || 'day'; if (m === mode) return;
  mode = m; bar = 0; song = null;
  if (master && on) master.gain.setTargetAtTime(MODES[mode].vol, ctx.currentTime, .8);
}
export function gong() {
  if (!ctx || !on) return; const t = ctx.currentTime + .05;
  for (const [f, a] of [[82, .45], [164.5, .2], [231, .12], [347, .07]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.02, t); o.frequency.exponentialRampToValueAtTime(f, t + .4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + 5);
    o.connect(g); out(g, 1, 1); o.start(t); o.stop(t + 5.2);
  }
}
export function isOn() { return on; }
export function toggle() {
  on = !on; try { localStorage.setItem('mph_music', on ? 'on' : 'off'); } catch {}
  start();
  if (master) master.gain.setTargetAtTime(on ? MODES[mode].vol : 0, ctx.currentTime, .3);
  if (on && ctx) barT = Math.max(barT, ctx.currentTime + .2);
}
