/** Dữ liệu cho trang riêng của Ban giám hiệu và tổ trưởng chuyên môn */
import db from "./database.js";
import { SUBJECTS } from "./chatTools.js";
import { listLossReports, listChanges } from "./inventory.js";
import { parseDate, todayVN } from "./equipment.js";

const clean = ({ emailToken, emailTokenExpires, ...x }) => x;

export function registerRolePageRoutes(app, { requireAuth, wrap }) {
  app.get("/api/principal/overview", requireAuth, wrap(async (req, res) => {
    const u = req.session.user;
    if (!u.isPrincipal) return res.status(403).json({ error: "Trang dành cho Ban giám hiệu" });
    const records = await db.records.findAll();
    const today = todayVN();
    const month = records.filter((r) => { const d = parseDate(r.borrowDate); return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); });
    res.json({
      losses: (await listLossReports()).filter((x) => x.status === "Chờ xác nhận").map(clean),
      proposals: (await db.collection("proposals").all()).filter((p) => p.status === "Chờ duyệt").map(clean),
      plans: (await db.collection("plans").all()).filter((p) => p.status === "Chờ duyệt"),
      // Đề nghị thanh lý chờ duyệt (nhân viên thiết bị lập, Ban giám hiệu duyệt kèm số quyết định)
      disposals: (await db.collection("disposals").all()).filter((d) => d.status === "Chờ duyệt"),
      // Giám sát: các lần sửa tay làm GIẢM số lượng trong 30 ngày qua (nơi dễ che giấu thất thoát)
      directEdits: (await listChanges()).filter((c) => c.kind === "Sửa trực tiếp" && Object.values(c.diff || {}).some((v) => v < 0) && c.createdAt >= new Date(Date.now() - 30 * 864e5).toISOString()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
      special: records.filter((r) => r.needsSpecialApproval && r.status === "Chờ duyệt"),
      stats: {
        monthRecords: month.filter((r) => r.status !== "Từ chối").length,
        borrowing: records.filter((r) => r.status === "Mượn").length,
        overdue: records.filter((r) => r.status === "Mượn" && parseDate(r.returnDate) < today).length,
        pending: records.filter((r) => r.status === "Chờ duyệt").length,
      },
    });
  }));

  app.get("/api/head/overview", requireAuth, wrap(async (req, res) => {
    const u = req.session.user;
    if (!u.isHead) return res.status(403).json({ error: "Trang dành cho tổ trưởng chuyên môn" });
    const group = u.group;
    const subjects = SUBJECTS.filter((s) => s.group === group);
    const ids = new Set(subjects.map((s) => s.id));
    const records = (await db.records.findAll()).filter((r) => ids.has(r.subjectId));
    const proposals = (await db.collection("proposals").all()).filter((p) => p.items.some((it) => ids.has(it.subjectId))).map(clean);
    res.json({ group, subjects, records, proposals });
  }));
}
