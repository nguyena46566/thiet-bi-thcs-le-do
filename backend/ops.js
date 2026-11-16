/**
 * Vận hành hệ thống
 *  - Sao lưu toàn bộ dữ liệu (nén gzip, mã hóa AES-256-GCM bằng BACKUP_KEY), tải về hoặc để GitHub Actions lấy hằng ngày
 *  - Khôi phục từ bản sao lưu (xem trước số liệu; tự quay lại dữ liệu cũ nếu khôi phục lỗi giữa chừng)
 *  - Nhật ký đăng nhập (lưu 180 ngày), trạng thái hệ thống, danh sách kiểm tra trước khi vận hành
 */
import crypto from "crypto";
import zlib from "zlib";
import db, { newId, DOC_TABLES } from "./database.js";
import { serial, refreshCache } from "./inventory.js";
import { reloadUsers } from "./users.js";

const APP_ID = "thiet-bi-thcs-le-do";
const MAGIC = Buffer.from("TBK1");
const LOGIN_RETENTION_DAYS = 180;
const loginCol = () => db.collection("loginlog");
const backupLog = () => db.collection("backuplog");
const keyOf = () => (process.env.BACKUP_KEY ? crypto.createHash("sha256").update(process.env.BACKUP_KEY).digest() : null);
const safeEq = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---------- Nhật ký đăng nhập ----------
export async function logLogin(req, entry) {
  try {
    await loginCol().insert({ id: newId(), at: new Date().toISOString(), ip: req.ip, ua: String(req.get?.("user-agent") || "").slice(0, 120), ...entry });
  } catch (e) { console.error("[Nhật ký đăng nhập]", e.message); }
}
export async function pruneLoginLog() {
  const limit = new Date(Date.now() - LOGIN_RETENTION_DAYS * 864e5).toISOString();
  let n = 0;
  for (const x of await loginCol().all()) if (x.at < limit) { await loginCol().remove(x.id); n++; }
  return n;
}

