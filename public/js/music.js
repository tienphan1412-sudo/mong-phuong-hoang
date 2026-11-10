// Nhạc nền cổ trang tự sinh (đàn tranh ngũ cung + trống trầm), không cần file nhạc
let ctx = null, master = null, wet = null, timer = null;
let on = (() => { try { return localStorage.getItem('mph_music') !== 'off'; } catch { return true; } })();
let mode = 'day', nextT = 0, idx = 4, phraseLeft = 0, barT = 0;
const ROOT = 293.66; // Rê
const MODES = {
  day:   { scale: [0, 2, 4, 7, 9], bpm: 76, vol: .5, low: 0, rest: .25 },
  hall:  { scale: [0, 2, 4, 7, 9], bpm: 64, vol: .42, low: -12, rest: .3 },
  night: { scale: [0, 3, 5, 7, 10], bpm: 50, vol: .3, low: -12, rest: .45 },
  cold:  { scale: [0, 1, 5, 7, 8], bpm: 44, vol: .3, low: -12, rest: .5 },
};
const LOC_MODE = { hoavien: 'day', phong: 'day', tuninh: 'hall', duongtam: 'hall', tamcung: 'night', lanhcung: 'cold' };

function impulse(sec) {
  const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
  return b;
}
export function start() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = on ? MODES[mode].vol : 0; master.connect(ctx.destination);
  const rev = ctx.createConvolver(); rev.buffer = impulse(3.4);
  wet = ctx.createGain(); wet.gain.value = .55; wet.connect(rev); rev.connect(master);
  nextT = ctx.currentTime + .3; barT = nextT;
  timer = setInterval(tick, 120);
}
function freq(step, oct) { const M = MODES[mode], n = M.scale.length; const o = Math.floor(step / n), s = ((step % n) + n) % n; return ROOT * Math.pow(2, (M.scale[s] + 12 * (o + oct)) / 12); }
function pluck(t, f, vel = .5, len = 2.2) {
  // đàn tranh: hai dao động, gảy nhanh, tắt dần, hơi luyến lên ở đầu nốt
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .006); g.gain.exponentialRampToValueAtTime(.0008, t + len);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 7, t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + len * .6);
  for (const [type, mul, amp] of [['triangle', 1, 1], ['sawtooth', 1, .25], ['sine', 2, .2]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f * mul * .985, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + .06);
    const a = ctx.createGain(); a.gain.value = amp; o.connect(a).connect(lp); o.start(t); o.stop(t + len + .1);
  }
  lp.connect(g); g.connect(master); g.connect(wet);
}
function bass(t, f, len) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + len);
  o.connect(g); g.connect(master); g.connect(wet); o.start(t); o.stop(t + len + .1);
}
function drum(t, vel = .35) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + .25);
  const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .6);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + .7);
}
function tick() {
  if (!ctx || !on) return;
  const M = MODES[mode], beat = 60 / M.bpm;
  while (barT < ctx.currentTime + 1) { // nhịp nền: trầm + trống mỗi ô nhịp
    bass(barT, freq(Math.random() < .7 ? 0 : 3, -1 + M.low / 12), beat * 4);
    if (mode === 'day' || mode === 'hall') drum(barT, mode === 'hall' ? .3 : .2);
    barT += beat * 4;
  }
  while (nextT < ctx.currentTime + 1) {
    if (phraseLeft <= 0) { phraseLeft = 5 + Math.floor(Math.random() * 5); nextT += beat * (1 + Math.random() * 2) * (1 + M.rest); continue; }
    idx += [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]; idx = Math.max(0, Math.min(10, idx));
    const f = freq(idx, M.low / 12);
    const dur = [.5, .5, 1, 1, 1, 1.5, 2][Math.floor(Math.random() * 7)] * beat;
    pluck(nextT, f, .32 + Math.random() * .15, mode === 'night' || mode === 'cold' ? 3 : 2.2);
    if (Math.random() < .12 && dur >= beat) { pluck(nextT + beat * .25, f, .16); pluck(nextT + beat * .5, f, .1); } // vê dây
    phraseLeft--; nextT += dur;
  }
}
export function setMode(loc) {
  mode = LOC_MODE[loc] || 'day';
  if (master && on) master.gain.setTargetAtTime(MODES[mode].vol, ctx.currentTime, .8);
}
export function gong() {
  if (!ctx || !on) return; const t = ctx.currentTime + .05;
  for (const [f, a] of [[82, .5], [164.5, .22], [231, .14], [347, .08]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.02, t); o.frequency.exponentialRampToValueAtTime(f, t + .4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + 5);
    o.connect(g); g.connect(master); g.connect(wet); o.start(t); o.stop(t + 5.2);
  }
}
export function isOn() { return on; }
export function toggle() {
  on = !on; try { localStorage.setItem('mph_music', on ? 'on' : 'off'); } catch {}
  start();
  if (master) master.gain.setTargetAtTime(on ? MODES[mode].vol : 0, ctx.currentTime, .3);
  if (on && ctx) { nextT = Math.max(nextT, ctx.currentTime + .2); barT = Math.max(barT, ctx.currentTime + .2); }
}
