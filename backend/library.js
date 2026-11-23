/**
 * Thư viện: nhận sách giáo khoa, sách tham khảo, truyện thiếu nhi, báo – tạp chí, tài liệu giảng dạy theo hóa đơn
 *
 *  1. Lập phiếu nhận theo hóa đơn (các dòng: tên, tác giả, NXB, năm, loại, số lượng theo hóa đơn, đơn giá)
 *  2. Kiểm đếm: nhập số thực nhận từng dòng, hệ thống đối chiếu thừa/thiếu và tiền
 *  3. Xác nhận nhận: tạo/gộp đầu sách, cấp cho MỖI QUYỂN một số đăng ký cá biệt (ĐKCB) theo loại,
 *     sinh phụ lục (tên, giá từng quyển, dải mã ĐKCB) – dùng để ghi sổ đăng ký tổng quát và cá biệt
 *  4. In nhãn QR cho từng quyển; xếp lên giá theo mã QR của kệ
 */
import db, { newId } from "./database.js";
import { serial } from "./inventory.js";

export const BOOK_KINDS = {
  SGK: "Sách giáo khoa",
  STK: "Sách tham khảo",
  STN: "Sách thiếu nhi, truyện",
  SNV: "Sách nghiệp vụ, tài liệu giảng dạy",
  BTC: "Báo, tạp chí",
};
export const COPY_STATUS = ["Trên giá", "Chưa xếp giá", "Đang mượn", "Hỏng", "Mất", "Thanh lý"];
const SOURCES = ["Mua sắm", "Cấp phát", "Tặng, xã hội hóa", "Khác"];

