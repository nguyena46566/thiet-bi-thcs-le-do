/**
 * Dữ liệu mẫu đầy đủ để chạy thử và trình chiếu, dùng được cả trên web đang chạy thật (chỉ quản trị hệ thống).
 * Trước khi tạo: chụp lại toàn bộ dữ liệu hiện có; “Xóa dữ liệu mẫu” đưa web về đúng trạng thái đó.
 * Dữ liệu sinh qua các hàm nghiệp vụ (ghi tăng, trả có hỏng/mất, kiểm kê, bảo trì, ghi giảm) để kho, nhật ký, điểm thi đua khớp nhau.
 */
import crypto from "crypto";
import zlib from "zlib";
import db, { newId } from "./database.js";
import { SUBJECTS } from "./chatTools.js";
import { formatDate, todayVN, slotLabel } from "./equipment.js";
import { refreshCache, equipmentCol, createEquipment, createPurchase, processReturn, adjustPoints } from "./inventory.js";
import { startAudit, saveAuditCounts, finishAudit, createMaintenance, completeMaintenance, createDisposal, requestDisposal } from "./operations.js";
import { reloadUsers, testAccountsEnabled } from "./users.js";
import { DOC_TABLES } from "./database.js";
import { PRIVACY_VERSION } from "./privacy.js";

const settings = () => db.collection("settings");
const hashPw = (pw) => { const salt = crypto.randomBytes(16).toString("hex"); return `${salt}:${crypto.scryptSync(pw, salt, 32).toString("hex")}`; };
const randomPw = () => { const A = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from(crypto.randomBytes(12), (b) => A[b % A.length]).join("") + "9a"; };
/** Mã của mọi bản ghi hiện có, theo từng bảng: dùng để biết dữ liệu mẫu đã thêm những bản ghi nào */
async function snapshotIds() {
  const out = {};
  for (const t of DOC_TABLES) if (t !== "settings") out[t] = new Set((await db.collection(t).all()).map((d) => d.id));
  out.__records = new Set((await db.records.findAll()).map((d) => d.id));
  out.__notifications = new Set((await db.notifications.list({ limit: 5000 })).map((d) => d.id));
  return out;
}
/** Tài khoản có sẵn vai trò để thử từng chức năng mà không phải tự gán quyền */
const ROLE_ACCOUNTS = [
  ["tb.mau", "Nhân viên thiết bị (mẫu)", ["equipment"], "", "Nhân viên thiết bị"],
  ["tv.mau", "Nhân viên thư viện (mẫu)", ["librarian"], "", "Nhân viên thư viện"],
  ["bgh.mau", "Phó hiệu trưởng (mẫu)", ["principal"], "", "Ban giám hiệu"],
  ["tt.mau", "Tổ trưởng KHTN (mẫu)", ["head", "teacher"], "Tổ Khoa học tự nhiên", "Tổ trưởng Khoa học tự nhiên"],
];
const DEMO_USERNAMES = ["tb.mau", "tv.mau", "bgh.mau", "tt.mau", "gv.hong", "gv.nam", "gv.mai", "gv.ducanh", "gv.lan", "gv.tuan", "gv.ha", "gv.long", "gv.thu", "gv.hung", "gv.ngoc", "gv.binh", "tranthibich", "gv.nghi"];
// Bộ sinh số ngẫu nhiên có hạt giống: mỗi lần tạo ra cùng một bộ dữ liệu
let seed = 20262027;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const iso = (d) => d.toLocaleDateString("sv-SE");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekday = (d) => { let x = new Date(d); while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1); return x; };
const at = (d, h = 8) => { const x = new Date(d); x.setHours(h, Math.floor(rnd() * 50), 0, 0); return x.toISOString(); };

const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đỗ", "Bùi", "Ngô", "Đặng", "Lý", "Phan", "Trịnh", "Lưu", "Mai", "Đinh"];
const DEM = ["Văn", "Thị", "Minh", "Gia", "Ngọc", "Đức", "Thu", "Bảo", "Quang", "Khánh", "Hải", "Thanh"];
const TEN = ["An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Hải", "Hương", "Khoa", "Linh", "Long", "Mai", "Nam", "Ngân", "Phúc", "Quân", "Thảo", "Trang", "Tuấn", "Vy", "Yến", "Huy", "My", "Nhi", "Đạt", "Hiếu", "Kiên", "Lâm", "Ánh", "Tâm"];
const CLASSES = [6, 7, 8, 9].flatMap((g) => [1, 2, 3, 4].map((n) => `${g}A${n}`));
const TEACHERS = [
  ["gv.hong", "Nguyễn Thị Hồng", "hoa-hoc", "Giáo viên Hóa học"], ["gv.nam", "Trần Văn Nam", "vat-li", "Giáo viên Vật lí"],
  ["gv.mai", "Lê Thị Mai", "sinh-hoc", "Giáo viên Sinh học"], ["gv.ducanh", "Phạm Đức Anh", "cong-nghe", "Giáo viên Công nghệ"],
  ["gv.lan", "Hoàng Thị Lan", "toan-hoc", "Tổ trưởng Toán – Tin"], ["gv.tuan", "Vũ Minh Tuấn", "toan-hoc", "Giáo viên Toán"],
  ["gv.ha", "Đỗ Thị Hà", "ngu-van-gdcd", "Giáo viên Ngữ văn"], ["gv.long", "Bùi Văn Long", "lich-su-dia-li", "Giáo viên Lịch sử – Địa lí"],
  ["gv.thu", "Ngô Thị Thu", "tieng-anh", "Giáo viên Tiếng Anh"], ["gv.hung", "Đặng Văn Hùng", "gdtc", "Giáo viên GDTC"],
  ["gv.ngoc", "Lý Thị Ngọc", "ngu-van-gdcd", "Giáo viên GDCD"], ["gv.binh", "Phan Thanh Bình", "vat-li", "Giáo viên Vật lí"],
];
const LESSONS = {
  "hoa-hoc": ["Bài 5: Oxygen và không khí", "Bài 9: Acid", "Bài 12: Base", "Bài 15: Muối"], "vat-li": ["Bài 7: Đo tốc độ", "Bài 13: Áp suất chất lỏng", "Bài 18: Lực đẩy Archimedes", "Bài 22: Mạch điện đơn giản"],
  "sinh-hoc": ["Bài 17: Tế bào", "Bài 24: Quang hợp", "Bài 30: Hệ tiêu hóa"], "cong-nghe": ["Bài 4: Đồ dùng điện", "Bài 8: Vẽ kĩ thuật", "Bài 11: Mạch điện điều khiển"],
  "toan-hoc": ["Bài 8: Hình học trực quan", "Bài 20: Xác suất thực nghiệm", "Bài 25: Đo chiều cao ngoài trời"], "ngu-van-gdcd": ["Bài 3: Truyện truyền thuyết", "Bài 6: Văn bản nghị luận", "Chủ đề: Tự lập"],
  "lich-su-dia-li": ["Bài 4: Lược đồ thế giới cổ đại", "Bài 10: Bản đồ địa hình", "Bài 15: Khí hậu Việt Nam"], "gdtc": ["Chạy cự li ngắn", "Nhảy xa", "Bóng rổ"], "tieng-anh": ["Unit 3: Listening", "Unit 5: Speaking", "Unit 8: Project"],
};
const SLOTS = ["S1", "S2", "S3", "S4", "S5", "C1", "C2", "C3"];

