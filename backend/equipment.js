/**
 * Danh mục thiết bị + tìm kiếm + kiểm tra tồn kho.
 * Dữ liệu tĩnh (equipment/lessons/rules) nằm trong backend/catalog/ (được commit lên git).
 * Dữ liệu mượn/trả lấy từ database.js (records.json).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.join(__dirname, "catalog");

// Danh mục chỉ đọc từ đĩa một lần rồi giữ trong bộ nhớ (sửa file catalog thì khởi động lại server).
const catalogCache = new Map();
function readCatalog(file) {
  if (catalogCache.has(file)) return catalogCache.get(file);
  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(path.join(catalogDir, file), "utf-8"));
  } catch (err) {
    console.error(`Không đọc được catalog/${file}:`, err.message);
  }
  catalogCache.set(file, data);
  return data;
}

// ---------- Tiện ích văn bản / ngày ----------

/** Bỏ dấu tiếng Việt, về chữ thường, chỉ giữ chữ-số. "Áp suất" -> "ap suat" */
export function normalize(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Từ quá phổ biến trong câu hỏi, không giúp phân biệt thiết bị
const STOP = new Set(
  ("cho cua va la can gi nao bai hoc day minh toi co khong the nhung cac mot tiet lop mon " +
    "thiet bi do dung muon tim xin hay giup em anh chi thay co cua o tai voi khi nao nhu").split(" ")
);

function tokens(str) {
  return normalize(str)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Chấm điểm: token khớp nguyên từ trong tên (3), từ khóa (2), mô tả khác (1); khớp chuỗi con (>=4 ký tự) được 1. */
function scoreDetail(queryTokens, { name = "", keywords = "", extra = "" }) {
  const n = ` ${normalize(name)} `;
  const k = ` ${normalize(keywords)} `;
  const e = ` ${normalize(extra)} `;
  let score = 0;
  let hits = 0; // số token có khớp
  for (const t of queryTokens) {
    const w = ` ${t} `;
    let s = 0;
    if (n.includes(w)) s = 3;
    else if (k.includes(w)) s = 2;
    else if (e.includes(w)) s = 1;
    else if (t.length >= 4 && (n.includes(t) || k.includes(t))) s = 1;
    if (s) hits++;
    score += s;
  }
  return { score, hits };
}
const scoreMatch = (queryTokens, fields) => scoreDetail(queryTokens, fields).score;

/** Ngày dạng lịch (UTC 00:00) từ "DD/MM/YYYY" hoặc "YYYY-MM-DD". Sai định dạng -> null. */
export function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  let d, m, y, mt;
  if ((mt = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/))) {
    d = +mt[1]; m = +mt[2]; y = +mt[3];
  } else if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    y = +mt[1]; m = +mt[2]; d = +mt[3];
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function formatDate(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getUTCDate())}/${p(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

// Quy định: đăng ký trước ít nhất 24 giờ so với lúc cần dùng.
export const MIN_NOTICE_HOURS = 24;

// Giờ bắt đầu từng tiết (giờ Việt Nam). ĐÂY LÀ GIẢ ĐỊNH, hãy sửa theo thời khóa biểu thật của trường.
// ---------- Tiết học ----------
// Mã tiết: S1..S5 (buổi sáng), C1..C5 (buổi chiều). Giờ bắt đầu theo lịch thông dụng, trường có thể sửa.
export const SLOT_START = {
  S1: "07:00", S2: "07:50", S3: "08:55", S4: "09:45", S5: "10:35",
  C1: "13:30", C2: "14:20", C3: "15:15", C4: "16:05", C5: "16:55",
};
export const ALL_SLOTS = Object.keys(SLOT_START);
// Phiếu cũ ghi "Tiết 1".."Tiết 5" = buổi sáng
export const PERIOD_START = { "Tiết 1": "07:00", "Tiết 2": "07:50", "Tiết 3": "08:55", "Tiết 4": "09:45", "Tiết 5": "10:35" };
const legacySlot = (p) => { const m = /^Tiết (\d)$/.exec(p || ""); return m ? `S${m[1]}` : null; };

/** Chuẩn hóa danh sách tiết; bỏ mã sai, sắp theo thứ tự trong ngày */
export function normalizeSlots(periods) {
  const set = new Set((Array.isArray(periods) ? periods : []).map((p) => legacySlot(p) || String(p)).filter((p) => p in SLOT_START));
  return ALL_SLOTS.filter((x) => set.has(x));
}
/** "Sáng: 1, 2 · Chiều: 3" */
export function slotLabel(slots) {
  const s = normalizeSlots(slots);
  const part = (k, name) => { const n = s.filter((x) => x[0] === k).map((x) => x.slice(1)); return n.length ? `${name}: ${n.join(", ")}` : ""; };
  return [part("S", "Sáng"), part("C", "Chiều")].filter(Boolean).join(" · ");
}
/** Các tiết một phiếu chiếm; mảng rỗng = cả ngày */
export function recordSlots(r) {
  if (Array.isArray(r.periods) && r.periods.length) return normalizeSlots(r.periods);
  const l = legacySlot(r.period);
  return l ? [l] : [];
}
/** Phiếu có dùng (ngày, tiết) này không. Phiếu mượn nhiều ngày giữ thiết bị suốt các ngày đó. */
export function recordCovers(r, day, slot) {
  const bd = parseDate(r.borrowDate), rd = parseDate(r.returnDate);
  if (!bd || !rd || day < bd || day > rd) return false;
  const sl = recordSlots(r);
  if (!sl.length) return true; // không ghi tiết: giữ cả ngày
  if (bd.getTime() === rd.getTime()) return sl.includes(slot);
  // Mượn nhiều ngày: thiết bị ở ngoài phòng thiết bị từ tiết đầu của ngày mượn
  // đến tiết cuối của ngày trả; các ngày ở giữa giữ cả ngày.
  const i = ALL_SLOTS.indexOf(slot);
  if (day.getTime() === bd.getTime()) return i >= ALL_SLOTS.indexOf(sl[0]);
  if (day.getTime() === rd.getTime()) return i <= ALL_SLOTS.indexOf(sl[sl.length - 1]);
  return true;
}
const daysBetween = (from, to) => { const out = []; for (let t = from.getTime(); t <= to.getTime() && out.length < 400; t += 864e5) out.push(new Date(t)); return out; };
/** Các (ngày, tiết) mà một yêu cầu mượn cần: một ngày + có tiết -> đúng các tiết đó; còn lại -> mọi tiết */
export function requestCells(from, to, slots) {
  const days = daysBetween(from, to);
  const sl = from.getTime() === to.getTime() && normalizeSlots(slots).length ? normalizeSlots(slots) : ALL_SLOTS;
  return days.flatMap((d) => sl.map((s) => [d, s]));
}

/** Số giờ từ `now` đến lúc bắt đầu tiết sớm nhất. `period` là "Tiết n" hoặc mảng mã tiết. */
export function hoursUntilBorrow(borrowDate, period, now = new Date()) {
  const d = parseDate(borrowDate);
  if (!d) return null;
  const slots = Array.isArray(period) ? normalizeSlots(period) : normalizeSlots([period]);
  const start = new Date(`${d.toISOString().slice(0, 10)}T${SLOT_START[slots[0]] || "07:00"}:00+07:00`);
  return (start - now) / 3_600_000;
}

/** Hôm nay theo giờ Việt Nam (dạng ngày lịch UTC 00:00) */
export function todayVN() {
  return parseDate(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }));
}

