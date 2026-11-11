// MỘNG PHƯỢNG HOÀNG – máy chủ game
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const C = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.get('/ping', (req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Cache-Control', 'no-store'); res.send('ok'); });
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', setHeaders: (res, f) => { if (/\.(js|html|css)$/.test(f)) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get('/health', (_, res) => res.send('ok'));

// ---------------- lưu trữ: MongoDB nếu có, không thì file JSON ----------------
const DB = { players: {}, state: { news: [], cases: {}, lastNight: '', seq: 1 } };
let mongo = null;
async function loadDB() {
  if (process.env.MONGODB_URI) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    mongo = client.db(process.env.MONGODB_DB || 'mongphuonghoang').collection('save');
    const doc = await mongo.findOne({ _id: 'world' });
    if (doc) Object.assign(DB, doc.data);
    console.log('MongoDB connected');
  } else if (fs.existsSync(path.join(__dirname, 'data.json'))) {
    Object.assign(DB, JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8')));
  }
}
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      if (mongo) await mongo.updateOne({ _id: 'world' }, { $set: { data: DB } }, { upsert: true });
      else fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(DB));
    } catch (e) { console.error('save failed', e.message); }
  }, 1500);
}

// ---------------- thời gian Việt Nam ----------------
const vnNow = () => new Date(Date.now() + C.TZ_OFFSET_H * 3600e3);
const dayKey = () => vnNow().toISOString().slice(0, 10);
const now = () => Date.now();
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

// ---------------- người chơi ----------------
const hash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
const P = id => DB.players[id];
const online = new Map(); // playerId -> socket
const sockOf = id => online.get(id);
const rankName = p => p.lanh ? 'Phế phi (lãnh cung)' : C.RANKS[p.rank].name;
const title = p => `${p.name} ${rankName(p)}`;

// ---------------- Hoàng thượng mỗi ngày ----------------
function ht() {
  const k = dayKey(); const h = DB.state.ht;
  if (h && h.day === k) return h;
  DB.state.ht = { day: k, canh: rnd(C.HT.canh.length), mau: rnd(C.HT.mau.length), tai: rnd(C.HT.tai.length), mood: rnd(C.HT.mood.length) };
  return DB.state.ht;
}
function htKnown(p) { if (!p.htk || p.htk.day !== dayKey()) p.htk = { day: dayKey(), keys: [] }; return p.htk; }
function htKnownView(p) { const h = ht(), k = htKnown(p); const o = {}; for (const key of k.keys) o[key] = key === 'canh' ? C.HT.canh[h.canh] : key === 'mau' ? C.HT.mau[h.mau] : key === 'tai' ? C.HT.tai[h.tai] : C.HT.mood[h.mood]; return o; }
const colorMatch = p => C.OUTFIT_COLOR[p.outfit] && C.OUTFIT_COLOR[p.outfit] === C.HT.mau[ht().mau];
// hồi lượt theo thời gian: +1 lượt mỗi TURN_REGEN_MIN phút, tối đa TURN_CAP
function regen(p) {
  if (!p.turnAt) p.turnAt = now();
  if (p.turns >= C.TURN_CAP) { p.turnAt = now(); return; }
  const step = C.TURN_REGEN_MIN * 60e3, k = Math.floor((now() - p.turnAt) / step);
  if (k > 0) { p.turns = Math.min(C.TURN_CAP, p.turns + k); p.turnAt += k * step; if (p.turns >= C.TURN_CAP) p.turnAt = now(); }
}
function freshDay(p) {
  const k = dayKey();
  if (p.day === k) return;
  p.day = k;
  p.turns = Math.max(p.turns || 0, C.TURNS_PER_DAY + (p.path === 'giaote' ? 1 : 0)); p.turnAt = now();
  p.thinhAn = false;
  p.attacks = 0; p.targeted = 0;
  p.tasks = { thinhan: false, luyen: false, dotin: false };
  p.taskBonus = false;
  p.lanhToday = false; p.samToday = false; p.phephiToday = false;
  p.silver += 20 + p.rank * 15;
}
function allowedOutfits(p) {
  const s = new Set(['aongu']);
  for (let r = 0; r <= p.rank; r++) { s.add(C.RANKS[r].outfit); for (const x of C.RANKS[r].extra || []) s.add(x); }
  return [...s];
}
function publicView(p) {
  return { id: p.id, name: p.name, rank: p.rank, rankName: rankName(p), outfit: p.outfit, loc: p.loc, x: p.x, z: p.z, ry: p.ry, anim: p.anim || 'dung_cho', male: false };
}
function selfView(p) {
  const open = Object.values(DB.state.cases).filter(c => c.victim === p.id && c.status === 'open').map(c => caseView(c, p));
  return {
    ...publicView(p), path: p.path, pathName: C.PATHS[p.path].name, origin: C.ORIGINS[p.origin].name,
    pts: p.pts, nextPts: C.RANKS[p.rank + 1]?.pts ?? null, silver: p.silver, turns: (regen(p), p.turns), turnCap: C.TURN_CAP, nextTurn: p.turns >= C.TURN_CAP ? null : p.turnAt + C.TURN_REGEN_MIN * 60e3, sung: p.sung, haiLong: p.haiLong,
    stats: p.stats, tasks: p.tasks, thinhAn: p.thinhAn, waiting: p.waiting || false, lanh: p.lanh || null,
    outfits: allowedOutfits(p), decor: p.decor || [], hasPalace: p.rank >= C.PALACE_RANK, cases: open,
    protectedUntil: p.protectUntil || 0, admin: !!p.admin, canFight: !p.lanh && p.rank >= C.FIGHT_RANK,
    camTuc: (p.camTucUntil || 0) > now() ? p.camTucUntil : 0, loyal: p.loyal ?? 50, sick: !!p.sick,
    attacksLeft: C.ATTACK_PER_DAY - (p.attacks || 0), latThe: (p.tamCungUntil || 0) > now(),
    htKnown: htKnownView(p), decorOwned: p.decorOwned || [], huong: !!p.huong, feast: feastView(p), htTalked: p.htTalked === p.tamCungUntil && !!p.tamCungUntil,
  };
}
function push(p) { const s = sockOf(p.id); if (s) s.emit('me', selfView(p)); }
function toast(p, text, kind = 'info') { const s = sockOf(p.id); if (s) s.emit('toast', { text, kind }); }
function news(text, kind = 'tin') {
  const n = { t: now(), text, kind };
  DB.state.news.unshift(n); DB.state.news = DB.state.news.slice(0, 60);
  io.emit('news', n); save();
}
function seatCount(r) { return Object.values(DB.players).filter(p => !p.lanh && p.rank === r).length; }

// ---------------- thăng cấp ----------------
function tryPromote(p) {
  if (p.lanh) return;
  let changed = false;
  while (p.rank < C.RANKS.length - 1 && p.pts >= C.RANKS[p.rank + 1].pts) {
    const next = C.RANKS[p.rank + 1];
    if (next.seats && seatCount(p.rank + 1) >= next.seats) { if (!p.waiting) toast(p, `Đủ công trạng lên ${next.name} nhưng hết ghế. Chờ có người rời ghế.`); p.waiting = true; break; }
    p.waiting = false; p.rank++; changed = true; p.trend = { dir: 1, t: now() };
    p.outfit = next.outfit;
    news(`Thánh chỉ: ${p.name} được tấn phong ${next.name}.`, 'phong');
    const s = sockOf(p.id);
    if (s) s.emit('cutscene', { type: 'sacphong', rank: p.rank, rankName: next.name, outfit: next.outfit, palace: p.rank === C.PALACE_RANK, name: p.name });
  }
  if (changed) push(p);
}
function freeSeatCheck() {
  // khi có ghế trống: người chờ có công trạng cao nhất được lên
  const waiting = Object.values(DB.players).filter(p => p.waiting && !p.lanh).sort((a, b) => b.pts - a.pts);
  for (const p of waiting) tryPromote(p);
}
function addPts(p, n) { p.pts += n; tryPromote(p); }