// ---------- Sao lưu ----------
async function collect() {
  const data = {};
  for (const t of DOC_TABLES) if (t !== "loginlog" && t !== "backuplog") data[t] = await db.collection(t).all();
  data.__records = await db.records.findAll();
  data.__notifications = await db.notifications.list({ limit: 1000 });
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return { app: APP_ID, format: 1, createdAt: new Date().toISOString(), counts, data };
}
function pack(obj, key) {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(obj)));
  if (!key) return { buf: gz, ext: "json.gz", encrypted: false };
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(gz), c.final()]);
  return { buf: Buffer.concat([MAGIC, iv, c.getAuthTag(), body]), ext: "tbk", encrypted: true };
}
export function unpack(buf, key) {
  let gz = buf;
  if (buf.subarray(0, 4).equals(MAGIC)) {
    if (!key) throw new Error("Bản sao lưu đã mã hóa: cần đặt BACKUP_KEY giống lúc sao lưu");
    const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(4, 16));
    d.setAuthTag(buf.subarray(16, 32));
    try { gz = Buffer.concat([d.update(buf.subarray(32)), d.final()]); } catch { throw new Error("Không giải mã được: BACKUP_KEY không khớp hoặc tệp bị hỏng"); }
  }
  let obj;
  try { obj = JSON.parse(zlib.gunzipSync(gz).toString("utf8")); } catch { throw new Error("Tệp không phải bản sao lưu hợp lệ"); }
  if (obj.app !== APP_ID || !obj.data) throw new Error("Tệp không phải bản sao lưu của website này");
  return obj;
}
async function sendBackup(res, by, kind) {
  const obj = await collect();
  const { buf, ext, encrypted } = pack(obj, keyOf());
  const name = `sao-luu-${APP_ID}-${obj.createdAt.slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
  await backupLog().insert({ id: newId(), at: obj.createdAt, by, kind, size: buf.length, encrypted, counts: obj.counts });
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(buf);
}

// ---------- Khôi phục ----------
async function writeAll(data) {
  for (const t of DOC_TABLES) {
    if (t === "loginlog" || t === "backuplog" || !Array.isArray(data[t])) continue;
    const c = db.collection(t);
    for (const d of await c.all()) await c.remove(d.id);
    for (const d of data[t]) await c.insert(d);
  }
  if (Array.isArray(data.__records)) {
    for (const r of await db.records.findAll()) await db.records.remove(r.id);
    for (const r of data.__records) await db.records.create(r);
  }
  if (Array.isArray(data.__notifications)) {
    for (const n of await db.notifications.list({ limit: 5000 })) await db.notifications.remove(n.id);
    for (const n of [...data.__notifications].reverse()) await db.notifications.create(n);
  }
}

export function registerOpsRoutes(app, { requireAuth, wrap, express }) {
  const requireSysadmin = (req, res, next) => (req.session?.user?.isSysadmin ? next() : res.status(403).json({ error: "Chỉ quản trị hệ thống" }));

  app.get("/api/admin/backup", requireAuth, requireSysadmin, wrap(async (req, res) => sendBackup(res, req.session.user.name, "Tải tay")));
  // GitHub Actions gọi hằng ngày; bắt buộc mã hóa vì tệp được lưu ngoài hệ thống
  app.get("/api/cron/backup", wrap(async (req, res) => {
    if (!process.env.CRON_SECRET || !safeEq(req.get("x-cron-secret"), process.env.CRON_SECRET)) return res.status(403).json({ error: "Không có quyền" });
    if (!keyOf()) return res.status(503).json({ error: "Chưa đặt BACKUP_KEY trên máy chủ: không sao lưu tự động khi chưa mã hóa" });
    await sendBackup(res, "GitHub Actions", "Tự động");
  }));
  app.get("/api/admin/backups", requireAuth, requireSysadmin, wrap(async (req, res) => res.json((await backupLog().all()).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60))));

  // Khôi phục: ?dry=1 chỉ đọc và báo số liệu; khôi phục thật cần confirm=KHOI-PHUC
  app.post("/api/admin/restore", requireAuth, requireSysadmin, express.raw({ type: "*/*", limit: "60mb" }), wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Chưa chọn tệp sao lưu" });
    let obj;
    try { obj = unpack(req.body, keyOf()); } catch (e) { return res.status(400).json({ error: e.message }); }
    const current = Object.fromEntries(Object.entries((await collect()).counts));
    if (req.query.dry === "1") return res.json({ createdAt: obj.createdAt, counts: obj.counts, current });
    if (req.query.confirm !== "KHOI-PHUC") return res.status(400).json({ error: "Thiếu xác nhận khôi phục" });
    const out = await serial(async () => {
      const snapshot = await collect();
      try { await writeAll(obj.data); }
      catch (e) {
        console.error("[Khôi phục] Lỗi, quay lại dữ liệu cũ:", e.message);
        await writeAll(snapshot.data).catch((x) => console.error("[Khôi phục] Quay lại thất bại:", x.message));
        return { error: `Khôi phục thất bại, đã quay lại dữ liệu trước đó (${e.message})` };
      }
      return { value: { restoredFrom: obj.createdAt, counts: obj.counts } };
    });
    if (out.error) return res.status(500).json({ error: out.error });
    await backupLog().insert({ id: newId(), at: new Date().toISOString(), by: req.session.user.name, kind: `Khôi phục từ bản ${obj.createdAt}`, size: req.body.length, encrypted: req.body.subarray(0, 4).equals(MAGIC), counts: obj.counts });
    // Nạp lại bộ nhớ đệm (người dùng, kho thiết bị) để dữ liệu khôi phục có hiệu lực ngay
    await reloadUsers(); await refreshCache();
    res.json(out.value);
  }));

  // ---------- Nhật ký đăng nhập ----------
  app.get("/api/admin/login-log", requireAuth, requireSysadmin, wrap(async (req, res) => {
    const q = String(req.query.q || "").toLowerCase(), result = String(req.query.result || "");
    res.json((await loginCol().all()).filter((x) => (!result || x.result === result) && (!q || `${x.name || ""} ${x.username || ""} ${x.email || ""} ${x.ip}`.toLowerCase().includes(q)))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500));
  }));
  app.get("/api/me/logins", requireAuth, wrap(async (req, res) => {
    res.json((await loginCol().all()).filter((x) => x.userId === req.session.user.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10).map(({ ua, ...x }) => ({ ...x, device: /mobile|android|iphone/i.test(ua) ? "Điện thoại" : "Máy tính" })));
  }));

  // ---------- Trạng thái hệ thống ----------
  app.get("/api/admin/status", requireAuth, requireSysadmin, wrap(async (req, res) => {
    const day = new Date(Date.now() - 864e5).toISOString();
    const logs = await loginCol().all();
    const backups = (await backupLog().all()).filter((b) => !String(b.kind).startsWith("Khôi phục")).sort((a, b) => b.at.localeCompare(a.at));
    const counts = (await collect()).counts;
    const users = await db.collection("users").all();
    const env = (k) => !!process.env[k];
    const checks = [
      ["Cơ sở dữ liệu PostgreSQL (dữ liệu không mất khi cập nhật)", db.kind !== "file"],
      ["SESSION_SECRET riêng (không dùng mặc định)", env("SESSION_SECRET")],
      ["BACKUP_KEY để mã hóa bản sao lưu", env("BACKUP_KEY")],
      ["CRON_SECRET cho GitHub Actions (nhắc hạn, sao lưu)", env("CRON_SECRET")],
      ["Có bản sao lưu trong 2 ngày gần nhất", !!backups[0] && Date.now() - new Date(backups[0].at) < 2 * 864e5],
      ["Đăng nhập Google (GOOGLE_CLIENT_ID)", env("GOOGLE_CLIENT_ID")],
      ["Gửi email (SMTP_USER)", env("SMTP_USER")],
      ["Trợ lý AI (GEMINI_API_KEY)", env("GEMINI_API_KEY")],
      ["Đã tắt tài khoản thử nghiệm (TEST_ACCOUNTS)", process.env.TEST_ACCOUNTS !== "1"],
      ["Có ít nhất 2 quản trị hệ thống thật", users.filter((u) => u.status === "active" && !u.test && (u.roles || []).includes("sysadmin")).length + String(process.env.ADMIN_EMAILS || "").split(",").filter((x) => x.trim()).length >= 2],
      ["Có tài khoản Ban giám hiệu", users.some((u) => u.status === "active" && !u.test && (u.roles || []).includes("principal")) || env("PRINCIPAL_EMAILS")],
    ].map(([label, ok]) => ({ label, ok }));
    res.json({
      storage: db.kind === "file" ? "Tệp JSON (chỉ để chạy thử)" : "PostgreSQL", uptimeMinutes: Math.round(process.uptime() / 60), node: process.version,
      counts, lastBackup: backups[0] || null, backupEncrypted: !!keyOf(),
      logins24h: { ok: logs.filter((x) => x.at >= day && x.result === "Thành công").length, failed: logs.filter((x) => x.at >= day && x.result !== "Thành công").length },
      checks,
    });
  }));
}