// ---------- Thiết bị ----------

// Danh mục thiết bị: lúc đầu đọc từ catalog/equipment.json; khi có phân hệ kho (inventory.js)
// thì được thay bằng dữ liệu trong CSDL qua setEquipmentCatalog().
export const listEquipment = () => readCatalog("equipment.json");
let equipmentById = null;
export function setEquipmentCatalog(list) {
  catalogCache.set("equipment.json", list);
  equipmentById = null;
}
/** Đọc file danh mục gốc (chỉ dùng để khởi tạo kho lần đầu) */
export function loadSeedEquipment() {
  try { return JSON.parse(fs.readFileSync(path.join(catalogDir, "equipment.json"), "utf-8")); } catch { return []; }
}
export const getEquipment = (id) => {
  if (!equipmentById) equipmentById = new Map(listEquipment().map((e) => [e.id, e]));
  return equipmentById.get(id) || null;
};

const ACTIVE_STATUS = new Set(["Chờ duyệt", "Mượn"]);

/** Số lượng thiết bị một phiếu giữ (theo mã nếu có, không thì đoán theo tên) */
function qtyInRecord(eq, r, nameNorm) {
  if (Array.isArray(r.items) && r.items.length) return r.items.reduce((a, it) => a + (it.equipmentId === eq.id ? Number(it.quantity) || 1 : 0), 0);
  const text = ` ${normalize(r.equipment)} `;
  const i = text.indexOf(` ${nameNorm} `);
  if (i === -1) return 0;
  const qty = text.slice(i + nameNorm.length + 2).match(/^x(\d+)\b/);
  return qty ? Number(qty[1]) : 1;
}

