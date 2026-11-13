// PHƯỢNG KHỞI THÂM CUNG – máy chủ game
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const C = require('./config');

// Link cũ: nếu đặt biến REDIRECT_TO thì service này chỉ chuyển người chơi sang link mới, không chạy game
// (không đụng tới MongoDB, tránh 2 máy chủ cùng ghi đè dữ liệu)
if (process.env.REDIRECT_TO) {
  const to = process.env.REDIRECT_TO.replace(/\/+$/, '');
  http.createServer((req, res) => {
    if (req.url === '/health') { res.end('ok'); return; }
    res.writeHead(302, { Location: to + req.url, 'Cache-Control': 'no-store' }); res.end();
  }).listen(process.env.PORT || 3000, () => console.log('Link cũ: chuyển hướng sang ' + to));
  return;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 25000, pingTimeout: 30000, maxHttpBufferSize: 1e5 });
app.use(require('compression')({ threshold: 1024, filter: (req, res) => !/\.(glb|png|jpg|webp|mp3|ogg)$/i.test(req.path) }));
app.get('/ping', (req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Cache-Control', 'no-store'); res.send('ok'); });
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d', setHeaders: (res, f) => { if (/\.(js|html|css|json)$/.test(f)) res.setHeader('Cache-Control', 'no-cache'); } })); // mô hình, ảnh, nhạc: trình duyệt giữ 1 ngày
app.get('/health', (_, res) => res.send('ok'));
app.get('/api/stats', (req, res) => {
  const a = Object.values(DB.players).find(q => q.token && q.token === String(req.query.token || ''));
  if (!a || !a.admin) return res.status(403).json({ err: 'Chỉ quản trị xem được.' });
  res.json(statsReport());
});

// ---------------- lưu trữ: MongoDB nếu có, không thì file JSON ----------------
const DB = { players: {}, state: { news: [], cases: {}, lastNight: '', seq: 1 } };
let mongo = null, mongoDb = null;
async function loadDB() {
  if (process.env.MONGODB_URI) {
    const { MongoClient } = require('mongodb');
    // nén dữ liệu gửi lên MongoDB (zlib): mỗi lần lưu cả bản ghi game, nén lại để đỡ tốn băng thông Render
    const client = new MongoClient(process.env.MONGODB_URI, { compressors: ['zlib'], zlibCompressionLevel: 6 });
    await client.connect();
    mongoDb = client.db(process.env.MONGODB_DB || 'mongphuonghoang'); mongo = mongoDb.collection('save');
    const doc = await mongo.findOne({ _id: 'world' });
    if (doc) Object.assign(DB, doc.data);
    console.log('MongoDB connected');
  } else if (fs.existsSync(path.join(__dirname, 'data.json'))) {
    Object.assign(DB, JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8')));
  }
}
let saveTimer = null;
// gom vị trí người chơi trong từng khu, mỗi 100ms gửi một lô thay vì từng tin lẻ
const moveBuf = new Map();
setInterval(() => { for (const [rm, m] of moveBuf) { if (m.size) io.to(rm).emit('pmoves', [...m.values()]); } moveBuf.clear(); }, 100);
// dọn dữ liệu cũ để bản ghi không phình to theo thời gian
let hkAt = 0;
function housekeep() {
  if (now() - hkAt < 10 * 60e3) return; hkAt = now();
  for (const c of Object.values(DB.state.cases)) if (c.status !== 'open' && now() - (c.closedAt || c.deadline || c.created) > 3 * 864e5) delete DB.state.cases[c.id];
  for (const p of Object.values(DB.players)) { if (p.ttLog?.length > 30) p.ttLog = p.ttLog.slice(-30); }
  const kb = Math.round(JSON.stringify(DB).length / 1024); if (kb > 9000) console.warn(`⚠️ Dữ liệu game đã ${kb} KB, gần giới hạn 16 MB của MongoDB, cần tách bản ghi.`); else console.log(`dữ liệu game: ${kb} KB, ${Object.keys(DB.players).length} người chơi, ${online.size} online`);
}
// Render tắt máy chủ khi deploy/khởi động lại: ghi ngay dữ liệu chưa lưu rồi mới thoát
let closing = false;
async function flushAndExit() {
  if (closing) return; closing = true;
  clearTimeout(saveTimer); saveTimer = null;
  try {
    if (mongo) await mongo.updateOne({ _id: 'world' }, { $set: { data: DB } }, { upsert: true });
    else fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(DB));
    console.log('Đã lưu dữ liệu trước khi tắt');
  } catch (e) { console.error('save on exit failed', e.message); }
  process.exit(0);
}
process.on('SIGTERM', flushAndExit); process.on('SIGINT', flushAndExit);
function save() {
  if (closing) return;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      if (mongo) await mongo.updateOne({ _id: 'world' }, { $set: { data: DB } }, { upsert: true });
      else fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(DB));
    } catch (e) { console.error('save failed', e.message); }
  }, mongo ? 15000 : 1500); // gom thay đổi 15 giây mới ghi một lần (tắt máy chủ thì vẫn lưu ngay)
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
const isHH = p => !!p && !p.lanh && DB.state.hh?.id === p.id;
const rankName = p => p.lanh ? 'Phế phi (lãnh cung)' : isHH(p) ? 'Hoàng hậu' : C.RANKS[p.rank].name;
const yKey = () => new Date(vnNow().getTime() - 864e5).toISOString().slice(0, 10);
const weekIdx = () => Math.floor((Math.floor(vnNow().getTime() / 864e5) + 3) / 7); // tuần bắt đầu thứ Hai
const curEvent = () => (DB.state.evForce && C.EVENTS.find(e => e.id === DB.state.evForce)) || C.EVENTS[weekIdx() % C.EVENTS.length];
const evOn = id => curEvent().id === id;
const cnt = (p, k, n = 1) => { p.cnt = p.cnt || {}; p.cnt[k] = (p.cnt[k] || 0) + n; };
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
// ---------------- NPC có trí nhớ ----------------
const NPCS = { thaihau: 'Thái hậu', mama: 'Quế ma ma', thaiy: 'Thái y', tonggiam: 'Tổng quản Lý Đức Toàn' };
function rel(p, n) { p.rel = p.rel || {}; return p.rel[n] || 0; }
function relAdd(p, n, d, memo) {
  p.rel = p.rel || {}; p.rel[n] = Math.max(-100, Math.min(100, (p.rel[n] || 0) + d));
  if (memo) { p.relLog = p.relLog || {}; const L = (p.relLog[n] = p.relLog[n] || []); L.unshift({ t: now(), d, memo }); L.length = Math.min(L.length, 4); }
}
const caseHoursFor = (v, h) => h + (rel(v, 'mama') >= 30 ? 6 : rel(v, 'mama') <= -30 ? -6 : 0);
// tỷ muội
const GROUP_MAX = 4;
const grp = p => p.sis && DB.state.groups?.[p.sis];
const sisters = (a, b) => a.sis && a.sis === b.sis;
function groupView(g) { if (!g) return null; return { id: g.id, name: g.name, fund: g.fund, goal: g.goal, members: g.members.map(id => { const q = P(id); return q && { id, name: q.name, rankName: C.RANKS[q.rank].name, online: seenOn(id), loc: q.loc, lanh: !!q.lanh, camTuc: (q.camTucUntil || 0) > now() }; }).filter(Boolean) }; }
function pushGroup(g) { if (!g) return; for (const id of g.members) { const q = P(id); if (q) push(q); } }
function freshDay(p) {
  const k = dayKey();
  if (p.day === k) return;
  p.day = k;
  p.turns = Math.max(p.turns || 0, C.TURNS_PER_DAY + (p.path === 'giaote' ? 1 : 0)); p.turnAt = now();
  p.thinhAn = false;
  if (p.lanh) p.lanh.hp = Math.max(0, (p.lanh.hp ?? 70) - 20); // lãnh cung đói rét: mỗi ngày sức khỏe giảm
  p.attacks = 0; p.targeted = 0;
  p.tasks = { thinhan: false, luyen: false, dotin: false };
  p.taskBonus = false;
  p.lanhToday = false; p.samToday = false; p.phephiToday = false; p.fishN = 0; p.relDay = {}; p.cauTinhDay = null; p.thQ = null;
  p.silver += 20 + p.rank * 15;
  p.turns += Math.min(2, (p.children || []).length);
  if (now() - (p.created || 0) < C.NEWBIE_DAYS * 864e5) p.turns += 2;
  if (p.jewels?.includes('vongngoc')) p.sung += 2;
  p.hhDay = {};
  if (isHH(p)) { p.silver += C.HH_DAILY.silver; p.turns += C.HH_DAILY.turns; }
  // điểm danh liên tục
  p.streak = p.lastLogin === yKey() ? (p.streak || 0) + 1 : 1; p.lastLogin = k;
  const sd = ((p.streak - 1) % 7) + 1, gift = C.LOGIN_REWARD[sd - 1];
  p.silver += gift; if (sd === 7) { p.turns += 1; p.sung += 10; }
  p.cnt = p.cnt || {}; p.cnt.streakMax = Math.max(p.cnt.streakMax || 0, p.streak);
  setTimeout(() => toast(p, `📅 Điểm danh ngày ${sd}/7 (chuỗi ${p.streak} ngày): +${gift} bạc${sd === 7 ? ', +1 lượt, +10 sủng ái' : ''}.${sd < 7 ? ` Ngày 7 được ${C.LOGIN_REWARD[6]} bạc.` : ''}`, 'good'), 4000);
}
// mọi bộ đồ nữ trong game: tài khoản quản trị được thay thử tất cả (lệnh /thudo hoặc tủ đồ)
const ALL_OUTFITS = [...new Set([...C.RANKS.flatMap(r => [r.outfit, ...(r.extra || [])]), 'hoanghau', 'hoanghau2', 'phi_bau', 'aongu'])];
function allowedOutfits(p) {
  if (p.admin) return ALL_OUTFITS;
  const s = new Set(['aongu']); if (isHH(p)) { s.add('hoanghau'); s.add('hoanghau2'); }
  for (let r = 0; r <= p.rank; r++) { s.add(C.RANKS[r].outfit); for (const x of C.RANKS[r].extra || []) s.add(x); }
  return [...s];
}
function publicView(p) {
  return { id: p.id, name: p.name, rank: p.rank, rankName: rankName(p), outfit: p.outfit, loc: p.loc, x: p.x, z: p.z, ry: p.ry, anim: p.anim || 'dung_cho', male: false, tt: achName(p.titleSel, p), thai: !!p.thai?.known && !p.thai.test, kid: kidPub(p, true), hidden: DB.state.sinh?.id === p.id && p.loc === 'sansinh' };
}
function selfView(p) {
  const open = Object.values(DB.state.cases).filter(c => c.victim === p.id && c.status === 'open').map(c => caseView(c, p));
  return {
    ...publicView(p), path: p.path, pathName: C.PATHS[p.path].name, origin: C.ORIGINS[p.origin].name,
    mailUnread: (p.mail || []).filter(m => !m.read).length, pushOn: !!p.pushSubs?.length,
    created: p.created || 0, items: p.items || {}, pts: p.pts, nextPts: p.rank + 1 < C.RANKS.length ? RP(p, p.rank + 1) : null, silver: p.silver, turns: (regen(p), p.turns), turnCap: C.TURN_CAP, nextTurn: p.turns >= C.TURN_CAP ? null : p.turnAt + C.TURN_REGEN_MIN * 60e3, sung: p.sung, haiLong: p.haiLong,
    stats: p.stats, tasks: p.tasks, thinhAn: p.thinhAn, waiting: p.waiting || false, lanh: p.lanh || null, reborn: (p.rebornUntil || 0) > now() ? p.rebornUntil : 0, hhPhat: p.hhPhat && !p.hhPhat.used ? { kind: p.hhPhat.kind, by: P(p.hhPhat.by)?.name || '' } : null, hhStrike: p.hhStrike || 0, lanhVisit: p.lanhVisit === dayKey(),
    outfits: allowedOutfits(p), decor: p.decor || [], hasPalace: p.rank >= C.PALACE_RANK, cases: open,
    protectedUntil: p.protectUntil || 0, admin: !!p.admin, hamDay: p.hamDay === dayKey(), canFight: !p.lanh && p.rank >= C.FIGHT_RANK,
    rel: { thaihau: rel(p, 'thaihau'), mama: rel(p, 'mama'), thaiy: rel(p, 'thaiy'), tonggiam: rel(p, 'tonggiam') }, goldFish: p.goldFish || 0, fishN: p.fishN || 0, group: groupView(grp(p)), relDay: p.relDay || {},
    camTuc: (p.camTucUntil || 0) > now() ? p.camTucUntil : 0, loyal: p.loyal ?? 50, sick: !!p.sick,
    attacksLeft: C.ATTACK_PER_DAY - (p.attacks || 0), latThe: (p.tamCungUntil || 0) > now(),
    htKnown: htKnownView(p), decorOwned: p.decorOwned || [], huong: !!p.huong, feast: feastView(p), htTalked: p.htTalked === p.tamCungUntil && !!p.tamCungUntil,
    thai: p.thai?.known ? { due: p.thai.due, care: p.thai.care || 0, antai: p.thai.antai === dayKey() } : null, children: kidView(p), kidPub: kidPub(p), carry: p.carry || null, follow: p.follow || null, thaitu: DB.state.thaitu?.mother === p.id,
    isHH: isHH(p), hhDay: p.hhDay || {}, hhId: DB.state.hh?.id || null, thinhanHH: p.thinhanHH === dayKey(), hhUses: C.HH_USES, hhThinhan: C.HH_THINHAN, hhVote: hhVoteView(p), hhName: DB.state.hh ? P(DB.state.hh.id)?.name || null : null,
    event: { ...curEvent(), done: p.evDay === dayKey() }, streak: p.streak || 0, ach: achView(p), titleSel: p.titleSel || '',
    lying: !!p.lying, visit: p.visit || null, selfSick: !!(p.sick && p.sickUntil > now()), selfSickDay: p.selfSickDay === dayKey(),
    ccDay: p.ccDay?.d === dayKey() ? p.ccDay : {}, ccFeastOk: now() - (p.ccFeast || 0) >= 864e5,
    big: bigView(p), fest: festView(p), night: nightView(p), diary: (p.diary || []).slice(0, 30), tinvat: p.tinvat || {}, keoDay: p.keoDay === dayKey(),
    dish: p.dish ? { name: p.dish.name, q: p.dish.q, t: p.dish.t, dish: p.dish.dish } : null, cookN: p.cookDay?.d === dayKey() ? p.cookDay.n : 0,
    quest: questView(p), jewels: p.jewels || [], mcDay: p.mcDay === dayKey(),
    relDayMach: !!(p.relDay || {})['thaiy:mach'], vuaDay: p.vuaDay?.d === dayKey() ? { co: !!p.vuaDay.co, mai: !!p.vuaDay.mai, tho: !!p.vuaDay.tho, peek: !!p.vuaDay.peek } : {}, meal: inMeal(), detDay: p.detDay === dayKey(), detLeft: Math.max(0, C.DET_PER_DAY - (p.detN?.d === dayKey() ? p.detN.n : 0)),
  };
}
function push(p) { checkAch(p); checkQuest(p); const s = sockOf(p.id); if (s) s.emit('me', selfView(p)); }
function toast(p, text, kind = 'info') { const s = sockOf(p.id); if (s) s.emit('toast', { text, kind }); }
// chế độ thử của quản trị: mọi tin, thông báo sinh ra từ lệnh thử chỉ hiện cho quản trị
let MUTE = 0;
const seenOn = id => online.has(id) && !P(id)?.admin;
// tàng hình: quản trị đi đâu người chơi khác cũng không thấy nhân vật, cử chỉ, lời chat (/hien để hiện lại, /an để ẩn)
const stealth = p => !!p?.admin && !p.stealthOff;
function rTo(me, sock, incSelf) {
  if (!stealth(me)) return sock && !incSelf ? sock.to(roomOf(me)) : io.to(roomOf(me));
  return { emit: (ev, d) => { for (const [id, so] of online) { const q = P(id); if (!q || roomOf(q) !== roomOf(me)) continue; if (id === me.id ? incSelf : q.admin) so.emit(ev, d); } } };
} // quản trị online thì người khác không thấy chấm xanh
function quiet(on, fn) { if (!on) return fn(); MUTE++; try { return fn(); } finally { MUTE--; } }
const isAdm = id => !!P(id)?.admin;
function emitSplit(ev, pub, test) { if (!test) return io.emit(ev, pub); for (const [id, s] of online) s.emit(ev, isAdm(id) ? pub : null); }
function news(text, kind = 'tin') {
  if (MUTE) { for (const [id, s] of online) if (isAdm(id)) s.emit('toast', { text: '🧪 (thử, không đăng bảng tin) ' + text, kind: 'info' }); return; }
  const n = { t: now(), text, kind };
  DB.state.news.unshift(n); DB.state.news = DB.state.news.slice(0, 60);
  io.emit('news', n); save();
}
function seatCount(r) { return Object.values(DB.players).filter(p => !p.lanh && !p.admin && !isOwnerAcc(p) && p.rank === r).length + NPCF().filter(n => n.rank === r).length; }
// ---------------- phi tần NPC ----------------
function NPCF() { if (!DB.state.npcFei) DB.state.npcFei = C.NPC_FEI.map(n => ({ ...n }));
  // mốc công trạng từ Tần trở lên được nâng: kéo điểm NPC theo cùng tỉ lệ để việc vượt mặt giành ghế vẫn công bằng
  if (!DB.state.npcFeiV3) { DB.state.npcFeiV3 = 1; const OLD = { 5: 400, 6: 600, 7: 1300, 8: 2000 }; for (const n of DB.state.npcFei) if (OLD[n.rank]) n.pts = C.RANKS[n.rank].pts + Math.max(0, n.pts - OLD[n.rank]) * 2; }
  if (!DB.state.npcFeiV4) { DB.state.npcFeiV4 = 1; const V3 = { 1: 30, 2: 80, 3: 150, 4: 250, 5: 900, 6: 1600, 7: 2800, 8: 4500 }; for (const n of DB.state.npcFei) if (V3[n.rank] != null) n.pts = C.RANKS[n.rank].pts + Math.max(0, n.pts - V3[n.rank]); } if (!DB.state.npcFeiV2) { DB.state.npcFeiV2 = 1; for (const n of DB.state.npcFei) { const c = C.NPC_FEI.find(x => x.id === n.id); if (c) { n.tinh = c.tinh; n.short = c.short; } } } return DB.state.npcFei; }
const npcRank = n => C.RANKS[n.rank].name;
function npcDemote(n, why) { if (n.rank <= 1) return; n.rank--; n.pts = C.RANKS[n.rank].pts + rnd(30); n.name = n.name.split(' ')[0] + ' ' + npcRank(n); n.trend = { dir: -1, t: now() }; news(`📉 ${n.short} bị giáng xuống ${npcRank(n)}${why ? ' vì ' + why : ''}.`, 'phat'); }
function npcPromote(n) { const nx = C.RANKS[n.rank + 1]; if (!nx || n.pts < nx.pts) return; if (nx.seats && seatCount(n.rank + 1) >= nx.seats) return; n.rank++; n.name = n.name.split(' ')[0] + ' ' + npcRank(n); n.trend = { dir: 1, t: now() }; news(`Thánh chỉ: ${n.short} được tấn phong ${npcRank(n)}.`, 'phong'); }
// tính cách: kieu kiêu ngạo, xao xảo trá, hien hiền lành, danh đanh đá, ninh nịnh nọt, nhut nhút nhát
const FEI_TALK = {
  kieu: { khich: true, lines: ['Ồ, cũng có người dám đứng gần bổn cung sao?', 'Ngươi nghĩ mặc bộ áo ấy là được Hoàng thượng để mắt à?', 'Ghế của bổn cung, không phải ai cũng ngồi được đâu.'] },
  xao: { khich: false, lines: ['Muội muội hôm nay xinh quá, tỷ thật ghen tị đấy.', 'Có chuyện gì cứ nói với tỷ, tỷ giúp cho.', 'Nghe nói Hoàng thượng nhắc đến muội… tỷ mừng cho muội lắm.'] },
  hien: { khich: false, lines: ['Tỷ tỷ dùng trà chưa? Muội mới học được cách pha trà sen.', 'Trong cung này giữ được bình an là phúc rồi.', 'Muội thêu được chiếc khăn, tặng tỷ nhé.'] },
  danh: { khich: true, lines: ['Nhìn gì? Chưa thấy người đẹp bao giờ à?', 'Đừng tưởng được lật thẻ vài lần là lên mặt.', 'Bổn cung nhớ hết ai từng chơi xấu bổn cung đấy.'] },
  ninh: { khich: false, lines: ['Nương nương hôm nay rạng rỡ quá, thần thiếp lóa cả mắt.', 'Nếu nương nương cần người sai bảo, thần thiếp sẵn lòng.', 'Thần thiếp chỉ mong được theo hầu nương nương.'] },
  nhut: { khich: false, lines: ['Th… thần thiếp tham kiến…', 'Thần thiếp không dám làm phiền đâu ạ…', 'Thần thiếp mới vào cung, mong được chỉ bảo.'] },
};
const feiRel = (p, id) => (p.feiRel || {})[id] || 0;
function feiAdd(p, id, d) { p.feiRel = p.feiRel || {}; p.feiRel[id] = Math.max(-100, Math.min(100, (p.feiRel[id] || 0) + d)); }
function feiPresent(loc) {
  const blk = Math.floor(vnNow().getTime() / 72e5); const seed = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 100; };
  if (loc === 'yentiec') return NPCF().filter(n => n.rank >= 3).slice(0, 4);
  if (!['hoavien', 'tuninh'].includes(loc)) return [];
  return NPCF().filter(n => { const r = seed(n.id + blk); return loc === 'hoavien' ? r < 35 : r >= 35 && r < 60; });
}
const feiView = n => ({ id: n.id, name: n.name, short: n.short, model: n.model || C.RANKS[n.rank].outfit, tinh: n.tinh });
function grudgeTick() {
  for (const n of NPCF()) for (const [pid, at] of Object.entries(n.grudge || {})) {
    if (now() < at) continue; const p = P(pid); delete n.grudge[pid]; if (!p || p.lanh || p.admin || p.rank < C.FIGHT_RANK) continue;
    if ((p.protectUntil || 0) > now() || Object.values(DB.state.cases).some(c => c.victim === p.id && c.status === 'open')) { n.grudge[pid] = now() + 6 * 3600e3; continue; }
    createCase(p, null, { fei: n }); news(`🗡 Trong cung có kẻ vẫn chưa quên mối thù với ${p.name}…`);
  }
}
function npcDaily() {
  const k = dayKey(); if (DB.state.npcDay === k) return; DB.state.npcDay = k;
  for (const n of NPCF()) { n.pts += 12 + rnd(28) - (n.rank >= 7 ? 10 : 0); n.sung = Math.max(10, Math.min(150, n.sung + rnd(11) - 5)); npcPromote(n); }
  const n = pick(NPCF()); news(pick([`${n.name} được Hoàng thượng ban một đôi vòng ngọc.`, `${n.name} dâng canh ở Dưỡng Tâm điện, được Hoàng thượng khen.`, `${n.name} thỉnh an Thái hậu rất sớm, được ban trà.`, `${n.name} mở tiệc trà mời các tỷ muội cùng phe.`, `Nghe nói ${n.name} vừa sai người dò la tin tức các cung khác…`]));
}

