/**
 * Phân hệ kho thiết bị (đợt 1):
 *  - Danh mục thiết bị lưu trong CSDL, số lượng theo tình trạng: tốt / hỏng / mất / đang sửa, đơn giá
 *  - Phiếu nhập kho (mua mới)
 *  - Ghi nhận hỏng / mất khi trả thiết bị
 *  - Điểm thi đua giáo viên theo quy chế (trừ điểm trả trễ, làm hỏng, làm mất; khóa khi dưới ngưỡng)
 */
import db, { newId } from "./database.js";
import notifications from "./notifications.js";
import { emailLossReport, newEmailToken } from "./principalEmail.js";
import { SUBJECTS } from "./chatTools.js";
import { setEquipmentCatalog, loadSeedEquipment, parseDate, todayVN, formatDate, isExpired } from "./equipment.js";

// ---------- Quy chế điểm thi đua ----------
export const RULES = {
  startPoints: 100,     // điểm đầu năm học
  lockBelow: 70,        // dưới mức này: tạm khóa quyền đăng ký mượn
  latePerDay: 2,        // trả trễ (từ lần thứ 2): trừ mỗi ngày
  lateMaxPerRecord: 10, // tối đa mỗi phiếu
  damagePerUnit: 5,     // làm hỏng: trừ mỗi thiết bị
  lossPerUnit: 10,      // làm mất: trừ mỗi thiết bị
};

const equipmentCol = () => db.collection("equipment");
const purchaseCol = () => db.collection("purchases");
const penaltyCol = () => db.collection("penalties");
const lossCol = () => db.collection("lossreports");

// Các thao tác thay đổi số lượng chạy lần lượt, tránh hai yêu cầu cùng sửa một thiết bị
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

const int = (v, min = 0, max = 100000) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const str = (v, max) => String(v ?? "").trim().slice(0, max);

/** Thêm các trường mà phần trợ lý AI / tính tồn kho đang dùng */
function withDerived(eq) {
  const parts = [`tốt ${eq.qtyGood}`];
  if (eq.qtyBroken) parts.push(`hỏng ${eq.qtyBroken}`);
  if (eq.qtyRepair) parts.push(`đang sửa ${eq.qtyRepair}`);
  if (eq.qtyLost) parts.push(`mất ${eq.qtyLost}`);
  if (eq.qtyLostPending) parts.push(`chờ xác nhận mất ${eq.qtyLostPending}`);
  const expired = isExpired(eq);
  if (expired) parts.push("HẾT HẠN – không cho mượn");
  return { ...eq, kind: eq.kind || "Thiết bị", expired, stock: expired ? 0 : eq.qtyGood, condition: parts.join(", ") };
}

async function refreshCache() {
  const list = (await equipmentCol().all()).map(withDerived);
  list.sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.name.localeCompare(b.name, "vi"));
  setEquipmentCatalog(list);
  return list;
}

/** Lần đầu: chép 57 thiết bị từ catalog/equipment.json vào CSDL */
export async function initInventory() {
  if ((await equipmentCol().count()) === 0) {
    const seed = loadSeedEquipment();
    const now = new Date().toISOString();
    for (const e of seed) {
      await equipmentCol().insert({
        id: e.id, name: e.name, subjectId: e.subjectId, grades: e.grades || [], keywords: e.keywords || [],
        location: e.location || "", unitPrice: 0, unit: "Bộ", origin: "", fundSource: "Ngân sách", yearInUse: null, shared: false,
        qtyGood: /hỏng|đang sửa|thanh lý/i.test(e.condition || "") ? 0 : Number(e.stock) || 0,
        qtyBroken: 0, qtyLost: 0, qtyRepair: 0, note: "", createdAt: now, updatedAt: now,
      });
    }
    if (seed.length) console.log(`[Kho] Đã khởi tạo ${seed.length} thiết bị từ catalog/equipment.json`);
  }
  await refreshCache();
}

// ---------- Thiết bị ----------

export async function listInventory() {
  return refreshCache();
}