/**
 * Số lượng bị giữ cao nhất tại một (ngày, tiết) trong yêu cầu, kèm các phiếu gây ra mức đó.
 * Tính theo từng tiết như phần mềm quản lý thiết bị: hai lớp dùng cùng thiết bị ở hai tiết khác nhau không trùng nhau.
 */
export function bookedQuantity(eq, from, to, records, slots = null, exceptId = null) {
  const nameNorm = normalize(eq.name);
  const using = [];
  for (const r of records) {
    if (!ACTIVE_STATUS.has(r.status) || r.id === exceptId) continue;
    const q = qtyInRecord(eq, r, nameNorm);
    if (q) using.push([r, q]);
  }
  let best = { booked: 0, day: null, slot: null, conflicts: [] };
  if (!using.length) return best;
  for (const [day, slot] of requestCells(from, to, slots)) {
    let sum = 0; const who = [];
    for (const [r, q] of using) if (recordCovers(r, day, slot)) { sum += q; who.push({ teacherName: r.teacherName, className: r.className, period: r.period || "", quantity: q, borrowDate: r.borrowDate }); }
    if (sum > best.booked) best = { booked: sum, day, slot, conflicts: who };
  }
  return best;
}

/** Hóa chất đã quá hạn sử dụng (R10) */
export function isExpired(eq) {
  if (eq.kind !== "Hóa chất" || !eq.expiry) return false;
  const d = parseDate(eq.expiry);
  return !!d && d < todayVN();
}

function usableStock(eq) {
  // Hóa chất hết hạn: không cho mượn
  if (isExpired(eq)) return 0;
  // Có dữ liệu kho: chỉ tính số thiết bị còn tốt
  if (eq.qtyGood !== undefined) return Math.max(0, Number(eq.qtyGood) || 0);
  return /hỏng|đang sửa|thanh lý/i.test(eq.condition || "") ? 0 : Number(eq.stock) || 0;
}

export function availabilityOf(eq, from, to, records, slots = null, exceptId = null) {
  const stock = usableStock(eq);
  const b = bookedQuantity(eq, from, to, records, slots, exceptId);
  return { stock, booked: b.booked, available: Math.max(0, stock - b.booked), conflicts: b.conflicts,
    at: b.day ? `${formatDate(b.day)} ${slotLabel([b.slot])}` : "" };
}

export async function checkAvailability({ equipmentIds = [], borrowDate, returnDate }) {
  const from = parseDate(borrowDate);
  const to = parseDate(returnDate || borrowDate);
  if (!from || !to) return { error: "Ngày không hợp lệ, cần định dạng DD/MM/YYYY." };
  if (to < from) return { error: "Ngày trả phải sau hoặc bằng ngày mượn." };
  const records = await db.records.findActive();
  const items = equipmentIds.slice(0, 20).map((id) => {
    const eq = getEquipment(id);
    if (!eq) return { equipmentId: id, error: "Không có thiết bị với mã này trong danh mục." };
    return { equipmentId: id, name: eq.name, ...availabilityOf(eq, from, to, records) };
  });
  return { borrowDate: formatDate(from), returnDate: formatDate(to), items };
}

