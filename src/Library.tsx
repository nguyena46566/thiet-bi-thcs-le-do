// Thư viện: nhận sách theo hóa đơn → kiểm đếm → phụ lục + số ĐKCB từng quyển → nhãn QR → xếp giá theo QR kệ
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  fetchLibraryMeta, fetchReceipts, fetchReceipt, createReceipt, updateReceipt, deleteReceipt, receiveReceipt, fetchTitles, fetchCopies, fetchCopy, updateCopy,
  shelveCopies, fetchShelves, createShelf, deleteShelf, fold, catalogTitle,
  type BookReceipt, type ReceiptLine, type BookTitle, type BookCopy, type Shelf,
} from "@/api"
import { exportExcel, printDoc } from "./Operations"
import { printHtml, esc, table, dots } from "./printing"
import { useAuth } from "./AuthContext"

const card = "bg-white rounded-2xl shadow-sm border border-gray-100"
const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/50 focus:border-[#1a3670] bg-white"
const label = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const th = "relative px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const money = (n: number) => `${(n || 0).toLocaleString("vi-VN")} đ`
const isoToVn = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "" }
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)
const Ok = ({ msg }: { msg: string }) => (msg ? <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)
const ST_CLS: Record<string, string> = { "Chờ kiểm đếm": "bg-amber-50 text-amber-800", "Đã nhận đủ": "bg-green-50 text-green-700", "Nhận có chênh lệch": "bg-red-50 text-red-700" }
type Meta = { kinds: Record<string, string>; statuses: string[]; sources: string[] }
const useMeta = () => { const [m, setM] = useState<Meta | null>(null); useEffect(() => { fetchLibraryMeta().then(setM).catch(() => {}) }, []); return m }