function validateEquipment(b, partial = false) {
  const out = {};
  if (!partial || b.name !== undefined) {
    out.name = str(b.name, 150);
    if (!out.name) return { error: "Tên thiết bị không được để trống" };
  }
  if (!partial || b.subjectId !== undefined) {
    if (!SUBJECTS.some((s) => s.id === b.subjectId)) return { error: "Môn học không hợp lệ" };
    out.subjectId = b.subjectId;
  }
  for (const k of ["qtyGood", "qtyBroken", "qtyLost", "qtyRepair"]) {
    if (b[k] === undefined) { if (!partial) out[k] = 0; continue; }
    const n = int(b[k]);
    if (n === null) return { error: "Số lượng phải là số nguyên từ 0 trở lên" };
    out[k] = n;
  }
  if (b.unitPrice !== undefined || !partial) {
    const p = int(b.unitPrice ?? 0, 0, 1_000_000_000);
    if (p === null) return { error: "Đơn giá không hợp lệ" };
    out.unitPrice = p;
  }
  if (b.location !== undefined || !partial) out.location = str(b.location, 120);
  // Thông tin quản lý tài sản (theo cách các phần mềm quản lý trường học ghi sổ)
  if (b.unit !== undefined || !partial) out.unit = str(b.unit, 20) || "Cái";
  if (b.topic !== undefined || !partial) out.topic = str(b.topic, 200); // chủ đề / bài theo chương trình
  // Loại: thiết bị (mượn – trả), hóa chất (có hạn dùng), vật tư tiêu hao (dùng hết, không trả)
  if (b.kind !== undefined || !partial) out.kind = ["Thiết bị", "Hóa chất", "Vật tư tiêu hao"].includes(b.kind) ? b.kind : "Thiết bị";
  if (b.expiry !== undefined || !partial) {
    out.expiry = b.expiry ? (parseDate(b.expiry) ? formatDate(parseDate(b.expiry)) : null) : "";
    if (out.expiry === null) return { error: "Hạn sử dụng không hợp lệ (DD/MM/YYYY)" };
  }
  if (b.hazard !== undefined || !partial) out.hazard = str(b.hazard, 80); // độc, dễ cháy, ăn mòn…
  if (b.concentration !== undefined || !partial) out.concentration = str(b.concentration, 40);
  if (b.minStock !== undefined || !partial) out.minStock = int(b.minStock ?? 0, 0, 100000) ?? 0; // dưới mức này thì cảnh báo
  if (b.highValue !== undefined || !partial) out.highValue = !!b.highValue; // giá trị cao: mượn nhiều ngày cần duyệt đặc biệt
  if (b.origin !== undefined || !partial) out.origin = str(b.origin, 60);
  if (b.fundSource !== undefined || !partial) out.fundSource = ["Ngân sách", "Xã hội hóa", "Tài trợ", "Khác"].includes(b.fundSource) ? b.fundSource : "Ngân sách";
  if (b.yearInUse !== undefined || !partial) {
    const y = b.yearInUse === "" || b.yearInUse == null ? null : int(b.yearInUse, 1990, 2100);
    if (b.yearInUse !== "" && b.yearInUse != null && y === null) return { error: "Năm đưa vào sử dụng không hợp lệ" };
    out.yearInUse = y;
  }
  if (b.shared !== undefined || !partial) out.shared = !!b.shared; // thiết bị dùng chung nhiều môn
  if (b.note !== undefined || !partial) out.note = str(b.note, 300);
  if (b.grades !== undefined || !partial) out.grades = (Array.isArray(b.grades) ? b.grades : []).map(Number).filter((g) => g >= 6 && g <= 9);
  if (b.keywords !== undefined || !partial) {
    const kw = Array.isArray(b.keywords) ? b.keywords : String(b.keywords || "").split(",");
    out.keywords = kw.map((k) => str(k, 40)).filter(Boolean).slice(0, 15);
  }
  return { value: out };
}

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function createEquipment(body, user) {
  return serial(async () => {
    const v = validateEquipment(body);
    if (v.error) return v;
    const now = new Date().toISOString();
    const eq = { id: `${slug(v.value.name) || "tb"}-${newId().slice(0, 4)}`, ...v.value, createdAt: now, updatedAt: now, createdBy: user.name };
    await equipmentCol().insert(eq);
    await logChange(null, eq, { kind: "Thêm thiết bị", by: user.name });
    await refreshCache();
    return { value: withDerived(eq) };
  });
}

