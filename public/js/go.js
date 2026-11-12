// Cờ vây 9x9: luật bắt quân, cấm tự sát, cấm cướp ko, tính điểm theo vùng (Trung Quốc), komi 5.5
export const N = 9, KOMI = 5.5;
const nb = i => { const x = i % N, y = (i / N) | 0, r = []; if (x > 0) r.push(i - 1); if (x < N - 1) r.push(i + 1); if (y > 0) r.push(i - N); if (y < N - 1) r.push(i + N); return r; };
function group(b, i) { const c = b[i], seen = new Set([i]), st = [i]; let libs = 0; const L = new Set();
  while (st.length) { const j = st.pop(); for (const k of nb(j)) { if (b[k] === 0) L.add(k); else if (b[k] === c && !seen.has(k)) { seen.add(k); st.push(k); } } }
  libs = L.size; return { stones: [...seen], libs }; }
export function newGame() { return { b: new Array(N * N).fill(0), turn: 1, prev: null, cap: [0, 0, 0], passes: 0, over: false, moves: 0 }; }
// trả về null nếu nước đi không hợp lệ, ngược lại trả về số quân bị bắt
export function play(g, i, color = g.turn) {
  if (g.over) return null;
  if (i === -1) { g.passes++; g.turn = 3 - color; g.prev = null; g.moves++; if (g.passes >= 2) g.over = true; return 0; }
  if (i < 0 || i >= N * N || g.b[i] !== 0 || color !== g.turn) return null;
  const before = g.b.slice(); g.b[i] = color; let taken = 0;
  for (const k of nb(i)) if (g.b[k] === 3 - color) { const gr = group(g.b, k); if (gr.libs === 0) { for (const s of gr.stones) g.b[s] = 0; taken += gr.stones.length; } }
  if (group(g.b, i).libs === 0) { g.b = before; return null; } // tự sát
  const key = g.b.join(''); if (g.prev && g.prev === key) { g.b = before; return null; } // ko
  g.prev = before.join(''); g.cap[color] += taken; g.turn = 3 - color; g.passes = 0; g.moves++;
  return taken;
}
export function legal(g, i) { const c = { ...g, b: g.b.slice(), cap: g.cap.slice() }; return play(c, i) !== null; }
export function score(g) {
  const s = [0, 0, 0], seen = new Set();
  for (let i = 0; i < N * N; i++) {
    if (g.b[i]) { s[g.b[i]]++; continue; } if (seen.has(i)) continue;
    const st = [i], reg = [i], bor = new Set(); seen.add(i);
    while (st.length) { const j = st.pop(); for (const k of nb(j)) { if (g.b[k]) bor.add(g.b[k]); else if (!seen.has(k)) { seen.add(k); st.push(k); reg.push(k); } } }
    if (bor.size === 1) s[[...bor][0]] += reg.length;
  }
  const black = s[1], white = s[2] + KOMI;
  return { black, white, winner: black > white ? 1 : 2 };
}
// máy đánh (cung nữ): ưu tiên bắt quân, cứu quân bị dồn, tránh lấp mắt mình
export function aiMove(g) {
  const me = g.turn, op = 3 - me, cand = [];
  for (let i = 0; i < N * N; i++) {
    if (g.b[i] || !legal(g, i)) continue;
    const ns = nb(i); if (ns.every(k => g.b[k] === me)) continue; // mắt của mình
    let sc = Math.random() * 2;
    const t = { ...g, b: g.b.slice(), cap: g.cap.slice() }; const took = play(t, i); sc += took * 10;
    for (const k of ns) { if (g.b[k] === op && group(g.b, k).libs === 2) sc += 3; if (g.b[k] === me && group(g.b, k).libs === 1) sc += 8; if (g.b[k] === me) sc += .5; }
    if (group(t.b, i).libs === 1) sc -= 6;
    const x = i % N, y = (i / N) | 0; if (x === 0 || y === 0 || x === N - 1 || y === N - 1) sc -= 1.5; if ((x === 2 || x === 6) && (y === 2 || y === 6)) sc += 1.5;
    cand.push([sc, i]);
  }
  if (!cand.length) return -1;
  cand.sort((a, b) => b[0] - a[0]);
  if (g.passes && g.moves > 40) { const s = score(g); if (s.winner === me) return -1; }
  if (cand[0][0] < 0 && g.moves > 50) return -1;
  return cand[0][1];
}