function demote(p, steps, reason) {
  const before = p.rank;
  p.rank = Math.max(0, p.rank - steps); p.trend = { dir: -1, t: now() };
  p.waiting = false;
  if (!allowedOutfits(p).includes(p.outfit)) p.outfit = C.RANKS[p.rank].outfit;
  p.protectUntil = now() + C.PROTECT_HOURS * 3600e3;
  p.pts = Math.min(p.pts, C.RANKS[p.rank].pts + 20);
  news(`${p.name} bị giáng từ ${C.RANKS[before].name} xuống ${C.RANKS[p.rank].name} vì ${reason}.`, 'phat');
  toast(p, `Bổn cung bị giáng xuống ${C.RANKS[p.rank].name}. Được bảo hộ ${C.PROTECT_HOURS} giờ.`, 'bad');
  push(p); freeSeatCheck();
}
function sendToLanhCung(p, reason, caseId) {
  if (!p.lanh) p.trend = { dir: -1, t: now() };
  if (p.lanh) { if (caseId) p.lanh.caseId = caseId; return; }
  p.lanh = { from: p.rank, tasks: 0, caseId: caseId || null, since: now() }; p.loyal = Math.max(0, (p.loyal ?? 50) - 20);
  p.waiting = false;
  p.outfit = 'tunu';
  p.protectUntil = now() + C.PROTECT_HOURS * 3600e3;
  p.loc = 'lanhcung';
  news(`${p.name} bị đày vào lãnh cung vì ${reason}.`, 'phat');
  const s = sockOf(p.id); if (s) s.emit('cutscene', { type: 'lanhcung', name: p.name, reason });
  push(p); freeSeatCheck();
}
function phucVi(p, toRank, how) {
  const from = p.lanh?.from ?? 2;
  delete p.lanh;
  let r = Math.min(toRank, from);
  while (r > 2 && C.RANKS[r].seats && seatCount(r) >= C.RANKS[r].seats) r--;
  p.rank = r; p.outfit = C.RANKS[r].outfit; p.pts = Math.max(p.pts, C.RANKS[r].pts); p.trend = { dir: 1, t: now() };
  p.loc = 'phong';
  news(`${p.name} được phục vị ${C.RANKS[r].name} ${how}.`, 'phong');
  const s = sockOf(p.id); if (s) s.emit('cutscene', { type: 'phucvi', rank: r, rankName: C.RANKS[r].name, outfit: p.outfit, name: p.name });
  push(p);
}

