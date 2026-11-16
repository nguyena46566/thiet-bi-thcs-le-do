/**
 * Thư viện – các phần còn thiếu theo Thông tư 16/2022/TT-BGDĐT (sửa đổi bởi Thông tư 13/2025/TT-BGDĐT):
 *  - Bạn đọc, thẻ thư viện; lưu thông (mượn – trả theo số ĐKCB, hạn trả, quá hạn)
 *  - Tiết đọc thư viện (trường trung học: tối thiểu 03 tiết/học kỳ/lớp)
 *  - Tra cứu (OPAC) công khai, biên mục (ký hiệu phân loại, ký hiệu xếp giá, từ khóa)
 *  - Kiểm kê, thanh lọc kho sách; thống kê bạn đọc và lưu thông
 */
import db, { newId } from "./database.js";
import { serial } from "./inventory.js";
import { BOOK_KINDS } from "./library.js";
import { slotLabel } from "./equipment.js";

const readers = () => db.collection("readers");
const loans = () => db.collection("bookloans");
const periods = () => db.collection("readingperiods");
const libaudits = () => db.collection("libaudits");
const titles = () => db.collection("booktitles");
const copies = () => db.collection("bookcopies");
const settings = () => db.collection("settings");
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
export const READER_TYPES = ["Học sinh", "Giáo viên", "Nhân viên"];
export const MIN_READING_PERIODS = 3;
const DEFAULT_RULES = { studentMax: 3, studentDays: 14, staffMax: 10, staffDays: 30 };
/** Năm học và học kỳ của một ngày (học kỳ I: tháng 9 – tháng 1; học kỳ II: tháng 2 – tháng 8) */
export function termOf(iso) {
  const [y, m] = iso.split("-").map(Number);
  const sy = m >= 9 ? y : y - 1;
  return { schoolYear: `${sy}-${sy + 1}`, term: m >= 9 || m === 1 ? "HK1" : "HK2" };
}
const currentSchoolYear = () => termOf(today()).schoolYear;
const inYear = (iso, sy) => iso && termOf(iso.slice(0, 10)).schoolYear === sy;
async function getRules() { return { ...DEFAULT_RULES, ...((await settings().get("libraryRules")) || {}) }; }