// ---------------- thăng cấp ----------------
// mốc công trạng riêng cho vài tài khoản (p.moc = { cấp: điểm }), còn lại theo config
const RP = (p, r) => p?.moc?.[r] ?? C.RANKS[r].pts;
// 4 tài khoản của chủ game: mốc riêng Tần 500, Phi 900, Quý phi 2.000, Hoàng quý phi 3.000
const MOC_RIENG = { names: ['An An', 'Nhược Hy', 'Tạ Nguyệt Khanh', 'Tiểu Mỹ An'], moc: { 5: 500, 6: 900, 7: 2000, 8: 3000 } };
// tài khoản riêng của chủ game (An An): không chiếm ghế, không ứng cử Hoàng hậu. 3 acc còn lại là của bạn bè, chơi như người thường
const OWNER_ACCS = ['An An'];
const isOwnerAcc = p => !!p && OWNER_ACCS.includes(p.name);
function applyMocRieng() { for (const p of Object.values(DB.players)) if (MOC_RIENG.names.includes(p.name) && JSON.stringify(p.moc) !== JSON.stringify(MOC_RIENG.moc)) { p.moc = { ...MOC_RIENG.moc }; console.log('mốc riêng:', p.name); } }
function tryPromote(p) {
  if (p.lanh) return;
  let changed = false;
  while (p.rank < C.RANKS.length - 1 && p.pts >= RP(p, p.rank + 1)) {
    const next = C.RANKS[p.rank + 1];
    if (next.seats && seatCount(p.rank + 1) >= next.seats) { const weak = NPCF().filter(n => n.rank === p.rank + 1 && n.pts < p.pts).sort((a, b) => a.pts - b.pts)[0]; if (weak) { npcDemote(weak, `bị ${p.name} vượt mặt, phải nhường ghế`); continue; } }
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
function addPts(p, n) { if (n > 0 && !p.lanh && p.rank <= C.CATCHUP_RANK) n = Math.round(n * 1.3); if (n > 0 && (p.rebornUntil || 0) > now()) n = Math.round(n * 1.5); if (n > 0 && p.rank >= 6) n = Math.max(1, Math.round(n * C.HIGH_RANK_SLOW)); p.pts += n; tryPromote(p); }

function demote(p, steps, reason) {
  if (isHH(p)) loseHH(p, reason);
  const before = p.rank;
  p.rank = Math.max(0, p.rank - steps); p.trend = { dir: -1, t: now() };
  p.waiting = false;
  if (!allowedOutfits(p).includes(p.outfit)) p.outfit = C.RANKS[p.rank].outfit;
  p.protectUntil = now() + C.PROTECT_HOURS * 3600e3;
  p.pts = Math.min(p.pts, RP(p, p.rank) + 20);
  news(`${p.name} bị giáng từ ${C.RANKS[before].name} xuống ${C.RANKS[p.rank].name} vì ${reason}.`, 'phat');
  toast(p, `Bổn cung bị giáng xuống ${C.RANKS[p.rank].name}. Được bảo hộ ${C.PROTECT_HOURS} giờ.`, 'bad'); notify(p, '⬇️ Bị giáng cấp', `Bổn cung bị giáng xuống ${C.RANKS[p.rank].name} vì ${reason}.`, 'phat');
  push(p); freeSeatCheck();
}
function sendToLanhCung(p, reason, caseId) {
  if (isHH(p)) loseHH(p, reason);
  if (!p.lanh) p.trend = { dir: -1, t: now() };
  if (p.lanh) { if (caseId) p.lanh.caseId = caseId; return; }
  p.lanh = { from: p.rank, tasks: 0, caseId: caseId || null, since: now(), hp: 70, food: 0 }; p.loyal = Math.max(0, (p.loyal ?? 50) - 20);
  p.waiting = false;
  p.outfit = 'tunu';
  p.protectUntil = now() + C.PROTECT_HOURS * 3600e3;
  p.loc = 'lanhcung';
  news(`${p.name} bị đày vào lãnh cung vì ${reason}.`, 'phat');
  notify(p, '❄️ Bị đày vào lãnh cung', `Bổn cung bị đày vào lãnh cung vì ${reason}.`, 'phat');
  const s = sockOf(p.id); if (s) s.emit('cutscene', { type: 'lanhcung', name: p.name, reason });
  push(p); freeSeatCheck();
}
function phucVi(p, toRank, how) {
  const from = p.lanh?.from ?? 2;
  delete p.lanh;
  let r = Math.min(toRank, from);
  while (r > 2 && C.RANKS[r].seats && seatCount(r) >= C.RANKS[r].seats) r--;
  p.rank = r; p.outfit = C.RANKS[r].outfit; p.pts = Math.max(p.pts, RP(p, r)); p.trend = { dir: 1, t: now() };
  p.loc = 'phong';
  p.rebornUntil = now() + 3 * 864e5; p.sung += 10; cnt(p, 'taisinh'); // Phượng hoàng tái sinh: 3 ngày công trạng ×1,5
  news(`🔥 ${p.name} được phục vị ${C.RANKS[r].name} ${how}. Phượng hoàng tái sinh!`, 'phong');
  const s = sockOf(p.id); if (s) s.emit('cutscene', { type: 'phucvi', rank: r, rankName: C.RANKS[r].name, outfit: p.outfit, name: p.name });
  push(p);
}

// ---------------- thông báo đẩy + thư từ ----------------
const webpush = require('web-push');
function vapid() {
  if (!DB.state.vapid) DB.state.vapid = webpush.generateVAPIDKeys();
  webpush.setVapidDetails('mailto:admin@mongphuonghoang.game', DB.state.vapid.publicKey, DB.state.vapid.privateKey);
  return DB.state.vapid.publicKey;
}
function sendPush(p, title, body, tag) {
  if (!p?.pushSubs?.length || !DB.state.vapid) return;
  const msg = JSON.stringify({ title, body, tag });
  for (const sub of [...p.pushSubs]) webpush.sendNotification(sub, msg, { TTL: 6 * 3600 }).catch(e => { if (e.statusCode === 404 || e.statusCode === 410) { p.pushSubs = p.pushSubs.filter(x => x.endpoint !== sub.endpoint); save(); } });
}
// báo cho người chơi: đang online thì thôi (đã có thông báo trong game), offline thì gửi thư hệ thống + đẩy lên điện thoại
function notify(p, title, body, tag) {
  if (!p || online.has(p.id) || MUTE) return;
  addMail(p, { kind: 'he', fromName: title, text: body });
  sendPush(p, title, body, tag);
}
function addMail(p, m) {
  p.mail = p.mail || []; const item = { id: 'm' + now().toString(36) + rnd(1e4), t: now(), read: false, ...m };
  p.mail.unshift(item); p.mail = p.mail.slice(0, 40);
  const s = sockOf(p.id); if (s) { s.emit('mailNew', { from: m.anon ? 'Thư nặc danh' : m.fromName, kind: m.kind }); push(p); }
  return item;
}
const mailView = p => (p.mail || []).map(m => ({ id: m.id, t: m.t, read: m.read, kind: m.kind, from: m.anon ? null : m.from, fromName: m.anon ? 'Không rõ người gửi' : m.fromName, text: m.text, silver: m.silver || 0, group: m.group || null }));

// ---------------- thống kê cho quản trị ----------------
function track(p, key, n = 1) {
  if (!p) return; const S = (DB.state.stats = DB.state.stats || {}), d = (S[dayKey()] = S[dayKey()] || {}), r = (d[p.id] = d[p.id] || { on: 0, s: 0, a: {} });
  if (key === 'on' || key === 's') r[key] += n; else r.a[key] = (r.a[key] || 0) + n;
}
setInterval(() => { for (const id of online.keys()) track(P(id), 'on'); const S = DB.state.stats; if (S) for (const k of Object.keys(S).sort().slice(0, -30)) delete S[k]; }, 60e3);
function statsReport() {
  const S = DB.state.stats || {}, days = Object.keys(S).sort().slice(-14), last7 = days.slice(-7);
  const daily = days.map(k => { const d = S[k]; const ids = Object.keys(d); const acts = {}; let mins = 0; for (const id of ids) { mins += d[id].on; for (const [a, n] of Object.entries(d[id].a)) acts[a] = (acts[a] || 0) + n; } return { day: k, players: ids.length, minutes: mins, sessions: ids.reduce((t, id) => t + d[id].s, 0), acts }; });
  const players = Object.values(DB.players).map(p => {
    const act = days.filter(k => S[k][p.id]); const m7 = last7.reduce((t, k) => t + (S[k][p.id]?.on || 0), 0);
    const acts = {}; for (const k of last7) for (const [a, n] of Object.entries(S[k][p.id]?.a || {})) acts[a] = (acts[a] || 0) + n;
    return { name: p.name, user: p.user, rank: rankName(p), pts: p.pts, silver: p.silver, sung: p.sung, created: p.created, lastSeen: online.has(p.id) ? now() : p.lastSeen || p.created, online: online.has(p.id), activeDays: act.length, minutes7: m7, streak: p.streak || 0, children: (p.children || []).length, thai: !!p.thai?.known, sis: grp(p)?.name || '', topActs: Object.entries(acts).sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }).sort((a, b) => b.lastSeen - a.lastSeen);
  const ps = Object.values(DB.players);
  return { now: now(), daily, players, totals: { players: ps.length, online: online.size, silver: ps.reduce((t, p) => t + p.silver, 0), openCases: Object.values(DB.state.cases).filter(c => c.status === 'open').length, groups: Object.keys(DB.state.groups || {}).length, hh: DB.state.hh ? P(DB.state.hh.id)?.name : null, event: curEvent().name, ranks: C.RANKS.map((r, i) => ({ name: r.name, n: ps.filter(p => !p.lanh && p.rank === i).length })).concat([{ name: 'Lãnh cung', n: ps.filter(p => p.lanh).length }]) } };
}

// ---------------- long thai ----------------
function revealThai(p, how) {
  if (!p.thai || p.thai.known) return;
  p.thai.known = true; p.thai.due = now() + C.THAI_DAYS * 864e5; p.thai.care = 0; setTimeout(() => kidEmit(p), 300);
  p.sung += 15; p.haiLong = Math.min(100, p.haiLong + 10); relAdd(p, 'thaihau', 10, 'mang long thai cho hoàng gia');
  news(`🎊 ${how === 'nghen' ? `${p.name} buồn nôn liên tục, Thái y tới bắt mạch` : 'Thái y bắt mạch'} báo hỷ: ${title(p)} có long thai! Thái hậu vui mừng ban thưởng.`, 'phong');
  notify(p, '🎊 Có hỷ!', 'Thái y báo hỷ: bổn cung mang long thai. Nhớ uống thuốc an thai mỗi ngày.', 'thai');
  const s = sockOf(p.id); if (s) s.emit('cutscene', { type: 'baohy', name: p.name, days: C.THAI_DAYS });
  push(p); save();
}
function sayThai(p, why) {
  if (!p.thai) return; p.thai = null; p.sung = Math.max(0, p.sung - 5);
  news(`💔 ${title(p)} sảy thai${why ? ' vì ' + why : ''}. Cả hậu cung chấn động.`, 'phat');
  notify(p, '💔 Sảy thai', `Long thai không giữ được${why ? ' vì ' + why : ''}.`, 'thai');
  const s = sockOf(p.id); if (s) s.emit('cutscene', { type: 'saythai', name: p.name, why: why || '' });
  push(p); save();
}
function birth(p, opt = {}) {
  if (!p.thai) return {}; const care = p.thai.care || 0, isTest = !!p.thai.test; p.thai = null; p.bornAt = now();
  const sex = opt.sex || (Math.random() < .5 ? 'trai' : 'gai'), name = opt.name || pick(C.CHILD_NAMES[sex]);
  p.children = p.children || []; const firstSon = sex === 'trai' && !p.children.some(c => c.sex === 'trai' && !c.test); const ward = p.rank < C.CHILD.WARD_RANK; p.children.push({ sex, name, born: now(), ward, ...(isTest ? { test: true } : {}) }); kidFix(p);
  if (ward) setTimeout(() => news(`🏯 Theo tổ chế, phi tần dưới bậc ${C.RANKS[C.CHILD.WARD_RANK].name} không được tự nuôi con: ${sex === 'trai' ? 'hoàng tử' : 'công chúa'} ${name} được đưa tới A ca sở. ${p.name} lên tới ${C.RANKS[C.CHILD.WARD_RANK].name} sẽ được đón con về.`, 'phong'), 3000);
  const hard = opt.hard ?? care < 2, k = hard ? .5 : 1;
  p.sung += Math.round((sex === 'trai' ? 30 : 20) * k); p.silver += Math.round(200 * k); p.haiLong = Math.min(100, p.haiLong + 15);
  const next = C.RANKS[p.rank + 1];
  news(`👶 ${title(p)} ${hard ? 'khó sinh suốt một đêm, cuối cùng ' : ''}hạ sinh ${sex === 'trai' ? 'hoàng tử' : 'công chúa'}, Hoàng thượng ban tên ${name}. ${sex === 'trai' ? 'Hoàng gia có thêm người nối dõi!' : 'Hoàng thượng yêu thương như ngọc.'}`, 'phong');
  notify(p, '👶 Hạ sinh hoàng tự!', `Bổn cung hạ sinh ${sex === 'trai' ? 'hoàng tử' : 'công chúa'} ${name}.`, 'sinh');
  const s = sockOf(p.id); if (s && !opt.event) s.emit('cutscene', { type: 'sinhcon', name: p.name, sex, child: name, hard, ward }); setTimeout(() => kidEmit(p), 500);
  // mẫu bằng tử quý: chỉ con trai đầu lòng mới được tấn phong lên một bậc
  const r0 = p.rank; p.pts += Math.round((sex === 'trai' ? 80 : 50) * k); if (next && firstSon && !isTest) p.pts = Math.max(p.pts, next.pts);
  tryPromote(p); push(p); save(); return { sex, name, hard, promoted: p.rank > r0 };
}
function thaiTick() {
  for (const p of Object.values(DB.players)) {
    if (!p.thai) continue;
    if (p.thai.test) { quiet(true, () => thaiOne(p)); continue; } thaiOne(p);
  }
}
function thaiOne(p) {
  {
    if (!p.thai.known && now() - p.thai.since > 24 * 3600e3) revealThai(p, 'nghen');
    else if (p.thai.known && now() >= p.thai.due && (p.thai.test || !Object.values(DB.state.cases).some(c => c.victim === p.id && c.status === 'open'))) { /* thai thử thì không chờ phá án */ if (DB.state.sinh?.id === p.id) return; if (online.has(p.id) && p.loc !== 'tamcung' && sinhStart(p)) return; /* chỉ sinh khi người mẹ online để cả cung cùng chờ tin */ }
  }
}

// ---------------- Hoàng hậu ----------------
function hhEligible() { return Object.values(DB.players).filter(p => !p.lanh && !p.admin && !isOwnerAcc(p) && p.rank >= C.HH_MIN_RANK && !((p.camTucUntil || 0) > now())); }
function hhScore(p, v) {
  const votes = Object.values(v.votes).filter(x => x === p.id).length;
  return { votes, total: Math.round(-(p.hhStrike || 0) * 30 + votes * 15 + p.haiLong + rel(p, 'thaihau') / 2 + p.sung / 3 + (p.children || []).length * 25 + (DB.state.thaitu?.mother === p.id ? 60 : 0) + p.pts / 20) };
}
function hhVoteView(viewer) {
  const v = DB.state.hhVote; if (!v) return null;
  return { end: v.end, mine: v.votes[viewer.id] || null, cands: v.cands.map(id => { const q = P(id); if (!q) return null; const sc = hhScore(q, v); return { id, name: title(q), votes: sc.votes, score: sc.total, children: (q.children || []).length, haiLong: q.haiLong }; }).filter(Boolean) };
}
function startHHVote() {
  const cur = DB.state.hh && P(DB.state.hh.id);
  const el = hhEligible().filter(p => p !== cur).sort((a, b) => b.rank - a.rank || b.pts - a.pts).slice(0, cur ? 2 : 3);
  if (!el.length) { DB.state.hhNext = now() + 864e5; return; }
  const cands = [...(cur ? [cur.id] : []), ...el.map(p => p.id)];
  DB.state.hhVote = { start: now(), end: now() + C.HH_VOTE_HOURS * 3600e3, cands, votes: {} };
  news(`👑 Thái hậu truyền chỉ bầu phượng ấn! Ứng cử: ${cands.map(id => title(P(id))).join(', ')}. Mọi người đến Từ Ninh cung tiến cử trong ${C.HH_VOTE_HOURS} giờ.`, 'phong');
  for (const q of Object.values(DB.players)) notify(q, '👑 Bầu phượng ấn', 'Thái hậu truyền chỉ bầu Hoàng hậu. Đến Từ Ninh cung tiến cử trong 24 giờ.', 'hh');
  io.emit('toast', { text: '👑 Bắt đầu bầu phượng ấn! Đến Từ Ninh cung để tiến cử Hoàng hậu.', kind: 'good' });
  for (const id of online.keys()) { const q = P(id); if (q) push(q); }
  save();
}
function endHHVote() {
  const v = DB.state.hhVote; if (!v) return; DB.state.hhVote = null;
  const ranked = v.cands.map(P).filter(q => q && !q.lanh).map(q => ({ q, ...hhScore(q, v) })).sort((a, b) => b.total - a.total);
  DB.state.hhNext = now() + C.HH_CYCLE_DAYS * 864e5;
  if (!ranked.length) return save();
  const w = ranked[0].q, prev = DB.state.hh && P(DB.state.hh.id); for (const r of ranked) r.q.hhStrike = 0; if (prev) prev.hhStrike = 0;
  if (prev && prev.id !== w.id) { news(`Phượng ấn đổi chủ: ${prev.name} trở lại ngôi ${C.RANKS[prev.rank].name}.`, 'phat'); if (/^hoanghau/.test(prev.outfit)) prev.outfit = C.RANKS[prev.rank].outfit; push(prev); }
  DB.state.hh = { id: w.id, since: now() }; cnt(w, 'hh');
  if (!prev || prev.id !== w.id) {
    w.trend = { dir: 1, t: now() };
    hhcStart(w, ranked); // áo Hoàng hậu được thay ngay trong lễ sắc phong
  } else news(`👑 ${w.name} giữ vững phượng ấn thêm một kỳ.`, 'phong');
  for (const id of online.keys()) { const q = P(id); if (q) push(q); }
  save();
}
function loseHH(p, reason) {
  if (!isHH(p)) return; DB.state.hh = null; if (/^hoanghau/.test(p.outfit)) p.outfit = C.RANKS[p.rank].outfit;
  news(`💔 Hoàng hậu ${p.name} bị thu hồi phượng ấn vì ${reason}. Ngôi hậu bỏ trống.`, 'phat');
  DB.state.hhNext = Math.min(DB.state.hhNext || Infinity, now() + 864e5);
}
function hhTick() {
  // tài khoản quản trị không giữ phượng ấn, không ứng cử: nhường ngôi cho kỳ bầu chọn của người chơi
  const hq = DB.state.hh && P(DB.state.hh.id);
  if (hq?.admin || isOwnerAcc(hq)) { DB.state.hh = null; if (/^hoanghau/.test(hq.outfit)) hq.outfit = C.RANKS[hq.rank].outfit; DB.state.hhNext = now() + 3600e3; news('👑 Ngôi Hoàng hậu đang bỏ trống. Một canh giờ nữa Thái hậu sẽ truyền chỉ bầu phượng ấn, các phi tần từ bậc Tần trở lên chuẩn bị ứng cử.', 'phong'); push(hq); save(); }
  if (DB.state.hhVote) { const vv = DB.state.hhVote; vv.cands = vv.cands.filter(id => !P(id)?.admin && !isOwnerAcc(P(id))); if (!vv.cands.length) { DB.state.hhVote = null; DB.state.hhNext = now() + 3600e3; } }
  const v = DB.state.hhVote;
  if (v && now() >= v.end) endHHVote();
  else if (!v && now() >= (DB.state.hhNext || 0) && hhEligible().length) startHHVote();
}



// ---------------- lãnh cung: sức khỏe, gửi đồ, thăm hỏi, chế giễu, đêm trăng ----------------
const LC_ITEMS = { com: { name: 'Hộp cơm nóng', price: 30, hp: 20, food: 1 }, ao: { name: 'Áo bông ấm', price: 50, hp: 35, food: 0 }, thuoc: { name: 'Thang thuốc bổ', price: 80, hp: 50, food: 0 } };
const lcList = () => Object.values(DB.players).filter(q => q.lanh).map(q => ({ id: q.id, name: q.name, hp: q.lanh.hp ?? 70, tasks: q.lanh.tasks, online: online.has(q.id) && q.loc === 'lanhcung' }));
function lanhSock(sock, getMe) {
  sock.on('lc', d => { const me = getMe(); if (!me || !d) return; freshDay(me); const t = d.who && P(d.who);
    if (d.op === 'list') return sock.emit('lcList', lcList());
    if (d.op === 'com') { if (!me.lanh || me.lanh.comDay === dayKey()) return; me.lanh.comDay = dayKey(); me.lanh.hp = Math.min(100, (me.lanh.hp ?? 70) + 20); sock.emit('lcCom'); push(me); return save(); }
    if (d.op === 'gui') { const it = LC_ITEMS[d.item]; if (!it || !t?.lanh || t.id === me.id || me.lanh) return;
      me.lcGui = me.lcGui?.d === dayKey() ? me.lcGui : { d: dayKey(), n: 0 }; if (me.lcGui.n >= 3) return toast(me, 'Hôm nay đã gửi đồ 3 lần, thị vệ không cho gửi thêm.');
      if (me.silver < it.price) return toast(me, `Cần ${it.price} bạc.`, 'bad'); me.silver -= it.price; me.lcGui.n++;
      t.lanh.hp = Math.min(100, (t.lanh.hp ?? 70) + it.hp); t.lanh.food = (t.lanh.food || 0) + it.food; (t.lanh.on = t.lanh.on || []).includes(me.name) || t.lanh.on.push(me.name);
      notify(t, '🧺 Có người gửi đồ vào lãnh cung', `${me.name} gửi ${it.name} vào cho bổn cung.`, 'an'); toast(t, `🧺 ${me.name} lén gửi ${it.name} vào: sức khỏe +${it.hp}.`, 'good');
      toast(me, `Đã nhờ thị vệ đưa ${it.name} vào cho ${t.name}.`, 'good'); push(t); push(me); return save(); }
    if (d.op === 'tham' || d.op === 'che') { if (me.lanh || me.loc !== 'lanhcung' || !t?.lanh) return; const key = d.op + ':' + t.id;
      me.lcDid = me.lcDid?.d === dayKey() ? me.lcDid : { d: dayKey(), k: [] }; if (me.lcDid.k.includes(key)) return toast(me, 'Hôm nay đã làm vậy với người này rồi.'); 
      if (d.op === 'tham') { if (me.silver < 20) return toast(me, 'Cần 20 bạc mua chút đồ ăn mang vào.', 'bad'); me.silver -= 20; me.lcDid.k.push(key);
        t.lanh.hp = Math.min(100, (t.lanh.hp ?? 70) + 15); t.lanh.food = (t.lanh.food || 0) + 1; (t.lanh.on = t.lanh.on || []).includes(me.name) || t.lanh.on.push(me.name); addPts(me, 5); relAdd(me, 'thaihau', 1, 'có lòng nhân hậu');
        io.to('lanhcung').emit('chat', { id: null, name: '🧺', text: `${me.name} tới thăm ${t.name}, mang theo bánh trái và lời hỏi han.` }); toast(t, `🧺 ${me.name} tới thăm: sức khỏe +15, có thêm đồ ăn.`, 'good'); toast(me, 'Thăm hỏi người trong lãnh cung: công trạng +5, Thái hậu khen có lòng nhân hậu.', 'good'); }
      else { if (me.lcDid.k.some(k => k.startsWith('che:'))) return toast(me, 'Hôm nay đã chế giễu một người rồi, đừng quá đáng.'); if (me.silver < 50) return toast(me, 'Cần 50 bạc mua chuộc thị vệ làm ngơ cho mà chế giễu.', 'bad');
        me.silver -= 50; me.lcDid.k.push(key); t.hanLC = t.hanLC || {}; t.hanLC[me.id] = now() + 7 * 864e5; relAdd(me, 'thaihau', -3, 'chế giễu người sa cơ');
        io.to('lanhcung').emit('chat', { id: null, name: '😏', text: `${me.name}: ${pick(['Chậc chậc, ngày trước oai phong lắm mà, giờ quét sân cũng không xong.', 'Tưởng ai, hóa ra là phế phi. Lãnh cung hợp với ngươi lắm.', 'Áo vải thô này mới đúng thân phận của ngươi.'])}` });
        toast(t, `😤 ${me.name} tới chế giễu bổn cung. Mối nhục này ghi tạc, ra khỏi đây sẽ đòi lại gấp đôi.`, 'bad'); notify(t, '😤 Bị chế giễu', `${me.name} tới lãnh cung chế giễu bổn cung.`, 'phat'); toast(me, 'Hả dạ rồi (-50 bạc, Thái hậu không vui: hài lòng -3)… và người ta sẽ nhớ.'); }
      push(t); push(me); sock.emit('lcList', lcList()); return save(); }
    if (d.op === 'hat') { if (!me.lanh || me.loc !== 'lanhcung') return; const h = vnNow().getUTCHours();
      if (h < 19 || h >= 24) return toast(me, 'Chờ trăng lên (từ 19h) hãy gảy đàn, giờ này Hoàng thượng không đi ngang.'); if (me.lanh.hatDay === dayKey()) return toast(me, 'Đêm nay đã gảy đàn rồi.');
      me.lanh.hatDay = dayKey(); const q = +d.q || 0, ch = q >= .85 ? .35 : q >= .65 ? .15 : .03;
      if (Math.random() < ch) { const from = me.lanh.from; sock.emit('cutscene', { type: 'lanhtrang', name: me.name }); setTimeout(() => { if (P(me.id)?.lanh) phucVi(me, from, 'vì tiếng đàn đêm trăng làm Hoàng thượng động lòng'); }, 9000); }
      else { toast(me, q >= .65 ? 'Tiếng đàn vang trong đêm… nhưng đêm nay Hoàng thượng không đi ngang. Mai thử lại.' : 'Tiếng đàn rời rạc tan vào gió lạnh. Không ai nghe thấy.'); }
      push(me); return save(); }
  });
}

// ---------------- đại lễ công bố phượng ấn và sắc lập Hoàng hậu (Dưỡng Tâm điện) ----------------
// chờ tân Hoàng hậu online → báo trước 3 phút → công bố kết quả (1 phút) → sắc phong (100 giây) → xong
const HHC = { LEAD: 5 * 60e3, CONGBO: 60e3, SAC: 100e3, WAIT_MAX: 24 * 3600e3 };
const hhcPub = () => { const h = DB.state.hhc; if (!h) return null; return { id: h.id, name: h.name, ranked: h.ranked, phase: h.phase, at: h.at || null, t: h.t || null, dur: { congbo: HHC.CONGBO, sac: HHC.SAC }, cheer: (h.cheer || []).length, test: !!h.test }; };
// phanh cho Hoàng hậu: xử phạt quá nhiều người khác nhau trong 7 ngày thì Thái hậu cảnh cáo, uy tín (điểm bầu kỳ sau) giảm
function hhBrake(hq, t, kind) {
  t.hhPhat = { by: hq.id, kind, at: now(), used: false };
  hq.hhPun = (hq.hhPun || []).filter(x => now() - x.t < 7 * 864e5); hq.hhPun.push({ t: now(), who: t.id });
  const n = new Set(hq.hhPun.map(x => x.who)).size;
  if (n >= 4 && !((hq.hhWarnAt || 0) > now() - 7 * 864e5)) { hq.hhWarnAt = now(); hq.hhStrike = (hq.hhStrike || 0) + 1; hq.haiLong = Math.max(0, hq.haiLong - 10); relAdd(hq, 'thaihau', -10, 'xử phạt quá nhiều người');
    news(`👑 Thái hậu không hài lòng: Hoàng hậu ${hq.name} trong một tuần đã xử phạt ${n} người. Uy tín phượng ấn sụt giảm, kỳ bầu tới khó giữ ngôi.`, 'phat'); toast(hq, 'Thái hậu cảnh cáo: xử phạt quá nhiều người. Hài lòng -10, kỳ bầu phượng ấn sau bị trừ điểm.', 'bad'); }
}
function hhcEmit() { emitSplit('hhc', hhcPub(), DB.state.hhc?.test); }
function hhcStart(w, ranked, test) {
  DB.state.hhc = { id: w.id, name: w.name, ranked: ranked.slice(0, 3).map(r => ({ name: r.q.name, votes: r.votes })), phase: 'cho', at: null, created: now(), cheer: [], test: !!test };
  quiet(test, () => news(`📜 Kết quả bầu phượng ấn: ${w.name} được nhiều người tiến cử nhất. Dưỡng Tâm điện sẽ cử hành đại lễ công bố và sắc lập Hoàng hậu.`, 'phong'));
  hhcSchedule(); save();
}
function hhcSchedule() {
  const h = DB.state.hhc; if (!h || h.phase !== 'cho' || h.at || !online.has(h.id)) return;
  h.at = now() + (h.test ? 20e3 : HHC.LEAD);
  quiet(h.test, () => { news(`👑 ${h.test ? 'Ít giây' : '5 phút'} nữa, Dưỡng Tâm điện cử hành đại lễ công bố phượng ấn và sắc lập Hoàng hậu ${h.name}. Mời cả hậu cung tới dự!`, 'phong');
    if (!h.test) for (const q of Object.values(DB.players)) if (q.id !== h.id) notify(q, '👑 Đại lễ sắc lập Hoàng hậu', '5 phút nữa cử hành ở Dưỡng Tâm điện. Tới dự để hành lễ chúc mừng.', 'hh'); });
  notify(P(h.id), '👑 Đại lễ sắc lập', 'Bổn cung được bầu làm Hoàng hậu. Mau tới Dưỡng Tâm điện nhận sắc phong.', 'hh');
  hhcEmit(); save();
}
function hhcTick() {
  const h = DB.state.hhc; if (!h) return;
  if (h.phase === 'cho') { if (!h.at) { if (now() - h.created > HHC.WAIT_MAX) return hhcFinish(true); return hhcSchedule(); } if (now() >= h.at) { h.phase = 'congbo'; h.t = now(); hhcEmit(); save(); } return; }
  if (h.phase === 'congbo' && now() - h.t >= (h.test ? 20e3 : HHC.CONGBO)) { h.phase = 'sacphong'; h.t = now(); hhcEmit(); save(); return; }
  if (h.phase === 'sacphong' && now() - h.t >= 8000 && !h.robed) { h.robed = true; const w = P(h.id); if (w && (isHH(w) || h.test)) { w.outfit = 'hoanghau'; push(w); const sk = sockOf(w.id); if (sk) rTo(w, sk).emit('poutfit', { id: w.id, outfit: 'hoanghau' }); } save(); }
  if (h.phase === 'sacphong' && now() - h.t >= (h.test ? 50e3 : HHC.SAC)) hhcFinish();
}
function hhcFinish(silent) {
  const h = DB.state.hhc; if (!h) return; DB.state.hhc = null;
  const w = P(h.id); if (w && isHH(w) && !/^hoanghau/.test(w.outfit)) { w.outfit = 'hoanghau'; push(w); }
  if (!silent) quiet(h.test, () => news(`🎆 Đại lễ sắc lập hoàn tất. Hoàng hậu ${h.name} chính thức chủ quản lục cung${(h.cheer || []).length ? `, ${(h.cheer || []).length} phi tần hành lễ bái kiến` : ''}.`, 'phong'));
  emitSplit('hhc', null, h.test); save();
}
function hhcSock(sock, getMe) {
  setTimeout(() => { const me = getMe(); sock.emit('hhc', DB.state.hhc?.test && !me?.admin ? null : hhcPub()); }, 1600);
  sock.on('hhc', d => { const me = getMe(), h = DB.state.hhc; if (!me || !h || h.phase !== 'sacphong' || me.loc !== 'duongtam') return;
    if (d?.op === 'chuc' && me.id !== h.id && !h.cheer.includes(me.id)) { h.cheer.push(me.id); if (!h.test) { addPts(me, 6); me.haiLong = Math.min(100, me.haiLong + 2); const w = P(h.id); if (w) { w.silver += 10; push(w); } }
      io.to('duongtam').emit('chat', { id: null, name: '🙇', text: `${me.name} hành lễ: Hoàng hậu nương nương thiên tuế, thiên tuế, thiên thiên tuế!` }); toast(me, 'Đã hành lễ bái kiến Hoàng hậu: công trạng +6, Thái hậu hài lòng +2.', 'good'); push(me); hhcEmit(); } });
}

// ---------------- sự kiện theo tuần ----------------
function eventTick() {
  const w = weekIdx(); if (DB.state.evWeek === w) return;
  const prevW = DB.state.evWeek; DB.state.evWeek = w;
  if (prevW != null && C.EVENTS[prevW % C.EVENTS.length].id === 'hoica') {
    const best = Object.values(DB.players).filter(p => p.wkFish?.w === prevW).sort((a, b) => b.wkFish.n - a.wkFish.n)[0];
    if (best) { best.silver += 150; best.sung += 15; news(`🎣 Hội câu cá khép lại: ${best.name} câu nhiều nhất (${best.wkFish.n} con), được Hoàng thượng thưởng 150 bạc và sủng ái.`, 'phong'); push(best); }
  }
  const e = curEvent(); news(`🎐 Tuần này: ${e.name}. ${e.desc}`, 'yentiec');
  for (const id of online.keys()) { const q = P(id); if (q) push(q); }
}

// =====================================================================
// HOẠT ĐỘNG CÙNG LÀM: ĐẠI ÁN (mỗi người một mảnh manh mối) + ĐẠI LỄ (thanh tiến độ chung)
// =====================================================================
const BIG_TRAITS = { cung: C.TRAITS.cung, gio: C.TRAITS.gio, dau: C.TRAITS.dau, mau: ['áo đỏ', 'áo tím', 'áo xanh', 'áo vàng'] };
const BIG_TNAME = { cung: 'nơi ở', gio: 'giờ lui tới', dau: 'dấu vết', mau: 'màu áo' };
const BIG_NPC = ['Lệ Tần', 'Hân Quý nhân', 'Mai Đáp ứng', 'Uyển Quý nhân', 'Cung nữ Xuân Đào', 'Cung nữ Thu Cúc', 'Thái giám Tiểu Lộ Tử', 'Thái giám Tiểu Hạ Tử', 'Thị vệ Trương Thành', 'Ma ma Lưu thị', 'Tú nữ Diệp thị', 'Nhạc công Bạch Ngọc'];
function bigModel(n) { return /Cung nữ|Tú nữ|Nhạc công/.test(n) ? 'cungnu' : /Thái giám/.test(n) ? 'thaigiam' : /Thị vệ/.test(n) ? 'thive' : /Ma ma/.test(n) ? 'mama' : /Tần/.test(n) ? 'tan' : /Quý nhân/.test(n) ? 'quynhan' : 'thuongtai'; }
function startBigCase(hours = C.BIG_HOURS) {
  const theme = pick(C.BIG_CASES), keys = Object.keys(BIG_TRAITS);
  const tr = () => Object.fromEntries(keys.map(k => [k, rnd(BIG_TRAITS[k].length)]));
  const g = tr(), names = [...BIG_NPC].sort(() => Math.random() - .5).slice(0, 6);
  const sus = names.map((n, i) => {
    let t = { ...g };
    if (i > 0) { const diff = [...keys].sort(() => Math.random() - .5).slice(0, Math.random() < .7 ? 1 : 2); for (const k of diff) t[k] = (g[k] + 1 + rnd(BIG_TRAITS[k].length - 1)) % BIG_TRAITS[k].length; }
    return { id: 's' + i, name: n, model: bigModel(n), t, guilty: i === 0 };
  }).sort(() => Math.random() - .5);
  DB.state.bigCase = { id: 'da' + now(), title: theme.title, intro: theme.intro, start: now(), end: now() + hours * 3600e3, sus, clues: {}, board: [], votes: {}, inv: {}, done: false };
  news(`📜 ĐẠI ÁN: ${theme.title}! Thái hậu hạ chỉ cả hậu cung cùng tra xét. Mỗi người tìm được manh mối khác nhau, phải góp lại mới tìm ra thủ phạm. Hạn ${Math.round(hours / 24)} ngày.`, 'an');
  for (const q of Object.values(DB.players)) notify(q, '📜 Đại án', `${theme.title}! Cả cung cùng tra án, mỗi người giữ một mảnh manh mối.`, 'daian');
  for (const id of online.keys()) { const q = P(id); if (q) push(q); } save();
}
function bigClue(p, loc) {
  const B = DB.state.bigCase, g = B.sus.find(s => s.guilty), mine = B.clues[p.id] = B.clues[p.id] || [];
  const r = Math.random(); let c;
  if (r < .18) { // tin đồn: có thể sai
    const k = pick(Object.keys(BIG_TRAITS)), lie = Math.random() < .6, v = lie ? (g.t[k] + 1 + rnd(BIG_TRAITS[k].length - 1)) % BIG_TRAITS[k].length : g.t[k];
    c = { kind: 'don', k, v, text: `Tin đồn ở ${{ hoavien: 'Ngự hoa viên', tuninh: 'Từ Ninh cung', duongtam: 'Dưỡng Tâm điện' }[loc]}: kẻ gây án có ${BIG_TRAITS[k][v]}. (Tin đồn, có thể sai)` };
  } else if (r < .55) { // chứng cứ ngoại phạm của một người vô can
    const known = new Set(mine.filter(x => x.kind === 'ngoai').map(x => x.s)); const inn = B.sus.filter(s => !s.guilty && !known.has(s.id));
    const s = inn.length ? pick(inn) : pick(B.sus.filter(x => !x.guilty));
    c = { kind: 'ngoai', s: s.id, text: `${s.name} có chứng cứ ngoại phạm: ${pick(['đêm đó đang hầu Thái hậu tụng kinh', 'có ba người làm chứng ở cùng cả buổi', 'đang bị bệnh nằm ở Thái y viện', 'đang trực ở cổng Thần Vũ'])}.` };
  } else {
    const have = new Set(mine.filter(x => x.kind === 'dac').map(x => x.k)); const ks = Object.keys(BIG_TRAITS).filter(k => !have.has(k));
    const k = ks.length ? pick(ks) : pick(Object.keys(BIG_TRAITS));
    c = { kind: 'dac', k, v: g.t[k], text: `${pick(['Cung nữ quét sân kể', 'Thị vệ gác đêm khai', 'Trong sổ trực ghi', 'Lần theo dấu vết thấy'])}: kẻ gây án có ${BIG_TRAITS[k][g.t[k]]}.` };
  }
  c.id = 'c' + now().toString(36) + rnd(1e3); c.t = now(); mine.push(c);
  return c;
}
function bigView(p) {
  const B = DB.state.bigCase; if (!B) return null;
  const tally = {}; for (const v of Object.values(B.votes)) tally[v] = (tally[v] || 0) + 1;
  return { id: B.id, title: B.title, intro: B.intro, end: B.end, done: B.done, verdict: B.verdict || null, traits: BIG_TRAITS, tname: BIG_TNAME,
    sus: B.sus.map(s => ({ id: s.id, name: s.name, model: s.model, t: s.t, votes: tally[s.id] || 0, guilty: B.done ? s.guilty : undefined })),
    mine: (B.clues[p.id] || []).map(c => ({ ...c, shared: B.board.some(b => b.cid === c.id) })), board: B.board, vote: B.votes[p.id] || null,
    invToday: B.inv[p.id]?.d === dayKey() ? B.inv[p.id].locs : [], people: Object.keys(B.clues).length };
}
function endBigCase() {
  const B = DB.state.bigCase; if (!B || B.done) return; B.done = true;
  const tally = {}; for (const v of Object.values(B.votes)) tally[v] = (tally[v] || 0) + 1;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]); const g = B.sus.find(s => s.guilty);
  const win = top.length && top[0][0] === g.id && !(top[1] && top[1][1] === top[0][1]);
  const parts = new Set([...Object.keys(B.clues), ...Object.keys(B.votes)]);
  if (win) {
    B.verdict = `Cả cung đồng lòng chỉ ra thủ phạm: ${g.name}. Thái hậu khen ngợi, ban thưởng người góp sức.`;
    news(`⚖️ ĐẠI ÁN "${B.title}" đã phá! Thủ phạm là ${g.name}. ${parts.size} người góp sức được Thái hậu ban thưởng.`, 'latan');
    for (const id of parts) { const q = P(id); if (!q) continue; const R = C.BIG_REWARD, right = B.votes[id] === g.id;
      q.silver += R.silver; q.haiLong = Math.min(100, q.haiLong + R.haiLong); addPts(q, R.pts + (right ? R.right : 0)); if (right) cnt(q, 'bigRight');
      toast(q, `⚖️ Đại án đã phá! Thưởng ${R.silver} bạc, ${R.pts + (right ? R.right : 0)} công trạng${right ? ' (bỏ phiếu đúng)' : ''}.`, 'good'); notify(q, '⚖️ Đại án đã phá', `Thủ phạm là ${g.name}. Bổn cung được thưởng.`); push(q); }
  } else {
    B.verdict = `Cả cung ${top.length ? `buộc tội ${B.sus.find(s => s.id === top[0][0])?.name}${top[1] && top[1][1] === top[0][1] ? ' (phiếu chia đôi, không ngã ngũ)' : ''}` : 'không ai bỏ phiếu'}, nhưng thủ phạm thật là ${g.name}. Thái hậu phật ý.`;
    news(`⚖️ ĐẠI ÁN "${B.title}" bị xử sai! Thủ phạm thật là ${g.name}, kẻ vô tội bị oan. Thái hậu trách cả hậu cung.`, 'phat');
    for (const id of parts) { const q = P(id); if (!q) continue; q.haiLong = Math.max(0, q.haiLong - 3); q.silver += 20; toast(q, `⚖️ Đại án xử sai, thủ phạm thật là ${g.name}. Thái hậu trách (hài lòng -3), nhưng vẫn thưởng công tra xét 20 bạc.`, 'bad'); push(q); }
  }
  for (const id of online.keys()) { const q = P(id); if (q) push(q); } save();
}
function bigTick() {
  const B = DB.state.bigCase;
  if (B && !B.done && now() >= B.end) endBigCase();
  const w = weekIdx(); if ((!B || B.done) && DB.state.bigWeek !== w && vnNow().getUTCHours() >= 8) { DB.state.bigWeek = w; startBigCase(); }
}

// ---------- đại lễ ----------
function startFest(hours = C.FEST_HOURS) {
  const th = C.FESTS[(DB.state.festN = (DB.state.festN || 0) + 1) % C.FESTS.length];
  const active = Object.values(DB.players).filter(p => now() - (p.lastSeen || 0) < 7 * 864e5).length;
  DB.state.fest = { id: 'dl' + now(), name: th.name, desc: th.desc, start: now(), end: now() + hours * 3600e3, goal: Math.max(C.FEST_MIN_GOAL, active * C.FEST_PER_PLAYER), pts: 0, by: {}, hit: [], done: false };
  news(`🏮 ĐẠI LỄ: ${th.name}! ${th.desc} Cả cung góp sức trong ${Math.round(hours / 24)} ngày: đạt mỗi mốc là cả cung có quà.`, 'yentiec');
  for (const q of Object.values(DB.players)) notify(q, '🏮 ' + th.name, 'Cả cung cùng góp sức chuẩn bị đại lễ, đạt mốc là có quà.', 'daile');
  for (const id of online.keys()) { const q = P(id); if (q) push(q); } save();
}
function festView(p) {
  const F = DB.state.fest; if (!F) return null;
  const top = Object.entries(F.by).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ name: P(id)?.name || '?', n }));
  const d = p.festDay?.d === dayKey() ? p.festDay : {};
  return { name: F.name, desc: F.desc, end: F.end, goal: F.goal, pts: F.pts, hit: F.hit, done: F.done, mine: F.by[p.id] || 0, top, people: Object.keys(F.by).length, today: { silver: d.silver || 0, theu: !!d.theu, kinh: !!d.kinh, fish: d.fish || 0 } };
}
function festAdd(p, n, what) {
  const F = DB.state.fest; if (!F || F.done || now() > F.end || n <= 0) return 0;
  F.pts += n; F.by[p.id] = (F.by[p.id] || 0) + n; cnt(p, 'fest', n);
  for (const [i, m] of C.FEST_MILES.entries()) if (!F.hit.includes(i) && F.pts >= F.goal * m.at) { F.hit.push(i); festReward(i); }
  if (F.pts >= F.goal && !F.done) festFinish(true);
  for (const id of online.keys()) { const q = P(id); if (q) { const s = sockOf(id); if (s) s.emit('festUp', { pts: F.pts, goal: F.goal, who: p.name, what, n }); } }
  return n;
}
function festReward(i) {
  const F = DB.state.fest, m = C.FEST_MILES[i];
  news(`🏮 Đại lễ đạt ${Math.round(m.at * 100)}%! Thái hậu ban thưởng cả cung: ${m.text}.`, 'phong');
  for (const q of Object.values(DB.players)) {
    const k = F.by[q.id] ? 1 : .5; if (m.silver) q.silver += Math.round(m.silver * k); if (m.turns && F.by[q.id]) q.turns += m.turns; if (m.sung) q.sung += Math.round(m.sung * k); if (m.haiLong) q.haiLong = Math.min(100, q.haiLong + Math.round(m.haiLong * k));
    toast(q, `🏮 Đại lễ đạt ${Math.round(m.at * 100)}%: ${m.text}${k < 1 ? ' (chưa góp sức nên nhận một nửa)' : ''}.`, 'good'); push(q);
  }
}
function festFinish(ok) {
  const F = DB.state.fest; if (!F || F.done) return; F.done = true;
  const best = Object.entries(F.by).sort((a, b) => b[1] - a[1])[0];
  if (ok) {
    news(`🎆 ĐẠI LỄ "${F.name}" viên mãn! Hoàng thượng mở đại yến khao cả hậu cung.`, 'phong');
    if (!(DB.state.feast && !DB.state.feast.done)) { startFeast(20, 'in'); DB.state.feast.big = true; }
  } else news(`🏮 Đại lễ "${F.name}" khép lại ở ${Math.round(F.pts / F.goal * 100)}%. Lần sau cả cung cố gắng hơn.`, 'yentiec');
  if (best) { const q = P(best[0]); if (q) { addPts(q, 30); cnt(q, 'festTop'); news(`🏅 ${q.name} góp sức nhiều nhất cho đại lễ (${best[1]} điểm), được Thái hậu khen là người hiếu tâm.`); push(q); } }
  save();
}
function festTick() {
  const F = DB.state.fest;
  if (F && !F.done && now() > F.end) festFinish(false);
  const w = weekIdx(); if ((!F || F.done) && (DB.state.festWeek == null || w % 2 === 0) && DB.state.festWeek !== w && vnNow().getUTCHours() >= 8) { DB.state.festWeek = w; startFest(); }
}

// ---------------- danh hiệu ----------------
const ACH = [
  { id: 'taisinh', name: 'Phượng hoàng tái sinh', desc: 'Được phục vị từ lãnh cung', need: 1, cur: p => p.cnt?.taisinh || 0 },
  { id: 'dongcam', name: 'Đồng cam cộng khổ', desc: 'Cùng phế phi khác làm việc ở lãnh cung', need: 1, cur: p => p.cnt?.dongcam || 0 },
  { id: 'ngu', name: 'Ngư ông đắc lợi', desc: 'Câu được 100 con cá', need: 100, cur: p => p.cnt?.fish || 0 },
  { id: 'kimly', name: 'Cá chép hóa rồng', desc: 'Câu được 3 cá chép vàng', need: 3, cur: p => p.cnt?.gold || 0 },
  { id: 'tymuoi', name: 'Tỷ muội tình thâm', desc: 'Kết nghĩa tỷ muội', need: 1, cur: p => p.sis ? 1 : (p.cnt?.sis || 0) },
  { id: 'latan', name: 'Thanh thiên bạch nhật', desc: 'Lật án thành công', need: 1, cur: p => p.cnt?.latan || 0 },
  { id: 'tainu', name: 'Đệ nhất tài nữ', desc: 'Thắng 3 yến tiệc', need: 3, cur: p => p.cnt?.feastWin || 0 },
  { id: 'sung', name: 'Sủng quán lục cung', desc: 'Được lật thẻ 5 lần', need: 5, cur: p => p.cnt?.latThe || 0 },
  { id: 'hieu', name: 'Hiếu thuận vô song', desc: 'Thỉnh an 20 lần', need: 20, cur: p => p.cnt?.thinhan || 0 },
  { id: 'chuyencan', name: 'Chuyên cần', desc: 'Điểm danh 7 ngày liền', need: 7, cur: p => p.cnt?.streakMax || 0 },
  { id: 'hoadong', name: 'Trên thuận dưới hòa', desc: 'Thân thiết với cả 4 người: Thái hậu, Quế ma ma, Thái y, Tổng quản', need: 4, cur: p => ['thaihau', 'mama', 'thaiy', 'tonggiam'].filter(n => rel(p, n) >= 30).length },
  { id: 'thantham', name: 'Thần thám hậu cung', desc: 'Giúp Quế ma ma phá 5 vụ án', need: 5, cur: p => p.cnt?.det || 0 },
  { id: 'tuuluong', name: 'Tửu lượng hơn người', desc: 'Thắng tửu lệnh 5 lần', need: 5, cur: p => p.cnt?.tuulenh || 0 },
  { id: 'tinvat', name: 'Châu ngọc mãn lâu', desc: 'Gom đủ 8 tín vật Hoàng thượng ban', need: 8, cur: p => Object.keys(p.tinvat || {}).length },
  { id: 'thoho', name: 'Thi tình họa ý', desc: 'Đối thơ đúng cả 3 câu khi ngắm trăng', need: 1, cur: p => p.cnt?.thoOk || 0 },
  { id: 'kythu', name: 'Kỳ thủ hậu cung', desc: 'Thắng 5 ván cờ vây', need: 5, cur: p => p.cnt?.coWin || 0 },
  { id: 'ngutru', name: 'Bàn tay ngự trù', desc: 'Tự tay nấu 10 món ở Ngự thiện phòng', need: 10, cur: p => p.cnt?.cook || 0 },
  { id: 'thanco', name: 'Thần cơ diệu toán', desc: 'Bỏ phiếu đúng thủ phạm một đại án', need: 1, cur: p => p.cnt?.bigRight || 0 },
  { id: 'hieutam', name: 'Hiếu tâm cảm động', desc: 'Góp sức nhiều nhất một kỳ đại lễ', need: 1, cur: p => p.cnt?.festTop || 0 },
  { id: 'mau', name: 'Mẫu bằng tử quý', desc: 'Hạ sinh hoàng tự', need: 1, cur: p => (p.children || []).length },
  { id: 'hh', name: 'Mẫu nghi thiên hạ', desc: 'Được sắc lập Hoàng hậu', need: 1, cur: p => p.cnt?.hh || 0 },
];
function achName(id, p) { const a = ACH.find(x => x.id === id); return a && p?.ach?.[id] ? a.name : ''; }
function achView(p) { return ACH.map(a => ({ id: a.id, name: a.name, desc: a.desc, need: a.need, cur: p.ach?.[a.id] ? a.need : Math.min(a.need, a.cur(p)), got: !!p.ach?.[a.id] })); }
function checkAch(p) {
  p.ach = p.ach || {};
  for (const a of ACH) if (!p.ach[a.id] && a.cur(p) >= a.need) {
    p.ach[a.id] = now(); if (!p.titleSel) p.titleSel = a.id;
    news(`🏅 ${p.name} đạt danh hiệu 「${a.name}」.`);
    toast(p, `🏅 Danh hiệu mới: 「${a.name}」. Vào mục Danh hiệu để đổi danh hiệu hiển thị.`, 'good');
  }
}

// ---------------- nhiệm vụ tân thủ ----------------
const QUESTS = [
  { t: 'Thỉnh an Thái hậu ở Từ Ninh cung', need: 1, cur: p => p.cnt?.thinhan || 0, r: { silver: 30 }, go: 'tuninh', hl: 'Thỉnh an' },
  { t: 'Câu 3 con cá ở hồ Ngự hoa viên', need: 3, cur: p => p.cnt?.fish || 0, r: { silver: 20 }, go: 'hoavien', hl: 'Câu cá' },
  { t: 'Luyện tài nghệ ở phòng riêng', need: 1, cur: p => p.cnt?.luyen || 0, r: { turns: 1 }, go: 'phong', hl: 'Luyện tài nghệ' },
  { t: 'Bấm vào tên Quế ma ma để trò chuyện', need: 1, cur: p => p.cnt?.npctalk || 0, r: { silver: 20 }, go: 'tuninh', tip: 'Bấm vào chữ vàng "Quế ma ma" trên đầu bà ấy' },
  { t: 'Dò tin sở thích Hoàng thượng ở Ngự hoa viên', need: 1, cur: p => p.cnt?.dotin || 0, r: { turns: 1 }, go: 'hoavien', hl: 'Dò tin' },
  { t: 'Dâng canh ở Dưỡng Tâm điện', need: 1, cur: p => p.cnt?.dangcanh || 0, r: { silver: 40 }, go: 'duongtam', hl: 'Dâng canh' },
  { t: 'Tặng quà cho một phi tần (Hậu cung ở thanh dưới)', need: 1, cur: p => p.cnt?.tangqua || 0, r: { silver: 30 }, ui: 'roster' },
  { t: 'Nhận tra án giúp Quế ma ma và phá được án', need: 1, cur: p => p.cnt?.det || 0, r: { silver: 50 }, go: 'tuninh', hl: 'tra án' },
  { t: 'Kết nghĩa tỷ muội với một người', need: 1, cur: p => p.sis ? 1 : 0, r: { silver: 50 }, ui: 'roster' },
  { t: 'Lên Đáp ứng', need: 2, cur: p => p.rank, r: { silver: 100 } },
  { t: 'Dâng tiết mục ở một buổi yến tiệc', need: 1, cur: p => p.cnt?.feast || 0, r: { turns: 2 }, go: 'hoavien', hl: 'yến tiệc', tip: 'Yến tiệc mở lúc 9h, 11h, 15h, 17h. Xem giờ ở nút 🗓 Hôm nay' },
  { t: 'Lên Thường tại', need: 3, cur: p => p.rank, r: { silver: 150, sung: 10 } },
];
function questView(p) { const i = p.qi || 0, q = QUESTS[i]; return q ? { i, n: QUESTS.length, t: q.t, cur: Math.min(q.need, q.cur(p)), need: q.need, r: q.r, go: q.go || null, hl: q.hl || null, ui: q.ui || null, tip: q.tip || null } : null; }
function checkQuest(p) {
  if (p.qi == null && p.rank >= 3) p.qi = QUESTS.length;
  p.qi = p.qi || 0;
  while (QUESTS[p.qi] && QUESTS[p.qi].cur(p) >= QUESTS[p.qi].need) {
    const q = QUESTS[p.qi], r = q.r; p.qi++;
    if (r.silver) p.silver += r.silver; if (r.turns) p.turns += r.turns; if (r.sung) p.sung += r.sung;
    toast(p, `🎯 Xong nhiệm vụ: ${q.t}. Thưởng ${[r.silver && r.silver + ' bạc', r.turns && r.turns + ' lượt', r.sung && r.sung + ' sủng ái'].filter(Boolean).join(', ')}.${QUESTS[p.qi] ? '' : ' Đã xong hết nhiệm vụ tân thủ!'}`, 'good');
  }
}