// ---------------- vụ án ----------------
const NPC_SUSPECTS = ['Lệ Tần', 'Hân Quý nhân', 'Cung nữ Xuân Đào', 'Thái giám Tiểu Lộ Tử', 'Mai Đáp ứng', 'Cung nữ Thu Cúc', 'Uyển Quý nhân'];
function makeTraits() { return { cung: rnd(C.TRAITS.cung.length), gio: rnd(C.TRAITS.gio.length), dau: rnd(C.TRAITS.dau.length) }; }
function createCase(victim, culprit /* player or null for NPC */, opts = {}) {
  const id = 'vu' + (DB.state.seq++);
  const method = opts.method ? C.METHODS.find(m => m.id === opts.method) : pick(C.METHODS);
  const t = makeTraits();
  const keys = ['cung', 'gio', 'dau'];
  // nghi phạm giả: mỗi người khác thủ phạm đúng 1 đặc điểm → phải đủ 3 manh mối mới chắc chắn
  const others = Object.values(DB.players).filter(q => q.id !== victim.id && (!culprit || q.id !== culprit.id) && !q.lanh && q.rank >= 2).map(q => ({ id: q.id, name: title(q) }));
  const pool = [...others.sort(() => Math.random() - 0.5), ...NPC_SUSPECTS.sort(() => Math.random() - 0.5).map(n => ({ id: 'npc:' + n, name: n }))];
  const culpritEntry = culprit ? { id: culprit.id, name: title(culprit) } : (pool.splice(pool.findIndex(x => x.id.startsWith('npc:')), 1)[0]);
  const suspects = [{ ...culpritEntry, traits: t, guilty: true }];
  for (let i = 0; i < 3; i++) {
    const who = pool.shift(); if (!who) break;
    const tr = { ...t }; const k = keys[i];
    const n = C.TRAITS[k].length; tr[k] = (t[k] + 1 + rnd(n - 1)) % n;
    suspects.push({ ...who, traits: tr, guilty: false });
  }
  suspects.sort(() => Math.random() - 0.5);
  const c = {
    id, victim: victim.id, victimName: title(victim), culprit: culpritEntry.id, culpritName: culpritEntry.name,
    method: method.id, methodName: method.name, crime: method.crime,
    suspects, found: [], blurred: opts.blur ? pick(['gio', 'cung', 'dau']) : null, witness: null,
    status: 'open', created: now(), hours: opts.hours ?? C.CASE_HOURS, deadline: online.has(victim.id) ? now() + (opts.hours ?? C.CASE_HOURS) * 3600e3 : null, npc: !culprit,
  };
  DB.state.cases[id] = c;
  news(`Ma ma khám xét phòng ${victim.name} và tìm thấy ${method.name}. ${victim.name} bị gọi lên Từ Ninh cung.`, 'an');
  const s = sockOf(victim.id);
  if (s) s.emit('cutscene', { type: 'phatgiac', caseId: id, method: method.id, methodName: method.name, crime: method.crime, hours: opts.hours ?? C.CASE_HOURS });
  push(victim); save();
  return c;
}
function caseView(c, viewer) {
  return {
    id: c.id, method: c.method, methodName: c.methodName, crime: c.crime, status: c.status, deadline: c.deadline,
    suspects: c.suspects.map(s => ({ id: s.id, name: s.name })),
    found: c.found, witness: c.witness, witnessWait: c.witnessReq ? c.witnessReq.name : null, traitNames: C.TRAITS,
  };
}
function revealClue(c, kind, p) {
  const clue = C.CLUES[kind];
  let trait = kind === 'thaiy' ? 'dau' : clue.trait;
  if (trait === 'any') { const known = c.found.filter(f => f.value !== null && f.value !== undefined).map(f => f.trait); const miss = ['cung', 'gio', 'dau'].filter(t => !known.includes(t)); trait = miss.length ? pick(miss) : pick(['cung', 'gio', 'dau']); }
  const guilty = c.suspects.find(s => s.guilty);
  if (c.blurred === trait && kind !== 'thaiy') {
    c.found.push({ kind, name: clue.name, text: `${clue.text}… nhưng dấu vết đã bị xóa sạch, không thấy gì rõ ràng.`, trait, value: null });
    return;
  }
  const value = guilty.traits[trait];
  const word = C.TRAITS[trait][value];
  c.found.push({ kind, name: clue.name, text: `${clue.text} ${word}.`, trait, value });
  // cung nữ trung thành cao: khai thêm một người chắc chắn vô can
  if (kind === 'hoi' && (p.loyal ?? 50) >= 80) {
    const inn = c.suspects.filter(s => !s.guilty && !c.found.some(f => f.exclude === s.id));
    if (inn.length) { const s = pick(inn); c.found.push({ kind: 'hoi2', name: 'Cung nữ thân tín (trung thành)', text: `Nô tỳ dám lấy mạng ra thề: ${s.name} hôm ấy không hề lại gần phòng.`, trait: null, value: null, exclude: s.id }); }
  }
}
function suspectTraitText(c) {
  // cho người chơi bảng đặc điểm từng nghi phạm để tự loại trừ
  return c.suspects.map(s => ({ id: s.id, name: s.name, model: suspectModel(s), ti: s.traits, cung: C.TRAITS.cung[s.traits.cung], gio: C.TRAITS.gio[s.traits.gio], dau: C.TRAITS.dau[s.traits.dau] }));
}
function suspectModel(s) {
  if (s.id.startsWith('npc:')) { const n = s.name; if (/Cung nữ/.test(n)) return 'cungnu'; if (/Thái giám/.test(n)) return 'thaigiam'; if (/Tần/.test(n)) return 'tan'; if (/Quý nhân/.test(n)) return 'quynhan'; return 'thuongtai'; }
  const q = P(s.id); if (!q) return 'tunu';
  return q.outfit && q.outfit !== 'aongu' ? q.outfit : C.RANKS[q.rank].outfit;
}
function punishVictim(c, extra = 0, why) {
  const v = P(c.victim); if (!v) return;
  v.offenses = (v.offenses || 0) + 1;
  if (v.offenses >= 3 || extra >= 2) sendToLanhCung(v, why || c.crime, c.id);
  else demote(v, 1 + extra, why || c.crime);
}
function closeCase(c, verdict, text) {
  c.status = verdict; c.closed = now(); c.verdictText = text;
  const v = P(c.victim); if (v) { const s = sockOf(v.id); if (s) s.emit('caseClosed', { id: c.id, verdict, text }); push(v); }
  save();
}
function caseOp(p, data) {
  const c = DB.state.cases[data.caseId];
  if (!c) return toast(p, 'Không tìm thấy vụ án.', 'bad');
  const isReopen = p.lanh && p.lanh.caseId === c.id && c.status !== 'open' && c.status !== 'latan';
  if (c.victim !== p.id || (c.status !== 'open' && !isReopen)) return toast(p, 'Vụ án đã khép lại.', 'bad');
  const op = data.op;
  if (op === 'clue') {
    const clue = C.CLUES[data.kind]; if (!clue) return;
    if (c.found.some(f => f.kind === data.kind)) return toast(p, 'Manh mối này đã điều tra rồi.');
    if (data.kind === 'hoi' && (p.loyal ?? 50) < 30 && !data.bribe) return toast(p, 'Cung nữ ấp úng không dám nói. Thử ban thưởng cho nàng trước.', 'bad');
    if (data.kind === 'hoi' && data.bribe) { if (p.silver < 30) return toast(p, 'Không đủ bạc.', 'bad'); p.silver -= 30; }
    if (data.kind === 'theodoi' && data.fail) { if (p.turns < 1) return toast(p, 'Hết lượt.', 'bad'); p.turns -= 1; save(); push(p); return toast(p, 'Bị phát hiện, nghi phạm lẩn mất. Thử lại sau.', 'bad'); }
    const freeMuu = p.path === 'muuke' && !c.muuFree;
    if (!freeMuu) {
      if (p.turns < clue.turn) return toast(p, 'Hết lượt hôm nay.', 'bad');
      if (p.silver < clue.cost) return toast(p, 'Không đủ bạc.', 'bad');
      p.turns -= clue.turn; p.silver -= clue.cost;
    } else c.muuFree = true;
    revealClue(c, data.kind, p);
    toast(p, freeMuu ? 'Nhờ mưu kế, manh mối này không tốn gì.' : 'Đã có thêm manh mối.', 'good');
  } else if (op === 'witness') {
    if (c.witness || c.witnessReq) return toast(p, 'Đã nhờ người làm chứng rồi.');
    const w = P(data.who); if (!w || w.id === p.id) return toast(p, 'Chọn người làm chứng khác.', 'bad');
    if (p.turns < 1) return toast(p, 'Hết lượt hôm nay.', 'bad');
    p.turns -= 1;
    const guilty = c.suspects.find(s => s.guilty);
    const trait = pick(['cung', 'gio', 'dau']);
    c.witnessReq = { who: w.id, name: title(w), trait, value: guilty.traits[trait], at: now() };
    if (sockOf(w.id)) { askWitness(c); toast(p, `Đã nhờ ${w.name} làm chứng. Chờ người ấy khai…`); setTimeout(() => autoWitness(c.id), C.WITNESS_WAIT_MS); }
    else autoWitness(c.id);
  } else if (op === 'confess') {
    if (isReopen) return;
    if (data.mode === 'camtuc') {
      closeCase(c, 'nhantoi', `${p.name} nhận tội, được giảm nhẹ: cấm túc một ngày trong phòng.`);
      p.camTucUntil = now() + 24 * 3600e3; p.protectUntil = Math.max(p.protectUntil || 0, p.camTucUntil);
      const sk = sockOf(p.id); if (sk && p.loc !== 'phong') { enter(p, 'phong', sk); }
    } else {
      closeCase(c, 'nhantoi', `${p.name} nhận tội, được giảm nhẹ: giáng một bậc.`);
      if (p.rank > 0) demote(p, 1, 'nhận tội ' + c.crime); else push(p);
    }
    news(`${p.name} nhận tội trong vụ ${c.methodName}, được Thái hậu giảm nhẹ hình phạt.`, 'phat');
  } else if (op === 'accuse') {
    const s = c.suspects.find(x => x.id === data.who); if (!s) return;
    if (s.guilty) {
      const culprit = P(c.culprit);
      closeCase(c, 'latan', `Lật án thành công. Thủ phạm là ${s.name}.`);
      news(`Lật án! ${p.name} chứng minh mình bị vu oan. Thủ phạm là ${s.name}.`, 'latan');
      p.sung += 10;
      if (isReopen) phucVi(p, p.lanh.from, 'sau khi kêu oan thành công');
      else { addPts(p, 20); }
      if (culprit) { culprit.offenses = (culprit.offenses || 0) + 1; if (culprit.rank >= C.FIGHT_RANK + 1) demote(culprit, 2, 'vu oan ' + p.name); else sendToLanhCung(culprit, 'vu oan ' + p.name, null); }
      const sk = sockOf(p.id); if (sk) sk.emit('cutscene', { type: 'latan', name: p.name, culprit: s.name });
    } else {
      if (isReopen) { toast(p, `Kêu oan sai người. ${s.name} vô can.`, 'bad'); c.reopenFail = (c.reopenFail || 0) + 1; }
      else {
        closeCase(c, 'vucao', `Chỉ sai người: ${s.name} vô can. Bị phạt thêm tội vu cáo.`);
        news(`${p.name} tố sai ${s.name} trong vụ ${c.methodName}, bị phạt thêm tội vu cáo.`, 'phat');
        punishVictim(c, 1, 'vu cáo ' + s.name);
      }
    }
  }
  save(); push(p);
  const sk = sockOf(p.id); if (sk) sk.emit('caseDetail', { ...caseView(c, p), table: suspectTraitText(c) });
}
// ---------- nhân chứng là người chơi thật ----------
function askWitness(c) {
  const r = c.witnessReq; if (!r) return; const s = sockOf(r.who); if (!s) return;
  s.emit('witnessAsk', { caseId: c.id, victimName: c.victimName, methodName: c.methodName, trait: r.trait, traitName: { cung: 'nơi ở', gio: 'giờ lui tới', dau: 'dấu vết' }[r.trait], options: C.TRAITS[r.trait], truth: r.value, guilty: r.who === c.culprit, waitMs: Math.max(0, C.WITNESS_WAIT_MS - (now() - r.at)) });
}
function setWitness(c, value, auto) {
  const r = c.witnessReq; if (!r) return; const w = P(r.who);
  c.witness = { who: r.who, name: r.name, trait: r.trait, value, auto: !!auto, text: `${w ? w.name : r.name} khai: hôm ấy thấy một người có ${C.TRAITS[r.trait][value]} lảng vảng gần phòng.` };
  c.witnessReq = null;
  const v = P(c.victim); if (v) { toast(v, `${w ? w.name : r.name} đã khai xong.`, 'good'); const s = sockOf(v.id); if (s) s.emit('caseDetail', { ...caseView(c, v), table: suspectTraitText(c), reopen: !!(v.lanh && v.lanh.caseId === c.id) }); }
  save();
}
function autoWitness(id) {
  const c = DB.state.cases[id]; if (!c || !c.witnessReq) return;
  const r = c.witnessReq; let value = r.value;
  if (r.who === c.culprit) value = (value + 1) % C.TRAITS[r.trait].length; // thủ phạm vắng mặt: tự khai sai
  setWitness(c, value, true);
}
function checkDeadlines() {
  for (const c of Object.values(DB.state.cases)) {
    if (c.witnessReq && now() - c.witnessReq.at > C.WITNESS_WAIT_MS + 5000) autoWitness(c.id);
    if (c.status === 'open' && c.deadline && now() > c.deadline) {
      closeCase(c, 'xu', `Hết hạn mà không tìm ra thủ phạm. Thái hậu phán phạt.`);
      news(`Hết hạn điều tra, Thái hậu phán ${P(c.victim)?.name} có tội ${c.crime}.`, 'phat');
      punishVictim(c, 0);
    }
  }
}