export function updateEquipment(id, body, by) {
  return serial(async () => {
    if (!(await equipmentCol().get(id))) return { error: "Không tìm thấy thiết bị", status: 404 };
    const v = validateEquipment(body, true);
    if (v.error) return v;
    const before = await equipmentCol().get(id);
    const eq = await equipmentCol().update(id, { ...v.value, updatedAt: new Date().toISOString() });
    await logChange(before, eq, { kind: "Sửa trực tiếp", by: by?.name || "" });
    await refreshCache();
    return { value: withDerived(eq) };
  });
}

export function deleteEquipment(id, by) {
  return serial(async () => {
    const before = await equipmentCol().get(id);
    if (!before) return { error: "Không tìm thấy thiết bị", status: 404 };
    const active = await db.records.findActive();
    if (active.some((r) => (r.items || []).some((it) => it.equipmentId === id))) {
      return { error: "Thiết bị đang có trong phiếu chờ duyệt hoặc đang mượn, chưa xóa được", status: 409 };
    }
    await equipmentCol().remove(id);
    await logChange(before, { id: before.id, name: before.name }, { kind: "Xóa khỏi danh mục", by: by?.name || "", always: true });
    await refreshCache();
    return { value: true };
  });
}

/** Cộng/trừ số lượng theo tình trạng; không để số âm */
// ---------- Nhật ký thay đổi số lượng (mọi thay đổi kho đều ghi: ai, khi nào, vì sao) ----------
const changeCol = () => db.collection("changelog");
const QTY_KEYS = ["qtyGood", "qtyBroken", "qtyRepair", "qtyLostPending", "qtyLost", "qtyDisposed", "qtyConsumed"];

/** Ghi nhật ký từ trạng thái trước và sau. meta = { kind, refId, by, note } */
export async function logChange(before, after, meta = {}) {
  if (!before && !after) return;
  const diff = {};
  for (const k of QTY_KEYS) {
    const d = (Number(after?.[k]) || 0) - (Number(before?.[k]) || 0);
    if (d) diff[k] = d;
  }
  if (!Object.keys(diff).length && !meta.always) return;
  const eq = after || before;
  await changeCol().insert({
    id: newId(), createdAt: new Date().toISOString(), equipmentId: eq.id, name: eq.name,
    kind: meta.kind || "khác", refId: meta.refId || null, by: meta.by || "", note: str(meta.note, 300), diff,
  });
}

async function applyDelta(id, delta, meta = {}) {
  const eq = await equipmentCol().get(id);
  if (!eq) return null;
  const patch = { updatedAt: new Date().toISOString() };
  for (const [k, d] of Object.entries(delta)) patch[k] = Math.max(0, (Number(eq[k]) || 0) + d);
  const after = await equipmentCol().update(id, patch);
  await logChange(eq, after, meta);
  return after;
}

export async function listChanges(equipmentId) {
  return (await changeCol().all()).filter((c) => !equipmentId || c.equipmentId === equipmentId);
}

// ---------- Phiếu nhập kho (mua mới) ----------

export async function listPurchases() {
  return purchaseCol().all();
}

export function createPurchase(body, user) {
  return serial(async () => {
    const date = parseDate(body.date);
    if (!date) return { error: "Ngày nhập không hợp lệ (DD/MM/YYYY)" };
    if (!Array.isArray(body.items) || !body.items.length) return { error: "Cần ít nhất một thiết bị" };
    const items = [];
    for (const it of body.items.slice(0, 50)) {
      const eq = await equipmentCol().get(it?.equipmentId);
      const qty = int(it?.quantity, 1, 10000);
      const price = int(it?.unitPrice ?? 0, 0, 1_000_000_000);
      if (!eq || qty === null || price === null) return { error: "Danh sách thiết bị nhập không hợp lệ" };
      items.push({ equipmentId: eq.id, name: eq.name, subjectId: eq.subjectId, quantity: qty, unitPrice: price, amount: qty * price });
    }
    for (const it of items) {
      await applyDelta(it.equipmentId, { qtyGood: it.quantity }, { kind: "Ghi tăng", by: user.name, note: `${it.quantity} × ${it.unitPrice.toLocaleString("vi-VN")} đ${body.supplier ? ` – ${str(body.supplier, 80)}` : ""}` });
      if (it.unitPrice > 0) await equipmentCol().update(it.equipmentId, { unitPrice: it.unitPrice });
    }
    const doc = {
      id: newId(), date: formatDate(date), supplier: str(body.supplier, 150), note: str(body.note, 300),
      items, total: items.reduce((s, it) => s + it.amount, 0), createdBy: user.name, createdAt: new Date().toISOString(),
    };
    await purchaseCol().insert(doc);
    await refreshCache();
    return { value: doc };
  });
}

