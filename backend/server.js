import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import db, { newId } from "./database.js";
import {
  getGoogleAuthURL,
  exchangeCodeForToken,
  getGoogleProfile,
  verifyOAuthState,
  isAdmin,
  isPrincipal,
  principalConfigured,
  requireAuth,
  requireAdmin,
} from "./auth.js";
import notifications from "./notifications.js";
import { initInventory, registerInventoryRoutes, processReturn, undoReturn, scoreOf, RULES, schoolYearOf } from "./inventory.js";
import { registerOperationRoutes, startReminderScheduler } from "./operations.js";
import { initMinlist, registerMinlistRoutes } from "./minlist.js";
import { registerPlanningRoutes } from "./planning.js";
import { initUsers, registerUserRoutes, resolveGoogle, refreshSessionUser, landingOf } from "./users.js";
import { registerRolePageRoutes } from "./rolepages.js";
import { registerLibraryRoutes } from "./library.js";
import { registerCirculationRoutes } from "./circulation.js";
import { registerOpsRoutes, logLogin, pruneLoginLog } from "./ops.js";
import { registerDemoRoutes } from "./demo.js";
import { registerPrivacyRoutes, anonymizeOldGuests } from "./privacy.js";
import { listInventory } from "./inventory.js";
import { sendBorrowNotification, sendStatusEmail } from "./mailer.js";
import { createChatRouter } from "./chat.js";
import { SUBJECTS } from "./chatTools.js";
import {
  parseDate, formatDate, hoursUntilBorrow, MIN_NOTICE_HOURS,
  getEquipment, availabilityOf, normalizeSlots, slotLabel, requestCells, recordCovers, isExpired,
} from "./equipment.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "";
const isProd = process.env.NODE_ENV === "production";

// ============ Kiểm tra cấu hình ============
if (isProd && !process.env.SESSION_SECRET) {
  console.error("Thiếu SESSION_SECRET. Không chạy production với secret mặc định.");
  process.exit(1);
}
if (isProd && db.kind === "file") {
  console.warn("⚠️  Chưa có DATABASE_URL: dữ liệu đang lưu vào file và SẼ MẤT khi Render deploy lại / khởi động lại.");
}
// Trạng thái kết nối CSDL: server mở cổng ngay, kết nối CSDL chạy nền và tự thử lại
let dbReady = false;
let dbError = "";

// ============ Session store ============
let sessionStore; // undefined = MemoryStore (chỉ dùng khi chạy thử trên máy)
if (db.kind === "postgres") {
  const { default: connectPgSimple } = await import("connect-pg-simple");
  const PgSession = connectPgSimple(session);
  sessionStore = new PgSession({ pool: db.pool, tableName: "user_sessions", createTableIfMissing: true });
}

// ============ Middleware ============
if (isProd) app.set("trust proxy", 1); // Render đứng sau proxy HTTPS
app.disable("x-powered-by");
app.use(cors({ origin: FRONTEND_URL || true, credentials: true }));
// Khi CSDL chưa sẵn sàng: API trả 503 thay vì treo; trang giao diện vẫn tải bình thường
app.use("/api", (req, res, next) => {
  if (dbReady) return next();
  // Bấm đăng nhập lúc máy chủ chưa sẵn sàng: quay về trang chủ thay vì hiện lỗi dạng JSON
  if (req.path.startsWith("/auth/google")) return res.redirect("/?error=server_starting");
  res.status(503).json({ error: "Máy chủ đang kết nối cơ sở dữ liệu, vui lòng thử lại sau ít giây." });
});
app.use(express.json({ limit: "100kb" }));
// Phiên đăng nhập chỉ cần cho API: trang giao diện vẫn tải được kể cả khi CSDL đang lỗi
app.use(
  "/api",
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "dev-only-secret",
    resave: false,
    saveUninitialized: false,
    proxy: isProd,
    cookie: {
      secure: isProd,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  })
);

// Bọc route async: lỗi sẽ được trả về 500 thay vì làm treo request
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Quyền lấy từ danh sách người dùng ở mỗi yêu cầu: đổi vai trò hoặc khóa tài khoản có hiệu lực ngay
app.use("/api", refreshSessionUser);

