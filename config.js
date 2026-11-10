// MỘNG PHƯỢNG HOÀNG – cấu hình luật chơi. Chỉnh số ở đây, không cần sửa code.
module.exports = {
  TZ_OFFSET_H: 7,              // giờ Việt Nam
  NIGHT_HOUR: 21,              // giờ lật thẻ mỗi tối
  TURNS_PER_DAY: 5,
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
  LAT_THE: { pts: 25, sung: 20 },

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
    thaiy:{ name: 'Nhờ thái y kiểm nghiệm', where: 'tuninh', trait: 'dau2', cost: 80, turn: 0, text: 'Thái y phát hiện trên tang vật có' },
  },
};