// ---------- Điểm thi đua ----------

/**
 * Điểm gắn với ai: phiếu giáo viên tự gửi -> tài khoản Google của giáo viên;
 * phiếu quản trị viên đăng ký hộ -> theo họ tên giáo viên ghi trên phiếu.
 */
export const teacherKey = (r) => (r.createdByAdmin ? `ten:${slug(r.teacherName || "")}` : r.userId);

/** Năm học tính từ 01/09: tháng 9/2026 – tháng 8/2027 là "2026-2027" */
export function schoolYearOf(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth();
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

async function penaltiesOf(userId, year = schoolYearOf()) {
  return (await penaltyCol().all()).filter((p) => p.userId === userId && p.schoolYear === year);
}

export async function scoreOf(userId) {
  const list = await penaltiesOf(userId);
  const score = RULES.startPoints + list.reduce((s, p) => s + (Number(p.points) || 0), 0);
  return { score, locked: score < RULES.lockBelow, history: list };
}

async function addPenalty(p) {
  const doc = { id: newId(), createdAt: new Date().toISOString(), schoolYear: schoolYearOf(), ...p };
  await penaltyCol().insert(doc);
  return doc;
}

/** Bảng điểm tất cả giáo viên có phiếu hoặc có điểm trong năm học */
export async function listScores() {
  const year = schoolYearOf();
  const map = new Map();
  const touch = (userId, name) => {
    if (!userId) return null;
    if (!map.has(userId)) map.set(userId, { userId, teacherName: name, points: 0, records: 0, late: 0, damaged: 0, lost: 0 });
    const t = map.get(userId);
    if (name && !t.teacherName) t.teacherName = name;
    return t;
  };
  for (const r of await db.records.findAll()) {
    const key = teacherKey(r);
    if (!key) continue;
    const t = touch(key, r.createdByAdmin ? r.teacherName : r.userName || r.teacherName);
    t.records++;
  }
  for (const p of await penaltyCol().all()) {
    if (p.schoolYear !== year) continue;
    const t = touch(p.userId, p.teacherName);
    t.points += Number(p.points) || 0;
    if (p.kind === "late") t.late++;
    if (p.kind === "damage") t.damaged += p.quantity || 0;
    if (p.kind === "loss") t.lost += p.quantity || 0;
  }
  return [...map.values()]
    .map((t) => ({ ...t, score: RULES.startPoints + t.points, locked: RULES.startPoints + t.points < RULES.lockBelow }))
    .sort((a, b) => a.score - b.score || a.teacherName.localeCompare(b.teacherName, "vi"));
}

export async function adjustPoints({ userId, teacherName, points, reason }, admin) {
  const p = int(points, -100, 100);
  if (!userId || p === null || p === 0) return { error: "Số điểm phải từ -100 đến 100 và khác 0" };
  const why = str(reason, 200);
  if (!why) return { error: "Cần ghi lý do điều chỉnh" };
  return { value: await addPenalty({ userId, teacherName: str(teacherName, 80), kind: "manual", points: p, reason: why, createdBy: admin.name }) };
}

export async function unlockTeacher({ userId, teacherName }, admin) {
  const { score } = await scoreOf(userId);
  if (score >= RULES.lockBelow) return { error: "Giáo viên này không bị khóa" };
  return { value: await addPenalty({ userId, teacherName: str(teacherName, 80), kind: "manual", points: RULES.lockBelow - score, reason: "Quản trị viên mở khóa quyền mượn", createdBy: admin.name }) };
}

// ---------- Trả thiết bị: ghi hỏng / mất, tính điểm ----------

/**
 * Kiểm tra báo cáo trả: [{ equipmentId, damaged, lost }]
 * Số hỏng + mất của mỗi thiết bị không vượt số lượng mượn (nếu phiếu có danh sách mã thiết bị).
 */
async function validateReturnItems(record, items) {
  const out = [];
  for (const it of (Array.isArray(items) ? items : []).slice(0, 20)) {
    const damaged = int(it?.damaged ?? 0, 0, 1000), lost = int(it?.lost ?? 0, 0, 1000), consumed = int(it?.consumed ?? 0, 0, 100000);
    if (damaged === null || lost === null || consumed === null) return { error: "Số lượng hỏng/mất/đã dùng không hợp lệ" };
    if (!damaged && !lost && !consumed) continue;
    const eq = await equipmentCol().get(it.equipmentId);
    if (!eq) return { error: "Thiết bị trong báo cáo trả không tồn tại" };
    const borrowed = (record.items || []).find((x) => x.equipmentId === eq.id)?.quantity;
    if (borrowed !== undefined && damaged + lost + consumed > borrowed) return { error: `"${eq.name}": số hỏng + mất + đã dùng vượt số lượng đã mượn (${borrowed})` };
    if (consumed && (eq.kind || "Thiết bị") === "Thiết bị") return { error: `"${eq.name}" là thiết bị, không ghi “đã dùng hết”` };
    out.push({ equipmentId: eq.id, name: eq.name, damaged, lost, consumed, unitPrice: eq.unitPrice || 0 });
  }
  return { value: out };
}

export function processReturn(record, body, admin) {
  return serial(async () => {
    const v = await validateReturnItems(record, body?.items);
    if (v.error) return v;
    const items = v.value;
    const note = str(body?.note, 300);
    const today = todayVN();
    const due = parseDate(record.returnDate);
    const lateDays = due ? Math.max(0, Math.round((today - due) / 864e5)) : 0;
    const key = teacherKey(record);
    const who = { userId: key, teacherName: record.teacherName, recordId: record.id, createdBy: admin.name };
    const penalties = [];

    if (key && lateDays > 0) {
      const priorLate = (await penaltiesOf(key)).filter((p) => p.kind === "late").length;
      const pts = priorLate === 0 ? 0 : -Math.min(RULES.lateMaxPerRecord, lateDays * RULES.latePerDay);
      penalties.push(await addPenalty({ ...who, kind: "late", points: pts, lateDays,
        reason: priorLate === 0 ? `Trả trễ ${lateDays} ngày (nhắc nhở lần 1, không trừ điểm)` : `Trả trễ ${lateDays} ngày (lần ${priorLate + 1})` }));
    }
    const lossReportIds = [];
    for (const it of items) {
      // Thiết bị báo mất chưa tính là mất ngay: chờ Ban giám hiệu xác nhận
      await applyDelta(it.equipmentId, { qtyGood: -(it.damaged + it.lost + (it.consumed || 0)), qtyBroken: it.damaged, qtyLostPending: it.lost, qtyConsumed: it.consumed || 0 },
        { kind: "Trả thiết bị", refId: record.id, by: admin.name, note: `Phiếu ${record.code || ""} của ${record.teacherName}, lớp ${record.className}${note ? ` – ${note}` : ""}` });
      if (it.lost) {
        it.lostStatus = "Chờ xác nhận";
        const lr = await createLossReport({ equipmentId: it.equipmentId, name: it.name, quantity: it.lost, unitPrice: it.unitPrice,
          source: "return", recordId: record.id, teacherKey: key, teacherName: record.teacherName, note, reportedBy: admin.name });
        lossReportIds.push(lr.id);
      }
      if (!key) continue;
      if (it.damaged) penalties.push(await addPenalty({ ...who, kind: "damage", quantity: it.damaged, points: -RULES.damagePerUnit * it.damaged,
        compensation: it.damaged * it.unitPrice, reason: `Làm hỏng ${it.damaged} ${it.name}` }));
    }
    await refreshCache();
    return { value: {
      returnReport: { items, note, lateDays, returnedOn: formatDate(today),
        pointsDeducted: penalties.reduce((s, p) => s + p.points, 0),
        compensation: penalties.reduce((s, p) => s + (p.compensation || 0), 0),
        penaltyIds: penalties.map((p) => p.id), lossReportIds },
    } };
  });
}

/** Hoàn tác "Đã trả": trả lại số lượng kho và xóa các mục trừ điểm của phiếu */
export function undoReturn(record) {
  return serial(async () => {
    const rep = record.returnReport;
    if (!rep) return { value: null };
    if (rep.lossReportIds) {
      const reports = (await Promise.all(rep.lossReportIds.map((id) => lossCol().get(id)))).filter(Boolean);
      if (reports.some((r) => r.status !== "Chờ xác nhận")) {
        return { error: "Báo mất của phiếu này đã được Ban giám hiệu xử lý, không hoàn tác được", status: 409 };
      }
      for (const r of reports) await lossCol().remove(r.id);
      for (const it of rep.items || []) await applyDelta(it.equipmentId, { qtyGood: it.damaged + it.lost + (it.consumed || 0), qtyBroken: -it.damaged, qtyLostPending: -it.lost, qtyConsumed: -(it.consumed || 0) }, { kind: "Hoàn tác trả", refId: record.id, note: `Phiếu ${record.code || ""}` });
    } else {
      // Phiếu trả trước khi có quy trình xác nhận mất
      for (const it of rep.items || []) await applyDelta(it.equipmentId, { qtyGood: it.damaged + it.lost, qtyBroken: -it.damaged, qtyLost: -it.lost }, { kind: "Hoàn tác trả", refId: record.id });
    }
    for (const id of rep.penaltyIds || []) await penaltyCol().remove(id);
    await refreshCache();
    return { value: null };
  });
}

// ---------- Báo mất: chờ Ban giám hiệu xác nhận ----------

async function createLossReport(data) {
  const doc = { id: newId(), status: "Chờ xác nhận", createdAt: new Date().toISOString(), ...data, ...newEmailToken() };
  await lossCol().insert(doc);
  // Gửi email cho Ban giám hiệu để xác nhận ngay trong Gmail (không chờ gửi xong)
  emailLossReport(doc).catch((e) => console.error("[Mailer] Lỗi email báo mất:", e.message));
  await notifications.createNotification({
    type: "system", title: "Báo mất thiết bị – chờ Ban giám hiệu xác nhận",
    message: `${data.quantity} ${data.name}${data.source === "audit" ? ` (kiểm kê: ${data.auditTitle || ""})` : ` (phiếu mượn của ${data.teacherName})`}`,
    recordId: data.recordId || null, userName: data.reportedBy,
  });
  return doc;
}

export async function listLossReports() {
  return lossCol().all();
}

/** Cập nhật trạng thái của dòng thiết bị tương ứng trong biên bản trả của phiếu mượn */
async function markRecordLoss(lr, patch) {
  if (lr.source !== "return" || !lr.recordId) return;
  const rec = await db.records.findById(lr.recordId);
  if (!rec?.returnReport) return;
  const rep = { ...rec.returnReport, items: rec.returnReport.items.map((it) => (it.equipmentId === lr.equipmentId ? { ...it, ...patch.item } : it)) };
  if (patch.penalty) {
    rep.pointsDeducted = (rep.pointsDeducted || 0) + patch.penalty.points;
    rep.compensation = (rep.compensation || 0) + (patch.penalty.compensation || 0);
    rep.penaltyIds = [...(rep.penaltyIds || []), patch.penalty.id];
  }
  await db.records.update(rec.id, { returnReport: rep });
}

export function confirmLoss(id, user, note) {
  return serial(async () => {
    const lr = await lossCol().get(id);
    if (!lr) return { error: "Không tìm thấy báo mất", status: 404 };
    if (lr.status !== "Chờ xác nhận") return { error: "Báo mất này đã được xử lý", status: 409 };
    await applyDelta(lr.equipmentId, { qtyLostPending: -lr.quantity, qtyLost: lr.quantity }, { kind: "Xác nhận mất", refId: lr.id, by: user.name, note });
    let penalty = null;
    if (lr.source === "return" && lr.teacherKey) {
      penalty = await addPenalty({ userId: lr.teacherKey, teacherName: lr.teacherName, recordId: lr.recordId, createdBy: user.name,
        kind: "loss", quantity: lr.quantity, points: -RULES.lossPerUnit * lr.quantity, compensation: lr.quantity * (lr.unitPrice || 0),
        reason: `Làm mất ${lr.quantity} ${lr.name} (Ban giám hiệu đã xác nhận)` });
    }
    const doc = await lossCol().update(id, { emailToken: null, status: "Đã xác nhận mất", decidedBy: user.name, decidedAt: new Date().toISOString(), decisionNote: str(note, 300), penaltyId: penalty?.id || null });
    await markRecordLoss(lr, { item: { lostStatus: "Đã xác nhận mất" }, penalty });
    await refreshCache();
    return { value: doc };
  });
}

export function rejectLoss(id, user, note) {
  return serial(async () => {
    const lr = await lossCol().get(id);
    if (!lr) return { error: "Không tìm thấy báo mất", status: 404 };
    if (lr.status !== "Chờ xác nhận") return { error: "Báo mất này đã được xử lý", status: 409 };
    // Không mất: thiết bị quay lại nhóm "tốt"
    await applyDelta(lr.equipmentId, { qtyLostPending: -lr.quantity, qtyGood: lr.quantity }, { kind: "Tìm thấy", refId: lr.id, by: user.name, note });
    const doc = await lossCol().update(id, { emailToken: null, status: "Không mất (đã tìm thấy)", decidedBy: user.name, decidedAt: new Date().toISOString(), decisionNote: str(note, 300) });
    await markRecordLoss(lr, { item: { lostStatus: "Đã tìm thấy" } });
    await refreshCache();
    return { value: doc };
  });
}

// Dùng chung cho operations.js (kiểm kê, bảo trì, báo cáo)
export { serial, applyDelta, refreshCache, withDerived, equipmentCol, purchaseCol, penaltyCol, int, str, createLossReport };
export { lossCol };

// ---------- Định tuyến ----------

export function registerInventoryRoutes(app, { requireAuth, requireAdmin, wrap }) {
  const send = (res, r, ok = 200) => (r.error ? res.status(r.status || 400).json({ error: r.error }) : res.status(ok).json(r.value));

  app.get("/api/inventory/equipment", requireAdmin, wrap(async (req, res) => res.json(await listInventory())));
  app.post("/api/inventory/equipment", requireAdmin, wrap(async (req, res) => send(res, await createEquipment(req.body || {}, req.session.user), 201)));
  app.patch("/api/inventory/equipment/:id", requireAdmin, wrap(async (req, res) => send(res, await updateEquipment(req.params.id, req.body || {}, req.session.user))));
  app.delete("/api/inventory/equipment/:id", requireAdmin, wrap(async (req, res) => send(res, await deleteEquipment(req.params.id, req.session.user))));

  app.get("/api/inventory/purchases", requireAdmin, wrap(async (req, res) => res.json(await listPurchases())));
  app.post("/api/inventory/purchases", requireAdmin, wrap(async (req, res) => send(res, await createPurchase(req.body || {}, req.session.user), 201)));

  app.get("/api/points/rules", (req, res) => res.json(RULES));
  app.get("/api/points/me", requireAuth, wrap(async (req, res) => res.json({ ...(await scoreOf(req.session.user.id)), rules: RULES, schoolYear: schoolYearOf() })));
  app.get("/api/points", requireAdmin, wrap(async (req, res) => res.json({ teachers: await listScores(), rules: RULES, schoolYear: schoolYearOf() })));
  app.get("/api/points/:userId", requireAdmin, wrap(async (req, res) => res.json(await scoreOf(req.params.userId))));
  app.post("/api/points/adjust", requireAdmin, wrap(async (req, res) => send(res, await adjustPoints(req.body || {}, req.session.user), 201)));
  app.post("/api/points/unlock", requireAdmin, wrap(async (req, res) => send(res, await unlockTeacher(req.body || {}, req.session.user), 201)));
}