// ============ Serve frontend (production only) ============
const distPath = path.join(__dirname, "..", "dist");
if (isProd) {
  // File trong /assets có hash trong tên -> cache lâu dài; index.html thì không cache
  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(express.static(distPath, { index: false, maxAge: "1h" }));
}

// ============ AUTH ROUTES (Google OAuth) ============

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.session?.user || null, pending: req.session?.user ? null : req.session?.pending || null });
});

app.get("/api/auth/google/login", (req, res) => {
  try {
    const authURL = getGoogleAuthURL(req);
    req.session.save(() => res.redirect(authURL));
  } catch (err) {
    console.error("Google login error:", err);
    res.redirect("/?error=login_failed");
  }
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, error, state } = req.query;
  if (error || !code) return res.redirect("/?error=auth_denied");
  if (!verifyOAuthState(req, state)) return res.redirect("/?error=invalid_state");

  try {
    const tokenData = await exchangeCodeForToken(code);
    const profile = await getGoogleProfile(tokenData.access_token);
    if (!profile.email || profile.verified_email === false) return res.redirect("/?error=email_not_verified");

    // Tài khoản phải được quản trị hệ thống duyệt (trừ ADMIN_EMAILS / PRINCIPAL_EMAILS)
    const r = await resolveGoogle(profile);
    await logLogin(req, { method: "Google", email: profile.email, userId: profile.id, name: profile.name || profile.email, result: r.locked ? "Tài khoản bị khóa" : r.pending ? "Chờ duyệt" : "Thành công" });
    if (r.locked) return res.redirect("/?error=locked");
    // Tạo session mới sau khi đăng nhập (chống session fixation)
    req.session.regenerate((err) => {
      if (err) { console.error("Session error:", err); return res.redirect("/?error=callback_failed"); }
      if (r.pending) { req.session.pending = r.pending; return req.session.save(() => res.redirect(`${FRONTEND_URL || ""}/#cho-duyet`)); }
      req.session.user = r.user;
      const landing = landingOf(r.user);
      req.session.save(() => res.redirect(`${FRONTEND_URL || ""}/${landing ? `#${landing}` : ""}`));
    });
    console.log(`Login: ${profile.email} - ${r.pending ? "chờ duyệt" : r.user.roles.join(",")}`);
  } catch (err) {
    console.error("Google callback error:", err.message);
    res.redirect("/?error=callback_failed");
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Lỗi" });
    res.clearCookie("connect.sid");
    res.json({ message: "Đã đăng xuất" });
  });
});

// ============ RECORD ROUTES ============

const STATUSES = ["Chờ duyệt", "Mượn", "Trả", "Từ chối"];
const str = (v, max) => String(v ?? "").trim().slice(0, max);

/** Ẩn thông tin tài khoản khi người xem không phải admin */
function publicView(r, viewer) {
  if (viewer?.isAdmin) return r;
  const { userId, userEmail, ...rest } = r;
  return rest;
}

app.get("/api/records", wrap(async (req, res) => {
  const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : undefined;
  const list = await db.records.findAll({ subjectId, status, search });
  res.json(list.map((r) => publicView(r, req.session?.user)));
}));

// Phiếu của người đang đăng nhập
app.get("/api/records/mine", requireAuth, wrap(async (req, res) => {
  const list = await db.records.findByUser(req.session.user.id);
  res.json(list.map(({ userEmail, ...r }) => r));
}));

