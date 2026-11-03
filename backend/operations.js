/**
 * Phân hệ vận hành kho (đợt 2 + 3):
 *  - Kiểm kê định kỳ: đếm thực tế, so với sổ sách, tự điều chỉnh kho
 *  - Bảo trì / bảo dưỡng: gửi sửa -> hoàn thành (sửa được / thanh lý)
 *  - Báo cáo tổng hợp theo khoảng thời gian
 *  - Nhắc hạn trả tự động qua email
 *  - Trang chi tiết thiết bị (dùng khi quét mã QR)
 */
import db, { newId } from "./database.js";
import { SUBJECTS } from "./chatTools.js";
import { parseDate, formatDate, todayVN, getEquipment, availabilityOf } from "./equipment.js";
import { serial, applyDelta, refreshCache, withDerived, equipmentCol, purchaseCol, penaltyCol, int, str, schoolYearOf } from "./inventory.js";
import { sendReminderEmail } from "./mailer.js";

const auditCol = () => db.collection("audits");
const maintCol = () => db.collection("maintenance");
const disposalCol = () => db.collection("disposals");
const DAY = 864e5;

/** Số lượng đang nằm ngoài phòng thiết bị (phiếu "Mượn" có mã thiết bị) */
async function lentOut() {
  const out = new Map();
  for (const r of await db.records.findActive()) {
    if (r.status !== "Mượn") continue;
    for (const it of r.items || []) out.set(it.equipmentId, (out.get(it.equipmentId) || 0) + (Number(it.quantity) || 0));
  }
  return out;
}

// =====================================================================
// KIỂM KÊ
// =====================================================================
export const listAudits = async () =>
  (await auditCol().all()).map(({ items, ...a }) => ({ ...a, itemCount: items.length, countedCount: items.filter((i) => i.countGood !== null).length }));

export function startAudit(user, body = {}) {
  return serial(async () => {
    const drafts = (await auditCol().all()).filter((a) => a.status === "Đang kiểm kê");
    if (drafts.length) return { error: "Đang có một đợt kiểm kê chưa hoàn tất", status: 409, id: drafts[0].id };
    const subjectId = SUBJECTS.some((s) => s.id === body.subjectId) ? body.subjectId : "";
    const list = (await refreshCache()).filter((e) => !subjectId || e.subjectId === subjectId);
    const out = await lentOut();
    const doc = {
      id: newId(), status: "Đang kiểm kê", title: str(body.title, 120) || `Kiểm kê ${formatDate(todayVN())}`, subjectId,
      createdAt: new Date().toISOString(), createdBy: user.name,
      items: list.map((e) => ({
        equipmentId: e.id, name: e.name, subjectId: e.subjectId, location: e.location,
        sysGood: e.qtyGood, sysBroken: e.qtyBroken, out: out.get(e.id) || 0,
        countGood: null, countBroken: null, note: "",
      })),
    };
    await auditCol().insert(doc);
    return { value: doc };
  });
}

export async function getAudit(id) {
  const a = await auditCol().get(id);
  return a ? { value: a } : { error: "Không tìm thấy đợt kiểm kê", status: 404 };
}

export function saveAuditCounts(id, body) {
  return serial(async () => {
    const a = await auditCol().get(id);
    if (!a) return { error: "Không tìm thấy đợt kiểm kê", status: 404 };
    if (a.status !== "Đang kiểm kê") return { error: "Đợt kiểm kê đã kết thúc", status: 409 };
    const byId = new Map(a.items.map((i) => [i.equipmentId, i]));
    for (const it of Array.isArray(body?.items) ? body.items.slice(0, 2000) : []) {
      const row = byId.get(it?.equipmentId);
      if (!row) continue;
      const g = it.countGood === null || it.countGood === "" ? null : int(it.countGood);
      const b = it.countBroken === null || it.countBroken === "" ? null : int(it.countBroken);
      if ((it.countGood !== null && it.countGood !== "" && g === null) || (it.countBroken !== null && it.countBroken !== "" && b === null)) {
        return { error: `“${row.name}”: số đếm phải là số nguyên từ 0 trở lên` };
      }
      row.countGood = g;
      row.countBroken = b;
      if (it.note !== undefined) row.note = str(it.note, 200);
    }
    const updated = await auditCol().update(id, { items: a.items, updatedAt: new Date().toISOString() });
    return { value: updated };
  });
}