// ---------------- sao lưu ----------------
async function backup(force) {
  const k = dayKey(); if (!force && DB.state.bkDay === k) return; DB.state.bkDay = k;
  try {
    const data = JSON.parse(JSON.stringify(DB));
    if (mongo) {
      const col = mongoDb.collection('backup');
      await col.updateOne({ _id: k }, { $set: { data, t: now() } }, { upsert: true });
      const old = await col.find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).skip(7).toArray();
      if (old.length) await col.deleteMany({ _id: { $in: old.map(o => o._id) } });
    } else {
      const dir = path.join(__dirname, 'backups'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, k + '.json'), JSON.stringify(data));
      for (const f of fs.readdirSync(dir).sort().reverse().slice(7)) fs.unlinkSync(path.join(dir, f));
    }
    console.log('backup', k);
  } catch (e) { console.error('backup failed', e.message); }
}
async function listBackups() {
  if (mongo) return (await mongoDb.collection('backup').find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).toArray()).map(o => o._id);
  const dir = path.join(__dirname, 'backups'); return fs.existsSync(dir) ? fs.readdirSync(dir).sort().reverse().map(f => f.replace('.json', '')) : [];
}
async function restore(k) {
  let data = null;
  if (mongo) data = (await mongoDb.collection('backup').findOne({ _id: k }))?.data;
  else { const f = path.join(__dirname, 'backups', k + '.json'); if (fs.existsSync(f)) data = JSON.parse(fs.readFileSync(f, 'utf8')); }
  if (!data) return false;
  DB.players = data.players; DB.state = data.state; DB.state.bkDay = dayKey();
  save(); for (const sk of online.values()) { try { sk.emit('kicked'); sk.disconnect(); } catch (e) {} } online.clear();
  return true;
}

