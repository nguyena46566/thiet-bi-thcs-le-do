/**
 * Kế hoạch quản lý, sử dụng thiết bị năm học (UC35) – lập, trình, duyệt, theo dõi thực hiện
 * Quyết định thành lập tổ kiểm kê / hội đồng thanh lý / hội đồng tiếp nhận (UC36)
 */
import db, { newId } from "./database.js";
import { principalConfigured } from "./auth.js";
import { schoolYearOf } from "./inventory.js";

const planCol = () => db.collection("plans");
const decCol = () => db.collection("decisions");
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
const canDecide = (u) => (principalConfigured() ? !!u?.isPrincipal : !!u?.isAdmin);

const SECTION_KEYS = ["canCu", "thuanLoi", "khoKhan", "mucTieu", "yeuCau", "chiTieu", "chiDao", "canBoThietBi", "kinhPhi"];

/** Lịch công tác mặc định theo năm học (đề xuất, trường sửa được) */
function defaultTasks(year) {
  const y = Number(year.slice(0, 4)), n = y + 1;
  const T = (name, start, end, owner) => ({ id: newId(), name, start, end, owner, done: false });
  return [
    T("Kiểm kê đầu năm", `${y}-08-17`, `${y}-08-28`, "Tổ kiểm kê"),
    T("Lập kế hoạch, tổng hợp đề xuất của các tổ", `${y}-08-24`, `${y}-09-04`, "Nhân viên thiết bị"),
    T("Hiệu trưởng duyệt kế hoạch", `${y}-09-05`, `${y}-09-05`, "Hiệu trưởng"),
    T("Xếp lịch phòng học bộ môn theo thời khóa biểu", `${y}-09-07`, `${y}-09-18`, "Tổ trưởng chuyên môn"),
    T("Mua sắm, bổ sung thiết bị", `${y}-10-05`, `${y}-12-18`, "Nhân viên thiết bị"),
    T("Kiểm tra, kiểm kê học kỳ I; báo cáo sơ kết", `${n}-01-04`, `${n}-01-15`, "Tổ kiểm kê"),
    T("Bảo dưỡng định kỳ (máy tính, thiết bị âm thanh, hóa chất)", `${n}-03-02`, `${n}-03-13`, "Nhân viên thiết bị"),
    T("Kiểm kê cuối năm; rà soát nhu cầu năm học mới", `${n}-05-17`, `${n}-05-28`, "Tổ kiểm kê"),
    T("Thanh lý, ghi giảm thiết bị hỏng", `${n}-06-01`, `${n}-06-11`, "Hội đồng thanh lý"),
    T("Báo cáo tổng kết gửi Phòng GD&ĐT", `${n}-06-15`, `${n}-06-15`, "Nhân viên thiết bị"),
  ];
}

function cleanPlan(b, cur = {}) {
  const sections = { ...(cur.sections || {}) };
  for (const k of SECTION_KEYS) if (b.sections?.[k] !== undefined) sections[k] = str(b.sections[k], 4000);
  const tasks = Array.isArray(b.tasks)
    ? b.tasks.slice(0, 60).map((t) => ({ id: str(t.id, 40) || newId(), name: str(t.name, 200), start: isoDate(t.start), end: isoDate(t.end) || isoDate(t.start), owner: str(t.owner, 80), done: !!t.done })).filter((t) => t.name)
    : cur.tasks;
  return { title: str(b.title ?? cur.title, 200), number: str(b.number ?? cur.number, 40), sections, tasks };
}