app.post("/api/records", requireAuth, wrap(async (req, res) => {
  const user = req.session.user;
  const b = req.body || {};

  // Quy chế: điểm thi đua dưới ngưỡng thì tạm khóa quyền đăng ký (quản trị viên không bị khóa)
  if (!user.isAdmin) {
    const { score, locked } = await scoreOf(user.id);
    if (locked) return res.status(403).json({ error: `Tài khoản đang tạm khóa quyền mượn vì điểm thi đua còn ${score} (dưới ${RULES.lockBelow}). Vui lòng liên hệ phòng thiết bị.` });
  }

  const subject = SUBJECTS.find((s) => s.id === b.subjectId);
  if (!subject) return res.status(400).json({ error: "Môn học không hợp lệ" });

  const teacherName = str(b.teacherName, 80);
  const className = str(b.className, 20);
  const equipmentText = str(b.equipment, 500);
  // Tiết sử dụng: mảng mã tiết (S1..S5 sáng, C1..C5 chiều); phiếu cũ gửi "Tiết n"
  const slots = normalizeSlots(Array.isArray(b.periods) && b.periods.length ? b.periods : [b.period]);
  const period = slotLabel(slots);
  const periodPPCT = str(b.periodPPCT, 120);
  const lessonName = str(b.lessonName, 150);
  const usageType = b.usageType === "Thực hành" ? "Thực hành" : "Biểu diễn";
  const notes = str(b.notes, 500);
  if (!teacherName || !className || !equipmentText || !b.borrowDate || !b.returnDate) {
    return res.status(400).json({ error: "Điền đầy đủ thông tin" });
  }
  if (!slots.length) return res.status(400).json({ error: "Chọn ít nhất một tiết dạy" });

  const from = parseDate(b.borrowDate);
  const to = parseDate(b.returnDate);
  if (!from || !to) return res.status(400).json({ error: "Ngày không hợp lệ, hãy nhập theo dạng DD/MM/YYYY" });
  if (to < from) return res.status(400).json({ error: "Ngày trả phải sau hoặc bằng ngày mượn" });

  // Nội quy: đăng ký trước ít nhất 24 giờ (admin được phép đăng ký gấp)
  if (!user.isAdmin) {
    const hours = hoursUntilBorrow(b.borrowDate, slots);
    if (hours < MIN_NOTICE_HOURS) {
      return res.status(400).json({ error: `Theo nội quy, phải đăng ký trước ít nhất ${MIN_NOTICE_HOURS} giờ so với giờ dạy.` });
    }
  }

  // Phiếu do chatbot soạn có danh sách mã thiết bị -> kiểm tra tồn kho thật
  let items;
  if (Array.isArray(b.items) && b.items.length) {
    items = [];
    const active = await db.records.findActive();
    for (const it of b.items.slice(0, 20)) {
      const eq = getEquipment(it?.equipmentId);
      const qty = Math.floor(Number(it?.quantity));
      if (!eq || !qty || qty < 1 || qty > 100) return res.status(400).json({ error: "Danh sách thiết bị không hợp lệ" });
      if (isExpired(eq)) return res.status(409).json({ error: `“${eq.name}” đã hết hạn sử dụng (${eq.expiry}), không cho mượn.` });
      const av = availabilityOf(eq, from, to, active, slots);
      if (av.available < qty) {
        const who = av.conflicts.slice(0, 3).map((c) => `${c.teacherName} (lớp ${c.className}, ${c.quantity})`).join(", ");
        return res.status(409).json({ error: `Trùng lịch: “${eq.name}” chỉ còn ${av.available}/${av.stock} lúc ${av.at} (bạn cần ${qty})${who ? `. Đã đăng ký trước: ${who}` : ""}.` });
      }
      items.push({ equipmentId: eq.id, quantity: qty });
    }
  }

  // Phòng bộ môn (nếu chọn): không cho hai phiếu dùng cùng phòng ở cùng tiết
  let room = null;
  if (b.roomId) {
    room = await db.collection("rooms").get(String(b.roomId));
    if (!room) return res.status(400).json({ error: "Phòng không tồn tại" });
    const active = await db.records.findActive();
    const cells = requestCells(from, to, slots);
    const clash = active.find((r) => r.roomId === room.id && cells.some(([d, sl]) => recordCovers(r, d, sl)));
    if (clash) return res.status(409).json({ error: `Trùng lịch phòng: ${room.name} đã được ${clash.teacherName} (lớp ${clash.className}) đăng ký ${clash.borrowDate} ${clash.period}.` });
  }

  // R11: thiết bị giá trị cao mượn nhiều ngày cần duyệt đặc biệt
  const HIGH_VALUE = Number(process.env.HIGH_VALUE_VND) || 5_000_000;
  const multiDay = from.getTime() !== to.getTime();
  const highItems = multiDay ? (items || []).map((it) => getEquipment(it.equipmentId)).filter((e) => e && (e.highValue || (e.unitPrice || 0) >= HIGH_VALUE)) : [];

  // Số phiếu: PM<năm học>-<số thứ tự trong năm học>
  const year = schoolYearOf();
  const seq = (await db.records.findAll()).filter((r) => r.code?.startsWith(`PM${year.slice(2, 4)}${year.slice(7, 9)}-`)).length + 1;

  // id luôn do server tạo, không nhận từ trình duyệt
  const newRecord = {
    id: newId(),
    code: `PM${year.slice(2, 4)}${year.slice(7, 9)}-${String(seq).padStart(4, "0")}`,
    group: subject.group || "",
    lessonName,
    usageType,
    periods: slots,
    ...(highItems.length && { needsSpecialApproval: true, specialReason: `Mượn nhiều ngày thiết bị giá trị cao: ${highItems.map((e) => e.name).join(", ")}` }),
    ...(room && { roomId: room.id, roomName: room.name }),
    subjectId: subject.id,
    subjectName: subject.name,
    teacherName,
    className,
    equipment: equipmentText,
    ...(items && { items }),
    quantity: items ? items.reduce((sum, it) => sum + it.quantity, 0) : 1,
    borrowDate: formatDate(from),
    returnDate: formatDate(to),
    notes,
    period,
    periodPPCT,
    status: "Chờ duyệt",
    userId: user.id,
    userName: user.name,
    userEmail: user.email, // chỉ dùng để gửi email báo kết quả, không trả ra danh sách công khai
    createdByAdmin: !!user.isAdmin, // admin đăng ký hộ: điểm thi đua tính theo tên giáo viên
    createdAt: new Date().toISOString(),
  };

  await db.records.create(newRecord);
  await notifications.createNotification({
    type: "borrow",
    title: "Yêu cầu mượn mới",
    message: `${teacherName} yêu cầu mượn "${equipmentText}" (${subject.name}) - Chờ duyệt`,
    recordId: newRecord.id, userId: user.id, userName: user.name,
  });
  sendBorrowNotification(newRecord); // không chờ gửi mail xong mới trả lời
  res.status(201).json(newRecord);
}));