// ---------------- vụ án ----------------
const NPC_SUSPECTS = ['Lệ Tần', 'Hân Quý nhân', 'Cung nữ Xuân Đào', 'Thái giám Tiểu Lộ Tử', 'Mai Đáp ứng', 'Cung nữ Thu Cúc', 'Uyển Quý nhân'];
function makeTraits() { return { cung: rnd(C.TRAITS.cung.length), gio: rnd(C.TRAITS.gio.length), dau: rnd(C.TRAITS.dau.length) }; }
function createCase(victim, culprit /* player or null for NPC */, opts = {}) {
  const id = 'vu' + (DB.state.seq++);
  const MS = opts.det ? C.DET_CASES : opts.thai ? C.THAI_METHODS : C.METHODS;
  const method = (opts.method && MS.find(m => m.id === opts.method)) || pick(MS);
  const t = makeTraits();
  const keys = ['cung', 'gio', 'dau'];
  // nghi phạm giả: mỗi người khác thủ phạm đúng 1 đặc điểm → phải đủ 3 manh mối mới chắc chắn
  const others = Object.values(DB.players).filter(q => q.id !== victim.id && (!culprit || q.id !== culprit.id) && !q.lanh && q.rank >= 2).map(q => ({ id: q.id, name: title(q) }));
  const pool = [...(opts.det ? [] : others.sort(() => Math.random() - 0.5)), ...NPC_SUSPECTS.sort(() => Math.random() - 0.5).map(n => ({ id: 'npc:' + n, name: n }))];
  const culpritEntry = culprit ? { id: culprit.id, name: title(culprit) } : opts.fei ? { id: 'fei:' + opts.fei.id, name: opts.fei.name } : (pool.splice(pool.findIndex(x => x.id.startsWith('npc:')), 1)[0]);
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
    suspects, found: [], blurred: opts.blur ? pick(['gio', 'cung', 'dau']) : null, witness: null, revenge: !!opts.revenge,
    status: 'open', created: now(), thai: !!opts.thai, det: !!opts.det, hours: opts.hours ?? (opts.det ? C.DET_HOURS : opts.thai ? C.THAI_CASE_HOURS + (victim.thai?.antai === dayKey() ? 6 : 0) : C.CASE_HOURS), deadline: opts.det ? now() + C.DET_HOURS * 3600e3 : online.has(victim.id) ? now() + caseHoursFor(victim, opts.hours ?? C.CASE_HOURS) * 3600e3 : null, npc: !culprit,
  };
  DB.state.cases[id] = c;
  const s = sockOf(victim.id);
  if (c.det) {
    if (s) s.emit('cutscene', { type: 'tran', caseId: id, methodName: method.name, hours: C.DET_HOURS });
    push(victim); save(); return c;
  }
  if (!c.det) notify(victim, c.thai ? '🩸 Long thai lâm nguy!' : '⚖️ Bị phát giác!', c.thai ? `Có kẻ dùng ${method.name} hãm hại long thai. Vào game tìm hung thủ!` : `Quế ma ma tìm thấy ${method.name} trong phòng bổn cung. Vào game minh oan!`, 'an');
  if (c.thai) {
    news(`🩸 ${title(victim)} đau bụng dữ dội, Thái y phát hiện ${method.name}. Long thai lâm nguy!`, 'an');
    if (s) s.emit('cutscene', { type: 'thainguy', caseId: id, methodName: method.name, hours: caseHoursFor(victim, c.hours) });
    push(victim); save(); return c;
  }
  news(`Ma ma khám xét phòng ${victim.name} và tìm thấy ${method.name}. ${victim.name} bị gọi lên Từ Ninh cung.`, 'an');
  if (s) s.emit('cutscene', { type: 'phatgiac', caseId: id, method: method.id, methodName: method.name, crime: method.crime, hours: caseHoursFor(victim, opts.hours ?? C.CASE_HOURS), mama: rel(victim, 'mama') });
  push(victim); save();
  return c;
}
function caseView(c, viewer) {
  return {
    id: c.id, method: c.method, methodName: c.methodName, crime: c.crime, status: c.status, deadline: c.deadline, thai: !!c.thai, det: !!c.det,
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
  if (c.det) return;
  if (c.thai) return sayThai(v, 'không tìm ra kẻ hãm hại');
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
    const freeMuu = p.path === 'muuke' && !c.muuFree, freeThu = !freeMuu && (p.items?.manhmoi || 0) > 0 && !data.bribe;
    if (freeThu) { p.items.manhmoi--; toast(p, '📜 Dùng lá thư mật câu được ở hồ: lần tra này miễn phí.', 'good'); }
    else if (!freeMuu) {
      if (p.turns < clue.turn) return toast(p, 'Hết lượt hôm nay.', 'bad');
      let cost = clue.cost; if (data.kind === 'thaiy' && rel(p, 'thaiy') >= 30) cost = Math.round(cost / 2); if (data.kind === 'so' && rel(p, 'tonggiam') >= 30) cost = 0;
      if (p.silver < cost) return toast(p, 'Không đủ bạc.', 'bad');
      p.turns -= clue.turn; p.silver -= cost;
    } else c.muuFree = true;
    revealClue(c, data.kind, p);
    if (data.kind === 'thaiy') relAdd(p, 'thaiy', 3, 'nhờ thần kiểm nghiệm tang vật'); if (data.kind === 'so') relAdd(p, 'tonggiam', 3, 'nhờ nô tài tra sổ quà');
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
    if (isReopen || c.thai || c.det) return;
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
    if (c.det) {
      if (s.guilty) {
        const R = C.DET_REWARD; closeCase(c, 'latan', `Phá án thành công! Thủ phạm là ${s.name}. Thưởng ${R.pts} công trạng, ${R.silver} bạc.`);
        p.silver += R.silver; addPts(p, R.pts); relAdd(p, 'mama', 8, 'giúp lão nô phá vụ ' + c.methodName); cnt(p, 'det');
        news(`🔍 ${p.name} giúp Quế ma ma phá vụ "${c.methodName}": thủ phạm là ${s.name}.`, 'latan');
      } else { closeCase(c, 'vucao', `Chỉ sai người: ${s.name} vô can. Quế ma ma lắc đầu, vụ án chìm xuồng.`); relAdd(p, 'mama', -3, 'chỉ sai người trong vụ ' + c.methodName); }
      save(); push(p); return;
    }
    if (s.guilty) {
      const culprit = P(c.culprit);
      closeCase(c, 'latan', `Lật án thành công. Thủ phạm là ${s.name}.`);
      news(`Lật án! ${p.name} chứng minh mình bị vu oan. Thủ phạm là ${s.name}.`, 'latan');
      p.sung += 10; cnt(p, 'latan');
      if (isReopen) phucVi(p, p.lanh.from, 'sau khi kêu oan thành công');
      else { addPts(p, 20); }
      if (String(c.culprit).startsWith('fei:')) { const n = NPCF().find(x => 'fei:' + x.id === c.culprit); if (n) { npcDemote(n, 'vu oan ' + p.name); feiAdd(p, n.id, -10); freeSeatCheck(); } }
      if (culprit) { relAdd(culprit, 'thaihau', -15, 'bị lật án vì vu oan ' + p.name); relAdd(culprit, 'mama', -15, 'giấu tang vật hại người'); culprit.offenses = (culprit.offenses || 0) + 1; if (c.thai) sendToLanhCung(culprit, 'mưu hại long thai của ' + p.name, null); else if (culprit.rank >= C.FIGHT_RANK + 1) demote(culprit, 2, 'vu oan ' + p.name); else sendToLanhCung(culprit, 'vu oan ' + p.name, null); }
      const sk = sockOf(p.id); if (sk) sk.emit('cutscene', { type: 'latan', name: p.name, culprit: s.name });
    } else {
      if (isReopen) { toast(p, `Kêu oan sai người. ${s.name} vô can.`, 'bad'); c.reopenFail = (c.reopenFail || 0) + 1; }
      else {
        if (c.thai) { closeCase(c, 'vucao', `Chỉ sai người: ${s.name} vô can. Kẻ thật vẫn ung dung, long thai không giữ được.`); relAdd(p, 'thaihau', -5, 'tố sai ' + s.name); sayThai(p, 'bị hãm hại mà không bắt được hung thủ'); save(); push(p); return; }
        closeCase(c, 'vucao', `Chỉ sai người: ${s.name} vô can. Bị phạt thêm tội vu cáo.`);
        news(`${p.name} tố sai ${s.name} trong vụ ${c.methodName}, bị phạt thêm tội vu cáo.`, 'phat');
        relAdd(p, 'thaihau', -10, 'tố sai ' + s.name);
        if (rel(p, 'thaihau') >= 30 && now() - (p.pardonAt || 0) > 7 * 864e5) { p.pardonAt = now(); news(`Thái hậu nể tình ${p.name} hiếu thuận, tha tội vu cáo lần này.`, 'an'); }
        else punishVictim(c, 1, 'vu cáo ' + s.name);
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
      if (c.det) { closeCase(c, 'xu', 'Hết hạn tra án, thủ phạm đã cao chạy xa bay.'); continue; }
      closeCase(c, 'xu', c.thai ? 'Hết hạn mà không tìm ra kẻ hãm hại. Long thai không giữ được.' : `Hết hạn mà không tìm ra thủ phạm. Thái hậu phán phạt.`);
      if (!c.thai) news(`Hết hạn điều tra, Thái hậu phán ${P(c.victim)?.name} có tội ${c.crime}.`, 'phat');
      punishVictim(c, c.revenge ? 1 : 0);
    }
  }
}

// ---------------- lật thẻ ----------------
function latThe(when = 'Đêm nay') {
  const pool = Object.values(DB.players).filter(p => !p.lanh && !p.admin && !p.thai?.known && !(p.sick && p.sickUntil > now()) && !((p.camTucUntil || 0) > now()) && p.rank >= 1 && (online.has(p.id) || now() - (p.lastSeen || p.created || 0) < 3 * 864e5));
  if (!pool.length) return null;
  if (Math.random() < C.NPC_LATTHE && !pool.some(p => online.has(p.id) && !(p.picked1 > 0))) { const ns = NPCF().filter(n => n.rank >= 3); const n = ns.sort((a, b) => b.sung * Math.random() - a.sung * Math.random())[0];
    if (n) { n.sung += 5; n.pts += 15; npcPromote(n); news(`${when} Hoàng thượng lật thẻ bài của ${n.name}.`, 'latthe'); io.emit('latthe', { id: n.id, name: n.name, when }); for (const p of pool) { p.notPicked = (p.notPicked || 0) + 1; } return null; } }
  const weight = p => {
    let m = 1;
    if (p.picked1 === 1) m = 0.4; if (p.picked1 >= 2) m = 0.15;
    if ((p.notPicked || 0) >= 5) m = 1.5;
    if (colorMatch(p)) m *= 1.4;
    if (p.huong) m *= 1.6;
    m *= 1 + 0.1 * (p.children || []).length; if (p.jewels?.includes('tramthuy')) m *= 1.15;
    return Math.max(0.05, (10 + p.sung + p.stats.tai * 0.5) * m);
  };
  const n = Math.min(C.LAT_THE_MAX || 2, 1 + Math.floor(pool.length / C.LAT_THE_CROWD)), left = [...pool], picked = [];
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
    chosen.tamCungUntil = now() + 2 * 3600e3; cnt(chosen, 'latThe'); diary(chosen, `${when} Hoàng thượng lật thẻ bài của bổn cung.`);
    if (!chosen.thai && now() - (chosen.bornAt || 0) > 2 * 864e5 && Math.random() < C.THAI_CHANCE) chosen.thai = { since: now(), known: false };
    news(longAbsent ? `Hoàng thượng chợt nhớ người cũ: ${when.toLowerCase()} lật thẻ bài của ${title(chosen)}.` : `${when} Hoàng thượng lật thẻ bài của ${title(chosen)}.`, 'latthe');
    io.emit('latthe', { id: chosen.id, name: title(chosen), when });
    notify(chosen, '🏮 Được lật thẻ bài!', `${when} Hoàng thượng lật thẻ bài của bổn cung. Vào tẩm cung trong 2 giờ.`, 'latthe');
    addPts(chosen, C.LAT_THE.pts); push(chosen);
  }
  // an ủi: người không được chọn nhận quà Hoàng thượng ban
  const G = C.LAT_THE_GIFT;
  if (pool.length > picked.length) news(`🎁 Hoàng thượng ban quà an ủi cho ${pool.length - picked.length} phi tần không được lật thẻ (+${C.LAT_THE_GIFT.silver} bạc, +${C.LAT_THE_GIFT.sung} sủng ái).`, 'an');
  for (const p of pool) if (!picked.includes(p)) { p.silver += G.silver; p.sung += G.sung; toast(p, `🎁 Hoàng thượng ban ${pick(['một hộp điểm tâm', 'một xấp lụa', 'một cây trâm bạc', 'một bình trà ngon'])} an ủi: +${G.silver} bạc, +${G.sung} sủng ái.`, 'good'); push(p); }
  save();
  return picked[0];
}
// ---------------- thỉnh an: Thái hậu trọng hiếu đạo, tiết kiệm, mộ Phật; ghét xa hoa, đố kỵ ----------------
const TH_Q = [
  { q: 'Dạo này con đọc sách gì?', opts: [{ t: 'Thần thiếp chép Kinh Kim Cang cầu phúc cho Thái hậu.', s: 4, r: 'Con có lòng hiếu thảo, ai gia rất vui.' }, { t: 'Thần thiếp đọc thơ Lý Bạch cho khuây khỏa.', s: 1, r: 'Thơ phú cũng tốt, nhưng đừng sa đà.' }, { t: 'Thần thiếp bận may áo mới cho kịp yến tiệc.', s: -2, r: 'Hừ, trong cung không thiếu áo đẹp, thiếu người biết giữ mình.' }] },
  { q: 'Nghe nói Nội vụ phủ chi tiêu nhiều quá…', opts: [{ t: 'Thần thiếp xin giảm phần bổng lộc của mình.', s: 4, r: 'Biết tiết kiệm, đúng là phúc của hậu cung.' }, { t: 'Thần thiếp không rõ chuyện này ạ.', s: 0, r: 'Ừ, con cứ lo bổn phận là được.' }, { t: 'Chắc tại các cung khác xa hoa quá.', s: -2, r: 'Đừng đem chuyện người khác ra nói trước mặt ai gia.' }] },
  { q: 'Hoàng thượng dạo này hay lui tới cung nào?', opts: [{ t: 'Thần thiếp chỉ mong Hoàng thượng khỏe mạnh, không dám dò xét.', s: 4, r: 'Biết giữ phận, tốt lắm.' }, { t: 'Nghe nói cung Tần phi được sủng ái lắm.', s: -2, r: 'Lòng đố kỵ là đại kỵ trong cung, nhớ lấy.' }, { t: 'Thần thiếp không để ý ạ.', s: 1, r: 'Ừ.' }] },
  { q: 'Ai gia hơi đau đầu mấy hôm nay.', opts: [{ t: 'Thần thiếp xin hầu hạ thuốc thang bên cạnh Thái hậu.', s: 4, r: 'Con ngoan lắm. Ai gia thấy đỡ hơn rồi.' }, { t: 'Để thần thiếp gọi thái y tới ngay.', s: 2, r: 'Ừ, cũng được.' }, { t: 'Chắc tại trời nóng thôi ạ.', s: -1, r: '…' }] },
  { q: 'Mùng một này ai gia lên chùa dâng hương, con có muốn theo không?', opts: [{ t: 'Thần thiếp xin được theo hầu, ăn chay ba ngày trước.', s: 4, r: 'Thành tâm như vậy, Phật tổ sẽ phù hộ con.' }, { t: 'Thần thiếp xin theo ạ.', s: 2, r: 'Được.' }, { t: 'Hôm đó thần thiếp lỡ hẹn tập đàn mất rồi.', s: -2, r: 'Đàn sáo quan trọng hơn lễ Phật sao?' }] },
  { q: 'Trời trở lạnh rồi, cung con đã đủ than sưởi chưa?', opts: [{ t: 'Đủ cả ạ. Thần thiếp chỉ lo Từ Ninh cung thiếu, đã sai người mang thêm tới.', s: 4, r: 'Con chu đáo quá.' }, { t: 'Dạ đủ ạ, đa tạ Thái hậu quan tâm.', s: 2, r: 'Ừ, giữ ấm vào.' }, { t: 'Nội vụ phủ cấp than ít quá, Thái hậu nói giúp thần thiếp.', s: -2, r: 'Mới vào cung đã kêu ca.' }] },
  { q: 'Ai gia nghe con biết thêu thùa?', opts: [{ t: 'Thần thiếp đang thêu bức Bách Thọ đồ dâng Thái hậu mừng thọ.', s: 4, r: 'Tốt, ai gia sẽ chờ.' }, { t: 'Dạ biết chút ít thôi ạ.', s: 1, r: 'Khiêm tốn là tốt.' }, { t: 'Thần thiếp thêu đẹp nhất cung đấy ạ!', s: -2, r: 'Khoe khoang không phải đức của phi tần.' }] },
  { q: 'Hôm qua có người cãi nhau ở Ngự hoa viên, con có thấy không?', opts: [{ t: 'Thần thiếp không thấy, nhưng xin Thái hậu đừng phiền lòng vì chuyện nhỏ.', s: 4, r: 'Ừ, con hiểu chuyện.' }, { t: 'Có ạ, là hai người ở Tây lục cung.', s: -1, r: 'Ai gia không hỏi con đi mách lẻo.' }, { t: 'Thần thiếp ở trong phòng cả ngày ạ.', s: 1, r: 'Ừ.' }] },
  { q: 'Con nhớ nhà không?', opts: [{ t: 'Có ạ, nhưng vào cung được hầu Thái hậu cũng như có mẹ hiền.', s: 4, r: 'Đứa nhỏ này khéo nói.' }, { t: 'Thần thiếp nhớ mẹ lắm ạ.', s: 2, r: 'Lòng hiếu thảo đáng quý.' }, { t: 'Không ạ, trong cung vui hơn nhiều.', s: -1, r: 'Hừ, cha mẹ nuôi con khổ cực…' }] },
  { q: 'Ai gia muốn ăn chay bảy ngày cầu mưa.', opts: [{ t: 'Thần thiếp xin ăn chay cùng Thái hậu.', s: 4, r: 'Thành tâm lắm.' }, { t: 'Thần thiếp sẽ sai ngự thiện phòng nấu món chay ngon.', s: 2, r: 'Được, con chu đáo.' }, { t: 'Bảy ngày lâu quá, Thái hậu giữ sức khỏe ạ.', s: 0, r: 'Ai gia tự biết.' }] },
  { q: 'Con thấy Hoàng thượng dạo này gầy đi không?', opts: [{ t: 'Thần thiếp sẽ nấu canh bồi bổ, khuyên Hoàng thượng nghỉ sớm.', s: 4, r: 'Có con lo, ai gia yên tâm.' }, { t: 'Thần thiếp ít được gặp Hoàng thượng ạ.', s: 0, r: 'Thế thì cố mà được gặp.' }, { t: 'Chắc tại các cung khác làm người mệt.', s: -2, r: 'Lại đố kỵ.' }] },
  { q: 'Cung nữ của con hầu hạ có chu đáo không?', opts: [{ t: 'Dạ chu đáo, thần thiếp thường ban thưởng để các em vui lòng.', s: 4, r: 'Biết thương người dưới, tốt.' }, { t: 'Dạ cũng được ạ.', s: 1, r: 'Ừ.' }, { t: 'Vụng về lắm, thần thiếp phạt quỳ suốt.', s: -2, r: 'Hà khắc quá thì lòng người không theo đâu.' }] },
  { q: 'Năm nay mừng thọ ai gia, con định dâng gì?', opts: [{ t: 'Thần thiếp chép trăm chữ Thọ, mỗi chữ một nét bút thành tâm.', s: 4, r: 'Quà quý nhất là tấm lòng.' }, { t: 'Thần thiếp đặt một chuỗi ngọc ở Nội vụ phủ.', s: 1, r: 'Cũng được.' }, { t: 'Thần thiếp định đặt may áo lông chồn cho Thái hậu.', s: -1, r: 'Xa hoa quá, ai gia không cần.' }] },
  { q: 'Gần đây có ai ức hiếp con không?', opts: [{ t: 'Không ạ, các tỷ tỷ đối xử với thần thiếp rất tốt.', s: 4, r: 'Hậu cung hòa thuận, ai gia vui.' }, { t: 'Có chút chuyện, nhưng thần thiếp tự giải quyết được.', s: 2, r: 'Biết nhẫn nhịn, tốt.' }, { t: 'Có ạ, Thái hậu phải làm chủ cho thần thiếp!', s: -1, r: 'Chuyện nhỏ cũng đem lên đây sao?' }] },
  { q: 'Con thấy ai gia mặc áo màu này có hợp không?', opts: [{ t: 'Màu trầm này tôn lên khí chất đoan trang của Thái hậu.', s: 4, r: 'Con có mắt nhìn.' }, { t: 'Dạ hợp lắm ạ.', s: 2, r: 'Ừ.' }, { t: 'Thái hậu mặc đỏ chắc trẻ ra mười tuổi!', s: -1, r: 'Ai gia tuổi này còn mặc đỏ gì nữa.' }] },
  { q: 'Hôm nay ai gia muốn nghe con đọc kinh.', opts: [{ t: 'Thần thiếp xin đọc Kinh Phổ Môn cầu bình an cho Thái hậu.', s: 4, r: 'Giọng con trong, ai gia nghe thấy an lòng.' }, { t: 'Thần thiếp đọc chưa thạo, xin Thái hậu chỉ dạy.', s: 2, r: 'Ừ, từ từ rồi sẽ quen.' }, { t: 'Thần thiếp xin hát một khúc thay ạ?', s: -2, r: 'Chốn Phật đường mà hát hò gì.' }] },
  { q: 'Con thấy Hoàng hậu thế nào?', opts: [{ t: 'Hoàng hậu đoan trang, thần thiếp luôn kính trọng.', s: 4, r: 'Biết tôn ti trật tự, tốt.' }, { t: 'Thần thiếp không dám bàn luận ạ.', s: 2, r: 'Ừ, cẩn trọng là phải.' }, { t: 'Nghe nói Hoàng hậu hơi nghiêm khắc…', s: -2, r: 'Lời này đừng để ai nghe thấy.' }] },
  { q: 'Con thấy hậu cung bây giờ thế nào?', opts: [{ t: 'Nhờ Thái hậu dạy dỗ, các tỷ muội hòa thuận.', s: 4, r: 'Phải, hòa thuận là quý nhất.' }, { t: 'Có vài người hay gây chuyện thị phi.', s: -1, r: 'Ai gia tự có chừng mực, con đừng xen vào.' }, { t: 'Thần thiếp mới vào, chưa dám đánh giá.', s: 1, r: 'Biết khiêm tốn.' }] },
];
const INVITES = {};
function npcLine(p, n) {
  const r = rel(p, n), log = (p.relLog || {})[n] || [], last = log[0];
  const mem = last ? (last.d > 0 ? `Lần trước ${n === 'thaihau' ? 'con' : 'nương nương'} ${last.memo}, ${n === 'thaihau' ? 'ai gia' : n === 'tonggiam' ? 'nô tài' : n === 'thaiy' ? 'thần' : 'lão nô'} vẫn nhớ.` : `Chuyện ${last.memo} hôm trước… ${n === 'thaihau' ? 'ai gia' : 'lão nô'} chưa quên đâu.`) : '';
  const L = {
    thaihau: r >= 30 ? 'Con đến rồi à, lại đây ngồi gần ai gia.' : r <= -30 ? 'Có chuyện gì thì nói nhanh, ai gia mệt.' : 'Ừ, con đến thỉnh an đấy à.',
    mama: r >= 30 ? 'Nương nương cứ yên tâm, có chuyện gì lão nô sẽ nương tay.' : r <= -30 ? 'Hừ, lão nô để mắt tới nương nương đấy.' : 'Quy củ trong cung nghiêm ngặt, nương nương nhớ giữ mình.',
    thaiy: r >= 30 ? 'Nương nương cần gì cứ sai bảo, thuốc thử thần lấy nửa giá thôi.' : r <= -30 ? 'Thần đang bận, nương nương đợi chút.' : 'Nương nương khí sắc tốt lắm.',
    tonggiam: r >= 30 ? 'Chủ tử muốn tra sổ quà cứ nói, nô tài không lấy tiền.' : r <= -30 ? 'Nô tài bận hầu Hoàng thượng.' : 'Chủ tử có việc gì sai bảo ạ?',
  }[n];
  return (mem ? mem + ' ' : '') + L;
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
  const ids = Object.keys(f.entries); const duet = id => { const q = P(id); return q && q.sis && ids.some(x => x !== id && P(x)?.sis === q.sis); };
  const list = Object.entries(f.entries).map(([id, e]) => ({ id, ...e, duet: duet(id), score: e.q * 100 + (TM_CAT(e.tai) === C.HT.tai[h.tai] ? 25 : 0) + (e.color ? 15 : 0) + (duet(id) ? 15 : 0) + (P(id)?.jewels?.includes('tramphuong') ? 10 : 0) + (e.bonus || 0) + Math.random() * 10 }));
  const gs = new Set(list.filter(e => e.duet).map(e => P(e.id).sis)); for (const gid of gs) { const g = DB.state.groups[gid]; if (g) news(`🎶 Tỷ muội "${g.name}" cùng dâng tiết mục hợp tấu, Hoàng thượng vỗ tay khen hay.`); }
  list.sort((a, b) => b.score - a.score);
  if (f.host) { const h = P(f.host); if (h) { const b = list.length * 4; addPts(h, b); h.haiLong = Math.min(100, h.haiLong + (list.length >= 2 ? 3 : 0)); toast(h, `Yến tiệc bổn cung tổ chức có ${list.length} tiết mục: +${b} công trạng.`, 'good'); push(h); } }
  const kinds = new Set(list.map(e => e.tai)); if (kinds.size >= 3) { for (const e of list) { const q = P(e.id); if (q) q.sung += 5; } news(`🎊 Yến tiệc phong phú ${kinds.size} loại tiết mục (${[...kinds].map(TM_NAME).join(', ')}), Hoàng thượng thưởng mọi người dâng tiết mục thêm 5 sủng ái.`); }
  if (list.length) {
    const w = P(list[0].id), x2 = evOn('disan') ? 2 : 1; if (w) { w.sung += 12 * x2; w.silver += 80 * x2; w.turns += 2; addPts(w, 20 * x2); cnt(w, 'feastWin'); push(w); }
    for (const e of list.slice(1)) { const q = P(e.id); if (q) { q.silver += 20; q.turns += 1; push(q); } }
    news(`🏮 Yến tiệc tàn. Hoàng thượng khen tiết mục ${TM_NAME(list[0].tai)} của ${list[0].name} xuất sắc nhất, ban thưởng sủng ái, 80 lượng bạc, 2 lượt.`, 'phong');
  } else news('Yến tiệc tàn mà không ai dâng tiết mục, Hoàng thượng phẩy tay hồi cung.', 'yentiec');
  setTimeout(() => { for (const [id, sk] of online) { const q = P(id); if (q && q.loc === 'yentiec') { enter(q, 'hoavien', sk); push(q); } } }, 6000);
  io.emit('feastEnd', { winner: list[0] ? { id: list[0].id, name: list[0].name, tai: TM_NAME(list[0].tai) } : null }); save();
}
function feastTick(mins, k) {
  const f = DB.state.feast;
  if (f && !f.done && now() > f.end) endFeast(); else feastLive();
  DB.state.feastDone = DB.state.feastDone || {};
  C.FEAST_SLOTS.forEach(([h, m, venue], i) => { const key = k + ':' + i, st = h * 60 + m; if (mins >= st && mins < st + C.FEAST_MIN && !DB.state.feastDone[key]) { DB.state.feastDone[key] = 1; startFeast(C.FEAST_MIN - (mins - st), venue); } });
}
// ---------- yến tiệc sôi động: tiết mục, kính rượu, tửu lệnh, cùng múa ----------
const TIET_MUC = { 'đàn': ['Đàn tranh', 'đàn'], 'múa': ['Múa quạt', 'múa'], 'lụa': ['Múa lụa', 'múa'], 'kiếm': ['Kiếm vũ', 'múa'], 'thơ': ['Ngâm thơ', 'thơ'], 'hát': ['Hát khúc Giang Nam', 'đàn'] };
const TM_NAME = t => TIET_MUC[t]?.[0] || t, TM_CAT = t => TIET_MUC[t]?.[1] || t;
const THANH_NGU = ['Hoa nhường|nguyệt thẹn', 'Chim sa|cá lặn', 'Nghiêng nước|nghiêng thành', 'Tài sắc|vẹn toàn', 'Mẹ tròn|con vuông', 'An cư|lạc nghiệp', 'Thuận buồm|xuôi gió', 'Vạn sự|như ý', 'Phúc như|Đông Hải', 'Thọ tỷ|Nam Sơn', 'Mưa thuận|gió hòa', 'Quốc thái|dân an', 'Môn đăng|hộ đối', 'Tâm đầu|ý hợp', 'Đồng cam|cộng khổ', 'Kề vai|sát cánh', 'Nước chảy|đá mòn', 'Mật ngọt|chết ruồi', 'Khẩu Phật|tâm xà', 'Ăn cháo|đá bát', 'Tai vách|mạch rừng', 'Bán tín|bán nghi', 'Lá ngọc|cành vàng', 'Mắt phượng|mày ngài', 'Liễu yếu|đào tơ', 'Tài hoa|bạc mệnh', 'Cầm kỳ|thi họa', 'Trăng thanh|gió mát', 'Non xanh|nước biếc', 'Cá chậu|chim lồng', 'Oan gia|ngõ hẹp', 'Gần mực thì đen|gần đèn thì sáng', 'Ăn quả|nhớ kẻ trồng cây', 'Uống nước|nhớ nguồn', 'Có công mài sắt|có ngày nên kim', 'Một cây làm chẳng nên non|ba cây chụm lại nên hòn núi cao', 'Lời nói chẳng mất tiền mua|lựa lời mà nói cho vừa lòng nhau', 'Thương người|như thể thương thân', 'Kính trên|nhường dưới'];
const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const HT_FEAST = ['Rót rượu cho trẫm!', 'Hôm nay vui quá, các ái phi cứ tự nhiên.', 'Ai dâng tiết mục tiếp theo nào?', 'Nhạc công tấu khúc nào rộn ràng lên!', 'Trẫm uống một chén, các nàng cũng phải uống một chén!', 'Tửu lệnh đâu? Trẫm muốn xem ai nhanh trí nhất.'];
const roomSay = (text, who = '🏮 Yến tiệc') => io.to('yentiec').emit('chat', { id: null, name: who, text });
const htSay = text => io.to('yentiec').emit('npcSay', { who: 'Hoàng thượng', text });
function feastLive() {
  const f = DB.state.feast; if (!f || f.done) return;
  if (!f.tlNext) f.tlNext = f.start + 90e3;
  const t = f.tl;
  if (t && !t.done && now() > t.end) { t.done = true; roomSay(`Hết giờ! Không ai đối được. Đáp án: "${t.a}". Hoàng thượng cười phạt cả bàn một chén rượu.`, '🍶 Tửu lệnh'); htSay('Ha ha, phạt! Cả bàn uống!'); io.to('yentiec').emit('tuulenh', null); }
  if ((!t || t.done) && now() >= f.tlNext && now() < f.end - 60e3) {
    const [q, a] = pick(THANH_NGU).split('|'); f.tl = { q, a, end: now() + 45e3, done: false }; f.tlNext = now() + 4 * 60e3;
    roomSay(`TỬU LỆNH! Nối tiếp câu: "${q} …" Ai gõ đúng vào ô chat trước được Hoàng thượng thưởng rượu!`, '🍶 Tửu lệnh'); io.to('yentiec').emit('tuulenh', { q, end: f.tl.end });
  }
  if (!f.showAt) f.showAt = f.start + 150e3;
  // đoàn ca vũ diễn 3 lần mỗi buổi yến tiệc, cách nhau khoảng 5 phút
  if ((f.shows || 0) < 3 && now() >= (f.nextShow || f.showAt) && now() < f.end - 60e3) { f.shows = (f.shows || 0) + 1; f.nextShow = now() + 5 * 60e3; startNpcShow(f); }
  if (!f.htNext) f.htNext = now() + 60e3;
  if (now() >= f.htNext) { f.htNext = now() + (70 + rnd(50)) * 1000; htSay(pick(HT_FEAST)); }
}
function startNpcShow(f) {
  const n = f.shows || 1; f.show = { at: now() + 2500, n };
  roomSay(n === 1 ? 'Đoàn ca vũ Giáo phường xin dâng tiết mục: Thị vệ kiếm vũ, cung nữ múa lụa! Mời các vị chủ tử thưởng thức.' : n === 2 ? 'Giáo phường xin dâng tiếp điệu múa mới: Thị vệ kiếm vũ, cung nữ múa Nghê Thường!' : 'Giáo phường xin dâng tiết mục cuối buổi: kiếm vũ và múa lụa tiễn khách!', '🎭 Giáo phường');
  io.to('yentiec').emit('npcShow', f.show); htSay('Tốt! Cho vào biểu diễn.');
}
function tuuLenhAnswer(p, text) {
  const f = DB.state.feast, t = f?.tl; if (!t || t.done || p.loc !== 'yentiec') return;
  if (!norm(text).includes(norm(t.a))) return;
  t.done = true; p.sung += 3; p.silver += 15; cnt(p, 'tuulenh'); festAdd(p, 5, 'tửu lệnh'); push(p);
  setTimeout(() => { roomSay(`${p.name} đối nhanh nhất: "${t.q} ${t.a}"! Được Hoàng thượng ban một chén ngự tửu (+3 sủng ái, +15 bạc). Những người còn lại phạt một chén!`, '🍶 Tửu lệnh'); htSay(pick(['Nhanh trí lắm! Thưởng!', 'Hay! Rót rượu cho nàng!', 'Giỏi, trẫm uống mừng nàng một chén.'])); io.to('yentiec').emit('tuulenh', null); }, 300);
}
// ---------- cờ vây giữa người chơi ----------
const GO = import('./public/js/go.js'); const GAMES = {};
function coEnd(X, G) {
  const sc = G.score(X.g), win = X.resign ? 3 - X.resign : sc.winner; const W = P(win === 1 ? X.black : X.white), L = P(win === 1 ? X.white : X.black);
  delete GAMES[X.id]; if (!W || !L) return;
  const txt = X.resign ? `${L.name} chịu thua, ${W.name} thắng ván cờ vây.` : `Đếm quân: đen ${sc.black}, trắng ${sc.white} (đã cộng 5.5 mục chấp). ${W.name} thắng!`;
  io.to(X.room).emit('coEnd', { id: X.id, text: txt, winner: W.id }); io.to(X.room).emit('chat', { id: null, name: '⚫⚪ Cờ vây', text: txt });
  for (const [q, w] of [[W, 1], [L, 0]]) { q.coDay = q.coDay?.d === dayKey() ? q.coDay : { d: dayKey(), n: 0 }; if (q.coDay.n < 5) { q.coDay.n++; addPts(q, w ? 10 : 4); if (w) q.sung += 2; } cnt(q, 'co'); if (w) cnt(q, 'coWin'); push(q); }
  if (X.g.moves > 30) news(`⚫⚪ ${W.name} thắng ${L.name} một ván cờ vây.`); save();
}
// ---------- LỄ TẨY TAM (tắm 3 ngày) và TRẢO CHU (bốc đồ đoán tương lai) ----------
const TAYTAM_ITEM = { trung: ['🥚 Trứng nhuộm đỏ', 'chúc bé khỏe mạnh', c => c.hp = Math.min(100, c.hp + 5)], hanh: ['🌱 Hành lá', 'chúc bé thông minh', c => c.van += 2], tien: ['🪙 Đồng tiền vàng', 'chúc bé phúc lộc đầy nhà', null], ngai: ['🌿 Ngải cứu', 'chúc bé bình an', c => c.ngoan = Math.min(100, c.ngoan + 3)], que: ['🌸 Hoa quế', 'chúc bé đỗ đạt hiển vinh', c => c.duc += 2] };
const TRAOCHU = [['sach', '📖 Sách', 'van', 'Bé bốc quyển sách: ngày sau văn chương lỗi lạc!'], ['kiem', '🗡 Kiếm gỗ', 'vo', 'Bé cầm thanh kiếm: ngày sau võ nghệ hơn người!'], ['dan', '🎵 Cây đàn', 'nghe', 'Bé ôm cây đàn: ngày sau cầm kỳ thi họa tinh thông!'], ['an', '💮 Ấn ngọc', null, 'Bé nắm chặt ấn ngọc! Điềm đại quý, cả cung xôn xao!'], ['bantinh', '🧮 Bàn tính', null, 'Bé lắc lắc bàn tính: ngày sau giỏi tính toán, của cải đầy kho!'], ['son', '💄 Hộp son', 'duc', 'Bé mở hộp son: ngày sau dung mạo đoan trang, hiền thục!']];
function lePub() { const L = DB.state.le; if (!L) return null; return { kind: L.kind, host: L.host, hostName: L.hostName, cid: L.cid, child: L.child, sex: L.sex, end: L.end, gifts: L.gifts.map(g => ({ name: g.name, item: g.item })), pick: L.pick || null }; }
function leEmit() { emitSplit('le', lePub(), DB.state.le?.test); }
function leTick() { return quiet(DB.state.le?.test, leTick0); }
function leTick0() {
  const L = DB.state.le; if (!L || now() < L.end) return; const h = P(L.host), c = h && kidOf(h, L.cid);
  if (L.kind === 'taytam') { DB.state.le = null; if (h && c) { addPts(h, 5 + 3 * L.gifts.length); news(`🛁 Lễ tẩy tam của ${kidTitle(c)} kết thúc, ${L.gifts.length} người tới thả lễ vào chậu chúc phúc.`); push(h); kidEmit(h); } leEmit(); save(); return; }
  if (L.kind === 'traochu' && !L.pick) {
    const k = Math.random() < .12 ? 3 : [0, 1, 2, 4, 5][rnd(5)]; const it = TRAOCHU[k]; L.pick = it[0]; L.end = now() + 25e3;
    if (h && c) { c.talent = it[0]; c.traochu = true; if (it[2]) c[it[2]] += 8; if (it[0] === 'an') c.an = true; if (it[0] === 'bantinh') h.silver += 100;
      news(`🎎 Lễ trảo chu của ${kidTitle(c)}: ${it[3]}`, it[0] === 'an' ? 'phong' : undefined); push(h); kidEmit(h); }
    leEmit(); save(); return;
  }
  DB.state.le = null; leEmit();
}
function leSock(sock, getMe) {
  setTimeout(() => { const me = getMe(); sock.emit('le', DB.state.le?.test && !me?.admin ? null : lePub()); }, 1500);
  sock.on('le', d => { const me0 = getMe(), c0 = d?.op === 'start' && me0 && kidOf(me0, String(d.cid || '')); quiet(DB.state.le?.test || c0?.test, () => {
    const me = getMe(); if (!me || !d) return; const L = DB.state.le; if (L?.test && !me.admin) return;
    if (d.op === 'start') {
      if (L) return toast(me, 'Trong cung đang có lễ khác, đợi xong đã.'); if (me.loc !== 'phong' || me.visit) return toast(me, 'Về cung riêng mới làm lễ được.');
      const c = kidOf(me, String(d.cid || '')); if (!c || c.ward) return; const st = kidStage(c);
      if (d.kind === 'taytam') { if (st !== 'so' || c.taytam) return toast(me, 'Lễ tẩy tam chỉ làm một lần khi bé còn sơ sinh.'); c.taytam = true; DB.state.le = { test: !!c.test, kind: 'taytam', host: me.id, hostName: me.name, cid: c.id, child: c.name, sex: c.sex, end: now() + C.LE.TAYTAM_MIN * 60e3, gifts: [] }; news(`🛁 ${title(me)} làm lễ tẩy tam cho ${kidTitle(c)}. Mời các tỷ muội tới cung thả lễ chúc phúc!`, 'phong'); }
      else if (d.kind === 'traochu') { if (st !== 'chap' || c.traochu) return toast(me, 'Lễ trảo chu làm một lần lúc bé chập chững.'); DB.state.le = { test: !!c.test, kind: 'traochu', host: me.id, hostName: me.name, cid: c.id, child: c.name, sex: c.sex, end: now() + C.LE.TRAOCHU_SEC * 1000, gifts: [] }; news(`🎎 ${title(me)} bày lễ trảo chu cho ${kidTitle(c)}. Mời cả cung tới xem bé bốc đồ đoán tương lai!`, 'phong'); }
      else return;
      for (const q of Object.values(DB.players)) if (q.id !== me.id && !q.lanh && online.has(q.id)) notify(q, DB.state.le.kind === 'taytam' ? '🛁 Mời dự lễ tẩy tam' : '🎎 Mời xem lễ trảo chu', `Tới cung ${me.name}.`, 'le');
      leEmit(); save(); return;
    }
    if (!L) return;
    if (d.op === 'join') { if (me.id === L.host) return; const h = P(L.host); if (!h) return; me.visit = h.id; enter(me, 'phong', sock); push(me); return; }
    if (d.op === 'gift' && L.kind === 'taytam') { if (me.id === L.host || me.visit !== L.host || me.loc !== 'phong') return; if (L.gifts.some(g => g.id === me.id)) return toast(me, 'Đã thả lễ rồi.'); const it = TAYTAM_ITEM[d.item]; if (!it) return; if (me.silver < C.LE.GIFT) return toast(me, `Cần ${C.LE.GIFT} bạc.`, 'bad');
      me.silver -= C.LE.GIFT; L.gifts.push({ id: me.id, name: me.name, item: d.item }); addPts(me, 4); const h = P(L.host), c = h && kidOf(h, L.cid); if (c && it[2]) it[2](c); if (h && d.item === 'tien') { h.silver += 15; push(h); }
      io.to(roomOf(me)).emit('chat', { id: null, name: '🛁', text: `${me.name} thả ${it[0]} vào chậu, ${it[1]}.` }); toast(me, 'Đã thả lễ chúc phúc.', 'good'); push(me); if (h) kidEmit(h); leEmit(); return; }
  }); });
}
// ---------- CHUYỂN DẠ: cả cung chờ tin ở sân cung người mẹ ----------
const SINH_LINES = { kieu: ['Hừ, sinh con thôi mà làm rùm beng cả hậu cung.', 'Để xem là hoàng tử hay công chúa đã.'], xao: ['Bổn cung chúc mừng muội muội trước nhé, ha ha.', 'Mong mẹ tròn con vuông…'], hien: ['A di đà Phật, mong muội ấy bình an.', 'Bổn cung đã chép kinh cầu phúc cho muội ấy.'], danh: ['Đứng chờ lâu mỏi cả chân.', 'Nhanh lên chứ.'], ninh: ['Hoàng thượng đừng lo, muội ấy phúc lớn mạng lớn.', 'Thần thiếp đã sai người hầm canh sâm sẵn.'], nhut: ['Thần thiếp… thần thiếp hồi hộp quá.', 'Có cần thần thiếp giúp gì không ạ?'] };
function sinhPub() { const S = DB.state.sinh; if (!S) return null; return { id: S.id, name: S.name, cung: S.cung, phase: S.phase, until: S.until, pray: S.pray.length, gifts: S.gifts.length, prayed: S.pray, gave: S.gifts, sam: S.sam ? P(S.sam)?.name : null, sex: S.sex || null, child: S.child || null, hard: !!S.hard, fei: S.fei }; }
function sinhEmit() { emitSplit('sinh', sinhPub(), DB.state.sinh?.test); }
function sinhStart(p) {
  const s = sockOf(p.id); if (!s || DB.state.sinh) return false;
  const fei = NPCF().filter(n => n.rank >= 3).sort((a, b) => b.rank - a.rank).slice(0, 3).map(n => ({ name: n.name, model: n.model, tinh: n.tinh }));
  DB.state.sinh = { test: !!p.thai?.test, id: p.id, name: p.name, cung: (p.rank >= C.PALACE_RANK ? 'Cung ' : 'Phòng ') + p.name, start: now(), phase: 'cho', until: now() + C.SINH.CHO_MIN * 60e3, pray: [], gifts: [], sab: [], q: null, sam: null, fei };
  news(`🏮 ${title(p)} chuyển dạ! Hoàng thượng đã tới sân cung chờ tin. Các phi tần mau tới cầu phúc.`, 'phong');
  for (const q of Object.values(DB.players)) if (q.id !== p.id && !q.lanh) notify(q, `🏮 ${p.name} chuyển dạ`, 'Tới sân cung chờ tin cùng Hoàng thượng.', 'sinh');
  enter(p, 'sansinh', s); sinhEmit(); s.emit('sinhTho'); save(); return true;
}
function sinhTick() { return quiet(DB.state.sinh?.test, sinhTick0); }
function sinhTick0() {
  const S = DB.state.sinh; if (!S) return; const p = P(S.id); if (!p) { DB.state.sinh = null; return sinhEmit(); }
  if (now() < S.until) return;
  if (S.phase === 'cho') {
    const care = p.thai?.care || 0, q = S.q ?? .6, sabs = S.sab.filter(x => !x.caught).length;
    const hp = Math.max(.05, Math.min(.95, (q < .45 ? .6 : .15) + (care < 2 ? .25 : 0) + .35 * sabs - .08 * S.pray.length));
    S.hard = Math.random() < hp;
    if (S.hard) { S.phase = 'kho'; S.until = now() + C.SINH.KHO_MIN * 60e3; news(`⚠️ Thái y quỳ trước Hoàng thượng: ${S.name} khó sinh, cần gấp nhân sâm ngàn năm!`, 'phong'); return sinhEmit(); }
    S.phase = 'bao';
  } else if (S.phase === 'kho') S.phase = 'bao';
  else if (S.phase === 'bao' && !S.sex && !S.names) { // Hoàng thượng đưa tên, người mẹ chọn
    S.sexPre = Math.random() < .5 ? 'trai' : 'gai'; const used = new Set((p.children || []).map(c => c.name));
    S.names = C.CHILD_NAMES[S.sexPre].filter(n => !used.has(n)).sort(() => Math.random() - .5).slice(0, 4); if (S.names.length < 2) S.names = C.CHILD_NAMES[S.sexPre].slice(0, 4);
    S.until = now() + C.SINH.TEN_SEC * 1000; const s = sockOf(p.id); if (s) s.emit('sinhTen', { sex: S.sexPre, names: S.names }); return;
  }
  else if (S.phase === 'bao' && !S.sex) {
    const r = birth(p, { hard: S.hard && !S.sam, event: true, sex: S.sexPre, name: S.nameSel || S.names[0] }); S.sex = r.sex; S.child = r.name; S.promoted = r.promoted; S.until = now() + C.SINH.BAO_SEC * 1000;
    const here = Object.values(DB.players).filter(q => q.loc === 'sansinh' && online.has(q.id) && q.id !== p.id);
    for (const q of here) { q.silver += C.SINH.LOC; addPts(q, 3); toast(q, `Hoàng thượng vui mừng ban lộc cho người có mặt chờ tin: +${C.SINH.LOC} bạc.`, 'good'); push(q); }
    if (S.sam) { const g = P(S.sam); if (g) { htGain(g, 10); addPts(g, 15); relAdd(g, 'thaiy', 4, 'dâng nhân sâm cứu người'); news(`🌿 Nhờ nhân sâm của ${g.name}, ${S.name} mẹ tròn con vuông. Hoàng thượng ghi nhận công lao.`); push(g); } }
    sinhEmit(); return;
  } else { DB.state.sinh = null; sinhEmit(); const s = sockOf(p.id); if (s && p.loc === 'sansinh') { enter(p, 'phong', s); push(p); }
    for (const q of Object.values(DB.players)) if (q.loc === 'sansinh') { const s2 = sockOf(q.id); if (s2) { enter(q, 'hoavien', s2); push(q); } } return; }
  sinhEmit();
}
function sinhSock(sock, getMe) {
  setTimeout(() => { const me = getMe(); sock.emit('sinh', DB.state.sinh?.test && !me?.admin ? null : sinhPub()); }, 1500);
  sock.on('sinhAct', d => quiet(DB.state.sinh?.test, () => {
    const me = getMe(), S = DB.state.sinh; if (!me || !S || !d) return; if (S.test && !me.admin) return;
    if (d.op === 'ten') { if (me.id !== S.id || !S.names || S.sex) return; const n = S.names[+d.i]; if (!n) return; S.nameSel = n; S.until = now(); return; }
    if (d.op === 'tho') { if (me.id !== S.id || S.q != null) return; S.q = Math.max(0, Math.min(1, +d.q || 0)); toast(me, S.q >= .45 ? 'Bổn cung giữ được hơi thở đều, bà đỡ gật đầu yên tâm.' : 'Hơi thở rối loạn… bà đỡ lo lắng nhìn nhau.', S.q >= .45 ? 'good' : 'bad'); return; }
    if (me.id === S.id || me.loc !== 'sansinh') return;
    if (d.op === 'pray') { if (S.phase !== 'cho' || S.pray.includes(me.id)) return; S.pray.push(me.id); addPts(me, 4); relAdd(me, 'thaihau', 1, 'cầu phúc cho hoàng tự'); toast(me, 'Bổn cung thành tâm cầu phúc cho mẹ tròn con vuông.', 'good'); io.to('sansinh').emit('chat', { id: null, name: '🙏', text: `${me.name} quỳ xuống cầu phúc cho ${S.name}.` }); push(me); return sinhEmit(); }
    if (d.op === 'gift') { if (S.gifts.includes(me.id)) return; if (me.silver < C.SINH.GIFT) return toast(me, `Cần ${C.SINH.GIFT} bạc.`, 'bad'); me.silver -= C.SINH.GIFT; S.gifts.push(me.id); const m = P(S.id); if (m) { m.silver += C.SINH.GIFT; push(m); } addPts(me, 5); toast(me, 'Đã gửi lễ mừng: khóa vàng trường mệnh và bộ áo nhỏ.', 'good'); push(me); return sinhEmit(); }
    if (d.op === 'sab') { if (S.phase !== 'cho' || S.sab.some(x => x.id === me.id)) return; if (me.silver < C.SINH.SAB) return toast(me, `Cần ${C.SINH.SAB} bạc để mua chuộc bà đỡ.`, 'bad'); me.silver -= C.SINH.SAB;
      const caught = Math.random() < .4; S.sab.push({ id: me.id, caught });
      if (caught) { me.sung -= 15; me.pts = Math.max(0, me.pts - 30); me.haiLong = Math.max(0, me.haiLong - 10); news(`🚨 ${title(me)} lén mua chuộc bà đỡ trong lúc ${S.name} chuyển dạ, bị Thái hậu bắt quả tang! Sủng ái và công trạng bị trừ nặng.`, 'phat'); io.to('sansinh').emit('chat', { id: null, name: '👑 Thái hậu', text: `Người đâu! Giải ${me.name} ra ngoài cho ai gia!` }); toast(me, 'Bị bắt quả tang!', 'bad'); }
      else toast(me, 'Bà đỡ nhận bạc, khẽ gật đầu… không ai hay biết.', 'info'); push(me); return; }
    if (d.op === 'sam') { if (S.phase !== 'kho' || S.sam) return; if (me.silver < C.SINH.SAM) return toast(me, `Cần ${C.SINH.SAM} bạc để sai người lấy nhân sâm ngàn năm.`, 'bad'); me.silver -= C.SINH.SAM; S.sam = me.id; io.to('sansinh').emit('chat', { id: null, name: '🩺 Thái y', text: `Có nhân sâm của ${me.name} rồi! Mau sắc thuốc!` }); push(me); return sinhEmit(); }
  }));
}
// ---------- HOÀNG TỰ: sơ sinh → chập chững → đi học ----------
const KID = () => C.CHILD;
function kidFix(p) { (p.children || []).forEach((c, i) => { c.id = c.id || 'k' + (c.born || now()).toString(36) + i; c.hp ??= 80; c.ngoan ??= 50; c.van ??= 0; c.vo ??= 0; c.nghe ??= 0; c.duc ??= 0; c.ward ??= false; }); return p.children || []; }
const kidAge = c => (now() - c.born) / 864e5;
const kidStage = c => kidAge(c) < KID().BABY_D ? 'so' : kidAge(c) < KID().TODDLER_D ? 'chap' : 'hoc';
const kidOf = (p, cid) => kidFix(p).find(c => c.id === cid);
const kidTitle = c => (c.sex === 'trai' ? 'Hoàng tử ' : 'Công chúa ') + c.name;
function kidScore(c) { return Math.round(c.van + c.vo + c.nghe + c.duc + c.ngoan / 4 + (c.an ? 15 : 0)); }
function kidPub(p, others = false) {
  const o = {}; if (p.thai?.known && !(others && p.thai.test)) o.tp = Math.max(0, Math.min(1, 1 - (p.thai.due - now()) / (C.THAI_DAYS * 864e5)));
  const ks = p.children || [];
  if (p.carry) { const c = ks.find(k => k.id === p.carry); if (c && kidStage(c) === 'so' && !c.ward) { if (!(others && c.test)) o.carry = { cid: c.id, sex: c.sex, name: c.name }; } else p.carry = null; }
  if (p.follow) { const c = ks.find(k => k.id === p.follow); if (c && kidStage(c) !== 'so' && !c.ward) { if (!(others && c.test)) o.follow = { cid: c.id, sex: c.sex, name: c.name, stage: kidStage(c), tt: kidTT(c), ao: c.ao || 0 }; } else p.follow = null; }
  o.cry = ks.filter(c => c.cry && !(others && c.test)).map(c => c.id);
  return o;
}
function kidView(p) { return kidFix(p).map(c => ({ id: c.id, sex: c.sex, name: c.name, born: c.born, stage: kidStage(c), age: +kidAge(c).toFixed(2), hp: c.hp, ngoan: c.ngoan, van: c.van, vo: c.vo, nghe: c.nghe, duc: c.duc, ward: !!c.ward, sick: !!c.sick, cry: c.cry ? c.cry.need : null, hoc: c.hocD === dayKey() ? c.hoc || {} : {}, tham: c.thamD === dayKey(), khao: c.khaoD === dayKey(), test: !!c.test, ao: c.ao || 0, tt: kidTT(c), taytam: !!c.taytam, traochu: !!c.traochu, talent: c.talent || null, thaitu: DB.state.thaitu?.cid === c.id, coluan: c.sex === 'gai' && kidScore(c) >= KID().THAITU_MIN })); }
const kidTT = c => c.sex === 'trai' ? DB.state.thaitu?.cid === c.id : kidScore(c) >= KID().THAITU_MIN;
function kidEmit(p) { const s = sockOf(p.id); const pub = kidPub(p), pubO = kidPub(p, true); for (const [id, so] of online) if (id !== p.id && P(id)?.loc === p.loc && (!stealth(p) || isAdm(id))) so.emit('pkid', { id: p.id, kid: isAdm(id) ? pub : pubO }); if (s) s.emit('pkid', { id: p.id, kid: pub }); }
// trẻ nhỏ đòi chăm: khóc ngẫu nhiên khi mẹ online
const CRY_NEED = { so: ['bu', 'ta', 'ngu'], chap: ['do', 'an', 'ngu'] };
const NEED_TXT = { bu: 'đói sữa', ta: 'ướt tã', ngu: 'buồn ngủ', do: 'té ngã đau', an: 'đói bụng' };
function kidTick() {
  const K = KID();
  for (const p of Object.values(DB.players)) {
    if (!p.children?.length) continue; kidFix(p); let ch = false;
    if (p.rank >= K.WARD_RANK) for (const c of p.children) if (c.ward) { c.ward = false; ch = true; news(`🏯 ${title(p)} đã đủ phẩm vị, được đón ${kidTitle(c)} từ A ca sở về cung tự tay nuôi dạy.`, 'phong'); notify(p, '👶 Đón con về cung', `${kidTitle(c)} đã về cung với bổn cung.`, 'con'); }
    for (const c of p.children) quiet(c.test, () => {
      const st = kidStage(c); if (st === 'hoc' || c.ward || !online.has(p.id)) { if (c.cry) { c.cry = null; ch = true; } if (!online.has(p.id)) c.cryAt = 0; return; } // mẹ vắng thì nhũ mẫu chăm, không bị trừ
      if (!c.cryAt) { c.cryAt = now() + (K.CRY_MIN[0] + Math.random() * (K.CRY_MIN[1] - K.CRY_MIN[0])) * 60e3; return; }
      if (!c.cry && now() > c.cryAt && p.loc !== 'tamcung') { c.cry = { need: pick(CRY_NEED[st]), since: now() }; ch = true;
        const s = sockOf(p.id); if (s) s.emit('conCry', { cid: c.id, name: c.name, need: c.cry.need, stage: st });
        notify(p, `👶 ${c.name} đang khóc`, 'Về chăm con kẻo bé khóc mãi.', 'concry'); }
      if (c.cry && now() - c.cry.since > K.CRY_PATIENCE * 60e3) { c.cry = null; c.hp = Math.max(0, c.hp - 6); c.ngoan = Math.max(0, c.ngoan - 3); c.cryAt = now() + K.CRY_MIN[0] * 60e3; ch = true;
        if (c.hp < 40 && !c.sick) { c.sick = true; news(`🤒 ${kidTitle(c)} khóc mãi không ai dỗ, đổ bệnh. Thái y được triệu tới cung ${p.name}.`, 'phong'); }
        toast(p, `${c.name} khóc mãi không ai dỗ, mệt lả đi (sức khỏe -6).`, 'bad'); }
    });
    if (ch) { push(p); kidEmit(p); }
  }
  // lập Thái tử: mỗi ngày xét một lần sau 12h
  const v = vnNow(), k = dayKey(); if (v.getUTCHours() < 12 || DB.state.ttDay === k) return; DB.state.ttDay = k;
  const cands = []; for (const p of Object.values(DB.players)) for (const c of kidFix(p)) if (c.sex === 'trai' && kidStage(c) === 'hoc' && !c.test) cands.push({ p, c, sc: kidScore(c) });
  cands.sort((a, b) => b.sc - a.sc); const best = cands[0]; if (!best || best.sc < K.THAITU_MIN) return;
  const cur = DB.state.thaitu, curC = cur && P(cur.mother) && kidOf(P(cur.mother), cur.cid);
  if (curC && (cur.cid === best.c.id || best.sc < kidScore(curC) + K.THAITU_LEAD)) return;
  if (curC) news(`📜 Hoàng thượng hạ chiếu phế ${kidTitle(curC)} khỏi ngôi Thái tử vì ${best.c.name} văn võ vượt trội hơn.`, 'phat');
  DB.state.thaitu = { cid: best.c.id, mother: best.p.id, at: now() };
  htGain(best.p, 15); addPts(best.p, 80); relAdd(best.p, 'thaihau', 10, 'sinh dạy được Thái tử');
  news(`👑 Hoàng thượng hạ chiếu lập ${kidTitle(best.c)}, con của ${title(best.p)}, làm Hoàng Thái tử! Mẫu bằng tử quý, cả hậu cung chấn động.`, 'phong');
  io.emit('cutscene', { type: 'thaitu', child: best.c.name, mother: best.p.name });
  push(best.p); save();
}
function kidSock(sock, getMe) {
  sock.on('con', d => { const me0 = getMe(), c0 = me0 && d && kidOf(me0, String(d.cid || '')); quiet(c0?.test, () => {
    const me = getMe(); if (!me || !d) return; const K = KID(); const c = kidOf(me, String(d.cid || '')); if (!c) return; const st = kidStage(c);
    const near = () => c.ward ? me.loc === 'acaso' : ((me.loc === 'phong' && !me.visit) || me.carry === c.id || me.follow === c.id || (me.loc === 'acaso' && st === 'hoc'));
    const done = (msg, kind = 'good') => { toast(me, msg, kind); push(me); kidEmit(me); save(); };
    if (d.op === 'care') {
      if (!near()) return toast(me, c.ward ? `${c.name} đang ở A ca sở, phải tới đó mới chăm được.` : `Phải ở bên ${c.name} mới chăm được (về cung, bế hoặc dắt bé theo).`);
      const a = String(d.act || '');
      if (c.cry) {
        if (a === c.cry.need) { c.cry = null; c.hp = Math.min(100, c.hp + 4); c.ngoan = Math.min(100, c.ngoan + 3); c.cryAt = now() + (K.CRY_MIN[0] + Math.random() * (K.CRY_MIN[1] - K.CRY_MIN[0])) * 60e3; addPts(me, 3); cnt(me, 'chamcon');
          return done({ bu: `${c.name} bú no, ợ một cái rồi ngủ thiếp đi.`, ta: `Thay tã sạch sẽ, ${c.name} cười khanh khách.`, ngu: `Bổn cung ru ${c.name} ngủ, bé ngủ ngon lành.`, do: `Bổn cung xoa đầu gối, thổi phù phù, ${c.name} nín khóc.`, an: `${c.name} ăn hết chén cháo, vỗ bụng cười.` }[c.cry?.need || a] || `${c.name} nín rồi.`); }
        c.ngoan = Math.max(0, c.ngoan - 1); return done(`${c.name} vẫn khóc… hình như không phải vì vậy.`, 'info');
      }
      if (a === 'ru' || a === 'choi') { if (now() - (c.playAt || 0) < 3600e3) return toast(me, `${c.name} vừa chơi xong, để bé nghỉ chút.`); c.playAt = now(); c.ngoan = Math.min(100, c.ngoan + 2); c.hp = Math.min(100, c.hp + 1); addPts(me, 2); return done(a === 'ru' ? `Bổn cung bế ${c.name} ru hát, bé cười tít mắt.` : `Bổn cung chơi đùa với ${c.name}, tiếng cười vang cả cung.`); }
      return toast(me, `${c.name} đang ngoan, không khóc.`);
    }
    if (d.op === 'ao') { if (st === 'so' || !near()) return toast(me, `Phải ở bên ${c.name} mới thay đồ được.`); const o = +d.ao; if (![1, 2].includes(o)) return; c.ao = o; return done(`Bổn cung thay cho ${c.name} bộ đồ mới, bé xoay một vòng khoe mẫu thân.`); }
    if (d.op === 'gan') {
      const A = { hon: 'Bổn cung hôn lên trán con, bé cười toe.', nung: 'Bổn cung nựng đôi má phúng phính, bé khúc khích.', hat: 'Bổn cung bế con khẽ hát ru, bé lim dim ngủ.', om: `Bổn cung ôm ${c.name} vào lòng, con rúc đầu vào ngực mẹ.`, tron: `Hai mẹ con chơi trốn tìm, ${c.name} cười nắc nẻ.`, tapdi: `Bổn cung nắm tay ${c.name} tập đi từng bước.`, kechuyen: `Bổn cung kể chuyện cổ tích, ${c.name} nghe say sưa.`, chaitoc: `Bổn cung chải tóc cho ${c.name}, con ngồi im ngoan ngoãn.`, dayviet: `Bổn cung cầm tay ${c.name} viết từng nét chữ.` };
      const a = String(d.act || ''); if (!A[a]) return; if (!near()) return toast(me, `Phải ở bên ${c.name} mới gần gũi được.`);
      c.gan = c.gan || {}; if (now() - (c.gan[a] || 0) < 20 * 60e3) return toast(me, 'Vừa làm rồi, lát nữa nhé.', 'info'); c.gan[a] = now();
      c.ngoan = Math.min(100, c.ngoan + 2); c.hp = Math.min(100, c.hp + 1); if (a === 'kechuyen') c.duc += 1; if (a === 'dayviet') c.van += 1; addPts(me, 2); cnt(me, 'gancon'); return done(A[a]);
    }
    if (d.op === 'nhumau') { if (!c.cry) return toast(me, `${c.name} đang ngoan.`); if (me.silver < K.NHUMAU) return toast(me, `Cần ${K.NHUMAU} bạc.`, 'bad'); me.silver -= K.NHUMAU; c.cry = null; c.hp = Math.min(100, c.hp + 2); c.cryAt = now() + K.CRY_MIN[1] * 60e3; return done(`Nhũ mẫu đã dỗ ${c.name} nín (-${K.NHUMAU} bạc).`); }
    if (d.op === 'thaiy') { if (!c.sick && c.hp >= 70) return toast(me, `${c.name} khỏe mạnh, không cần mời Thái y.`); if (me.silver < K.THAIY) return toast(me, `Cần ${K.THAIY} bạc.`, 'bad'); me.silver -= K.THAIY; c.sick = false; c.hp = Math.max(c.hp, 85); relAdd(me, 'thaiy', 2, `chữa bệnh cho ${c.name}`); return done(`Thái y bốc thuốc, ${c.name} đã khỏe lại.`); }
    if (d.op === 'be') { if (c.ward || st !== 'so') return; if (me.loc !== 'phong' && me.carry !== c.id) return toast(me, 'Về cung mới bế con được.'); me.carry = me.carry === c.id ? null : c.id; me.follow = null; return done(me.carry ? `Bổn cung bế ${c.name} trên tay.` : `Đã đặt ${c.name} vào nôi.`, 'info'); }
    if (d.op === 'theo') { if (c.ward || st === 'so') return; if (me.loc !== 'phong' && me.follow !== c.id) return toast(me, 'Về cung mới dắt con đi được.'); me.follow = me.follow === c.id ? null : c.id; me.carry = null; return done(me.follow ? `${c.name} lon ton chạy theo bổn cung.` : `${c.name} ở lại cung chơi.`, 'info'); }
    if (d.op === 'khoe') {
      if (me.loc !== 'duongtam' || (me.carry !== c.id && me.follow !== c.id)) return; if (c.khoeD === dayKey()) return toast(me, `Hôm nay ${c.name} đã ra mắt Hoàng thượng rồi.`); c.khoeD = dayKey();
      const g = htGain(me, 6); c.ngoan = Math.min(100, c.ngoan + 3); addPts(me, 6); io.to(roomOf(me)).emit('chat', { id: null, name: '🐉 Hoàng thượng', text: st === 'so' ? `Đưa trẫm bế ${c.name} nào… ha ha, bé nắm tay trẫm chặt quá!` : st === 'chap' ? `${c.name} lại đây với phụ hoàng! Lớn nhanh quá.` : `${c.name} dạo này học hành thế nào? Đọc cho phụ hoàng nghe một đoạn.` });
      news(`🐉 ${title(me)} đưa ${kidTitle(c)} ra mắt Hoàng thượng, người vui vẻ bế con không rời tay.`); return done(`Hoàng thượng vui vẻ với ${c.name}: sủng ái +${g}.`);
    }
    if (d.op === 'khaoStart' || d.op === 'khao') {
      if (st !== 'hoc') return; const inSchool = me.loc === 'acaso' && VS().khao && (c.ward || me.follow === c.id), inDT = me.loc === 'duongtam' && me.follow === c.id;
      if (!inSchool && !inDT) return toast(me, 'Dắt con tới Dưỡng Tâm điện, hoặc tới Thượng thư phòng lúc Hoàng thượng ghé kiểm tra bài.');
      if (d.op === 'khaoStart') { if (c.khaoD === dayKey()) return toast(me, `Hôm nay ${c.name} đã trình bài với phụ hoàng rồi.`); c.khaoOn = dayKey(); sock.emit('conKhao', { cid: c.id, name: c.name, sex: c.sex }); return; }
      if (c.khaoOn !== dayKey() || c.khaoD === dayKey()) return; c.khaoD = dayKey(); const ok = Math.max(0, Math.min(3, +d.ok || 0));
      const say = t => io.to(roomOf(me)).emit('chat', { id: null, name: '🐉 Hoàng thượng', text: t });
      if (ok === 3) { c.van += 4; c.duc += 4; c.ngoan = Math.min(100, c.ngoan + 5); const g = htGain(me, 8); addPts(me, 10); say(`${c.name} đọc trôi chảy, hiểu lễ nghĩa. ${me.name} dạy con có phương, trẫm rất vui!`); news(`📜 Hoàng thượng kiểm tra bài, ${kidTitle(c)} đối đáp trôi chảy. Người khen ${title(me)} dạy con có phương trước mặt cả cung.`); return done(`${c.name} trình bài xuất sắc: văn +4, đức +4 · bổn cung sủng ái +${g}.`); }
      if (ok === 2) { c.van += 2; c.duc += 2; const g = htGain(me, 4); addPts(me, 5); say(`${c.name} học cũng khá, cố thêm chút nữa.`); return done(`${c.name} trình bài khá: văn +2, đức +2 · sủng ái +${g}.`); }
      c.ngoan = Math.min(100, c.ngoan + 1); say(`${c.name} phải chăm học hơn nữa. Thái phó, nghiêm khắc với con giúp trẫm.`); return done(`${c.name} còn lúng túng, phụ hoàng dặn chăm học hơn.`, 'info');
    }
    if (d.op === 'tham') { if (!c.ward || me.loc !== 'acaso') return; if (c.thamD === dayKey()) return toast(me, `Hôm nay đã thăm ${c.name} rồi.`); c.thamD = dayKey(); c.ngoan = Math.min(100, c.ngoan + 4); c.hp = Math.min(100, c.hp + 2); addPts(me, 4); return done(`Bổn cung ôm ${c.name} vào lòng, nhũ mẫu kể bé hôm nay ngoan lắm.`); }
    if (d.op === 'hocStart' || d.op === 'hoc') {
      const mon = String(d.mon || ''); if (!['van', 'vo', 'nghe', 'duc'].includes(mon) || st !== 'hoc') return; if (me.loc !== 'acaso') return toast(me, 'Tới Thượng thư phòng mới học được.');
      if (!c.ward && me.follow !== c.id) return toast(me, `Dắt ${c.name} theo tới Thượng thư phòng đã.`);
      if (c.hocD !== dayKey()) { c.hocD = dayKey(); c.hoc = {}; }
      if (d.op === 'hocStart') { if (c.hoc[mon]) return toast(me, 'Hôm nay đã học môn này rồi.'); c.hoc[mon] = 'on'; sock.emit('conHoc', { cid: c.id, mon, name: c.name, sex: c.sex }); return; }
      if (c.hoc[mon] !== 'on') return; c.hoc[mon] = 1; const q = Math.max(0, Math.min(1, +d.q || 0)); const T0 = { sach: 'van', kiem: 'vo', dan: 'nghe', son: 'duc' }; const g = Math.round((2 + 8 * q) * (c.ward ? .7 : 1) * (T0[c.talent] === mon ? 1.3 : 1)); c[mon] += g; addPts(me, 4); cnt(me, 'conhoc');
      const T = { van: 'chữ nghĩa', vo: 'cung mã', nghe: 'đàn hát', duc: 'lễ nghĩa' }[mon];
      if (q >= .99) news(`📚 ${kidTitle(c)} học ${T} được Thái phó khen ngợi hết lời.`);
      return done(`${c.name} học ${T}: +${g}${c.ward ? ' (ở A ca sở, mẹ ít kèm nên tiến bộ chậm hơn)' : ''}.`);
    }
  }); });
}
// ---------- HOÀNG THƯỢNG CÙNG PHI TẦN: dạo vườn, cờ, mài mực, đối thơ, thăm cung, hoa đăng ----------
// s: điểm theo tâm trạng [vui, mệt, buồn]
const VUA_WALK = [
  // hồ cá
  { at: 'ca', q: 'Nhìn đàn cá chép dưới hồ kìa.', opts: [{ t: 'Thần thiếp mang theo bánh, người cho cá ăn cùng thiếp.', s: [3, 2, 2], r: 'Ha ha, chúng tranh nhau kìa!' }, { t: 'Cá chép vượt vũ môn hóa rồng, như Hoàng thượng vậy.', s: [2, 1, 1], r: 'Nịnh vừa thôi.' }, { t: 'Con to kia mà nướng lên chắc ngon lắm ạ.', s: [1, -1, -1], r: 'Nàng… thật là.' }] },
  { at: 'ca', q: 'Gió lên rồi, hơi lạnh.', opts: [{ t: 'Thần thiếp khoác áo choàng cho người.', s: [2, 3, 2], r: 'Ấm rồi.' }, { t: 'Vậy mình về điện thôi ạ.', s: [-1, 1, -1], r: 'Mới ra mà đã đòi về.' }, { t: 'Đứng sát bên người là thần thiếp ấm rồi.', s: [3, 1, 2], r: 'Nàng đó…' }] },
  { at: 'ca', q: 'Con chim yến kia hót hay quá.', opts: [{ t: 'Không hay bằng tiếng cười của Hoàng thượng.', s: [3, 0, 2], r: 'Nàng lại nịnh rồi.' }, { t: 'Thần thiếp sai người bắt về nuôi cho người nghe mỗi sáng.', s: [1, 1, 0], r: 'Chim trời nên để nó bay.' }, { t: 'Thần thiếp thấy hơi ồn ạ.', s: [-1, -2, -1], r: '…' }] },
  { at: 'ca', q: 'Con cá chép vàng kia cứ bơi theo trẫm.', opts: [{ t: 'Cá cũng biết ai là chân long thiên tử.', s: [3, 1, 1], r: 'Nàng khéo nói thật.' }, { t: 'Chắc nó đói, để thần thiếp rắc ít bánh.', s: [2, 2, 2], r: 'Ừ, rắc đi.' }, { t: 'Bắt về nấu canh dâng người nhé?', s: [0, -1, -2], r: 'Cá chép vàng là điềm lành, không được ăn!' }] },
  { at: 'ca', q: 'Mặt hồ hôm nay phẳng lặng quá.', opts: [{ t: 'Như lòng thần thiếp mỗi khi ở cạnh người.', s: [2, 2, 3], r: 'Trẫm cũng thấy yên lòng.' }, { t: 'Thần thiếp ném viên sỏi cho vui nhé?', s: [2, -1, -1], r: 'Nàng tinh nghịch quá.' }, { t: 'Hồ lặng thì buồn, thần thiếp không thích.', s: [-1, -1, -2], r: 'Hừm.' }] },
  // vườn mẫu đơn
  { at: 'hoa', q: 'Mẫu đơn năm nay nở sớm quá.', opts: [{ t: 'Hoa nở sớm vì biết Hoàng thượng sắp tới ngắm.', s: [3, 1, 1], r: 'Nàng khéo miệng thật.' }, { t: 'Thần thiếp hái một bông cài lên áo cho người nhé?', s: [2, 2, 3], r: 'Ừ, nàng cài đi.' }, { t: 'Hoa nở sớm thì tàn cũng sớm ạ.', s: [-1, 0, -2], r: 'Nàng nói gì mà buồn vậy…' }] },
  { at: 'hoa', q: 'Trẫm mỏi chân rồi.', opts: [{ t: 'Thần thiếp đỡ người ra đình nghỉ, sai người dâng trà.', s: [1, 3, 2], r: 'Nàng chu đáo lắm.' }, { t: 'Hoàng thượng còn khỏe lắm, đi thêm một vòng nữa đi ạ!', s: [2, -1, 0], r: 'Nàng muốn trẫm gãy chân à?' }, { t: 'Thần thiếp cũng mỏi chân lắm…', s: [-1, -1, -1], r: 'Hừm.' }] },
  { at: 'hoa', q: 'Lâu rồi trẫm chưa thấy nàng cười.', opts: [{ t: '(Che miệng cười) Gặp người là thần thiếp vui rồi.', s: [3, 2, 3], r: 'Cười lên trông xinh lắm.' }, { t: 'Trong cung nhiều chuyện quá, thần thiếp không cười nổi.', s: [-1, -1, 0], r: 'Ai làm nàng buồn?' }, { t: 'Người kể chuyện vui đi, thần thiếp cười cho.', s: [2, -1, 1], r: 'Trẫm đâu phải con hát.' }] },
  { at: 'hoa', q: 'Nàng thích hoa gì nhất?', opts: [{ t: 'Hoa nhài, nhỏ mà thơm lâu, như tấm lòng thần thiếp.', s: [3, 2, 3], r: 'Hay, trẫm sẽ sai trồng thêm nhài.' }, { t: 'Mẫu đơn, quốc sắc thiên hương.', s: [2, 1, 1], r: 'Hoa đẹp, người cũng đẹp.' }, { t: 'Thần thiếp không để ý hoa lắm ạ.', s: [-1, -1, -1], r: 'Vậy à…' }] },
  { at: 'hoa', q: 'Có con ong bay quanh trẫm kìa!', opts: [{ t: 'Thần thiếp đứng chắn cho người!', s: [2, 3, 2], r: 'Nàng dũng cảm đấy.' }, { t: 'Ong thấy người thơm như hoa đó ạ.', s: [3, 0, 1], r: 'Ha ha ha!' }, { t: '(Hét lên, chạy núp sau lưng Hoàng thượng)', s: [1, -2, -1], r: 'Nàng làm trẫm giật mình.' }] },
  // cầu hồ sen
  { at: 'cau', q: 'Triều đình mấy hôm nay nhiều chuyện phiền lòng.', opts: [{ t: 'Thần thiếp không dám bàn chính sự, chỉ mong người bớt lo.', s: [1, 2, 3], r: 'Có nàng ở đây trẫm thấy nhẹ lòng.' }, { t: 'Người kể thần thiếp nghe, thiếp góp ý thử xem.', s: [-1, -2, -1], r: 'Hậu cung không được can dự triều chính.' }, { t: 'Thần thiếp hát một khúc cho người khuây khỏa.', s: [2, 2, 2], r: 'Giọng nàng hay lắm.' }] },
  { at: 'cau', q: 'Nàng thấy các phi tần khác thế nào?', opts: [{ t: 'Các tỷ muội đều hiền thục, sống hòa thuận ạ.', s: [2, 2, 2], r: 'Hậu cung hòa thuận, trẫm yên tâm.' }, { t: 'Có người hay nói xấu sau lưng lắm ạ…', s: [-1, 0, -2], r: 'Trẫm không muốn nghe chuyện thị phi.' }, { t: 'Thần thiếp chỉ để mắt tới Hoàng thượng thôi.', s: [3, 1, 2], r: 'Ha ha.' }] },
  { at: 'cau', q: 'Sen trong hồ nở rộ rồi.', opts: [{ t: 'Gần bùn mà chẳng hôi tanh mùi bùn, như người quân tử.', s: [2, 2, 3], r: 'Nàng cũng đọc sách nhiều.' }, { t: 'Thần thiếp hái hạt sen nấu chè dâng người.', s: [2, 3, 2], r: 'Trẫm chờ chè của nàng.' }, { t: 'Thần thiếp sợ nước, mình qua cầu nhanh đi ạ.', s: [-1, 0, -1], r: 'Có trẫm ở đây, sợ gì.' }] },
  { at: 'cau', q: 'Đứng trên cầu nhìn xuống, thấy bóng hai ta dưới nước.', opts: [{ t: 'Bóng soi một đôi, xin người giữ mãi.', s: [3, 1, 3], r: 'Trẫm hứa.' }, { t: 'Bóng thần thiếp trông mập quá…', s: [1, -1, 0], r: 'Ha ha, đâu có.' }, { t: 'Thần thiếp chỉ thấy bóng rồng thôi.', s: [2, 1, 1], r: 'Lại nịnh.' }] },
  { at: 'cau', q: 'Nếu một ngày trẫm không còn là Hoàng thượng thì sao?', opts: [{ t: 'Thần thiếp vẫn theo người, làm vợ người thường cũng được.', s: [2, 2, 3], r: 'Nàng nói thật lòng chứ?' }, { t: 'Người nói gì vậy, xui lắm ạ!', s: [1, 0, -1], r: 'Trẫm nói đùa thôi.' }, { t: 'Vậy thần thiếp xin về quê.', s: [-2, -2, -2], r: 'Hừ, thì ra là vậy.' }] },
  // đình Vọng Nguyệt
  { at: 'dinh', q: 'Cảnh đẹp thế này, nàng ngâm một câu thơ đi.', opts: [{ t: '“Xuân miên bất giác hiểu, xứ xứ văn đề điểu…”', s: [2, 2, 2], r: 'Thơ Mạnh Hạo Nhiên, hay.' }, { t: 'Tự làm bốn câu tặng Hoàng thượng.', s: [3, 1, 3], r: 'Nàng tự làm sao? Trẫm sẽ chép lại.' }, { t: 'Thần thiếp không thuộc thơ ạ.', s: [-1, 0, -1], r: 'Vậy về luyện thêm đi.' }] },
  { at: 'dinh', q: 'Ngồi nghỉ chân ở đình một lát.', opts: [{ t: 'Thần thiếp xoa bóp vai cho người.', s: [2, 3, 2], r: 'Dễ chịu quá.' }, { t: 'Thần thiếp đàn một khúc cho người nghe.', s: [3, 1, 3], r: 'Tiếng đàn hay lắm.' }, { t: 'Thần thiếp xin về trước, hôm nay mệt quá.', s: [-1, -1, -2], r: 'Vậy nàng về đi.' }] },
  { at: 'dinh', q: 'Đình này tên Vọng Nguyệt, tối nay trăng sẽ đẹp lắm.', opts: [{ t: 'Tối nay thần thiếp ra thả hoa đăng chờ người.', s: [3, 2, 2], r: 'Trẫm sẽ ra.' }, { t: 'Trăng đẹp sao bằng người.', s: [2, 0, 1], r: 'Nàng lẻo mép quá.' }, { t: 'Thần thiếp hay buồn ngủ sớm lắm ạ.', s: [-1, 0, -1], r: 'Thôi được.' }] },
  { at: 'dinh', q: 'Nàng vào cung đã lâu, có nhớ nhà không?', opts: [{ t: 'Có người ở đây, nơi này là nhà.', s: [3, 2, 3], r: 'Nàng làm trẫm cảm động.' }, { t: 'Nhớ lắm, thần thiếp muốn xin về thăm.', s: [0, 0, 1], r: 'Để trẫm tính.' }, { t: 'Không nhớ, ở nhà nghèo khổ lắm.', s: [-1, -1, -1], r: 'Hừm.' }] },
];
function VS() { return DB.state.vua || (DB.state.vua = { done: {} }); }
function vuaPub(adm = false) {
  const v0 = VS(), v = {}; for (const k of ['walk', 'den', 'visit', 'khao']) v[k] = v0[k] && (!v0[k].test || adm) ? v0[k] : null; return {
    walk: v.walk ? { start: v.walk.start, end: v.walk.end, n: Object.keys(v.walk.sc).length } : null,
    den: v.den ? { start: v.den.start, end: v.den.end, list: v.den.list.map(x => ({ id: x.id, name: x.name, wish: x.wish })) } : null,
    visit: v.visit ? { id: v.visit.id, name: v.visit.name, until: v.visit.until } : null,
    khao: v.khao ? { start: v.khao.start, end: v.khao.end } : null,
  };
}
function vuaEmit() { for (const [id, s] of online) s.emit('vua', vuaPub(isAdm(id))); }
function vuaDay(p) { if (p.vuaDay?.d !== dayKey()) p.vuaDay = { d: dayKey() }; return p.vuaDay; }
// sủng ái nhận từ Hoàng thượng mỗi ngày: đủ DAY_CAP thì phần vượt chỉ còn 1/3
function htGain(p, g) { if (g <= 0) { p.sung += g; return g; } const VD = vuaDay(p), used = VD.sg || 0, full = Math.max(0, Math.min(g, C.VUA.DAY_CAP - used)), got = full + Math.round((g - full) / 3); VD.sg = used + g; p.sung += got; return got; }
const inMeal = () => { const h = vnNow().getUTCHours(); return C.VUA.MEAL.some(([a, b]) => h >= a && h < b); };
function wpick(list, w) { let tot = list.reduce((a, x) => a + w(x), 0), r = Math.random() * tot; for (const x of list) { r -= w(x); if (r <= 0) return x; } return list[0]; }
function vuaTick(mins, k) {
  const v = VS(), U = C.VUA; v.done = v.done || {}; let ch = false;
  for (const kk of Object.keys(v.done)) if (!kk.startsWith(k)) delete v.done[kk];
  U.WALK_SLOTS.forEach(([h, m], i) => { const key = k + ':w' + i, st = h * 60 + m;
    if (mins >= st && mins < st + U.WALK_MIN && !v.done[key] && !v.walk) { v.done[key] = 1; v.walk = { start: now(), end: now() + (U.WALK_MIN - (mins - st)) * 60e3, sc: {} }; ch = true;
      news('🌸 Hoàng thượng ngự giá Ngự hoa viên dạo chơi. Các phi tần mau tới theo hầu!', 'vua');
      for (const q of Object.values(DB.players)) if (!q.lanh) notify(q, '🌸 Hoàng thượng dạo Ngự hoa viên', 'Tới Ngự hoa viên theo hầu, đáp khéo được sủng ái.', 'vuawalk'); } });
  if (v.walk && now() > v.walk.end) quiet(v.walk.test, () => {
    const e = Object.entries(v.walk.sc).sort((a, b) => b[1] - a[1]);
    if (e.length >= 2 && e[0][1] > 0) { const w = P(e[0][0]); if (w) { htGain(w, 5); news(`🌸 Dạo vườn xong, Hoàng thượng khen ${w.name} hầu chuyện khéo nhất, ban thêm ân sủng.`); toast(w, 'Hầu chuyện khéo nhất buổi dạo vườn: sủng ái +5.', 'good'); push(w); } }
    v.walk = null; ch = true;
  });
  const [dh, dm] = U.DEN_SLOT, dst = dh * 60 + dm, dkey = k + ':den';
  if (mins >= dst && mins < dst + U.DEN_MIN && !v.done[dkey] && !v.den) { v.done[dkey] = 1; v.den = { start: now(), end: now() + (U.DEN_MIN - (mins - dst)) * 60e3, list: [] }; ch = true;
    news('🏮 Trăng lên, Hoàng thượng ra hồ Ngự hoa viên ngắm trăng. Ai thả hoa đăng, người sẽ nhặt một chiếc đọc lời ước.', 'vua');
    for (const q of Object.values(DB.players)) if (!q.lanh) notify(q, '🏮 Thả hoa đăng cùng Hoàng thượng', 'Ra hồ Ngự hoa viên thả hoa đăng ước nguyện.', 'vuaden'); }
  if (v.den && now() > v.den.end) quiet(v.den.test, () => { const L = v.den.list; v.den = null; ch = true;
    if (L.length) { const w = wpick(L, x => 10 + Math.sqrt(Math.max(0, P(x.id)?.sung || 0)) * 2); const p = P(w.id);
      if (p) { htGain(p, 12); addPts(p, 10); push(p); notify(p, '🏮 Hoàng thượng nhặt hoa đăng của bổn cung', w.wish); }
      news(`🏮 Hoàng thượng nhặt hoa đăng của ${w.name}, đọc lời ước: “${w.wish}”. Người mỉm cười, sủng ái +12.`); io.emit('denEnd', { id: w.id, name: w.name, wish: w.wish }); } });
  U.VISIT_SLOTS.forEach(([h, m], i) => { const key = k + ':v' + i, st = h * 60 + m;
    if (mins < st || mins >= st + 30 || v.done[key] || v.visit) return;
    const pool = Object.values(DB.players).filter(p => online.has(p.id) && !p.lanh && !p.admin && p.loc !== 'tamcung' && !(p.sick && p.sickUntil > now()) && vuaDay(p).vis == null);
    if (!pool.length) return; v.done[key] = 1;
    const t = wpick(pool, p => 10 + Math.max(0, p.sung)); vuaDay(t).vis = 0; v.visit = { id: t.id, name: t.name, until: now() + U.VISIT_MIN * 60e3 }; ch = true;
    news(`🐉 Hoàng thượng ngự giá tới cung của ${t.name}.`, 'vua');
    notify(t, '🐉 Hoàng thượng ngự giá tới cung!', `Mau về cung riêng nghênh giá trong ${U.VISIT_MIN} phút.`, 'vuavisit');
    toast(t, `🐉 Hoàng thượng ngự giá tới cung! Mau về cung riêng nghênh giá trong ${U.VISIT_MIN} phút.`, 'good'); });
  if (v.visit && now() > v.visit.until) quiet(v.visit.test, () => { const t = P(v.visit.id); if (t) { news(`🐉 Hoàng thượng tới cung ${t.name} mà chủ nhân vắng, người để lại một nhành mai rồi về.`); toast(t, 'Hoàng thượng tới cung mà không gặp, để lại một nhành mai rồi về. Lần sau nhớ về kịp nhé.', 'info'); push(t); } v.visit = null; ch = true; });
  U.KHAO_SLOTS.forEach(([h, m], i) => { const key = k + ':k' + i, st = h * 60 + m;
    if (mins >= st && mins < st + U.KHAO_MIN && !v.done[key] && !v.khao) { v.done[key] = 1; v.khao = { start: now(), end: now() + (U.KHAO_MIN - (mins - st)) * 60e3 }; ch = true;
      news('📜 Hoàng thượng ngự giá Thượng thư phòng kiểm tra bài vở các hoàng tự.', 'vua');
      for (const q of Object.values(DB.players)) if (!q.lanh && kidFix(q).some(c => kidStage(c) === 'hoc')) notify(q, '📜 Hoàng thượng kiểm tra bài', 'Dắt con tới Thượng thư phòng trình bài với phụ hoàng.', 'vuakhao'); } });
  if (v.khao && now() > v.khao.end) { v.khao = null; ch = true; }
  if (ch) { vuaEmit(); save(); }
}
function vuaSock(sock, getMe) {
  setTimeout(() => sock.emit('vua', vuaPub(!!getMe()?.admin)), 1500);
  sock.on('vua', d => { const v0 = VS(), op = d?.op || ''; quiet((/^walk/.test(op) && v0.walk?.test) || (op === 'den' && v0.den?.test) || (op === 'visit' && v0.visit?.test) || op === 'force', () => {
    const me = getMe(); if (!me || !d || me.lanh) return; const v = VS(), VD = vuaDay(me), mood = ht().mood;
    const htSay = text => io.to(roomOf(me)).emit('chat', { id: null, name: '🐉 Hoàng thượng', text });
    const atDT = () => me.loc === 'duongtam' || (toast(me, 'Phải tới Dưỡng Tâm điện.'), false);
    if (d.op === 'force' && me.admin) { // quản trị: gọi Hoàng thượng ra ngay để thử
      const t = P(d.who) || me;
      if (d.k === 'walk') v.walk = { test: true, start: now(), end: now() + C.VUA.WALK_MIN * 60e3, sc: {} };
      if (d.k === 'den') v.den = { test: true, start: now(), end: now() + (d.min || C.VUA.DEN_MIN) * 60e3, list: [] };
      if (d.k === 'khao') v.khao = { test: true, start: now(), end: now() + C.VUA.KHAO_MIN * 60e3 };
      if (d.k === 'visit') v.visit = { test: true, id: t.id, name: t.name, until: now() + C.VUA.VISIT_MIN * 60e3 };
      if (d.k === 'end') { if (v.walk) v.walk.end = 0; if (v.den) v.den.end = 0; }
      if (d.k === 'reset') { me.vuaDay = null; push(me); }
      vuaEmit(); return;
    }
    if (d.op === 'walk') {
      if (me.loc !== 'hoavien' || !v.walk) return toast(me, 'Hoàng thượng không có ở Ngự hoa viên lúc này.');
      if (v.walk.sc[me.id] != null) return toast(me, 'Bổn cung đã theo hầu lượt dạo này rồi.');
      v.walk.sc[me.id] = 0; const qs = {};
      for (const at of ['ca', 'hoa', 'cau', 'dinh']) { const L = [...VUA_WALK.keys()].filter(i => VUA_WALK[i].at === at); qs[at] = { qi: L[rnd(L.length)], ord: [0, 1, 2].sort(() => Math.random() - .5) }; }
      me._walk = qs; const out = {}; for (const [at, { qi, ord }] of Object.entries(qs)) out[at] = { q: VUA_WALK[qi].q, opts: ord.map(o => ({ t: VUA_WALK[qi].opts[o].t, r: VUA_WALK[qi].opts[o].r })) };
      sock.emit('vuaWalk', out); vuaEmit();
    } else if (d.op === 'walkAns') {
      const qs = me._walk; if (!qs || !d.a || typeof d.a !== 'object') return; me._walk = null;
      let tot = 0, n = 0; for (const [at, i] of Object.entries(d.a)) { const Q = qs[at]; if (!Q || n >= 3) continue; const o = VUA_WALK[Q.qi].opts[Q.ord[+i]]; if (o) { tot += o.s[mood]; n++; } }
      const g = htGain(me, Math.max(0, Math.min(18, tot * 2 + 2))); addPts(me, 6); if (v.walk) v.walk.sc[me.id] = tot; cnt(me, 'vuawalk');
      htSay(tot >= 6 ? `Dạo vườn với ${me.name} thật hợp ý trẫm.` : tot >= 2 ? `Đi dạo cùng ${me.name} cũng vui.` : `${me.name} hôm nay sao vụng về vậy…`);
      toast(me, `Theo hầu Hoàng thượng dạo vườn: sủng ái +${g}, công trạng +6.`, g >= 8 ? 'good' : 'info');
      if (tot >= 6) news(`🌸 ${me.name} theo hầu Hoàng thượng dạo Ngự hoa viên, được khen hầu chuyện hợp ý.`);
    } else if (d.op === 'coStart') {
      if (!atDT()) return; if (VD.co) return toast(me, 'Hôm nay đã hầu cờ Hoàng thượng rồi.'); VD.coOn = 1; sock.emit('vuaCo');
    } else if (d.op === 'coEnd') {
      if (!VD.coOn || VD.co) return; VD.co = 1; const mg = Math.abs(+d.margin || 0), win = !!d.win;
      let g, line;
      if (d.resign) { g = 1; line = 'Chưa đánh đã chịu thua? Lần sau cố lên.'; }
      else if (!win && mg <= 10) { g = 12; line = 'Suýt nữa trẫm thua rồi! Nàng đánh cờ khéo lắm.'; news(`⚫⚪ ${me.name} hầu cờ Hoàng thượng, thua sít sao, được khen đánh cờ có tài.`); }
      else if (win && mg <= 10) { g = 7; line = 'Nàng thắng trẫm à? Được lắm, mai trẫm phục thù.'; news(`⚫⚪ ${me.name} thắng Hoàng thượng một ván cờ sít sao!`); }
      else if (win) { g = 2; line = '…Nàng thắng đậm quá, chẳng nể trẫm chút nào.'; }
      else { g = 4; line = 'Nàng còn phải luyện thêm nhiều.'; }
      g = htGain(me, g); addPts(me, 8); cnt(me, 'vuaco'); htSay(line); toast(me, `Hầu cờ Hoàng thượng: sủng ái +${g}, công trạng +8.`, g >= 7 ? 'good' : 'info');
    } else if (d.op === 'maiStart') {
      if (!atDT()) return; if (VD.mai) return toast(me, 'Hôm nay đã mài mực hầu bút rồi.'); VD.maiOn = 1; sock.emit('vuaMai');
    } else if (d.op === 'mai') {
      if (!VD.maiOn || VD.mai) return; VD.mai = 1; const q = Math.max(0, Math.min(1, +d.q || 0)); const g = htGain(me, Math.round(3 + 8 * q));
      addPts(me, 6); cnt(me, 'vuamai');
      toast(me, `${q > .8 ? 'Mực mài đều, đậm mà không vón.' : q > .4 ? 'Mực mài tạm được.' : 'Mực lúc đặc lúc loãng…'} Sủng ái +${g}.`, q > .4 ? 'good' : 'info');
      htSay(q > .8 ? `Hồng tụ thiêm hương dạ độc thư… có ${me.name} mài mực, trẫm phê tấu chương cũng thấy nhẹ.` : q > .4 ? 'Được rồi, nàng lui ra nghỉ đi.' : 'Mực thế này sao trẫm viết được…');
    } else if (d.op === 'peek') {
      if (!VD.mai || VD.peek) return; VD.peek = 1; if (!d.yes) return;
      if (Math.random() < .55) {
        if (Math.random() < .5) { htKnown(me).keys = ['canh', 'mau', 'tai', 'mood']; toast(me, 'Liếc được tờ ghi chú của Kính sự phòng: biết hết sở thích hôm nay của Hoàng thượng (xem trong Sở thích Hoàng thượng).', 'good'); }
        else { me.silver += 60; toast(me, 'Liếc thấy tấu chương thăng chức cho người nhà, báo tin sớm về phủ: gia tộc gửi biếu 60 bạc.', 'good'); }
      } else { me.sung -= 6; htSay(`${me.name}! Hậu cung không được can dự triều chính!`); news(`📜 ${me.name} liếc trộm tấu chương bị Hoàng thượng bắt gặp, bị quở trách.`); toast(me, 'Bị bắt gặp liếc trộm tấu chương: sủng ái -6.', 'bad'); }
    } else if (d.op === 'thoStart') {
      if (!atDT()) return; if (VD.tho) return toast(me, 'Hôm nay đã đối thơ cùng Hoàng thượng rồi.'); VD.thoOn = 1; sock.emit('vuaTho');
    } else if (d.op === 'tho') {
      if (!VD.thoOn || VD.tho) return; VD.tho = 1; const ok = Math.max(0, Math.min(3, +d.ok || 0)); const g = htGain(me, [-2, 1, 4, 9][ok]);
      addPts(me, 3 + ok * 3); cnt(me, 'vuatho');
      htSay(ok === 3 ? `Đối chỉnh lắm! Ban cho ${me.name} cây bút lông tử hào.` : ok === 2 ? 'Đối khá đấy.' : ok === 1 ? 'Còn non tay.' : 'Ha ha ha, nàng đối thế này thì trẫm cười mất.');
      if (ok === 3) news(`📜 ${me.name} đối thơ cùng Hoàng thượng ở Dưỡng Tâm điện, câu nào cũng chỉnh, được ban bút lông tử hào.`);
      toast(me, `Đối thơ đúng ${ok}/3: sủng ái ${g >= 0 ? '+' : ''}${g}.`, ok >= 2 ? 'good' : 'info');
    } else if (d.op === 'den') {
      if (me.loc !== 'hoavien' || !v.den) return toast(me, 'Chưa tới giờ thả hoa đăng.'); if (v.den.list.some(x => x.id === me.id)) return toast(me, 'Đã thả hoa đăng rồi.');
      const wish = String(d.wish || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Nguyện Hoàng thượng long thể an khang.';
      v.den.list.push({ id: me.id, name: me.name, wish }); htGain(me, 2); cnt(me, 'vuaden'); toast(me, 'Hoa đăng đã trôi ra hồ. Sủng ái +2, chờ xem Hoàng thượng có nhặt được không…', 'good'); vuaEmit();
    } else if (d.op === 'visit') {
      if (!v.visit || v.visit.id !== me.id) return; if (me.loc !== 'phong' || me.visit) return toast(me, 'Về cung riêng để nghênh giá.');
      const it = new Set((me.decor || []).map(x => x.item)); var sc = 5 + Math.min(8, it.size); const good = [];
      if (it.has('lahan') || it.has('banTra')) { sc += 3; good.push('có sẵn trà'); } if (colorMatch(me)) { sc += 4; good.push('áo đúng màu người thích'); }
      if ((me.loyal ?? 50) >= 70) { sc += 2; good.push('cung nữ hầu hạ chu đáo'); } if (it.has('luhuong')) { sc += 1; good.push('trầm hương thơm'); }
      sc = htGain(me, sc); addPts(me, 10); cnt(me, 'vuavisit'); VD.vis = 1; v.visit = null; vuaEmit();
      const line = sc >= 18 ? 'Cung của nàng bài trí thanh nhã, trẫm muốn ngồi lại lâu hơn.' : sc >= 11 ? 'Cung nàng cũng ấm cúng lắm.' : 'Cung sao trống trải quá, để trẫm sai Nội vụ phủ đưa thêm đồ.';
      htSay(line); news(`🐉 ${me.name} nghênh giá Hoàng thượng tại cung, ${sc >= 18 ? 'được khen bài trí thanh nhã' : 'Hoàng thượng ngồi dùng trà'}.`);
      toast(me, `Nghênh giá thành công: sủng ái +${sc}, công trạng +10${good.length ? ` (${good.join(', ')})` : ''}.`, 'good');
    }
    if ((VD.sg || 0) > C.VUA.DAY_CAP && !VD.capN) { VD.capN = 1; setTimeout(() => toast(me, `Hôm nay đã nhận hơn ${C.VUA.DAY_CAP} sủng ái từ Hoàng thượng, từ giờ ân sủng chỉ còn 1/3 tới hết ngày.`, 'info'), 1500); }
    save(); push(me);
  }); });
}
// ---------- THỊ TẨM: chuẩn bị, tâm sự, tâu chuyện, tín vật, tranh sủng, đối thơ, nhật ký ----------
// mood index: 0 vui, 1 mệt, 2 buồn
const PREP = {
  hoa: [['Cánh hồng', [3, 1, 1]], ['Hoa nhài', [1, 3, 2]], ['Hoa sen', [1, 2, 3]]],
  ao: [['Áo lụa hồng thắm', [3, 0, 1]], ['Áo lụa trắng mỏng', [1, 3, 2]], ['Áo gấm thêu mẫu đơn', [2, 1, 1]]],
  huong: [['Hương trầm', [1, 3, 2]], ['Hương lan', [3, 1, 2]], ['Hương mai thanh', [1, 1, 3]]],
};
const TAMSU = [
  { q: 'Biên cương báo tin chiến sự căng thẳng, trẫm ăn ngủ không yên…', opts: [['Hoàng thượng anh minh, tướng sĩ tất thắng. Người nghỉ một đêm mới đủ sức lo việc lớn.', 3], ['Thần thiếp nguyện ăn chay cầu bình an cho tướng sĩ.', 2], ['Hay Hoàng thượng kể thần thiếp nghe trận mạc thế nào?', -1]] },
  { q: 'Hôm nay là ngày giỗ mẫu phi của trẫm…', opts: [['Thần thiếp xin cùng người thắp nén hương, nói chuyện về bà.', 3], ['Mẫu phi trên trời chắc tự hào về Hoàng thượng lắm.', 2], ['Hoàng thượng đừng buồn nữa, để thần thiếp múa cho người xem.', -1]] },
  { q: 'Lão đại thần họ Vương hôm nay lại cãi trẫm giữa triều!', opts: [['Trung thần mới dám can gián, đó là phúc của Hoàng thượng.', 3], ['Người bớt giận, uống chén trà sen cho mát gan.', 2], ['Phạt lão ta thật nặng cho chừa!', -2]] },
  { q: 'Trẫm nhớ hồi còn là hoàng tử, được tự do cưỡi ngựa ngoài thành…', opts: [['Đợi xuân sang, thần thiếp xin theo người đi săn ở Mộc Lan.', 3], ['Giờ Hoàng thượng gánh cả giang sơn, thần thiếp thương người lắm.', 2], ['Làm hoàng tử sao sướng bằng làm vua ạ?', -1]] },
  { q: 'Hậu cung dạo này ồn ào quá, trẫm nghe mà đau đầu.', opts: [['Thần thiếp sẽ khuyên các tỷ muội giữ hòa khí.', 3], ['Ở chỗ thần thiếp yên tĩnh, người cứ đến nghỉ.', 2], ['Là do mấy người kia hay gây chuyện ạ…', -2]] },
  { q: 'Năm nay mất mùa ở Giang Nam, trẫm lo dân đói.', opts: [['Thần thiếp xin bớt bổng lộc góp vào lương cứu đói.', 3], ['Có Hoàng thượng thương dân, ắt trời sẽ thương.', 1], ['Trong cung vẫn đủ ăn mà ạ.', -2]] },
];
const TINVAT = ['Ngọc bội song ngư', 'Quạt đề thơ ngự bút', 'Trâm bạch ngọc', 'Hộp phấn Tô Châu', 'Khăn lụa thêu long phượng', 'Chuỗi trầm hương', 'Gương đồng chạm hoa', 'Bức họa chân dung'];
const DOI_THO = [
  ['Sàng tiền minh nguyệt quang', 'Nghi thị địa thượng sương', ['Xứ xứ văn đề điểu', 'Hoàng Hà nhập hải lưu']],
  ['Cử đầu vọng minh nguyệt', 'Đê đầu tư cố hương', ['Dạ bán chung thanh đáo khách thuyền', 'Phục chiếu thanh đài thượng']],
  ['Xuân miên bất giác hiểu', 'Xứ xứ văn đề điểu', ['Nghi thị địa thượng sương', 'Đãn văn nhân ngữ hưởng']],
  ['Dạ lai phong vũ thanh', 'Hoa lạc tri đa thiểu', ['Cánh thượng nhất tầng lâu', 'Đê đầu tư cố hương']],
  ['Bạch nhật y sơn tận', 'Hoàng Hà nhập hải lưu', ['Hoa lạc tri đa thiểu', 'Giang phong ngư hỏa đối sầu miên']],
  ['Dục cùng thiên lý mục', 'Cánh thượng nhất tầng lâu', ['Xuân miên bất giác hiểu', 'Nghi thị địa thượng sương']],
  ['Không sơn bất kiến nhân', 'Đãn văn nhân ngữ hưởng', ['Hoàng Hà nhập hải lưu', 'Dạ lai phong vũ thanh']],
  ['Nguyệt lạc ô đề sương mãn thiên', 'Giang phong ngư hỏa đối sầu miên', ['Cử đầu vọng minh nguyệt', 'Phản cảnh nhập thâm lâm']],
];
function diary(p, text) { p.diary = p.diary || []; p.diary.unshift({ t: now(), text }); p.diary = p.diary.slice(0, 40); }
const night = p => p.tamCungUntil > now() ? p.tamCungUntil : 0;
function nightView(p) {
  const n = night(p); if (!n) return null; const N = p.night?.id === n ? p.night : {};
  return { until: n, prep: N.prep || null, tau: !!N.tau, tho: !!N.tho, gift: N.gift || null, mood: C.HT.mood[ht().mood] };
}
function nightState(p) { const n = night(p); if (!n) return null; if (p.night?.id !== n) p.night = { id: n }; return p.night; }
const KEO = {}; // targetId -> {by, at, timer}
function resolveKeo(tid, held) {
  const k = KEO[tid]; if (!k) return; delete KEO[tid]; clearTimeout(k.timer);
  const t = P(tid), a = P(k.by); if (!t || !a) return;
  if (held) { a.sung = Math.max(0, a.sung - 5); toast(a, `Hoàng thượng chỉ sai thái y qua xem, rồi ở lại với ${t.name}. Kế không thành (sủng ái -5).`, 'bad'); toast(t, '💕 Bổn cung giữ chân được Hoàng thượng. Người ở lại cả đêm.', 'good'); t.sung += 5; diary(t, `Có kẻ giả bệnh mời Hoàng thượng đi, nhưng người ở lại với bổn cung.`); news(`🌙 Có người giả bệnh mời Hoàng thượng giữa đêm, nhưng người vẫn ở lại với ${t.name}.`); }
  else { t.tamCungUntil = now(); a.sung += 10; toast(t, `💔 Hoàng thượng bỏ đi giữa đêm sang cung ${a.name}…`, 'bad'); toast(a, `🌙 Kế thành! Hoàng thượng rời ${t.name}, sang thăm bổn cung (+10 sủng ái).`, 'good'); diary(t, `Đang hầu thì ${a.name} sai người báo bệnh, Hoàng thượng bỏ đi giữa đêm.`); diary(a, `Giả bệnh kéo Hoàng thượng khỏi tẩm cung của ${t.name}. Người sang thăm bổn cung.`); news(`🌙 Nửa đêm ${a.name} trở bệnh, Hoàng thượng rời tẩm cung của ${t.name} sang thăm.`, 'latthe');
    const sk = sockOf(t.id); if (sk) { sk.emit('keoKet', { lost: true }); setTimeout(() => { if (t.loc === 'tamcung') { t.outfit = C.RANKS[t.rank].outfit; enter(t, 'phong', sk); push(t); } }, 3500); } }
  push(t); push(a); save();
}
// hầu chuyện Hoàng thượng trong tẩm cung: điểm mỗi lựa chọn theo tâm trạng [vui, mệt, buồn]
const HT_TALK = [
  { q: 'Hôm nay tấu chương chất cao như núi…', opts: [{ t: 'Để thần thiếp xoa vai cho Hoàng thượng.', s: [1, 3, 1] }, { t: 'Hoàng thượng kể thần thiếp nghe chuyện triều chính đi.', s: [3, -1, 0] }, { t: 'Thần thiếp đàn một khúc cho người khuây khỏa.', s: [1, 1, 3] }] },
  { q: 'Nàng thấy trong cung dạo này thế nào?', opts: [{ t: 'Có Hoàng thượng, hậu cung yên vui.', s: [3, 1, 1] }, { t: 'Thần thiếp chỉ mong Hoàng thượng giữ gìn long thể.', s: [0, 3, 2] }, { t: 'Có vài chuyện… thần thiếp không dám nói.', s: [-1, -1, 1] }] },
  { q: 'Trẫm vừa xem tấu biên cương, lòng nặng trĩu.', opts: [{ t: 'Hoàng thượng anh minh, việc gì rồi cũng qua.', s: [2, 1, 3] }, { t: 'Thần thiếp không hiểu chính sự, chỉ xin pha trà cho người.', s: [1, 3, 2] }, { t: 'Hay Hoàng thượng kể thần thiếp nghe đi?', s: [2, -1, 1] }] },
  { q: 'Hôm nay trẫm đi ngang Ngự hoa viên, hoa nở đẹp lắm.', opts: [{ t: 'Mai thần thiếp hái một nhành cắm bình cho người.', s: [3, 2, 2] }, { t: 'Hoa đẹp sao bằng lúc Hoàng thượng cười.', s: [3, 0, 2] }, { t: 'Thần thiếp bị dị ứng phấn hoa ạ…', s: [-1, -1, -1] }] },
  { q: 'Nàng có nhớ nhà không?', opts: [{ t: 'Có Hoàng thượng ở đây, nơi này là nhà.', s: [3, 2, 3] }, { t: 'Thần thiếp nhớ món canh mẹ nấu.', s: [1, 1, 2] }, { t: 'Nhớ lắm, xin Hoàng thượng cho thần thiếp về thăm.', s: [0, -1, 0] }] },
  { q: 'Trẫm hơi mỏi mắt rồi.', opts: [{ t: 'Để thần thiếp chườm khăn ấm cho người.', s: [1, 3, 2] }, { t: 'Thần thiếp đọc tấu chương giúp người nhé?', s: [-1, -2, -1] }, { t: 'Người nhắm mắt nghe thần thiếp ngâm thơ.', s: [2, 2, 3] }] },
  { q: 'Ngày mai trẫm phải tế trời, nàng chúc trẫm điều gì?', opts: [{ t: 'Chúc quốc thái dân an, mưa thuận gió hòa.', s: [3, 2, 2] }, { t: 'Chúc Hoàng thượng long thể an khang.', s: [2, 3, 2] }, { t: 'Chúc thần thiếp sớm được thăng cấp ạ!', s: [0, -2, -1] }] },
  { q: 'Nàng biết đánh cờ không?', opts: [{ t: 'Biết chút ít, xin Hoàng thượng chỉ giáo.', s: [3, 1, 2] }, { t: 'Thần thiếp chỉ biết thua Hoàng thượng thôi ạ.', s: [2, 2, 3] }, { t: 'Thần thiếp đánh giỏi lắm, người đừng chê.', s: [1, -1, 0] }] },
  { q: 'Đêm đã khuya, nàng muốn trẫm thưởng gì?', opts: [{ t: 'Thần thiếp không cần gì, chỉ cần người vui.', s: [2, 2, 3] }, { t: 'Xin Hoàng thượng ban cho thần thiếp một bài thơ.', s: [3, 0, 1] }, { t: 'Một chiếc trâm ngọc thật đẹp ạ!', s: [1, -1, -1] }] },
];
function nightTick() {
  const v = vnNow();
  const k = dayKey();
  const mins = v.getUTCHours() * 60 + v.getUTCMinutes();
  DB.state.latDone = DB.state.latDone || {};
  C.LAT_THE_SLOTS.forEach(([h, m, when], i) => { const key = k + ':' + i; if (mins >= h * 60 + m && mins < h * 60 + m + 60 && !DB.state.latDone[key]) { DB.state.latDone[key] = 1; latThe(when); } });
  feastTick(mins, k);
  vuaTick(mins, k);
  // vắng mặt: từ Tần trở lên
  for (const p of Object.values(DB.players)) {
    if (p.lanh || p.rank < C.PALACE_RANK) continue;
    const days = (now() - (p.lastSeen || now())) / 864e5;
    if (days >= C.ABSENT_SICK_DAYS && days < C.ABSENT_LOSE_DAYS && !p.sick && !online.has(p.id)) { p.sick = true; news(`${p.name} cáo bệnh, đã ${Math.floor(days)} ngày không ra khỏi cung.`); }
    if (days >= C.ABSENT_LOSE_DAYS && !online.has(p.id)) { p.sick = false; const r = p.rank; p.rank = C.PALACE_RANK - 1; p.waiting = true; p.trend = { dir: -1, t: now() }; p.outfit = C.RANKS[p.rank].outfit; news(`${p.name} vắng mặt quá lâu, nhường ghế ${C.RANKS[r].name}.`); freeSeatCheck(); }
  }
  checkDeadlines(); thaiTick(); kidTick(); sinhTick(); hhcTick(); leTick(); housekeep(); hhTick(); eventTick(); npcDaily(); grudgeTick(); bigTick(); festTick(); if (v.getUTCHours() >= 3) backup();
  // vụ án do hệ thống dàn dựng khi cung vắng người
  for (const p of Object.values(DB.players)) {
    if (!online.has(p.id) || p.lanh || p.rank < C.FIGHT_RANK) continue;
    if (p.protectUntil > now()) continue;
    if (Object.values(DB.state.cases).some(c => c.victim === p.id && c.status === 'open' && !c.det)) continue;
    if (p.npcCaseDay === dayKey()) continue;
    if (Math.random() < (p.thai?.known ? 0.006 : 0.004)) { p.npcCaseDay = dayKey(); createCase(p, null, { blur: Math.random() < 0.3, thai: !!p.thai?.known && Math.random() < .6 }); }
  }
}

// ---------------- vị trí, phòng ----------------
const LOCS = ['tuninh', 'hoavien', 'duongtam', 'phong', 'tamcung', 'lanhcung', 'yentiec', 'ngutien', 'acaso', 'sansinh'];
// ghế ngồi: loc -> { seatId: playerId }
const SEATS = {}; const SEAT_IDS = { duongtam: ['hh0'], hoavien: ['hv0', 'hv1', 'hv2', 'hv3', 'hv4'], yentiec: ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'] };
function freeSeat(p) { for (const loc in SEATS) for (const k in SEATS[loc]) if (SEATS[loc][k] === p.id) delete SEATS[loc][k]; p.seat = null; }
function takeSeat(p, id) { const rk = roomOf(p), L = (SEATS[rk] = SEATS[rk] || {}); if (p.loc === 'phong' ? !/^(d\d{1,2}|b0|k\d{1,2}[ab])$/.test(id) : !(SEAT_IDS[p.loc] || []).includes(id)) return false; if (L[id] && L[id] !== p.id && online.has(L[id])) return false; freeSeat(p); L[id] = p.id; p.seat = id; p.anim = 'sit:' + id; return true; }
function roomOf(p) { return p.loc === 'phong' ? 'phong:' + (p.visit || p.id) : p.loc === 'tamcung' ? 'tamcung:' + p.id : p.loc; }
function enter(p, loc, sock) {
  const old = roomOf(p); freeSeat(p);
  sock.leave(old); sock.to(old).emit('pleave', p.id);
  p.loc = loc; p.x = 0; p.z = loc === 'tuninh' ? 3.5 : 2; p.ry = Math.PI; p.anim = 'dung_cho';
  const room = roomOf(p);
  sock.join(room);
  const others = [...online.keys()].map(P).filter(q => q && q.id !== p.id && roomOf(q) === room && (!stealth(q) || p.admin)).map(publicView);
  let seat = null;
  if (loc === 'yentiec') { const free = SEAT_IDS.yentiec.find(id => !(SEATS.yentiec || {})[id] || !online.has(SEATS.yentiec[id])); if (free) { takeSeat(p, free); seat = free; } }
  if (loc === 'phong' && p.lying) p.anim = 'lie:b0';
  const host = loc === 'phong' ? (P(p.visit) || p) : null;
  sock.emit('scene', { fei: feiPresent(loc).map(feiView), loc, players: others, venue: DB.state.feast?.venue || 'out', seat, host: host ? { id: host.id, name: host.name, decor: host.decor || [], palace: host.rank >= C.PALACE_RANK, kids: kidView(host).filter(c => !c.ward && !c.test && c.id !== host.carry && c.id !== host.follow).map(c => ({ id: c.id, sex: c.sex, name: c.name, stage: c.stage, cry: c.cry, tt: c.thaitu || c.coluan, ao: c.ao })) } : null, sinh: loc === 'sansinh' ? sinhPub() : null, acaso: loc === 'acaso' ? Object.values(DB.players).flatMap(q => kidView(q).filter(c => c.ward && !c.test).map(c => ({ id: c.id, sex: c.sex, name: c.name, stage: c.stage, cry: c.cry, tt: c.thaitu || c.coluan, ao: c.ao, mother: q.name, mid: q.id }))) : null, lying: loc === 'phong' && !!p.lying });
  if (loc === 'yentiec' && DB.state.feast?.show && now() < DB.state.feast.show.at + 38e3) setTimeout(() => sock.emit('npcShow', DB.state.feast.show), 2000);
  if (loc === 'yentiec') { const t = DB.state.feast?.tl; setTimeout(() => sock.emit('tuulenh', t && !t.done ? { q: t.q, end: t.end } : null), 1500); }
  if (stealth(p)) { for (const [id, so] of online) { const q = P(id); if (q && q.admin && id !== p.id && roomOf(q) === room) so.emit('pjoin', publicView(p)); } } else sock.to(room).emit('pjoin', publicView(p));
}

// ---------------- kết nối ----------------
io.on('connection', sock => {
  let me = null;
  const ok = p => {
    setTimeout(() => { for (const c of Object.values(DB.state.cases)) if (c.witnessReq?.who === p.id) askWitness(c); }, 3000);
    if (online.has(p.id)) { try { online.get(p.id).emit('kicked'); online.get(p.id).disconnect(); } catch (e) {} }
    me = p; online.set(p.id, sock); p.lastSeen = now(); freshDay(p); track(p, 's'); p.visit = null; if (p.sickUntil && now() > p.sickUntil) { p.sick = false; p.sickUntil = 0; p.lying = false; }
    if (!p.token) p.token = crypto.randomBytes(16).toString('hex');
    sock.emit('auth', { token: p.token });
    sock.emit('newsAll', DB.state.news.slice(0, 30));
    sock.emit('feast', feastView());
    sock.emit('schedule', { latThe: C.LAT_THE_SLOTS, feast: C.FEAST_SLOTS, vua: C.VUA, tz: C.TZ_OFFSET_H ?? 7, lead: C.NOTICE_LEAD_MIN });
    for (const c of Object.values(DB.state.cases)) if (c.victim === p.id && c.status === 'open' && !c.deadline) {
      c.deadline = now() + caseHoursFor(p, c.hours) * 3600e3;
      setTimeout(() => sock.emit('cutscene', { type: 'phatgiac', caseId: c.id, method: c.method, methodName: c.methodName, crime: c.crime, hours: caseHoursFor(p, c.hours), mama: rel(p, 'mama') }), 2500);
    }
    push(p);
    if (p.sick) { p.sick = false; if (!p.admin) news(`${p.name} đã khỏi bệnh, trở lại hầu hạ.`); }
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
    if (!me || !LOCS.includes(loc)) return; track(me, 'goto:' + loc);
    if (me.lanh && loc !== 'lanhcung') return toast(me, 'Người ở lãnh cung không được ra ngoài.', 'bad');
    if (!me.lanh && loc === 'lanhcung') { if ((me.camTucUntil || 0) > now()) return toast(me, 'Đang bị cấm túc, chưa được ra khỏi phòng.', 'bad');
      if (me.lanhVisit !== dayKey()) { if (me.silver < 30) return toast(me, 'Phải lót tay thị vệ canh lãnh cung 30 bạc mới được vào.', 'bad'); me.silver -= 30; me.lanhVisit = dayKey(); toast(me, 'Đã lót tay thị vệ 30 bạc, được vào lãnh cung (hôm nay ra vào tự do).'); } }
    if (loc === 'tamcung' && !(me.tamCungUntil > now())) return toast(me, 'Chỉ người được lật thẻ mới vào tẩm cung đêm nay.');
    if ((me.camTucUntil || 0) > now() && loc !== 'phong') return toast(me, 'Đang bị cấm túc, chưa được ra khỏi phòng.', 'bad');
    if (loc === 'yentiec' && !(DB.state.feast && !DB.state.feast.done)) return toast(me, 'Hiện không có yến tiệc.');
    if (loc === 'sansinh' && (!DB.state.sinh || (DB.state.sinh.test && !me.admin))) return toast(me, 'Hiện không có ai chuyển dạ.');
    if (DB.state.sinh?.id === me.id && DB.state.sinh.phase !== 'bao') return toast(me, 'Nương nương đang chuyển dạ, không đi đâu được!', 'bad');
    if (loc === 'ngutien' && me.rank < C.FIGHT_RANK) return toast(me, `Từ ${C.RANKS[C.FIGHT_RANK].name} mới được vào Ngự thiện phòng.`);
    if (me.lying && !(loc === 'phong' && !me.visit)) { me.lying = false; }
    me.visit = null;
    if (loc === 'tamcung') me.outfit = 'aongu';
    else if (me.outfit === 'aongu' && loc !== 'phong') me.outfit = me.lanh ? 'tunu' : C.RANKS[me.rank].outfit;
    enter(me, loc, sock); push(me);
  });
  let lastMove = 0;
  sock.on('move', d => {
    if (!me) return; const tm = Date.now(); if (tm - lastMove < 50 && d.anim === me.anim) return; lastMove = tm; // chặn gửi dồn dập
    me.x = +d.x || 0; me.z = +d.z || 0; me.ry = +d.ry || 0; me.anim = String(d.anim || 'dung_cho').slice(0, 20); if (me.seat) freeSeat(me);
    const mv = { id: me.id, x: +me.x.toFixed(2), z: +me.z.toFixed(2), ry: +me.ry.toFixed(2), anim: me.anim };
    if (stealth(me)) rTo(me, sock).emit('pmove', mv); else { const rm = roomOf(me); if (!moveBuf.has(rm)) moveBuf.set(rm, new Map()); moveBuf.get(rm).set(me.id, mv); } // gom lại gửi theo lô
  });
  sock.on('sit', d => { if (!me) return; if (d?.seat === 'hh0' && !isHH(me) && !me.admin) return toast(me, 'Phượng tọa bên cạnh ngai rồng chỉ dành cho Hoàng hậu.'); if (!takeSeat(me, String(d?.seat || ''))) return toast(me, 'Ghế này đã có người ngồi.'); sock.emit('sitOk', { seat: me.seat }); rTo(me, sock).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: me.anim }); });
  sock.on('stand', () => { if (!me) return; if (me.lying) { me.lying = false; push(me); } if (!me.seat) return; freeSeat(me); me.anim = 'dung_cho'; rTo(me, sock).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: 'dung_cho' }); });
  sock.on('emote', a => { if (me) { me.anim = String(a).slice(0, 20); rTo(me, sock).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: me.anim, once: true }); } });
  sock.on('chat', t => {
    if (!me) return;
    const d_ch = t && typeof t === 'object' ? t.ch : null; if (t && typeof t === 'object') t = t.text;
    let text = String(t || '').trim().slice(0, 200); if (!text) return; track(me, 'chat');
    if (text.startsWith('/') && me.admin) return admin(me, text);
    // xưng hô cung đình cho vui
    const self = me.rank >= C.FIGHT_RANK ? 'bổn cung' : 'thần thiếp';
    text = text.replace(/(^|[\s,.!?;:"'(])(tui|tôi|tao)(?=$|[\s,.!?;:"')])/giu, (m, a) => a + self)
               .replace(/(^|[\s,.!?;:"'(])(bà|mày)(?=$|[\s,.!?;:"')])/giu, (m, a) => a + 'tỷ tỷ');
    if (d_ch === 'tm') { const g = grp(me); if (!g) return toast(me, 'Chưa kết nghĩa tỷ muội.'); for (const id of g.members) { const sk = sockOf(id); if (sk) sk.emit('chat', { id: me.id, name: title(me), text, ch: 'tm' }); } return; }
    rTo(me, null, true).emit('chat', { id: me.id, name: title(me), text });
    if (me.loc === 'yentiec') tuuLenhAnswer(me, text);
  });

  sock.on('action', d => {
    if (!me) return; track(me, String(d?.type || '?').slice(0, 12));
    freshDay(me);
    const a = d.type;
    if (me.lanh && !['lanh', 'tangqua', 'phephi'].includes(a)) return toast(me, 'Ở lãnh cung chỉ có thể làm nhiệm vụ lãnh cung.', 'bad');
    if ((me.camTucUntil || 0) > now() && !['luyen', 'thuongcn', 'shop', 'cauca'].includes(a)) return toast(me, 'Đang bị cấm túc: chỉ được luyện tài nghệ trong phòng.', 'bad');
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
      const Q = TH_Q[me.thQ ?? 0], o = Q && Q.opts[+d.ans]; const bonus = o ? o.s : 0;
      relAdd(me, 'thaihau', 2 + bonus, bonus >= 3 ? 'trả lời khéo khi thỉnh an' : bonus < 0 ? 'nói lời khiến ai gia phật ý' : null);
      me.thinhAn = true; cnt(me, 'thinhan'); const h = Math.max(1, C.THINH_AN.haiLong * (me.path === 'duchanh' ? 2 : 1) + Math.floor(me.stats.duc / 10) + bonus + (rel(me, 'thaihau') <= -30 ? -2 : 0) + (me.jewels?.includes('hoatai') ? 1 : 0)) * (evOn('phatdan') ? 2 : 1);
      me.haiLong = Math.min(100, me.haiLong + h); taskDone('thinhan'); addPts(me, C.THINH_AN.pts);
      toast(me, `Thái hậu hài lòng (+${h}). Công trạng +${C.THINH_AN.pts}.`, 'good');
      const s = sockOf(me.id); if (s) s.emit('npcSay', { who: 'Thái hậu', text: o ? o.r : 'Đứng lên đi.' });
    } else if (a === 'luyen') {
      if (!useTurn(1)) return;
      const q = Math.max(0, Math.min(1, +d.q || 0)), tai = TIET_MUC[d.tai] ? d.tai : 'múa';
      me.stats.tai += 1 + (q > .8 ? 1 : 0) + (me.path === 'tainghe' ? 1 : 0);
      const pts = Math.round(C.ACTIONS.luyen.pts * (0.5 + q) * (me.path === 'tainghe' ? 1.5 : 1));
      taskDone('luyen'); cnt(me, 'luyen'); addPts(me, pts); if (q > .8) me.silver += 10;
      toast(me, `${q > .8 ? 'Xuất sắc! ' : q > .5 ? '' : 'Còn vụng… '}Luyện ${TM_NAME(tai).toLowerCase()} xong. Công trạng +${pts}${q > .8 ? ', thưởng 10 bạc' : ''}.`, 'good');
    } else if (a === 'dangcanh') {
      if (me.loc !== 'duongtam') return toast(me, 'Phải đến Dưỡng Tâm điện mới dâng canh được.');
      if (!useTurn(1, C.ACTIONS.dangcanh.silver)) return;
      const q = Math.max(0, Math.min(1, +d.q || 0)), soup = +d.soup, fav = soup === ht().canh;
      const sung = 2 + Math.round(4 * q) + (fav ? 6 : 0);
      me.sung += sung; cnt(me, 'dangcanh'); addPts(me, C.ACTIONS.dangcanh.pts);
      const name = C.HT.canh[soup] || 'canh';
      const line = fav ? `Đúng món trẫm đang thèm! ${name} hôm nay rất vừa ý.` : q > .7 ? `${name} nấu khéo lắm.` : q > .4 ? `Cũng được.` : `Canh hơi ${pick(['mặn', 'nhạt', 'nguội'])}…`;
      const s = sockOf(me.id); if (s) s.emit('npcSay', { who: 'Hoàng thượng', text: line });
      toast(me, `Dâng ${name}. Sủng ái +${sung}.`, fav || q > .7 ? 'good' : 'info');
    } else if (a === 'dotin') {
      if (me.loc !== 'hoavien') return toast(me, 'Phải ra Ngự hoa viên mới dò tin được.');
      if (!useTurn(1)) return;
      taskDone('dotin'); cnt(me, 'dotin'); addPts(me, C.ACTIONS.dotin.pts);
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
      cnt(me, 'tangqua'); addPts(me, C.ACTIONS.tangqua.pts);
      toast(me, `Đã tặng quà cho ${t.name}.`, 'good'); toast(t, `${title(me)} gửi tặng bổn cung một ${pick(['hộp trà Long Tỉnh', 'cây trâm ngọc', 'tấm lụa Tô Châu', 'hộp bánh hoa quế'])}.`, 'good'); push(t);
    } else if (a === 'ratay') {
      if (me.rank < C.FIGHT_RANK) return toast(me, `Từ ${C.RANKS[C.FIGHT_RANK].name} mới được ra tay.`, 'bad');
      const t = P(d.target);
      if (t?.admin && !me.admin) return toast(me, 'Không thể ra tay với người này.', 'bad');
      if (!t || t.id === me.id || t.lanh || t.rank < C.FIGHT_RANK) return toast(me, `Chỉ nhắm được người từ ${C.RANKS[C.FIGHT_RANK].name} trở lên.`, 'bad');
      if (sisters(me, t)) return toast(me, 'Đã kết nghĩa tỷ muội, sao nỡ ra tay.', 'bad');
      if (t.sick && t.sickUntil > now()) return toast(me, 'Người này đang cáo bệnh đóng cửa cung.', 'bad');
      if ((me.attacks || 0) >= C.ATTACK_PER_DAY) return toast(me, 'Hôm nay đã ra tay đủ số lần.', 'bad');
      if ((t.targeted || 0) >= C.TARGETED_PER_DAY || (t.protectUntil || 0) > now()) return toast(me, 'Người này đang được bảo hộ, chưa thể ra tay.', 'bad');
      if (Object.values(DB.state.cases).some(c => c.victim === t.id && c.status === 'open' && !c.det)) return toast(me, 'Người này đang dính một vụ án khác.', 'bad');
      if (C.THAI_METHODS.some(m => m.id === d.method) && !t.thai?.known) return toast(me, 'Người này không mang thai.', 'bad');
      const tv = (me.items?.tangvat || 0) > 0; const cost = (tv ? 0 : C.ACTIONS.ratay.silver - (me.path === 'muuke' ? 40 : 0)) + (d.blur ? 100 : 0);
      if (!useTurn(1, cost)) return; if (tv) { me.items.tangvat--; toast(me, '🎁 Dùng túi gấm câu được ở hồ làm tang vật, không tốn bạc.', 'good'); }
      freshDay(t); me.attacks = (me.attacks || 0) + 1; t.targeted = (t.targeted || 0) + 1;
      const thaiM = C.THAI_METHODS.find(m => m.id === d.method);
      const rev = (me.hanLC?.[t.id] || 0) > now(); if (rev) { delete me.hanLC[t.id]; toast(me, `🔥 Trả mối nhục lãnh cung: ${t.name} từng tới chế giễu bổn cung. Lần này tang vật được che giấu kỹ, tội trút lên đầu nặng gấp đôi.`, 'good'); }
      createCase(t, me, { method: d.method, blur: !!d.blur || rev, thai: !!thaiM, revenge: rev });
      toast(me, thaiM ? `Đã sai người đưa ${thaiM.name} tới cung ${t.name}. Chuyện này mà lộ ra thì vào lãnh cung…` : `Đã cài ${C.METHODS.find(m => m.id === d.method)?.name || 'tang vật'} vào phòng ${t.name}. Giờ chỉ chờ xem…`, 'good');
    } else if (a === 'hamhai') {
      const n = NPCF().find(x => x.id === d.target); if (!n) return; if (me.rank < C.FIGHT_RANK) return toast(me, `Từ ${C.RANKS[C.FIGHT_RANK].name} mới được ra tay.`, 'bad');
      if (me.hamDay === dayKey()) return toast(me, 'Hôm nay đã ra tay với phi tần khác rồi, làm nữa dễ lộ.');
      if (!useTurn(C.HAMHAI.turns, C.HAMHAI.silver)) return; me.hamDay = dayKey(); cnt(me, 'hamhai');
      n.grudge = n.grudge || {}; n.grudge[me.id] = now() + (1 + Math.random() * 2) * 864e5; feiAdd(me, n.id, -25);
      if (Math.random() < C.HAMHAI.ok + (me.path === 'muuke' ? .1 : 0)) {
        const loss = 40 + rnd(40); n.pts = Math.max(C.RANKS[n.rank].pts - 80, n.pts - loss); n.sung = Math.max(5, n.sung - 10);
        news(`🗡 Có kẻ giấu ${pick(['xạ hương', 'thư nặc danh', 'bùa yểm', 'thuốc xổ'])} trong cung ${n.name}, ${n.name} bị Hoàng thượng lạnh nhạt mấy ngày.`, 'an');
        toast(me, `Kế thành! ${n.name} mất ${loss} công trạng, sủng ái giảm.`, 'good');
        if (n.pts < C.RANKS[n.rank].pts - 50) npcDemote(n, 'mất lòng Hoàng thượng'); freeSeatCheck();
      } else { me.sung = Math.max(0, me.sung - 10); me.haiLong = Math.max(0, me.haiLong - 5); news(`🗡 ${me.name} bị cung nữ của ${n.name} bắt quả tang đang giở trò. Thái hậu quở trách.`, 'phat'); toast(me, `Bị bắt quả tang! Sủng ái -10, Thái hậu hài lòng -5.`, 'bad'); }
    } else if (a === 'muachuoc') {
      const t = P(d.target); if (!t || t.id === me.id) return;
      if (me.mcDay === dayKey()) return toast(me, 'Hôm nay đã mua chuộc một lần rồi, làm nhiều dễ lộ.');
      if (me.silver < C.MUACHUOC_PRICE) return toast(me, 'Không đủ bạc.', 'bad');
      me.silver -= C.MUACHUOC_PRICE; me.mcDay = dayKey(); cnt(me, 'muachuoc');
      const atk = Object.values(DB.state.cases).filter(c => c.culprit === t.id && !c.det).sort((a, b) => b.created - a.created)[0];
      const lines = [`${t.name} hiện có ${t.silver} lượng bạc, sủng ái ${t.sung}, Thái hậu hài lòng ${t.haiLong}.`];
      if (atk) lines.push(`Nô tỳ từng thấy chủ tử sai người mang ${atk.methodName.toLowerCase()} đi… nhắm vào ${atk.victimName}.`);
      else lines.push('Chủ tử nhà nô tỳ chưa từng hại ai, nô tỳ dám thề.');
      if (t.thai && !t.thai.known) lines.push('Mấy hôm nay chủ tử hay buồn nôn, chưa cho mời Thái y…');
      if (grp(t)) lines.push(`Chủ tử thân với ${grp(t).members.filter(x => x !== t.id).map(x => P(x)?.name).filter(Boolean).join(', ')} lắm.`);
      const tq = DB.state.hhVote?.votes?.[t.id]; if (tq) lines.push(`Kỳ bầu phượng ấn này, chủ tử tiến cử ${P(tq)?.name}.`);
      if (Math.random() < .25) { toast(t, '🕵️ Cung nữ trong cung bổn cung có vẻ lén lút, hình như vừa nhận bạc của ai đó…', 'bad'); }
      const s = sockOf(me.id); if (s) s.emit('npcSay', { who: `Cung nữ của ${t.name}`, text: lines.join(' '), long: true });
    } else if (a === 'nauan') {
      if (me.loc !== 'ngutien') return toast(me, 'Vào Ngự thiện phòng mới nấu được.'); if (me.rank < C.FIGHT_RANK) return;
      const R = C.RECIPES[+d.r]; if (!R) return; if (me.dish) return toast(me, 'Đang có món chưa dâng, mang lên Dưỡng Tâm điện trước đã.');
      me.cookDay = me.cookDay?.d === dayKey() ? me.cookDay : { d: dayKey(), n: 0 }; if (me.cookDay.n >= C.COOK.perDay) return toast(me, `Hôm nay đã nấu ${C.COOK.perDay} món rồi.`);
      if (!useTurn(C.COOK.turn, C.COOK.silver)) return;
      const q = Math.max(0, Math.min(1, +d.q || 0)); me.cookDay.n++; cnt(me, 'cook');
      me.dish = { r: +d.r, name: R.name, q, t: now(), dish: R.dish }; addPts(me, 4);
      toast(me, `Đã nấu xong ${R.name}${q > .85 ? ' (tuyệt hảo!)' : q > .6 ? '' : ' (hơi vụng)'}. Mang lên Dưỡng Tâm điện dâng Hoàng thượng trong ${C.COOK.hotHours} giờ kẻo nguội.`, 'good');
    } else if (a === 'dangmon') {
      if (me.loc !== 'duongtam') return toast(me, 'Phải đến Dưỡng Tâm điện.'); const D = me.dish; if (!D) return toast(me, 'Chưa có món nào.');
      const cold = now() - D.t > C.COOK.hotHours * 3600e3, fav = D.name === C.HT.canh[ht().canh];
      const meal = !cold && inMeal(); let sung = Math.round((5 + 9 * D.q + (fav ? 8 : 0) + (D.dish === 'dĩa' ? 2 : 0)) * (cold ? .4 : 1) * (meal ? 1.5 : 1)); me.sung += sung; addPts(me, cold ? 4 : 12); me.dish = null;
      const line = cold ? 'Món này nguội rồi… thôi, nàng có lòng là được.' : fav ? `Đúng món trẫm đang thèm! ${D.name} do chính tay nàng nấu sao? Ngon lắm!` : D.q > .85 ? `${D.name} tuyệt hảo, ngự trù cũng không bằng nàng.` : D.q > .6 ? `${D.name} khá ngon.` : `Hơi ${pick(['mặn', 'nhạt', 'khét'])}… nhưng trẫm vẫn ăn hết.`;
      const s = sockOf(me.id); if (s) s.emit('npcSay', { who: 'Hoàng thượng', text: line });
      if (!cold && (fav || D.q > .85)) news(`🍽 ${me.name} tự tay nấu ${D.name} dâng Hoàng thượng${meal ? ' đúng giờ ngự thiện' : ''}, được khen hết lời.`);
      else if (meal && D.q < .5) news(`🍽 ${me.name} dâng ${D.name} giờ ngự thiện, Hoàng thượng nếm một miếng rồi đặt đũa xuống…`);
      toast(me, `Dâng ${D.name}${cold ? ' (đã nguội)' : meal ? ' đúng giờ ngự thiện (×1.5)' : ''}: sủng ái +${sung}.`, cold ? 'info' : 'good');
    } else if (a === 'event') {
      const e = curEvent(); if (!e.loc) return;
      if (me.loc !== e.loc) return toast(me, 'Không đúng chỗ cho sự kiện này.');
      if (me.evDay === dayKey()) return toast(me, 'Hôm nay đã tham gia rồi, mai quay lại nhé.');
      if (e.id === 'hoadang') {
        me.evDay = dayKey(); const r = Math.random();
        if (r < .1) { me.sung += 15; news(`🏮 Hoa đăng của ${me.name} trôi tới chân Hoàng thượng đang dạo hồ. Người mỉm cười cầm lên đọc lời ước.`); toast(me, 'Đại cát! Hoàng thượng nhặt được hoa đăng của bổn cung: sủng ái +15.', 'good'); }
        else if (r < .55) { const g = 20 + rnd(31); me.silver += g; toast(me, `Trung cát: thả hoa đăng xong nhặt được túi bạc rơi bên hồ (+${g} bạc).`, 'good'); }
        else { const g = 3 + rnd(6); me.sung += g; toast(me, `Tiểu cát: hoa đăng trôi xa, lòng nhẹ nhõm. Sủng ái +${g}.`, 'good'); }
      } else if (e.id === 'disan') { me.evDay = dayKey(); me.sung += 5; addPts(me, 5); const s = sockOf(me.id); if (s) s.emit('npcSay', { who: 'Hoàng thượng', text: 'Nàng ra tiễn trẫm à? Đợi trẫm săn con hươu đẹp nhất về.' }); toast(me, 'Tiễn giá Hoàng thượng: sủng ái +5, công trạng +5.', 'good'); }
      else if (e.id === 'phatdan') { if (!useTurn(1)) return; me.evDay = dayKey(); me.haiLong = Math.min(100, me.haiLong + 5); addPts(me, 12); relAdd(me, 'thaihau', 3, 'chép kinh dịp Phật đản'); toast(me, 'Chép xong một quyển kinh dâng Thái hậu: hài lòng +5, công trạng +12.', 'good'); }
      else if (e.id === 'dichbenh') { if (me.silver < 20) return toast(me, 'Cần 20 bạc.', 'bad'); me.silver -= 20; me.evDay = dayKey(); addPts(me, 12); relAdd(me, 'thaiy', 5, 'cùng thần phát thuốc cứu cung nhân'); toast(me, 'Phát thuốc cho cung nhân: công trạng +12, Thái y thân thiết hơn.', 'good'); }
    } else if (a === 'shop') {
      const it = String(d.item || '');
      if (C.SHOP[it]) {
        const S = C.SHOP[it]; if (me.silver < S.price) return toast(me, 'Không đủ bạc.', 'bad');
        if (it === 'sam') { if (me.samToday) return toast(me, 'Hôm nay đã dùng nhân sâm rồi.'); me.samToday = true; me.turns += 1; }
        if (it === 'huong') { if (me.huong) return toast(me, 'Đã có hương rồi, chờ lần lật thẻ tới.'); me.huong = true; }
        if (it === 'le') me.haiLong = Math.min(100, me.haiLong + 8);
        me.silver -= S.price; toast(me, `Đã mua ${S.name}.`, 'good');
      } else if (C.JEWELS[it]) {
        me.jewels = me.jewels || []; if (me.jewels.includes(it)) return toast(me, 'Đã có món trang sức này.');
        if (me.silver < C.JEWELS[it].price) return toast(me, 'Không đủ bạc.', 'bad');
        me.silver -= C.JEWELS[it].price; me.jewels.push(it); toast(me, `Đã mua ${C.JEWELS[it].name}: ${C.JEWELS[it].desc.toLowerCase()}.`, 'good');
      } else if (C.DECOR_PRICE[it]) {
        me.decorOwned = me.decorOwned || []; if (me.decorOwned.includes(it)) return toast(me, 'Đã có món này.');
        if (me.silver < C.DECOR_PRICE[it]) return toast(me, 'Không đủ bạc.', 'bad');
        me.silver -= C.DECOR_PRICE[it]; me.decorOwned.push(it); toast(me, 'Nội vụ phủ đã đưa đồ tới phòng.', 'good');
      } else return;
    } else if (a === 'cauca') {
      if (me.loc !== 'hoavien') return toast(me, 'Ra hồ ở Ngự hoa viên mới câu cá được.');
      if (now() - (me.fishAt || 0) < 2500) return; me.fishAt = now();
      me.fishN = (me.fishN || 0) + 1;
      if (!(+d.q >= .5)) return toast(me, 'Cá cắn câu rồi sổng mất…');
      cnt(me, 'fish'); const wk = weekIdx(); if (me.wkFish?.w !== wk) me.wkFish = { w: wk, n: 0 }; me.wkFish.n++;
      const r = Math.random(), gp = evOn('hoica') ? .15 : .05; const F = r < gp ? ['Cá chép vàng', 0, 'gold'] : r < gp + .15 ? ['Cá chép đỏ', 15] : r < gp + .5 ? ['Cá diếc', 8] : ['Cá mè', 5]; if (evOn('hoica') && F[1]) F[1] = Math.round(F[1] * 1.5);
      if (F[2] === 'gold') { me.goldFish = (me.goldFish || 0) + 1; cnt(me, 'gold'); news(`🐟 ${me.name} câu được cá chép vàng hiếm ở Ngự hoa viên!`); toast(me, 'Cá chép vàng! Điềm lành, mang dâng Hoàng thượng ở Dưỡng Tâm điện.', 'good'); }
      else { const pay = me.fishN <= C.FISH_PAID ? F[1] : 0; me.silver += pay; toast(me, `Câu được ${F[0]}${pay ? `, bán cho ngự thiện phòng được ${pay} bạc` : ' (hôm nay đã bán đủ, thả lại hồ)'}.`, 'good'); }
      if (DB.state.fest && !DB.state.fest.done) { const dd = me.festDay = me.festDay?.d === dayKey() ? me.festDay : { d: dayKey() }; if ((dd.fish || 0) < 15) { dd.fish = (dd.fish || 0) + 1; festAdd(me, 2, 'câu cá'); } }
      const s = sockOf(me.id); if (s) s.emit('fishGot', { name: F[0], gold: F[2] === 'gold' });
      // thỉnh thoảng lưỡi câu vướng được thứ có ích cho cung đấu (tối đa 2 lần/ngày)
      const ff = me.fishFind = me.fishFind?.d === dayKey() ? me.fishFind : { d: dayKey(), n: 0 };
      if (ff.n < 2 && Math.random() < .08) { ff.n++; me.items = me.items || {};
        const myCase = Object.values(DB.state.cases).find(c => c.victim === me.id && c.status === 'open' && !c.det && !c.big);
        const left = myCase ? Object.keys(C.CLUES).filter(k => !myCase.found.some(f => f.kind === k)) : [];
        if (left.length && Math.random() < .6) { const k = pick(left); revealClue(myCase, k, me); setTimeout(() => toast(me, `📜 Lưỡi câu vướng một mảnh thư ướt sũng… là manh mối vụ ${myCase.methodName || 'án'}: ${C.CLUES[k].name}! Đã ghi vào hồ sơ.`, 'good'), 900); }
        else if (Math.random() < .5) { me.items.tangvat = (me.items.tangvat || 0) + 1; setTimeout(() => toast(me, '🎁 Câu được một túi gấm trôi dạt, trong có xạ hương và bùa yểm. Lần ra tay tới không tốn bạc mua tang vật.', 'good'), 900); }
        else { me.items.manhmoi = (me.items.manhmoi || 0) + 1; setTimeout(() => toast(me, '📜 Câu được một lá thư mật ai đó vứt xuống hồ. Lần tra manh mối tới (khi bị hãm hại) không tốn lượt, không tốn bạc.', 'good'), 900); }
      }
    } else if (a === 'dangca') {
      if (me.loc !== 'duongtam') return toast(me, 'Phải đến Dưỡng Tâm điện.'); if (!(me.goldFish > 0)) return toast(me, 'Chưa có cá chép vàng.');
      me.goldFish--; me.sung += 10; addPts(me, 10); news(`${me.name} dâng cá chép vàng, Hoàng thượng khen là điềm lành.`, 'an');
      const s = sockOf(me.id); if (s) s.emit('npcSay', { who: 'Hoàng thượng', text: 'Cá chép vàng! Điềm lành cho xã tắc, nàng có lòng lắm.' });
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
      const q = Math.max(0, Math.min(1, +d.q || 0)), tai = TIET_MUC[d.tai] ? d.tai : 'múa';
      htSay(q > .8 ? pick(['Tuyệt diệu! Thưởng rượu!', 'Hay! Trẫm chưa từng thấy ai ' + TM_NAME(tai).toLowerCase() + ' đẹp như vậy.', 'Xuất sắc!']) : q > .5 ? pick(['Khá lắm.', 'Cũng được, uống một chén nào.']) : pick(['Hơi vụng… nhưng có lòng là được.', 'Lần sau tập thêm nhé.']));
      f.entries[me.id] = { name: title(me), q, tai, color: colorMatch(me) }; cnt(me, 'feast'); festAdd(me, 20, 'dâng tiết mục');
      addPts(me, 5); toast(me, `Đã dâng tiết mục ${TM_NAME(tai)}. Chờ Hoàng thượng ban thưởng khi tiệc tàn.`, 'good');
      io.to('yentiec').emit('perfDone', { id: me.id, name: me.name, tai: TM_NAME(tai), q });
      io.emit('feastUpdate', feastView());
    } else if (a === 'ruou' || a === 'dance') {
      const f = DB.state.feast; if (!f || f.done || now() > f.end || me.loc !== 'yentiec') return toast(me, 'Chỉ làm được trong yến tiệc.');
      if (a === 'ruou') {
        f.toasts = f.toasts || {}; const n = f.toasts[me.id] || 0;
        if (d.to === 'ht') {
          f.htToast = f.htToast || {}; if (f.htToast[me.id]) return toast(me, 'Buổi tiệc này đã kính rượu Hoàng thượng rồi.');
          f.htToast[me.id] = 1; me.sung += 3; addPts(me, 3); roomSay(`${me.name} nâng chén kính Hoàng thượng: "Chúc Hoàng thượng vạn tuế vạn vạn tuế!"`);
          htSay(pick(['Nàng có lòng. Cạn chén!', 'Tốt! Trẫm uống cạn.', 'Ha ha, uống!']));
        } else {
          const t = P(d.to); if (!t || t.id === me.id || t.loc !== 'yentiec' || !online.has(t.id)) return toast(me, 'Người này không có ở yến tiệc.');
          if (n >= 3) return toast(me, 'Đã kính đủ 3 chén, uống nữa say mất.');
          f.toasts[me.id] = n + 1; addPts(me, 2); addPts(t, 2); me.rel = me.rel || {}; me.rel[t.id] = (me.rel[t.id] || 0) + 1; t.rel = t.rel || {}; t.rel[me.id] = (t.rel[me.id] || 0) + 1;
          roomSay(`${me.name} nâng chén kính ${t.name}: "${pick(['Chúc tỷ tỷ ngày càng xinh đẹp!', 'Muội kính tỷ một chén, mong tỷ chiếu cố!', 'Cạn chén vì tình tỷ muội!', 'Chúc tỷ sớm được thăng cấp!'])}" 🍶`);
          toast(t, `🍶 ${me.name} nâng chén kính bổn cung. Bấm Kính rượu để đáp lễ!`, 'good'); push(t);
        }
        io.to('yentiec').emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: 'tai:rượu', once: true });
      } else {
        f.dancers = f.dancers || {}; const first = !f.dancers[me.id]; f.dancers[me.id] = now(); if (first) { me.sung += 1; addPts(me, 2); }
        const live = Object.entries(f.dancers).filter(([, t]) => now() - t < 40e3).map(([id]) => id);
        const present = [...online.keys()].filter(id => P(id)?.loc === 'yentiec').length, need = present <= 3 ? 2 : 3;
        roomSay(`${me.name} bước ra giữa điện múa cùng mọi người 💃`);
        if (!f.danceBonus && live.length >= need) {
          f.danceBonus = true; const names = live.map(id => P(id)?.name).filter(Boolean);
          for (const id of live) { const q = P(id); if (q) { q.sung += 4; addPts(q, 5); toast(q, '💃 Cả điện cùng múa, Hoàng thượng vỗ tay khen: sủng ái +4.', 'good'); push(q); } }
          htSay('Đẹp quá! Các ái phi múa cùng nhau thật rộn ràng!'); news(`💃 ${names.join(', ')} cùng múa giữa yến tiệc, Hoàng thượng vỗ tay tán thưởng.`);
        } else if (!f.danceBonus) toast(me, `Cần ${need} người cùng múa trong 40 giây để được Hoàng thượng thưởng (đang có ${live.length}). Rủ mọi người ra múa!`);
      }
    } else if (a === 'phephi') {
      if (!me.lanh) return; if (me.phephiToday) return toast(me, 'Phế phi đã ngủ thiếp đi, mai hãy hỏi.');
      const s = sockOf(me.id);
      // bà phế phi đói lắm: phải có đồ ăn (tỷ muội gửi vào, người tới thăm mang cho) mới chịu kể bí mật
      if (!(me.lanh.food > 0)) { if (s) s.emit('npcSay', { who: 'Phế phi Trần thị', text: pick(['Đói… đói quá… ngươi có gì ăn không? Có miếng ăn thì ta kể cho nghe chuyện trong cung.', 'Mười năm rồi, ta chỉ ăn cơm nguội… Mang cho ta cái bánh, ta chỉ đường cho ngươi ra khỏi đây.', 'Nghe nói… đêm trăng có người gảy đàn ở góc tường, Hoàng thượng đi ngang mà động lòng… Hì hì. Muốn nghe thêm thì mang đồ ăn tới.']), long: true }); return; }
      me.lanh.food--; me.phephiToday = true;
      const c = me.lanh.caseId && DB.state.cases[me.lanh.caseId];
      let text;
      if (c) { const g = c.suspects.find(x => x.guilty); const miss = ['cung', 'gio', 'dau'].filter(k => !c.found.some(f => f.trait === k && f.value !== null)); const k = miss.length ? pick(miss) : pick(['cung', 'gio', 'dau']);
        text = `Ta ở đây đã mười năm, chuyện gì trong cung cũng nghe được. Kẻ hại ngươi có ${C.TRAITS[k][g.traits[k]]}. Nhớ lấy, rồi kêu oan cho đúng người.`;
        if (!c.found.some(f => f.kind === 'phephi')) c.found.push({ kind: 'phephi', name: 'Lời phế phi', text: `Phế phi kể kẻ hãm hại có ${C.TRAITS[k][g.traits[k]]}.`, trait: k, value: g.traits[k] });
      } else {
        const atk = Object.values(DB.state.cases).filter(x => !x.npc && x.culprit !== me.id).sort((a, b) => b.created - a.created)[0];
        const fav = Object.values(DB.players).filter(q => !q.lanh && !q.admin && q.id !== me.id).sort((a, b) => b.sung - a.sung)[0];
        const opts = [atk && `Ngươi có biết ${atk.victimName} từng bị hãm hại không? Ta nghe kẻ đứng sau là ${atk.culpritName}. Trong cung, kẻ thù của kẻ thù có khi là bạn.`,
          fav && `${fav.name} đang được sủng nhất cung, ${fav.sung} phần ân sủng. Kẻ đứng cao thì nhiều người muốn kéo xuống… ${(fav.items?.tangvat || 0) > 0 ? 'Ta còn nghe nó đang giấu túi gấm có xạ hương trong cung.' : 'Nó chưa từng đề phòng ai.'}`,
          'Mỗi đêm từ giờ Tuất tới giờ Tý, Hoàng thượng hay đi dạo ngang tường lãnh cung. Gảy đàn cho hay, may ra người động lòng mà cho ngươi về.',
          'Có tỷ muội bên ngoài thì nhờ họ quỳ ở Từ Ninh cung cầu tình. Hoàng hậu cũng có quyền ân xá, lấy lòng được Hoàng hậu là có đường ra.'].filter(Boolean);
        text = pick(opts);
      }
      if (s) s.emit('npcSay', { who: 'Phế phi Trần thị', text, long: true });
    } else if (a === 'httalk') {
      if (me.loc !== 'tamcung' || !(me.tamCungUntil > now())) return;
      if (me.htTalked === me.tamCungUntil) return toast(me, 'Đêm nay đã hầu chuyện Hoàng thượng rồi.');
      const ans = Array.isArray(d.ans) ? d.ans.slice(0, 3) : []; const mood = ht().mood; let sc = 0;
      (me.htQs || [0, 1, 2]).forEach((qi, i) => { const o = HT_TALK[qi]?.opts[+ans[i]]; if (o) sc += o.s[mood]; });
      const T = TAMSU[me.ts ?? 0], to = T?.opts[+d.ts]; if (to) sc += to[1]; const N = nightState(me); if (N?.prep) sc += Math.floor(N.prep.score / 3);
      me.htTalked = me.tamCungUntil; const sung = Math.max(0, sc * 2); me.sung += sung; addPts(me, 5 + sc);
      const gift = pick(TINVAT); if (N) N.gift = gift; me.tinvat = me.tinvat || {}; me.tinvat[gift] = (me.tinvat[gift] || 0) + 1;
      diary(me, sc >= 5 ? `Hầu chuyện Hoàng thượng rất vui. ${to && to[1] >= 3 ? 'Người nói nàng hiểu lòng trẫm nhất. ' : ''}Sáng ra được ban ${gift}.` : sc >= 2 ? `Hầu Hoàng thượng một đêm yên ả, được ban ${gift}.` : `Đêm ấy Hoàng thượng không vui lắm, lúc về vẫn ban ${gift}.`);
      const s = sockOf(me.id); if (s) s.emit('htTalkResult', { sung, score: sc, gift, line: sc >= 5 ? 'Có nàng ở bên, trẫm thấy lòng nhẹ hẳn.' : sc >= 2 ? 'Nàng thật biết điều.' : 'Trẫm hơi mệt, nàng lui về nghỉ sớm đi.' });
    } else if (a === 'chuanbi') {
      const N = nightState(me); if (!N) return toast(me, 'Chỉ khi được lật thẻ mới chuẩn bị.'); if (N.prep) return toast(me, 'Đã chuẩn bị xong rồi.');
      const mood = ht().mood, pk = k => PREP[k][Math.max(0, Math.min(2, +d[k] || 0))];
      const ch = { hoa: pk('hoa'), ao: pk('ao'), huong: pk('huong') }, score = ch.hoa[1][mood] + ch.ao[1][mood] + ch.huong[1][mood];
      N.prep = { score, text: `${ch.hoa[0]}, ${ch.ao[0]}, ${ch.huong[0]}` }; const sung = Math.max(0, score - 3); me.sung += sung;
      diary(me, `Tắm ${ch.hoa[0].toLowerCase()}, mặc ${ch.ao[0].toLowerCase()}, xông ${ch.huong[0].toLowerCase()} chờ Hoàng thượng.`);
      toast(me, score >= 8 ? `Chuẩn bị hoàn hảo, đúng ý Hoàng thượng đang ${C.HT.mood[mood]} (+${sung} sủng ái).` : score >= 5 ? `Chuẩn bị khá ổn (+${sung} sủng ái).` : 'Chuẩn bị chưa hợp tâm trạng Hoàng thượng lắm…', score >= 5 ? 'good' : 'info');
    } else if (a === 'tauchuyen') {
      if (me.loc !== 'tamcung') return; const N = nightState(me); if (!N) return; if (N.tau) return toast(me, 'Đêm nay đã tâu chuyện rồi.'); if (me.htTalked !== me.tamCungUntil) return toast(me, 'Hầu chuyện Hoàng thượng trước đã.');
      const t = P(d.who); if (!t || t.id === me.id) return; const s = sockOf(me.id), say = text => s && s.emit('npcSay', { who: 'Hoàng thượng', text, long: true });
      N.tau = 1;
      if (d.kind === 'thangcap') { if (!sisters(me, t)) { N.tau = 0; return toast(me, 'Chỉ tiến cử được tỷ muội kết nghĩa.'); } addPts(t, 30); t.sung += 5; say(`Được, nàng đã khen ${t.name} như vậy, trẫm sẽ để ý.`); toast(t, `💞 ${me.name} tiến cử bổn cung với Hoàng thượng: +30 công trạng.`, 'good'); diary(me, `Gối đầu tâu Hoàng thượng khen tỷ muội ${t.name}.`); notify(t, '💞 Tỷ muội tiến cử', `${me.name} nói tốt cho bổn cung với Hoàng thượng.`); }
      else if (d.kind === 'thalanh') { if (!t.lanh) { N.tau = 0; return toast(me, 'Người này không ở lãnh cung.'); } t.lanh.tasks++; say('Thôi được, nể nàng, trẫm sẽ cho người xét lại.'); toast(t, `🙏 ${me.name} xin Hoàng thượng tha tội cho bổn cung. Tiến độ phục vị ${t.lanh.tasks}/3.`, 'good'); diary(me, `Xin Hoàng thượng khoan dung cho ${t.name} ở lãnh cung.`); if (t.lanh.tasks >= 3) phucVi(t, 2, 'nhờ có người cầu xin Hoàng thượng'); }
      else if (d.kind === 'noixau') {
        if (sisters(me, t)) { N.tau = 0; return toast(me, 'Sao nỡ nói xấu tỷ muội.'); } if (t.lanh) { N.tau = 0; return; }
        if (Math.random() < .62) { t.sung = Math.max(0, t.sung - 15); say(`Thật sao? Trẫm không ngờ ${t.name} lại như vậy…`); diary(me, `Thì thầm với Hoàng thượng về ${t.name}. Người có vẻ tin.`); toast(t, '🗣 Có tin đồn ai đó nói xấu bổn cung bên gối Hoàng thượng (sủng ái -15).', 'bad'); }
        else { me.sung = Math.max(0, me.sung - 10); relAdd(me, 'thaihau', -3, 'đố kỵ nói xấu người khác'); say('Nàng cũng biết đố kỵ sao? Trẫm không thích nghe chuyện này.'); diary(me, `Nói xấu ${t.name} với Hoàng thượng, bị người quở là đố kỵ.`); toast(me, 'Hoàng thượng chê bổn cung đố kỵ (sủng ái -10).', 'bad'); }
      } else { N.tau = 0; return; }
      push(t);
    } else if (a === 'doitho') {
      if (me.loc !== 'tamcung') return; const N = nightState(me); if (!N) return; if (N.tho) return toast(me, 'Đêm nay đã ngắm trăng đối thơ rồi.');
      N.tho = 1; const ok = Math.max(0, Math.min(3, +d.ok || 0)), sung = ok * 3; me.sung += sung; addPts(me, ok * 2); if (ok === 3) cnt(me, 'thoOk');
      diary(me, ok === 3 ? 'Ngắm trăng bên cửa sổ, đối thơ không sai câu nào. Hoàng thượng khen nàng tài hoa.' : `Ngắm trăng cùng Hoàng thượng, đối được ${ok}/3 câu thơ.`);
      const s = sockOf(me.id); if (s) s.emit('npcSay', { who: 'Hoàng thượng', text: ok === 3 ? 'Tài nữ của trẫm! Đêm nay trăng cũng không đẹp bằng nàng.' : ok >= 2 ? 'Khá lắm, nàng thuộc thơ Đường nhiều đấy.' : 'Ha ha, nàng phải đọc thêm sách rồi.' });
      toast(me, `Đối đúng ${ok}/3 câu: sủng ái +${sung}.`, ok >= 2 ? 'good' : 'info');
    } else if (a === 'keoht') {
      const t = P(d.target); if (!t || t.id === me.id || !night(t) || t.loc !== 'tamcung' || !online.has(t.id)) return toast(me, 'Người này không đang hầu Hoàng thượng.');
      if (sisters(me, t)) return toast(me, 'Không nỡ phá đêm của tỷ muội.'); if (me.keoDay === dayKey()) return toast(me, 'Hôm nay đã dùng kế này rồi, làm nữa dễ lộ.');
      if (KEO[t.id]) return toast(me, 'Đã có người khác ra tay rồi.'); if (me.loc !== 'phong') return toast(me, 'Phải ở phòng riêng mới giả bệnh được.');
      if (!useTurn(1, 50)) return; me.keoDay = dayKey();
      KEO[t.id] = { by: me.id, at: now(), timer: setTimeout(() => resolveKeo(t.id, Math.random() < .4), 25e3) };
      const sk = sockOf(t.id); if (sk) sk.emit('keoHT', { from: 'Một cung nữ', until: now() + 20e3 });
      toast(me, `Đã sai cung nữ chạy sang báo bổn cung đau bụng dữ dội… chờ xem Hoàng thượng có đến không.`, 'good');
    } else if (a === 'giuchan') {
      if (!KEO[me.id]) return; resolveKeo(me.id, (+d.q || 0) >= .5); return;
    } else if (a === 'lanh') {
      if (!me.lanh) return;
      if (me.lanhToday) return toast(me, 'Hôm nay đã làm xong việc ở lãnh cung.');
      if ((me.lanh.hp ?? 70) < 10) return toast(me, 'Kiệt sức rồi, không nhấc nổi chổi. Ăn bát cơm nguội hôm nay hoặc chờ tỷ muội gửi đồ vào.', 'bad');
      if ((+d.q || 0) < .4) return toast(me, 'Làm chưa đạt, lão ma ma bắt làm lại.', 'bad');
      me.lanhToday = true; me.lanh.tasks++; me.lanh.hp = Math.max(0, (me.lanh.hp ?? 70) - 10);
      // phế phi cùng cảnh: có người khác cùng ở lãnh cung thì làm chung, mỗi người thêm tiến độ (mỗi ngày 1 lần)
      const mates = Object.values(DB.players).filter(q => q.id !== me.id && q.lanh && online.has(q.id) && q.loc === 'lanhcung');
      if (mates.length && me.lanh.chungDay !== dayKey()) { me.lanh.chungDay = dayKey(); me.lanh.tasks++; cnt(me, 'dongcam');
        for (const q of mates) if (q.lanh.chungGot !== dayKey()) { q.lanh.chungGot = dayKey(); q.lanh.tasks++; cnt(q, 'dongcam'); toast(q, `🤝 ${me.name} làm việc chung với bổn cung: tiến độ phục vị +1 (${q.lanh.tasks}/3).`, 'good'); if (q.lanh.tasks >= 3) phucVi(q, 2, 'nhờ đồng cam cộng khổ'); else push(q); }
        io.to('lanhcung').emit('chat', { id: null, name: '🤝', text: `${me.name} cùng ${mates.map(q => q.name).join(', ')} đồng cam cộng khổ, làm việc chung ở lãnh cung.` }); }
      toast(me, `${pick(['Chép xong một quyển kinh', 'Quét sạch sân lãnh cung', 'Vá xong áo cho các phế phi'])}. Tiến độ phục vị ${me.lanh.tasks}/3.`, 'good');
      if (me.lanh.tasks >= 3) phucVi(me, 2, 'nhờ thành tâm hối lỗi');
    } else return;
    save(); push(me);
  });
  sock.on('case', d => { if (me) { track(me, 'case:' + String(d?.op || '').slice(0, 8)); caseOp(me, d); } });
  sock.on('refresh', () => { if (me) push(me); });
  sock.on('thQ', () => { if (!me) return; if (me.thQ == null) me.thQ = rnd(TH_Q.length); const Q = TH_Q[me.thQ]; sock.emit('thQ', { q: Q.q, opts: Q.opts.map(o => o.t) }); });
  sock.on('npc', d => {
    if (!me || !d || !NPCS[d.npc]) return; track(me, 'npc:' + String(d.op || '').slice(0, 6)); freshDay(me); const n = d.npc; me.relDay = me.relDay || {};
    if (d.op === 'talk') {
      const k = n + ':talk'; const first = !me.relDay[k]; if (first) { me.relDay[k] = 1; relAdd(me, n, 3); } cnt(me, 'npctalk');
      sock.emit('npcTalk', { npc: n, rel: rel(me, n), line: npcLine(me, n), first });
    } else if (d.op === 'tran' && n === 'mama') {
      if (me.lanh) return; const dn = me.detN?.d === dayKey() ? me.detN.n : 0; if (dn >= C.DET_PER_DAY) return toast(me, `Hôm nay đã tra đủ ${C.DET_PER_DAY} vụ rồi, mai lão nô lại nhờ.`);
      if (Object.values(DB.state.cases).some(c => c.victim === me.id && c.status === 'open')) return toast(me, 'Đang có vụ án chưa xong.');
      me.detN = { d: dayKey(), n: dn + 1 }; me.detDay = dn + 1 >= C.DET_PER_DAY ? dayKey() : null; createCase(me, null, { det: true }); return;
    } else if (d.op === 'mach' && n === 'thaiy') {
      if (me.relDay['thaiy:mach']) return toast(me, 'Hôm nay Thái y đã bắt mạch rồi.'); me.relDay['thaiy:mach'] = 1;
      if (me.thai && !me.thai.known) { save(); return revealThai(me, 'mach'); }
      sock.emit('npcTalk', { npc: n, rel: rel(me, n), line: me.thai?.known ? `Thai khí ${me.thai.care >= 2 ? 'vững vàng' : 'còn yếu'}, nương nương nhớ uống thuốc an thai mỗi ngày.` : pick(['Mạch tượng bình hòa, nương nương khỏe lắm.', 'Nương nương hơi nhiều tâm sự, nên ngủ sớm.', 'Khí huyết dồi dào, chưa thấy hỷ mạch.']) });
    } else if (d.op === 'antai' && n === 'thaiy') {
      if (!me.thai?.known) return; if (me.thai.antai === dayKey()) return toast(me, 'Hôm nay đã uống thuốc an thai rồi.');
      const fee = evOn('dichbenh') ? 0 : 20; if (me.silver < fee) return toast(me, `Cần ${fee} bạc.`, 'bad');
      me.silver -= fee; me.thai.antai = dayKey(); me.thai.care = (me.thai.care || 0) + 1; relAdd(me, 'thaiy', 2);
      sock.emit('npcTalk', { npc: n, rel: rel(me, n), line: `Thuốc an thai đã sắc xong. Hôm nay có kẻ giở trò, thần cũng phát hiện sớm hơn (thêm 6 giờ điều tra). Đã uống ${me.thai.care} ngày.` });
    } else if (d.op === 'gift') {
      const k = n + ':gift'; if (me.relDay[k]) return toast(me, 'Hôm nay đã biếu quà rồi.'); if (me.silver < 30) return toast(me, 'Không đủ 30 bạc.', 'bad');
      me.silver -= 30; me.relDay[k] = 1; relAdd(me, n, 10, 'biếu ' + pick(['trà Long Tỉnh', 'một xấp lụa', 'bánh hạnh nhân', 'một hộp yến sào']));
      sock.emit('npcTalk', { npc: n, rel: rel(me, n), line: pick(['Nương nương có lòng quá, lão nô xin nhận.', 'Đa tạ nương nương, ân tình này xin ghi nhớ.', 'Món quà thật hợp ý.']), gift: true });
    }
    save(); push(me);
  });
  sock.on('sis', d => {
    if (!me || !d) return; track(me, 'sis:' + String(d.op || '').slice(0, 8)); freshDay(me); const op = d.op;
    if (op === 'invite') {
      const t = P(d.who); if (!t || t.id === me.id) return;
      if (sisters(me, t)) return toast(me, 'Đã là tỷ muội rồi.');
      if (t.sis) return toast(me, `${t.name} đã kết nghĩa với nhóm khác.`, 'bad');
      const g = grp(me); if (g && g.members.length >= GROUP_MAX) return toast(me, `Nhóm tỷ muội tối đa ${GROUP_MAX} người.`, 'bad');
      const sk = sockOf(t.id);
      if (!sk) { const gname = g ? g.name : String(d.name || '').trim().slice(0, 20) || 'Kim Lan'; addMail(t, { kind: 'moi', from: me.id, fromName: title(me), text: `Muội muốn cùng tỷ kết nghĩa tỷ muội "${gname}". Tỷ đồng ý thì bấm Nhận lời.`, group: gname }); sendPush(t, 'Lời mời kết nghĩa', `${me.name} muốn kết nghĩa tỷ muội với bổn cung.`, 'moi'); return toast(me, `${t.name} đang offline, đã gửi lời mời qua thư.`, 'good'); }
      INVITES[t.id] = { from: me.id, name: g ? g.name : String(d.name || '').trim().slice(0, 20) || 'Kim Lan', at: now() };
      sk.emit('sisInvite', { from: me.id, fromName: title(me), name: INVITES[t.id].name, members: g ? g.members.map(id => P(id)?.name).filter(Boolean) : [me.name] });
      toast(me, `Đã gửi lời kết nghĩa tới ${t.name}.`);
    } else if (op === 'accept' || op === 'decline') {
      let inv = INVITES[me.id]; delete INVITES[me.id];
      if (d.mail) { const m = (me.mail || []).find(x => x.id === d.mail && x.kind === 'moi'); if (m) { inv = { from: m.from, name: m.group }; me.mail = me.mail.filter(x => x !== m); } }
      if (!inv) return; const f = P(inv.from); if (!f) return;
      if (op === 'decline') { toast(f, `${me.name} khéo léo từ chối lời kết nghĩa.`); return; }
      if (me.sis) return toast(me, 'Đã ở nhóm khác.');
      let g = grp(f);
      if (!g) { DB.state.groups = DB.state.groups || {}; const id = 'g' + now().toString(36); g = DB.state.groups[id] = { id, name: inv.name, members: [f.id], fund: 0, goal: 300, created: now() }; f.sis = id; }
      if (g.members.length >= GROUP_MAX) return toast(me, 'Nhóm đã đủ người.', 'bad');
      g.members.push(me.id); me.sis = g.id; cnt(me, 'sis'); if (f.cnt?.sis == null) cnt(f, 'sis');
      news(`🌸 ${g.members.map(id => P(id)?.name).join(', ')} thắp hương kết nghĩa tỷ muội: "${g.name}".`);
      pushGroup(g); save();
    } else if (op === 'leave') {
      const g = grp(me); if (!g) return; g.members = g.members.filter(x => x !== me.id); me.sis = null;
      news(`✂️ ${me.name} cắt áo đoạn nghĩa, rời nhóm tỷ muội "${g.name}".`);
      if (g.members.length < 2) { for (const id of g.members) { const q = P(id); if (q) { q.sis = null; push(q); } } delete DB.state.groups[g.id]; } else pushGroup(g);
      push(me); save();
    } else if (op === 'donate') {
      const g = grp(me); if (!g) return; const amt = Math.max(10, Math.min(500, Math.floor(+d.amount || 0)));
      if (me.silver < amt) return toast(me, 'Không đủ bạc.', 'bad'); me.silver -= amt; g.fund += amt;
      if (g.fund >= g.goal) {
        g.fund -= g.goal; g.goal = Math.min(1000, g.goal + 100);
        for (const id of g.members) { const q = P(id); if (q) { q.haiLong = Math.min(100, q.haiLong + 10); addPts(q, 30); relAdd(q, 'thaihau', 8, 'cùng tỷ muội may áo dâng ai gia'); toast(q, '🧵 Áo gấm tỷ muội may xong, dâng Thái hậu: hài lòng +10, công trạng +30.', 'good'); } }
        news(`🧵 Tỷ muội "${g.name}" góp lụa may áo gấm dâng Thái hậu. Thái hậu khen ngợi cả nhóm.`, 'an');
      } else toast(me, `Đã góp ${amt} bạc. Quỹ may áo: ${g.fund}/${g.goal}.`, 'good');
      pushGroup(g); save();
    } else if (op === 'cautinh') {
      const t = P(d.who); if (!t || !sisters(me, t)) return;
      if (me.cauTinhDay === dayKey()) return toast(me, 'Hôm nay đã cầu tình rồi.');
      if (me.loc !== 'tuninh') return toast(me, 'Phải đến Từ Ninh cung cầu tình với Thái hậu.');
      if (me.turns < 1 || me.silver < 50) return toast(me, 'Cần 1 lượt và 50 bạc.', 'bad');
      if (t.lanh) { me.turns--; me.silver -= 50; me.cauTinhDay = dayKey(); t.lanh.tasks++; news(`${me.name} quỳ ở Từ Ninh cung cầu tình cho tỷ muội ${t.name}.`);
        notify(t, '🙏 Tỷ muội cầu tình', `${me.name} quỳ ở Từ Ninh cung cầu tình cho bổn cung.`); toast(t, `Tỷ muội ${me.name} đã cầu tình cho bổn cung. Tiến độ phục vị ${t.lanh.tasks}/3.`, 'good'); if (t.lanh.tasks >= 3) phucVi(t, 2, 'nhờ tỷ muội cầu tình'); }
      else if ((t.camTucUntil || 0) > now()) { me.turns--; me.silver -= 50; me.cauTinhDay = dayKey(); t.camTucUntil -= 8 * 3600e3; toast(t, `Tỷ muội ${me.name} cầu tình, Thái hậu giảm 8 giờ cấm túc.`, 'good'); }
      else return toast(me, 'Tỷ muội không bị phạt, không cần cầu tình.');
      push(t); pushGroup(grp(me)); save();
    }
  });
  sock.on('big', d => {
    if (!me || !d) return; freshDay(me); const B = DB.state.bigCase; if (!B || B.done) return toast(me, 'Hiện không có đại án.');
    if (now() > B.end) return toast(me, 'Đã hết hạn tra đại án, chờ phán quyết.');
    track(me, 'big:' + String(d.op || '').slice(0, 6));
    if (d.op === 'inv') {
      const L = me.loc; if (!['hoavien', 'tuninh', 'duongtam'].includes(L)) return toast(me, 'Tra đại án ở Ngự hoa viên, Từ Ninh cung hoặc Dưỡng Tâm điện.');
      if (me.lanh) return; const iv = B.inv[me.id] = B.inv[me.id]?.d === dayKey() ? B.inv[me.id] : { d: dayKey(), locs: [] };
      if (iv.locs.length >= 2) return toast(me, 'Hôm nay đã tra đủ 2 lần, mai quay lại. Trong lúc chờ, hỏi manh mối của người khác.');
      if (iv.locs.includes(L)) return toast(me, 'Hôm nay đã tra ở đây rồi, thử nơi khác.');
      if (me.turns < 1) return toast(me, 'Hết lượt.', 'bad'); me.turns--; iv.locs.push(L);
      const c = bigClue(me, L); addPts(me, 5);
      sock.emit('bigClue', c); toast(me, '🔎 Có manh mối mới về đại án. Chỉ bổn cung biết, muốn thì công bố cho cả cung.', 'good');
    } else if (d.op === 'share') {
      const c = (B.clues[me.id] || []).find(x => x.id === d.cid); if (!c) return; if (B.board.some(b => b.cid === c.id)) return;
      B.board.push({ cid: c.id, by: me.name, kind: c.kind, k: c.k, v: c.v, s: c.s, text: c.text, t: now() }); addPts(me, 3);
      news(`📢 ${me.name} công bố manh mối đại án: ${c.text}`, 'an');
    } else if (d.op === 'vote') {
      if (!B.sus.some(x => x.id === d.s)) return; const changed = B.votes[me.id]; B.votes[me.id] = d.s;
      toast(me, `${changed ? 'Đã đổi phiếu' : 'Đã bỏ phiếu'} buộc tội ${B.sus.find(x => x.id === d.s).name}. Phiếu đổi được tới khi hết hạn.`, 'good');
    }
    save(); if (d.op === 'inv') push(me); else for (const id of online.keys()) { const q = P(id); if (q) push(q); }
  });
  sock.on('fest', d => {
    if (!me || !d) return; freshDay(me); const F = DB.state.fest; if (!F || F.done || now() > F.end) return toast(me, 'Hiện không có đại lễ.');
    if (me.lanh) return toast(me, 'Ở lãnh cung không góp được.'); track(me, 'fest:' + String(d.op || '').slice(0, 6));
    const dd = me.festDay = me.festDay?.d === dayKey() ? me.festDay : { d: dayKey() };
    if (d.op === 'silver') {
      const a = Math.max(10, Math.min(300, Math.floor((+d.amount || 0) / 10) * 10)); if ((dd.silver || 0) + a > 300) return toast(me, 'Mỗi ngày góp tối đa 300 bạc.');
      if (me.silver < a) return toast(me, 'Không đủ bạc.', 'bad'); me.silver -= a; dd.silver = (dd.silver || 0) + a; festAdd(me, a / 10, 'góp bạc'); toast(me, `Đã góp ${a} bạc cho đại lễ (+${a / 10} điểm).`, 'good');
    } else if (d.op === 'theu') {
      if (me.loc !== 'phong') return toast(me, 'Về phòng riêng để thêu gấm.'); if (dd.theu) return toast(me, 'Hôm nay đã thêu rồi.'); if (me.turns < 1) return toast(me, 'Hết lượt.', 'bad');
      me.turns--; dd.theu = 1; const q = Math.max(0, Math.min(1, +d.q || 0)), n = Math.round(10 + 20 * q); festAdd(me, n, 'thêu gấm'); addPts(me, 5); toast(me, `Thêu xong một bức gấm${q > .8 ? ' tuyệt đẹp' : ''} (+${n} điểm đại lễ).`, 'good');
    } else if (d.op === 'kinh') {
      if (me.loc !== 'tuninh') return toast(me, 'Đến Từ Ninh cung để chép kinh.'); if (dd.kinh) return toast(me, 'Hôm nay đã chép kinh rồi.'); if (me.turns < 1) return toast(me, 'Hết lượt.', 'bad');
      me.turns--; dd.kinh = 1; festAdd(me, 15, 'chép kinh'); addPts(me, 5); relAdd(me, 'thaihau', 2); toast(me, 'Chép xong một quyển kinh cầu phúc (+15 điểm đại lễ).', 'good');
    }
    save(); push(me);
  });
  sock.on('react', d => {
    if (!me || !d || me.loc !== 'yentiec') return; const f = DB.state.feast; if (!f || f.done) return;
    const r = ['khen', 'hoa', 'che', 'quay'].includes(d.r) ? d.r : null; if (!r) return;
    const key = String(d.to || '').slice(0, 30) + ':' + String(d.k || '').slice(0, 20); f.reacted = f.reacted || {}; if (f.reacted[me.id + '|' + key]) return; f.reacted[me.id + '|' + key] = 1;
    track(me, 'react:' + r); io.to('yentiec').emit('react', { id: me.id, r });
    const t = P(d.to), e = t && f.entries[t.id];
    if (t && e && t.id !== me.id) { e.bonus = Math.max(-15, Math.min(15, (e.bonus || 0) + (r === 'khen' || r === 'hoa' ? 3 : -2)));
      toast(t, { khen: `👏 ${me.name} vỗ tay khen tiết mục của bổn cung!`, hoa: `🌸 ${me.name} tung hoa khen bổn cung!`, che: `😒 ${me.name} chề môi chê tiết mục…`, quay: `🙄 ${me.name} quay mặt đi, không thèm xem…` }[r], r === 'khen' || r === 'hoa' ? 'good' : 'bad'); }
    if (r === 'khen' || r === 'hoa') addPts(me, 1);
  });
  sock.on('nam', d => {
    if (!me) return; const on = !!d?.on;
    if (on) { if (me.loc !== 'phong' || me.visit) return; freeSeat(me); me.lying = true; me.anim = 'lie:b0'; }
    else { me.lying = false; me.anim = 'dung_cho'; }
    if (d?.sick !== undefined) {
      if (d.sick && on) { if (me.selfSickDay === dayKey()) return toast(me, 'Hôm nay đã cáo bệnh một lần rồi.'); me.selfSickDay = dayKey(); me.sick = true; me.sickUntil = now() + 2 * 3600e3; news(`🤒 ${me.name} cáo bệnh, đóng cửa cung nghỉ ngơi.`); toast(me, 'Đã cáo bệnh: 2 giờ tới không ai ra tay được, nhưng Hoàng thượng cũng không lật thẻ bổn cung. Đứng dậy là khỏi bệnh.', 'good'); }
      if (!on && me.sick && me.sickUntil) { me.sick = false; me.sickUntil = 0; news(`${me.name} đã khỏe lại.`); }
    }
    rTo(me, sock).emit('pmove', { id: me.id, x: me.x, z: me.z, ry: me.ry, anim: me.anim }); push(me); save();
  });
  sock.on('tra', d => {
    if (!me || !d) return;
    if (d.op === 'invite') {
      if (me.loc !== 'phong' || me.visit) return toast(me, 'Về cung riêng mới mời khách được.');
      const t = P(d.who); if (!t || t.id === me.id) return; const sk = sockOf(t.id);
      if (!sk) { addMail(t, { kind: 'thu', from: me.id, fromName: title(me), text: 'Mời tỷ muội ghé cung bổn cung thưởng trà. Lúc nào rảnh cứ sang nhé!' }); return toast(me, `${t.name} đang offline, đã gửi thư mời.`, 'good'); }
      if (t.lanh) return toast(me, 'Người này đang ở lãnh cung.'); if ((t.camTucUntil || 0) > now()) return toast(me, 'Người này đang bị cấm túc.');
      sk.emit('traInvite', { host: me.id, name: title(me) }); toast(me, `Đã sai cung nữ sang mời ${t.name} qua thưởng trà.`, 'good');
    } else if (d.op === 'accept') {
      const h = P(d.host); if (!h || !online.has(h.id) || h.loc !== 'phong' || h.visit) return toast(me, 'Chủ nhân đã rời cung.');
      if (me.lanh || (me.camTucUntil || 0) > now()) return;
      if (me.outfit === 'aongu') me.outfit = C.RANKS[me.rank].outfit; me.lying = false;
      me.visit = h.id; enter(me, 'phong', sock); push(me);
      io.to(roomOf(me)).emit('chat', { id: null, name: '🍵 ' + h.name + ' cung', text: `${me.name} sang chơi, mời ngồi thưởng trà.` });
    } else if (d.op === 'serve') {
      if (me.loc !== 'phong' || me.visit) return toast(me, 'Chỉ chủ nhân mới pha trà.');
      const guests = [...online.keys()].map(P).filter(q => q && q.id !== me.id && q.loc === 'phong' && q.visit === me.id);
      if (!guests.length) return toast(me, 'Chưa có khách. Mời bạn bè sang từ Danh sách hậu cung.');
      me.traDay = me.traDay?.d === dayKey() ? me.traDay : { d: dayKey(), g: [] }; let n = 0;
      for (const g of guests) { if (me.traDay.g.includes(g.id)) continue; me.traDay.g.push(g.id); n++; addPts(g, 5); g.sung += 2; addPts(me, 5); cnt(me, 'tra'); cnt(g, 'tra'); me.rel = me.rel || {}; me.rel[g.id] = (me.rel[g.id] || 0) + 2; push(g); }
      const tea = pick(['Long Tỉnh Tây Hồ', 'Bích La Xuân', 'Thiết Quan Âm', 'trà hoa nhài', 'Phổ Nhĩ lâu năm', 'trà sen Tây Hồ']);
      io.to(roomOf(me)).emit('chat', { id: null, name: '🍵 Thưởng trà', text: `${me.name} tự tay pha ấm ${tea} mời ${guests.map(g => g.name).join(', ')}.${n ? ' Mọi người được +5 công trạng.' : ''}` });
      io.to(roomOf(me)).emit('traCheers', { ids: [me.id, ...guests.map(g => g.id)] });
      if (!n) toast(me, 'Hôm nay đã mời những vị khách này rồi, trà vẫn thơm nhưng không có thưởng thêm.');
    }
    save(); push(me);
  });
  sock.on('co', async d => {
    if (!me || !d) return; const G = await GO;
    if (d.op === 'invite') {
      const t = P(d.who); const sk = t && sockOf(t.id); if (!sk || t.id === me.id || roomOf(t) !== roomOf(me)) return toast(me, 'Người này không ở trong phòng.');
      sk.emit('coInvite', { from: me.id, name: me.name, k: d.k }); toast(me, `Đã mời ${t.name} đánh một ván cờ vây.`, 'good');
    } else if (d.op === 'accept') {
      const h = P(d.from); if (!h || !online.has(h.id) || roomOf(h) !== roomOf(me)) return toast(me, 'Người mời đã rời phòng.');
      const id = 'co' + now().toString(36); const black = Math.random() < .5 ? h : me, white = black === h ? me : h;
      GAMES[id] = { id, black: black.id, white: white.id, room: roomOf(me), k: d.k, g: G.newGame(), t: now() };
      io.to(roomOf(me)).emit('coStart', { id, black: { id: black.id, name: black.name }, white: { id: white.id, name: white.name }, k: d.k });
      io.to(roomOf(me)).emit('chat', { id: null, name: '⚫⚪ Cờ vây', text: `${black.name} (đen) và ${white.name} (trắng) bày bàn cờ vây.` });
    } else if (d.op === 'move') {
      const X = GAMES[d.id]; if (!X || X.g.over) return; const col = X.black === me.id ? 1 : X.white === me.id ? 2 : 0; if (!col || X.g.turn !== col) return;
      if (d.resign) { X.g.over = true; X.resign = col; } else if (G.play(X.g, +d.i, col) === null) return;
      io.to(X.room).emit('coMove', { id: X.id, i: d.resign ? null : +d.i, col, resign: !!d.resign });
      if (X.g.over) coEnd(X, G);
    } else if (d.op === 'ai') { // ván với cung nữ: thưởng nhỏ, 3 ván/ngày
      me.coDay = me.coDay?.d === dayKey() ? me.coDay : { d: dayKey(), n: 0 }; if (me.coDay.n >= 3) return; me.coDay.n++;
      addPts(me, d.win ? 6 : 2); cnt(me, 'co'); if (d.win) cnt(me, 'coWin'); toast(me, d.win ? 'Thắng cung nữ một ván cờ vây: +6 công trạng.' : 'Thua cung nữ một ván, +2 công trạng vì đã luyện cờ.', d.win ? 'good' : 'info'); push(me); save();
    }
  });
  sock.on('fei', d => {
    if (!me || !d) return; const n = NPCF().find(x => x.id === d.id); if (!n) return; const T = FEI_TALK[n.tinh] || FEI_TALK.hien; const rl = feiRel(me, n.id);
    me.feiDay = me.feiDay?.d === dayKey() ? me.feiDay : { d: dayKey(), t: {} }; const done = me.feiDay.t[n.id];
    if (d.op === 'talk') {
      let line = rl <= -40 ? pick([`Còn dám vác mặt tới đây? Bổn cung chưa quên chuyện ngươi làm đâu.`, `Hừ, cứ chờ đấy.`]) : rl >= 40 ? pick([`Muội muội đến rồi! Ngồi đây với tỷ.`, `Có ngươi bổn cung mới thấy vui.`]) : pick(T.lines);
      let tip = null; if (rl >= 30 && !done) { const h = ht(); tip = pick([`Nói nhỏ cho muội: hôm nay Hoàng thượng thèm ${C.HT.canh[h.canh]}.`, `Hoàng thượng hôm nay thích người mặc áo ${C.HT.mau[h.mau]}.`]); }
      sock.emit('feiTalk', { id: n.id, name: n.name, line, tip, khich: T.khich, rel: rl, done: !!done, opts: done ? [] : T.khich ? [['nhin', '🙏 Nhịn cho qua'], ['dap', '🗡 Đáp trả sắc sảo'], ['qua', '🎁 Biếu quà làm lành (30 bạc)']] : [['than', '😊 Đáp lễ thân thiện'], ['lanh', '😐 Lạnh nhạt'], ['qua', '🎁 Tặng quà (30 bạc)']] });
    } else if (d.op === 'ans') {
      if (done) return; const a = d.a; let msg = '';
      if (a === 'qua') { if (me.silver < 30) return toast(me, 'Không đủ bạc.', 'bad'); me.silver -= 30; feiAdd(me, n.id, 15); msg = `${n.name} nhận quà, sắc mặt dịu hẳn.`; }
      else if (a === 'nhin') { feiAdd(me, n.id, 3); me.haiLong = Math.min(100, me.haiLong + 2); msg = 'Thái hậu nghe chuyện, khen bổn cung biết nhẫn nhịn (+2 hài lòng).'; }
      else if (a === 'dap') { if (Math.random() < .5 + (me.stats?.duc || 0) / 200) { me.sung += 3; addPts(me, 3); feiAdd(me, n.id, -10); msg = `Một câu đáp trả khiến ${n.name} cứng họng. Cung nhân xì xào khen bổn cung (+3 sủng ái).`; news(`${me.name} đối đáp sắc sảo, khiến ${n.name} cứng họng.`); } else { feiAdd(me, n.id, -15); me.haiLong = Math.max(0, me.haiLong - 2); msg = `${n.name} cười khẩy, bổn cung bị chê là thiếu lễ độ (-2 hài lòng). Nàng ta có vẻ để bụng.`; if (feiRel(me, n.id) <= -50 && !n.grudge?.[me.id]) { n.grudge = n.grudge || {}; n.grudge[me.id] = now() + 864e5 * (1 + Math.random()); } } }
      else if (a === 'than') { feiAdd(me, n.id, 8); addPts(me, 2); msg = `${n.name} vui vẻ trò chuyện một lúc.`; }
      else if (a === 'lanh') { feiAdd(me, n.id, -5); msg = `${n.name} hơi ngượng, lui đi.`; }
      else return;
      me.feiDay.t[n.id] = 1; toast(me, msg, 'info'); save(); push(me);
    }
  });
  sock.on('tt', d => {
    if (!me || !d || me.lanh) return; const act = ['tat', 'da', 'day', 'quy', 'xinloi'].includes(d.act) ? d.act : null; if (!act) return;
    const to = String(d.to || ''); let n = null, t = null;
    if (to.startsWith('f:')) { n = feiPresent(me.loc).find(x => x.id === to.slice(2)); if (!n) return toast(me, 'Người này không có ở đây.'); }
    else if (to.startsWith('p:')) { t = P(to.slice(2)); if (!t || t.id === me.id || !online.has(t.id) || roomOf(t) !== roomOf(me)) return toast(me, 'Người này không ở gần.'); }
    else return;
    const tname = n ? n.name : t.name, violent = ['tat', 'da', 'day'].includes(act);
    me.ttDay = me.ttDay?.d === dayKey() ? me.ttDay : { d: dayKey(), v: 0, k: {} };
    if (violent && me.ttDay.v >= 8) return toast(me, 'Hôm nay đã gây sự 8 lần rồi, làm nữa Thái hậu trị tội đấy.');
    if (now() - (me.ttLast || 0) < 4000) return; me.ttLast = now();
    let back = false;
    const VERB = { tat: 'tát', da: 'đá', day: 'đẩy ngã', quy: 'quỳ lạy', xinloi: 'xin lỗi' };
    if (violent) {
      me.ttDay.v++; track(me, 'tt:' + act);
      const pub = me.loc === 'tuninh' || me.loc === 'yentiec';
      if (n) { feiAdd(me, n.id, act === 'tat' ? -15 : act === 'da' ? -20 : -25); if (!n.grudge?.[me.id] && feiRel(me, n.id) <= -40) { n.grudge = n.grudge || {}; n.grudge[me.id] = now() + (1 + Math.random() * 2) * 864e5; } back = act === 'tat' && ['kieu', 'danh'].includes(n.tinh) && Math.random() < .4; }
      else { const higher = t.rank > me.rank || isHH(t); if (higher) { me.sung = Math.max(0, me.sung - 5); toast(me, `Dám ra tay với người cấp cao hơn: phạm thượng, sủng ái -5.`, 'bad'); } toast(t, `😤 ${me.name} ${VERB[act]} bổn cung!`, 'bad'); notify(t, '😤 Bị ' + VERB[act], `${me.name} ${VERB[act]} bổn cung.`); }
      if (pub) { me.haiLong = Math.max(0, me.haiLong - 5); toast(me, `Làm loạn ở ${me.loc === 'tuninh' ? 'Từ Ninh cung trước mặt Thái hậu' : 'yến tiệc'}: Thái hậu hài lòng -5.`, 'bad'); }
      news(`${act === 'tat' ? '✋' : act === 'da' ? '🦶' : '💥'} ${me.name} ${VERB[act]} ${tname} ${me.loc === 'hoavien' ? 'giữa Ngự hoa viên' : me.loc === 'tuninh' ? 'ngay tại Từ Ninh cung' : me.loc === 'yentiec' ? 'giữa yến tiệc' : ''}!${back ? ` ${tname} tát trả lại ngay tức khắc!` : ''}`, 'phat');
    } else {
      const k = act + to; const first = !me.ttDay.k[k]; me.ttDay.k[k] = 1;
      if (n && first) { feiAdd(me, n.id, act === 'quy' ? 10 : 6); if (n.grudge?.[me.id] && feiRel(me, n.id) > (act === 'quy' ? -40 : -20)) { delete n.grudge[me.id]; toast(me, `${n.name} nguôi giận, bỏ qua chuyện cũ.`, 'good'); } else toast(me, `${n.name} ${act === 'quy' ? 'hả dạ' : 'gật đầu'}. Quan hệ tốt hơn.`, 'good'); }
      if (t) { toast(t, act === 'quy' ? `🙇 ${me.name} quỳ lạy bổn cung.` : `🙏 ${me.name} xin lỗi bổn cung.`, 'good'); }
      if (act === 'quy') news(`🙇 ${me.name} quỳ lạy ${tname}.`);
    }
    rTo(me, null, true).emit('tt', { from: 'p:' + me.id, to, act, back, fname: me.name, tname });
    save(); push(me); if (t) push(t);
  });
  vuaSock(sock, () => me); kidSock(sock, () => me); sinhSock(sock, () => me); leSock(sock, () => me); hhcSock(sock, () => me); lanhSock(sock, () => me);
  sock.on('caocap', d => {
    if (!me || !d || me.lanh || me.rank < 6) return toast(me, 'Từ Phi trở lên mới được giao việc này.');
    me.ccDay = me.ccDay?.d === dayKey() ? me.ccDay : { d: dayKey() }; const C2 = me.ccDay;
    if (d.op === 'so') { // hiệp lý lục cung: duyệt sổ chi tiêu
      if ((C2.so || 0) >= C.CC_PER_DAY) return toast(me, `Hôm nay đã duyệt sổ đủ ${C.CC_PER_DAY} lần rồi.`);
      if (d.ok === undefined) { const items = [['Than sưởi cung Tây', 120], ['Gấm vóc cho tú nữ', 300], ['Dầu đèn Ngự hoa viên', 60], ['Lương thực Ngự thiện phòng', 500], ['Thuốc men Thái y viện', 180], ['Hương liệu Từ Ninh cung', 90]].sort(() => Math.random() - .5).slice(0, 4).map(([t, v]) => ({ t, v })); const bad = rnd(4); items[bad].v *= 3; items[bad].bad = 1; me.ccSo = items; return sock.emit('ccSo', items.map(x => ({ t: x.t, v: x.v }))); }
      if (!me.ccSo) return; C2.so = (C2.so || 0) + 1; const ok = me.ccSo[+d.ok]?.bad; me.ccSo = null;
      if (ok) { addPts(me, 12); me.silver += 40; relAdd(me, 'tonggiam', 4, 'phát hiện sổ sách gian lận'); toast(me, 'Phát hiện khoản chi bị khai khống! Tổng quản kính phục: +12 công trạng, +40 bạc.', 'good'); news(`📒 ${me.name} hiệp lý lục cung, bắt được một khoản chi gian lận.`); }
      else toast(me, 'Duyệt sai, khoản gian lận lọt mất. Hôm nay không có thưởng.', 'bad');
    } else if (d.op === 'day') { // dạy dỗ người mới
      if ((C2.day || 0) >= C.CC_PER_DAY) return toast(me, `Hôm nay đã dạy dỗ đủ ${C.CC_PER_DAY} lần rồi.`);
      const t = d.who && P(d.who); C2.dw = C2.dw || []; if (t && C2.dw.includes(t.id)) return toast(me, `Hôm nay đã dạy ${t.name} rồi, để người khác hoặc dạy tú nữ mới.`); C2.day = (C2.day || 0) + 1; if (t) C2.dw.push(t.id);
      if (t && t.id !== me.id && t.rank <= 3 && !t.lanh) { addPts(t, 15); addPts(me, 10); relAdd(me, 'thaihau', 2, 'dạy dỗ người mới'); toast(t, `📚 ${me.name} dạy bổn cung lễ nghi trong cung: +15 công trạng.`, 'good'); notify(t, '📚 Được dạy dỗ', `${me.name} chỉ bảo bổn cung lễ nghi: +15 công trạng.`); news(`📚 ${me.name} dạy dỗ ${t.name} lễ nghi hậu cung.`); push(t); toast(me, `Đã dạy ${t.name}: +10 công trạng.`, 'good'); }
      else { addPts(me, 8); toast(me, 'Dạy dỗ các tú nữ mới tuyển: +8 công trạng.', 'good'); }
    } else if (d.op === 'yentiec') {
      if (now() - (me.ccFeast || 0) < 864e5) return toast(me, 'Mỗi ngày chỉ thiết yến một lần.');
      if (DB.state.feast && !DB.state.feast.done) return toast(me, 'Đang có yến tiệc rồi.'); if (me.silver < 150) return toast(me, 'Cần 150 bạc.', 'bad');
      me.silver -= 150; me.ccFeast = now(); addPts(me, 10); news(`🎎 ${me.name} bỏ bạc thiết yến mời cả hậu cung.`); startFeast(15, 'in'); DB.state.feast.host = me.id;
      for (const q of Object.values(DB.players)) if (q.id !== me.id) notify(q, '🎎 Yến tiệc', `${me.name} thiết yến mời cả hậu cung, 15 phút.`);
    }
    save(); push(me);
  });
  sock.on('pushKey', () => sock.emit('pushKey', vapid()));
  sock.on('pushSub', sub => { if (!me || !sub?.endpoint) return; me.pushSubs = (me.pushSubs || []).filter(x => x.endpoint !== sub.endpoint).concat([{ endpoint: String(sub.endpoint), keys: sub.keys }]).slice(-3); save(); push(me); sendPush(me, 'Đã bật thông báo', 'Khi bổn cung offline mà có chuyện trong cung, thông báo sẽ hiện ở đây.'); });
  sock.on('pushOff', () => { if (!me) return; me.pushSubs = []; save(); push(me); });
  sock.on('mail', d => {
    if (!me || !d) return; freshDay(me); const op = d.op;
    if (op === 'list') { for (const m of me.mail || []) m.read = true; sock.emit('mailList', mailView(me)); push(me); save(); return; }
    if (op === 'del') { me.mail = (me.mail || []).filter(m => m.id !== d.id); sock.emit('mailList', mailView(me)); save(); return; }
    if (op === 'send') {
      const t = P(d.to); if (!t || t.id === me.id) return toast(me, 'Chọn người nhận.', 'bad');
      const text = String(d.text || '').trim().slice(0, 300); if (text.length < 2) return toast(me, 'Thư còn trống.', 'bad');
      if (me.lanh) return toast(me, 'Ở lãnh cung không gửi thư được.', 'bad');
      me.mailDay = me.mailDay?.d === dayKey() ? me.mailDay : { d: dayKey(), n: 0, silver: 0 };
      if (me.mailDay.n >= 10) return toast(me, 'Hôm nay đã gửi 10 lá thư rồi.', 'bad');
      const silver = Math.max(0, Math.min(100, Math.floor(+d.silver || 0))), anon = !!d.anon, fee = anon ? 30 : 0;
      if (silver && me.mailDay.silver + silver > 100) return toast(me, 'Mỗi ngày chỉ gửi kèm tối đa 100 bạc.', 'bad');
      if (me.silver < silver + fee) return toast(me, 'Không đủ bạc.', 'bad');
      me.silver -= silver + fee; me.mailDay.n++; me.mailDay.silver += silver; t.silver += silver; track(me, 'thu');
      addMail(t, { kind: anon ? 'nacdanh' : silver ? 'qua' : 'thu', from: me.id, fromName: title(me), text, silver, anon });
      if (anon) news(`✉️ Có người nhờ thái giám lén đưa một lá thư nặc danh tới cung ${t.name}…`);
      sendPush(t, anon ? 'Thư nặc danh' : `Thư của ${me.name}`, anon ? 'Có người lén đưa thư tới cung bổn cung…' : text.slice(0, 90), 'thu');
      toast(me, `Đã gửi thư cho ${t.name}${silver ? ` kèm ${silver} bạc` : ''}${anon ? ' (nặc danh, tốn 30 bạc)' : ''}.`, 'good'); save(); push(me); return;
    }
  });
  sock.on('title', id => { if (!me) return; if (id && !me.ach?.[id]) return; me.titleSel = id || ''; save(); push(me); rTo(me, null, true).emit('ptitle', { id: me.id, tt: achName(me.titleSel, me) }); });
  sock.on('hh', d => {
    if (!me || !d) return; freshDay(me); const op = d.op; me.hhDay = me.hhDay || {};
    if (op === 'vote') {
      const v = DB.state.hhVote; if (!v) return toast(me, 'Hiện không bầu phượng ấn.');
      if (me.loc !== 'tuninh') return toast(me, 'Đến Từ Ninh cung để tiến cử.');
      if (!v.cands.includes(d.who)) return; if (d.who === me.id) return toast(me, 'Không thể tự tiến cử mình.', 'bad');
      const changed = !!v.votes[me.id]; v.votes[me.id] = d.who;
      toast(me, `${changed ? 'Đã đổi lời tiến cử sang' : 'Đã tiến cử'} ${P(d.who).name}.`, 'good');
      for (const id of online.keys()) { const q = P(id); if (q) push(q); } save(); return;
    }
    if (op === 'sangcung' || op === 'thinhan') { // lục cung tới cung Hoàng hậu thỉnh an buổi sáng
      const h = DB.state.hh && P(DB.state.hh.id), hr = vnNow().getUTCHours(); if (!h || h.id === me.id) return;
      if (hr < C.HH_THINHAN[0] || hr >= C.HH_THINHAN[1]) return toast(me, `Giờ thỉnh an Hoàng hậu là từ ${C.HH_THINHAN[0]}h tới ${C.HH_THINHAN[1]}h sáng.`);
      if (me.lanh || (me.camTucUntil || 0) > now()) return;
      if (op === 'sangcung') { if (me.outfit === 'aongu') me.outfit = C.RANKS[me.rank].outfit; me.lying = false; me.visit = h.id; enter(me, 'phong', sock); push(me); return; }
      if (me.visit !== h.id) return toast(me, 'Tới cung Hoàng hậu mới thỉnh an được.'); if (me.thinhanHH === dayKey()) return toast(me, 'Hôm nay đã thỉnh an Hoàng hậu rồi.');
      me.thinhanHH = dayKey(); addPts(me, 8); relAdd(me, 'thaihau', 1, 'giữ lễ với Hoàng hậu');
      h.thinhanN = h.thinhanD === dayKey() ? (h.thinhanN || 0) + 1 : 1; h.thinhanD = dayKey(); if (h.thinhanN <= 10) { addPts(h, 3); h.silver += 10; push(h); }
      io.to(roomOf(me)).emit('chat', { id: null, name: '🙇', text: `${title(me)} thỉnh an: Hoàng hậu nương nương vạn phúc kim an.` }); toast(me, 'Đã thỉnh an Hoàng hậu: công trạng +8.', 'good');
      const hs = sockOf(h.id); if (hs) toast(h, `${me.name} tới thỉnh an Hoàng hậu.`, 'good'); push(me); save(); return;
    }
    if (op === 'kieuoan') { // người bị Hoàng hậu phạt dâng biểu kêu oan lên Thái hậu (mỗi lần bị phạt được 1 lần)
      const k = me.hhPhat; if (!k || k.used) return toast(me, 'Không có gì để kêu oan.');
      const still = k.kind === 'lanh' ? !!me.lanh : (me.camTucUntil || 0) > now(); if (!still) { me.hhPhat = null; push(me); return toast(me, 'Hình phạt đã hết rồi.'); }
      if (me.turns < 1 || me.silver < 50) return toast(me, 'Dâng biểu kêu oan cần 1 lượt và 50 bạc lo lót.', 'bad'); me.turns--; me.silver -= 50; k.used = true;
      const h = P(k.by), ch = Math.max(.15, Math.min(.75, .35 + (rel(me, 'thaihau') - (h ? rel(h, 'thaihau') : 0)) / 200 + (me.haiLong - (h?.haiLong || 50)) / 300));
      if (Math.random() < ch) { if (k.kind === 'lanh') phucVi(me, me.lanh.from, 'nhờ Thái hậu minh xét, gỡ oan cho'); else { me.camTucUntil = 0; toast(me, 'Thái hậu minh xét, cho bổn cung ra khỏi cấm túc.', 'good'); }
        if (h) { h.hhStrike = (h.hhStrike || 0) + 1; relAdd(h, 'thaihau', -5, 'xử oan ' + me.name); toast(h, `Thái hậu gỡ tội cho ${me.name}, trách Hoàng hậu xử oan. Uy tín phượng ấn giảm.`, 'bad'); push(h); }
        news(`📜 ${me.name} dâng biểu kêu oan, Thái hậu minh xét gỡ tội. Hoàng hậu ${h?.name || ''} bị trách xử oan.`, 'an'); }
      else toast(me, 'Thái hậu đọc biểu nhưng cho rằng Hoàng hậu xử đúng. Đành chịu phạt tiếp…', 'bad');
      me.hhPhat = null; push(me); save(); return;
    }
    if (!isHH(me)) return toast(me, 'Chỉ Hoàng hậu mới có quyền này.', 'bad');
    const lim = op === 'daylanh' ? C.HH_LANH_PER_DAY : C.HH_USES;
    if ((me.hhDay[op] || 0) >= lim) return toast(me, `Hôm nay đã dùng quyền này đủ ${lim} lần rồi.`);
    const used = () => { me.hhDay[op] = (me.hhDay[op] || 0) + 1; };
    const t = d.who && P(d.who);
    if (op === 'anxa') {
      if (!t || t.id === me.id) return;
      if (t.lanh) { used(); phucVi(t, 2, 'nhờ Hoàng hậu ân xá'); }
      else if ((t.camTucUntil || 0) > now()) { used(); t.camTucUntil = 0; news(`👑 Hoàng hậu ${me.name} ân xá, cho ${t.name} ra khỏi cấm túc.`); toast(t, 'Hoàng hậu ân xá, bổn cung được ra khỏi phòng.', 'good'); }
      else return toast(me, 'Người này không bị phạt.');
      relAdd(me, 'thaihau', 2, 'khoan dung với hậu cung'); push(t);
    } else if (op === 'phat') {
      if (!t || t.id === me.id || t.lanh) return;
      if (t.thai?.known) return toast(me, 'Không thể phạt người đang mang long thai.', 'bad');
      if ((t.protectUntil || 0) > now() || (t.camTucUntil || 0) > now()) return toast(me, 'Người này đang được bảo hộ hoặc đã bị phạt.', 'bad');
      used(); t.camTucUntil = now() + 6 * 3600e3; t.protectUntil = Math.max(t.protectUntil || 0, t.camTucUntil); hhBrake(me, t, 'camtuc');
      news(`👑 Hoàng hậu ${me.name} phạt ${t.name} cấm túc 6 giờ vì ${String(d.why || 'thất lễ').slice(0, 40)}.`, 'phat');
      const sk = sockOf(t.id); if (sk) { toast(t, `Hoàng hậu phạt bổn cung cấm túc 6 giờ.`, 'bad'); if (t.loc !== 'phong') enter(t, 'phong', sk); }
      push(t);
    } else if (op === 'daylanh') { // đày một phi tần vào lãnh cung
      if (!t || t.id === me.id || t.lanh || t.admin) return;
      if (t.thai?.known) return toast(me, 'Không thể đày người đang mang long thai.', 'bad');
      if ((t.protectUntil || 0) > now()) return toast(me, 'Người này đang được bảo hộ, chưa thể xử.', 'bad');
      used(); const why = String(d.why || 'phạm thượng, bất kính với Hoàng hậu').slice(0, 40);
      sendToLanhCung(t, `bị Hoàng hậu ${me.name} xử tội ${why}`, null); relAdd(me, 'thaihau', -5, 'xử phạt hậu cung quá nặng tay'); hhBrake(me, t, 'lanh');
      toast(me, `Đã đày ${t.name} vào lãnh cung. Thái hậu cho rằng Hoàng hậu quá nặng tay: hài lòng -5.`, 'bad');
    } else if (op === 'thuong') { // ban thưởng 100 bạc từ quỹ cung
      if (!t || t.id === me.id) return; used(); t.silver += 100; addPts(t, 5); relAdd(me, 'thaihau', 1, 'ban ân cho hậu cung');
      news(`👑 Hoàng hậu ${me.name} ban thưởng ${t.name} 100 lượng bạc.`, 'an'); notify(t, '👑 Hoàng hậu ban thưởng', 'Hoàng hậu ban cho bổn cung 100 lượng bạc.', 'an'); toast(t, '👑 Hoàng hậu ban thưởng 100 bạc, công trạng +5.', 'good'); push(t);
    } else if (op === 'trangsuc') { // tự bỏ bạc mua trang sức tặng
      if (!t || t.id === me.id) return; const own = t.jewels || []; const left = Object.entries(C.JEWELS).filter(([k]) => !own.includes(k)).sort((a, b) => a[1].price - b[1].price);
      if (!left.length) return toast(me, `${t.name} đã có đủ trang sức rồi.`); const [k, J] = left[0];
      if (me.silver < J.price) return toast(me, `Cần ${J.price} bạc để mua ${J.name} ban tặng.`, 'bad');
      used(); me.silver -= J.price; t.jewels = [...own, k]; addPts(t, 5);
      news(`👑 Hoàng hậu ${me.name} ban tặng ${t.name} một ${J.name}.`, 'an'); notify(t, '👑 Hoàng hậu ban trang sức', `Hoàng hậu ban cho bổn cung ${J.name}.`, 'an'); toast(t, `👑 Hoàng hậu ban ${J.name}: ${J.desc}.`, 'good'); push(t);
    } else if (op === 'hoso') { // xem hồ sơ các vụ án đang mở, mỗi vụ lộ 1 đặc điểm của kẻ gây án
      const list = Object.values(DB.state.cases).filter(c => c.status === 'open' && !c.det && !c.big && !(c.test)).map(c => { const cu = c.suspects.find(x => x.id === c.culprit); const k = pick(['cung', 'gio', 'dau']);
        return { victim: c.victimName, crime: c.crime, method: c.methodName || '', left: Math.max(0, (c.deadline || 0) - now()), suspects: c.suspects.map(x => x.name), hint: cu ? `Kẻ gây án ${k === 'cung' ? 'ở ' + C.TRAITS.cung[cu.traits.cung] : k === 'gio' ? 'ra tay vào ' + C.TRAITS.gio[cu.traits.gio] : 'có ' + C.TRAITS.dau[cu.traits.dau]}` : '' }; });
      if (!list.length) return toast(me, 'Hiện trong cung không có vụ án nào đang mở.'); used(); sock.emit('hhHoso', list);
    } else if (op === 'yentiec') {
      if (DB.state.feast && !DB.state.feast.done) return toast(me, 'Đang có yến tiệc rồi.');
      used(); news(`👑 Hoàng hậu ${me.name} thiết yến mời cả lục cung.`); startFeast(10, 'in');
    } else return;
    save(); push(me);
  });
  sock.on('htTalkQ', () => { if (!me) return; if (!me.htQs || me.htQsFor !== me.tamCungUntil) { me.htQs = [...HT_TALK.keys()].sort(() => Math.random() - .5).slice(0, 3); me.htQsFor = me.tamCungUntil; } if (me.tsFor !== me.tamCungUntil) { me.ts = rnd(TAMSU.length); me.tsFor = me.tamCungUntil; } const T = TAMSU[me.ts]; sock.emit('htTalkQ', { mood: C.HT.mood[ht().mood], tamsu: { q: T.q, opts: T.opts.map(o => o[0]) }, qs: me.htQs.map(i => HT_TALK[i]).map(q => ({ q: q.q, opts: q.opts.map(o => o.t) })) }); });
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
    me.outfit = o; push(me); rTo(me, sock).emit('poutfit', { id: me.id, outfit: o }); save();
  });
  sock.on('decor', list => {
    if (!me || !Array.isArray(list)) return;
    const ITEMS = ['binhphong', 'banTra', 'ghedon', 'chaucay', 'denlong', 'binhsu', 'giuong', 'tham', 'luhuong', 'lahan'];
    me.decor = list.slice(0, 24).filter(i => ITEMS.includes(i.item) && (!C.DECOR_PRICE[i.item] || (me.decorOwned || []).includes(i.item))).map(i => ({ item: i.item, x: +i.x || 0, z: +i.z || 0, ry: +i.ry || 0 }));
    save(); toast(me, 'Đã lưu cách bài trí.', 'good');
  });
  sock.on('roster', () => {
    if (!me) return;
    const list = Object.values(DB.players).map(p => ({ id: p.id, inTam: !!night(p) && p.loc === 'tamcung' && online.has(p.id), thai: !!p.thai?.known, kids: (p.children || []).length, camTuc: (p.camTucUntil || 0) > now(), lanh: !!p.lanh, name: p.name + (p.sick ? ' (cáo bệnh)' : '') + ((p.camTucUntil || 0) > now() ? ' (cấm túc)' : ''), rank: p.rank, rankName: rankName(p), online: seenOn(p.id), sung: p.sung, canTarget: !p.lanh && !p.admin && p.rank >= C.FIGHT_RANK && !((p.protectUntil || 0) > now()) }));
    list.sort((a, b) => (b.rankName === 'Hoàng hậu') - (a.rankName === 'Hoàng hậu') || b.rank - a.rank || b.sung - a.sung);
    const seats = C.RANKS.map((r, i) => ({ name: r.name, seats: r.seats, used: seatCount(i) }));
    sock.emit('roster', { npcs: NPCF().map(n => ({ id: n.id, name: n.name, short: n.short, rankName: npcRank(n), sung: n.sung, pts: n.pts })).sort((a, b) => b.pts - a.pts), list, seats, methods: C.METHODS, thaiMethods: C.THAI_METHODS, hh: DB.state.hh ? title(P(DB.state.hh.id) || { name: '?', rank: 0 }) : null });
  });
  sock.on('disconnect', () => {
    if (!me) return;
    if (online.get(me.id) === sock) { freeSeat(me); online.delete(me.id); rTo(me, sock).emit('pleave', me.id); }
    me.lastSeen = now(); save();
  });
});