/**
 * Hoàn tất kiểm kê. Với mỗi thiết bị đã đếm:
 *   phải có trong phòng = tốt (sổ) − đang cho mượn + hỏng (sổ)
 *   đếm được           = tốt (đếm) + hỏng (đếm)
 *   thiếu  -> cộng vào "mất";  thừa -> cộng vào "tốt"
 * Số liệu sổ sách lấy tại thời điểm hoàn tất (phòng khi có mượn/trả trong lúc kiểm kê).
 */
export function finishAudit(id, user) {
  return serial(async () => {
    const a = await auditCol().get(id);
    if (!a) return { error: "Không tìm thấy đợt kiểm kê", status: 404 };
    if (a.status !== "Đang kiểm kê") return { error: "Đợt kiểm kê đã kết thúc", status: 409 };
    const counted = a.items.filter((i) => i.countGood !== null);
    if (!counted.length) return { error: "Chưa nhập số đếm cho thiết bị nào" };
    const out = await lentOut();
    let missing = 0, surplus = 0;
    for (const row of counted) {
      const eq = await equipmentCol().get(row.equipmentId);
      if (!eq) { row.result = "Thiết bị đã bị xóa"; continue; }
      const lent = out.get(eq.id) || 0;
      const countBroken = row.countBroken ?? eq.qtyBroken;
      const expected = Math.max(0, eq.qtyGood - lent) + eq.qtyBroken;
      const diff = row.countGood + countBroken - expected;
      row.expected = expected;
      row.diff = diff;
      row.out = lent;
      if (diff < 0) missing += -diff; else surplus += diff;
      await equipmentCol().update(eq.id, {
        qtyGood: row.countGood + lent,
        qtyBroken: countBroken,
        qtyLost: (eq.qtyLost || 0) + Math.max(0, -diff),
        lastAuditAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    await refreshCache();
    const summary = { counted: counted.length, notCounted: a.items.length - counted.length, missing, surplus, discrepancies: counted.filter((r) => r.diff).length };
    const doc = await auditCol().update(id, { items: a.items, status: "Hoàn tất", finishedAt: new Date().toISOString(), finishedBy: user.name, summary });
    return { value: doc };
  });
}

export async function cancelAudit(id) {
  const a = await auditCol().get(id);
  if (!a) return { error: "Không tìm thấy đợt kiểm kê", status: 404 };
  if (a.status !== "Đang kiểm kê") return { error: "Không hủy được đợt kiểm kê đã hoàn tất", status: 409 };
  await auditCol().remove(id);
  return { value: true };
}

// =====================================================================
// BẢO TRÌ / BẢO DƯỠNG
// =====================================================================
export const listMaintenance = () => maintCol().all();

export function createMaintenance(body, user) {
  return serial(async () => {
    const eq = await equipmentCol().get(body?.equipmentId);
    if (!eq) return { error: "Chọn thiết bị cần bảo trì" };
    const qty = int(body.quantity, 1, 10000);
    if (qty === null) return { error: "Số lượng không hợp lệ" };
    const source = body.source === "good" ? "qtyGood" : "qtyBroken";
    if ((eq[source] || 0) < qty) return { error: `Chỉ có ${eq[source] || 0} thiết bị ${source === "qtyGood" ? "tốt" : "hỏng"} để gửi bảo trì` };
    const date = parseDate(body.date) || todayVN();
    await applyDelta(eq.id, { [source]: -qty, qtyRepair: qty });
    const doc = {
      id: newId(), equipmentId: eq.id, name: eq.name, subjectId: eq.subjectId, quantity: qty,
      source: source === "qtyGood" ? "good" : "broken", kind: body.kind === "Bảo dưỡng" ? "Bảo dưỡng" : "Sửa chữa",
      content: str(body.content, 300), vendor: str(body.vendor, 150), date: formatDate(date),
      status: "Đang thực hiện", cost: 0, createdBy: user.name, createdAt: new Date().toISOString(),
    };
    await maintCol().insert(doc);
    await refreshCache();
    return { value: doc };
  });
}

export function completeMaintenance(id, body, user) {
  return serial(async () => {
    const m = await maintCol().get(id);
    if (!m) return { error: "Không tìm thấy phiếu bảo trì", status: 404 };
    if (m.status !== "Đang thực hiện") return { error: "Phiếu bảo trì đã hoàn thành", status: 409 };
    const repaired = int(body?.repaired ?? m.quantity, 0, m.quantity);
    const disposed = int(body?.disposed ?? 0, 0, m.quantity);
    const cost = int(body?.cost ?? 0, 0, 1_000_000_000);
    if (repaired === null || disposed === null || cost === null || repaired + disposed !== m.quantity) {
      return { error: `Số sửa được + số thanh lý phải bằng ${m.quantity}` };
    }
    await applyDelta(m.equipmentId, { qtyRepair: -m.quantity, qtyGood: repaired, qtyDisposed: disposed });
    const doc = await maintCol().update(id, {
      status: "Hoàn thành", repaired, disposed, cost, resultNote: str(body?.note, 300),
      finishedAt: new Date().toISOString(), finishedOn: formatDate(todayVN()), finishedBy: user.name,
    });
    await refreshCache();
    return { value: doc };
  });
}

// =====================================================================
// GHI GIẢM THIẾT BỊ (thanh lý, mất, điều chuyển)
// =====================================================================
const DISPOSAL_REASONS = ["Thanh lý", "Mất", "Điều chuyển", "Hư hỏng không sửa được", "Khác"];
const BUCKETS = { good: "qtyGood", broken: "qtyBroken", lost: "qtyLost" };

export const listDisposals = () => disposalCol().all();

export function createDisposal(body, user) {
  return serial(async () => {
    const eq = await equipmentCol().get(body?.equipmentId);
    if (!eq) return { error: "Chọn thiết bị cần ghi giảm" };
    const qty = int(body.quantity, 1, 10000);
    if (qty === null) return { error: "Số lượng không hợp lệ" };
    const key = BUCKETS[body.source] || "qtyBroken";
    if ((eq[key] || 0) < qty) return { error: `Chỉ có ${eq[key] || 0} thiết bị ở nhóm đã chọn` };
    const reason = DISPOSAL_REASONS.includes(body.reason) ? body.reason : "Thanh lý";
    const date = parseDate(body.date) || todayVN();
    await applyDelta(eq.id, { [key]: -qty, qtyDisposed: qty });
    const doc = {
      id: newId(), equipmentId: eq.id, name: eq.name, subjectId: eq.subjectId, quantity: qty, source: body.source in BUCKETS ? body.source : "broken",
      reason, decisionNo: str(body.decisionNo, 60), note: str(body.note, 300), date: formatDate(date),
      unitPrice: eq.unitPrice || 0, value: qty * (eq.unitPrice || 0), createdBy: user.name, createdAt: new Date().toISOString(),
    };
    await disposalCol().insert(doc);
    await refreshCache();
    return { value: doc };
  });
}

// =====================================================================
// BÁO CÁO TỔNG HỢP
// =====================================================================
const inRange = (d, from, to) => { const x = parseDate(d); return !!x && x >= from && x <= to; };
const isoIn = (iso, from, to) => { const x = parseDate(new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" })); return !!x && x >= from && x <= to; };

export async function buildReport(q) {
  const today = todayVN();
  const from = parseDate(q.from) || new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const to = parseDate(q.to) || today;
  if (to < from) return { error: "Ngày kết thúc phải sau ngày bắt đầu" };

  const all = await db.records.findAll();
  const records = all.filter((r) => inRange(r.borrowDate, from, to));
  const inventory = await refreshCache();
  const nameOf = new Map(inventory.map((e) => [e.id, e.name]));
  const subjectName = (id) => SUBJECTS.find((s) => s.id === id)?.name || id;

  const statusCount = (st) => records.filter((r) => r.status === st).length;
  const returned = records.filter((r) => r.returnReport);
  const late = returned.filter((r) => r.returnReport.lateDays > 0);
  const sumRep = (k) => returned.reduce((s, r) => s + (r.returnReport.items || []).reduce((a, x) => a + (x[k] || 0), 0), 0);
  const compensation = returned.reduce((s, r) => s + (r.returnReport.compensation || 0), 0);
  const overdueNow = all.filter((r) => r.status === "Mượn" && (parseDate(r.returnDate)?.getTime() ?? Infinity) < today.getTime()).length;

  const bySubject = SUBJECTS.map((s) => {
    const list = records.filter((r) => r.subjectId === s.id);
    return { subjectId: s.id, name: s.name, count: list.length, quantity: list.reduce((a, r) => a + (r.quantity || 1), 0), rejected: list.filter((r) => r.status === "Từ chối").length };
  });

  const eqMap = new Map();
  let manual = 0;
  for (const r of records) {
    if (r.status === "Từ chối") continue;
    if (!r.items?.length) { manual++; continue; }
    for (const it of r.items) {
      const e = eqMap.get(it.equipmentId) || { equipmentId: it.equipmentId, name: nameOf.get(it.equipmentId) || `${it.equipmentId} (đã xóa khỏi kho)`, times: 0, quantity: 0 };
      e.times++; e.quantity += it.quantity || 0; eqMap.set(it.equipmentId, e);
    }
  }
  const byEquipment = [...eqMap.values()].sort((a, b) => b.times - a.times || b.quantity - a.quantity);
  const unusedEquipment = inventory.filter((e) => !eqMap.has(e.id)).map((e) => ({ equipmentId: e.id, name: e.name, subject: subjectName(e.subjectId) }));

  const tMap = new Map();
  for (const r of records) {
    const k = r.teacherName || "(không rõ)";
    const t = tMap.get(k) || { teacherName: k, count: 0, late: 0, damaged: 0, lost: 0 };
    t.count++;
    if (r.returnReport?.lateDays > 0) t.late++;
    for (const x of r.returnReport?.items || []) { t.damaged += x.damaged || 0; t.lost += x.lost || 0; }
    tMap.set(k, t);
  }
  const byTeacher = [...tMap.values()].sort((a, b) => b.count - a.count);

  const months = new Map();
  for (const r of records) { const d = parseDate(r.borrowDate); const k = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; months.set(k, (months.get(k) || 0) + 1); }
  const byMonth = [...months.entries()].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.slice(3).localeCompare(b.month.slice(3)) || a.month.localeCompare(b.month));

  const purchases = (await purchaseCol().all()).filter((p) => inRange(p.date, from, to));
  const maintenance = (await maintCol().all()).filter((m) => inRange(m.date, from, to));
  const penalties = (await penaltyCol().all()).filter((p) => isoIn(p.createdAt, from, to));
  const disposals = (await disposalCol().all()).filter((d) => inRange(d.date, from, to));

  const invBySubject = SUBJECTS.map((s) => {
    const list = inventory.filter((e) => e.subjectId === s.id);
    const sum = (k) => list.reduce((a, e) => a + (e[k] || 0), 0);
    return { subjectId: s.id, name: s.name, types: list.length, good: sum("qtyGood"), broken: sum("qtyBroken"), repair: sum("qtyRepair"), lost: sum("qtyLost"), disposed: sum("qtyDisposed"),
      value: list.reduce((a, e) => a + (e.qtyGood + e.qtyBroken + e.qtyRepair) * (e.unitPrice || 0), 0) };
  });

  return { value: {
    from: formatDate(from), to: formatDate(to), generatedAt: new Date().toISOString(), schoolYear: schoolYearOf(),
    summary: {
      records: records.length, pending: statusCount("Chờ duyệt"), borrowing: statusCount("Mượn"), returned: statusCount("Trả"), rejected: statusCount("Từ chối"),
      teachers: tMap.size, lateReturns: late.length, overdueNow, damaged: sumRep("damaged"), lost: sumRep("lost"), compensation,
      purchaseTotal: purchases.reduce((s, p) => s + p.total, 0), purchaseCount: purchases.length,
      maintenanceCount: maintenance.length, maintenanceCost: maintenance.reduce((s, m) => s + (m.cost || 0), 0),
      pointsDeducted: penalties.filter((p) => p.points < 0).reduce((s, p) => s + p.points, 0),
      inventoryValue: invBySubject.reduce((s, x) => s + x.value, 0),
      disposedCount: disposals.reduce((s, d) => s + d.quantity, 0), disposedValue: disposals.reduce((s, d) => s + d.value, 0),
    },
    bySubject, byEquipment, unusedEquipment, manualRecords: manual, byTeacher, byMonth, invBySubject,
    records: records.map((r) => ({ borrowDate: r.borrowDate, returnDate: r.returnDate, teacherName: r.teacherName, className: r.className, subject: r.subjectName, period: r.period,
      equipment: r.equipment, quantity: r.quantity, status: r.status, lateDays: r.returnReport?.lateDays || 0,
      damaged: (r.returnReport?.items || []).reduce((a, x) => a + x.damaged, 0), lost: (r.returnReport?.items || []).reduce((a, x) => a + x.lost, 0) })),
    inventory: inventory.map((e) => ({ code: e.id, unit: e.unit || "", origin: e.origin || "", yearInUse: e.yearInUse || "", fundSource: e.fundSource || "", name: e.name, subject: subjectName(e.subjectId), good: e.qtyGood, broken: e.qtyBroken, repair: e.qtyRepair, lost: e.qtyLost, disposed: e.qtyDisposed || 0, unitPrice: e.unitPrice || 0, location: e.location })),
    purchases, maintenance, disposals,
  } };
}

// =====================================================================
// NHẮC HẠN TRẢ
// =====================================================================
let lastAutoRun = "";

export async function runReminders() {
  const today = todayVN();
  const tomorrow = new Date(today.getTime() + DAY);
  const todayStr = formatDate(today);
  const res = { date: todayStr, due: 0, overdue: 0, sent: 0, noEmail: 0 };
  for (const r of await db.records.findActive()) {
    if (r.status !== "Mượn") continue;
    const due = parseDate(r.returnDate);
    if (!due) continue;
    if (due.getTime() === tomorrow.getTime() && r.remindedDue !== todayStr) {
      res.due++;
      if (!r.userEmail) { res.noEmail++; continue; }
      if (await sendReminderEmail(r, "due")) { res.sent++; await db.records.update(r.id, { remindedDue: todayStr }); }
    } else if (due < today) {
      const lateDays = Math.round((today - due) / DAY);
      const last = parseDate(r.lastOverdueReminder);
      if (last && today - last < 2 * DAY) continue; // nhắc quá hạn 2 ngày một lần
      res.overdue++;
      if (!r.userEmail) { res.noEmail++; continue; }
      if (await sendReminderEmail(r, "overdue", lateDays)) { res.sent++; await db.records.update(r.id, { lastOverdueReminder: todayStr }); }
    }
  }
  lastAutoRun = todayStr;
  console.log(`[Nhắc hạn] ${todayStr}: ${res.due} sắp đến hạn, ${res.overdue} quá hạn, đã gửi ${res.sent} email`);
  return res;
}

/** Khi server đang chạy: mỗi 30 phút kiểm tra, sau 7 giờ sáng (giờ VN) chạy nhắc một lần mỗi ngày */
export function startReminderScheduler(isReady) {
  const tick = () => {
    const vnHour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh", hour: "numeric", hour12: false }));
    if (isReady() && vnHour >= 7 && lastAutoRun !== formatDate(todayVN())) runReminders().catch((e) => console.error("[Nhắc hạn] Lỗi:", e.message));
  };
  setInterval(tick, 30 * 60 * 1000).unref();
  setTimeout(tick, 60 * 1000).unref();
}

// =====================================================================
// CHI TIẾT THIẾT BỊ (quét mã QR)
// =====================================================================
export async function equipmentDetail(id, user) {
  const eq = getEquipment(id);
  if (!eq) return { error: "Không tìm thấy thiết bị", status: 404 };
  const active = await db.records.findActive();
  const today = todayVN();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * DAY);
    days.push({ date: formatDate(d), available: availabilityOf(eq, d, d, active).available });
  }
  const { unitPrice, ...pub } = withDerived(eq);
  const out = { equipment: user.isAdmin ? { ...pub, unitPrice } : pub, subjectName: SUBJECTS.find((s) => s.id === eq.subjectId)?.name, days };
  if (user.isAdmin) {
    const all = await db.records.findAll();
    out.history = all.filter((r) => (r.items || []).some((x) => x.equipmentId === id)).slice(0, 10)
      .map((r) => ({ id: r.id, teacherName: r.teacherName, className: r.className, borrowDate: r.borrowDate, returnDate: r.returnDate, status: r.status,
        quantity: r.items.find((x) => x.equipmentId === id)?.quantity }));
    out.maintenance = (await maintCol().all()).filter((m) => m.equipmentId === id).slice(0, 10);
  }
  return { value: out };
}

// =====================================================================
// ĐỊNH TUYẾN
// =====================================================================
export function registerOperationRoutes(app, { requireAuth, requireAdmin, wrap }) {
  const send = (res, r, ok = 200) => (r.error ? res.status(r.status || 400).json({ error: r.error, ...(r.id ? { id: r.id } : {}) }) : res.status(ok).json(r.value));

  app.get("/api/inventory/equipment/:id/detail", requireAuth, wrap(async (req, res) => send(res, await equipmentDetail(req.params.id, req.session.user))));

  app.get("/api/audits", requireAdmin, wrap(async (req, res) => res.json(await listAudits())));
  app.post("/api/audits", requireAdmin, wrap(async (req, res) => send(res, await startAudit(req.session.user, req.body || {}), 201)));
  app.get("/api/audits/:id", requireAdmin, wrap(async (req, res) => send(res, await getAudit(req.params.id))));
  app.patch("/api/audits/:id", requireAdmin, wrap(async (req, res) => send(res, await saveAuditCounts(req.params.id, req.body || {}))));
  app.post("/api/audits/:id/finish", requireAdmin, wrap(async (req, res) => send(res, await finishAudit(req.params.id, req.session.user))));
  app.delete("/api/audits/:id", requireAdmin, wrap(async (req, res) => send(res, await cancelAudit(req.params.id))));

  app.get("/api/maintenance", requireAdmin, wrap(async (req, res) => res.json(await listMaintenance())));
  app.post("/api/maintenance", requireAdmin, wrap(async (req, res) => send(res, await createMaintenance(req.body || {}, req.session.user), 201)));
  app.post("/api/maintenance/:id/complete", requireAdmin, wrap(async (req, res) => send(res, await completeMaintenance(req.params.id, req.body || {}, req.session.user))));

  app.get("/api/disposals", requireAdmin, wrap(async (req, res) => res.json(await listDisposals())));
  app.post("/api/disposals", requireAdmin, wrap(async (req, res) => send(res, await createDisposal(req.body || {}, req.session.user), 201)));

  app.get("/api/reports", requireAdmin, wrap(async (req, res) => send(res, await buildReport(req.query || {}))));

  // Nhắc hạn trả: quản trị viên bấm tay, hoặc dịch vụ hẹn giờ (GitHub Actions) gọi kèm CRON_SECRET
  app.post("/api/cron/reminders", wrap(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const bySecret = secret && req.get("x-cron-secret") === secret;
    if (!bySecret && !req.session?.user?.isAdmin) return res.status(403).json({ error: "Không có quyền" });
    res.json(await runReminders());
  }));
}
