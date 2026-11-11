// MỘNG PHƯỢNG HOÀNG – cấu hình luật chơi. Chỉnh số ở đây, không cần sửa code.
module.exports = {
  TZ_OFFSET_H: 7,              // giờ Việt Nam
  NIGHT_HOUR: 21,              // (cũ) giờ lật thẻ mỗi tối
  LAT_THE_SLOTS: [[8, 0, 'Sáng nay'], [10, 0, 'Sáng nay'], [12, 0, 'Trưa nay'], [14, 0, 'Chiều nay'], [16, 0, 'Chiều nay'], [18, 0, 'Tối nay'], [20, 0, 'Tối nay'], [22, 0, 'Đêm nay']], // giờ:phút lật thẻ mỗi ngày (giờ VN)
  FEAST_SLOTS: [[9, 30, 'out'], [12, 30, 'out'], [17, 0, 'in'], [20, 0, 'in']], // giờ bắt đầu yến tiệc; out = ngoài trời, in = trong điện
  FEAST_MIN: 20,
  FISH_PAID: 15,                // mỗi ngày bán được 15 con cá lấy bạc
  NOTICE_LEAD_MIN: 15,         // báo trước sự kiện bao nhiêu phút               // yến tiệc kéo dài (phút)
  TURNS_PER_DAY: 5,           // lượt đầu ngày
  TURN_REGEN_MIN: 90,         // cứ 90 phút hồi 1 lượt
  TURN_CAP: 10,               // hồi tối đa tới 10 lượt
  TASK_TURNS: 2,              // làm đủ 3 nhiệm vụ ngày được thêm 2 lượt
  CASE_HOURS: 24,              // thời hạn điều tra trước khi xử án
  PROTECT_HOURS: 24,           // bảo hộ sau khi bị giáng cấp
  ATTACK_PER_DAY: 2,           // số lần được ra tay / ngày
  TARGETED_PER_DAY: 2,         // số lần bị nhắm / ngày
  ABSENT_SICK_DAYS: 3,
  ABSENT_LOSE_DAYS: 7,
  START_SILVER: 300,

  // cấp bậc: tên, điểm công trạng cần, số ghế (0 = không giới hạn), trang phục
  RANKS: [
    { name: 'Tú nữ',          pts: 0,    seats: 0, outfit: 'tunu' },
    { name: 'Quan nữ tử',     pts: 30,   seats: 0, outfit: 'tunu' },
    { name: 'Đáp ứng',        pts: 80,   seats: 0, outfit: 'thuongtai' },
    { name: 'Thường tại',     pts: 150,  seats: 0, outfit: 'thuongtai_hong' },
    { name: 'Quý nhân',       pts: 250,  seats: 6, outfit: 'quynhan', extra: ['quynhan_lam'] },
    { name: 'Tần',            pts: 400,  seats: 4, outfit: 'tan', extra: ['tan_tim'] },
    { name: 'Phi',            pts: 600,  seats: 3, outfit: 'phi' },
    { name: 'Quý phi',        pts: 850,  seats: 2, outfit: 'quyphi', extra: ['quyphi_phuong'] },
    { name: 'Hoàng quý phi',  pts: 1150, seats: 1, outfit: 'hoangquyphi', extra: ['hoangquyphi_kim'] },
  ],
  FIGHT_RANK: 4,               // từ Quý nhân mới được hãm hại / bị hãm hại
  PALACE_RANK: 5,              // từ Tần được ban cung riêng

  OUTFITS: {
    tunu: 'Tú nữ · xanh lá', thuongtai: 'Thường tại · tím mũ hoa', quynhan: 'Quý nhân · xanh dương',
    tan: 'Tần · cam áo khoác', phi: 'Phi · tím chuỗi ngọc', quyphi: 'Quý phi · đỏ vân kiên',
    hoangquyphi: 'Hoàng quý phi · cam rồng phượng', hoanghau: 'Hoàng hậu · vàng mũ phượng', aongu: 'Áo ngủ · trắng',
  },

  // lối sống: lợi thế riêng
  PATHS: {
    tainghe: { name: 'Tài nghệ', desc: 'Luyện tài nghệ được thêm 50% điểm', stats: { tai: 20, duc: 10, giao: 10, muu: 10 } },
    duchanh: { name: 'Đức hạnh', desc: 'Thỉnh an được gấp đôi hài lòng của Thái hậu', stats: { tai: 10, duc: 20, giao: 10, muu: 10 } },
    giaote:  { name: 'Giao tế',  desc: 'Tặng quà được gấp đôi tình cảm, thêm 1 lượt mỗi ngày', stats: { tai: 10, duc: 10, giao: 20, muu: 10 } },
    muuke:   { name: 'Mưu kế',   desc: 'Điều tra được thêm 1 manh mối miễn phí, ra tay rẻ hơn', stats: { tai: 10, duc: 10, giao: 10, muu: 20 } },
  },
  ORIGINS: {
    vanquan: { name: 'Con nhà quan văn', silver: 300, bonus: { duc: 5 } },
    voquan:  { name: 'Con nhà võ tướng', silver: 300, bonus: { muu: 5 } },
    thuongnhan: { name: 'Con nhà thương nhân', silver: 600, bonus: {} },
    hocgia: { name: 'Con nhà học giả', silver: 250, bonus: { tai: 5 } },
  },

  // hành động tốn lượt
  ACTIONS: {
    luyen:   { name: 'Luyện tài nghệ', turn: 1, pts: 8 },
    dangcanh:{ name: 'Dâng canh cho Hoàng thượng', turn: 1, pts: 8, sung: 5, silver: 30 },
    dotin:   { name: 'Dò tin ở Ngự hoa viên', turn: 1, pts: 6 },
    tangqua: { name: 'Tặng quà', turn: 1, pts: 6, silver: 40 },
    ratay:   { name: 'Ra tay', turn: 1, silver: 120 },
  },
  THINH_AN: { pts: 10, haiLong: 3 },
  // Hoàng thượng mỗi ngày một sở thích
  HT: {
    canh: ['Canh sen hạt', 'Canh gà hầm sâm', 'Chè tổ yến', 'Canh cá chép', 'Canh bí đao', 'Chè long nhãn'],
    mau: ['đỏ', 'tím', 'xanh', 'hồng', 'cam', 'vàng'],
    tai: ['đàn', 'múa', 'thơ'],
    mood: ['vui', 'mệt', 'buồn'],
  },
  OUTFIT_COLOR: { tunu: 'xanh', thuongtai: 'tím', thuongtai_hong: 'hồng', quynhan: 'xanh', quynhan_lam: 'xanh', tan: 'cam', tan_tim: 'tím', phi: 'tím', quyphi: 'đỏ', quyphi_phuong: 'đỏ', hoangquyphi: 'cam', hoangquyphi_kim: 'đỏ', hoanghau: 'vàng', aongu: '' },
  // tiệm Nội vụ phủ
  SHOP: {
    sam:   { name: 'Nhân sâm bồi bổ', desc: '+1 lượt (mỗi ngày mua 1 lần)', price: 80 },
    huong: { name: 'Hương mê điệp', desc: 'Lần lật thẻ tới dễ được chọn hơn', price: 120 },
    le:    { name: 'Lễ vật tiến Thái hậu', desc: 'Thái hậu hài lòng +8', price: 60 },
  },
  // trang sức: mua một lần, lợi ích vĩnh viễn
  JEWELS: {
    hoatai: { name: 'Hoa tai trân châu', desc: 'Mỗi lần thỉnh an Thái hậu hài lòng thêm 1', price: 250 },
    tramthuy: { name: 'Trâm phỉ thúy', desc: 'Luôn dễ được lật thẻ hơn một chút', price: 300 },
    vongngoc: { name: 'Vòng ngọc Hòa Điền', desc: 'Mỗi ngày tự được thêm 2 sủng ái', price: 400 },
    tramphuong: { name: 'Trâm phượng vàng', desc: 'Dâng tiết mục ở yến tiệc được cộng điểm', price: 600 },
  },
  MUACHUOC_PRICE: 80,          // mua chuộc cung nữ nhà người khác để dò bí mật
  CATCHUP_RANK: 3,             // từ Thường tại trở xuống: công trạng nhận được x1.3
  NEWBIE_DAYS: 3,              // 3 ngày đầu mỗi ngày thêm 2 lượt
  DECOR_PRICE: { denlong: 60, binhsu: 80, luhuong: 100, tham: 40, giuong: 200 }, // món không có tên ở đây là miễn phí
  LAT_THE: { pts: 25, sung: 20, turns: 2 },
  LAT_THE_CROWD: 10,          // cung đông hơn số này thì mỗi lần lật 2 thẻ
  LAT_THE_GIFT: { silver: 6, sung: 1 }, // quà an ủi cho người không được lật thẻ

  WITNESS_WAIT_MS: 5 * 60e3, // chờ nhân chứng khai tối đa 5 phút, quá hạn thì tự khai
  METHODS: [
    { id: 'tuithom', name: 'Túi thơm có xạ hương', crime: 'mưu hại long thai, làm hại phi tần' },
    { id: 'thu', name: 'Thư tư thông giả mạo', crime: 'tư thông với người ngoài cung' },
    { id: 'canh', name: 'Thuốc độc trong chén canh', crime: 'đầu độc phi tần' },
    { id: 'bua', name: 'Bùa yểm có tên Thái hậu', crime: 'yểm bùa nguyền rủa Thái hậu' },
  ],
  // ---------- giai đoạn 3 ----------
  THAI_CHANCE: 0.15,            // tỉ lệ mang long thai sau mỗi lần được lật thẻ
  THAI_DAYS: 3,                // thai kỳ (ngày thật) tính từ lúc Thái y báo hỷ
  THAI_CASE_HOURS: 12,         // thời hạn tìm kẻ hãm hại long thai
  THAI_METHODS: [
    { id: 'honghoa', name: 'Hồng hoa trộn trong thuốc an thai', crime: 'mưu hại long thai' },
    { id: 'xahuong2', name: 'Gối thêu nhồi xạ hương', crime: 'mưu hại long thai' },
  ],
  CHILD_NAMES: { trai: ['Vĩnh Kỳ', 'Vĩnh Hoằng', 'Vĩnh Diễm', 'Vĩnh Thành', 'Vĩnh Tinh', 'Vĩnh Lân'], gai: ['Hòa Kính', 'Hòa Gia', 'Cố Luân', 'Hòa Thạc', 'Minh Châu', 'Ngọc Dung'] },
  DET_CASES: [
    { id: 'tram', name: 'Trâm phượng của Thái hậu bị mất', crime: 'trộm trâm phượng của Thái hậu' },
    { id: 'thuoc', name: 'Thuốc bổ ở Thái y viện bị tráo', crime: 'tráo thuốc Thái y viện' },
    { id: 'thumat', name: 'Thư mật ở Dưỡng Tâm điện bị lấy cắp', crime: 'lấy cắp thư mật' },
    { id: 'meo', name: 'Mèo Ba Tư của Thái hậu bị thả mất', crime: 'thả mèo của Thái hậu' },
    { id: 'lua', name: 'Gấm Tô Châu ở Nội vụ phủ bị cắt nát', crime: 'phá hoại gấm tiến cống' },
  ],
  DET_HOURS: 2,                // thời hạn tra án giúp Quế ma ma
  DET_REWARD: { pts: 20, silver: 50 },
  HH_MIN_RANK: 5,              // từ Tần trở lên được ứng cử Hoàng hậu
  HH_CYCLE_DAYS: 14,           // bao lâu bầu phượng ấn một lần
  HH_VOTE_HOURS: 24,           // thời gian tiến cử
  HH_DAILY: { silver: 100, turns: 2 },
  LOGIN_REWARD: [20, 30, 40, 50, 60, 80, 200], // bạc điểm danh ngày 1..7 (ngày 7 thêm 1 lượt, 10 sủng ái)
  KEEPALIVE_HOURS: [7, 24],    // giờ VN giữ server thức (ngoài giờ này server được ngủ để tiết kiệm giờ miễn phí của Render)
  EVENTS: [
    { id: 'hoadang', name: 'Lễ hoa đăng', desc: 'Cả tuần thả hoa đăng ở hồ Ngự hoa viên cầu may, mỗi ngày một lần.', loc: 'hoavien', act: '🏮 Thả hoa đăng', sub: 'Miễn phí · mỗi ngày 1 lần · cầu may' },
    { id: 'disan', name: 'Hoàng thượng đi săn', desc: 'Thắng yến tiệc được thưởng gấp đôi. Ra Dưỡng Tâm điện tiễn giá mỗi ngày.', loc: 'duongtam', act: '🏹 Tiễn giá Hoàng thượng', sub: 'Miễn phí · mỗi ngày 1 lần · sủng ái +5' },
    { id: 'phatdan', name: 'Lễ Phật đản', desc: 'Thỉnh an được gấp đôi hài lòng. Chép kinh ở Từ Ninh cung dâng Thái hậu.', loc: 'tuninh', act: '📿 Chép kinh dâng Thái hậu', sub: '1 lượt · mỗi ngày 1 lần · hài lòng +5' },
    { id: 'dichbenh', name: 'Dịch bệnh trong cung', desc: 'Thuốc an thai miễn phí. Phát thuốc cho cung nhân ở Ngự hoa viên để lập công.', loc: 'hoavien', act: '🌿 Phát thuốc cho cung nhân', sub: '20 bạc · mỗi ngày 1 lần · công trạng +12' },
    { id: 'hoica', name: 'Hội câu cá mùa thu', desc: 'Cá chép vàng xuất hiện nhiều gấp 3, cá bán đắt hơn. Ai câu nhiều nhất tuần được Hoàng thượng thưởng.', loc: null },
  ],
  // đặc điểm để loại trừ nghi phạm
  TRAITS: {
    cung: ['Đông lục cung', 'Tây lục cung', 'Ngự hoa viên lâu các'],
    gio: ['giờ Thìn (sáng)', 'giờ Mùi (chiều)', 'giờ Tuất (tối)'],
    dau: ['mùi trầm hương', 'vết mực son đỏ', 'sợi chỉ vàng thêu phượng', 'phấn hoa nhài'],
  },
  CLUES: {
    hoi:  { name: 'Hỏi cung nữ', where: 'phong', trait: 'gio', cost: 0, turn: 0, text: 'Cung nữ nhớ có người lạ ghé phòng vào' },
    so:   { name: 'Dò sổ quà ở Nội vụ phủ', where: 'hoavien', trait: 'cung', cost: 40, turn: 1, text: 'Sổ ghi tang vật đi qua tay người ở' },
    tro:  { name: 'Lục tro tàn', where: 'phong', trait: 'dau', cost: 0, turn: 1, text: 'Trong tro còn sót lại' },
    theodoi: { name: 'Theo dõi nghi phạm', where: 'hoavien', trait: 'any', cost: 0, turn: 1, text: 'Rình ở Ngự hoa viên, nghe được kẻ đáng ngờ có' },
    thaiy:{ name: 'Nhờ thái y kiểm nghiệm', where: 'tuninh', trait: 'dau2', cost: 80, turn: 0, text: 'Thái y phát hiện trên tang vật có' },
  },
};