// ---------------- lật thẻ ----------------
function latThe(when = 'Đêm nay') {
  const pool = Object.values(DB.players).filter(p => !p.lanh && !((p.camTucUntil || 0) > now()) && p.rank >= 1 && (online.has(p.id) || now() - (p.lastSeen || p.created || 0) < 3 * 864e5));
  if (!pool.length) return null;
  const weight = p => {
    let m = 1;
    if (p.picked1 === 1) m = 0.4; if (p.picked1 >= 2) m = 0.15;
    if ((p.notPicked || 0) >= 5) m = 1.5;
    if (colorMatch(p)) m *= 1.4;
    if (p.huong) m *= 1.6;
    return Math.max(0.05, (10 + p.sung + p.stats.tai * 0.5) * m);
  };
  const n = pool.length > C.LAT_THE_CROWD ? 2 : 1, left = [...pool], picked = [];
  for (let k = 0; k < n && left.length; k++) {
    const w = left.map(weight); let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
    for (; i < left.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
    picked.push(left.splice(i, 1)[0]);
  }
  for (const p of pool) p.huong = false;
  for (const p of pool) { if (picked.includes(p)) { p.picked1 = (p.picked1 || 0) + 1; p.notPicked = 0; } else { p.picked1 = 0; p.notPicked = (p.notPicked || 0) + 1; } }
  for (const chosen of picked) {
    const longAbsent = (chosen.notPicked || 0) >= 5;
    chosen.sung += C.LAT_THE.sung; chosen.turns += C.LAT_THE.turns;
    chosen.tamCungUntil = now() + 3 * 3600e3;
    news(longAbsent ? `Hoàng thượng chợt nhớ người cũ: ${when.toLowerCase()} lật thẻ bài của ${title(chosen)}.` : `${when} Hoàng thượng lật thẻ bài của ${title(chosen)}.`, 'latthe');
    io.emit('latthe', { id: chosen.id, name: title(chosen), when });
    addPts(chosen, C.LAT_THE.pts); push(chosen);
  }
  // an ủi: người không được chọn nhận quà Hoàng thượng ban
  const G = C.LAT_THE_GIFT;
  for (const p of pool) if (!picked.includes(p)) { p.silver += G.silver; p.sung += G.sung; toast(p, `🎁 Hoàng thượng ban ${pick(['một hộp điểm tâm', 'một xấp lụa', 'một cây trâm bạc', 'một bình trà ngon'])} an ủi: +${G.silver} bạc, +${G.sung} sủng ái.`, 'good'); push(p); }
  save();
  return picked[0];
}
// ---------------- yến tiệc ----------------
function feastView() {
  const f = DB.state.feast; if (!f || f.done || now() > f.end + 5000) return null;
  return { id: f.id, end: f.end, n: Object.keys(f.entries).length, names: Object.values(f.entries).map(e => e.name) };
}
function startFeast(min = C.FEAST_MIN, venue = 'out') {
  DB.state.feast = { id: 'yt' + now(), start: now(), end: now() + min * 60e3, entries: {}, done: false, venue };
  news(`🎎 Yến tiệc ${venue === 'in' ? 'trong điện' : 'ngoài trời ở Ngự hoa viên'} bắt đầu! Hoàng thượng ngự giá, ai dâng tiết mục hay nhất sẽ được trọng thưởng (${min} phút).`, 'yentiec');
  io.emit('feast', feastView()); save();
}
function endFeast() {
  const f = DB.state.feast; if (!f || f.done) return; f.done = true; const h = ht();
  const list = Object.entries(f.entries).map(([id, e]) => ({ id, ...e, score: e.q * 100 + (e.tai === C.HT.tai[h.tai] ? 25 : 0) + (e.color ? 15 : 0) + Math.random() * 10 }));
  list.sort((a, b) => b.score - a.score);
  if (list.length) {
    const w = P(list[0].id); if (w) { w.sung += 12; w.silver += 80; w.turns += 2; addPts(w, 20); push(w); }
    for (const e of list.slice(1)) { const q = P(e.id); if (q) { q.silver += 20; q.turns += 1; push(q); } }
    news(`🏮 Yến tiệc tàn. Hoàng thượng khen tiết mục ${list[0].tai} của ${list[0].name} xuất sắc nhất, ban thưởng sủng ái, 80 lượng bạc, 2 lượt.`, 'phong');
  } else news('Yến tiệc tàn mà không ai dâng tiết mục, Hoàng thượng phẩy tay hồi cung.', 'yentiec');
  setTimeout(() => { for (const [id, sk] of online) { const q = P(id); if (q && q.loc === 'yentiec') { enter(q, 'hoavien', sk); push(q); } } }, 6000);
  io.emit('feastEnd', { winner: list[0] ? { id: list[0].id, name: list[0].name, tai: list[0].tai } : null }); save();
}
function feastTick(mins, k) {
  const f = DB.state.feast;
  if (f && !f.done && now() > f.end) endFeast();
  DB.state.feastDone = DB.state.feastDone || {};
  C.FEAST_SLOTS.forEach(([h, m, venue], i) => { const key = k + ':' + i, st = h * 60 + m; if (mins >= st && mins < st + C.FEAST_MIN && !DB.state.feastDone[key]) { DB.state.feastDone[key] = 1; startFeast(C.FEAST_MIN - (mins - st), venue); } });
}
// hầu chuyện Hoàng thượng trong tẩm cung: điểm mỗi lựa chọn theo tâm trạng [vui, mệt, buồn]
const HT_TALK = [
  { q: 'Hôm nay tấu chương chất cao như núi…', opts: [{ t: 'Để thần thiếp xoa vai cho Hoàng thượng.', s: [1, 3, 1] }, { t: 'Hoàng thượng kể thần thiếp nghe chuyện triều chính đi.', s: [3, -1, 0] }, { t: 'Thần thiếp đàn một khúc cho người khuây khỏa.', s: [1, 1, 3] }] },
  { q: 'Nàng thấy trong cung dạo này thế nào?', opts: [{ t: 'Có Hoàng thượng, hậu cung yên vui.', s: [3, 1, 1] }, { t: 'Thần thiếp chỉ mong Hoàng thượng giữ gìn long thể.', s: [0, 3, 2] }, { t: 'Có vài chuyện… thần thiếp không dám nói.', s: [-1, -1, 1] }] },
  { q: 'Đêm đã khuya, nàng muốn trẫm thưởng gì?', opts: [{ t: 'Thần thiếp không cần gì, chỉ cần người vui.', s: [2, 2, 3] }, { t: 'Xin Hoàng thượng ban cho thần thiếp một bài thơ.', s: [3, 0, 1] }, { t: 'Một chiếc trâm ngọc thật đẹp ạ!', s: [1, -1, -1] }] },
];
function nightTick() {
  const v = vnNow();
  const k = dayKey();
  const mins = v.getUTCHours() * 60 + v.getUTCMinutes();
  DB.state.latDone = DB.state.latDone || {};
  C.LAT_THE_SLOTS.forEach(([h, m, when], i) => { const key = k + ':' + i; if (mins >= h * 60 + m && mins < h * 60 + m + 120 && !DB.state.latDone[key]) { DB.state.latDone[key] = 1; latThe(when); } });
  feastTick(mins, k);
  // vắng mặt: từ Tần trở lên
  for (const p of Object.values(DB.players)) {
    if (p.lanh || p.rank < C.PALACE_RANK) continue;
    const days = (now() - (p.lastSeen || now())) / 864e5;
    if (days >= C.ABSENT_SICK_DAYS && days < C.ABSENT_LOSE_DAYS && !p.sick && !online.has(p.id)) { p.sick = true; news(`${p.name} cáo bệnh, đã ${Math.floor(days)} ngày không ra khỏi cung.`); }
    if (days >= C.ABSENT_LOSE_DAYS && !online.has(p.id)) { p.sick = false; const r = p.rank; p.rank = C.FIGHT_RANK - 1; p.trend = { dir: -1, t: now() }; p.outfit = C.RANKS[p.rank].outfit; news(`${p.name} vắng mặt quá lâu, nhường ghế ${C.RANKS[r].name}.`); freeSeatCheck(); }
  }
  checkDeadlines();
  // vụ án do hệ thống dàn dựng khi cung vắng người
  for (const p of Object.values(DB.players)) {
    if (!online.has(p.id) || p.lanh || p.rank < C.FIGHT_RANK) continue;
    if (p.protectUntil > now()) continue;
    if (Object.values(DB.state.cases).some(c => c.victim === p.id && c.status === 'open')) continue;
    if (p.npcCaseDay === dayKey()) continue;
    if (Math.random() < 0.004) { p.npcCaseDay = dayKey(); createCase(p, null, { blur: Math.random() < 0.3 }); }
  }
}

// ---------------- vị trí, phòng ----------------
const LOCS = ['tuninh', 'hoavien', 'duongtam', 'phong', 'tamcung', 'lanhcung', 'yentiec'];
// ghế ngồi: loc -> { seatId: playerId }
const SEATS = {}; const SEAT_IDS = { hoavien: ['hv0', 'hv1', 'hv2'], yentiec: ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'] };
function freeSeat(p) { for (const loc in SEATS) for (const k in SEATS[loc]) if (SEATS[loc][k] === p.id) delete SEATS[loc][k]; p.seat = null; }
function takeSeat(p, id) { const L = (SEATS[p.loc] = SEATS[p.loc] || {}); if (!(SEAT_IDS[p.loc] || []).includes(id)) return false; if (L[id] && L[id] !== p.id && online.has(L[id])) return false; freeSeat(p); L[id] = p.id; p.seat = id; p.anim = 'sit:' + id; return true; }
function roomOf(p) { return p.loc === 'phong' || p.loc === 'tamcung' ? p.loc + ':' + p.id : p.loc; }
function enter(p, loc, sock) {
  const old = roomOf(p); freeSeat(p);
  sock.leave(old); sock.to(old).emit('pleave', p.id);
  p.loc = loc; p.x = 0; p.z = loc === 'tuninh' ? 3.5 : 2; p.ry = Math.PI; p.anim = 'dung_cho';
  const room = roomOf(p);
  sock.join(room);
  const others = [...online.keys()].map(P).filter(q => q && q.id !== p.id && roomOf(q) === room).map(publicView);
  let seat = null;
  if (loc === 'yentiec') { const free = SEAT_IDS.yentiec.find(id => !(SEATS.yentiec || {})[id] || !online.has(SEATS.yentiec[id])); if (free) { takeSeat(p, free); seat = free; } }
  sock.emit('scene', { loc, players: others, venue: DB.state.feast?.venue || 'out', seat });
  sock.to(room).emit('pjoin', publicView(p));
}

// ---------------- kết nối ----------------
io.on('connection', sock => {
  let me = null;
  const ok = p => {
    setTimeout(() => { for (const c of Object.values(DB.state.cases)) if (c.witnessReq?.who === p.id) askWitness(c); }, 3000);
    if (online.has(p.id)) { try { online.get(p.id).emit('kicked'); online.get(p.id).disconnect(); } catch (e) {} }
    me = p; online.set(p.id, sock); p.lastSeen = now(); freshDay(p);
    if (!p.token) p.token = crypto.randomBytes(16).toString('hex');
    sock.emit('auth', { token: p.token });
    sock.emit('newsAll', DB.state.news.slice(0, 30));
    sock.emit('feast', feastView());
    sock.emit('schedule', { latThe: C.LAT_THE_SLOTS, feast: C.FEAST_SLOTS, tz: C.TZ_OFFSET_H ?? 7, lead: C.NOTICE_LEAD_MIN });
    for (const c of Object.values(DB.state.cases)) if (c.victim === p.id && c.status === 'open' && !c.deadline) {
      c.deadline = now() + c.hours * 3600e3;
      setTimeout(() => sock.emit('cutscene', { type: 'phatgiac', caseId: c.id, method: c.method, methodName: c.methodName, crime: c.crime, hours: c.hours }), 2500);
    }
    push(p);
    if (p.sick) { p.sick = false; news(`${p.name} đã khỏi bệnh, trở lại hầu hạ.`); }
    const back = p.lanh ? 'lanhcung' : (p.camTucUntil || 0) > now() ? 'phong' : (p.loc === 'tamcung' && p.tamCungUntil > now() ? 'tamcung' : (p.loc && p.loc !== 'tamcung' && !(p.loc === 'yentiec' && !(DB.state.feast && !DB.state.feast.done)) ? p.loc : 'hoavien'));
    if (p.outfit === 'aongu' && back !== 'tamcung' && back !== 'phong') p.outfit = p.lanh ? 'tunu' : C.RANKS[p.rank].outfit;
    enter(p, back, sock);
    tryPromote(p); save();
  };
  sock.on('register', d => {
    const user = String(d.user || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(user)) return sock.emit('err', 'Tên đăng nhập 3–20 ký tự, chỉ chữ không dấu, số, gạch dưới.');
    if (String(d.pass || '').length < 4) return sock.emit('err', 'Mật khẩu ít nhất 4 ký tự.');
    const name = String(d.name || '').trim().slice(0, 16);
    if (name.length < 2) return sock.emit('err', 'Tên nhân vật ít nhất 2 ký tự.');
    if (Object.values(DB.players).some(p => p.user === user)) return sock.emit('err', 'Tên đăng nhập đã có người dùng.');
    if (Object.values(DB.players).some(p => p.name.toLowerCase() === name.toLowerCase())) return sock.emit('err', 'Tên nhân vật đã có trong cung.');
    if (!C.PATHS[d.path] || !C.ORIGINS[d.origin]) return sock.emit('err', 'Chọn xuất thân và lối sống.');
    const salt = crypto.randomBytes(8).toString('hex');
    const id = 'p' + crypto.randomBytes(5).toString('hex');
    const stats = { ...C.PATHS[d.path].stats };
    for (const [k, v] of Object.entries(C.ORIGINS[d.origin].bonus)) stats[k] += v;
    const first = Object.keys(DB.players).length === 0;
    DB.players[id] = {
      id, user, salt, pass: hash(d.pass, salt), name, path: d.path, origin: d.origin, rank: 0, pts: 0,
      silver: C.ORIGINS[d.origin].silver, sung: 0, haiLong: 10, stats, outfit: 'tunu', decor: [],
      created: now(), admin: first || user === (process.env.ADMIN_USER || '').toLowerCase(), loc: 'hoavien', x: 0, z: 2, ry: Math.PI,
    };
    news(`Tú nữ ${name} (${C.ORIGINS[d.origin].name}) vừa tiến cung.`, 'tiencung');
    const p = DB.players[id];
    ok(p);
    sock.emit('cutscene', { type: 'tiencung', name, path: C.PATHS[d.path].name });
  });
  sock.on('login', d => {
    const user = String(d.user || '').trim().toLowerCase();
    const p = Object.values(DB.players).find(q => q.user === user);
    if (!p || hash(String(d.pass || ''), p.salt) !== p.pass) return sock.emit('err', 'Sai tên đăng nhập hoặc mật khẩu.');
    ok(p);
  });
  sock.on('resume', d => { const p = Object.values(DB.players).find(q => q.token && q.token === d.token); if (p) ok(p); else sock.emit('needLogin'); });

  sock.on('goto', loc => {
    if (!me || !LOCS.includes(loc)) return;
    if (me.lanh && loc !== 'lanhcung') return toast(me, 'Người ở lãnh cung không được ra ngoài.', 'bad');
    if (!me.lanh && loc === 'lanhcung') return toast(me, 'Lãnh cung không phải nơi tùy tiện lui tới.');
    if (loc === 'tamcung' && !(me.tamCungUntil > now())) return toast(me, 'Chỉ người được lật thẻ mới vào tẩm cung đêm nay.');
    if ((me.camTucUntil || 0) > now() && loc !== 'phong') return toast(me, 'Đang bị cấm túc, chưa được ra khỏi phòng.', 'bad');
    if (loc === 'yentiec' && !(DB.state.feast && !DB.state.feast.done)) return toast(me, 'Hiện không có yến tiệc.');
    if (loc === 'tamcung') me.outfit = 'aongu';
    else if (me.outfit === 'aongu' && loc !== 'phong') me.outfit = me.lanh ? 'tunu' : C.RANKS[me.rank].outfit;
    enter(me, loc, sock); push(me);
  });
  sock.on('move', d => {
    if (!me) return;
    me.x = +d.x || 0; me.z = +d.z || 0; me.ry = +d.ry || 0; me.anim = String(d.anim || 'dung_cho').slice(0, 20); if (me.seat) freeSeat(me);
    sock.to(roomOf(me)).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: me.anim });
  });
  sock.on('sit', d => { if (!me) return; if (!takeSeat(me, String(d?.seat || ''))) return toast(me, 'Ghế này đã có người ngồi.'); sock.emit('sitOk', { seat: me.seat }); sock.to(roomOf(me)).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: me.anim }); });
  sock.on('stand', () => { if (!me || !me.seat) return; freeSeat(me); me.anim = 'dung_cho'; sock.to(roomOf(me)).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: 'dung_cho' }); });
  sock.on('emote', a => { if (me) { me.anim = String(a).slice(0, 20); sock.to(roomOf(me)).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: me.anim, once: true }); } });
  sock.on('chat', t => {
    if (!me) return;
    let text = String(t || '').trim().slice(0, 200); if (!text) return;
    if (text.startsWith('/') && me.admin) return admin(me, text);
    // xưng hô cung đình cho vui
    const self = me.rank >= C.FIGHT_RANK ? 'bổn cung' : 'thần thiếp';
    text = text.replace(/(^|[\s,.!?;:"'(])(tui|tôi|tao)(?=$|[\s,.!?;:"')])/giu, (m, a) => a + self)
               .replace(/(^|[\s,.!?;:"'(])(bà|mày)(?=$|[\s,.!?;:"')])/giu, (m, a) => a + 'tỷ tỷ');
    io.to(roomOf(me)).emit('chat', { id: me.id, name: title(me), text });
  });

  sock.on('action', d => {
    if (!me) return;
    freshDay(me);
    const a = d.type;
    if (me.lanh && !['lanh', 'tangqua', 'phephi'].includes(a)) return toast(me, 'Ở lãnh cung chỉ có thể làm nhiệm vụ lãnh cung.', 'bad');
    if ((me.camTucUntil || 0) > now() && !['luyen', 'thuongcn', 'shop'].includes(a)) return toast(me, 'Đang bị cấm túc: chỉ được luyện tài nghệ trong phòng.', 'bad');
    regen(me);
    const useTurn = (n, silver = 0) => {
      if (me.turns < n) { toast(me, 'Hết lượt hôm nay. Mai quay lại nhé.', 'bad'); return false; }
      if (me.silver < silver) { toast(me, 'Không đủ bạc.', 'bad'); return false; }
      me.turns -= n; me.silver -= silver; return true;
    };
    const taskDone = k => {
      if (me.tasks[k] === false) { me.tasks[k] = true; }
      if (!me.taskBonus && Object.values(me.tasks).every(Boolean)) { me.taskBonus = true; me.turns += C.TASK_TURNS; addPts(me, 15); toast(me, `Hoàn thành nhiệm vụ hằng ngày: +15 công trạng, +${C.TASK_TURNS} lượt.`, 'good'); }
    };
    if (a === 'thinhan') {
      if (me.loc !== 'tuninh') return toast(me, 'Phải đến Từ Ninh cung mới thỉnh an được.');
      if (me.thinhAn) return toast(me, 'Hôm nay đã thỉnh an rồi.');
      me.thinhAn = true; const h = C.THINH_AN.haiLong * (me.path === 'duchanh' ? 2 : 1) + Math.floor(me.stats.duc / 10);
      me.haiLong = Math.min(100, me.haiLong + h); taskDone('thinhan'); addPts(me, C.THINH_AN.pts);
      toast(me, `Thái hậu hài lòng (+${h}). Công trạng +${C.THINH_AN.pts}.`, 'good');
      const s = sockOf(me.id); if (s) s.emit('npcSay', { who: 'Thái hậu', text: pick(['Đứng lên đi. Hậu cung yên ổn là nhờ các con biết giữ bổn phận.', 'Ai gia nghe nói dạo này con chăm chỉ lắm. Tốt.', 'Trong cung nhiều chuyện, con nên cẩn thận lời ăn tiếng nói.']) });
    } else if (a === 'luyen') {
      if (!useTurn(1)) return;
      const q = Math.max(0, Math.min(1, +d.q || 0)), tai = C.HT.tai.includes(d.tai) ? d.tai : 'múa';
      me.stats.tai += 1 + (q > .8 ? 1 : 0) + (me.path === 'tainghe' ? 1 : 0);
      const pts = Math.round(C.ACTIONS.luyen.pts * (0.5 + q) * (me.path === 'tainghe' ? 1.5 : 1));
      taskDone('luyen'); addPts(me, pts); if (q > .8) me.silver += 10;
      toast(me, `${q > .8 ? 'Xuất sắc! ' : q > .5 ? '' : 'Còn vụng… '}Luyện ${tai === 'đàn' ? 'đàn tranh' : tai === 'thơ' ? 'ngâm thơ' : 'múa quạt'} xong. Công trạng +${pts}${q > .8 ? ', thưởng 10 bạc' : ''}.`, 'good');
    } else if (a === 'dangcanh') {
      if (me.loc !== 'duongtam') return toast(me, 'Phải đến Dưỡng Tâm điện mới dâng canh được.');
      if (!useTurn(1, C.ACTIONS.dangcanh.silver)) return;
      const q = Math.max(0, Math.min(1, +d.q || 0)), soup = +d.soup, fav = soup === ht().canh;
      const sung = 2 + Math.round(4 * q) + (fav ? 6 : 0);
      me.sung += sung; addPts(me, C.ACTIONS.dangcanh.pts);
      const name = C.HT.canh[soup] || 'canh';
      const line = fav ? `Đúng món trẫm đang thèm! ${name} hôm nay rất vừa ý.` : q > .7 ? `${name} nấu khéo lắm.` : q > .4 ? `Cũng được.` : `Canh hơi ${pick(['mặn', 'nhạt', 'nguội'])}…`;
      const s = sockOf(me.id); if (s) s.emit('npcSay', { who: 'Hoàng thượng', text: line });
      toast(me, `Dâng ${name}. Sủng ái +${sung}.`, fav || q > .7 ? 'good' : 'info');
    } else if (a === 'dotin') {
      if (me.loc !== 'hoavien') return toast(me, 'Phải ra Ngự hoa viên mới dò tin được.');
      if (!useTurn(1)) return;
      taskDone('dotin'); addPts(me, C.ACTIONS.dotin.pts);
      const open = Object.values(DB.state.cases).find(c => c.victim === me.id && c.status === 'open');
      let text;
      const hk = htKnown(me), unknown = ['canh', 'mau', 'tai', 'mood'].filter(x => !hk.keys.includes(x));
      if (unknown.length && (!open || Math.random() < 0.6)) {
        const key = pick(unknown); hk.keys.push(key); const h = ht();
        text = key === 'canh' ? `Ngự thiện phòng xì xào: hôm nay Hoàng thượng thèm ${C.HT.canh[h.canh]}.` : key === 'mau' ? `Thái giám hầu cận buột miệng: hôm nay Hoàng thượng để mắt tới người mặc màu ${C.HT.mau[h.mau]}.` : key === 'tai' ? `Nghe nói hôm nay Hoàng thượng muốn thưởng thức ${C.HT.tai[h.tai] === 'thơ' ? 'ngâm thơ' : C.HT.tai[h.tai] === 'đàn' ? 'tiếng đàn' : 'điệu múa'}.` : `Cung nữ Dưỡng Tâm điện kể hôm nay Hoàng thượng có vẻ ${C.HT.mood[h.mood]}.`;
      } else if (open && Math.random() < 0.5) {
        const g = open.suspects.find(s => s.guilty); const k = pick(['cung', 'gio', 'dau']);
        text = `Nghe lỏm được: kẻ hại bổn cung có ${C.TRAITS[k][g.traits[k]]}.`;
        open.found.push({ kind: 'dotin' + open.found.length, name: 'Tin đồn ở Ngự hoa viên', text, trait: k, value: g.traits[k] });
      } else {
        const others = Object.values(DB.players).filter(q => q.id !== me.id);
        const q = others.length ? pick(others) : null;
        text = q ? pick([`Nghe nói ${q.name} đang được sủng ái ${q.sung >= me.sung ? 'hơn' : 'kém'} bổn cung.`, `Nghe nói ${q.name} đang được sủng ái ${q.sung >= me.sung ? 'hơn' : 'kém'} bổn cung.`, `Có người thấy ${q.name} hay lui tới Từ Ninh cung, Thái hậu hài lòng ${q.haiLong >= 50 ? 'lắm' : 'chưa nhiều'}.`, `Cung nữ đồn ${q.name} còn ${q.silver > 400 ? 'nhiều' : 'ít'} bạc.`]) : 'Ngự hoa viên hôm nay yên ắng, chưa nghe được gì.';
      }
      toast(me, text, 'info');
    } else if (a === 'tangqua') {
      const t = P(d.target); if (!t || t.id === me.id) return toast(me, 'Chọn người để tặng quà.', 'bad');
      if (!useTurn(1, C.ACTIONS.tangqua.silver)) return;
      me.rel = me.rel || {}; me.rel[t.id] = (me.rel[t.id] || 0) + (me.path === 'giaote' ? 2 : 1);
      t.rel = t.rel || {}; t.rel[me.id] = (t.rel[me.id] || 0) + 1;
      addPts(me, C.ACTIONS.tangqua.pts);
      toast(me, `Đã tặng quà cho ${t.name}.`, 'good'); toast(t, `${title(me)} gửi tặng bổn cung một ${pick(['hộp trà Long Tỉnh', 'cây trâm ngọc', 'tấm lụa Tô Châu', 'hộp bánh hoa quế'])}.`, 'good'); push(t);
    } else if (a === 'ratay') {
      if (me.rank < C.FIGHT_RANK) return toast(me, `Từ ${C.RANKS[C.FIGHT_RANK].name} mới được ra tay.`, 'bad');
      const t = P(d.target);
      if (!t || t.id === me.id || t.lanh || t.rank < C.FIGHT_RANK) return toast(me, `Chỉ nhắm được người từ ${C.RANKS[C.FIGHT_RANK].name} trở lên.`, 'bad');
      if ((me.attacks || 0) >= C.ATTACK_PER_DAY) return toast(me, 'Hôm nay đã ra tay đủ số lần.', 'bad');
      if ((t.targeted || 0) >= C.TARGETED_PER_DAY || (t.protectUntil || 0) > now()) return toast(me, 'Người này đang được bảo hộ, chưa thể ra tay.', 'bad');
      if (Object.values(DB.state.cases).some(c => c.victim === t.id && c.status === 'open')) return toast(me, 'Người này đang dính một vụ án khác.', 'bad');
      const cost = C.ACTIONS.ratay.silver - (me.path === 'muuke' ? 40 : 0) + (d.blur ? 100 : 0);
      if (!useTurn(1, cost)) return;
      freshDay(t); me.attacks = (me.attacks || 0) + 1; t.targeted = (t.targeted || 0) + 1;
      createCase(t, me, { method: d.method, blur: !!d.blur });
      toast(me, `Đã cài ${C.METHODS.find(m => m.id === d.method)?.name || 'tang vật'} vào phòng ${t.name}. Giờ chỉ chờ xem…`, 'good');
    } else if (a === 'shop') {
      const it = String(d.item || '');
      if (C.SHOP[it]) {
        const S = C.SHOP[it]; if (me.silver < S.price) return toast(me, 'Không đủ bạc.', 'bad');
        if (it === 'sam') { if (me.samToday) return toast(me, 'Hôm nay đã dùng nhân sâm rồi.'); me.samToday = true; me.turns += 1; }
        if (it === 'huong') { if (me.huong) return toast(me, 'Đã có hương rồi, chờ lần lật thẻ tới.'); me.huong = true; }
        if (it === 'le') me.haiLong = Math.min(100, me.haiLong + 8);
        me.silver -= S.price; toast(me, `Đã mua ${S.name}.`, 'good');
      } else if (C.DECOR_PRICE[it]) {
        me.decorOwned = me.decorOwned || []; if (me.decorOwned.includes(it)) return toast(me, 'Đã có món này.');
        if (me.silver < C.DECOR_PRICE[it]) return toast(me, 'Không đủ bạc.', 'bad');
        me.silver -= C.DECOR_PRICE[it]; me.decorOwned.push(it); toast(me, 'Nội vụ phủ đã đưa đồ tới phòng.', 'good');
      } else return;
    } else if (a === 'thuongcn') {
      if (me.loc !== 'phong') return toast(me, 'Về phòng riêng mới ban thưởng được.');
      if (me.cnDay === dayKey()) return toast(me, 'Hôm nay đã ban thưởng rồi.');
      if (me.silver < 20) return toast(me, 'Không đủ bạc.', 'bad');
      me.silver -= 20; me.cnDay = dayKey(); me.loyal = Math.min(100, (me.loyal ?? 50) + 10);
      toast(me, `Cung nữ cảm động rơi nước mắt. Trung thành ${me.loyal}/100.`, 'good');
    } else if (a === 'yentiec') {
      const f = DB.state.feast; if (!f || f.done || now() > f.end) return toast(me, 'Hiện không có yến tiệc.');
      if (me.loc !== 'yentiec') return toast(me, 'Vào yến tiệc mới dâng tiết mục được.');
      if (f.entries[me.id]) return toast(me, 'Bổn cung đã dâng tiết mục rồi.');
      const q = Math.max(0, Math.min(1, +d.q || 0)), tai = C.HT.tai.includes(d.tai) ? d.tai : 'múa';
      f.entries[me.id] = { name: title(me), q, tai, color: colorMatch(me) };
      addPts(me, 5); toast(me, `Đã dâng tiết mục ${tai}. Chờ Hoàng thượng ban thưởng khi tiệc tàn.`, 'good');
      io.emit('feastUpdate', feastView());
    } else if (a === 'phephi') {
      if (!me.lanh) return; if (me.phephiToday) return toast(me, 'Phế phi đã ngủ thiếp đi, mai hãy hỏi.');
      me.phephiToday = true; const s = sockOf(me.id);
      const c = me.lanh.caseId && DB.state.cases[me.lanh.caseId];
      let text;
      if (c) { const g = c.suspects.find(x => x.guilty); const miss = ['cung', 'gio', 'dau'].filter(k => !c.found.some(f => f.trait === k && f.value !== null)); const k = miss.length ? pick(miss) : pick(['cung', 'gio', 'dau']);
        text = `Ta ở đây đã mười năm, chuyện gì trong cung cũng nghe được. Kẻ hại ngươi có ${C.TRAITS[k][g.traits[k]]}. Nhớ lấy, rồi kêu oan cho đúng người.`;
        if (!c.found.some(f => f.kind === 'phephi')) c.found.push({ kind: 'phephi', name: 'Lời phế phi', text: `Phế phi kể kẻ hãm hại có ${C.TRAITS[k][g.traits[k]]}.`, trait: k, value: g.traits[k] });
      } else {
        const atk = Object.values(DB.state.cases).filter(x => !x.npc && x.culprit !== me.id).sort((a, b) => b.created - a.created)[0];
        text = atk ? `Ngươi có biết ${atk.victimName} từng bị hãm hại không? Ta nghe kẻ đứng sau là ${atk.culpritName}. Trong cung, kẻ thù của kẻ thù có khi là bạn.` : 'Lãnh cung lạnh lắm… nhưng ai rồi cũng có ngày ra. Chớ để mất ý chí.';
      }
      if (s) s.emit('npcSay', { who: 'Phế phi Trần thị', text, long: true });
    } else if (a === 'httalk') {
      if (me.loc !== 'tamcung' || !(me.tamCungUntil > now())) return;
      if (me.htTalked === me.tamCungUntil) return toast(me, 'Đêm nay đã hầu chuyện Hoàng thượng rồi.');
      const ans = Array.isArray(d.ans) ? d.ans.slice(0, 3) : []; const mood = ht().mood; let sc = 0;
      HT_TALK.forEach((q, i) => { const o = q.opts[+ans[i]]; if (o) sc += o.s[mood]; });
      me.htTalked = me.tamCungUntil; const sung = Math.max(0, sc * 2); me.sung += sung; addPts(me, 5 + sc);
      const s = sockOf(me.id); if (s) s.emit('htTalkResult', { sung, score: sc, line: sc >= 5 ? 'Có nàng ở bên, trẫm thấy lòng nhẹ hẳn.' : sc >= 2 ? 'Nàng thật biết điều.' : 'Trẫm hơi mệt, nàng lui về nghỉ sớm đi.' });
    } else if (a === 'lanh') {
      if (!me.lanh) return;
      if (me.lanhToday) return toast(me, 'Hôm nay đã làm xong việc ở lãnh cung.');
      if ((+d.q || 0) < .4) return toast(me, 'Làm chưa đạt, lão ma ma bắt làm lại.', 'bad');
      me.lanhToday = true; me.lanh.tasks++;
      toast(me, `${pick(['Chép xong một quyển kinh', 'Quét sạch sân lãnh cung', 'Vá xong áo cho các phế phi'])}. Tiến độ phục vị ${me.lanh.tasks}/3.`, 'good');
      if (me.lanh.tasks >= 3) phucVi(me, 2, 'nhờ thành tâm hối lỗi');
    } else return;
    save(); push(me);
  });
  sock.on('case', d => { if (me) caseOp(me, d); });
  sock.on('refresh', () => { if (me) push(me); });
  sock.on('htTalkQ', () => { if (me) sock.emit('htTalkQ', { mood: C.HT.mood[ht().mood], qs: HT_TALK.map(q => ({ q: q.q, opts: q.opts.map(o => o.t) })) }); });
  sock.on('witnessAnswer', d => {
    if (!me || !d) return; const c = DB.state.cases[d.caseId]; if (!c || !c.witnessReq || c.witnessReq.who !== me.id) return;
    if (d.refuse) { const v = P(c.victim); c.witnessReq = null; if (v) { v.turns += 1; toast(v, `${me.name} từ chối làm chứng. Đã trả lại 1 lượt.`, 'bad'); push(v); const s = sockOf(v.id); if (s) s.emit('caseDetail', { ...caseView(c, v), table: suspectTraitText(c) }); } save(); return; }
    const val = +d.value; if (!(val >= 0 && val < C.TRAITS[c.witnessReq.trait].length)) return;
    setWitness(c, val, false); addPts(me, 3); push(me); toast(me, 'Đã khai xong, được thêm 3 công trạng.', 'good');
  });
  sock.on('caseDetail', id => { if (!me) return; const c = DB.state.cases[id]; if (c && c.victim === me.id) sock.emit('caseDetail', { ...caseView(c, me), table: suspectTraitText(c), reopen: !!(me.lanh && me.lanh.caseId === id) }); });
  sock.on('wardrobe', o => {
    if (!me || !allowedOutfits(me).includes(o)) return;
    if (me.loc !== 'phong') return toast(me, 'Về phòng riêng mới thay đồ được.');
    if (me.lanh && o !== 'tunu') return;
    me.outfit = o; push(me); sock.to(roomOf(me)).emit('poutfit', { id: me.id, outfit: o }); save();
  });
  sock.on('decor', list => {
    if (!me || !Array.isArray(list)) return;
    const ITEMS = ['binhphong', 'banTra', 'ghedon', 'chaucay', 'denlong', 'binhsu', 'giuong', 'tham', 'luhuong'];
    me.decor = list.slice(0, 24).filter(i => ITEMS.includes(i.item) && (!C.DECOR_PRICE[i.item] || (me.decorOwned || []).includes(i.item))).map(i => ({ item: i.item, x: +i.x || 0, z: +i.z || 0, ry: +i.ry || 0 }));
    save(); toast(me, 'Đã lưu cách bài trí.', 'good');
  });
  sock.on('roster', () => {
    if (!me) return;
    const list = Object.values(DB.players).map(p => ({ id: p.id, name: p.name + (p.sick ? ' (cáo bệnh)' : '') + ((p.camTucUntil || 0) > now() ? ' (cấm túc)' : ''), rank: p.rank, rankName: rankName(p), online: online.has(p.id), sung: p.sung, canTarget: !p.lanh && p.rank >= C.FIGHT_RANK && !((p.protectUntil || 0) > now()) }));
    list.sort((a, b) => b.rank - a.rank || b.sung - a.sung);
    const seats = C.RANKS.map((r, i) => ({ name: r.name, seats: r.seats, used: seatCount(i) }));
    sock.emit('roster', { list, seats, methods: C.METHODS });
  });
  sock.on('disconnect', () => {
    if (!me) return;
    if (online.get(me.id) === sock) { freeSeat(me); online.delete(me.id); sock.to(roomOf(me)).emit('pleave', me.id); }
    me.lastSeen = now(); save();
  });
});

function admin(p, text) {
  const [cmd, arg, ...rest] = text.split(/\s+/);
  if (cmd === '/latthe') latThe(arg ? 'Trưa nay' : 'Đêm nay');
  else if (cmd === '/yentiec') { if (DB.state.feast && !DB.state.feast.done) endFeast(); else startFeast(+arg || 3, (rest[0] || '') === 'trong' ? 'in' : 'out'); }
  else if (cmd === '/diemcho') {
    const who = rest.join(' ').toLowerCase(); const q = Object.values(DB.players).find(x => x.name.toLowerCase() === who || x.user === who);
    if (!q) return toast(p, 'Không tìm thấy người tên ' + who, 'bad'); addPts(q, +arg || 100); push(q);
  }
  else if (cmd === '/diem') addPts(p, +arg || 100);
  else if (cmd === '/bac') { p.silver += +arg || 500; }
  else if (cmd === '/ngay') { for (const q of Object.values(DB.players)) { q.day = ''; freshDay(q); push(q); } }
  else if (cmd === '/vuan') createCase(p, null, { hours: +arg || C.CASE_HOURS });
  else if (cmd === '/hethan') { for (const c of Object.values(DB.state.cases)) if (c.victim === p.id && c.status === 'open') c.deadline = 0; checkDeadlines(); }
  else if (cmd === '/lanhcung') sendToLanhCung(p, 'thử nghiệm', null);
  else if (cmd === '/rakhoi') { // quản trị: đưa mình (hoặc người khác) ra khỏi lãnh cung, giữ nguyên cấp cũ
    const who = [arg, ...rest].filter(Boolean).join(' ').toLowerCase(); const q = who ? Object.values(DB.players).find(x => x.name.toLowerCase() === who || x.user === who) : p;
    if (!q || !q.lanh) return toast(p, 'Người này không ở lãnh cung.');
    q.rank = Math.max(q.rank, q.lanh.from || 0); q.lanh = null; q.outfit = C.RANKS[q.rank].outfit; q.trend = null;
    const sk = sockOf(q.id); if (sk) enter(q, 'hoavien', sk); push(q); save(); toast(p, `Đã đưa ${q.name} ra khỏi lãnh cung.`, 'good');
  }
  else return toast(p, 'Lệnh: /latthe [trua] /yentiec [phút] /diem N /diemcho N tên /bac N /ngay /vuan /hethan /lanhcung /rakhoi [tên]');
  toast(p, 'Đã chạy ' + cmd); push(p); save();
}

// ---------- bảng xếp hạng top 5 ----------
function top5() {
  const H = 24 * 3600e3;
  return Object.values(DB.players).filter(p => !p.lanh)
    .sort((a, b) => b.rank - a.rank || b.pts - a.pts || b.sung - a.sung)
    .slice(0, 5)
    .map(p => ({ id: p.id, name: p.name + (p.sick ? ' 🤒' : ''), rankName: C.RANKS[p.rank].name, pts: p.pts, online: online.has(p.id), trend: p.trend && now() - p.trend.t < H ? p.trend.dir : 0 }));
}
let lastTop = '';
setInterval(() => { const t = JSON.stringify(top5()); if (t !== lastTop) { lastTop = t; io.emit('top5', JSON.parse(t)); } }, 2000);
io.on('connection', s => s.emit('top5', top5()));

const PORT = process.env.PORT || 3000;
loadDB().then(() => {
  setInterval(nightTick, 5e3);
  server.listen(PORT, () => console.log('MỘNG PHƯỢNG HOÀNG chạy ở cổng ' + PORT));
}).catch(e => { console.error(e); process.exit(1); });
