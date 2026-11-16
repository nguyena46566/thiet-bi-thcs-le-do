/**
 * Bảo vệ dữ liệu cá nhân (Luật Bảo vệ dữ liệu cá nhân 2025 – Luật 91/2025/QH15; Nghị định 356/2025/NĐ-CP, hiệu lực 01/01/2026)
 *  - Ghi nhận đồng ý theo phiên bản thông báo xử lý dữ liệu
 *  - Hồ sơ của tôi, tải dữ liệu của tôi, yêu cầu sửa / xóa / rút đồng ý (quản trị hệ thống xử lý)
 *  - Khách vãng lai: đăng ký tại chỗ có đồng ý, sổ khách, ẩn danh sau thời hạn lưu
 */
import db, { newId } from "./database.js";
import { getUser, updateUserFields, sessionUser, ROLES } from "./users.js";
import { formatDate, todayVN } from "./equipment.js";
import notifications from "./notifications.js";

export const PRIVACY_VERSION = "2026-11";
const GUEST_RETENTION_DAYS = Number(process.env.GUEST_RETENTION_DAYS) || 365;
const reqCol = () => db.collection("datarequests");
const guestCol = () => db.collection("guests");
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const REQUEST_TYPES = ["Sửa thông tin", "Xóa dữ liệu", "Rút lại đồng ý", "Hỏi về việc xử lý dữ liệu"];
export const GUEST_KINDS = ["Phụ huynh học sinh", "Giáo viên, cán bộ trường khác", "Đoàn kiểm tra, công tác", "Học sinh trường khác", "Khách khác"];
export const GUEST_PURPOSES = ["Đọc sách tại thư viện", "Tham quan phòng học bộ môn", "Làm việc với nhà trường", "Bàn giao, sửa chữa thiết bị", "Khác"];

/** Ẩn danh khách đã quá thời hạn lưu: xóa họ tên, số điện thoại; giữ số liệu thống kê */
export async function anonymizeOldGuests() {
  const limit = Date.now() - GUEST_RETENTION_DAYS * 864e5;
  let n = 0;
  for (const g of await guestCol().all()) {
    if (!g.anonymized && new Date(g.checkInAt).getTime() < limit) {
      await guestCol().update(g.id, { name: "(đã ẩn danh)", phone: "", note: "", anonymized: true, anonymizedAt: new Date().toISOString() });
      n++;
    }
  }
  if (n) console.log(`[Dữ liệu cá nhân] Đã ẩn danh ${n} lượt khách quá ${GUEST_RETENTION_DAYS} ngày`);
  return n;
}

// Giới hạn khách tự đăng ký: tối đa 15 lần / giờ / địa chỉ IP
const hits = new Map();
const tooMany = (ip) => {
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  h.push(now); hits.set(ip, h);
  return h.length > 15;
};