const brief = (eq) => ({
  id: eq.id, name: eq.name, subjectId: eq.subjectId, grades: eq.grades,
  stock: eq.qtyGood ?? eq.stock, condition: eq.condition, location: eq.location,
  ...(eq.qtyBroken || eq.qtyRepair ? { broken: eq.qtyBroken || 0, inRepair: eq.qtyRepair || 0 } : {}),
});

export function searchEquipment({ query = "", subjectId, grade, limit = 8 } = {}) {
  const qt = tokens(query);
  let list = listEquipment();
  if (subjectId) list = list.filter((e) => e.subjectId === subjectId);
  if (grade) list = list.filter((e) => !e.grades?.length || e.grades.includes(Number(grade)));
  if (!qt.length) return normalize(query) ? [] : list.slice(0, limit).map(brief); // có câu hỏi nhưng toàn từ phổ biến -> không đoán bừa
  return list
    .map((e) => ({ e, score: scoreMatch(qt, { name: e.name, keywords: [...(e.keywords || []), e.topic || ""].join(" ") }) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => brief(x.e));
}

// ---------- Gợi ý theo bài học (PPCT) ----------

/**
 * Bước 1: tìm bài học khớp trong lessons.json -> lấy thiết bị khuyến nghị (luật/tri thức).
 * Bước 2 (dự phòng): không khớp bài nào -> tìm thiết bị theo từ khóa (content-based).
 * Sau này có thể thay bước 2 bằng embedding + cosine similarity mà không đổi giao diện hàm.
 */
export async function suggestForLesson({ subjectId, grade, topic = "", borrowDate, returnDate }) {
  const qt = tokens(topic);
  let lessons = readCatalog("lessons.json");
  if (subjectId) lessons = lessons.filter((l) => l.subjectId === subjectId);
  if (grade) lessons = lessons.filter((l) => l.grade === Number(grade));

  // Chỉ coi là "có trong PPCT" khi điểm đủ cao VÀ khớp ít nhất nửa số từ trong câu hỏi
  // (tránh việc một từ chung như "lực" kéo nhầm sang bài khác).
  const best = lessons
    .map((l) => ({ l, ...scoreDetail(qt, { name: l.title, keywords: (l.keywords || []).join(" ") }) }))
    .filter((x) => x.score >= 3 && x.hits / Math.max(qt.length, 1) >= 0.5)
    .sort((a, b) => b.score - a.score)[0];

  let source, lesson = null, equipment;
  if (best) {
    source = "lesson_plan";
    lesson = { id: best.l.id, title: best.l.title, grade: best.l.grade, subjectId: best.l.subjectId };
    equipment = best.l.equipmentIds.map(getEquipment).filter(Boolean);
  } else {
    source = "keyword_fallback";
    equipment = searchEquipment({ query: topic, subjectId, grade, limit: 5 });
  }

  const from = parseDate(borrowDate);
  const to = parseDate(returnDate || borrowDate);
  const records = from && to ? await db.records.findActive() : null;
  return {
    source, // "lesson_plan" = có trong PPCT; "keyword_fallback" = chỉ đoán theo từ khóa
    lesson,
    equipment: equipment.map((eq) => ({ ...brief(eq), ...(records ? availabilityOf(eq, from, to, records) : {}) })),
    note: equipment.length ? undefined : "Không tìm thấy bài học hoặc thiết bị phù hợp trong danh mục.",
  };
}

// ---------- Nội quy (tra cứu đơn giản) ----------

export function searchRules(query = "", limit = 2) {
  const rules = readCatalog("rules.json");
  const qt = tokens(query);
  // Nội dung điều khoản quan trọng hơn tiêu đề nên được chấm điểm cao hơn
  const scored = rules
    .map((r) => ({ r, score: qt.length ? scoreMatch(qt, { name: r.text.join(" "), keywords: r.title }) : 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ title: x.r.title, rules: x.r.text }));
  return scored.length ? scored : rules.map((r) => ({ title: r.title, rules: r.text })); // không khớp: trả toàn bộ (nội quy ngắn)
}