export async function seedDemo(opts = {}) {
  if (await settings().get("demoManifest")) return { error: "Đã có dữ liệu mẫu. Xóa dữ liệu mẫu trước khi tạo lại.", status: 409 };
  const existing = new Set((await db.collection("users").all()).flatMap((u) => [u.username, u.id]));
  const clash = DEMO_USERNAMES.find((u) => existing.has(u) || existing.has(`pw-${u}`));
  if (clash) return { error: `Đã có tài khoản “${clash}” nên không tạo được tài khoản giáo viên mẫu. Đổi tên tài khoản đó rồi tạo lại.`, status: 409 };
  // 1. Ghi nhớ mã các bản ghi đang có; sau khi tạo, phần mới thêm chính là dữ liệu mẫu (xóa dữ liệu mẫu chỉ xóa đúng phần này)
  const before = await snapshotIds();
  const schoolBefore = !!(await settings().get("school"));
  const common = testAccountsEnabled() && !opts.randomPasswords; // chế độ thử nghiệm: mật khẩu chung Test@2026; còn lại: mỗi tài khoản một mật khẩu ngẫu nhiên
  const passwords = {};
  const pwOf = (u) => { const p = common ? "Test@2026" : randomPw(); if (!common) passwords[u] = p; return p; };
  seed = 20262027;
  const T = todayVN(), now = new Date().toISOString(), start = new Date(T.getFullYear() - (T.getMonth() >= 8 ? 0 : 1), 8, 7);
  const admin = { name: "Nhân viên thiết bị (thử nghiệm)" }, bgh = { name: "Hiệu trưởng (thử nghiệm)" };
  const count = {};
  const inc = (k, n = 1) => { count[k] = (count[k] || 0) + n; };

  // 2. Tài khoản giáo viên mẫu (đăng nhập bằng mật khẩu Test@2026)
  const users = db.collection("users");
  const consent = { version: PRIVACY_VERSION, at: now };
  for (const [u, name, subj, pos] of TEACHERS) {
    const roles = u === "gv.lan" ? ["teacher", "head"] : ["teacher"];
    await users.insert({ id: `pw-${u}`, username: u, name, email: "", phone: `09${Math.floor(10000000 + rnd() * 89999999)}`, position: pos, roles, group: u === "gv.lan" ? "Tổ Toán – Tin" : "", status: "active", authType: "password", test: common, demo: true,
      passwordHash: hashPw(pwOf(u)), consent, createdAt: at(start), approvedBy: "Quản trị hệ thống (thử nghiệm)", lastLoginAt: at(addDays(T, -1), 7), subjectHint: subj });
  }
  // Tài khoản theo vai trò (nhân viên thiết bị, thủ thư, Ban giám hiệu, tổ trưởng): có sẵn để thử, xóa dữ liệu mẫu là xóa luôn
  for (const [u, name, roles, group, pos] of ROLE_ACCOUNTS) {
    await users.insert({ id: `pw-${u}`, username: u, name, email: "", phone: "", position: pos, roles, group, status: "active", authType: "password", test: common, demo: true,
      passwordHash: hashPw(pwOf(u)), consent, createdAt: at(start), approvedBy: "Quản trị hệ thống (thử nghiệm)", lastLoginAt: null });
  }
  await users.insert({ id: "pw-tranthibich", username: "tranthibich", name: "Trần Thị Bích", email: "bich@thcsledo.edu.vn", roles: [], requestedRoles: ["teacher"], status: "pending", authType: "password", test: common, demo: true, passwordHash: hashPw(randomPw()), createdAt: at(addDays(T, -1), 15) });
  await users.insert({ id: "pw-gv.nghi", username: "gv.nghi", name: "Lưu Văn Nghị (đã chuyển trường)", roles: ["teacher"], status: "locked", authType: "password", test: common, demo: true, passwordHash: hashPw(randomPw()), createdAt: at(start) });
  inc("Tài khoản giáo viên", TEACHERS.length + 2);
  await reloadUsers();

  // 3. Thiết bị: đơn giá, năm sử dụng; thêm hóa chất, vật tư, thiết bị giá trị cao
  // Không sửa thiết bị thật: tạo bộ thiết bị mẫu riêng (tên có "(mẫu)"), mỗi môn tối đa 6 loại lấy từ danh mục hiện có
  {
    const perSubject = {};
    let n = 0;
    for (const e of (await refreshCache()).filter((x) => !x.demo && (x.kind || "Thiết bị") === "Thiết bị")) {
      if ((perSubject[e.subjectId] = (perSubject[e.subjectId] || 0) + 1) > 6) continue;
      const raw = await equipmentCol().get(e.id);
      await equipmentCol().insert({ ...raw, id: `mau-${e.id}`.slice(0, 80), name: `${raw.name} (mẫu)`, qtyGood: 4 + (n % 7), qtyBroken: 0, qtyRepair: 0, qtyLostPending: 0, qtyLost: 0, qtyDisposed: 0, qtyConsumed: 0,
        unitPrice: (30 + Math.floor(rnd() * 40)) * 5000, yearInUse: pick([2021, 2022, 2023, 2024]), origin: pick(["Việt Nam", "Việt Nam", "Trung Quốc"]), demo: true, createdAt: now, updatedAt: now });
      n++;
    }
    inc("Thiết bị mẫu (bản sao)", n);
    await refreshCache();
  }
  const extra = [
    { name: "Dung dịch HCl 1M", subjectId: "hoa-hoc", kind: "Hóa chất", unit: "Lọ", qtyGood: 6, unitPrice: 35000, expiry: formatDate(addDays(T, 20)), hazard: "Ăn mòn", concentration: "1M", minStock: 3, location: "Tủ hóa chất T1" },
    { name: "Dung dịch NaOH 1M", subjectId: "hoa-hoc", kind: "Hóa chất", unit: "Lọ", qtyGood: 8, unitPrice: 30000, expiry: formatDate(addDays(T, 300)), hazard: "Ăn mòn", concentration: "1M", minStock: 3, location: "Tủ hóa chất T1" },
    { name: "Copper sulfate (CuSO4) rắn", subjectId: "hoa-hoc", kind: "Hóa chất", unit: "Hộp", qtyGood: 2, unitPrice: 60000, expiry: formatDate(addDays(T, -15)), hazard: "Độc", minStock: 1, location: "Tủ hóa chất T2" },
    { name: "Cồn đốt", subjectId: "hoa-hoc", kind: "Hóa chất", unit: "Lít", qtyGood: 2, unitPrice: 45000, expiry: formatDate(addDays(T, 400)), hazard: "Dễ cháy", minStock: 4, location: "Tủ hóa chất T2" },
    { name: "Giấy lọc (hộp 100 tờ)", subjectId: "hoa-hoc", kind: "Vật tư tiêu hao", unit: "Hộp", qtyGood: 10, unitPrice: 40000, minStock: 3, location: "Phòng chuẩn bị KHTN" },
    { name: "Máy chiếu vật thể", subjectId: "vat-li", qtyGood: 2, unitPrice: 8500000, highValue: true, unit: "Chiếc", origin: "Nhật Bản", yearInUse: 2024, location: "Tủ khóa phòng thiết bị" },
    { name: "Bộ thu nhận số liệu và cảm biến", subjectId: "vat-li", qtyGood: 1, unitPrice: 12000000, highValue: true, unit: "Bộ", origin: "Việt Nam", yearInUse: 2025, location: "Tủ khóa phòng thiết bị" },
  ];
  const extraIds = {};
  for (const x of extra) { const r = await createEquipment({ ...x, name: `${x.name} (mẫu)` }, admin); extraIds[x.name] = r.value.id; await equipmentCol().update(r.value.id, { demo: true }); }
  inc("Thiết bị, hóa chất thêm", extra.length);
  const demoInv = async () => (await refreshCache()).filter((e) => e.demo); // chỉ dùng thiết bị mẫu
  let inv = await demoInv();
  const bySubj = (sid, min = 3) => inv.filter((e) => e.subjectId === sid && e.qtyGood >= min && (e.kind || "Thiết bị") === "Thiết bị");

  // 4. Ghi tăng
  await createPurchase({ date: formatDate(addDays(start, 10)), supplier: "Công ty CP Sách – Thiết bị Thanh Hóa", invoiceNo: "HĐ 0012345", fundSource: "Ngân sách",
    items: bySubj("vat-li").slice(0, 2).concat(bySubj("hoa-hoc").slice(0, 1)).map((e) => ({ equipmentId: e.id, quantity: 2, unitPrice: e.unitPrice })) }, admin);
  await createPurchase({ date: formatDate(addDays(start, 38)), supplier: "Hội cha mẹ học sinh", invoiceNo: "Biên bản tài trợ 03", fundSource: "Xã hội hóa",
    items: bySubj("toan-hoc").slice(0, 2).map((e) => ({ equipmentId: e.id, quantity: 3, unitPrice: e.unitPrice })) }, admin);
  inc("Phiếu ghi tăng", 2);

  // 5. Phòng học bộ môn
  const roomCol = db.collection("rooms");
  const rooms = [
    { name: "Phòng KHTN 1", kind: "Phòng học bộ môn", subjectIds: ["vat-li", "hoa-hoc", "sinh-hoc"], note: "Tầng 2 nhà B" },
    { name: "Phòng Công nghệ", kind: "Phòng học bộ môn", subjectIds: ["cong-nghe"], note: "" },
    { name: "Phòng Tin học", kind: "Phòng Tin học", subjectIds: ["toan-hoc"], note: "23 máy học sinh" },
    { name: "Phòng Ngoại ngữ", kind: "Phòng học bộ môn", subjectIds: ["tieng-anh"], note: "" },
    { name: "Phòng đa năng", kind: "Phòng đa chức năng", subjectIds: [], note: "Dùng chung" },
  ].map((r) => ({ id: newId(), ...r, name: `${r.name} (mẫu)`, combined: r.subjectIds.length > 1, createdAt: now, demo: true }));
  for (const r of rooms) await roomCol.insert(r);
  inc("Phòng học bộ môn", rooms.length);

  // 6. Phiếu mượn thiết bị: đã trả, đang mượn, quá hạn, chờ duyệt, từ chối
  inv = await demoInv();
  let seq = (await db.records.findAll()).length;
  const sy = `${start.getFullYear()}-${start.getFullYear() + 1}`;
  const teacherOf = (sid) => TEACHERS.filter((t) => t[2] === sid);
  const makeRecord = async (o) => {
    const subj = SUBJECTS.find((s) => s.id === o.subjectId), t = o.teacher || pick(teacherOf(o.subjectId).length ? teacherOf(o.subjectId) : TEACHERS);
    const items = o.items || bySubj(o.subjectId).sort(() => rnd() - 0.5).slice(0, 1 + Math.floor(rnd() * 2)).map((e) => ({ equipmentId: e.id, quantity: 1 + Math.floor(rnd() * 2) }));
    if (!items.length) return null;
    const text = items.map((it) => `${inv.find((e) => e.id === it.equipmentId)?.name} (${it.quantity})`).join(", ");
    const slot = o.slot || pick(SLOTS), room = o.room === undefined ? (["vat-li", "hoa-hoc", "sinh-hoc"].includes(o.subjectId) && rnd() < 0.5 ? rooms[0] : null) : o.room;
    seq++;
    const r = {
      id: newId(), code: `PM${sy.slice(2, 4)}${sy.slice(7, 9)}-${String(seq).padStart(4, "0")}`, group: subj.group, lessonName: pick(LESSONS[o.subjectId] || ["Bài học"]), usageType: rnd() < 0.6 ? "Thực hành" : "Biểu diễn",
      periods: [slot], subjectId: subj.id, subjectName: subj.name, teacherName: t[1], className: o.className || pick(CLASSES), equipment: text, items, quantity: items.reduce((a, it) => a + it.quantity, 0),
      borrowDate: formatDate(o.from), returnDate: formatDate(o.to || o.from), notes: "", period: slotLabel([slot]), periodPPCT: `Tiết ${5 + Math.floor(rnd() * 40)}`, status: o.status,
      userId: `pw-${t[0]}`, userName: t[1], userEmail: "", createdByAdmin: false, createdAt: at(addDays(o.from, -2), 14), demo: true,
      ...(room && { roomId: room.id, roomName: room.name }), ...(o.extra || {}),
    };
    if (["Mượn", "Trả"].includes(o.status)) Object.assign(r, { approvedAt: at(addDays(o.from, -1), 9), approvedBy: admin.name });
    if (o.status === "Trả") Object.assign(r, { returnedAt: at(o.to || o.from, 11) });
    if (o.status === "Từ chối") r.adminNote = o.reason || "Thiết bị đã được đăng ký hết vào tiết này";
    await db.records.create(r);
    inc(`Phiếu mượn – ${o.status}`);
    return r;
  };
  // Đã trả (từ đầu năm học tới 3 ngày trước)
  for (let d = weekday(start); d < addDays(T, -3); d = weekday(addDays(d, 2 + Math.floor(rnd() * 2)))) await makeRecord({ subjectId: pick(SUBJECTS).id, from: d, status: "Trả" });
  // Quá hạn chưa trả
  await makeRecord({ subjectId: "vat-li", from: weekday(addDays(T, -6)), status: "Mượn", teacher: TEACHERS[1] });
  await makeRecord({ subjectId: "sinh-hoc", from: weekday(addDays(T, -4)), status: "Mượn", teacher: TEACHERS[2] });
  // Hôm nay: một phiếu trả có hỏng, một phiếu trả thiếu (mất) → báo mất chờ Ban giám hiệu xác nhận
  const today = weekday(T);
  const rDam = await makeRecord({ subjectId: "vat-li", from: today, status: "Mượn", teacher: TEACHERS[11] });
  const rLost = await makeRecord({ subjectId: "hoa-hoc", from: today, status: "Mượn", teacher: TEACHERS[0], items: bySubj("hoa-hoc", 4).slice(0, 1).map((e) => ({ equipmentId: e.id, quantity: 3 })) });
  for (const [r, dmg, lost, note] of [[rDam, 1, 0, "Rơi vỡ khi học sinh thực hành"], [rLost, 0, 1, "Kiểm đếm cuối tiết thiếu 1"]]) {
    if (!r) continue;
    const it = r.items[0];
    const res = await processReturn(r, { items: [{ equipmentId: it.equipmentId, damaged: dmg, lost }], note }, admin);
    if (res.value) await db.records.update(r.id, { status: "Trả", returnedAt: new Date().toISOString(), ...res.value });
  }
  // Trả trễ (để có điểm trừ thi đua)
  const late = await makeRecord({ subjectId: "toan-hoc", from: weekday(addDays(T, -9)), status: "Mượn", teacher: TEACHERS[5] });
  if (late) { const res = await processReturn(late, { items: [], note: "Trả trễ" }, admin); if (res.value) await db.records.update(late.id, { status: "Trả", returnedAt: new Date().toISOString(), ...res.value }); }
  // Đang mượn trong ngày
  for (let i = 0; i < 4; i++) await makeRecord({ subjectId: pick(["vat-li", "hoa-hoc", "toan-hoc", "tieng-anh", "lich-su-dia-li"]), from: today, slot: SLOTS[i], status: "Mượn" });
  // Chờ duyệt (sắp tới) và một phiếu thiết bị giá trị cao mượn nhiều ngày
  for (let i = 2; i <= 16; i += 2) await makeRecord({ subjectId: pick(SUBJECTS).id, from: weekday(addDays(T, i)), status: "Chờ duyệt" });
  await makeRecord({ subjectId: "vat-li", from: weekday(addDays(T, 3)), to: weekday(addDays(T, 5)), status: "Chờ duyệt", teacher: TEACHERS[1],
    items: [{ equipmentId: extraIds["Máy chiếu vật thể"], quantity: 1 }], extra: { needsSpecialApproval: true, specialReason: "Mượn nhiều ngày thiết bị giá trị cao: Máy chiếu vật thể" } });
  await makeRecord({ subjectId: "hoa-hoc", from: weekday(addDays(T, -12)), status: "Từ chối", reason: "Trùng tiết với lớp 9A1 đã đăng ký trước" });
  await makeRecord({ subjectId: "gdtc", from: weekday(addDays(T, 1)), status: "Từ chối", reason: "Đăng ký chưa đủ 24 giờ" });
  await adjustPoints({ userId: "pw-gv.hong", teacherName: "Nguyễn Thị Hồng", points: 5, reason: "Tự làm bộ đồ dùng dạy học Hóa 8" }, bgh);

  // 7. Kiểm kê (một đợt hoàn tất, có chênh lệch), bảo trì, ghi giảm, xuất dùng hóa chất
  const a1 = await startAudit(admin, { subjectId: "vat-li", title: "[MẪU] Kiểm kê đầu năm học – Vật lí", equipmentIds: inv.filter((e) => e.subjectId === "vat-li").map((e) => e.id) });
  if (a1.value) {
    await saveAuditCounts(a1.value.id, { items: a1.value.items.map((i, k) => ({ equipmentId: i.equipmentId, countGood: k === 2 ? Math.max(0, i.sysGood - 1) : i.sysGood, countBroken: i.sysBroken, note: k === 2 ? "Thiếu 1, chưa rõ nguyên nhân" : "" })) });
    await finishAudit(a1.value.id, admin);
    await db.collection("audits").update(a1.value.id, { demo: true });
    inc("Đợt kiểm kê");
  }
  const mVL = bySubj("vat-li", 3)[3], mHH = bySubj("hoa-hoc", 3)[2];
  if (mVL) { const m = await createMaintenance({ equipmentId: mVL.id, quantity: 1, source: "good", kind: "Sửa chữa", content: "Hỏng lò xo, gãy móc treo", vendor: "Cửa hàng thiết bị Trường Thi", date: formatDate(addDays(T, -20)) }, admin); if (m.value) await completeMaintenance(m.value.id, { repaired: 1, disposed: 0, cost: 120000, note: "Thay lò xo mới" }, admin); inc("Bảo trì"); }
  if (mHH) { await createMaintenance({ equipmentId: mHH.id, quantity: 1, source: "good", kind: "Bảo dưỡng", content: "Vệ sinh, hiệu chỉnh", vendor: "", date: formatDate(addDays(T, -2)) }, admin); inc("Bảo trì"); }
  const dEq = bySubj("cong-nghe", 3)[0];
  const dEq2 = bySubj("vat-li", 3)[4];
  if (dEq2) { await equipmentCol().update(dEq2.id, { qtyBroken: (dEq2.qtyBroken || 0) + 2 }); await refreshCache(); const rq = await requestDisposal({ equipmentId: dEq2.id, quantity: 2, source: "broken", reason: "Hư hỏng không sửa được", note: "Gãy, không còn linh kiện thay thế" }, admin); if (rq.value) { await db.collection("disposals").update(rq.value.id, { demo: true }); inc("Đề nghị thanh lý chờ Ban giám hiệu duyệt"); } }
  if (dEq) { await createDisposal({ equipmentId: dEq.id, quantity: 1, source: "good", reason: "Hư hỏng không sửa được", decisionNo: "18/QĐ-THCSLĐ", date: formatDate(addDays(T, -25)), note: "Theo biên bản kiểm tra hư hỏng" }, admin); inc("Ghi giảm"); }
  const cons = db.collection("consumptions");
  for (const [n, q, who, pur, d] of [["Dung dịch HCl 1M", 2, "Nguyễn Thị Hồng", "Lớp 8A1 – Bài 9: Acid", -10], ["Giấy lọc (hộp 100 tờ)", 1, "Nguyễn Thị Hồng", "Lớp 6A2 – Tách chất", -5], ["Cồn đốt", 1, "Lê Thị Mai", "Lớp 7A3 – Quang hợp", -3]]) {
    const id = extraIds[n]; const e = (await refreshCache()).find((x) => x.id === id);
    await equipmentCol().update(id, { qtyGood: e.qtyGood - q, qtyConsumed: (e.qtyConsumed || 0) + q });
    await cons.insert({ id: newId(), equipmentId: id, name: n, unit: e.unit, quantity: q, receiver: who, purpose: pur, date: formatDate(addDays(T, d)), createdBy: admin.name, createdAt: at(addDays(T, d), 7), demo: true });
  }
  inc("Phiếu xuất dùng", 3);

  // 8. Đề xuất mua sắm
  const props = db.collection("proposals");
  for (const [t, purpose, items, status] of [
    [TEACHERS[0], "Bổ sung dụng cụ thực hành KHTN 8", [{ name: "Bộ dụng cụ thí nghiệm áp suất chất lỏng", subjectId: "vat-li", quantity: 4, estPrice: 450000, reason: "Chỉ có 3/7 bộ theo danh mục" }], "Chờ duyệt"],
    [TEACHERS[8], "Thiết bị âm thanh cho phòng Ngoại ngữ", [{ name: "Thiết bị âm thanh đa năng di động", subjectId: "tieng-anh", quantity: 2, estPrice: 3200000, reason: "Loa cũ hỏng" }], "Đã duyệt"],
    [TEACHERS[4], "Phần mềm và mô hình Toán", [{ name: "Bộ hình học trực quan (hình chóp)", subjectId: "toan-hoc", quantity: 8, estPrice: 250000, reason: "Lớp 8 thiếu" }], "Chờ duyệt"],
    [TEACHERS[9], "Bóng rổ thay thế", [{ name: "Quả bóng rổ size 7", subjectId: "gdtc", quantity: 10, estPrice: 280000, reason: "Bóng mòn, xì hơi" }], "Từ chối"],
  ]) {
    await props.insert({ id: newId(), status, items: items.map((i) => ({ ...i, equipmentId: null })), total: items.reduce((a, i) => a + i.quantity * i.estPrice, 0), purpose, userId: `pw-${t[0]}`, userName: t[1], createdAt: at(addDays(T, -8 + Math.floor(rnd() * 6)), 16), demo: true,
      ...(status !== "Chờ duyệt" && { decidedBy: bgh.name, decidedAt: at(addDays(T, -1), 10), decisionNote: status === "Từ chối" ? "Để sang học kỳ II" : "Đồng ý, mua trong tháng" }) });
  }
  inc("Đề xuất mua sắm", 4);
  { const first = (await props.all()).find((p) => p.demo && p.status === "Chờ duyệt" && p.items.some((i) => i.subjectId === "vat-li"));
    if (first) { await props.update(first.id, { headReviews: [{ group: "Tổ Khoa học tự nhiên", by: "Tổ trưởng KHTN (thử nghiệm)", userId: "pw-totruong", opinion: "Đồng ý", note: "Tổ đang thiếu 4/7 bộ theo danh mục", at: now }] }); inc("Ý kiến tổ trưởng về đề xuất"); } }

  // 9. Kế hoạch năm học (đã duyệt) và quyết định
  const y0 = start.getFullYear(), y1 = y0 + 1;
  const tasks = [["Kiểm kê đầu năm", `${y0}-08-17`, `${y0}-08-28`, "Tổ kiểm kê", true], ["Lập kế hoạch, tổng hợp đề xuất của các tổ", `${y0}-08-24`, `${y0}-09-04`, "Nhân viên thiết bị", true], ["Hiệu trưởng duyệt kế hoạch", `${y0}-09-05`, `${y0}-09-05`, "Hiệu trưởng", true],
    ["Xếp lịch phòng học bộ môn theo thời khóa biểu", `${y0}-09-07`, `${y0}-09-18`, "Tổ trưởng chuyên môn", true], ["Mua sắm, bổ sung thiết bị", `${y0}-10-05`, `${y0}-12-18`, "Nhân viên thiết bị", false],
    ["Kiểm tra, kiểm kê học kỳ I; báo cáo sơ kết", `${y1}-01-04`, `${y1}-01-15`, "Tổ kiểm kê", false], ["Kiểm kê cuối năm", `${y1}-05-17`, `${y1}-05-28`, "Tổ kiểm kê", false], ["Báo cáo tổng kết", `${y1}-06-15`, `${y1}-06-15`, "Nhân viên thiết bị", false]]
    .map(([name, s, e, owner, done]) => ({ id: newId(), name, start: s, end: e, owner, done }));
  await db.collection("plans").insert({ id: newId(), schoolYear: sy, title: `[MẪU] Kế hoạch quản lý, sử dụng thiết bị, đồ dùng dạy học năm học ${y0} – ${y1}`, number: "25/KH-THCSLĐ", status: "Đã duyệt", tasks,
    sections: { canCu: "Công văn hướng dẫn nhiệm vụ năm học của Sở GD&ĐT; Thông tư 14/2020/TT-BGDĐT; Thông tư 38/2021/TT-BGDĐT (sửa đổi bởi Thông tư 26/2023/TT-BGDĐT); kế hoạch giáo dục nhà trường.", thuanLoi: "Nhà trường có phòng KHTN, phòng Tin học, phòng Ngoại ngữ; thiết bị được quản lý trên website, giáo viên đăng ký mượn theo tiết.", khoKhan: "Một số thiết bị lớp 8, 9 còn thiếu so với danh mục tối thiểu; phòng KHTN dùng ghép cho 3 phân môn.", mucTieu: "Sử dụng có hiệu quả thiết bị hiện có, bổ sung thiết bị còn thiếu.", yeuCau: "Giáo viên đăng ký trước 24 giờ, trả đúng hạn, ghi đầy đủ sổ nhật ký phòng bộ môn.", chiTieu: "100% tiết thực hành có thiết bị; trả đúng hạn ≥ 95%; mức đáp ứng danh mục tối thiểu tăng 10%.", chiDao: "Phó hiệu trưởng phụ trách cơ sở vật chất kiểm tra định kỳ hằng tháng.", canBoThietBi: "Cập nhật kịp thời sổ sách trên website; báo cáo hằng tháng.", kinhPhi: "Ngân sách 45.000.000 đ; xã hội hóa 10.000.000 đ." },
    createdBy: admin.name, createdAt: at(addDays(start, -14)), submittedAt: at(addDays(start, -3)), decidedBy: bgh.name, decidedAt: at(addDays(start, -2)), decisionNote: "Đồng ý", demo: true });
  const dec = db.collection("decisions");
  await dec.insert({ id: newId(), type: "Tổ kiểm kê", number: "12/QĐ-THCSLĐ", date: iso(addDays(start, -25)), scope: "[MẪU] Toàn bộ thiết bị dạy học, thư viện", from: `${y0}-08-17`, to: `${y0}-08-28`, duties: "Kiểm kê toàn bộ thiết bị dạy học, hóa chất, vật tư; đánh giá chất lượng; lập biên bản.", members: [{ name: "Hiệu trưởng (thử nghiệm)", position: "Hiệu trưởng", duty: "Tổ trưởng" }, { name: "Nhân viên thiết bị (thử nghiệm)", position: "Nhân viên thiết bị", duty: "Thư ký" }, { name: "Hoàng Thị Lan", position: "Tổ trưởng Toán – Tin", duty: "Thành viên" }, { name: "Nguyễn Thị Hồng", position: "Giáo viên Hóa học", duty: "Thành viên" }], createdBy: admin.name, createdAt: at(addDays(start, -25)), demo: true });
  await dec.insert({ id: newId(), type: "Hội đồng thanh lý", number: "18/QĐ-THCSLĐ", date: iso(addDays(T, -26)), scope: "[MẪU] Thiết bị hư hỏng không sửa được", from: iso(addDays(T, -26)), to: iso(addDays(T, -24)), duties: "Kiểm tra thực tế thiết bị đề nghị thanh lý; lập biên bản.", members: [{ name: "Hiệu trưởng (thử nghiệm)", position: "Hiệu trưởng", duty: "Chủ tịch" }, { name: "Nhân viên thiết bị (thử nghiệm)", position: "Nhân viên thiết bị", duty: "Thư ký" }, { name: "Phạm Đức Anh", position: "Giáo viên Công nghệ", duty: "Thành viên" }], createdBy: admin.name, createdAt: at(addDays(T, -26)), demo: true });
  inc("Kế hoạch năm học"); inc("Quyết định", 2);

  // 10. Danh mục tối thiểu: khai báo số giáo viên, số lớp, liên kết một phần thiết bị
  const schoolDoc = { teachers: { "Toán": 6, "Ngữ văn": 6, "Ngoại ngữ": 4, "Khoa học tự nhiên": 5, "Lịch sử và Địa lí": 4, "Giáo dục công dân": 2, "Công nghệ": 2, "Tin học": 2, "Giáo dục thể chất": 3, "Âm nhạc": 1, "Mĩ thuật": 1, "Hoạt động trải nghiệm, hướng nghiệp": 16 }, rooms: { "Khoa học tự nhiên": 1, "Công nghệ": 1, "Tin học": 1, "Mĩ thuật": 1, "Ngoại ngữ": 1 }, classes: { 6: 4, 7: 4, 8: 4, 9: 4 }, hsPerRoom: 42 };
  if (!schoolBefore) await settings().insert({ id: "school", ...schoolDoc }); // đã có số liệu thật thì giữ nguyên
  inv = await demoInv();
  const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
  const ml = db.collection("minlist");
  const MAP = { "Toán": "toan-hoc", "Ngoại ngữ": "tieng-anh", "Ngữ văn": "ngu-van-gdcd", "Lịch sử và Địa lí": "lich-su-dia-li", "Giáo dục thể chất": "gdtc", "Khoa học tự nhiên": ["vat-li", "hoa-hoc", "sinh-hoc"] };
  let links = 0;
  for (const it of await ml.all()) {
    const subs = [].concat(MAP[it.mon] || []);
    if (!subs.length || (it.linkedEquipmentIds || []).length) continue; // dòng đã liên kết thật thì không đụng
    const words = fold(it.name).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const best = inv.filter((e) => subs.includes(e.subjectId)).map((e) => ({ e, s: words.filter((w) => fold(e.name).includes(w)).length })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 2) { await ml.update(it.id, { linkedEquipmentIds: [best.e.id] }); links++; }
  }
  inc("Dòng danh mục tối thiểu được liên kết", links);

  // 11. Thư viện: kệ, nhập sách theo hóa đơn, biên mục
  const shelves = db.collection("shelves");
  const SH = [["K01", "SGK khối 6 – 7"], ["K02", "SGK khối 8 – 9"], ["K03", "Truyện thiếu nhi"], ["K04", "Sách tham khảo"], ["K05", "Nghiệp vụ, báo – tạp chí"]];
  for (const [code, name] of SH) await shelves.insert({ id: newId(), code: `M-${code}`, name, room: "Thư viện", kinds: [], createdAt: now, demo: true });
  const BOOKS = [
    ["SGK", "Toán 6 – tập 1", "Nhiều tác giả", "NXB Giáo dục Việt Nam", "2025", "6", 18000, 30, "K01", "510", "Sách giáo khoa Toán lớp 6"], ["SGK", "Ngữ văn 6 – tập 1", "Nhiều tác giả", "NXB Giáo dục Việt Nam", "2025", "6", 20000, 30, "K01", "807", ""],
    ["SGK", "Khoa học tự nhiên 7", "Nhiều tác giả", "NXB Giáo dục Việt Nam", "2025", "7", 24000, 25, "K01", "500", ""], ["SGK", "Tiếng Anh 7 – Global Success", "Nhiều tác giả", "NXB Giáo dục Việt Nam", "2025", "7", 32000, 25, "K01", "428", ""],
    ["SGK", "Lịch sử và Địa lí 8", "Nhiều tác giả", "NXB Giáo dục Việt Nam", "2025", "8", 26000, 20, "K02", "900", ""], ["SGK", "Toán 9 – tập 1", "Nhiều tác giả", "NXB Giáo dục Việt Nam", "2025", "9", 19000, 20, "K02", "510", ""],
    ["STN", "Dế Mèn phiêu lưu ký", "Tô Hoài", "NXB Kim Đồng", "2024", "", 45000, 6, "K03", "895.9223", "Truyện đồng thoại kể về chuyến phiêu lưu của chú Dế Mèn"], ["STN", "Kính vạn hoa – tập 1", "Nguyễn Nhật Ánh", "NXB Trẻ", "2023", "", 60000, 4, "K03", "895.9223", "Truyện về nhóm bạn học trò"],
    ["STN", "Đất rừng phương Nam", "Đoàn Giỏi", "NXB Kim Đồng", "2022", "", 85000, 3, "K03", "895.9223", "Tiểu thuyết về miền Tây Nam Bộ"], ["STN", "Hoàng tử bé", "Antoine de Saint-Exupéry", "NXB Hội Nhà văn", "2023", "", 55000, 4, "K03", "843", "Truyện triết lý cho thiếu nhi"],
    ["STN", "Truyện cổ tích Việt Nam", "Nguyễn Đổng Chi", "NXB Kim Đồng", "2023", "", 65000, 5, "K03", "398.2", "Tuyển tập truyện cổ tích"], ["STN", "Không gia đình", "Hector Malot", "NXB Văn học", "2022", "", 98000, 2, "K03", "843", ""],
    ["STK", "Bồi dưỡng học sinh giỏi Toán 8", "Vũ Hữu Bình", "NXB Giáo dục Việt Nam", "2024", "8", 75000, 4, "K04", "510.76", ""], ["STK", "Từ điển Anh – Việt", "Viện Ngôn ngữ học", "NXB Đà Nẵng", "2022", "", 150000, 3, "K04", "423", ""],
    ["STK", "Atlat Địa lí Việt Nam", "Nhiều tác giả", "NXB Giáo dục Việt Nam", "2025", "", 42000, 10, "K04", "912.597", ""], ["STK", "Hỏi đáp Khoa học tự nhiên 6", "Nhiều tác giả", "NXB Giáo dục Việt Nam", "2024", "6", 55000, 3, "K04", "500", ""],
    ["SNV", "Hướng dẫn dạy học KHTN 8", "Nhiều tác giả", "NXB Đại học Sư phạm", "2024", "8", 52000, 4, "K05", "507.1", ""], ["SNV", "Tài liệu bồi dưỡng thư viện trường học", "Bộ GD&ĐT", "NXB Giáo dục Việt Nam", "2023", "", 48000, 2, "K05", "027.8", ""],
    ["BTC", "Tạp chí Thiết bị giáo dục số 343", "", "Hiệp hội Thiết bị giáo dục", "2025", "", 30000, 2, "K05", "", ""],
  ];
  const titles = db.collection("booktitles"), copies = db.collection("bookcopies"), receipts = db.collection("bookreceipts");
  const seqK = {};
  const lines1 = [], lines2 = [], allCopies = [];
  for (const [i, [kind, title, author, publisher, year, grade, price, qty, shelf, cls, summary]] of BOOKS.entries()) {
    const tid = newId();
    await titles.insert({ id: tid, title, author, publisher, year, kind, grade, isbn: "", price, classification: cls, callNumber: cls ? `${cls} ${fold(author || title).replace(/[^a-z ]/g, "").trim().split(/\s+/).pop().slice(0, 3).toUpperCase()}` : "", keywords: "", summary, createdAt: at(addDays(start, -10)), demo: true });
    const rid = i < 6 ? "R1" : "R2";
    const codes = [];
    for (let k = 0; k < qty; k++) { seqK[kind] = (seqK[kind] || 0) + 1; const code = `${kind}-M${String(seqK[kind]).padStart(4, "0")}`; codes.push(code); allCopies.push({ code, titleId: tid, price, shelf: `M-${shelf}`, kind, grade }); }
    (rid === "R1" ? lines1 : lines2).push({ id: newId(), title, author, publisher, year, kind, grade, isbn: "", invoiceQty: qty, price, receivedQty: qty, note: "", titleId: tid, codeFrom: codes[0], codeTo: codes[codes.length - 1], diff: 0 });
  }
  const R1 = newId(), R2 = newId();
  const sum = (ls) => ls.reduce((a, l) => a + l.receivedQty * l.price, 0);
  await receipts.insert({ id: R1, status: "Đã nhận đủ", invoiceNo: "CP-2026/015", invoiceDate: iso(addDays(start, -20)), supplier: "Phòng GD&ĐT (cấp phát SGK dùng chung)", source: "Cấp phát", note: "", defaultShelf: "", lines: lines1, invoiceTotal: sum(lines1), receivedTotal: sum(lines1), receivedCopies: lines1.reduce((a, l) => a + l.receivedQty, 0), createdBy: "Nhân viên thư viện (thử nghiệm)", createdAt: at(addDays(start, -20)), receivedBy: "Nhân viên thư viện (thử nghiệm)", receivedAt: at(addDays(start, -19)), demo: true });
  lines2[2].invoiceQty = 4; lines2[2].diff = -1;
  await receipts.insert({ id: R2, status: "Nhận có chênh lệch", invoiceNo: "HĐ 0004521", invoiceDate: iso(addDays(start, 30)), supplier: "Nhà sách Thanh Hóa", source: "Mua sắm", note: "", defaultShelf: "", lines: lines2, invoiceTotal: sum(lines2) + lines2[2].price, receivedTotal: sum(lines2), receivedCopies: lines2.reduce((a, l) => a + l.receivedQty, 0), countNote: "Thiếu 1 cuốn Đất rừng phương Nam, nhà sách hẹn giao bù", createdBy: "Nhân viên thư viện (thử nghiệm)", createdAt: at(addDays(start, 30)), receivedBy: "Nhân viên thư viện (thử nghiệm)", receivedAt: at(addDays(start, 31)), demo: true });
  await receipts.insert({ id: newId(), status: "Chờ kiểm đếm", invoiceNo: "HĐ 0004789", invoiceDate: iso(addDays(T, -1)), supplier: "Nhà sách Thanh Hóa", source: "Mua sắm", note: "", defaultShelf: "M-K03", lines: [
    { id: newId(), title: "Tôi thấy hoa vàng trên cỏ xanh", author: "Nguyễn Nhật Ánh", publisher: "NXB Trẻ", year: "2024", kind: "STN", grade: "", isbn: "", invoiceQty: 3, price: 110000, receivedQty: null, note: "" },
    { id: newId(), title: "Toán 6 – tập 2", author: "Nhiều tác giả", publisher: "NXB Giáo dục Việt Nam", year: "2025", kind: "SGK", grade: "6", isbn: "", invoiceQty: 10, price: 18000, receivedQty: null, note: "" }],
    invoiceTotal: 3 * 110000 + 10 * 18000, createdBy: "Nhân viên thư viện (thử nghiệm)", createdAt: at(addDays(T, -1), 15), demo: true });
  for (const c of allCopies) await copies.insert({ id: c.code, code: c.code, titleId: c.titleId, receiptId: c.code.startsWith("SGK") ? R1 : R2, price: c.price, shelf: c.shelf, status: "Trên giá", createdAt: at(addDays(start, -19)), demo: true });
  inc("Đầu sách", BOOKS.length); inc("Bản sách", allCopies.length);

  // 12. Bạn đọc: 6 học sinh mỗi lớp (16 lớp) + giáo viên
  const readers = db.collection("readers");
  let rn = 0;
  const studentReaders = [];
  for (const c of CLASSES) for (let i = 0; i < 6; i++) {
    const id = `BD-M${String(++rn).padStart(4, "0")}`;
    const r = { id, name: `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`, type: "Học sinh", className: c, grade: Number(c[0]), userId: null, guardianConsent: true, status: "active", note: "", createdAt: at(addDays(start, 3)), createdBy: "Nhân viên thư viện (thử nghiệm)", demo: true };
    await readers.insert(r); studentReaders.push(r);
  }
  const staffReaders = [];
  for (const [u, name] of TEACHERS) { const r = { id: `BD-M${String(++rn).padStart(4, "0")}`, name, type: "Giáo viên", className: "", grade: null, userId: `pw-${u}`, status: "active", createdAt: at(addDays(start, 3)), createdBy: "Nhân viên thư viện (thử nghiệm)", demo: true }; await readers.insert(r); staffReaders.push(r); }
  for (const [uid, name] of [["pw-giaovien", "Giáo viên (thử nghiệm)"], ["pw-totruong", "Tổ trưởng KHTN (thử nghiệm)"]]) { const r = { id: `BD-M${String(++rn).padStart(4, "0")}`, name, type: "Giáo viên", className: "", grade: null, userId: uid, status: "active", createdAt: at(addDays(start, 3)), demo: true }; await readers.insert(r); staffReaders.push(r); }
  inc("Bạn đọc", rn);

  // 13. Lượt mượn sách: đã trả, đang mượn, quá hạn, đọc tại chỗ
  const loans = db.collection("bookloans");
  // Theo quy định mặc định: truyện, tham khảo mượn về; sách giáo khoa theo năm học; nghiệp vụ cho giáo viên; báo – tạp chí đọc tại chỗ
  const borrowable = allCopies.filter((c) => c.kind === "STN" || c.kind === "STK");
  const staffBooks = allCopies.filter((c) => c.kind === "SNV" || c.kind === "STK");
  const busy = new Set();
  const lend = async (reader, copy, loanDay, dueDay, returned, mode = "Mượn về nhà", condition = "Bình thường") => {
    if (busy.has(copy.code)) return;
    const l = { id: newId(), copyCode: copy.code, titleId: copy.titleId, kind: copy.kind, readerId: reader.id, readerName: reader.name, readerType: reader.type, className: reader.className || "", mode,
      loanAt: at(loanDay, 10), loanDate: iso(loanDay), dueDate: iso(dueDay), returnedAt: null, staff: "Nhân viên thư viện (thử nghiệm)", renewals: 0, shelf: copy.shelf, demo: true };
    if (returned) Object.assign(l, { returnedAt: at(returned, 15), returnDate: iso(returned), condition, lateDays: Math.max(0, Math.round((returned - dueDay) / 864e5)), returnedTo: "Nhân viên thư viện (thử nghiệm)" });
    else { busy.add(copy.code); await copies.update(copy.code, { status: "Đang mượn" }); }
    if (returned && condition === "Hỏng") { await copies.update(copy.code, { status: "Hỏng" }); l.compensation = { amount: Math.round(copy.price * 0.3), status: "Chưa xử lý", basis: "Bồi thường 30% giá sách" }; }
    await loans.insert(l); inc("Lượt mượn sách");
  };
  for (let d = weekday(addDays(start, 7)); d < addDays(T, -14); d = weekday(addDays(d, 1))) {
    for (let k = 0; k < 2; k++) { const r = pick(studentReaders), c = pick(borrowable); const due = addDays(d, 7); await lend(r, c, d, due, addDays(d, 5 + Math.floor(rnd() * 12)), "Mượn về nhà", rnd() < 0.04 ? "Hỏng" : "Bình thường"); }
    if (rnd() < 0.3) await lend(pick(staffReaders), pick(staffBooks), d, addDays(d, 30), addDays(d, 20));
    if (rnd() < 0.25) await lend(pick(studentReaders), pick(borrowable), d, d, d, "Đọc tại chỗ");
  }
  for (let k = 0; k < 14; k++) { const d = weekday(addDays(T, -1 - Math.floor(rnd() * 6))); await lend(pick(studentReaders), pick(borrowable.filter((c) => !busy.has(c.code))), d, addDays(d, 7), null); }
  for (let k = 0; k < 4; k++) { const d = weekday(addDays(T, -12 - k)); await lend(studentReaders[k * 17], pick(borrowable.filter((c) => !busy.has(c.code))), d, addDays(d, 7), null); }
  // Sách giáo khoa mượn theo năm học (tủ sách dùng chung): mỗi học sinh lớp 6A1, 7A1 mượn sách của khối mình
  const yearEnd = new Date(y1, 4, 31);
  for (const r of studentReaders.filter((x) => x.className === "6A1" || x.className === "7A1")) {
    const g = r.className[0];
    for (const c of allCopies.filter((c) => c.kind === "SGK" && c.grade === g && !busy.has(c.code)).slice(0, 2)) await lend(r, c, addDays(start, 1), yearEnd, null, "Theo năm học");
  }
  await lend(staffReaders.find((r) => r.userId === "pw-giaovien"), allCopies.find((c) => c.kind === "SGK" && !busy.has(c.code)), addDays(start, 1), yearEnd, null, "Theo năm học");

  // 14. Tiết đọc thư viện (HK I): lớp khối 6, 7 đủ 3 tiết; khối 8 có 1–2 tiết; khối 9 có kế hoạch
  const periods = db.collection("readingperiods");
  const TOPICS = ["Giới thiệu sách về Bác Hồ", "Đọc truyện cổ tích và kể lại", "Hướng dẫn tra cứu sách", "Sách về biển đảo quê hương", "Đọc sách khoa học vui"];
  let slotCycle = 0;
  for (const c of CLASSES) {
    const g = Number(c[0]), n = g <= 7 ? 3 : g === 8 ? 1 + (Number(c[2]) % 2) : 0;
    for (let k = 0; k < n; k++) {
      const d = weekday(addDays(start, 10 + (CLASSES.indexOf(c) * 3 + k * 20) % 60)), slot = SLOTS[slotCycle++ % SLOTS.length];
      await periods.insert({ id: newId(), date: iso(d), slot, slotName: slotLabel([slot]), className: c, schoolYear: sy, term: "HK1", topic: pick(TOPICS), leader: "Nhân viên thư viện (thử nghiệm)", status: "Đã dạy", attendance: 36 + Math.floor(rnd() * 7), note: "", createdBy: "Nhân viên thư viện (thử nghiệm)", createdAt: at(addDays(d, -7)), demo: true });
    }
    if (g === 9) { const d = weekday(addDays(T, 3 + Number(c[2]))), slot = SLOTS[Number(c[2])]; await periods.insert({ id: newId(), date: iso(d), slot, slotName: slotLabel([slot]), className: c, schoolYear: sy, term: "HK1", topic: "Sách hướng nghiệp", leader: "Nhân viên thư viện (thử nghiệm)", status: "Kế hoạch", attendance: null, note: "", createdAt: now, demo: true }); }
  }
  inc("Tiết đọc thư viện", (await periods.all()).filter((p) => p.demo).length);
  // Kiểm kê kho sách kệ M-K05
  const k5 = allCopies.filter((c) => c.shelf === "M-K05" && !busy.has(c.code)).map((c) => c.code);
  await db.collection("libaudits").insert({ id: newId(), title: "[MẪU] Kiểm kê kệ nghiệp vụ", shelf: "M-K05", expected: k5, found: k5, extra: [], missing: [], status: "Hoàn tất", markedMissing: false, createdBy: "Nhân viên thư viện (thử nghiệm)", createdAt: at(addDays(T, -7)), finishedAt: at(addDays(T, -7), 16), demo: true });

  // 15. Khách vãng lai, yêu cầu dữ liệu, nhật ký đăng nhập
  const guests = db.collection("guests");
  const GK = [["Phụ huynh học sinh", "Làm việc với nhà trường", "Văn phòng"], ["Đoàn kiểm tra, công tác", "Làm việc với nhà trường", "Phòng thiết bị"], ["Học sinh trường khác", "Đọc sách tại thư viện", "Thư viện"], ["Giáo viên, cán bộ trường khác", "Tham quan phòng học bộ môn", "Phòng KHTN 1"], ["Khách khác", "Bàn giao, sửa chữa thiết bị", "Phòng thiết bị"]];
  for (let k = 0; k < 12; k++) {
    const d = addDays(T, -Math.floor(k / 2)), [kind, purpose, place] = pick(GK), inT = new Date(d); inT.setHours(7 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
    const ds = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    await guests.insert({ id: newId(), code: `KM${ds}-${String(100 + k).slice(1)}`, name: `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`, kind, org: kind === "Phụ huynh học sinh" ? `PH em ${pick(TEN)} lớp ${pick(CLASSES)}` : kind === "Đoàn kiểm tra, công tác" ? "Phòng GD&ĐT" : "", phone: rnd() < 0.5 ? `09${Math.floor(10000000 + rnd() * 89999999)}` : "", purpose, place, note: "",
      checkInAt: inT.toISOString(), checkOutAt: k < 2 ? null : new Date(inT.getTime() + (30 + rnd() * 90) * 60e3).toISOString(), consentAt: inT.toISOString(), consentVersion: PRIVACY_VERSION, createdBy: rnd() < 0.5 ? "Khách tự đăng ký" : "Nhân viên thư viện (thử nghiệm)", demo: true });
  }
  inc("Lượt khách", 12);
  await db.collection("datarequests").insert({ id: newId(), userId: "pw-gv.tuan", userName: "Vũ Minh Tuấn", email: "", type: "Sửa thông tin", content: "Sửa chức vụ thành Giáo viên Toán – Tin", status: "Chờ xử lý", createdAt: at(addDays(T, -1), 20), demo: true });
  const ll = db.collection("loginlog");
  for (let k = 0; k < 25; k++) {
    const [u, name] = pick(TEACHERS), ok = rnd() > 0.12;
    await ll.insert({ id: newId(), at: at(addDays(T, -Math.floor(rnd() * 6)), 6 + Math.floor(rnd() * 14)), ip: `113.185.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 255)}`, ua: rnd() < 0.5 ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)" : "Mozilla/5.0 (Windows NT 10.0)", method: "Mật khẩu", username: u, userId: `pw-${u}`, name, result: ok ? "Thành công" : "Sai mật khẩu", demo: true });
  }
  await refreshCache();
  // 16. Bản kê: mọi bản ghi mới thêm từ đầu hàm đến đây chính là dữ liệu mẫu
  const after = await snapshotIds(), ids = {};
  for (const [t, set] of Object.entries(after)) { const add = [...set].filter((x) => !before[t].has(x)); if (add.length) ids[t] = add; }
  await settings().insert({ id: "demoManifest", at: new Date().toISOString(), summary: count, ids, schoolCreated: !schoolBefore });
  return { value: count, passwords: common ? null : passwords, commonPassword: common ? "Test@2026" : null };
}

/** Xóa dữ liệu mẫu: chỉ xóa các bản ghi nằm trong bản kê và những gì phát sinh từ thiết bị, sách, tài khoản mẫu; dữ liệu thật giữ nguyên */
export async function removeDemo() {
  const m = await settings().get("demoManifest");
  if (!m) return { error: "Không có dữ liệu mẫu", status: 404 };
  const ids = m.ids || {};
  const demoEq = new Set(ids.equipment || []), demoUsers = new Set(ids.users || []), demoCopies = new Set(ids.bookcopies || []);
  const removed = {};
  const drop = async (name, col, list) => { let n = 0; for (const id of list) { try { await col.remove(id); n++; } catch { /* đã bị xóa */ } } if (n) removed[name] = n; };
  for (const [t, list] of Object.entries(ids)) {
    if (t === "__records") await drop(t, { remove: (id) => db.records.remove(id) }, list);
    else if (t === "__notifications") await drop(t, { remove: (id) => db.notifications.remove(id) }, list);
    else await drop(t, db.collection(t), list);
  }
  // Phát sinh sau khi tạo (thao tác thử trên dữ liệu mẫu): phiếu mượn, nhật ký, báo mất… liên quan thiết bị/sách/tài khoản mẫu
  const sweep = async (table, pred) => { const col = db.collection(table); let n = 0; for (const d of await col.all()) if (pred(d)) { await col.remove(d.id); n++; } if (n) removed[`${table} (phát sinh)`] = n; };
  for (const r of await db.records.findAll()) if ((r.items || []).some((it) => demoEq.has(it.equipmentId)) || demoUsers.has(r.userId)) { await db.records.remove(r.id); removed["phiếu mượn (phát sinh)"] = (removed["phiếu mượn (phát sinh)"] || 0) + 1; }
  for (const t of ["changelog", "lossreports", "consumptions", "maintenance", "disposals"]) await sweep(t, (d) => demoEq.has(d.equipmentId));
  await sweep("penalties", (d) => demoUsers.has(d.userId));
  await sweep("proposals", (d) => demoUsers.has(d.userId));
  await sweep("bookloans", (d) => demoCopies.has(d.copyCode));
  // Gỡ liên kết danh mục tối thiểu tới thiết bị mẫu
  for (const it of await db.collection("minlist").all()) { const keep = (it.linkedEquipmentIds || []).filter((x) => !demoEq.has(x)); if (keep.length !== (it.linkedEquipmentIds || []).length) await db.collection("minlist").update(it.id, { linkedEquipmentIds: keep }); }
  if (m.schoolCreated) await settings().remove("school").catch(() => {});
  await settings().remove("demoManifest").catch(() => {});
  await reloadUsers(); await refreshCache();
  return { value: { removed } };
}

export function registerDemoRoutes(app, { requireAuth, wrap }) {
  // Chỉ quản trị hệ thống tạo, xóa dữ liệu mẫu (dùng được cả khi đã tắt tài khoản thử nghiệm)
  const guard = (req, res, next) => (req.session?.user?.isSysadmin ? next() : res.status(403).json({ error: "Chỉ quản trị hệ thống" }));
  app.get("/api/admin/demo-data", requireAuth, guard, wrap(async (req, res) => { const m = await settings().get("demoManifest"); res.json({ active: !!m, at: m?.at || null, summary: m?.summary || null }); }));
  // Mọi người đã đăng nhập (nhân viên) cần biết đang bật dữ liệu mẫu để không nhầm với số liệu thật
  app.get("/api/demo-status", requireAuth, wrap(async (req, res) => res.json({ active: !!(await settings().get("demoManifest")) })));
  app.post("/api/admin/demo-data", requireAuth, guard, wrap(async (req, res) => {
    const r = await seedDemo({ randomPasswords: !!req.body?.randomPasswords });
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.status(201).json({ summary: r.value, passwords: r.passwords, commonPassword: r.commonPassword });
  }));
  // Đặt lại mật khẩu ngẫu nhiên cho các tài khoản giáo viên mẫu (khi quên mật khẩu đã hiện lúc tạo)
  app.post("/api/admin/demo-data/passwords", requireAuth, guard, wrap(async (req, res) => {
    const m = await settings().get("demoManifest");
    if (!m) return res.status(404).json({ error: "Không có dữ liệu mẫu" });
    const passwords = {};
    for (const id of m.ids?.users || []) {
      const u = await db.collection("users").get(id);
      if (!u || u.status !== "active") continue;
      const pw = randomPw(); passwords[u.username] = pw;
      await db.collection("users").update(id, { passwordHash: hashPw(pw), test: false });
    }
    await reloadUsers();
    res.json({ passwords });
  }));
  app.delete("/api/admin/demo-data", requireAuth, guard, wrap(async (req, res) => {
    const r = await removeDemo();
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.json(r.value);
  }));
}