app.patch("/api/records/:id/status", requireAdmin, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "Sai trạng thái" });
  const reason = str(req.body?.reason, 300);
  const existing = await db.records.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Không tìm thấy" });

  const changes = { status, updatedAt: new Date().toISOString() };
  if (status === "Từ chối") changes.adminNote = reason;
  if (status === "Mượn" && existing.status === "Chờ duyệt") {
    if (existing.needsSpecialApproval) {
      if (principalConfigured() && !req.session.user.isPrincipal) return res.status(403).json({ error: "Phiếu mượn nhiều ngày thiết bị giá trị cao: chỉ Ban giám hiệu được duyệt" });
      const note = str(req.body?.specialApprovalNote, 300);
      if (!note) return res.status(409).json({ error: existing.specialReason + ". Cần ghi xác nhận đã được Ban giám hiệu đồng ý.", needsSpecialApproval: true });
      changes.specialApproval = { note, by: req.session.user.name, at: changes.updatedAt };
    }
    changes.approvedAt = changes.updatedAt; changes.approvedBy = req.session.user.name;
  }
  if (status === "Trả" && existing.status !== "Trả") {
    changes.returnedAt = changes.updatedAt;
    // Ghi nhận hỏng / mất, tính điểm trả trễ
    const r = await processReturn(existing, req.body?.returnReport, req.session.user);
    if (r.error) return res.status(r.status || 400).json({ error: r.error });
    Object.assign(changes, r.value);
  }
  if (existing.status === "Trả" && status !== "Trả") {
    // Hoàn tác trả: trả lại số lượng kho, xóa điểm đã trừ của phiếu này
    const u = await undoReturn(existing);
    if (u.error) return res.status(u.status || 400).json({ error: u.error });
    changes.returnReport = null;
    changes.returnedAt = null;
  }
  const updated = await db.records.update(req.params.id, changes);
  // Báo kết quả cho giáo viên khi phiếu được duyệt/từ chối lần đầu (không chờ gửi xong)
  if (existing.status === "Chờ duyệt" && (status === "Mượn" || status === "Từ chối")) {
    sendStatusEmail(updated, status, reason);
  }
  const actionText = { "Mượn": "Đã duyệt cho mượn", "Trả": "Đã trả", "Từ chối": "Đã từ chối", "Chờ duyệt": "Chờ duyệt" }[status];
  await notifications.createNotification({
    type: status === "Trả" ? "return" : "system",
    title: actionText,
    message: `"${existing.equipment}" - ${existing.teacherName}`,
    recordId: req.params.id, userId: req.session.user.id, userName: req.session.user.name,
  });
  res.json(updated);
}));