export function registerPrivacyRoutes(app, { requireAuth, requireAdmin, wrap }) {
  const requireSysadmin = (req, res, next) => (req.session?.user?.isSysadmin ? next() : res.status(403).json({ error: "Chỉ quản trị hệ thống" }));
  const requireStaff = (req, res, next) => {
    const u = req.session?.user;
    if (!u) return res.status(401).json({ error: "Vui lòng đăng nhập" });
    if (!(u.isAdmin || u.isLibrarian)) return res.status(403).json({ error: "Chỉ nhân viên nhà trường" });
    next();
  };

  app.get("/api/privacy/meta", (req, res) => res.json({ version: PRIVACY_VERSION, guestRetentionDays: GUEST_RETENTION_DAYS, requestTypes: REQUEST_TYPES, guestKinds: GUEST_KINDS, guestPurposes: GUEST_PURPOSES }));

  // ---------- Đồng ý xử lý dữ liệu ----------
  app.post("/api/privacy/consent", requireAuth, wrap(async (req, res) => {
    const u = getUser(req.session.user.id);
    if (!u) return res.json({ ok: true, version: PRIVACY_VERSION }); // tài khoản kiểm thử nội bộ
    if (req.body?.version !== PRIVACY_VERSION) return res.status(400).json({ error: "Thông báo đã thay đổi, tải lại trang để đọc bản mới" });
    const doc = await updateUserFields(u.id, { consent: { version: PRIVACY_VERSION, at: new Date().toISOString(), ip: req.ip } });
    req.session.user = sessionUser(doc);
    res.json({ ok: true, version: PRIVACY_VERSION });
  }));

  // ---------- Hồ sơ của tôi ----------
  app.get("/api/me/profile", requireAuth, wrap(async (req, res) => {
    const s = req.session.user, u = getUser(s.id);
    const records = (await db.records.findAll()).filter((r) => r.userId === s.id);
    const proposals = (await db.collection("proposals").all()).filter((p) => p.userId === s.id);
    const requests = (await reqCol().all()).filter((r) => r.userId === s.id);
    res.json({
      user: { id: s.id, name: s.name, email: s.email, username: u?.username || "", phone: u?.phone || "", position: u?.position || "", roles: s.roles || [], roleNames: (s.roles || []).map((r) => ROLES[r] || r),
        group: s.group || "", authType: s.authType || "google", createdAt: u?.createdAt || null, lastLoginAt: u?.lastLoginAt || null, approvedBy: u?.approvedBy || "" },
      consent: u?.consent || null, privacyVersion: PRIVACY_VERSION,
      stats: { records: records.length, borrowing: records.filter((r) => r.status === "Mượn").length, pending: records.filter((r) => r.status === "Chờ duyệt").length, proposals: proposals.length },
      requests,
    });
  }));
  app.patch("/api/me/profile", requireAuth, wrap(async (req, res) => {
    const u = getUser(req.session.user.id);
    if (!u) return res.status(400).json({ error: "Tài khoản kiểm thử không có hồ sơ" });
    const b = req.body || {}, patch = {};
    if (b.name !== undefined) { const n = str(b.name, 80); if (!n) return res.status(400).json({ error: "Họ tên không được để trống" }); patch.name = n; patch.nameLocked = u.authType === "google"; }
    if (b.phone !== undefined) { const p = str(b.phone, 20); if (p && !/^[0-9+ .-]{8,20}$/.test(p)) return res.status(400).json({ error: "Số điện thoại không hợp lệ" }); patch.phone = p; }
    if (b.position !== undefined) patch.position = str(b.position, 80);
    const doc = await updateUserFields(u.id, patch);
    req.session.user = sessionUser(doc);
    res.json({ ok: true });
  }));
  // Tải toàn bộ dữ liệu cá nhân của tôi (quyền được biết, quyền truy cập dữ liệu)
  app.get("/api/me/export", requireAuth, wrap(async (req, res) => {
    const s = req.session.user, u = getUser(s.id);
    const { passwordHash, ...account } = u || { id: s.id, name: s.name, email: s.email };
    const data = {
      exportedAt: new Date().toISOString(), note: "Dữ liệu cá nhân của bạn trên website quản lý thiết bị – thư viện Trường THCS Lê Độ",
      account,
      borrowRecords: (await db.records.findAll()).filter((r) => r.userId === s.id),
      proposals: (await db.collection("proposals").all()).filter((p) => p.userId === s.id),
      penalties: (await db.collection("penalties").all()).filter((p) => p.userId === s.id || p.teacherKey === s.id),
      dataRequests: (await reqCol().all()).filter((r) => r.userId === s.id),
    };
    res.setHeader("Content-Disposition", `attachment; filename="du-lieu-cua-toi-${formatDate(todayVN()).replace(/\//g, "-")}.json"`);
    res.json(data);
  }));
  app.post("/api/me/requests", requireAuth, wrap(async (req, res) => {
    const type = REQUEST_TYPES.includes(req.body?.type) ? req.body.type : null;
    const content = str(req.body?.content, 1000);
    if (!type) return res.status(400).json({ error: "Chọn loại yêu cầu" });
    if (!content && type !== "Rút lại đồng ý") return res.status(400).json({ error: "Ghi rõ nội dung yêu cầu" });
    const s = req.session.user;
    const doc = await reqCol().insert({ id: newId(), userId: s.id, userName: s.name, email: s.email, type, content, status: "Chờ xử lý", createdAt: new Date().toISOString() });
    await notifications.createNotification({ type: "system", title: "Yêu cầu về dữ liệu cá nhân", message: `${s.name}: ${type}`, userId: s.id, userName: s.name }).catch(() => {});
    res.status(201).json(doc);
  }));
  app.get("/api/data-requests", requireAuth, requireSysadmin, wrap(async (req, res) => res.json(await reqCol().all())));
  app.patch("/api/data-requests/:id", requireAuth, requireSysadmin, wrap(async (req, res) => {
    const r = await reqCol().get(req.params.id);
    if (!r) return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
    const status = ["Đang xử lý", "Đã xử lý", "Từ chối"].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: "Trạng thái không hợp lệ" });
    const response = str(req.body?.response, 1000);
    if (status === "Từ chối" && !response) return res.status(400).json({ error: "Từ chối cần ghi lý do" });
    res.json(await reqCol().update(r.id, { status, response, handledBy: req.session.user.name, handledAt: new Date().toISOString() }));
  }));

  // ---------- Khách vãng lai ----------
  const cleanGuest = (b) => {
    const name = str(b.name, 80);
    if (!name) return { error: "Nhập họ tên" };
    if (!GUEST_KINDS.includes(b.kind)) return { error: "Chọn đối tượng khách" };
    if (!GUEST_PURPOSES.includes(b.purpose)) return { error: "Chọn mục đích" };
    const phone = str(b.phone, 20);
    if (phone && !/^[0-9+ .-]{8,20}$/.test(phone)) return { error: "Số điện thoại không hợp lệ" };
    if (b.consent !== true) return { error: "Cần đồng ý để nhà trường ghi sổ khách" };
    return { value: { name, kind: b.kind, org: str(b.org, 120), phone, purpose: b.purpose, place: str(b.place, 80), note: str(b.note, 200) } };
  };
  const nextCode = async () => {
    const t = todayVN(), d = `${String(t.getFullYear()).slice(2)}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}`;
    const n = (await guestCol().all()).filter((g) => g.code?.startsWith(`KV${d}`)).length + 1;
    return `KV${d}-${String(n).padStart(3, "0")}`;
  };
  // Khách tự đăng ký (không cần tài khoản)
  app.post("/api/guests/self", wrap(async (req, res) => {
    if (tooMany(req.ip)) return res.status(429).json({ error: "Đăng ký quá nhiều lần, vui lòng báo nhân viên nhà trường" });
    const v = cleanGuest(req.body || {});
    if (v.error) return res.status(400).json(v);
    const now = new Date().toISOString();
    const g = await guestCol().insert({ id: newId(), code: await nextCode(), ...v.value, checkInAt: now, checkOutAt: null, consentAt: now, consentVersion: PRIVACY_VERSION, createdBy: "Khách tự đăng ký" });
    res.status(201).json({ code: g.code, name: g.name, checkInAt: g.checkInAt, purpose: g.purpose, place: g.place });
  }));
  // Phiếu khách (khách xem lại bằng mã): chỉ trả thông tin tối thiểu
  app.get("/api/guests/slip/:code", wrap(async (req, res) => {
    const g = (await guestCol().all()).find((x) => x.code === String(req.params.code).toUpperCase());
    if (!g || g.anonymized) return res.status(404).json({ error: "Không tìm thấy phiếu khách" });
    res.json({ code: g.code, name: g.name, checkInAt: g.checkInAt, checkOutAt: g.checkOutAt, purpose: g.purpose, place: g.place });
  }));
  app.get("/api/guests", requireStaff, wrap(async (req, res) => {
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00+07:00`).toISOString() : "0";
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59+07:00`).toISOString() : "9";
    res.json({ guests: (await guestCol().all()).filter((g) => g.checkInAt >= from && g.checkInAt <= to), retentionDays: GUEST_RETENTION_DAYS });
  }));
  app.post("/api/guests", requireStaff, wrap(async (req, res) => {
    const v = cleanGuest(req.body || {});
    if (v.error) return res.status(400).json(v);
    const now = new Date().toISOString();
    res.status(201).json(await guestCol().insert({ id: newId(), code: await nextCode(), ...v.value, checkInAt: now, checkOutAt: null, consentAt: now, consentVersion: PRIVACY_VERSION, createdBy: req.session.user.name }));
  }));
  app.post("/api/guests/:id/checkout", requireStaff, wrap(async (req, res) => {
    const g = await guestCol().get(req.params.id);
    if (!g) return res.status(404).json({ error: "Không tìm thấy lượt khách" });
    if (g.checkOutAt) return res.status(409).json({ error: "Khách đã ra về" });
    res.json(await guestCol().update(g.id, { checkOutAt: new Date().toISOString(), checkOutBy: req.session.user.name }));
  }));
  // Xóa dữ liệu một lượt khách khi khách yêu cầu
  app.post("/api/guests/:id/anonymize", requireStaff, wrap(async (req, res) => {
    const g = await guestCol().get(req.params.id);
    if (!g) return res.status(404).json({ error: "Không tìm thấy lượt khách" });
    res.json(await guestCol().update(g.id, { name: "(đã ẩn danh)", phone: "", note: "", anonymized: true, anonymizedAt: new Date().toISOString(), anonymizedBy: req.session.user.name }));
  }));
}