export function registerPlanningRoutes(app, { requireAdmin, wrap }) {
  // ----- Kế hoạch năm học -----
  app.get("/api/plans", requireAdmin, wrap(async (req, res) => res.json({ plans: await planCol().all(), canDecide: canDecide(req.session.user) })));
  app.post("/api/plans", requireAdmin, wrap(async (req, res) => {
    const year = schoolYearOf();
    const b = req.body || {};
    const doc = {
      id: newId(), schoolYear: year, status: "Nháp", createdBy: req.session.user.name, createdAt: new Date().toISOString(),
      ...cleanPlan({ title: `Kế hoạch quản lý, sử dụng thiết bị, đồ dùng dạy học năm học ${year.replace("-", " – ")}`, tasks: defaultTasks(year), ...b }),
    };
    if (!doc.tasks?.length) doc.tasks = defaultTasks(year);
    res.status(201).json(await planCol().insert(doc));
  }));
  app.patch("/api/plans/:id", requireAdmin, wrap(async (req, res) => {
    const cur = await planCol().get(req.params.id);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy kế hoạch" });
    const b = req.body || {};
    // Kế hoạch đã duyệt: chỉ cập nhật tiến độ (đánh dấu việc đã xong), không sửa nội dung
    if (cur.status === "Đã duyệt") {
      if (!Array.isArray(b.tasks)) return res.status(409).json({ error: "Kế hoạch đã duyệt chỉ cập nhật được tiến độ" });
      const doneIds = new Set(b.tasks.filter((t) => t.done).map((t) => t.id));
      return res.json(await planCol().update(cur.id, { tasks: cur.tasks.map((t) => ({ ...t, done: doneIds.has(t.id) })) }));
    }
    if (cur.status === "Chờ duyệt") return res.status(409).json({ error: "Kế hoạch đang chờ duyệt, không sửa được" });
    res.json(await planCol().update(cur.id, { ...cleanPlan(b, cur), updatedAt: new Date().toISOString() }));
  }));
  app.post("/api/plans/:id/submit", requireAdmin, wrap(async (req, res) => {
    const cur = await planCol().get(req.params.id);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy kế hoạch" });
    if (!["Nháp", "Trả lại"].includes(cur.status)) return res.status(409).json({ error: "Kế hoạch không ở trạng thái nháp" });
    if (!cur.sections?.chiTieu || !cur.tasks?.length) return res.status(400).json({ error: "Cần có chỉ tiêu và lịch công tác trước khi trình duyệt" });
    res.json(await planCol().update(cur.id, { status: "Chờ duyệt", submittedAt: new Date().toISOString(), submittedBy: req.session.user.name }));
  }));
  app.post("/api/plans/:id/decide", requireAdmin, wrap(async (req, res) => {
    if (!canDecide(req.session.user)) return res.status(403).json({ error: "Chỉ Ban giám hiệu được duyệt kế hoạch" });
    const cur = await planCol().get(req.params.id);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy kế hoạch" });
    if (cur.status !== "Chờ duyệt") return res.status(409).json({ error: "Kế hoạch chưa được trình duyệt" });
    const approve = !!req.body?.approve, note = str(req.body?.note, 500);
    if (!approve && !note) return res.status(400).json({ error: "Trả lại kế hoạch cần ghi ý kiến" });
    res.json(await planCol().update(cur.id, { status: approve ? "Đã duyệt" : "Trả lại", decidedBy: req.session.user.name, decidedAt: new Date().toISOString(), decisionNote: note }));
  }));
  app.delete("/api/plans/:id", requireAdmin, wrap(async (req, res) => {
    const cur = await planCol().get(req.params.id);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy kế hoạch" });
    if (cur.status === "Đã duyệt") return res.status(409).json({ error: "Không xóa kế hoạch đã duyệt" });
    res.json(await planCol().remove(cur.id));
  }));

  // ----- Quyết định thành lập tổ kiểm kê, hội đồng -----
  const TYPES = ["Tổ kiểm kê", "Hội đồng thanh lý", "Hội đồng tiếp nhận, bàn giao"];
  const cleanDec = (b) => {
    const type = TYPES.includes(b.type) ? b.type : null;
    if (!type) return { error: "Loại quyết định không hợp lệ" };
    const members = (Array.isArray(b.members) ? b.members : []).slice(0, 20).map((m) => ({ name: str(m.name, 80), position: str(m.position, 80), duty: str(m.duty, 40) || "Thành viên" })).filter((m) => m.name);
    if (members.length < 2) return { error: "Cần ít nhất 2 thành viên" };
    return { value: { type, number: str(b.number, 40), date: isoDate(b.date) || new Date().toLocaleDateString("sv-SE"), scope: str(b.scope, 500), from: isoDate(b.from), to: isoDate(b.to), members, duties: str(b.duties, 1500) } };
  };
  app.get("/api/decisions", requireAdmin, wrap(async (req, res) => res.json(await decCol().all())));
  app.post("/api/decisions", requireAdmin, wrap(async (req, res) => {
    const v = cleanDec(req.body || {});
    if (v.error) return res.status(400).json(v);
    res.status(201).json(await decCol().insert({ id: newId(), ...v.value, createdBy: req.session.user.name, createdAt: new Date().toISOString() }));
  }));
  app.patch("/api/decisions/:id", requireAdmin, wrap(async (req, res) => {
    if (!(await decCol().get(req.params.id))) return res.status(404).json({ error: "Không tìm thấy quyết định" });
    const v = cleanDec(req.body || {});
    if (v.error) return res.status(400).json(v);
    res.json(await decCol().update(req.params.id, v.value));
  }));
  app.delete("/api/decisions/:id", requireAdmin, wrap(async (req, res) => res.json(await decCol().remove(req.params.id))));
}
