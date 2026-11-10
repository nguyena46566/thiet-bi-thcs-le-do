/**
 * Danh mục thiết bị dạy học tối thiểu cấp THCS (Thông tư 38/2021/TT-BGDĐT, sửa đổi bởi Thông tư 26/2023/TT-BGDĐT)
 * và đối chiếu với kho thiết bị của trường (UC34).
 *
 * Dữ liệu khởi tạo chỉ gồm phần danh mục đã có văn bản (Ngữ văn, Toán, Ngoại ngữ – lựa chọn 1).
 * Các môn khác nhà trường nhập từ file Excel theo mẫu (cột giống bảng trong Thông tư).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db, { newId } from "./database.js";

const col = () => db.collection("minlist");
const settingsCol = () => db.collection("settings");
const str = (v, n) => String(v ?? "").trim().slice(0, n);

export const TT38_SUBJECTS = ["Ngữ văn", "Toán", "Ngoại ngữ", "Giáo dục công dân", "Lịch sử và Địa lí", "Khoa học tự nhiên", "Công nghệ", "Tin học",
  "Giáo dục thể chất", "Âm nhạc", "Mĩ thuật", "Hoạt động trải nghiệm, hướng nghiệp", "Thiết bị dùng chung"];
// Môn trên website tương ứng (để gợi ý liên kết thiết bị)
const SITE_SUBJECT = { "Ngữ văn": "ngu-van-gdcd", "Giáo dục công dân": "ngu-van-gdcd", "Toán": "toan-hoc", "Ngoại ngữ": "tieng-anh", "Lịch sử và Địa lí": "lich-su-dia-li",
  "Công nghệ": "cong-nghe", "Giáo dục thể chất": "gdtc" };

// Môn có danh mục tính cho 01 phòng học bộ môn: số lượng không ghi đơn vị là “/phòng”
const PER_ROOM = new Set(["Khoa học tự nhiên", "Công nghệ", "Tin học", "Mĩ thuật", "Ngoại ngữ"]);

/**
 * Đọc cột “Số lượng” của Thông tư: "01/GV", "08/GV", "01/6HS", "01/2 HS", "01/05 lớp", "06/5 lớp",
 * "04/PHBM", "01/HS/ PHBM", "03/ trường", "07" (theo phòng), "0,5" (lít hóa chất)…
 */
export function parseNorm(v, mon = "") {
  const raw = String(v || "").trim();
  const m = /^(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+)?\s*(GV|HS|lớp|lop|trường|truong|PHBM|phòng|phong|hố cát)?)?/i.exec(raw);
  if (!m) return { normQty: 0, normPer: "trường", normDiv: 1, norm: raw };
  const q = Number(m[1].replace(",", ".")), div = Number(m[2]) || 1, u = (m[3] || "").toLowerCase();
  const per = u === "gv" ? "GV" : u === "hs" ? "HS" : u.startsWith("l") ? "lớp" : u === "phbm" || u.startsWith("ph") ? "phòng" : u.startsWith("tr") || u === "hố cát" ? "trường"
    : PER_ROOM.has(mon) ? "phòng" : "trường";
  return { normQty: q, normPer: per, normDiv: div, norm: raw };
}
const gradesOf = (v) => [...new Set((String(v || "").match(/[6-9]/g) || []).map(Number))].sort();

function validItem(b) {
  const mon = TT38_SUBJECTS.includes(b.mon) ? b.mon : null;
  const name = str(b.name, 300);
  if (!mon) return { error: "Môn không đúng tên trong Thông tư 38" };
  if (!name) return { error: "Thiếu tên thiết bị" };
  const norm = b.normQty !== undefined && b.norm === undefined
    ? { normQty: Math.max(0, Number(b.normQty) || 0), normPer: ["GV", "HS", "lớp", "phòng", "trường"].includes(b.normPer) ? b.normPer : "trường", normDiv: Math.max(1, Math.floor(Number(b.normDiv) || 1)), norm: str(b.normText ?? "", 30) }
    : parseNorm(b.norm, mon);
  return { value: {
    mon, stt: str(b.stt, 20), group: str(b.group, 120), topic: str(b.topic, 200), name, purpose: str(b.purpose, 500),
    forTeacher: b.forTeacher !== undefined ? !!b.forTeacher : /gv|x/i.test(String(b.target || "GV")) && !/^hs$/i.test(String(b.target || "").trim()),
    forStudent: b.forStudent !== undefined ? !!b.forStudent : /hs/i.test(String(b.target || "")),
    unit: str(b.unit, 20), ...norm, grades: Array.isArray(b.grades) ? b.grades.map(Number).filter((g) => g >= 6 && g <= 9) : gradesOf(b.grades ?? b.note),
    note: str(b.note, 300), siteSubjectId: str(b.siteSubjectId, 40) || SITE_SUBJECT[mon] || "",
  } };
}