// Admin xóa bất kỳ phiếu nào; giáo viên chỉ hủy được phiếu "Chờ duyệt" của chính mình
app.delete("/api/records/:id", requireAuth, wrap(async (req, res) => {
  const user = req.session.user;
  const existing = await db.records.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Không tìm thấy" });
  if (!user.isAdmin) {
    if (existing.userId !== user.id) return res.status(403).json({ error: "Không có quyền" });
    if (existing.status !== "Chờ duyệt") return res.status(409).json({ error: "Chỉ hủy được yêu cầu đang chờ duyệt" });
  }
  await db.records.remove(req.params.id);
  if (!user.isAdmin) {
    await notifications.createNotification({
      type: "system",
      title: "Giáo viên hủy yêu cầu",
      message: `${existing.teacherName} đã hủy yêu cầu mượn "${existing.equipment}" (${existing.subjectName})`,
      recordId: existing.id, userId: user.id, userName: user.name,
    });
  }
  res.json({ message: user.isAdmin ? "Đã xóa" : "Đã hủy yêu cầu" });
}));

// ============ STATS ============
app.get("/api/stats", wrap(async (req, res) => res.json(await db.records.stats())));
app.get("/api/stats/:subjectId", wrap(async (req, res) => res.json(await db.records.stats(req.params.subjectId))));

// ============ NOTIFICATIONS ============
app.get("/api/notifications", requireAdmin, wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  res.json(await notifications.getNotifications({ limit, unreadOnly: req.query.unreadOnly === "true" }));
}));
app.get("/api/notifications/unread-count", requireAdmin, wrap(async (req, res) => {
  res.json({ count: await notifications.getUnreadCount() });
}));
app.patch("/api/notifications/:id/read", requireAdmin, wrap(async (req, res) => {
  const r = await notifications.markAsRead(req.params.id);
  if (!r) return res.status(404).json({ error: "Không tìm thấy" });
  res.json(r);
}));
app.post("/api/notifications/mark-all-read", requireAdmin, wrap(async (req, res) => {
  res.json(await notifications.markAllAsRead());
}));

// ============ CHAT (AI chatbot) ============
app.use("/api/chat", createChatRouter({ requireAuth }));

