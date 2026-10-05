import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import db from "./database.js";
import {
  getGoogleAuthURL,
  exchangeCodeForToken,
  getGoogleProfile,
  isAdmin,
  requireAuth,
  requireAdmin,
} from "./auth.js";
import notifications from "./notifications.js";
import { sendBorrowNotification } from "./mailer.js";
import { createChatRouter } from "./chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "";

// Middleware
app.use(cors({ origin: FRONTEND_URL || true, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
    ...(process.env.NODE_ENV === "production" && { proxy: true }),
  })
);

// ============ Serve frontend (production only) ============
const distPath = path.join(__dirname, "..", "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distPath));
}

// ============ AUTH ROUTES (Google OAuth) ============

app.get("/api/auth/me", (req, res) => {
  if (!req.session?.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

app.get("/api/auth/google/login", (req, res) => {
  try {
    const authURL = getGoogleAuthURL(req);
    res.redirect(authURL);
  } catch (err) {
    console.error("Google login error:", err);
    res.redirect("/?error=login_failed");
  }
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect("/?error=auth_denied");

  try {
    const tokenData = await exchangeCodeForToken(code);
    const profile = await getGoogleProfile(tokenData.access_token);

    const user = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      avatar: profile.picture || null,
      isAdmin: isAdmin(profile.email),
    };

    req.session.user = user;
    console.log(`Login: ${user.name} (${user.email}) - Admin: ${user.isAdmin}`);
    res.redirect(FRONTEND_URL || "/");
  } catch (err) {
    console.error("Google callback error:", err);
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

app.get("/api/records", (req, res) => {
  const { subjectId, status, search } = req.query;
  try { res.json(db.findAll({ subjectId, status, search })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/records", requireAuth, (req, res) => {
  const { id, subjectId, subjectName, teacherName, className, equipment, borrowDate, returnDate, notes, period, periodPPCT } = req.body;

  if (!subjectId || !subjectName || !teacherName || !className || !equipment || !borrowDate || !returnDate) {
    return res.status(400).json({ error: "Điền đầy đủ thông tin" });
  }

  // User gửi yêu cầu -> trạng thái "Chờ duyệt", admin duyệt sau
  const newRecord = {
    id: id || Date.now().toString(), subjectId, subjectName, teacherName, className,
    equipment, quantity: 1, borrowDate, returnDate, notes: notes || "",
    period: period || "", periodPPCT: periodPPCT || "",
    status: "Chờ duyệt",
    userId: req.session.user.id, userName: req.session.user.name,
    createdAt: new Date().toISOString(),
  };

  try {
    db.create(newRecord);
    notifications.createNotification({
      type: "borrow",
      title: "Yêu cầu mượn mới",
      message: `${teacherName} yêu cầu mượn "${equipment}" (${subjectName}) - Chờ duyệt`,
      recordId: newRecord.id, userId: req.session.user.id, userName: req.session.user.name,
    });
    sendBorrowNotification(newRecord);
    res.status(201).json(newRecord);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/api/records/:id/status", requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!["Chờ duyệt", "Mượn", "Trả", "Từ chối"].includes(status)) return res.status(400).json({ error: "Sai trạng thái" });
  const existing = db.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Không tìm thấy" });
  try {
    const updated = db.update(req.params.id, { status });
    const actionText = status === "Mượn" ? "Đã duyệt cho mượn" : status === "Trả" ? "Đã trả" : status === "Từ chối" ? "Đã từ chối" : "Chờ duyệt";
    notifications.createNotification({ type: "system", title: actionText, message: `"${existing.equipment}" - ${existing.teacherName}`, recordId: req.params.id, userId: req.session.user.id, userName: req.session.user.name });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/records/:id", requireAdmin, (req, res) => {
  if (!db.findById(req.params.id)) return res.status(404).json({ error: "Không tìm thấy" });
  try { db.remove(req.params.id); res.json({ message: "Đã xóa" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ STATS ============
app.get("/api/stats", (req, res) => { try { res.json(db.countAll()); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get("/api/stats/:subjectId", (req, res) => { try { res.json(db.countBySubject(req.params.subjectId)); } catch (err) { res.status(500).json({ error: err.message }); } });

// ============ NOTIFICATIONS ============
app.get("/api/notifications", requireAdmin, (req, res) => {
  const { limit, unreadOnly } = req.query;
  try { res.json(notifications.getNotifications({ limit: limit ? parseInt(limit) : 50, unreadOnly: unreadOnly === "true" })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/notifications/unread-count", requireAdmin, (req, res) => {
  try { res.json({ count: notifications.getUnreadCount() }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.patch("/api/notifications/:id/read", requireAdmin, (req, res) => {
  const r = notifications.markAsRead(req.params.id);
  if (!r) return res.status(404).json({ error: "Không tìm thấy" });
  res.json(r);
});
app.post("/api/notifications/mark-all-read", requireAdmin, (req, res) => { res.json(notifications.markAllAsRead()); });

// ============ CHAT (AI chatbot) ============
app.use("/api/chat", createChatRouter({ requireAuth }));

// ============ SPA fallback (production only) ============
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ============ START ============
app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Admin: ${process.env.ADMIN_EMAILS || "(chưa cấu hình)"}`);
});
