/**
 * Người dùng và phân quyền
 *  - Vai trò: quản trị hệ thống, nhân viên thiết bị, Ban giám hiệu, tổ trưởng chuyên môn, giáo viên (một người có thể nhiều vai trò)
 *  - Đăng nhập Google hoặc tên đăng nhập + mật khẩu; tài khoản mới ở trạng thái “chờ duyệt”, chỉ quản trị hệ thống duyệt
 *  - ADMIN_EMAILS / PRINCIPAL_EMAILS vẫn là tài khoản dự phòng, luôn có quyền (không bao giờ bị khóa hết quyền)
 *  - TEST_ACCOUNTS=1: tạo sẵn tài khoản thử nghiệm cho từng vai trò; tắt biến này thì các tài khoản thử nghiệm không đăng nhập được
 */
import crypto from "crypto";
import db, { newId } from "./database.js";
import { setPrincipalActive } from "./auth.js";
import { SUBJECTS } from "./chatTools.js";
import notifications from "./notifications.js";
import { logLogin } from "./ops.js";

export const ROLES = {
  sysadmin: "Quản trị hệ thống",
  equipment: "Nhân viên thiết bị",
  librarian: "Nhân viên thư viện",
  principal: "Ban giám hiệu",
  head: "Tổ trưởng chuyên môn",
  teacher: "Giáo viên",
};
export const GROUPS = [...new Set(SUBJECTS.map((s) => s.group).filter(Boolean))];
export const TEST_PASSWORD = "Test@2026";
const TEST_USERS = [
  { username: "quantri", name: "Quản trị hệ thống (thử nghiệm)", roles: ["sysadmin"] },
  { username: "nhanvientb", name: "Nhân viên thiết bị (thử nghiệm)", roles: ["equipment"] },
  { username: "thuvien", name: "Nhân viên thư viện (thử nghiệm)", roles: ["librarian"] },
  { username: "hieutruong", name: "Hiệu trưởng (thử nghiệm)", roles: ["principal"] },
  { username: "totruong", name: "Tổ trưởng KHTN (thử nghiệm)", roles: ["head", "teacher"], group: "Tổ Khoa học tự nhiên" },
  { username: "giaovien", name: "Giáo viên (thử nghiệm)", roles: ["teacher"] },
];

