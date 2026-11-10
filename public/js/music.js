// Nhạc nền: phát file mp3 theo từng nơi, chuyển cảnh thì nhạc mờ dần sang bài mới.
// Tiếng cồng lúc tuyên thánh chỉ vẫn tự tạo bằng Web Audio.
const LISTS = {
  day: ['ngay1', 'ngay2', 'ngay3'],   // Ngự hoa viên, phòng riêng
  hall: ['dien1'],                    // Từ Ninh cung, Dưỡng Tâm điện
  night: ['dem1', 'dem2'],            // Tẩm cung
  cold: ['lanh1'],                    // Lãnh cung
};
const LOC_MODE = { hoavien: 'day', phong: 'day', tuninh: 'hall', duongtam: 'hall', tamcung: 'night', lanhcung: 'cold' };
const VOL = { day: .55, hall: .55, night: .5, cold: .5 };
const FADE = 1600;

let on = (() => { try { return localStorage.getItem('mph_music') !== 'off'; } catch { return true; } })();
let started = false, mode = 'hall', cur = null, ctx = null;
const lastIdx = {};

function pick(m) {
  const L = LISTS[m]; if (L.length === 1) return L[0];
  let i; do { i = Math.floor(Math.random() * L.length); } while (i === lastIdx[m]);
  lastIdx[m] = i; return L[i];
}
function fadeTo(a, target, ms, done) {
  clearInterval(a._f); const from = a.volume, t0 = performance.now();
  a._f = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms); a.volume = Math.max(0, Math.min(1, from + (target - from) * k));
    if (k >= 1) { clearInterval(a._f); done && done(); }
  }, 50);
}
function play(m) {
  if (!started || !on) return;
  const old = cur;
  const a = new Audio(`music/${pick(m)}.mp3`); a.preload = 'auto'; a.volume = 0; a.dataset.mode = m;
  a.onended = () => { if (cur === a) play(mode); }; // hết bài thì sang bài khác cùng nơi
  cur = a;
  a.play().then(() => fadeTo(a, VOL[m], FADE)).catch(() => {});
  if (old) fadeTo(old, 0, FADE, () => { old.pause(); old.src = ''; });
}
export function start() {
  if (started) { if (cur && cur.paused && on) cur.play().catch(() => {}); return; }
  started = true; play(mode);
}
export function setMode(loc) {
  const m = LOC_MODE[loc] || 'day'; if (m === mode && cur) return;
  mode = m; play(m);
}
export function isOn() { return on; }
export function toggle() {
  on = !on; try { localStorage.setItem('mph_music', on ? 'on' : 'off'); } catch {}
  if (!on) { if (cur) { const a = cur; cur = null; fadeTo(a, 0, 400, () => { a.pause(); a.src = ''; }); } }
  else { started = true; play(mode); }
}
export function gong() {
  if (!on) return;
  try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  const t = ctx.currentTime + .05, out = ctx.createGain(); out.gain.value = .7; out.connect(ctx.destination);
  if (cur) { const a = cur; fadeTo(a, VOL[mode] * .35, 300); setTimeout(() => cur === a && fadeTo(a, VOL[mode], 2500), 2500); } // hạ nhạc nền cho tiếng cồng
  for (const [f, amp] of [[82, .45], [164.5, .2], [231, .12], [347, .07]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.02, t); o.frequency.exponentialRampToValueAtTime(f, t + .4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + 5);
    o.connect(g).connect(out); o.start(t); o.stop(t + 5.2);
  }
}