// ---------------- Dữ liệu khởi tạo (chép từ danh mục Thông tư 38/2021) ----------------
const V = (stt, group, topic, name, purpose, target, unit, norm, grades, note = "") => ({ stt, group, topic, name, purpose, target, unit, norm, grades, note });
const SEED = {
  "Ngữ văn": [
    V("1a", "I. Tranh ảnh", "Chủ đề 1. Đọc – Dạy đọc hiểu văn bản văn học", "Bộ tranh minh họa hình ảnh một số truyện tiêu biểu", "Minh họa, phục vụ hoạt động dạy đọc hiểu các thể loại truyện (02 tờ)", "GV", "Bộ", "01/GV", "6"),
    V("1b", "I. Tranh ảnh", "Chủ đề 1. Đọc – Dạy đọc hiểu văn bản văn học", "Bộ tranh mô hình hóa các thành tố của các loại văn bản", "Minh họa, phục vụ hoạt động dạy đọc hiểu (03 tờ)", "GV", "Bộ", "01/GV", "6"),
    V("2", "I. Tranh ảnh", "Chủ đề 1. Đọc – Dạy các tác phẩm thơ, thơ lục bát, thơ có yếu tố tự sự và miêu tả", "Bộ tranh mô hình hóa các thành tố của các loại văn bản thơ", "Minh họa, phục vụ dạy đọc hiểu thể loại thơ (02 tờ)", "GV", "Bộ", "01/GV", "6"),
    V("3", "I. Tranh ảnh", "Chủ đề 1. Đọc – Dạy các tác phẩm Hồi kí hoặc Du kí", "Bộ tranh bìa sách một số cuốn Hồi kí và Du kí nổi tiếng", "Minh họa, phục vụ dạy đọc hiểu thể loại kí (02 tờ)", "GV", "Bộ", "01/GV", "6"),
    V("4", "I. Tranh ảnh", "Chủ đề 1. Đọc – Dạy các văn bản nghị luận", "Tranh mô hình hóa các yếu tố hình thức của văn bản nghị luận", "Minh họa, phục vụ dạy đọc hiểu thể loại nghị luận (02 tờ)", "GV", "Bộ", "01/GV", "6"),
    V("5", "I. Tranh ảnh", "Chủ đề 1. Đọc – Dạy các văn bản thông tin", "Tranh mô hình hóa các yếu tố hình thức của văn bản thông tin", "Minh họa, phục vụ dạy đọc hiểu văn bản thông tin (02 tờ)", "GV", "Bộ", "01/GV", "6"),
    V("6", "I. Tranh ảnh", "Chủ đề 2. Viết – Dạy quy trình, cách viết chung", "Tranh minh họa: Mô hình hóa quy trình viết 1 văn bản và Sơ đồ tóm tắt nội dung chính của một số văn bản đơn giản", "Minh họa, phục vụ hoạt động dạy viết", "GV", "Bộ", "01/GV", "6"),
    V("7", "I. Tranh ảnh", "Chủ đề 2. Viết – Dạy về quy trình, cách viết theo kiểu văn bản", "Sơ đồ mô hình một số kiểu văn bản có trong chương trình", "Minh họa, phục vụ hoạt động dạy viết (05 tờ)", "GV", "Bộ", "01/GV", "6"),
    V("II.1", "II. Video/clip/phim (tư liệu dạy học điện tử)", "", "Bộ học liệu điện tử hỗ trợ giáo viên", "Giúp giáo viên xây dựng kế hoạch dạy học (giáo án) điện tử theo Chương trình Ngữ văn", "GV, HS", "", "01/GV", "6, 7, 8, 9"),
    V("II.2", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác phẩm Nam quốc sơn hà (Thời Lý)", "Video/clip/phim tư liệu về tác phẩm Nam quốc sơn hà", "Minh họa, phục vụ tìm hiểu tác phẩm", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.3", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác phẩm Hịch tướng sĩ của Trần Quốc Tuấn", "Video/clip/phim tư liệu về tác phẩm Hịch tướng sĩ", "Minh họa, phục vụ tìm hiểu tác phẩm", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.4", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Bình Ngô đại cáo; thơ Nguyễn Trãi", "Video/clip/phim tư liệu về Bình Ngô đại cáo và thơ Nôm của Nguyễn Trãi", "Minh họa, phục vụ dạy đọc hiểu", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.5", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Truyện dân gian", "Video/clip/phim tư liệu về Văn học dân gian Việt Nam", "Minh họa, phục vụ tìm hiểu văn học dân gian", "GV", "Bộ", "01/GV", "6, 7, 8"),
    V("II.6", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác phẩm Truyện Kiều của Nguyễn Du", "Video/clip/phim tư liệu về tác phẩm Truyện Kiều", "Minh họa, phục vụ dạy đọc hiểu", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.7", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Hồ Xuân Hương", "Video/clip/phim tư liệu về thơ Nôm của Hồ Xuân Hương", "Minh họa", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.8", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Nguyễn Đình Chiểu", "Video/clip/phim tư liệu về thơ Nôm của Nguyễn Đình Chiểu", "Minh họa", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.9", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Nguyễn Khuyến", "Video/clip/phim tư liệu về thơ Nôm của Nguyễn Khuyến", "Minh họa", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.10", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Nguyễn Ái Quốc – Hồ Chí Minh", "Video/clip/phim tư liệu về thơ văn của Chủ tịch Hồ Chí Minh", "Minh họa", "GV", "Bộ", "01/GV", "6, 7, 8, 9"),
    V("II.11", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Nam Cao", "Video/clip/phim tư liệu tìm hiểu truyện ngắn của Nam Cao", "Minh họa", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.12", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Xuân Diệu", "Video/clip/phim tư liệu về thơ của Xuân Diệu trước Cách mạng tháng Tám", "Minh họa", "GV", "Bộ", "01/GV", "8, 9"),
    V("II.13", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Tố Hữu", "Video/clip/phim tư liệu về thơ của Tố Hữu trước và sau Cách mạng tháng Tám", "Minh họa", "GV", "Bộ", "01/GV", "6, 7, 8, 9"),
    V("II.14", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Nguyễn Tuân", "Video/clip/phim tư liệu về tác giả Nguyễn Tuân", "Minh họa", "GV", "Bộ", "01/GV", "6, 7"),
    V("II.15", "II. Video/clip/phim (tư liệu dạy học điện tử)", "Tác giả Nguyễn Huy Tưởng", "Video/clip/phim tư liệu về tác giả Nguyễn Huy Tưởng", "Minh họa", "GV", "Bộ", "01/GV", "8, 9"),
  ],
  "Toán": [
    V("A.1", "A. Thiết bị dùng chung", "Hình học", "Bộ thiết bị để vẽ trên bảng trong dạy học toán", "Thước 500 mm, compa 400 mm, thước đo góc 300 mm, ê ke 400×400 mm", "GV", "Bộ", "01/GV", ""),
    V("A.2", "A. Thiết bị dùng chung", "Hình học", "Bộ thước thực hành đo khoảng cách, đo chiều cao ngoài trời", "Học sinh thực hành đo khoảng cách, đo chiều cao ngoài trời", "GV, HS", "Bộ", "04/GV", ""),
    V("A.3", "A. Thiết bị dùng chung", "Thống kê và Xác suất", "Bộ thiết bị dạy Thống kê và Xác suất (xúc xắc và hộp tung, đồng xu, hộp bóng)", "Khám phá, thực hành về khả năng xảy ra của một sự kiện", "GV, HS", "Bộ", "08/GV", "", "Mục này đã được Thông tư 26/2023 sửa đổi (Phụ lục III) – cần đối chiếu"),
    V("B.I.1.1", "B. Thiết bị theo chủ đề – I. Mô hình", "Hình học và đo lường – Hình học phẳng", "Bộ thiết bị dạy hình học phẳng", "Mô hình tam giác, hình tròn có thước đo độ, 04 que gắn bảng từ", "GV, HS", "Bộ", "08/GV", "6, 7"),
    V("B.I.1.2a", "B. Thiết bị theo chủ đề – I. Mô hình", "Hình học và đo lường – Hình học trực quan", "Bộ hình học trực quan: hình hộp chữ nhật, lập phương, lăng trụ đứng tam giác, hộp tính thể tích", "Nhận biết, mô tả hình dạng các hình khối", "GV, HS", "Bộ", "08/GV", "7"),
    V("B.I.1.2b", "B. Thiết bị theo chủ đề – I. Mô hình", "Hình học và đo lường – Hình học trực quan", "Bộ hình học trực quan: hình chóp tam giác đều, hình chóp tứ giác đều", "Nhận biết, mô tả hình chóp đều", "GV, HS", "Bộ", "08/GV", "8"),
    V("B.I.1.2c", "B. Thiết bị theo chủ đề – I. Mô hình", "Hình học và đo lường – Hình học trực quan", "Bộ hình học trực quan: hình trụ, hình nón, hình cầu, mô hình khối tròn xoay", "Nhận biết, mô tả hình trụ, nón, cầu", "GV, HS", "Bộ", "08/GV", "9"),
    V("B.II.1", "B. Thiết bị theo chủ đề – II. Phần mềm", "Hình học và đo lường", "Phần mềm toán học (hình học)", "Hỗ trợ vẽ hình, khám phá kiến thức hình học (không vi phạm bản quyền)", "GV, HS", "Bộ", "01/GV", ""),
    V("B.II.2", "B. Thiết bị theo chủ đề – II. Phần mềm", "Thống kê và Xác suất", "Phần mềm toán học (thống kê, xác suất)", "Hỗ trợ vẽ biểu đồ, tính số đặc trưng, xác suất (không vi phạm bản quyền)", "GV, HS", "Bộ", "01/GV", ""),
  ],
  "Ngoại ngữ": [
    V("I.1", "I. Thiết bị dạy học ngoại ngữ thông dụng (lựa chọn 1)", "", "Đài đĩa CD", "Phát các học liệu âm thanh", "GV", "Chiếc", "01/GV", "", "Có thể sử dụng thiết bị dùng chung"),
    V("I.2", "I. Thiết bị dạy học ngoại ngữ thông dụng (lựa chọn 1)", "", "Đầu đĩa", "Phát học liệu hình ảnh và âm thanh cho hoạt động nghe và nói", "GV", "Chiếc", "01/GV", "", "Có thể sử dụng thiết bị dùng chung"),
    V("I.3", "I. Thiết bị dạy học ngoại ngữ thông dụng (lựa chọn 1)", "", "Máy chiếu (hoặc màn hình hiển thị)", "Kết nối máy tính, phát âm thanh hình ảnh", "GV", "Chiếc", "01/GV", ""),
    V("I.4", "I. Thiết bị dạy học ngoại ngữ thông dụng (lựa chọn 1)", "", "Bộ máy vi tính để bàn hoặc máy tính xách tay", "Kết nối thiết bị ngoại vi để trình chiếu bài giảng", "GV", "Chiếc", "01/GV", ""),
    V("I.5", "I. Thiết bị dạy học ngoại ngữ thông dụng (lựa chọn 1)", "", "Thiết bị âm thanh đa năng di động", "Phát học liệu âm thanh và trợ âm cho giáo viên", "GV", "Bộ", "01/GV", ""),
    V("I.6", "I. Thiết bị dạy học ngoại ngữ thông dụng (lựa chọn 1)", "", "Bộ học liệu điện tử", "Hỗ trợ giáo viên xây dựng kế hoạch bài dạy, bài giảng, bài tập, kiểm tra đánh giá", "GV", "Bộ", "01/GV", "", "Trường chọn 1 trong 3 phương án trang bị; đây là phương án 1"),
  ],
};

/** Đọc catalog/tt38.txt (các môn còn lại của Thông tư 38/2021) */
function loadFileSeed() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "catalog", "tt38.txt");
  const out = {};
  let mon = "", group = "", topic = "", grades = "";
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("# ")) continue;
    if (l.startsWith("=")) { mon = l.slice(1).trim(); group = topic = grades = ""; continue; }
    if (l.startsWith("#")) { group = l.slice(1).trim(); continue; }
    if (l.startsWith("@")) { topic = l.slice(1).trim(); continue; }
    if (l.startsWith("%")) { grades = l.slice(1).trim(); continue; }
    const [stt, name, t, unit, norm, g, note] = l.split("|").map((x) => (x ?? "").trim());
    if (!name) continue;
    (out[mon] ||= []).push({ stt, group, topic, name, target: t === "G" ? "GV" : t === "H" ? "HS" : "GV, HS", unit, norm, grades: g || grades, note: note || "" });
  }
  return out;
}
export function seedRows() {
  const fileSeed = loadFileSeed();
  const all = { ...SEED };
  for (const [mon, rows] of Object.entries(fileSeed)) all[mon] = [...(all[mon] || []), ...rows];
  return all;
}
// Các môn có mục đã được Thông tư 26/2023 sửa đổi, bổ sung
export const AMENDED_BY_TT26 = ["Toán", "Giáo dục công dân", "Khoa học tự nhiên", "Công nghệ", "Giáo dục thể chất", "Mĩ thuật", "Thiết bị dùng chung"];
const SEED_VERSION = 2;

async function insertRows(mon, rows, startOrd) {
  const now = new Date().toISOString();
  let n = 0;
  for (const r of rows) {
    const v = validItem({ ...r, mon, target: r.target, forTeacher: /GV/.test(r.target || "GV"), forStudent: /HS/.test(r.target || "") });
    if (v.value) { await col().insert({ id: newId(), ...v.value, ord: startOrd + n, linkedEquipmentIds: [], source: "TT 38/2021", createdAt: now }); n++; }
  }
  return n;
}

export async function initMinlist() {
  const meta = (await settingsCol().get("minlistSeed")) || { id: "minlistSeed", version: 0 };
  if (meta.version >= SEED_VERSION && (await col().count()) > 0) return;
  const seeds = seedRows();
  const existing = await col().all();
  let total = 0, ord = existing.length ? Math.max(...existing.map((x) => x.ord ?? 0)) + 1 : 0;
  for (const [mon, rows] of Object.entries(seeds)) {
    const have = existing.filter((x) => x.mon === mon);
    // Môn chưa có dòng nào: nạp toàn bộ. Môn đã có: chỉ thêm các nhóm chưa có (VD Ngoại ngữ lựa chọn 2, 3)
    const groups = new Set(have.map((x) => x.group));
    const add = have.length ? rows.filter((r) => !groups.has(r.group) && !have.some((h) => h.name === r.name && h.group === r.group)) : rows;
    if (!add.length) continue;
    const n = await insertRows(mon, add, ord); ord += n; total += n;
  }
  const doc = { id: "minlistSeed", version: SEED_VERSION, at: new Date().toISOString() };
  if (meta.version) await settingsCol().update("minlistSeed", doc); else if (await settingsCol().get("minlistSeed")) await settingsCol().update("minlistSeed", doc); else await settingsCol().insert(doc);
  if (total) console.log(`[Danh mục tối thiểu] Đã nạp ${total} dòng theo Thông tư 38/2021`);
}

async function getSettings() {
  return (await settingsCol().get("school")) || { id: "school", teachers: {}, hsPerRoom: 45, classes: { 6: 0, 7: 0, 8: 0, 9: 0 } };
}

/** Đối chiếu từng dòng danh mục với kho: số cần có = định mức × số GV (hoặc HS/phòng, lớp), số đang có = tổng “tốt” của thiết bị liên kết */
export function compare(items, settings, inventory) {
  const byId = new Map(inventory.map((e) => [e.id, e]));
  return items.map((it) => {
    const t = Number(settings.teachers?.[it.mon]) || 0;
    const classes = (it.grades?.length ? it.grades : [6, 7, 8, 9]).reduce((a, g) => a + (Number(settings.classes?.[g]) || 0), 0);
    const div = Number(it.normDiv) || 1;
    const rooms = Number(settings.rooms?.[it.mon]) || 1;
    const base = it.normPer === "GV" ? t : it.normPer === "HS" ? Math.ceil((Number(settings.hsPerRoom) || 45) / div) * (PER_ROOM.has(it.mon) ? rooms : 1)
      : it.normPer === "lớp" ? Math.ceil(classes / div) : it.normPer === "phòng" ? rooms : 1;
    const required = Math.round(it.normQty * base * 100) / 100;
    const have = (it.linkedEquipmentIds || []).reduce((a, id) => a + (Number(byId.get(id)?.qtyGood) || 0), 0);
    const status = !(it.linkedEquipmentIds || []).length ? "Chưa liên kết" : it.normPer === "GV" && !t ? "Chưa khai báo số GV" : have >= required ? "Đủ" : have > 0 ? "Thiếu" : "Chưa có";
    return { ...it, required, have, missing: Math.max(0, required - have), status };
  });
}

export function registerMinlistRoutes(app, { requireAdmin, wrap, getInventory }) {
  app.get("/api/minlist", requireAdmin, wrap(async (req, res) => {
    const items = (await col().all()).sort((a, b) => TT38_SUBJECTS.indexOf(a.mon) - TT38_SUBJECTS.indexOf(b.mon) || (a.ord ?? 0) - (b.ord ?? 0) || a.createdAt.localeCompare(b.createdAt));
    const settings = await getSettings();
    res.json({ subjects: TT38_SUBJECTS, amended: AMENDED_BY_TT26, settings, items: compare(items, settings, await getInventory()) });
  }));
  app.put("/api/minlist/settings", requireAdmin, wrap(async (req, res) => {
    const b = req.body || {};
    const teachers = {};
    for (const m of TT38_SUBJECTS) { const n = Math.floor(Number(b.teachers?.[m])); if (n > 0 && n < 200) teachers[m] = n; }
    const rooms = {};
    for (const m of TT38_SUBJECTS) { const n = Math.floor(Number(b.rooms?.[m])); if (n > 0 && n < 20) rooms[m] = n; }
    const classes = {};
    for (const g of [6, 7, 8, 9]) classes[g] = Math.max(0, Math.min(60, Math.floor(Number(b.classes?.[g]) || 0)));
    const doc = { id: "school", teachers, rooms, classes, hsPerRoom: Math.max(1, Math.min(60, Math.floor(Number(b.hsPerRoom) || 45))), updatedAt: new Date().toISOString() };
    if (await settingsCol().get("school")) await settingsCol().update("school", doc); else await settingsCol().insert(doc);
    res.json(doc);
  }));
  app.post("/api/minlist", requireAdmin, wrap(async (req, res) => {
    const v = validItem(req.body || {});
    if (v.error) return res.status(400).json(v);
    res.status(201).json(await col().insert({ id: newId(), ...v.value, ord: Date.now(), linkedEquipmentIds: [], source: "Nhập tay", createdAt: new Date().toISOString() }));
  }));
  app.patch("/api/minlist/:id", requireAdmin, wrap(async (req, res) => {
    const cur = await col().get(req.params.id);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy dòng danh mục" });
    const b = req.body || {};
    const patch = {};
    if (Array.isArray(b.linkedEquipmentIds)) {
      const ids = new Set((await getInventory()).map((e) => e.id));
      patch.linkedEquipmentIds = [...new Set(b.linkedEquipmentIds.map(String))].filter((id) => ids.has(id)).slice(0, 20);
    }
    if (b.name !== undefined || b.norm !== undefined || b.normQty !== undefined) {
      const v = validItem({ ...cur, ...b });
      if (v.error) return res.status(400).json(v);
      Object.assign(patch, v.value);
    }
    res.json(await col().update(cur.id, patch));
  }));
  // Khôi phục danh mục gốc của một môn (xóa các dòng hiện có của môn đó, nạp lại theo Thông tư)
  app.post("/api/minlist/reseed", requireAdmin, wrap(async (req, res) => {
    const mon = req.body?.mon;
    const rows = seedRows()[mon];
    if (!rows) return res.status(400).json({ error: "Chưa có dữ liệu gốc cho môn này" });
    for (const it of await col().all()) if (it.mon === mon) await col().remove(it.id);
    res.json({ imported: await insertRows(mon, rows, Date.now()) });
  }));
  app.delete("/api/minlist/:id", requireAdmin, wrap(async (req, res) => res.json(await col().remove(req.params.id))));
  // Nhập nhiều dòng (từ file Excel theo mẫu); replace=true thì xóa các dòng cũ của những môn có trong file
  app.post("/api/minlist/import", requireAdmin, wrap(async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 2000) : [];
    const ok = [], errors = [];
    rows.forEach((r, i) => { const v = validItem(r); if (v.error) errors.push(`Dòng ${i + 2}: ${v.error}`); else ok.push(v.value); });
    if (!ok.length) return res.status(400).json({ error: errors[0] || "File không có dòng hợp lệ", errors: errors.slice(0, 20) });
    if (req.body?.replace) {
      const mons = new Set(ok.map((x) => x.mon));
      for (const it of await col().all()) if (mons.has(it.mon)) await col().remove(it.id);
    }
    const now = new Date().toISOString();
    let ord = Date.now();
    for (const v of ok) await col().insert({ id: newId(), ...v, ord: ord++, linkedEquipmentIds: [], source: "Nhập từ file", createdAt: now });
    res.json({ imported: ok.length, errors: errors.slice(0, 20) });
  }));
}