// ---------------- In ấn ----------------
/** Nhãn dán từng quyển: QR mở trang quyển sách, số ĐKCB in to, tên rút gọn, loại, kệ */
export async function printBookLabels(list: (BookCopy & { title?: string; kind?: string })[]) {
  const QR = await import("qrcode")
  const base = `${window.location.origin}${window.location.pathname}#sach/`
  const cells = await Promise.all(list.map(async (c) => {
    const img = await QR.toDataURL(base + encodeURIComponent(c.code), { margin: 1, width: 200, errorCorrectionLevel: "M" })
    return `<div class="l"><img src="${img}" alt=""><div><code>${esc(c.code)}</code><b>${esc((c.title || "").slice(0, 60))}</b><span>THCS Lê Độ${c.shelf ? ` · Kệ ${esc(c.shelf)}` : ""}</span></div></div>`
  }))
  const w = window.open("", "_blank")
  if (!w) { alert("Trình duyệt chặn cửa sổ mới. Hãy cho phép pop-up để in nhãn."); return }
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Nhãn sách</title><style>
    body{font-family:Arial,sans-serif;margin:10mm}h1{font-size:14px;margin:0 0 6px}p{font-size:11px;color:#555;margin:0 0 10px}
    .g{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}.l{display:flex;gap:2mm;align-items:center;border:1px dashed #999;border-radius:2mm;padding:2mm;break-inside:avoid}
    .l img{width:18mm;height:18mm}.l code{display:block;font-size:12px;font-weight:bold;letter-spacing:.5px}.l b{display:block;font-size:8.5px;line-height:1.2;margin-top:.5mm}.l span{display:block;font-size:7.5px;color:#555;margin-top:.5mm}
    @media print{h1,p,button{display:none}body{margin:6mm}}</style></head><body>
    <h1>Nhãn sách – ${list.length} quyển</h1><p>Mỗi quyển một nhãn: dán vào gáy hoặc bìa sau. Quét QR bằng điện thoại để mở thông tin quyển và xếp lên kệ.</p>
    <button onclick="window.print()">In nhãn</button><div class="g">${cells.join("")}</div></body></html>`)
  w.document.close()
}
async function printShelfLabels(list: Shelf[]) {
  const QR = await import("qrcode")
  const base = `${window.location.origin}${window.location.pathname}#ke/`
  const cells = await Promise.all(list.map(async (s) => `<div class="l"><img src="${await QR.toDataURL(base + encodeURIComponent(s.code), { margin: 1, width: 300 })}" alt=""><div><code>${esc(s.code)}</code><b>${esc(s.name)}</b><span>${esc(s.room)}</span></div></div>`))
  const w = window.open("", "_blank")
  if (!w) return
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Nhãn kệ sách</title><style>body{font-family:Arial,sans-serif;margin:12mm}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}.l{display:flex;gap:4mm;align-items:center;border:1px dashed #999;padding:4mm;break-inside:avoid}.l img{width:40mm;height:40mm}code{display:block;font-size:26px;font-weight:bold}b{display:block;font-size:14px}span{font-size:12px;color:#555}@media print{button{display:none}}</style></head><body><button onclick="window.print()">In</button><div class="g">${cells.join("")}</div></body></html>`)
  w.document.close()
}
/** Phụ lục kèm biên bản: tên, tác giả, giá từng quyển, số lượng hóa đơn – thực nhận, dải số ĐKCB */
function printAppendix(r: BookReceipt, kinds: Record<string, string>) {
  printHtml({
    title: "Phụ lục danh mục tài liệu nhận về", subtitle: `Kèm theo biên bản giao nhận – hóa đơn số ${r.invoiceNo}${r.invoiceDate ? ` ngày ${isoToVn(r.invoiceDate)}` : ""}`, landscape: true,
    body: `<p>Nhà cung cấp: ${esc(r.supplier)} · Nguồn: ${esc(r.source)}</p>
      ${table(["STT", "Tên tài liệu", "Tác giả", "NXB", "Năm XB", "Loại", "SL hóa đơn", "SL thực nhận", "Đơn giá (đ)", "Thành tiền thực nhận (đ)", "Số ĐKCB"],
        r.lines.map((l, i) => [i + 1, l.title, l.author, l.publisher, l.year, kinds[l.kind] || l.kind, l.invoiceQty, l.receivedQty ?? "", l.price.toLocaleString("vi-VN"), ((l.receivedQty || 0) * l.price).toLocaleString("vi-VN"), l.codeFrom ? (l.codeFrom === l.codeTo ? l.codeFrom : `${l.codeFrom} → ${l.codeTo}`) : ""]))}
      <p><b>Tổng theo hóa đơn:</b> ${money(r.invoiceTotal)} · <b>Tổng thực nhận:</b> ${money(r.receivedTotal || 0)} · <b>Số quyển nhận:</b> ${r.receivedCopies ?? ""}</p>`,
    signs: [["Người lập", "(Ký, ghi rõ họ tên)"], ["Thủ thư", "(Ký, ghi rõ họ tên)"]],
  })
}
function printHandover(r: BookReceipt) {
  const diff = r.lines.filter((l) => (l.receivedQty ?? 0) !== l.invoiceQty)
  printHtml({
    title: "Biên bản giao nhận tài liệu thư viện", subtitle: `Theo hóa đơn số ${r.invoiceNo}${r.invoiceDate ? ` ngày ${isoToVn(r.invoiceDate)}` : ""}`,
    body: `<p><i>Căn cứ Luật Quản lý, sử dụng tài sản công và Nghị định 186/2025/NĐ-CP (biểu mẫu biên bản bàn giao, tiếp nhận tài sản công – Mẫu 02/TSC-BBGN); căn cứ hóa đơn và kết quả kiểm đếm thực tế,</i></p>
      <h2>I. Thành phần</h2><p><b>Bên giao:</b> ${esc(r.supplier)}</p>${dots(1)}<p><b>Bên nhận:</b> Trường THCS Lê Độ</p>${dots(2)}
      <h2>II. Nội dung giao nhận</h2><p>Hai bên đã kiểm đếm, đối chiếu số lượng tài liệu thực nhận với hóa đơn (chi tiết tại phụ lục kèm theo): ${r.lines.length} đầu tài liệu, ${r.receivedCopies ?? 0} bản; giá trị theo hóa đơn ${money(r.invoiceTotal)}, giá trị thực nhận ${money(r.receivedTotal || 0)}.</p>
      ${diff.length ? `<p><b>Chênh lệch so với hóa đơn:</b></p>${table(["Tên tài liệu", "SL hóa đơn", "SL thực nhận", "Chênh lệch"], diff.map((l) => [l.title, l.invoiceQty, l.receivedQty ?? 0, (l.receivedQty ?? 0) - l.invoiceQty]))}` : "<p>Số lượng thực nhận khớp với hóa đơn.</p>"}
      ${r.countNote ? `<p>Ghi chú kiểm đếm: ${esc(r.countNote)}</p>` : ""}
      <h2>III. Kết luận</h2>${dots(2)}`,
    signs: [["Bên giao", "(Ký, ghi rõ họ tên)"], ["Bên nhận", "(Ký, ghi rõ họ tên)"], ["Hiệu trưởng", "(Ký, đóng dấu)"]],
  })
}

// ===================================================================
// NHẬN SÁCH THEO HÓA ĐƠN
// ===================================================================
const emptyLine = (): ReceiptLine => ({ id: `n${Math.random().toString(36).slice(2, 9)}`, title: "", author: "", publisher: "", year: "", kind: "SGK", grade: "", isbn: "", invoiceQty: 1, price: 0, receivedQty: null, note: "" })

export function ReceiptsTab() {
  const meta = useMeta()
  const [list, setList] = useState<BookReceipt[] | null>(null)
  const [titles, setTitles] = useState<BookTitle[]>([])
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [edit, setEdit] = useState<Partial<BookReceipt> | null>(null)
  const [open, setOpen] = useState<BookReceipt | null>(null)
  const [count, setCount] = useState<Record<string, string>>({})
  const [countNote, setCountNote] = useState("")
  const [shelf, setShelf] = useState("")
  const excelRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const load = useCallback(() => { fetchReceipts().then(setList).catch((e) => setError(e.message)); fetchTitles().then(setTitles).catch(() => {}); fetchShelves().then(setShelves).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const openReceipt = async (id: string) => { const r = await fetchReceipt(id); setOpen(r); setCount(Object.fromEntries(r.lines.map((l) => [l.id, l.receivedQty === null ? "" : String(l.receivedQty)]))); setShelf(r.defaultShelf || ""); setCountNote(r.countNote || "") }
  const act = async (fn: () => Promise<unknown>, msg = "") => { setError(""); setOk(""); try { await fn(); setOk(msg); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  if (!meta || !list) return <p className="text-sm text-gray-500">{error || "Đang tải…"}</p>
  const kinds = meta.kinds

  // ---- Lập / sửa phiếu theo hóa đơn ----
  if (edit) {
    const lines = edit.lines || []
    const setL = (i: number, p: Partial<ReceiptLine>) => setEdit({ ...edit, lines: lines.map((l, j) => (j === i ? { ...l, ...p } : l)) })
    const pick = (i: number, name: string) => { const t = titles.find((x) => x.title === name); setL(i, t ? { title: t.title, author: t.author, publisher: t.publisher, year: t.year, kind: t.kind, grade: t.grade, price: t.price } : { title: name }) }
    const sum = lines.reduce((a, l) => a + l.invoiceQty * l.price, 0)
    // Nhập các dòng hóa đơn từ Excel (cột: Tên sách, Tác giả, NXB, Năm, Loại, Khối, Số lượng, Đơn giá); loại ghi SGK, STK, STN, SNV, BTC hoặc tên đầy đủ
    const KIND_BY_TEXT = (t: string): string => { const x = fold(t); return x.startsWith("sgk") || x.includes("giao khoa") ? "SGK" : x.startsWith("stk") || x.includes("tham khao") ? "STK" : x.startsWith("stn") || x.includes("thieu nhi") || x.includes("truyen") ? "STN" : x.startsWith("snv") || x.includes("nghiep vu") || x.includes("giang day") ? "SNV" : x.startsWith("btc") || x.includes("bao") || x.includes("tap chi") ? "BTC" : "" }
    const excelTemplate = () => exportExcel("Mau-dong-hoa-don-sach.xlsx", [{ name: "Hóa đơn", rows: [{ "Tên sách": "Toán 7 – tập 1", "Tác giả": "Nhiều tác giả", "NXB": "NXB Giáo dục Việt Nam", "Năm": "2025", "Loại": "SGK", "Khối": "7", "Số lượng": 20, "Đơn giá": 18000 }, { "Tên sách": "Dế Mèn phiêu lưu ký", "Tác giả": "Tô Hoài", "NXB": "NXB Kim Đồng", "Năm": "2024", "Loại": "STN", "Khối": "", "Số lượng": 5, "Đơn giá": 45000 }] }])
    const importLines = async (f: File) => {
      setError("")
      try {
        const XLSX = await import("xlsx"); const wb = XLSX.read(await f.arrayBuffer())
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" })
        const bad: string[] = []; const got: ReceiptLine[] = []
        raw.forEach((r, i) => {
          const title = String(r["Tên sách"] ?? r["Tên tài liệu"] ?? "").trim(); if (!title) return
          const kind = KIND_BY_TEXT(String(r["Loại"] ?? "")); const qty = Math.floor(Number(r["Số lượng"])); const price = Math.floor(Number(String(r["Đơn giá"] ?? 0).replace(/[.\s]/g, "")))
          if (!kind) { bad.push(`Dòng ${i + 2}: loại “${r["Loại"]}” không hợp lệ (ghi SGK, STK, STN, SNV hoặc BTC)`); return }
          if (!(qty >= 1)) { bad.push(`Dòng ${i + 2}: số lượng không hợp lệ`); return }
          got.push({ ...emptyLine(), title, author: String(r["Tác giả"] ?? "").trim(), publisher: String(r["NXB"] ?? "").trim(), year: String(r["Năm"] ?? "").trim(), kind, grade: String(r["Khối"] ?? "").trim(), invoiceQty: qty, price: Number.isFinite(price) && price > 0 ? price : 0 })
        })
        if (bad.length) { setError(bad.slice(0, 3).join("; ") + (bad.length > 3 ? ` … (${bad.length} dòng lỗi)` : "")); return }
        if (!got.length) { setError("File không có dòng nào"); return }
        setEdit({ ...edit, lines: [...lines.filter((l) => l.title.trim()), ...got] })
      } catch (e) { setError(e instanceof Error ? e.message : "Không đọc được file") }
    }
    return (
      <div className="space-y-4">
        <Err msg={error} />
        <div className={`${card} p-5`}>
          <h2 className="font-bold text-gray-900 mb-1">{edit.id ? "Sửa phiếu nhận" : "Bước 1 – Lập phiếu nhận theo hóa đơn"}</h2>
          <p className="text-xs text-gray-500 mb-4">Chép các dòng trên hóa đơn (hoặc phiếu cấp phát): tên tài liệu, số lượng, đơn giá. Số thực nhận sẽ nhập ở bước kiểm đếm.</p>
          <div className="grid sm:grid-cols-5 gap-3">
            <div><label className={label}>Số hóa đơn *</label><input className={field} value={edit.invoiceNo || ""} onChange={(e) => setEdit({ ...edit, invoiceNo: e.target.value })} /></div>
            <div><label className={label}>Ngày hóa đơn</label><input type="date" className={field} value={edit.invoiceDate || ""} onChange={(e) => setEdit({ ...edit, invoiceDate: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className={label}>Nhà cung cấp / đơn vị giao</label><input className={field} value={edit.supplier || ""} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} /></div>
            <div><label className={label}>Nguồn</label><select className={field} value={edit.source || "Mua sắm"} onChange={(e) => setEdit({ ...edit, source: e.target.value })}>{meta.sources.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
        </div>
        <div className={`${card} overflow-hidden`}>
          <datalist id="dl-titles">{titles.map((t) => <option key={t.id} value={t.title} />)}</datalist>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50">{["#", "Tên tài liệu *", "Tác giả", "NXB", "Năm", "Loại", "Khối", "SL hóa đơn", "Đơn giá (đ)", "Thành tiền", ""].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{lines.map((l, i) => (
              <tr key={l.id}>
                <td className="px-2 py-1.5 text-xs text-gray-500">{i + 1}</td>
                <td className="px-2 py-1.5 min-w-[220px]"><input list="dl-titles" aria-label="Tên tài liệu" className={field} value={l.title} onChange={(e) => pick(i, e.target.value)} /></td>
                <td className="px-2 py-1.5 min-w-[120px]"><input aria-label="Tác giả" className={field} value={l.author} onChange={(e) => setL(i, { author: e.target.value })} /></td>
                <td className="px-2 py-1.5 min-w-[110px]"><input aria-label="Nhà xuất bản" className={field} value={l.publisher} onChange={(e) => setL(i, { publisher: e.target.value })} /></td>
                <td className="px-2 py-1.5 w-20"><input aria-label="Năm xuất bản" className={field} value={l.year} onChange={(e) => setL(i, { year: e.target.value })} /></td>
                <td className="px-2 py-1.5 min-w-[150px]"><select aria-label="Loại" className={field} value={l.kind} onChange={(e) => setL(i, { kind: e.target.value })}>{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td className="px-2 py-1.5 w-20"><input aria-label="Khối" className={field} value={l.grade} placeholder="6" onChange={(e) => setL(i, { grade: e.target.value })} /></td>
                <td className="px-2 py-1.5 w-24"><input type="number" min={1} aria-label="Số lượng hóa đơn" className={field} value={l.invoiceQty} onChange={(e) => setL(i, { invoiceQty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></td>
                <td className="px-2 py-1.5 w-32"><input type="number" min={0} aria-label="Đơn giá" className={field} value={l.price} onChange={(e) => setL(i, { price: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap font-semibold">{money(l.invoiceQty * l.price)}</td>
                <td className="px-2 py-1.5"><button onClick={() => setEdit({ ...edit, lines: lines.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-600" aria-label="Xóa dòng">✕</button></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setEdit({ ...edit, lines: [...lines, emptyLine()] })} className="text-sm font-semibold text-[#1a3670] hover:underline">+ Thêm dòng</button>
            <div className="flex flex-wrap items-center gap-2"><button onClick={excelTemplate} className="text-sm font-semibold text-[#1a3670] hover:underline">Tải file mẫu</button><button onClick={() => excelRef.current?.click()} className="text-sm font-semibold text-[#1a3670] hover:underline">Nhập dòng từ Excel</button><input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importLines(f); e.target.value = "" }} /></div>
          <div className="flex items-center gap-3"><span className="text-sm">Tổng hóa đơn: <strong>{money(sum)}</strong> · {lines.reduce((a, l) => a + l.invoiceQty, 0)} bản</span>
              <button onClick={() => setEdit(null)} className={btnGhost}>Hủy</button>
              <button onClick={() => act(async () => { const r = edit.id ? await updateReceipt(edit.id, edit) : await createReceipt(edit); setEdit(null); await openReceipt(r.id) }, "Đã lưu phiếu. Bước tiếp theo: kiểm đếm.")} className={btnPrimary}>Lưu phiếu</button></div>
          </div>
        </div>
      </div>
    )
  }

  // ---- Mở một phiếu: kiểm đếm hoặc xem kết quả ----
  if (open) {
    const done = open.status !== "Chờ kiểm đếm"
    const n = (l: ReceiptLine) => (done ? l.receivedQty ?? 0 : count[l.id] === "" || count[l.id] === undefined ? null : Math.max(0, Math.floor(Number(count[l.id]) || 0)))
    const recvTotal = open.lines.reduce((a, l) => a + (n(l) ?? 0) * l.price, 0)
    const copiesWithTitle = (open.copies || []).map((c) => ({ ...c, title: open.lines.find((l) => l.titleId === c.titleId)?.title }))
    return (
      <div className="space-y-4">
        <Err msg={error} /><Ok msg={ok} />
        <div className={`${card} p-5 flex flex-wrap items-start justify-between gap-3`}>
          <div><div className="text-xs text-gray-500">{open.source} · lập bởi {open.createdBy}</div>
            <h2 className="font-bold text-gray-900">Hóa đơn {open.invoiceNo}{open.invoiceDate ? ` · ${isoToVn(open.invoiceDate)}` : ""} · {open.supplier}</h2>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${ST_CLS[open.status] || ""}`}>{open.status}</span></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setOpen(null); load() }} className={btnGhost}>Đóng</button>
            {!done && <button onClick={() => setEdit(open)} className={btnGhost}>Sửa phiếu</button>}
            {done && <><button onClick={() => printAppendix(open, kinds)} className={btnGhost}>In phụ lục</button><button onClick={() => printHandover(open)} className={btnGhost}>In biên bản giao nhận</button><button onClick={() => printBookLabels(copiesWithTitle)} className={btnPrimary}>In {copiesWithTitle.length} nhãn sách</button></>}
          </div>
        </div>
        {!done && <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-900"><strong>Bước 2 – Kiểm đếm:</strong> đếm từng đầu tài liệu thực nhận và nhập vào cột “Thực nhận”. Dòng chênh lệch sẽ tô đỏ. Khi xác nhận, hệ thống cấp cho mỗi quyển một số đăng ký cá biệt (ĐKCB) và lập phụ lục.</div>}
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50">{["#", "Tên tài liệu", "Loại", "Đơn giá", "SL hóa đơn", "Thực nhận", "Chênh lệch", "Thành tiền thực nhận", done ? "Số ĐKCB" : ""].map((h, i) => <th key={i} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{open.lines.map((l, i) => {
              const got = n(l), diff = got === null ? null : got - l.invoiceQty
              return (
                <tr key={l.id} className={diff ? "bg-red-50/60" : ""}>
                  <td className="px-3 py-2 text-xs text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2"><div className="font-medium text-gray-900">{l.title}</div><div className="text-xs text-gray-500">{[l.author, l.publisher, l.year, l.grade && `khối ${l.grade}`].filter(Boolean).join(" · ")}</div></td>
                  <td className="px-3 py-2 text-xs">{kinds[l.kind]}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{money(l.price)}</td>
                  <td className="px-3 py-2 font-semibold">{l.invoiceQty}</td>
                  <td className="px-3 py-2 w-28">{done ? <strong>{got}</strong> : <input type="number" min={0} aria-label={`Thực nhận ${l.title}`} className={field} value={count[l.id] ?? ""} onChange={(e) => setCount({ ...count, [l.id]: e.target.value })} />}</td>
                  <td className={`px-3 py-2 font-semibold ${diff ? "text-red-700" : "text-green-700"}`}>{diff === null ? "" : diff === 0 ? "Khớp" : diff > 0 ? `Thừa ${diff}` : `Thiếu ${-diff}`}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{got === null ? "" : money(got * l.price)}</td>
                  <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{done && l.codeFrom ? (l.codeFrom === l.codeTo ? l.codeFrom : `${l.codeFrom} → ${l.codeTo}`) : !done && <button onClick={() => setCount({ ...count, [l.id]: String(l.invoiceQty) })} className="text-xs font-semibold text-[#1a3670] hover:underline">= hóa đơn</button>}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
          <div className="px-5 py-3 border-t border-gray-100 text-sm flex flex-wrap gap-4 justify-between items-center">
            <span>Theo hóa đơn: <strong>{money(open.invoiceTotal)}</strong> · Thực nhận: <strong className={recvTotal !== open.invoiceTotal ? "text-red-700" : ""}>{money(recvTotal)}</strong></span>
            {!done && <div className="flex flex-wrap gap-2 items-center">
              <button onClick={() => setCount(Object.fromEntries(open.lines.map((l) => [l.id, String(l.invoiceQty)])))} className={btnGhost}>Điền tất cả = hóa đơn</button>
              <select aria-label="Kệ xếp sách" className="border border-gray-200 rounded-lg px-2 py-2 text-sm" value={shelf} onChange={(e) => setShelf(e.target.value)}><option value="">Chưa xếp giá</option>{shelves.map((s) => <option key={s.id} value={s.code}>Xếp luôn vào kệ {s.code}</option>)}</select>
            </div>}
          </div>
          {!done && <div className="px-5 pb-4 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[240px]"><label className={label}>Ghi chú kiểm đếm</label><input className={field} value={countNote} onChange={(e) => setCountNote(e.target.value)} placeholder="VD: thiếu 2 quyển, nhà cung cấp hẹn giao bù" /></div>
            <button onClick={() => { if (confirm("Xác nhận số thực nhận? Hệ thống sẽ cấp số ĐKCB cho từng quyển, không sửa lại được.")) act(async () => { await receiveReceipt(open.id, open.lines.map((l) => ({ id: l.id, receivedQty: n(l) ?? -1 })), countNote, shelf); await openReceipt(open.id) }, "Đã nhận sách và cấp số ĐKCB. Bước tiếp theo: in phụ lục và nhãn sách.") }} className={btnPrimary}>Bước 3 – Xác nhận nhận sách</button>
          </div>}
        </div>
        {done && <div className={`${card} p-4 text-sm`}><strong>Đã cấp {copiesWithTitle.length} số ĐKCB</strong> (mỗi quyển một số). Nhận bởi {open.receivedBy} lúc {open.receivedAt ? new Date(open.receivedAt).toLocaleString("vi-VN") : ""}.{open.countNote ? ` Ghi chú: ${open.countNote}.` : ""} Bước 4: in nhãn, dán lên từng quyển, rồi xếp giá ở mục “Kệ sách”.</div>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={ok} />
      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-sm text-gray-600">Quy trình: lập phiếu theo hóa đơn → kiểm đếm, đối chiếu → xác nhận nhận (cấp số ĐKCB từng quyển, lập phụ lục) → in nhãn QR → xếp giá theo QR kệ.</p>
        <button onClick={() => setEdit({ source: "Mua sắm", lines: [emptyLine()] })} className={btnPrimary}>+ Lập phiếu nhận</button>
      </div>
      <div className={`${card} overflow-hidden`}>
        {list.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Chưa có phiếu nhận</p> : (
          <table className="w-full text-sm"><thead><tr className="bg-gray-50">{["Hóa đơn", "Nhà cung cấp", "Nguồn", "Đầu sách", "Giá trị hóa đơn", "Trạng thái", ""].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{list.map((r) => (
              <tr key={r.id}><td className="px-3 py-2.5"><div className="font-medium">{r.invoiceNo}</div><div className="text-xs text-gray-500">{isoToVn(r.invoiceDate)}</div></td><td className="px-3 py-2.5">{r.supplier}</td><td className="px-3 py-2.5 text-xs">{r.source}</td>
                <td className="px-3 py-2.5">{r.lines.length} đầu · {r.receivedCopies ?? r.lines.reduce((a, l) => a + l.invoiceQty, 0)} bản</td><td className="px-3 py-2.5 whitespace-nowrap">{money(r.invoiceTotal)}</td>
                <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ST_CLS[r.status] || ""}`}>{r.status}</span></td>
                <td className="px-3 py-2.5 whitespace-nowrap text-right"><button onClick={() => openReceipt(r.id)} className={btnGhost}>{r.status === "Chờ kiểm đếm" ? "Kiểm đếm" : "Mở"}</button>
                  {r.status === "Chờ kiểm đếm" && <button onClick={() => { if (confirm("Xóa phiếu này?")) act(() => deleteReceipt(r.id)) }} className="ml-2 text-xs text-gray-500 hover:text-red-600">Xóa</button>}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  )
}

// ===================================================================
// KHO SÁCH: ĐẦU SÁCH VÀ BẢN SÁCH CÁ BIỆT
// ===================================================================
export function BooksTab() {
  const meta = useMeta()
  const [titles, setTitles] = useState<BookTitle[] | null>(null)
  const [q, setQ] = useState(""), [kind, setKind] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [cps, setCps] = useState<BookCopy[]>([])
  const [error, setError] = useState("")
  const load = useCallback(() => { fetchTitles().then(setTitles).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (openId) fetchCopies({ titleId: openId }).then(setCps).catch(() => {}) }, [openId])
  if (!titles || !meta) return <p className="text-sm text-gray-500">{error || "Đang tải…"}</p>
  const shown = titles.filter((t) => (!kind || t.kind === kind) && (!q || fold(`${t.title} ${t.author} ${t.publisher}`).includes(fold(q))))
  const sum = (k: "copies" | "onShelf" | "unshelved") => shown.reduce((a, t) => a + t[k], 0)
  return (
    <div className="space-y-4">
      <Err msg={error} />
      <div className="grid grid-cols-3 gap-3">
        {([["Đầu sách", shown.length], ["Bản sách", sum("copies")], ["Chưa xếp giá", sum("unshelved")]] as const).map(([l, v]) => <div key={l} className={`${card} px-4 py-3`}><div className="text-2xl font-bold">{v}</div><div className="text-xs text-gray-500">{l}</div></div>)}
      </div>
      <div className={`${card} p-4 flex flex-wrap gap-2`}>
        <input type="search" className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px]" placeholder="Tìm tên sách, tác giả (không cần dấu)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Loại tài liệu" className="border border-gray-200 rounded-lg px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Mọi loại</option>{Object.entries(meta.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className={`${card} overflow-hidden`}>
        {shown.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Chưa có sách. Nhập sách ở mục “Nhận sách theo hóa đơn”.</p> : (
          <ul className="divide-y divide-gray-50">{shown.map((t) => (
            <li key={t.id}>
              <button onClick={() => setOpenId(openId === t.id ? null : t.id)} aria-expanded={openId === t.id} className="w-full px-5 py-3 flex flex-wrap items-center gap-3 text-left hover:bg-gray-50">
                <span className="flex-1 min-w-[200px]"><span className="font-medium text-gray-900">{t.title}</span><span className="block text-xs text-gray-500">{meta.kinds[t.kind]} · {[t.author, t.publisher, t.year].filter(Boolean).join(" · ")}</span></span>
                <span className="text-sm">{t.copies} bản</span><span className="text-xs text-green-700">{t.onShelf} trên giá</span>{t.unshelved > 0 && <span className="text-xs text-amber-700">{t.unshelved} chưa xếp</span>}<span className="text-sm text-gray-500 whitespace-nowrap">{money(t.price)}</span>
              </button>
              {openId === t.id && (
                <div className="px-5 pb-4">
                  <CatalogForm t={t} onSaved={load} />
                  <div className="flex justify-end mb-2"><button onClick={() => printBookLabels(cps.map((c) => ({ ...c, title: t.title })))} className={btnGhost}>In lại nhãn ({cps.length})</button></div>
                  <table className="w-full text-sm"><thead><tr className="bg-gray-50">{["Số ĐKCB", "Kệ", "Tình trạng", "Giá", "Ngày vào sổ"].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">{cps.map((c) => (
                      <tr key={c.code}><td className="px-3 py-1.5 font-mono text-xs">{c.code}</td><td className="px-3 py-1.5">{c.shelf || "—"}</td>
                        <td className="px-3 py-1.5"><select aria-label={`Tình trạng ${c.code}`} className="border border-gray-200 rounded px-1.5 py-1 text-xs" value={c.status} onChange={async (e) => { await updateCopy(c.code, { status: e.target.value }); fetchCopies({ titleId: t.id }).then(setCps); load() }}>{meta.statuses.map((s) => <option key={s}>{s}</option>)}</select></td>
                        <td className="px-3 py-1.5">{money(c.price)}</td><td className="px-3 py-1.5 text-xs">{new Date(c.createdAt).toLocaleDateString("vi-VN")}</td></tr>
                    ))}</tbody></table>
                </div>
              )}
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  )
}

// ===================================================================
// KỆ SÁCH: MÃ QR KỆ, XẾP GIÁ
// ===================================================================
export function ShelvesTab() {
  const meta = useMeta()
  const [list, setList] = useState<Shelf[] | null>(null)
  const [f, setF] = useState({ code: "", name: "", room: "Thư viện", kinds: [] as string[] })
  const [cur, setCur] = useState(() => { try { return localStorage.getItem("currentShelf") || "" } catch { return "" } })
  const [codes, setCodes] = useState<string[]>([])
  const [scan, setScan] = useState("")
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const scanRef = useRef<HTMLInputElement>(null)
  const load = useCallback(() => { fetchShelves().then(setList).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  if (!list || !meta) return <p className="text-sm text-gray-500">{error || "Đang tải…"}</p>
  // Máy quét mã (hoặc gõ tay): mỗi lần Enter thêm một mã; quét URL nhãn cũng nhận được
  const addScan = () => { const raw = scan.trim(); if (!raw) return; const code = decodeURIComponent(raw.split("#sach/").pop() || raw).toUpperCase(); if (!codes.includes(code)) setCodes([...codes, code]); setScan(""); scanRef.current?.focus() }
  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={ok} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className={`${card} p-5`}>
          <h2 className="font-bold text-gray-900 mb-1">Xếp sách lên giá</h2>
          <p className="text-xs text-gray-500 mb-3">Cách 1 (điện thoại): quét QR dán trên kệ → bấm “Chọn kệ này”, rồi quét QR từng quyển → bấm “Xếp vào kệ”. Cách 2 (máy tính có máy quét mã): chọn kệ bên dưới, quét lần lượt nhãn các quyển vào ô, bấm “Xếp lên kệ”.</p>
          <div className="flex gap-2 mb-2">
            <select aria-label="Kệ" className={field} value={cur} onChange={(e) => { setCur(e.target.value); try { localStorage.setItem("currentShelf", e.target.value) } catch { /* bỏ qua */ } }}><option value="">Chọn kệ…</option>{list.map((s) => <option key={s.id} value={s.code}>{s.code} – {s.name}</option>)}</select>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); addScan() }} className="flex gap-2"><input ref={scanRef} aria-label="Mã ĐKCB" className={field} placeholder="Quét hoặc gõ số ĐKCB rồi Enter (VD: SGK-00012)" value={scan} onChange={(e) => setScan(e.target.value)} /><button type="submit" className={btnGhost}>Thêm</button></form>
          {codes.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{codes.map((c) => <span key={c} className="px-2 py-1 rounded bg-gray-100 text-xs font-mono">{c} <button onClick={() => setCodes(codes.filter((x) => x !== c))} aria-label={`Bỏ ${c}`} className="text-gray-500">✕</button></span>)}</div>}
          <div className="flex justify-end mt-3"><button disabled={!cur || !codes.length} onClick={async () => { setError(""); setOk(""); try { const r = await shelveCopies(cur, codes); setOk(`Đã xếp ${r.done.length} quyển lên kệ ${r.shelf}.${r.notFound.length ? ` Không có mã: ${r.notFound.join(", ")}.` : ""}${r.skipped.length ? ` Bỏ qua: ${r.skipped.join(", ")}.` : ""}`); setCodes([]); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }} className={btnPrimary}>Xếp {codes.length} quyển lên kệ {cur}</button></div>
        </div>
        <div className={`${card} p-5`}>
          <h2 className="font-bold text-gray-900 mb-3">Thêm kệ</h2>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Mã kệ *</label><input className={field} value={f.code} placeholder="K01-T1" onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></div>
            <div><label className={label}>Tên kệ</label><input className={field} value={f.name} placeholder="SGK khối 6 – tầng 1" onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="col-span-2"><label className={label}>Phòng</label><input className={field} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></div>
          </div>
          <div className="flex justify-end mt-3"><button disabled={!f.code} onClick={async () => { setError(""); try { await createShelf(f); setF({ ...f, code: "", name: "" }); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }} className={btnPrimary}>Thêm kệ</button></div>
        </div>
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between"><h2 className="font-semibold text-gray-900">Kệ sách ({list.length})</h2><button disabled={!list.length} onClick={() => printShelfLabels(list)} className={btnGhost}>In nhãn QR kệ</button></div>
        {list.length === 0 ? <p className="p-6 text-sm text-gray-500">Chưa có kệ</p> : <ul className="divide-y divide-gray-50">{list.map((s) => (
          <li key={s.id} className="px-5 py-2.5 flex items-center justify-between gap-2 text-sm"><span><strong className="font-mono">{s.code}</strong> · {s.name} <span className="text-xs text-gray-500">{s.room}</span></span><span className="flex gap-3 items-center"><span className="text-xs text-gray-600">{s.count} quyển</span><a href={`#ke/${s.code}`} className="text-xs font-semibold text-[#1a3670] hover:underline">Xem</a><button onClick={async () => { if (confirm(`Xóa kệ ${s.code}?`)) { try { await deleteShelf(s.id); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } } }} className="text-xs text-gray-500 hover:text-red-600">Xóa</button></span></li>
        ))}</ul>}
      </div>
    </div>
  )
}

// ===================================================================
// SỔ THƯ VIỆN: ĐĂNG KÝ TỔNG QUÁT, ĐĂNG KÝ CÁ BIỆT
// ===================================================================
export function LibraryLedgerTab() {
  const meta = useMeta()
  const [error, setError] = useState("")
  const general = async (excel: boolean) => {
    const rs = (await fetchReceipts()).filter((r) => r.status !== "Chờ kiểm đếm").sort((a, b) => (a.receivedAt || "").localeCompare(b.receivedAt || ""))
    const ks = Object.keys(meta!.kinds)
    const head = ["STT", "Ngày vào sổ", "Số hóa đơn / chứng từ", "Nguồn", "Nhà cung cấp", "Tổng số bản", ...ks.map((k) => meta!.kinds[k]), "Tổng tiền (đ)", "Số ĐKCB"]
    const rows = rs.map((r, i) => {
      const by = (k: string) => r.lines.filter((l) => l.kind === k).reduce((a, l) => a + (l.receivedQty || 0), 0)
      const codes = r.lines.filter((l) => l.codeFrom).map((l) => `${l.codeFrom}→${l.codeTo}`).join("; ")
      return [i + 1, r.receivedAt ? new Date(r.receivedAt).toLocaleDateString("vi-VN") : "", `${r.invoiceNo}${r.invoiceDate ? ` (${isoToVn(r.invoiceDate)})` : ""}`, r.source, r.supplier, r.receivedCopies || 0, ...ks.map(by), (r.receivedTotal || 0).toLocaleString("vi-VN"), codes]
    })
    if (excel) await exportExcel("So-dang-ky-tong-quat.xlsx", [{ name: "Đăng ký tổng quát", rows: rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) }])
    else printDoc("SỔ ĐĂNG KÝ TỔNG QUÁT", "Theo dõi các lần nhập tài liệu vào thư viện", head, rows, true, { cover: true })
  }
  const individual = async (excel: boolean) => {
    const [cs, ts, rs] = await Promise.all([fetchCopies(), fetchTitles(), fetchReceipts()])
    const tMap = new Map(ts.map((t) => [t.id, t])), rMap = new Map(rs.map((r) => [r.id, r]))
    const head = ["STT", "Ngày vào sổ", "Số ĐKCB", "Tên tài liệu", "Tác giả", "NXB", "Năm XB", "Loại", "Giá (đ)", "Số chứng từ", "Kệ", "Tình trạng"]
    const rows = cs.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.code.localeCompare(b.code, "vi", { numeric: true })).map((c, i) => {
      const t = tMap.get(c.titleId)
      return [i + 1, new Date(c.createdAt).toLocaleDateString("vi-VN"), c.code, t?.title || "", t?.author || "", t?.publisher || "", t?.year || "", meta!.kinds[t?.kind || ""] || "", c.price.toLocaleString("vi-VN"), rMap.get(c.receiptId)?.invoiceNo || "", c.shelf, c.status]
    })
    if (excel) await exportExcel("So-dang-ky-ca-biet.xlsx", [{ name: "Đăng ký cá biệt", rows: rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) }])
    else printDoc("SỔ ĐĂNG KÝ CÁ BIỆT", "Mỗi bản tài liệu một số đăng ký cá biệt", head, rows, true, { cover: true })
  }
  const run = (fn: (e: boolean) => Promise<void>, e: boolean) => { setError(""); fn(e).catch((x) => setError(x instanceof Error ? x.message : "Lỗi")) }
  if (!meta) return <p className="text-sm text-gray-500">Đang tải…</p>
  return (
    <div className="space-y-4">
      <Err msg={error} />
      <div className="grid md:grid-cols-2 gap-4">
        {([["Sổ đăng ký tổng quát", "Mỗi lần nhập một dòng: ngày vào sổ, số hóa đơn, nguồn, tổng số bản, số bản theo từng loại, tổng tiền, dải số ĐKCB.", general], ["Sổ đăng ký cá biệt", "Mỗi quyển một dòng: số ĐKCB, tên, tác giả, NXB, năm, loại, giá, chứng từ nhập, kệ, tình trạng.", individual]] as const).map(([t, d, fn]) => (
          <div key={t} className={`${card} p-5`}><h2 className="font-bold text-gray-900">{t}</h2><p className="text-sm text-gray-600 mt-1 mb-4">{d}</p><div className="flex gap-2"><button onClick={() => run(fn, false)} className={btnPrimary}>Xem & in</button><button onClick={() => run(fn, true)} className={btnGhost}>Xuất Excel</button></div></div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Số ĐKCB cấp theo loại: {Object.entries(meta.kinds).map(([k, v]) => `${k} – ${v}`).join("; ")}. Bố cục sổ theo cách ghi chép thư viện trường học thông dụng; nhà trường điều chỉnh cột cho khớp mẫu sổ đang dùng nếu cần.</p>
    </div>
  )
}

// ===================================================================
// TRANG MỞ KHI QUÉT QR: QUYỂN SÁCH, KỆ SÁCH
// ===================================================================
export function BookCopyPage({ code }: { code: string }) {
  const { user, login } = useAuth()
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchCopy>> | null>(null)
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const cur = (() => { try { return localStorage.getItem("currentShelf") || "" } catch { return "" } })()
  const load = useCallback(() => { fetchCopy(code).then(setD).catch((e) => setError(e.message)) }, [code])
  useEffect(() => { if (user) load() }, [user, load])
  const wrap = (c: React.ReactNode) => <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10"><div className="max-w-lg">{c}</div></main>
  if (!user) return wrap(<div className={`${card} p-6 text-center`}><p className="mb-3">Đăng nhập để xem thông tin quyển sách <strong className="font-mono">{code}</strong></p><button onClick={login} className={btnPrimary}>Đăng nhập</button></div>)
  if (!d) return wrap(<p className="text-sm text-gray-500">{error || "Đang tải…"}</p>)
  return wrap(
    <div className={`${card} p-6 space-y-3`}>
      <div className="font-mono text-2xl font-bold text-[#1a3670]">{d.copy.code}</div>
      <h1 className="text-xl font-bold text-gray-900">{d.title?.title}</h1>
      <p className="text-sm text-gray-600">{[d.title?.author, d.title?.publisher, d.title?.year].filter(Boolean).join(" · ")}</p>
      <p className="text-sm">Vị trí: <strong>{d.copy.shelf ? `Kệ ${d.copy.shelf}${d.shelf?.name ? ` – ${d.shelf.name}` : ""}` : "Chưa xếp giá"}</strong> · Tình trạng: <strong>{d.copy.status}</strong></p>
      {d.receipt && <p className="text-xs text-gray-500">Nhập theo hóa đơn {d.receipt.invoiceNo}{d.receipt.invoiceDate ? ` (${isoToVn(d.receipt.invoiceDate)})` : ""} · {d.receipt.supplier} · giá {money(d.copy.price)}</p>}
      <Err msg={error} /><Ok msg={ok} />
      {d.staff && (cur ? (
        <button disabled={d.copy.shelf === cur && d.copy.status === "Trên giá"} onClick={async () => { setError(""); setOk(""); try { const r = await shelveCopies(cur, [d.copy.code]); if (r.done.length) { setOk(`Đã xếp vào kệ ${cur}`); load() } else setError(r.skipped[0] || "Không xếp được") } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }} className={`${btnPrimary} w-full py-3 text-base`}>{d.copy.shelf === cur && d.copy.status === "Trên giá" ? `Đã nằm trên kệ ${cur}` : `Xếp vào kệ ${cur}`}</button>
      ) : <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Quét QR dán trên kệ trước và bấm “Chọn kệ này” để xếp sách bằng điện thoại.</p>)}
    </div>,
  )
}

export function ShelfPage({ code }: { code: string }) {
  const { user, login } = useAuth()
  const [list, setList] = useState<BookCopy[] | null>(null)
  const [titles, setTitles] = useState<BookTitle[]>([])
  const [cur, setCur] = useState(() => { try { return localStorage.getItem("currentShelf") || "" } catch { return "" } })
  const [error, setError] = useState("")
  useEffect(() => { if (user) { fetchCopies({ shelf: code }).then(setList).catch((e) => setError(e.message)); fetchTitles().then(setTitles).catch(() => {}) } }, [user, code])
  const tMap = useMemo(() => new Map(titles.map((t) => [t.id, t.title])), [titles])
  const wrap = (c: React.ReactNode) => <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10"><div className="max-w-lg">{c}</div></main>
  if (!user) return wrap(<div className={`${card} p-6 text-center`}><p className="mb-3">Đăng nhập để xem kệ <strong className="font-mono">{code}</strong></p><button onClick={login} className={btnPrimary}>Đăng nhập</button></div>)
  return wrap(
    <div className={`${card} p-6 space-y-3`}>
      <div className="font-mono text-3xl font-bold text-[#1a3670]">Kệ {code}</div>
      <Err msg={error} />
      <button onClick={() => { try { localStorage.setItem("currentShelf", code) } catch { /* bỏ qua */ } setCur(code) }} className={`${cur === code ? btnGhost : btnPrimary} w-full py-3 text-base`}>{cur === code ? "Đang chọn kệ này – quét QR từng quyển để xếp" : "Chọn kệ này để xếp sách"}</button>
      {list === null ? <p className="text-sm text-gray-500">Đang tải…</p> : <>
        <p className="text-sm text-gray-600">{list.filter((c) => c.status === "Trên giá").length} quyển trên kệ</p>
        <ul className="divide-y divide-gray-100 text-sm max-h-96 overflow-y-auto">{list.map((c) => <li key={c.code} className="py-1.5 flex justify-between gap-2"><span><span className="font-mono text-xs">{c.code}</span> · {tMap.get(c.titleId)}</span><span className="text-xs text-gray-500">{c.status}</span></li>)}</ul>
      </>}
    </div>,
  )
}

/** Biên mục: ký hiệu phân loại, ký hiệu xếp giá, từ khóa, tóm tắt – dùng cho tra cứu và sắp xếp kho */
function CatalogForm({ t, onSaved }: { t: BookTitle; onSaved: () => void }) {
  const [f, setF] = useState({ classification: t.classification || "", callNumber: t.callNumber || "", keywords: t.keywords || "", summary: t.summary || "", isbn: t.isbn || "", pages: t.pages || "", size: t.size || "" })
  const [msg, setMsg] = useState("")
  // Ký hiệu xếp giá gợi ý = ký hiệu phân loại + 3 chữ đầu (tên tác giả, nếu không có thì tên sách), viết hoa không dấu
  const suggest = () => { const base = fold(t.author || t.title).replace(/[^a-z ]/g, "").trim().split(/\s+/).pop() || ""; return `${f.classification}${f.classification ? " " : ""}${base.slice(0, 3).toUpperCase()}` }
  return (
    <div className="rounded-xl bg-[#F6F7F9] p-3 mb-3">
      <div className="text-xs font-bold text-gray-600 mb-2">Biên mục</div>
      <div className="grid sm:grid-cols-4 gap-2">
        <input aria-label="Ký hiệu phân loại" className={field} placeholder="Ký hiệu phân loại (VD: 895.9223)" value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value })} />
        <div className="flex gap-1"><input aria-label="Ký hiệu xếp giá" className={field} placeholder="Ký hiệu xếp giá" value={f.callNumber} onChange={(e) => setF({ ...f, callNumber: e.target.value })} /><button type="button" onClick={() => setF({ ...f, callNumber: suggest() })} className="text-xs font-semibold text-[#1a3670] whitespace-nowrap">Gợi ý</button></div>
        <input aria-label="ISBN" className={field} placeholder="ISBN" value={f.isbn} onChange={(e) => setF({ ...f, isbn: e.target.value })} />
        <div className="flex gap-1"><input aria-label="Số trang" className={field} placeholder="Số trang" value={f.pages} onChange={(e) => setF({ ...f, pages: e.target.value })} /><input aria-label="Khổ" className={field} placeholder="Khổ (cm)" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} /></div>
        <input aria-label="Từ khóa" className={`${field} sm:col-span-2`} placeholder="Từ khóa, chủ đề (cách nhau dấu phẩy)" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} />
        <input aria-label="Tóm tắt" className={`${field} sm:col-span-2`} placeholder="Tóm tắt ngắn (hiện ở trang tra cứu)" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      </div>
      <div className="flex justify-end items-center gap-2 mt-2">{msg && <span className="text-xs text-green-700">{msg}</span>}<button onClick={async () => { await catalogTitle(t.id, f); setMsg("Đã lưu biên mục"); onSaved() }} className={btnGhost}>Lưu biên mục</button></div>
    </div>
  )
}