// API không tồn tại -> 404 JSON (không trả về index.html)
// ============ KHO THIẾT BỊ, NHẬP KHO, ĐIỂM THI ĐUA ============
registerInventoryRoutes(app, { requireAuth, requireAdmin, wrap });
// ============ KIỂM KÊ, BẢO TRÌ, BÁO CÁO, NHẮC HẠN TRẢ ============
registerOperationRoutes(app, { requireAuth, requireAdmin, wrap });
// ============ DANH MỤC THIẾT BỊ TỐI THIỂU (TT 38/2021) ============
registerMinlistRoutes(app, { requireAdmin, wrap, getInventory: listInventory });
// ============ NGƯỜI DÙNG, PHÂN QUYỀN, TRANG RIÊNG THEO VAI TRÒ ============
registerUserRoutes(app, { requireAuth, requireAdmin, wrap });
registerRolePageRoutes(app, { requireAuth, wrap });
// ============ THƯ VIỆN: NHẬN SÁCH THEO HÓA ĐƠN, ĐKCB, KỆ SÁCH ============
registerLibraryRoutes(app, { requireAuth, wrap });
registerCirculationRoutes(app, { requireAuth, wrap });
// ============ VẬN HÀNH: SAO LƯU, KHÔI PHỤC, NHẬT KÝ ĐĂNG NHẬP, TRẠNG THÁI ============
registerOpsRoutes(app, { requireAuth, wrap, express });
registerDemoRoutes(app, { requireAuth, wrap });
// ============ DỮ LIỆU CÁ NHÂN: ĐỒNG Ý, HỒ SƠ CỦA TÔI, KHÁCH VÃNG LAI ============
registerPrivacyRoutes(app, { requireAuth, requireAdmin, wrap });
// ============ KẾ HOẠCH NĂM HỌC, QUYẾT ĐỊNH THÀNH LẬP TỔ / HỘI ĐỒNG ============
registerPlanningRoutes(app, { requireAdmin, wrap });

app.use("/api", (req, res) => res.status(404).json({ error: "Không tìm thấy API" }));

// ============ SPA fallback (production only) ============
if (isProd) {
  app.get("*", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ============ Xử lý lỗi chung ============
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    return res.status(400).json({ error: "Dữ liệu gửi lên không hợp lệ" });
  }
  console.error("Server error:", err);
  res.status(500).json({ error: "Lỗi máy chủ, vui lòng thử lại" });
});

// ============ START ============
// Mở cổng TRƯỚC để Render nhận ra dịch vụ đang chạy (tránh lỗi "no open ports detected")
app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT} | Lưu trữ: ${db.kind}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ Cổng ${PORT} đang bị một chương trình khác chiếm (thường là một cửa sổ backend khác vẫn đang chạy).`);
    console.error("   Cách xử lý: đóng terminal backend cũ, hoặc chạy trong PowerShell:");
    console.error(`   Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
    process.exit(1);
  }
  throw err;
});

// Kết nối CSDL ở nền; lỗi thì ghi log rõ ràng và thử lại (5s, 10s, ... tối đa 60s), không làm sập server
const DB_INIT_TIMEOUT_MS = 20_000;
async function connectDatabase(attempt = 1) {
  try {
    await Promise.race([
      db.init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`quá ${DB_INIT_TIMEOUT_MS / 1000} giây không phản hồi`)), DB_INIT_TIMEOUT_MS)),
    ]);
    await initInventory(); // khởi tạo kho thiết bị (lần đầu chép từ catalog/equipment.json)
    await initMinlist(); // nạp danh mục tối thiểu theo Thông tư 38/2021
    await initUsers(); // người dùng, phân quyền, tài khoản thử nghiệm
    await anonymizeOldGuests(); // ẩn danh khách quá thời hạn lưu
    await pruneLoginLog();
    setInterval(() => { anonymizeOldGuests().catch(() => {}); pruneLoginLog().catch(() => {}); }, 24 * 3600e3).unref();
    dbReady = true;
    dbError = "";
    console.log(`[DB] Kết nối ${db.kind} thành công${attempt > 1 ? ` sau ${attempt} lần thử` : ""}`);
  } catch (err) {
    dbError = err.message;
    const wait = Math.min(60, 5 * attempt);
    console.error(`[DB] Kết nối thất bại (lần ${attempt}): ${err.message}. Thử lại sau ${wait} giây.`);
    if (/tenant|password authentication|ENOTFOUND/i.test(err.message)) {
      console.error("[DB] Gợi ý: kiểm tra DATABASE_URL (chuỗi Session pooler của Supabase) và project Supabase có đang bị tạm dừng không.");
    }
    setTimeout(() => connectDatabase(attempt + 1), wait * 1000);
  }
}
connectDatabase();
startReminderScheduler(() => dbReady);
