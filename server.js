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

function freshDay(p) {
  const k = dayKey();
  if (p.day === k) return;
  p.day = k;
  p.turns = C.TURNS_PER_DAY + (p.path === 'giaote' ? 1 : 0);
  p.thinhAn = false;
  p.attacks = 0; p.targeted = 0;
  p.tasks = { thinhan: false, luyen: false, dotin: false };
  p.taskBonus = false;
  p.lanhToday = false;
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
    pts: p.pts, nextPts: C.RANKS[p.rank + 1]?.pts ?? null, silver: p.silver, turns: p.turns, sung: p.sung, haiLong: p.haiLong,
    stats: p.stats, tasks: p.tasks, thinhAn: p.thinhAn, waiting: p.waiting || false, lanh: p.lanh || null,
    outfits: allowedOutfits(p), decor: p.decor || [], hasPalace: p.rank >= C.PALACE_RANK, cases: open,
    protectedUntil: p.protectUntil || 0, admin: !!p.admin, canFight: !p.lanh && p.rank >= C.FIGHT_RANK,
    attacksLeft: C.ATTACK_PER_DAY - (p.attacks || 0), latThe: (p.tamCungUntil || 0) > now(),
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
  p.lanh = { from: p.rank, tasks: 0, caseId: caseId || null, since: now() };
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
    status: 'open', created: now(), deadline: now() + (opts.hours ?? C.CASE_HOURS) * 3600e3, npc: !culprit,
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
    found: c.found, witness: c.witness, traitNames: C.TRAITS,
  };
}
function revealClue(c, kind, p) {
  const clue = C.CLUES[kind];
  const trait = kind === 'thaiy' ? 'dau' : clue.trait;
  const guilty = c.suspects.find(s => s.guilty);
  if (c.blurred === trait && kind !== 'thaiy') {
    c.found.push({ kind, name: clue.name, text: `${clue.text}… nhưng dấu vết đã bị xóa sạch, không thấy gì rõ ràng.`, trait, value: null });
    return;
  }
  const value = guilty.traits[trait];
  const word = C.TRAITS[trait][value];
  c.found.push({ kind, name: clue.name, text: `${clue.text} ${word}.`, trait, value });
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
    const freeMuu = p.path === 'muuke' && !c.muuFree;
    if (!freeMuu) {
      if (p.turns < clue.turn) return toast(p, 'Hết lượt hôm nay.', 'bad');
      if (p.silver < clue.cost) return toast(p, 'Không đủ bạc.', 'bad');
      p.turns -= clue.turn; p.silver -= clue.cost;
    } else c.muuFree = true;
    revealClue(c, data.kind, p);
    toast(p, freeMuu ? 'Nhờ mưu kế, manh mối này không tốn gì.' : 'Đã có thêm manh mối.', 'good');
  } else if (op === 'witness') {
    if (c.witness) return toast(p, 'Đã có người làm chứng.');
    const w = P(data.who); if (!w || w.id === p.id) return toast(p, 'Chọn người làm chứng khác.', 'bad');
    if (p.turns < 1) return toast(p, 'Hết lượt hôm nay.', 'bad');
    p.turns -= 1;
    const guilty = c.suspects.find(s => s.guilty);
    const trait = pick(['cung', 'gio', 'dau']);
    let value = guilty.traits[trait];
    if (w.id === c.culprit) value = (value + 1) % C.TRAITS[trait].length; // thủ phạm khai sai
    c.witness = { who: w.id, name: title(w), text: `${w.name} khai: hôm ấy thấy một người có ${C.TRAITS[trait][value]} lảng vảng gần phòng.`, trait, value };
    toast(w, `${p.name} nhờ bổn cung làm chứng trong vụ ${c.methodName}.`);
  } else if (op === 'confess') {
    if (isReopen) return;
    closeCase(c, 'nhantoi', `${p.name} nhận tội, được giảm nhẹ: giáng một bậc.`);
    if (p.rank > 0) demote(p, 1, 'nhận tội ' + c.crime); else push(p);
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
function checkDeadlines() {
  for (const c of Object.values(DB.state.cases)) {
    if (c.status === 'open' && now() > c.deadline) {
      closeCase(c, 'xu', `Hết hạn mà không tìm ra thủ phạm. Thái hậu phán phạt.`);
      news(`Hết hạn điều tra, Thái hậu phán ${P(c.victim)?.name} có tội ${c.crime}.`, 'phat');
      punishVictim(c, 0);
    }
  }
}

// ---------------- lật thẻ ----------------
function latThe() {
  const pool = Object.values(DB.players).filter(p => !p.lanh && p.rank >= 1 && (online.has(p.id) || now() - (p.lastSeen || p.created || 0) < 3 * 864e5));
  if (!pool.length) return null;
  const w = pool.map(p => {
    let m = 1;
    if (p.picked1 === 1) m = 0.4; if (p.picked1 >= 2) m = 0.15;
    if ((p.notPicked || 0) >= 5) m = 1.5;
    return Math.max(0.05, (10 + p.sung + p.stats.tai * 0.5) * m);
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0), chosen = pool[0];
  for (let i = 0; i < pool.length; i++) { r -= w.at(i); if (r <= 0) { chosen = pool.at(i); break; } }
  const longAbsent = (chosen.notPicked || 0) >= 5;
  for (const p of pool) { if (p === chosen) { p.picked1 = (p.picked1 || 0) + 1; p.notPicked = 0; } else { p.picked1 = 0; p.notPicked = (p.notPicked || 0) + 1; } }
  chosen.sung += C.LAT_THE.sung;
  chosen.tamCungUntil = now() + 3 * 3600e3;
  news(longAbsent ? `Hoàng thượng chợt nhớ người cũ: đêm nay lật thẻ bài của ${title(chosen)}.` : `Đêm nay Hoàng thượng lật thẻ bài của ${title(chosen)}.`, 'latthe');
  io.emit('latthe', { id: chosen.id, name: title(chosen) });
  addPts(chosen, C.LAT_THE.pts);
  push(chosen); save();
  return chosen;
}
function nightTick() {
  const v = vnNow();
  const k = dayKey();
  if (v.getUTCHours() >= C.NIGHT_HOUR && DB.state.lastNight !== k) { DB.state.lastNight = k; latThe(); }
  // vắng mặt: từ Tần trở lên
  for (const p of Object.values(DB.players)) {
    if (p.lanh || p.rank < C.PALACE_RANK) continue;
    const days = (now() - (p.lastSeen || now())) / 864e5;
    if (days >= C.ABSENT_LOSE_DAYS && !online.has(p.id)) { const r = p.rank; p.rank = C.FIGHT_RANK - 1; p.trend = { dir: -1, t: now() }; p.outfit = C.RANKS[p.rank].outfit; news(`${p.name} vắng mặt quá lâu, nhường ghế ${C.RANKS[r].name}.`); freeSeatCheck(); }
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
const LOCS = ['tuninh', 'hoavien', 'duongtam', 'phong', 'tamcung', 'lanhcung'];
function roomOf(p) { return p.loc === 'phong' ? 'phong:' + p.id : p.loc; }
function enter(p, loc, sock) {
  const old = roomOf(p);
  sock.leave(old); sock.to(old).emit('pleave', p.id);
  p.loc = loc; p.x = 0; p.z = loc === 'tuninh' ? 3.5 : 2; p.ry = Math.PI; p.anim = 'dung_cho';
  const room = roomOf(p);
  sock.join(room);
  const others = [...online.keys()].map(P).filter(q => q && q.id !== p.id && roomOf(q) === room).map(publicView);
  sock.emit('scene', { loc, players: others });
  sock.to(room).emit('pjoin', publicView(p));
}

// ---------------- kết nối ----------------
io.on('connection', sock => {
  let me = null;
  const ok = p => {
    if (online.has(p.id)) { try { online.get(p.id).emit('kicked'); online.get(p.id).disconnect(); } catch (e) {} }
    me = p; online.set(p.id, sock); p.lastSeen = now(); freshDay(p);
    if (!p.token) p.token = crypto.randomBytes(16).toString('hex');
    sock.emit('auth', { token: p.token });
    sock.emit('newsAll', DB.state.news.slice(0, 30));
    push(p);
    const back = p.lanh ? 'lanhcung' : (p.loc === 'tamcung' && p.tamCungUntil > now() ? 'tamcung' : (p.loc && p.loc !== 'tamcung' ? p.loc : 'hoavien'));
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
    if (loc === 'tamcung') me.outfit = 'aongu';
    else if (me.outfit === 'aongu' && loc !== 'phong') me.outfit = me.lanh ? 'tunu' : C.RANKS[me.rank].outfit;
    enter(me, loc, sock); push(me);
  });
  sock.on('move', d => {
    if (!me) return;
    me.x = +d.x || 0; me.z = +d.z || 0; me.ry = +d.ry || 0; me.anim = String(d.anim || 'dung_cho').slice(0, 20);
    sock.to(roomOf(me)).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: me.anim });
  });
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
    if (me.lanh && !['lanh', 'tangqua'].includes(a)) return toast(me, 'Ở lãnh cung chỉ có thể làm nhiệm vụ lãnh cung.', 'bad');
    const useTurn = (n, silver = 0) => {
      if (me.turns < n) { toast(me, 'Hết lượt hôm nay. Mai quay lại nhé.', 'bad'); return false; }
      if (me.silver < silver) { toast(me, 'Không đủ bạc.', 'bad'); return false; }
      me.turns -= n; me.silver -= silver; return true;
    };
    const taskDone = k => {
      if (me.tasks[k] === false) { me.tasks[k] = true; }
      if (!me.taskBonus && Object.values(me.tasks).every(Boolean)) { me.taskBonus = true; addPts(me, 15); toast(me, 'Hoàn thành nhiệm vụ hằng ngày: +15 công trạng.', 'good'); }
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
      const k = pick(['tai', 'tai', 'duc', 'giao', 'muu']); me.stats[k] += 1 + (me.path === 'tainghe' && k === 'tai' ? 1 : 0);
      const pts = Math.round(C.ACTIONS.luyen.pts * (me.path === 'tainghe' ? 1.5 : 1));
      taskDone('luyen'); addPts(me, pts);
      toast(me, `Luyện ${pick(['đàn tranh', 'thư pháp', 'múa quạt', 'thêu thùa', 'ngâm thơ'])} xong. Công trạng +${pts}.`, 'good');
    } else if (a === 'dangcanh') {
      if (me.loc !== 'duongtam') return toast(me, 'Phải đến Dưỡng Tâm điện mới dâng canh được.');
      if (!useTurn(1, C.ACTIONS.dangcanh.silver)) return;
      me.sung += C.ACTIONS.dangcanh.sung; addPts(me, C.ACTIONS.dangcanh.pts);
      toast(me, `Hoàng thượng dùng canh, khen ngon. Sủng ái +${C.ACTIONS.dangcanh.sung}.`, 'good');
    } else if (a === 'dotin') {
      if (me.loc !== 'hoavien') return toast(me, 'Phải ra Ngự hoa viên mới dò tin được.');
      if (!useTurn(1)) return;
      taskDone('dotin'); addPts(me, C.ACTIONS.dotin.pts);
      const open = Object.values(DB.state.cases).find(c => c.victim === me.id && c.status === 'open');
      let text;
      if (open && Math.random() < 0.5) {
        const g = open.suspects.find(s => s.guilty); const k = pick(['cung', 'gio', 'dau']);
        text = `Nghe lỏm được: kẻ hại bổn cung có ${C.TRAITS[k][g.traits[k]]}.`;
        open.found.push({ kind: 'dotin' + open.found.length, name: 'Tin đồn ở Ngự hoa viên', text, trait: k, value: g.traits[k] });
      } else {
        const others = Object.values(DB.players).filter(q => q.id !== me.id);
        const q = others.length ? pick(others) : null;
        text = q ? pick([`Nghe nói ${q.name} đang được sủng ái ${q.sung >= me.sung ? 'hơn' : 'kém'} bổn cung.`, `Có người thấy ${q.name} hay lui tới Từ Ninh cung, Thái hậu hài lòng ${q.haiLong >= 50 ? 'lắm' : 'chưa nhiều'}.`, `Cung nữ đồn ${q.name} còn ${q.silver > 400 ? 'nhiều' : 'ít'} bạc.`]) : 'Ngự hoa viên hôm nay yên ắng, chưa nghe được gì.';
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
    } else if (a === 'lanh') {
      if (!me.lanh) return;
      if (me.lanhToday) return toast(me, 'Hôm nay đã làm xong việc ở lãnh cung.');
      me.lanhToday = true; me.lanh.tasks++;
      toast(me, `${pick(['Chép xong một quyển kinh', 'Quét sạch sân lãnh cung', 'Vá xong áo cho các phế phi'])}. Tiến độ phục vị ${me.lanh.tasks}/3.`, 'good');
      if (me.lanh.tasks >= 3) phucVi(me, 2, 'nhờ thành tâm hối lỗi');
    } else return;
    save(); push(me);
  });
  sock.on('case', d => { if (me) caseOp(me, d); });
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
    me.decor = list.slice(0, 24).filter(i => ITEMS.includes(i.item)).map(i => ({ item: i.item, x: +i.x || 0, z: +i.z || 0, ry: +i.ry || 0 }));
    save(); toast(me, 'Đã lưu cách bài trí.', 'good');
  });
  sock.on('roster', () => {
    if (!me) return;
    const list = Object.values(DB.players).map(p => ({ id: p.id, name: p.name, rank: p.rank, rankName: rankName(p), online: online.has(p.id), sung: p.sung, canTarget: !p.lanh && p.rank >= C.FIGHT_RANK && !((p.protectUntil || 0) > now()) }));
    list.sort((a, b) => b.rank - a.rank || b.sung - a.sung);
    const seats = C.RANKS.map((r, i) => ({ name: r.name, seats: r.seats, used: seatCount(i) }));
    sock.emit('roster', { list, seats, methods: C.METHODS });
  });
  sock.on('disconnect', () => {
    if (!me) return;
    if (online.get(me.id) === sock) { online.delete(me.id); sock.to(roomOf(me)).emit('pleave', me.id); }
    me.lastSeen = now(); save();
  });
});