const col = () => db.collection("users");
const logCol = () => db.collection("rolelog");
const cache = new Map();
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const envList = (v) => (v || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const testAccountsEnabled = () => process.env.TEST_ACCOUNTS === "1";

// ---------- mật khẩu ----------
const hashPassword = (pw, salt = crypto.randomBytes(16).toString("hex")) => `${salt}:${crypto.scryptSync(pw, salt, 32).toString("hex")}`;
function verifyPassword(pw, stored) {
  const [salt, h] = String(stored || "").split(":");
  if (!salt || !h) return false;
  const a = crypto.scryptSync(String(pw), salt, 32), b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const validPassword = (pw) => typeof pw === "string" && pw.length >= 8 && pw.length <= 100;
const cleanRoles = (r) => [...new Set((Array.isArray(r) ? r : []).filter((x) => x in ROLES))];

/** Thông tin đưa vào phiên đăng nhập, kèm các cờ quyền mà code cũ đang dùng (isAdmin, isPrincipal) */
export function sessionUser(u) {
  const email = (u.email || "").toLowerCase();
  const envAdmin = !!email && envList(process.env.ADMIN_EMAILS).includes(email);
  const envPrincipal = !!email && envList(process.env.PRINCIPAL_EMAILS).includes(email);
  const roles = [...new Set([...(u.roles || []), ...(envAdmin ? ["sysadmin", "equipment"] : []), ...(envPrincipal ? ["principal"] : [])])];
  const isPrincipal = roles.includes("principal"), isSysadmin = roles.includes("sysadmin"), isEquipment = roles.includes("equipment"), isLibrarian = roles.includes("librarian");
  return {
    id: u.id, email: u.email || "", name: u.name, avatar: u.avatar || null, roles, group: u.group || "",
    isAdmin: isSysadmin || isEquipment || isPrincipal || isLibrarian, isPrincipal, isSysadmin, isEquipment, isLibrarian, isHead: roles.includes("head"),
    authType: u.authType, test: !!u.test, consentVersion: u.consent?.version || "",
  };
}
/** Cập nhật một số trường của tài khoản (dùng cho hồ sơ cá nhân, đồng ý xử lý dữ liệu) */
export async function updateUserFields(id, patch) {
  const u = cache.get(id);
  if (!u) throw new Error("Không tìm thấy tài khoản");
  return save({ ...u, ...patch, updatedAt: new Date().toISOString() });
}
/** Trang đầu tiên sau khi đăng nhập, theo vai trò chính */
export function landingOf(su) {
  if (su.isEquipment) return "admin";
  if (su.isPrincipal) return "bgh";
  if (su.isLibrarian) return "admin/muon-tra-sach";
  if (su.isSysadmin) return "admin/nguoi-dung";
  if (su.isHead) return "to-truong";
  return "";
}
const publicUser = ({ passwordHash, ...u }) => u;
const refreshPrincipal = () => setPrincipalActive([...cache.values()].some((u) => u.status === "active" && (u.roles || []).includes("principal") && !(u.test && !testAccountsEnabled())));

async function save(u) {
  const exists = await col().get(u.id);
  const doc = exists ? await col().update(u.id, u) : await col().insert(u);
  cache.set(doc.id, doc);
  refreshPrincipal();
  return doc;
}
async function log(action, target, by, detail = "") {
  await logCol().insert({ id: newId(), action, targetId: target.id, targetName: target.name, by: by?.name || "hệ thống", detail, createdAt: new Date().toISOString() });
}
export const getUser = (id) => cache.get(id);
const findBy = (fn) => [...cache.values()].find(fn);

/** Nạp lại danh sách người dùng từ CSDL (sau khi khôi phục bản sao lưu) */
export async function reloadUsers() {
  cache.clear();
  for (const u of await col().all()) cache.set(u.id, u);
  refreshPrincipal();
}
export async function initUsers() {
  for (const u of await col().all()) cache.set(u.id, u);
  // Lần đầu bật phân quyền: giáo viên đã từng mượn thiết bị được giữ quyền, không phải chờ duyệt lại
  if (!cache.size) {
    const seen = new Map();
    for (const r of await db.records.findAll()) if (r.userId && !seen.has(r.userId)) seen.set(r.userId, r);
    for (const [id, r] of seen) {
      await save({ id, email: r.userEmail || "", name: r.teacherName || r.userEmail || id, roles: ["teacher"], status: "active", authType: "google", createdAt: new Date().toISOString(), approvedBy: "chuyển đổi tự động" });
    }
    if (seen.size) console.log(`[Người dùng] Đã chuyển ${seen.size} giáo viên cũ sang trạng thái đã duyệt`);
  }
  if (testAccountsEnabled()) {
    for (const t of TEST_USERS) {
      const id = `pw-${t.username}`;
      if (!cache.has(id)) await save({ id, username: t.username, name: t.name, email: "", roles: t.roles, group: t.group || "", status: "active", authType: "password", test: true, passwordHash: hashPassword(TEST_PASSWORD), createdAt: new Date().toISOString(), approvedBy: "tài khoản thử nghiệm" });
    }
    console.log("[Người dùng] TEST_ACCOUNTS=1: đã bật tài khoản thử nghiệm (mật khẩu chung Test@2026)");
  }
  refreshPrincipal();
}

/** Đăng nhập Google: trả về { user } nếu đã duyệt, { pending } nếu chờ duyệt, { locked } nếu bị khóa */
export async function resolveGoogle(profile) {
  const email = (profile.email || "").toLowerCase();
  const envAdmin = envList(process.env.ADMIN_EMAILS).includes(email), envPrincipal = envList(process.env.PRINCIPAL_EMAILS).includes(email);
  let u = cache.get(profile.id) || findBy((x) => x.email && x.email.toLowerCase() === email);
  const now = new Date().toISOString();
  if (!u) {
    u = { id: profile.id, email: profile.email, name: profile.name || profile.email, avatar: profile.picture || null, roles: [], requestedRoles: ["teacher"], status: envAdmin || envPrincipal ? "active" : "pending", authType: "google", createdAt: now };
    if (u.status === "pending") {
      await notifications.createNotification({ type: "system", title: "Yêu cầu tài khoản mới", message: `${u.name} (${u.email}) đăng nhập lần đầu, cần duyệt và gán vai trò`, userId: u.id, userName: u.name }).catch(() => {});
    }
  } else {
    Object.assign(u, { name: u.nameLocked ? u.name : profile.name || u.name, avatar: profile.picture || u.avatar, email: profile.email });
  }
  if ((envAdmin || envPrincipal) && u.status !== "active") u.status = "active"; // tài khoản dự phòng
  u.lastLoginAt = now;
  u = await save(u);
  if (u.status === "pending") return { pending: { name: u.name, email: u.email } };
  if (u.status !== "active") return { locked: true };
  return { user: sessionUser(u) };
}

// Chống dò mật khẩu: tối đa 5 lần sai trong 10 phút cho mỗi tên đăng nhập + IP
const fails = new Map();
const failKey = (req, username) => `${req.ip}|${username}`;

export function registerUserRoutes(app, { requireAuth, requireAdmin, wrap }) {
  const requireSysadmin = (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: "Vui lòng đăng nhập" });
    if (!req.session.user.isSysadmin) return res.status(403).json({ error: "Chỉ quản trị hệ thống" });
    next();
  };

  app.get("/api/auth/options", (req, res) => res.json({
    google: !!process.env.GOOGLE_CLIENT_ID,
    testAccounts: testAccountsEnabled() ? TEST_USERS.map((t) => ({ username: t.username, label: t.roles.map((r) => ROLES[r]).join(" + ") + (t.group ? ` (${t.group})` : "") })) : [],
    testPassword: testAccountsEnabled() ? TEST_PASSWORD : null,
    demoAccounts: testAccountsEnabled() ? [...cache.values()].filter((u) => u.demo && u.status === "active").map((u) => ({ username: u.username, label: `${u.name} – ${u.position || ""}` })) : [],
    roles: ROLES, groups: GROUPS,
  }));

  app.post("/api/auth/login", wrap(async (req, res) => {
    const username = str(req.body?.username, 40).toLowerCase(), password = String(req.body?.password || "");
    const k = failKey(req, username), f = fails.get(k);
    const base = { method: "Mật khẩu", username };
    if (f && f.count >= 5 && Date.now() - f.at < 10 * 60e3) { await logLogin(req, { ...base, result: "Tạm khóa do sai nhiều lần" }); return res.status(429).json({ error: "Sai quá nhiều lần. Thử lại sau 10 phút." }); }
    const u = findBy((x) => x.username === username && x.authType === "password");
    if (!u || !verifyPassword(password, u.passwordHash)) {
      fails.set(k, { count: (f && Date.now() - f.at < 10 * 60e3 ? f.count : 0) + 1, at: Date.now() });
      await logLogin(req, { ...base, userId: u?.id || null, name: u?.name || "", result: u ? "Sai mật khẩu" : "Không có tài khoản" });
      return res.status(401).json({ error: "Sai tên đăng nhập hoặc mật khẩu" });
    }
    fails.delete(k);
    const who = { ...base, userId: u.id, name: u.name };
    if (u.test && !testAccountsEnabled()) { await logLogin(req, { ...who, result: "Tài khoản thử nghiệm đã tắt" }); return res.status(403).json({ error: "Tài khoản thử nghiệm đã được tắt" }); }
    if (u.status === "pending") { await logLogin(req, { ...who, result: "Chờ duyệt" }); return res.status(403).json({ error: "Tài khoản đang chờ quản trị viên duyệt", pending: true }); }
    if (u.status !== "active") { await logLogin(req, { ...who, result: "Tài khoản bị khóa" }); return res.status(403).json({ error: "Tài khoản đã bị khóa. Liên hệ quản trị hệ thống." }); }
    await logLogin(req, { ...who, result: "Thành công" });
    await save({ ...u, lastLoginAt: new Date().toISOString() });
    const su = sessionUser(u);
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Lỗi phiên đăng nhập" });
      req.session.user = su;
      req.session.save(() => res.json({ user: su, landing: landingOf(su) }));
    });
  }));

  // Tự đăng ký tài khoản (tên đăng nhập + mật khẩu): chờ quản trị duyệt
  app.post("/api/auth/register", wrap(async (req, res) => {
    const b = req.body || {};
    const username = str(b.username, 30).toLowerCase(), name = str(b.name, 80), email = str(b.email, 120);
    if (!/^[a-z0-9._]{3,30}$/.test(username)) return res.status(400).json({ error: "Tên đăng nhập 3–30 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới" });
    if (!name) return res.status(400).json({ error: "Nhập họ tên" });
    if (!validPassword(b.password)) return res.status(400).json({ error: "Mật khẩu tối thiểu 8 ký tự" });
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Email không hợp lệ" });
    if (findBy((x) => x.username === username)) return res.status(409).json({ error: "Tên đăng nhập đã có người dùng" });
    if (email && findBy((x) => x.email && x.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: "Email đã có tài khoản" });
    const requestedRoles = cleanRoles(b.requestedRoles).filter((r) => r !== "sysadmin");
    const u = await save({ id: `pw-${username}`, username, name, email, roles: [], requestedRoles: requestedRoles.length ? requestedRoles : ["teacher"], requestedGroup: GROUPS.includes(b.group) ? b.group : "",
      status: "pending", authType: "password", passwordHash: hashPassword(b.password), createdAt: new Date().toISOString() });
    await notifications.createNotification({ type: "system", title: "Yêu cầu tài khoản mới", message: `${name} đăng ký tài khoản “${username}” (${u.requestedRoles.map((r) => ROLES[r]).join(", ")}), cần duyệt`, userId: u.id, userName: name }).catch(() => {});
    res.status(201).json({ ok: true });
  }));

  // ----- Quản trị hệ thống -----
  app.get("/api/users", requireSysadmin, wrap(async (req, res) => {
    const logs = (await logCol().all()).slice(0, 100);
    res.json({ users: [...cache.values()].map(publicUser).sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || String(a.name).localeCompare(String(b.name), "vi")), roles: ROLES, groups: GROUPS, logs, testAccounts: testAccountsEnabled() });
  }));
  const guardSelf = (req, u, next) => {
    if (u.id !== req.session.user.id) return null;
    if (next.status && next.status !== "active") return "Không tự khóa tài khoản của mình";
    if (next.roles && !next.roles.includes("sysadmin") && !envList(process.env.ADMIN_EMAILS).includes((u.email || "").toLowerCase())) return "Không tự bỏ quyền quản trị hệ thống của mình";
    return null;
  };
  const lastSysadmin = (u, next) => {
    const others = [...cache.values()].filter((x) => x.id !== u.id && x.status === "active" && (x.roles || []).includes("sysadmin") && !x.test);
    const removing = (next.roles && !next.roles.includes("sysadmin")) || (next.status && next.status !== "active");
    return (u.roles || []).includes("sysadmin") && removing && !others.length && !envList(process.env.ADMIN_EMAILS).length;
  };
  app.post("/api/users/:id/approve", requireSysadmin, wrap(async (req, res) => {
    const u = cache.get(req.params.id);
    if (!u) return res.status(404).json({ error: "Không tìm thấy tài khoản" });
    if (u.status !== "pending") return res.status(409).json({ error: "Tài khoản không ở trạng thái chờ duyệt" });
    const roles = cleanRoles(req.body?.roles);
    if (!roles.length) return res.status(400).json({ error: "Chọn ít nhất một vai trò" });
    const group = GROUPS.includes(req.body?.group) ? req.body.group : "";
    if (roles.includes("head") && !group) return res.status(400).json({ error: "Tổ trưởng cần chọn tổ chuyên môn" });
    const doc = await save({ ...u, roles, group, status: "active", approvedBy: req.session.user.name, approvedAt: new Date().toISOString() });
    await log("Duyệt tài khoản", doc, req.session.user, roles.map((r) => ROLES[r]).join(", ") + (group ? ` – ${group}` : ""));
    res.json(publicUser(doc));
  }));
  app.post("/api/users/:id/reject", requireSysadmin, wrap(async (req, res) => {
    const u = cache.get(req.params.id);
    if (!u || u.status !== "pending") return res.status(404).json({ error: "Không có yêu cầu chờ duyệt" });
    await col().remove(u.id); cache.delete(u.id);
    await log("Từ chối yêu cầu", u, req.session.user, str(req.body?.note, 200));
    res.json({ ok: true });
  }));
  app.patch("/api/users/:id", requireSysadmin, wrap(async (req, res) => {
    const u = cache.get(req.params.id);
    if (!u) return res.status(404).json({ error: "Không tìm thấy tài khoản" });
    const b = req.body || {}, next = {};
    if (b.roles !== undefined) { next.roles = cleanRoles(b.roles); if (!next.roles.length) return res.status(400).json({ error: "Chọn ít nhất một vai trò" }); }
    if (b.group !== undefined) next.group = GROUPS.includes(b.group) ? b.group : "";
    if (b.status !== undefined) { if (!["active", "locked"].includes(b.status)) return res.status(400).json({ error: "Trạng thái không hợp lệ" }); next.status = b.status; }
    if (b.name !== undefined) next.name = str(b.name, 80) || u.name;
    if ((next.roles || u.roles || []).includes("head") && !(next.group ?? u.group)) return res.status(400).json({ error: "Tổ trưởng cần chọn tổ chuyên môn" });
    const selfErr = guardSelf(req, u, next);
    if (selfErr) return res.status(409).json({ error: selfErr });
    if (lastSysadmin(u, next)) return res.status(409).json({ error: "Cần giữ ít nhất một quản trị hệ thống" });
    const doc = await save({ ...u, ...next, updatedAt: new Date().toISOString() });
    const what = [next.roles && `vai trò: ${next.roles.map((r) => ROLES[r]).join(", ")}`, next.group !== undefined && `tổ: ${next.group || "—"}`, next.status && (next.status === "locked" ? "khóa tài khoản" : "mở khóa")].filter(Boolean).join("; ");
    if (what) await log("Cập nhật quyền", doc, req.session.user, what);
    res.json(publicUser(doc));
  }));
  app.post("/api/users", requireSysadmin, wrap(async (req, res) => {
    const b = req.body || {};
    const username = str(b.username, 30).toLowerCase(), name = str(b.name, 80);
    if (!/^[a-z0-9._]{3,30}$/.test(username)) return res.status(400).json({ error: "Tên đăng nhập 3–30 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới" });
    if (!name) return res.status(400).json({ error: "Nhập họ tên" });
    if (!validPassword(b.password)) return res.status(400).json({ error: "Mật khẩu tối thiểu 8 ký tự" });
    if (findBy((x) => x.username === username)) return res.status(409).json({ error: "Tên đăng nhập đã có người dùng" });
    const roles = cleanRoles(b.roles);
    if (!roles.length) return res.status(400).json({ error: "Chọn ít nhất một vai trò" });
    const group = GROUPS.includes(b.group) ? b.group : "";
    if (roles.includes("head") && !group) return res.status(400).json({ error: "Tổ trưởng cần chọn tổ chuyên môn" });
    const doc = await save({ id: `pw-${username}`, username, name, email: str(b.email, 120), roles, group, status: "active", authType: "password", test: !!b.test, passwordHash: hashPassword(b.password), createdAt: new Date().toISOString(), approvedBy: req.session.user.name });
    await log("Tạo tài khoản", doc, req.session.user, roles.map((r) => ROLES[r]).join(", ") + (b.test ? " (thử nghiệm)" : ""));
    res.status(201).json(publicUser(doc));
  }));
  app.post("/api/users/:id/password", requireSysadmin, wrap(async (req, res) => {
    const u = cache.get(req.params.id);
    if (!u || u.authType !== "password") return res.status(404).json({ error: "Chỉ đặt lại mật khẩu cho tài khoản đăng nhập bằng mật khẩu" });
    if (!validPassword(req.body?.password)) return res.status(400).json({ error: "Mật khẩu tối thiểu 8 ký tự" });
    await save({ ...u, passwordHash: hashPassword(req.body.password) });
    await log("Đặt lại mật khẩu", u, req.session.user);
    res.json({ ok: true });
  }));
  // Tự đổi mật khẩu
  app.post("/api/auth/password", requireAuth, wrap(async (req, res) => {
    const u = cache.get(req.session.user.id);
    if (!u || u.authType !== "password") return res.status(400).json({ error: "Tài khoản Google không dùng mật khẩu" });
    if (!verifyPassword(String(req.body?.current || ""), u.passwordHash)) return res.status(401).json({ error: "Mật khẩu hiện tại không đúng" });
    if (!validPassword(req.body?.password)) return res.status(400).json({ error: "Mật khẩu mới tối thiểu 8 ký tự" });
    await save({ ...u, passwordHash: hashPassword(req.body.password) });
    res.json({ ok: true });
  }));
}

/** Mỗi yêu cầu: cập nhật quyền từ danh sách người dùng (đổi vai trò, khóa tài khoản có hiệu lực ngay) */
export function refreshSessionUser(req, res, next) {
  const s = req.session?.user;
  if (s) {
    const u = cache.get(s.id);
    if (u) {
      if (u.status !== "active" || (u.test && !testAccountsEnabled())) delete req.session.user;
      else req.session.user = sessionUser(u);
    }
  }
  next();
}
