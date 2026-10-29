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
  requireAuth,
  requireAdmin,
} from "./auth.js";
import notifications from "./notifications.js";
import { sendBorrowNotification, sendStatusEmail } from "./mailer.js";
import { createChatRouter } from "./chat.js";
import { SUBJECTS } from "./chatTools.js";
import {
  parseDate, formatDate, hoursUntilBorrow, MIN_NOTICE_HOURS, PERIOD_START,
  getEquipment, availabilityOf,
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
await db.init();

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
app.use(express.json({ limit: "100kb" }));
app.use(
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

// ============ Serve frontend (production only) ============
const distPath = path.join(__dirname, "..", "dist");
if (isProd) {
  // File trong /assets có hash trong tên -> cache lâu dài; index.html thì không cache
  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(express.static(distPath, { index: false, maxAge: "1h" }));
}

// ============ AUTH ROUTES (Google OAuth) ============

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.session?.user || null });
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

    const user = {
      id: profile.id,
      email: profile.email,
      name: profile.name || profile.email,
      avatar: profile.picture || null,
      isAdmin: isAdmin(profile.email),
    };

    // Tạo session mới sau khi đăng nhập (chống session fixation)
    req.session.regenerate((err) => {
      if (err) { console.error("Session error:", err); return res.redirect("/?error=callback_failed"); }
      req.session.user = user;
      req.session.save(() => res.redirect(FRONTEND_URL || "/"));
    });
    console.log(`Login: ${user.email} - Admin: ${user.isAdmin}`);
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

  const subject = SUBJECTS.find((s) => s.id === b.subjectId);
  if (!subject) return res.status(400).json({ error: "Môn học không hợp lệ" });

  const teacherName = str(b.teacherName, 80);
  const className = str(b.className, 20);
  const equipmentText = str(b.equipment, 500);
  const period = str(b.period, 20);
  const periodPPCT = str(b.periodPPCT, 120);
  const notes = str(b.notes, 500);
  if (!teacherName || !className || !equipmentText || !b.borrowDate || !b.returnDate) {
    return res.status(400).json({ error: "Điền đầy đủ thông tin" });
  }
  if (period && !(period in PERIOD_START)) return res.status(400).json({ error: "Tiết dạy không hợp lệ" });

  const from = parseDate(b.borrowDate);
  const to = parseDate(b.returnDate);
  if (!from || !to) return res.status(400).json({ error: "Ngày không hợp lệ, hãy nhập theo dạng DD/MM/YYYY" });
  if (to < from) return res.status(400).json({ error: "Ngày trả phải sau hoặc bằng ngày mượn" });

  // Nội quy: đăng ký trước ít nhất 24 giờ (admin được phép đăng ký gấp)
  if (!user.isAdmin) {
    const hours = hoursUntilBorrow(b.borrowDate, period);
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
      const { available } = availabilityOf(eq, from, to, active);
      if (available < qty) {
        return res.status(409).json({ error: `"${eq.name}" chỉ còn ${available} trong khoảng ngày này (bạn cần ${qty}).` });
      }
      items.push({ equipmentId: eq.id, quantity: qty });
    }
  }

  // id luôn do server tạo, không nhận từ trình duyệt
  const newRecord = {
    id: newId(),
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
  if (status === "Trả") changes.returnedAt = changes.updatedAt;
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
app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT} | Lưu trữ: ${db.kind}`);
});