const findP = who => Object.values(DB.players).find(x => x.name.toLowerCase() === who || x.user === who);
const TEST_CMDS = ['/lehau', '/cothai', '/bung', '/chuyenda', '/tua', '/sinh', '/lon', '/khoc', '/xoacon', '/xoathai'];
function admin(p, text) { const cmd0 = text.split(/\s+/)[0]; return quiet(TEST_CMDS.includes(cmd0), () => adminRaw(p, text)); }
function adminRaw(p, text) {
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
  else if (cmd === '/cothai') { const who = [arg, ...rest].filter(Boolean).join(' ').toLowerCase(); const q = who ? findP(who) : p; if (!q) return toast(p, 'Không tìm thấy.', 'bad'); q.thai = { since: now() - 1000, known: false, test: true }; revealThai(q, 'mach'); }
  else if (cmd === '/lon') { const who = [arg, ...rest].filter(Boolean).join(' ').toLowerCase(); const q = who ? findP(who) : p; if (!q?.children?.length) return toast(p, 'Người này chưa có con.', 'bad'); for (const c of kidFix(q)) { c.born -= 3 * 864e5; c.cry = null; c.cryAt = 0; } push(q); kidEmit(q); return toast(p, `Các con của ${q.name} lớn thêm 3 ngày.`, 'good'); }
  else if (cmd === '/khoc') { for (const c of kidFix(p)) c.cryAt = 1; return toast(p, 'Các bé sẽ khóc ngay.', 'good'); }
  else if (cmd === '/lehau') { if (DB.state.hhc) { hhcFinish(true); return toast(p, 'Đã dừng lễ thử.'); } hhcStart(p, [{ q: p, votes: 9 }, ...Object.values(DB.players).filter(x => x.rank >= 5 && x.id !== p.id).slice(0, 2).map(q => ({ q, votes: 3 + rnd(4) }))], true); return toast(p, 'Lễ thử: 20 giây nữa bắt đầu ở Dưỡng Tâm điện (chỉ bà thấy).', 'good'); }
  else if (cmd === '/thudo') {
    if (!arg) return toast(p, 'Gõ /thudo + tên bộ. Các bộ: ' + ALL_OUTFITS.join(', '));
    if (!ALL_OUTFITS.includes(arg)) return toast(p, 'Không có bộ ' + arg + '. Các bộ: ' + ALL_OUTFITS.join(', '), 'bad');
    p.outfit = arg; push(p); const sk = sockOf(p.id); if (sk) rTo(p, sk).emit('poutfit', { id: p.id, outfit: arg }); save(); return toast(p, 'Đang mặc thử: ' + (C.OUTFITS[arg] || arg), 'good');
  }
  else if (cmd === '/hien') { p.stealthOff = true; save(); return toast(p, 'Đã tắt tàng hình: người chơi khác thấy nhân vật của bà (vào lại khu vực để áp dụng).', 'good'); }
  else if (cmd === '/an') { p.stealthOff = false; save(); return toast(p, 'Đã bật tàng hình: người chơi khác không thấy bà (vào lại khu vực để áp dụng).', 'good'); }
  else if (cmd === '/xoacon') { const nm = [arg, ...rest].filter(Boolean).join(' ').toLowerCase(); const before = (p.children || []).length; p.children = (p.children || []).filter(c => nm ? c.name.toLowerCase() !== nm : !c.test); if (DB.state.thaitu?.mother === p.id && !p.children.some(c => c.id === DB.state.thaitu.cid)) DB.state.thaitu = null; p.carry = null; p.follow = null; push(p); kidEmit(p); return toast(p, `Đã xoá ${before - p.children.length} bé${nm ? '' : ' sinh ra từ lệnh thử'}.`, 'good'); }
  else if (cmd === '/xoathai') { p.thai = null; push(p); kidEmit(p); return toast(p, 'Đã xoá long thai thử.', 'good'); }
  else if (cmd === '/xoatin') { const n0 = DB.state.news.length, nm = p.name; DB.state.news = DB.state.news.filter(n => !n.text.includes(nm)); io.emit('newsAll', DB.state.news.slice(0, 30)); save(); return toast(p, `Đã gỡ ${n0 - DB.state.news.length} tin có tên ${nm} khỏi bảng tin.`, 'good'); }
  else if (cmd === '/tua') { if (DB.state.sinh) DB.state.sinh.until = now() + 8000; if (DB.state.le) DB.state.le.end = now() + 6000; return toast(p, 'Tua nhanh sự kiện chuyển dạ.', 'good'); }
  else if (cmd === '/chuyenda') {
    if (!p.thai) return toast(p, 'Chưa có thai. Gõ /cothai trước.', 'bad'); p.thai.known = true; p.thai.due = now() - 1000; p.thai.test = true;
    const S = DB.state.sinh; if (S && (S.id === p.id || now() - S.until > 10 * 60e3 || !P(S.id))) DB.state.sinh = null; // dọn sự kiện cũ bị kẹt
    if (DB.state.sinh) return toast(p, `${DB.state.sinh.name} đang chuyển dạ, đợi xong rồi thử lại.`, 'bad');
    if (p.loc === 'tamcung') return toast(p, 'Đang ở tẩm cung, ra ngoài rồi thử lại.', 'bad');
    if (!sinhStart(p)) return toast(p, 'Chưa bắt đầu được, thử lại sau vài giây.', 'bad');
    return toast(p, 'Bắt đầu chuyển dạ (thử).', 'good'); }
  else if (cmd === '/bung') { if (!p.thai?.known) return toast(p, 'Chưa có thai.', 'bad'); p.thai.due = now() + .15 * C.THAI_DAYS * 864e5; push(p); kidEmit(p); return toast(p, 'Bụng đã lớn.', 'good'); }
  else if (cmd === '/sinh') { const who = [arg, ...rest].filter(Boolean).join(' ').toLowerCase(); const q = who ? findP(who) : p; if (!q?.thai) return toast(p, 'Người này không mang thai.', 'bad'); if (!q.thai.known) revealThai(q); birth(q); }
  else if (cmd === '/baucu') { if (DB.state.hhVote) endHHVote(); else { DB.state.hhNext = 0; if (!hhEligible().length) return toast(p, `Chưa có ai từ ${C.RANKS[C.HH_MIN_RANK].name} trở lên để ứng cử.`, 'bad'); startHHVote(); } }
  else if (cmd === '/bieudien') { const f = DB.state.feast; if (!f || f.done) return toast(p, 'Chưa có yến tiệc.'); startNpcShow(f); }
  else if (cmd === '/tuulenh') { const f = DB.state.feast; if (!f || f.done) return toast(p, 'Chưa có yến tiệc.'); if (f.tl) f.tl.done = true; f.tlNext = 0; feastLive(); }
  else if (cmd === '/daian') { const B = DB.state.bigCase; if (B && !B.done) { B.end = now(); endBigCase(); } else startBigCase(+arg || C.BIG_HOURS); }
  else if (cmd === '/daile') { const F = DB.state.fest; if (F && !F.done) festFinish(F.pts >= F.goal); else startFest(+arg || C.FEST_HOURS); }
  else if (cmd === '/dailediem') { if (!DB.state.fest || DB.state.fest.done) return toast(p, 'Chưa có đại lễ.'); festAdd(p, +arg || 100, 'quản trị'); }
  else if (cmd === '/sukien') { DB.state.evForce = C.EVENTS.some(e => e.id === arg) ? arg : null; for (const id of online.keys()) { const q = P(id); if (q) push(q); } toast(p, 'Sự kiện: ' + curEvent().name + (DB.state.evForce ? ' (ép)' : ' (theo tuần)')); }
  else if (cmd === '/xoaacc') {
    const who = [arg, ...rest].filter(Boolean).join(' ').toLowerCase(); const q = findP(who);
    if (!q) return toast(p, 'Không tìm thấy người tên ' + who, 'bad'); if (q.id === p.id) return toast(p, 'Không tự xóa tài khoản quản trị được.', 'bad');
    const sk = sockOf(q.id); if (sk) { sk.emit('kicked'); sk.disconnect(); online.delete(q.id); }
    const g = grp(q); if (g) { g.members = g.members.filter(x => x !== q.id); if (g.members.length < 2) { for (const id of g.members) { const r = P(id); if (r) r.sis = null; } delete DB.state.groups[g.id]; } }
    for (const c of Object.values(DB.state.cases)) if (c.victim === q.id) delete DB.state.cases[c.id];
    if (DB.state.hh?.id === q.id) DB.state.hh = null; if (DB.state.hhVote) { DB.state.hhVote.cands = DB.state.hhVote.cands.filter(x => x !== q.id); for (const k in DB.state.hhVote.votes) if (k === q.id || DB.state.hhVote.votes[k] === q.id) delete DB.state.hhVote.votes[k]; }
    delete DB.players[q.id]; freeSeatCheck(); io.emit('pleave', q.id); toast(p, `Đã xóa tài khoản ${q.name} (${q.user}).`, 'good');
  }
  else if (cmd === '/saoluu') { backup(true).then(() => listBackups()).then(l => toast(p, 'Đã sao lưu. Các bản: ' + l.join(', '), 'good')); return; }
  else if (cmd === '/khoiphuc') {
    if (!arg) { listBackups().then(l => toast(p, 'Các bản sao lưu: ' + (l.join(', ') || 'chưa có') + '. Gõ /khoiphuc NGÀY xacnhan', 'info')); return; }
    if (rest[0] !== 'xacnhan') return toast(p, `Khôi phục sẽ đưa cả cung về ngày ${arg}, mất mọi thứ sau đó. Gõ: /khoiphuc ${arg} xacnhan`, 'bad');
    restore(arg).then(ok => { if (!ok) toast(p, 'Không có bản sao lưu ngày ' + arg, 'bad'); else console.log('restored', arg); }); return;
  }
  else return toast(p, 'Lệnh: /latthe [trua] /yentiec [phút] /diem N /diemcho N tên /bac N /ngay /vuan /hethan /lanhcung /rakhoi [tên] /cothai /bung /chuyenda /tua /sinh /lon /khoc (thử, không đăng tin) · /xoacon [tên] /xoathai /xoatin · /an /hien (tàng hình) /baucu /sukien [hoadang|disan|phatdan|dichbenh|hoica] /tuulenh /bieudien /daian [giờ] /daile [giờ] /dailediem N /xoaacc tên /saoluu /khoiphuc [ngày xacnhan]');
  toast(p, 'Đã chạy ' + cmd); push(p); save();
}