export function registerCirculationRoutes(app, { requireAuth, wrap }) {
  const requireLibrary = (req, res, next) => {
    const u = req.session?.user;
    if (!u) return res.status(401).json({ error: "Vui lòng đăng nhập" });
    if (!(u.isLibrarian || u.isEquipment || u.isSysadmin || u.isPrincipal || (u.isAdmin && !u.roles))) return res.status(403).json({ error: "Chỉ nhân viên thư viện" });
    next();
  };

  // ---------- Quy định mượn ----------
  app.get("/api/library/rules", requireAuth, wrap(async (req, res) => res.json(await getRules())));
  app.put("/api/library/rules", requireLibrary, wrap(async (req, res) => {
    const b = req.body || {}, n = (v, d, max) => Math.max(1, Math.min(max, Math.floor(Number(v)) || d));
    const doc = { id: "libraryRules", studentMax: n(b.studentMax, 3, 20), studentDays: n(b.studentDays, 14, 365), staffMax: n(b.staffMax, 10, 50), staffDays: n(b.staffDays, 30, 365) };
    if (await settings().get("libraryRules")) await settings().update("libraryRules", doc); else await settings().insert(doc);
    res.json(doc);
  }));

  // ---------- Bạn đọc ----------
  const cleanReader = (b) => {
    const name = str(b.name, 80), type = READER_TYPES.includes(b.type) ? b.type : null;
    if (!name) return { error: "Nhập họ tên bạn đọc" };
    if (!type) return { error: "Chọn loại bạn đọc" };
    const className = str(b.className, 20).toUpperCase();
    if (type === "Học sinh" && !/^[6-9][A-Z0-9]{1,6}$/.test(className)) return { error: `“${name}”: lớp không hợp lệ (VD: 7A2)` };
    // Dữ liệu trẻ em: phải có ý kiến đồng ý của cha mẹ / người giám hộ
    if (type === "Học sinh" && b.guardianConsent !== true) return { error: `“${name}”: cần xác nhận đã có phiếu đồng ý của cha mẹ / người giám hộ` };
    return { value: { name, type, className: type === "Học sinh" ? className : "", grade: type === "Học sinh" ? Number(className[0]) : null, userId: str(b.userId, 60) || null, guardianConsent: type === "Học sinh" ? true : null, note: str(b.note, 200) } };
  };
  const nextReaderCodes = async (n) => {
    const all = await readers().all();
    let max = all.reduce((m, r) => Math.max(m, Number(String(r.id).slice(3)) || 0), 0);
    return Array.from({ length: n }, () => `BD-${String(++max).padStart(5, "0")}`);
  };
  app.get("/api/library/readers", requireLibrary, wrap(async (req, res) => {
    const ls = await loans().all();
    res.json((await readers().all()).map((r) => ({ ...r, onLoan: ls.filter((l) => l.readerId === r.id && !l.returnedAt).length }))
      .sort((a, b) => (a.className || "~").localeCompare(b.className || "~", "vi", { numeric: true }) || a.name.localeCompare(b.name, "vi")));
  }));
  app.post("/api/library/readers", requireLibrary, wrap(async (req, res) => {
    const list = Array.isArray(req.body?.readers) ? req.body.readers.slice(0, 2000) : [req.body || {}];
    const out = await serial(async () => {
      const ok = [], errors = [];
      list.forEach((b, i) => { const v = cleanReader(b); if (v.error) errors.push(list.length > 1 ? `Dòng ${i + 2}: ${v.error}` : v.error); else ok.push(v.value); });
      if (!ok.length) return { status: 400, error: errors[0] || "Không có bạn đọc hợp lệ", errors };
      const codes = await nextReaderCodes(ok.length), now = new Date().toISOString();
      const done = [];
      for (let i = 0; i < ok.length; i++) done.push(await readers().insert({ id: codes[i], ...ok[i], status: "active", createdAt: now, createdBy: req.session.user.name }));
      return { value: { created: done, errors: errors.slice(0, 20) } };
    });
    if (out.error) return res.status(out.status).json(out);
    res.status(201).json(out.value);
  }));
  // Thêm giáo viên, nhân viên đã có tài khoản làm bạn đọc
  app.post("/api/library/readers/from-users", requireLibrary, wrap(async (req, res) => {
    const out = await serial(async () => {
      const have = new Set((await readers().all()).map((r) => r.userId).filter(Boolean));
      const users = (await db.collection("users").all()).filter((u) => u.status === "active" && !(u.test && process.env.TEST_ACCOUNTS !== "1") && !have.has(u.id));
      const codes = await nextReaderCodes(users.length), now = new Date().toISOString();
      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        await readers().insert({ id: codes[i], name: u.name, type: (u.roles || []).includes("teacher") || (u.roles || []).includes("head") ? "Giáo viên" : "Nhân viên", className: "", grade: null, userId: u.id, status: "active", createdAt: now, createdBy: req.session.user.name });
      }
      return users.length;
    });
    res.json({ added: out });
  }));
  app.patch("/api/library/readers/:id", requireLibrary, wrap(async (req, res) => {
    const r = await readers().get(req.params.id);
    if (!r) return res.status(404).json({ error: "Không tìm thấy bạn đọc" });
    const patch = {};
    if (req.body?.status !== undefined) { if (!["active", "locked"].includes(req.body.status)) return res.status(400).json({ error: "Trạng thái không hợp lệ" }); patch.status = req.body.status; }
    if (req.body?.className !== undefined && r.type === "Học sinh") { const c = str(req.body.className, 20).toUpperCase(); if (!/^[6-9][A-Z0-9]{1,6}$/.test(c)) return res.status(400).json({ error: "Lớp không hợp lệ" }); patch.className = c; patch.grade = Number(c[0]); }
    res.json(await readers().update(r.id, patch));
  }));
  // Xóa bạn đọc (học sinh ra trường, cha mẹ rút đồng ý): giữ lượt mượn đã ẩn danh để thống kê
  app.delete("/api/library/readers/:id", requireLibrary, wrap(async (req, res) => {
    const r = await readers().get(req.params.id);
    if (!r) return res.status(404).json({ error: "Không tìm thấy bạn đọc" });
    const ls = (await loans().all()).filter((l) => l.readerId === r.id);
    if (ls.some((l) => !l.returnedAt)) return res.status(409).json({ error: "Bạn đọc còn sách chưa trả" });
    for (const l of ls) await loans().update(l.id, { readerName: "(đã xóa)", readerId: `deleted-${r.type}` });
    await readers().remove(r.id);
    res.json({ ok: true, anonymizedLoans: ls.length });
  }));

  // ---------- Mượn – trả ----------
  app.get("/api/library/loans", requireLibrary, wrap(async (req, res) => {
    const { readerId, open, overdue } = req.query, t = today();
    const tMap = new Map((await titles().all()).map((x) => [x.id, x.title]));
    res.json((await loans().all()).filter((l) => (!readerId || l.readerId === readerId) && (open !== "1" || !l.returnedAt) && (overdue !== "1" || (!l.returnedAt && l.dueDate < t)))
      .map((l) => ({ ...l, title: tMap.get(l.titleId) || "", overdueDays: !l.returnedAt && l.dueDate < t ? Math.round((new Date(t) - new Date(l.dueDate)) / 864e5) : 0 })));
  }));
  // Lượt mượn của chính giáo viên đang đăng nhập
  app.get("/api/library/my-loans", requireAuth, wrap(async (req, res) => {
    const r = (await readers().all()).find((x) => x.userId === req.session.user.id);
    if (!r) return res.json({ reader: null, loans: [] });
    const tMap = new Map((await titles().all()).map((x) => [x.id, x.title]));
    res.json({ reader: r, loans: (await loans().all()).filter((l) => l.readerId === r.id).map((l) => ({ ...l, title: tMap.get(l.titleId) || "" })) });
  }));
  app.post("/api/library/loans", requireLibrary, wrap(async (req, res) => {
    const out = await serial(async () => {
      const r = await readers().get(str(req.body?.readerId, 20).toUpperCase());
      if (!r) return { status: 404, error: "Không tìm thấy thẻ bạn đọc" };
      if (r.status !== "active") return { status: 409, error: "Thẻ bạn đọc đang bị khóa" };
      const rules = await getRules(), isStudent = r.type === "Học sinh";
      const mode = req.body?.mode === "Đọc tại chỗ" ? "Đọc tại chỗ" : "Mượn về nhà";
      const codes = [...new Set((Array.isArray(req.body?.codes) ? req.body.codes : []).map((x) => str(x, 30).toUpperCase()).filter(Boolean))];
      if (!codes.length) return { status: 400, error: "Quét hoặc nhập số ĐKCB của sách" };
      const all = await loans().all(), t = today();
      const open = all.filter((l) => l.readerId === r.id && !l.returnedAt && l.mode !== "Đọc tại chỗ");
      if (mode === "Mượn về nhà" && open.some((l) => l.dueDate < t)) return { status: 409, error: `${r.name} đang có sách quá hạn, cần trả trước khi mượn tiếp` };
      const max = isStudent ? rules.studentMax : rules.staffMax;
      if (mode === "Mượn về nhà" && open.length + codes.length > max) return { status: 409, error: `${r.name} chỉ được mượn tối đa ${max} quyển cùng lúc (đang mượn ${open.length})` };
      const due = mode === "Đọc tại chỗ" ? t : isoDay(req.body?.dueDate) || addDays(t, isStudent ? rules.studentDays : rules.staffDays);
      if (due < t) return { status: 400, error: "Hạn trả phải từ hôm nay trở đi" };
      const cs = [];
      for (const code of codes) {
        const c = await copies().get(code);
        if (!c) return { status: 404, error: `Không có quyển ${code}` };
        if (!["Trên giá", "Chưa xếp giá"].includes(c.status)) return { status: 409, error: `Quyển ${code} đang ở tình trạng “${c.status}”` };
        cs.push(c);
      }
      const now = new Date().toISOString(), made = [];
      for (const c of cs) {
        await copies().update(c.code, { status: "Đang mượn", updatedAt: now });
        made.push(await loans().insert({ id: newId(), copyCode: c.code, titleId: c.titleId, kind: c.code.split("-")[0], readerId: r.id, readerName: r.name, readerType: r.type, className: r.className || "",
          mode, loanAt: now, loanDate: t, dueDate: due, returnedAt: null, staff: req.session.user.name, renewals: 0, shelf: c.shelf || "" }));
      }
      return { value: made };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json(out.value);
  }));
  // Trả sách: quét số ĐKCB; tình trạng khi trả
  app.post("/api/library/returns", requireLibrary, wrap(async (req, res) => {
    const out = await serial(async () => {
      const code = str(req.body?.code, 30).toUpperCase();
      const condition = ["Bình thường", "Hỏng", "Mất"].includes(req.body?.condition) ? req.body.condition : "Bình thường";
      const l = (await loans().all()).find((x) => x.copyCode === code && !x.returnedAt);
      if (!l) return { status: 404, error: `Quyển ${code} không có trong danh sách đang mượn` };
      const now = new Date().toISOString(), t = today();
      const c = await copies().get(code);
      await copies().update(code, { status: condition === "Hỏng" ? "Hỏng" : condition === "Mất" ? "Mất" : c?.shelf ? "Trên giá" : "Chưa xếp giá", updatedAt: now });
      return { value: await loans().update(l.id, { returnedAt: now, returnDate: t, condition, note: str(req.body?.note, 200), lateDays: l.dueDate < t ? Math.round((new Date(t) - new Date(l.dueDate)) / 864e5) : 0, returnedTo: req.session.user.name }) };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json(out.value);
  }));
  app.post("/api/library/loans/:id/renew", requireLibrary, wrap(async (req, res) => {
    const l = await loans().get(req.params.id);
    if (!l || l.returnedAt) return res.status(404).json({ error: "Không có lượt mượn đang mở" });
    if (l.renewals >= 1) return res.status(409).json({ error: "Mỗi lượt mượn chỉ gia hạn một lần" });
    const rules = await getRules(), base = l.dueDate > today() ? l.dueDate : today();
    res.json(await loans().update(l.id, { dueDate: addDays(base, l.readerType === "Học sinh" ? rules.studentDays : rules.staffDays), renewals: (l.renewals || 0) + 1 }));
  }));

  // ---------- Tiết đọc thư viện ----------
  app.get("/api/library/reading-periods", requireAuth, wrap(async (req, res) => {
    const sy = String(req.query.schoolYear || currentSchoolYear());
    const list = (await periods().all()).filter((p) => p.schoolYear === sy).sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
    // Lớp có học sinh trong danh sách bạn đọc hoặc đã có tiết đọc
    const classes = [...new Set([...(await readers().all()).filter((r) => r.type === "Học sinh").map((r) => r.className), ...list.map((p) => p.className)])].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
    const summary = classes.map((c) => {
      const hk1 = list.filter((p) => p.className === c && p.term === "HK1" && p.status === "Đã dạy").length;
      const hk2 = list.filter((p) => p.className === c && p.term === "HK2" && p.status === "Đã dạy").length;
      const planned = list.filter((p) => p.className === c && p.status === "Kế hoạch").length;
      return { className: c, hk1, hk2, planned, ok1: hk1 >= MIN_READING_PERIODS, ok2: hk2 >= MIN_READING_PERIODS };
    });
    res.json({ schoolYear: sy, min: MIN_READING_PERIODS, periods: list, summary });
  }));
  app.post("/api/library/reading-periods", requireLibrary, wrap(async (req, res) => {
    const b = req.body || {}, date = isoDay(b.date), slot = str(b.slot, 4).toUpperCase(), className = str(b.className, 20).toUpperCase();
    if (!date) return res.status(400).json({ error: "Chọn ngày" });
    if (!/^[SC][1-5]$/.test(slot)) return res.status(400).json({ error: "Chọn tiết" });
    if (!/^[6-9][A-Z0-9]{1,6}$/.test(className)) return res.status(400).json({ error: "Lớp không hợp lệ (VD: 7A2)" });
    const clash = (await periods().all()).find((p) => p.date === date && p.slot === slot);
    if (clash) return res.status(409).json({ error: `Thư viện đã có tiết đọc của lớp ${clash.className} vào tiết này` });
    const { schoolYear, term } = termOf(date);
    res.status(201).json(await periods().insert({ id: newId(), date, slot, slotName: slotLabel([slot]), className, schoolYear, term, topic: str(b.topic, 200), leader: str(b.leader, 80), status: "Kế hoạch", attendance: null, note: "", createdBy: req.session.user.name, createdAt: new Date().toISOString() }));
  }));
  app.patch("/api/library/reading-periods/:id", requireLibrary, wrap(async (req, res) => {
    const p = await periods().get(req.params.id);
    if (!p) return res.status(404).json({ error: "Không tìm thấy tiết đọc" });
    const b = req.body || {}, patch = {};
    if (b.status !== undefined) { if (!["Kế hoạch", "Đã dạy", "Hủy"].includes(b.status)) return res.status(400).json({ error: "Trạng thái không hợp lệ" }); patch.status = b.status; }
    if (b.attendance !== undefined) patch.attendance = Math.max(0, Math.min(60, Math.floor(Number(b.attendance)) || 0));
    if (b.note !== undefined) patch.note = str(b.note, 300);
    if (b.topic !== undefined) patch.topic = str(b.topic, 200);
    if (patch.status === "Đã dạy" && (patch.attendance ?? p.attendance) == null) return res.status(400).json({ error: "Ghi sĩ số học sinh tham gia" });
    res.json(await periods().update(p.id, patch));
  }));
  app.delete("/api/library/reading-periods/:id", requireLibrary, wrap(async (req, res) => res.json(await periods().remove(req.params.id))));

  // ---------- Tra cứu công khai (OPAC) – không cần đăng nhập, không có dữ liệu bạn đọc ----------
  app.get("/api/opac", wrap(async (req, res) => {
    const q = fold(str(req.query.q, 100)), kind = String(req.query.kind || ""), grade = String(req.query.grade || "");
    const cs = await copies().all();
    const out = (await titles().all()).filter((t) => (!kind || t.kind === kind) && (!grade || String(t.grade || "") === grade)
      && (!q || fold([t.title, t.author, t.publisher, t.keywords, t.classification].join(" ")).includes(q)))
      .map((t) => {
        const mine = cs.filter((c) => c.titleId === t.id && c.status !== "Thanh lý" && c.status !== "Mất");
        return { id: t.id, title: t.title, author: t.author, publisher: t.publisher, year: t.year, kind: BOOK_KINDS[t.kind] || t.kind, grade: t.grade, callNumber: t.callNumber || "", summary: t.summary || "",
          total: mine.length, available: mine.filter((c) => c.status === "Trên giá").length, shelves: [...new Set(mine.filter((c) => c.status === "Trên giá").map((c) => c.shelf).filter(Boolean))] };
      }).filter((t) => t.total > 0).sort((a, b) => a.title.localeCompare(b.title, "vi")).slice(0, 100);
    res.json({ results: out, kinds: BOOK_KINDS });
  }));

  // ---------- Biên mục ----------
  app.patch("/api/library/titles/:id", requireLibrary, wrap(async (req, res) => {
    const t = await titles().get(req.params.id);
    if (!t) return res.status(404).json({ error: "Không tìm thấy đầu sách" });
    const b = req.body || {}, patch = {};
    for (const [k, n] of [["title", 300], ["author", 150], ["publisher", 150], ["year", 10], ["grade", 20], ["isbn", 30], ["classification", 40], ["callNumber", 40], ["keywords", 300], ["summary", 1000], ["pages", 10], ["size", 20]]) if (b[k] !== undefined) patch[k] = str(b[k], n);
    if (patch.title === "") return res.status(400).json({ error: "Tên sách không được để trống" });
    res.json(await titles().update(t.id, { ...patch, catalogedAt: new Date().toISOString(), catalogedBy: req.session.user.name }));
  }));

  // ---------- Kiểm kê kho sách ----------
  app.get("/api/library/stocktakes", requireLibrary, wrap(async (req, res) => res.json(await libaudits().all())));
  app.post("/api/library/stocktakes", requireLibrary, wrap(async (req, res) => {
    const shelf = str(req.body?.shelf, 20).toUpperCase();
    const expected = (await copies().all()).filter((c) => c.status === "Trên giá" && (!shelf || c.shelf === shelf)).map((c) => c.code);
    if (!expected.length) return res.status(400).json({ error: "Không có quyển nào trên giá trong phạm vi này" });
    res.status(201).json(await libaudits().insert({ id: newId(), title: str(req.body?.title, 120) || `Kiểm kê kho sách ${new Date().toLocaleDateString("vi-VN")}`, shelf, expected, found: [], extra: [], status: "Đang kiểm kê", createdBy: req.session.user.name, createdAt: new Date().toISOString() }));
  }));
  app.post("/api/library/stocktakes/:id/scan", requireLibrary, wrap(async (req, res) => {
    const a = await libaudits().get(req.params.id);
    if (!a || a.status !== "Đang kiểm kê") return res.status(409).json({ error: "Phiên kiểm kê đã kết thúc" });
    const codes = (Array.isArray(req.body?.codes) ? req.body.codes : []).map((x) => str(x, 30).toUpperCase()).filter(Boolean);
    const exp = new Set(a.expected), found = new Set(a.found), extra = new Set(a.extra);
    for (const c of codes) (exp.has(c) ? found : extra).add(c);
    res.json(await libaudits().update(a.id, { found: [...found], extra: [...extra] }));
  }));
  // Kết thúc: quyển không tìm thấy → “Mất” (hoặc giữ nguyên để tìm tiếp)
  app.post("/api/library/stocktakes/:id/finish", requireLibrary, wrap(async (req, res) => {
    const a = await libaudits().get(req.params.id);
    if (!a || a.status !== "Đang kiểm kê") return res.status(409).json({ error: "Phiên kiểm kê đã kết thúc" });
    const missing = a.expected.filter((c) => !a.found.includes(c));
    if (req.body?.markMissing) for (const c of missing) await copies().update(c, { status: "Mất", note: `Không tìm thấy khi ${a.title}`, updatedAt: new Date().toISOString() });
    res.json(await libaudits().update(a.id, { status: "Hoàn tất", missing, markedMissing: !!req.body?.markMissing, finishedAt: new Date().toISOString(), finishedBy: req.session.user.name }));
  }));
  // Thanh lọc: đưa các quyển hỏng, lạc hậu ra khỏi kho theo quyết định
  app.post("/api/library/weed", requireLibrary, wrap(async (req, res) => {
    const codes = [...new Set((Array.isArray(req.body?.codes) ? req.body.codes : []).map((x) => str(x, 30).toUpperCase()))];
    const reason = ["Hư hỏng", "Nội dung lạc hậu", "Mất", "Khác"].includes(req.body?.reason) ? req.body.reason : null;
    if (!codes.length) return res.status(400).json({ error: "Chọn quyển cần thanh lọc" });
    if (!reason) return res.status(400).json({ error: "Chọn lý do thanh lọc" });
    const done = [];
    for (const c of codes) {
      const cp = await copies().get(c);
      if (!cp || cp.status === "Đang mượn" || cp.status === "Thanh lý") continue;
      await copies().update(c, { status: "Thanh lý", weedReason: reason, weedDecision: str(req.body?.decisionNo, 60), weededAt: new Date().toISOString(), weededBy: req.session.user.name });
      done.push(c);
    }
    res.json({ weeded: done });
  }));

  // ---------- Thống kê thư viện ----------
  app.get("/api/library/stats", requireLibrary, wrap(async (req, res) => {
    const sy = String(req.query.schoolYear || currentSchoolYear()), t = today();
    const [rs, ls, cs, ts, ps] = await Promise.all([readers().all(), loans().all(), copies().all(), titles().all(), periods().all()]);
    const yl = ls.filter((l) => inYear(l.loanDate, sy));
    const readersOf = (type) => rs.filter((r) => r.type === type);
    const activeOf = (type) => new Set(yl.filter((l) => l.readerType === type && !String(l.readerId).startsWith("deleted")).map((l) => l.readerId));
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const st = readersOf("Học sinh"), gv = readersOf("Giáo viên");
    const months = {};
    for (const l of yl) months[l.loanDate.slice(0, 7)] = (months[l.loanDate.slice(0, 7)] || 0) + 1;
    const tCount = {};
    for (const l of yl) tCount[l.titleId] = (tCount[l.titleId] || 0) + 1;
    const tMap = new Map(ts.map((x) => [x.id, x.title]));
    const byClass = {};
    for (const r of st) byClass[r.className] ||= { readers: 0, active: 0, loans: 0 };
    for (const r of st) byClass[r.className].readers++;
    const actSt = activeOf("Học sinh");
    for (const r of st) if (actSt.has(r.id)) byClass[r.className].active++;
    for (const l of yl) if (l.readerType === "Học sinh" && byClass[l.className]) byClass[l.className].loans++;
    const live = cs.filter((c) => c.status !== "Thanh lý" && c.status !== "Mất");
    res.json({
      schoolYear: sy,
      collection: { titles: ts.length, copies: live.length, byKind: Object.fromEntries(Object.keys(BOOK_KINDS).map((k) => [k, live.filter((c) => c.code.startsWith(`${k}-`)).length])),
        onLoan: cs.filter((c) => c.status === "Đang mượn").length, damaged: cs.filter((c) => c.status === "Hỏng").length, lost: cs.filter((c) => c.status === "Mất").length, weeded: cs.filter((c) => c.status === "Thanh lý").length },
      readers: { students: st.length, teachers: gv.length, studentsActive: actSt.size, teachersActive: activeOf("Giáo viên").size,
        studentPct: pct(actSt.size, st.length), teacherPct: pct(activeOf("Giáo viên").size, gv.length), copiesPerStudent: st.length ? Math.round((live.length / st.length) * 10) / 10 : null },
      loans: { total: yl.length, home: yl.filter((l) => l.mode !== "Đọc tại chỗ").length, inLibrary: yl.filter((l) => l.mode === "Đọc tại chỗ").length, open: ls.filter((l) => !l.returnedAt).length,
        overdue: ls.filter((l) => !l.returnedAt && l.dueDate < t).length, byMonth: months,
        topTitles: Object.entries(tCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ title: tMap.get(id) || id, loans: n })) },
      byClass,
      readingPeriods: { done: ps.filter((p) => p.schoolYear === sy && p.status === "Đã dạy").length, planned: ps.filter((p) => p.schoolYear === sy && p.status === "Kế hoạch").length },
    });
  }));
}