const titles = () => db.collection("booktitles");
const copies = () => db.collection("bookcopies");
const receipts = () => db.collection("bookreceipts");
const shelves = () => db.collection("shelves");
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const int = (v, min, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
const key = (t) => [t.title, t.author, t.publisher, t.year, t.kind].map((x) => String(x || "").trim().toLowerCase()).join("|");

function cleanLine(l) {
  const kind = l?.kind in BOOK_KINDS ? l.kind : null;
  const title = str(l?.title, 300);
  const invoiceQty = int(l?.invoiceQty, 1, 10000), price = int(l?.price ?? 0, 0, 100_000_000);
  if (!title) return { error: "Thiếu tên sách ở một dòng" };
  if (!kind) return { error: `“${title}”: chọn loại tài liệu` };
  if (invoiceQty === null) return { error: `“${title}”: số lượng theo hóa đơn từ 1 trở lên` };
  if (price === null) return { error: `“${title}”: đơn giá không hợp lệ` };
  return { value: {
    id: str(l.id, 40) || newId(), title, author: str(l.author, 150), publisher: str(l.publisher, 150), year: str(l.year, 10),
    kind, grade: str(l.grade, 20), isbn: str(l.isbn, 30), invoiceQty, price,
    receivedQty: l.receivedQty === undefined || l.receivedQty === null || l.receivedQty === "" ? null : int(l.receivedQty, 0, 10000),
    note: str(l.note, 200),
  } };
}
const total = (lines, k) => lines.reduce((a, l) => a + (Number(l[k]) || 0) * l.price, 0);

export function registerLibraryRoutes(app, { requireAuth, wrap }) {
  const requireLibrary = (req, res, next) => {
    const u = req.session?.user;
    if (!u) return res.status(401).json({ error: "Vui lòng đăng nhập" });
    // Thủ thư và nhân viên thiết bị (một người thường kiêm hai việc) được làm thư viện; Ban giám hiệu chỉ xem thống kê; quản trị hệ thống không làm nghiệp vụ
    const canWrite = u.isLibrarian || u.isEquipment || (u.isAdmin && !u.roles);
    const canRead = canWrite || u.isPrincipal;
    if (!(req.method === "GET" || req.method === "HEAD" ? canRead : canWrite)) return res.status(403).json({ error: "Chỉ nhân viên thư viện, thiết bị" });
    next();
  };

  app.get("/api/library/meta", requireAuth, (req, res) => res.json({ kinds: BOOK_KINDS, statuses: COPY_STATUS, sources: SOURCES }));

  // ---------- Kệ sách ----------
  app.get("/api/library/shelves", requireAuth, wrap(async (req, res) => {
    const all = await copies().all();
    res.json((await shelves().all()).map((s) => ({ ...s, count: all.filter((c) => c.shelf === s.code && c.status === "Trên giá").length })).sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true })));
  }));
  app.post("/api/library/shelves", requireLibrary, wrap(async (req, res) => {
    const code = str(req.body?.code, 20).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(code)) return res.status(400).json({ error: "Mã kệ: chữ in hoa, số, gạch ngang (VD: K01-T2)" });
    if ((await shelves().all()).some((s) => s.code === code)) return res.status(409).json({ error: "Mã kệ đã có" });
    res.status(201).json(await shelves().insert({ id: newId(), code, name: str(req.body?.name, 100), room: str(req.body?.room, 100), kinds: (req.body?.kinds || []).filter((k) => k in BOOK_KINDS), createdAt: new Date().toISOString() }));
  }));
  app.delete("/api/library/shelves/:id", requireLibrary, wrap(async (req, res) => {
    const s = await shelves().get(req.params.id);
    if (!s) return res.status(404).json({ error: "Không tìm thấy kệ" });
    if ((await copies().all()).some((c) => c.shelf === s.code)) return res.status(409).json({ error: "Kệ còn sách, chuyển sách sang kệ khác trước" });
    res.json(await shelves().remove(s.id));
  }));

  // ---------- Phiếu nhận theo hóa đơn ----------
  app.get("/api/library/receipts", requireLibrary, wrap(async (req, res) => res.json(await receipts().all())));
  app.get("/api/library/receipts/:id", requireLibrary, wrap(async (req, res) => {
    const r = await receipts().get(req.params.id);
    if (!r) return res.status(404).json({ error: "Không tìm thấy phiếu" });
    res.json({ ...r, copies: (await copies().all()).filter((c) => c.receiptId === r.id).sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true })) });
  }));
  const cleanReceipt = (b) => {
    const lines = [];
    for (const l of (Array.isArray(b.lines) ? b.lines : []).slice(0, 500)) { const v = cleanLine(l); if (v.error) return v; lines.push(v.value); }
    if (!lines.length) return { error: "Phiếu cần ít nhất một dòng sách" };
    return { value: { invoiceNo: str(b.invoiceNo, 60), invoiceDate: isoDay(b.invoiceDate), supplier: str(b.supplier, 150), source: SOURCES.includes(b.source) ? b.source : "Mua sắm", note: str(b.note, 300), defaultShelf: str(b.defaultShelf, 20).toUpperCase(), lines } };
  };
  app.post("/api/library/receipts", requireLibrary, wrap(async (req, res) => {
    const v = cleanReceipt(req.body || {});
    if (v.error) return res.status(400).json(v);
    if (!v.value.invoiceNo) return res.status(400).json({ error: "Nhập số hóa đơn (hoặc số phiếu cấp phát)" });
    const doc = { id: newId(), status: "Chờ kiểm đếm", ...v.value, invoiceTotal: total(v.value.lines, "invoiceQty"), createdBy: req.session.user.name, createdAt: new Date().toISOString() };
    res.status(201).json(await receipts().insert(doc));
  }));
  app.patch("/api/library/receipts/:id", requireLibrary, wrap(async (req, res) => {
    const r = await receipts().get(req.params.id);
    if (!r) return res.status(404).json({ error: "Không tìm thấy phiếu" });
    if (r.status !== "Chờ kiểm đếm") return res.status(409).json({ error: "Phiếu đã nhận sách, không sửa được" });
    const v = cleanReceipt({ ...r, ...req.body });
    if (v.error) return res.status(400).json(v);
    res.json(await receipts().update(r.id, { ...v.value, invoiceTotal: total(v.value.lines, "invoiceQty"), updatedAt: new Date().toISOString() }));
  }));
  app.delete("/api/library/receipts/:id", requireLibrary, wrap(async (req, res) => {
    const r = await receipts().get(req.params.id);
    if (!r) return res.status(404).json({ error: "Không tìm thấy phiếu" });
    if (r.status !== "Chờ kiểm đếm") return res.status(409).json({ error: "Phiếu đã nhận sách, không xóa được" });
    res.json(await receipts().remove(r.id));
  }));

  // Kiểm đếm xong → xác nhận nhận: cấp số ĐKCB cho từng quyển
  app.post("/api/library/receipts/:id/receive", requireLibrary, wrap(async (req, res) => {
    const out = await serial(async () => {
      const r = await receipts().get(req.params.id);
      if (!r) return { status: 404, error: "Không tìm thấy phiếu" };
      if (r.status !== "Chờ kiểm đếm") return { status: 409, error: "Phiếu đã được nhận" };
      const counted = new Map((Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => [l.id, int(l.receivedQty, 0, 10000)]));
      const lines = r.lines.map((l) => ({ ...l, receivedQty: counted.has(l.id) ? counted.get(l.id) : l.receivedQty }));
      const missing = lines.find((l) => l.receivedQty === null || l.receivedQty === undefined);
      if (missing) return { status: 400, error: `Chưa nhập số thực nhận: “${missing.title}”` };
      if (!lines.some((l) => l.receivedQty > 0)) return { status: 400, error: "Không có quyển nào được nhận" };

      const now = new Date().toISOString();
      const allTitles = await titles().all();
      const allCopies = await copies().all();
      const nextSeq = {};
      for (const k of Object.keys(BOOK_KINDS)) nextSeq[k] = allCopies.filter((c) => c.code.startsWith(`${k}-`)).reduce((m, c) => Math.max(m, Number(c.code.slice(k.length + 1)) || 0), 0) + 1;
      const shelf = str(req.body?.shelf ?? r.defaultShelf, 20).toUpperCase();
      const outLines = [];
      for (const l of lines) {
        let t = allTitles.find((x) => key(x) === key(l));
        if (!t) {
          t = await titles().insert({ id: newId(), title: l.title, author: l.author, publisher: l.publisher, year: l.year, kind: l.kind, grade: l.grade, isbn: l.isbn, price: l.price, createdAt: now });
          allTitles.push(t);
        } else if (l.price && l.price !== t.price) await titles().update(t.id, { price: l.price });
        const codes = [];
        for (let i = 0; i < l.receivedQty; i++) {
          const code = `${l.kind}-${String(nextSeq[l.kind]++).padStart(5, "0")}`;
          codes.push(code);
          await copies().insert({ id: code, code, titleId: t.id, receiptId: r.id, price: l.price, shelf: shelf || "", status: shelf ? "Trên giá" : "Chưa xếp giá", createdAt: now });
        }
        outLines.push({ ...l, titleId: t.id, codeFrom: codes[0] || "", codeTo: codes[codes.length - 1] || "", diff: l.receivedQty - l.invoiceQty });
      }
      const short = outLines.filter((l) => l.diff !== 0);
      const doc = await receipts().update(r.id, {
        lines: outLines, status: short.length ? "Nhận có chênh lệch" : "Đã nhận đủ", receivedTotal: total(outLines, "receivedQty"),
        receivedCopies: outLines.reduce((a, l) => a + l.receivedQty, 0), countNote: str(req.body?.countNote, 500), receivedBy: req.session.user.name, receivedAt: now,
      });
      return { value: doc };
    });
    if (out.error) return res.status(out.status || 400).json({ error: out.error });
    res.json(out.value);
  }));

  // ---------- Đầu sách, bản sách ----------
  app.get("/api/library/titles", requireLibrary, wrap(async (req, res) => {
    const all = await copies().all();
    res.json((await titles().all()).map((t) => {
      const cs = all.filter((c) => c.titleId === t.id);
      return { ...t, copies: cs.length, onShelf: cs.filter((c) => c.status === "Trên giá").length, unshelved: cs.filter((c) => c.status === "Chưa xếp giá").length };
    }).sort((a, b) => a.title.localeCompare(b.title, "vi")));
  }));
  app.get("/api/library/copies", requireLibrary, wrap(async (req, res) => {
    const { titleId, shelf, status, receiptId } = req.query;
    res.json((await copies().all()).filter((c) => (!titleId || c.titleId === titleId) && (!shelf || c.shelf === shelf) && (!status || c.status === status) && (!receiptId || c.receiptId === receiptId))
      .sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true })));
  }));
  // Trang mở khi quét QR trên quyển sách
  app.get("/api/library/copies/:code", requireAuth, wrap(async (req, res) => {
    const c = await copies().get(String(req.params.code).toUpperCase());
    if (!c) return res.status(404).json({ error: "Không tìm thấy quyển sách có mã này" });
    const t = await titles().get(c.titleId);
    const r = await receipts().get(c.receiptId);
    const shelf = (await shelves().all()).find((s) => s.code === c.shelf);
    const u = req.session.user;
    const staff = !!(u.isLibrarian || u.isEquipment || u.isSysadmin);
    res.json({ copy: staff ? c : { code: c.code, shelf: c.shelf, status: c.status }, title: t, shelf: shelf || null, receipt: staff && r ? { invoiceNo: r.invoiceNo, invoiceDate: r.invoiceDate, supplier: r.supplier, source: r.source } : null, staff });
  }));
  app.patch("/api/library/copies/:code", requireLibrary, wrap(async (req, res) => {
    const c = await copies().get(String(req.params.code).toUpperCase());
    if (!c) return res.status(404).json({ error: "Không tìm thấy quyển sách" });
    const patch = {};
    if (req.body?.status !== undefined) { if (!COPY_STATUS.includes(req.body.status)) return res.status(400).json({ error: "Tình trạng không hợp lệ" }); patch.status = req.body.status; }
    if (req.body?.note !== undefined) patch.note = str(req.body.note, 200);
    res.json(await copies().update(c.id, { ...patch, updatedAt: new Date().toISOString(), updatedBy: req.session.user.name }));
  }));
  // Xếp lên giá: kệ (quét QR kệ) + danh sách mã quyển (quét QR từng quyển)
  app.post("/api/library/shelve", requireLibrary, wrap(async (req, res) => {
    const code = str(req.body?.shelf, 20).toUpperCase();
    const s = (await shelves().all()).find((x) => x.code === code);
    if (!s) return res.status(404).json({ error: "Không có kệ mã này" });
    const list = [...new Set((Array.isArray(req.body?.codes) ? req.body.codes : []).map((x) => str(x, 30).toUpperCase()).filter(Boolean))].slice(0, 1000);
    const done = [], notFound = [], skipped = [];
    for (const k of list) {
      const c = await copies().get(k);
      if (!c) { notFound.push(k); continue; }
      if (["Đang mượn", "Mất", "Thanh lý"].includes(c.status)) { skipped.push(`${k} (${c.status})`); continue; }
      await copies().update(k, { shelf: s.code, status: c.status === "Hỏng" ? "Hỏng" : "Trên giá", shelvedAt: new Date().toISOString(), updatedBy: req.session.user.name });
      done.push(k);
    }
    res.json({ shelf: s.code, done, notFound, skipped });
  }));
}