// ---------- bảng xếp hạng top 5 ----------
function top5() {
  const H = 24 * 3600e3;
  return [...Object.values(DB.players).filter(p => !p.lanh && !p.admin), ...NPCF().map(n => ({ ...n, npc: true }))]
    .sort((a, b) => (!b.npc && isHH(b)) - (!a.npc && isHH(a)) || b.rank - a.rank || b.pts - a.pts || b.sung - a.sung)
    .slice(0, 5)
    .map(p => p.npc ? { id: p.id, name: '🎭 ' + p.name, rankName: npcRank(p), pts: p.pts, online: false, npc: true, trend: p.trend && now() - p.trend.t < H ? p.trend.dir : 0 } : ({ id: p.id, name: p.name + (p.sick ? ' 🤒' : ''), rankName: rankName(p), pts: p.pts, online: seenOn(p.id), trend: p.trend && now() - p.trend.t < H ? p.trend.dir : 0 }));
}
let lastTop = '';
setInterval(() => { const t = JSON.stringify(top5()); if (t !== lastTop) { lastTop = t; io.emit('top5', JSON.parse(t)); } }, 2000);
io.on('connection', s => s.emit('top5', top5()));

const PORT = process.env.PORT || 3000;
loadDB().then(() => {
  applyMocRieng(); for (const p of Object.values(DB.players)) if (p.moc) tryPromote(p);
  // đại án rút còn 3 ngày: vụ đang mở cũng rút theo
  { const B = DB.state.bigCase; if (B && !B.done && B.end - B.start > C.BIG_HOURS * 3600e3) B.end = B.start + C.BIG_HOURS * 3600e3; }
  // người đã nhận 1 vụ tra án hôm nay theo luật cũ: tính là 1/3
  for (const p of Object.values(DB.players)) if (p.detDay === dayKey() && !p.detN) { p.detN = { d: dayKey(), n: 1 }; p.detDay = null; }
  // bộ cam rồng phượng cũ của Hoàng quý phi đã bỏ (trùng áo Hoàng hậu): ai đang mặc thì đổi về áo hợp lệ
  for (const p of Object.values(DB.players)) if (p.outfit === 'hoangquyphi') p.outfit = isHH(p) ? 'hoanghau2' : C.RANKS[p.rank].outfit;
  save();
  vapid(); if (DB.state.updNews !== 'u2026-11-12') { DB.state.updNews = 'u2026-11-12'; news('📜 Thánh chỉ: hậu cung có biến lớn! Thêm 6 phi tần mới tranh ghế, Ngự thiện phòng, cờ vây, thị tẩm mới… Xem chi tiết ở 📖 Hướng dẫn → Có gì mới.', 'phong'); } save();
  setInterval(nightTick, 5e3);
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) setInterval(() => { const h = vnNow().getUTCHours(); if (h >= C.KEEPALIVE_HOURS[0] && h < C.KEEPALIVE_HOURS[1]) fetch(url + '/health').catch(() => {}); }, 10 * 60e3);
  server.listen(PORT, () => console.log('PHƯỢNG KHỞI THÂM CUNG chạy ở cổng ' + PORT));
}).catch(e => { console.error(e); process.exit(1); });