function admin(p, text) {
  const [cmd, arg, ...rest] = text.split(/\s+/);
  if (cmd === '/latthe') latThe();
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
  else return toast(p, 'Lệnh: /latthe /diem N /diemcho N tên /bac N /ngay /vuan /hethan /lanhcung');
  toast(p, 'Đã chạy ' + cmd); push(p); save();
}

// ---------- bảng xếp hạng top 5 ----------
function top5() {
  const H = 24 * 3600e3;
  return Object.values(DB.players).filter(p => !p.lanh)
    .sort((a, b) => b.rank - a.rank || b.pts - a.pts || b.sung - a.sung)
    .slice(0, 5)
    .map(p => ({ id: p.id, name: p.name, rankName: C.RANKS[p.rank].name, pts: p.pts, online: online.has(p.id), trend: p.trend && now() - p.trend.t < H ? p.trend.dir : 0 }));
}
let lastTop = '';
setInterval(() => { const t = JSON.stringify(top5()); if (t !== lastTop) { lastTop = t; io.emit('top5', JSON.parse(t)); } }, 2000);
io.on('connection', s => s.emit('top5', top5()));

const PORT = process.env.PORT || 3000;
loadDB().then(() => {
  setInterval(nightTick, 30e3);
  server.listen(PORT, () => console.log('MỘNG PHƯỢNG HOÀNG chạy ở cổng ' + PORT));
}).catch(e => { console.error(e); process.exit(1); });
