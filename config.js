// MỘNG PHƯỢNG HOÀNG – cấu hình luật chơi. Chỉnh số ở đây, không cần sửa code.
module.exports = {
  TZ_OFFSET_H: 7,              // giờ Việt Nam
  NIGHT_HOUR: 21,              // (cũ) giờ lật thẻ mỗi tối
  LAT_THE_SLOTS: [[11, 30, 'Trưa nay'], [21, 0, 'Đêm nay']], // giờ:phút lật thẻ mỗi ngày (giờ VN)
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
  DECOR_PRICE: { denlong: 60, binhsu: 80, luhuong: 100, tham: 40, giuong: 200 }, // món không có tên ở đây là miễn phí
  LAT_THE: { pts: 25, sung: 20, turns: 2 },
  LAT_THE_CROWD: 10,          // cung đông hơn số này thì mỗi lần lật 2 thẻ
  LAT_THE_GIFT: { silver: 15, sung: 2 }, // quà an ủi cho người không được lật thẻ

  WITNESS_WAIT_MS: 5 * 60e3, // chờ nhân chứng khai tối đa 5 phút, quá hạn thì tự khai
  METHODS: [
    { id: 'tuithom', name: 'Túi thơm có xạ hương', crime: 'mưu hại long thai, làm hại phi tần' },
    { id: 'thu', name: 'Thư tư thông giả mạo', crime: 'tư thông với người ngoài cung' },
    { id: 'canh', name: 'Thuốc độc trong chén canh', crime: 'đầu độc phi tần' },
    { id: 'bua', name: 'Bùa yểm có tên Thái hậu', crime: 'yểm bùa nguyền rủa Thái hậu' },
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
