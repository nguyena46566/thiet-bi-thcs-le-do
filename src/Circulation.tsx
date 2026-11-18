// Thư viện: mượn – trả, bạn đọc, tiết đọc, kiểm kê – thanh lọc, thống kê, tra cứu công khai
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  fetchLibRules, saveLibRules, fetchReaders, createReaders, readersFromUsers, updateReader, deleteReader, fetchLoans, lendBooks, returnBook, renewLoan, setCompensation,
  fetchReadingPeriods, createReadingPeriod, updateReadingPeriod, deleteReadingPeriod, searchOpac, fetchStocktakes, createStocktake, scanStocktake, finishStocktake,
  weedCopies, fetchLibStats, fetchCopies, fetchTitles, fetchShelves, fold,
  type Reader, type BookLoan, type LibRules, type LibAudit, type OpacResult, type LibStats, type BookCopy, type BookTitle, type Shelf,
} from "@/api"
import { exportExcel, printDoc } from "./Operations"
import { printHtml, esc, table, dots } from "./printing"

const card = "bg-white rounded-2xl shadow-sm border border-gray-100"
const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 focus:border-[#1a3670] bg-white"
const label = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const th = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const vn = (iso?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "" }
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)
const Ok = ({ msg }: { msg: string }) => (msg ? <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)
const SLOTS = ["S1", "S2", "S3", "S4", "S5", "C1", "C2", "C3", "C4", "C5"]
const slotName = (s: string) => `${s[0] === "S" ? "Sáng" : "Chiều"} tiết ${s[1]}`
/** Nhận mã từ máy quét: số ĐKCB, mã thẻ, hoặc URL nhãn QR */
const cleanCode = (raw: string) => decodeURIComponent(raw.trim().split("#").pop()!.split("/").pop() || "").toUpperCase()

// ===================================================================
// MƯỢN – TRẢ SÁCH
// ===================================================================
export function CirculationTab() {
  const [rules, setRules] = useState<LibRules | null>(null)
  const [readers, setReaders] = useState<Reader[]>([])
  const [open, setOpen] = useState<BookLoan[]>([])
  const [comp, setComp] = useState<BookLoan[]>([])
  const [readerQ, setReaderQ] = useState("")
  const [reader, setReader] = useState<Reader | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [scan, setScan] = useState("")
  const [mode, setMode] = useState("Mượn về nhà")
  const [due, setDue] = useState("")
  const [ret, setRet] = useState({ code: "", condition: "Bình thường" })
  const [view, setView] = useState<"open" | "overdue" | "comp">("open")
  const [editRules, setEditRules] = useState(false)
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const scanRef = useRef<HTMLInputElement>(null), retRef = useRef<HTMLInputElement>(null)
  const load = useCallback(() => { fetchLibRules().then(setRules).catch(() => {}); fetchReaders().then(setReaders).catch((e) => setError(e.message)); fetchLoans({ open: "1" }).then(setOpen).catch(() => {}); fetchLoans().then((all) => setComp(all.filter((l) => l.compensation && l.compensation.status === "Chưa xử lý"))).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const matches = useMemo(() => {
    const q = fold(readerQ.trim()); if (!q) return []
    const code = cleanCode(readerQ)
    return readers.filter((r) => r.id === code || fold(`${r.name} ${r.className} ${r.id}`).includes(q)).slice(0, 8)
  }, [readerQ, readers])
  const pick = (r: Reader) => { setReader(r); setReaderQ(""); setCodes([]); setTimeout(() => scanRef.current?.focus(), 0) }
  const mine = reader ? open.filter((l) => l.readerId === reader.id) : []
  const shown = view === "overdue" ? open.filter((l) => (l.overdueDays || 0) > 0) : open
  const act = async (fn: () => Promise<string>) => { setError(""); setOk(""); try { setOk(await fn()); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const printOverdue = () => {
    const list = open.filter((l) => (l.overdueDays || 0) > 0).sort((a, b) => a.className.localeCompare(b.className, "vi", { numeric: true }) || a.readerName.localeCompare(b.readerName, "vi"))
    printDoc("DANH SÁCH BẠN ĐỌC QUÁ HẠN TRẢ SÁCH", `Tính đến ngày ${new Date().toLocaleDateString("vi-VN")} – gửi giáo viên chủ nhiệm nhắc học sinh`, ["STT", "Lớp", "Bạn đọc", "Số ĐKCB", "Tên sách", "Ngày mượn", "Hạn trả", "Quá (ngày)"],
      list.map((l, i) => [i + 1, l.className || l.readerType, l.readerName, l.copyCode, l.title || "", vn(l.loanDate), vn(l.dueDate), l.overdueDays || 0]), true)
  }
  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={ok} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className={`${card} p-5`}>
          <h3 className="font-bold text-gray-900 mb-3">Cho mượn</h3>
          {!reader ? (
            <div className="relative">
              <label className={label} htmlFor="c-reader">Thẻ bạn đọc</label>
              <input id="c-reader" autoFocus className={field} placeholder="Quét thẻ (BD-00012) hoặc gõ tên, lớp…" value={readerQ} onChange={(e) => setReaderQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && matches.length) { e.preventDefault(); pick(matches[0]) } }} />
              {matches.length > 0 && <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">{matches.map((r) => <li key={r.id}><button onClick={() => pick(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"><span className="font-mono text-xs text-gray-500 mr-2">{r.id}</span>{r.name} <span className="text-xs text-gray-500">{r.type}{r.className ? ` · ${r.className}` : ""}</span></button></li>)}</ul>}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 rounded-xl bg-[#F6F7F9] p-3 mb-3">
                <div><div className="font-semibold">{reader.name}</div><div className="text-xs text-gray-500">{reader.id} · {reader.type}{reader.className ? ` · lớp ${reader.className}` : ""} · đang mượn {mine.filter((l) => l.mode === "Mượn về nhà").length}/{reader.type === "Học sinh" ? rules?.student.maxBooks : rules?.staff.maxBooks}{mine.some((l) => l.mode === "Theo năm học") ? ` · ${mine.filter((l) => l.mode === "Theo năm học").length} sách giáo khoa theo năm học` : ""}</div>
                  {mine.some((l) => (l.overdueDays || 0) > 0) && <div className="text-xs font-semibold text-red-700 mt-1">Có sách quá hạn – cần trả trước khi mượn tiếp</div>}
                  {reader.status !== "active" && <div className="text-xs font-semibold text-red-700 mt-1">Thẻ đang bị khóa</div>}</div>
                <button onClick={() => { setReader(null); setCodes([]) }} className="text-xs text-gray-500 hover:underline">Đổi bạn đọc</button>
              </div>
              <div className="flex gap-2 mb-2">
                {["Mượn về nhà", "Đọc tại chỗ"].map((m) => <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === m ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700"}`}>{m}</button>)}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); const c = cleanCode(scan); if (c && !codes.includes(c)) setCodes([...codes, c]); setScan("") }} className="flex gap-2">
                <input ref={scanRef} aria-label="Số ĐKCB" className={field} placeholder="Quét nhãn sách hoặc gõ số ĐKCB rồi Enter" value={scan} onChange={(e) => setScan(e.target.value)} /><button className={btnGhost}>Thêm</button>
              </form>
              {codes.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{codes.map((c) => <span key={c} className="px-2 py-1 rounded bg-gray-100 text-xs font-mono">{c} <button onClick={() => setCodes(codes.filter((x) => x !== c))} aria-label={`Bỏ ${c}`} className="text-gray-400">✕</button></span>)}</div>}
              {mode === "Mượn về nhà" && <div className="mt-3"><label className={label} htmlFor="c-due">Hạn trả (để trống = theo quy định: {reader.type === "Học sinh" ? rules?.student.days : rules?.staff.days} ngày; sách giáo khoa tự lấy cuối năm học)</label><input id="c-due" type="date" className={field} value={due} onChange={(e) => setDue(e.target.value)} /></div>}
              <div className="flex justify-end mt-3"><button disabled={!codes.length} onClick={() => act(async () => { const r = await lendBooks({ readerId: reader.id, codes, mode, dueDate: due || undefined }); setCodes([]); return `Đã ${mode === "Đọc tại chỗ" ? "ghi đọc tại chỗ" : "cho mượn"} ${r.length} quyển – hạn trả ${vn(r[0].dueDate)}` })} className={btnPrimary}>{mode === "Đọc tại chỗ" ? "Ghi đọc tại chỗ" : `Cho mượn ${codes.length} quyển`}</button></div>
            </>
          )}
        </div>
        <div className={`${card} p-5`}>
          <h3 className="font-bold text-gray-900 mb-3">Nhận trả</h3>
          <form onSubmit={(e) => { e.preventDefault(); const c = cleanCode(ret.code); if (c) act(async () => { const l = await returnBook(c, ret.condition); setRet({ code: "", condition: "Bình thường" }); retRef.current?.focus(); return `${l.copyCode} – ${l.readerName} đã trả${l.lateDays ? `, trễ ${l.lateDays} ngày` : ""}` }) }} className="space-y-2">
            <input ref={retRef} aria-label="Số ĐKCB trả" className={field} placeholder="Quét nhãn sách được trả" value={ret.code} onChange={(e) => setRet({ ...ret, code: e.target.value })} />
            <div className="flex gap-2">{["Bình thường", "Hỏng", "Mất"].map((c) => <button type="button" key={c} onClick={() => setRet({ ...ret, condition: c })} aria-pressed={ret.condition === c} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${ret.condition === c ? (c === "Bình thường" ? "bg-[#1a3670] text-white" : "bg-red-600 text-white") : "bg-gray-100 text-gray-700"}`}>{c}</button>)}</div>
            <div className="flex justify-end"><button className={btnPrimary}>Nhận trả</button></div>
          </form>
          {rules && <div className="mt-4 text-xs"><button onClick={() => setEditRules(!editRules)} className="font-semibold text-[#1a3670] hover:underline">{editRules ? "Đóng quy định mượn sách" : "Quy định mượn sách"}</button></div>}
          {editRules && rules && <RulesEditor rules={rules} setRules={setRules} onSave={() => act(async () => { await saveLibRules(rules); setEditRules(false); return "Đã lưu quy định" })} />}
        </div>
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex gap-2">{([["open", `Đang mượn (${open.length})`], ["overdue", `Quá hạn (${open.filter((l) => (l.overdueDays || 0) > 0).length})`], ["comp", `Chờ bồi thường (${comp.length})`]] as const).map(([k, l]) => <button key={k} onClick={() => setView(k)} aria-pressed={view === k} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === k ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700"}`}>{l}</button>)}</div>
          <button onClick={printOverdue} className={btnGhost}>In danh sách quá hạn theo lớp</button>
        </div>
        {view === "comp" ? (comp.length === 0 ? <p className="p-6 text-sm text-gray-400">Không có sách mất, hỏng chờ bồi thường</p> : (
          <ul className="divide-y divide-gray-50">{comp.map((l) => (
            <li key={l.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div><span className="font-mono text-xs">{l.copyCode}</span> · {l.title} · <strong>{l.readerName}</strong> <span className="text-xs text-gray-500">{l.className || l.readerType}</span>
                <div className="text-xs text-red-700">{l.condition} ngày {vn(l.returnDate)} · {l.compensation?.basis}: {(l.compensation?.amount || 0).toLocaleString("vi-VN")} đ</div></div>
              <div className="flex gap-2">{["Đã đền sách", "Đã nộp tiền"].map((s) => <button key={s} onClick={() => act(async () => { await setCompensation(l.id, s); return `Đã ghi: ${s}` })} className={btnGhost}>{s}</button>)}
                <button onClick={() => { const n = prompt("Lý do miễn bồi thường:", ""); if (n) act(async () => { await setCompensation(l.id, "Miễn bồi thường", n); return "Đã ghi miễn bồi thường" }) }} className="text-xs text-gray-500 hover:underline">Miễn</button></div>
            </li>
          ))}</ul>
        )) : shown.length === 0 ? <p className="p-6 text-sm text-gray-400">Không có</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50">{["Số ĐKCB", "Tên sách", "Bạn đọc", "Mượn", "Hạn trả", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{shown.map((l) => (
              <tr key={l.id} className={(l.overdueDays || 0) > 0 ? "bg-red-50/50" : ""}><td className="px-3 py-2 font-mono text-xs">{l.copyCode}</td><td className="px-3 py-2">{l.title}</td><td className="px-3 py-2">{l.readerName} <span className="text-xs text-gray-500">{l.className || l.readerType}</span></td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{vn(l.loanDate)}{l.mode === "Đọc tại chỗ" ? " · tại chỗ" : l.mode === "Theo năm học" ? " · cả năm học" : ""}</td><td className={`px-3 py-2 text-xs whitespace-nowrap ${(l.overdueDays || 0) > 0 ? "text-red-700 font-semibold" : ""}`}>{vn(l.dueDate)}{(l.overdueDays || 0) > 0 ? ` (quá ${l.overdueDays} ngày)` : ""}</td>
                <td className="px-3 py-2 text-right">{l.mode === "Mượn về nhà" && l.renewals < (rules?.maxRenewals ?? 1) && <button onClick={() => act(async () => { const x = await renewLoan(l.id); return `Đã gia hạn ${x.copyCode} đến ${vn(x.dueDate)}` })} className="text-xs font-semibold text-[#1a3670] hover:underline">Gia hạn</button>}</td></tr>
            ))}</tbody></table></div>
        )}
      </div>
    </div>
  )
}

// ===================================================================
// BẠN ĐỌC
// ===================================================================
async function printReaderCards(list: Reader[]) {
  const QR = await import("qrcode")
  const t = new Date(), sy = t.getMonth() >= 8 ? t.getFullYear() : t.getFullYear() - 1
  const cells = await Promise.all(list.map(async (r) => `<div class="c"><img src="${await QR.toDataURL(r.id, { margin: 1, width: 200 })}" alt=""><div><small>THẺ THƯ VIỆN · THCS LÊ ĐỘ</small><b>${esc(r.name)}</b><span>${esc(r.className ? `Lớp ${r.className}` : r.type)}</span><code>${esc(r.id)}</code><small>Năm học ${sy} – ${sy + 1}</small></div></div>`))
  const w = window.open("", "_blank"); if (!w) return
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thẻ thư viện</title><style>body{font-family:Arial,sans-serif;margin:10mm}.g{display:grid;grid-template-columns:repeat(2,85.6mm);gap:4mm}.c{width:85.6mm;height:54mm;box-sizing:border-box;border:1px solid #1a3670;border-radius:3mm;padding:3mm;display:flex;gap:3mm;align-items:center;break-inside:avoid}.c img{width:28mm;height:28mm}.c b{display:block;font-size:13px;margin:1mm 0}.c span{display:block;font-size:11px}.c code{display:block;font-size:14px;font-weight:bold;margin:1mm 0;color:#1a3670}.c small{display:block;font-size:8px;color:#555}@media print{button{display:none}}</style></head><body><button onclick="window.print()">In thẻ</button><div class="g">${cells.join("")}</div></body></html>`)
  w.document.close()
}
export function ReadersTab() {
  const [list, setList] = useState<Reader[] | null>(null)
  const [q, setQ] = useState(""), [type, setType] = useState(""), [cls, setCls] = useState("")
  const [f, setF] = useState({ name: "", type: "Học sinh", className: "", guardianConsent: false })
  const [bulkConsent, setBulkConsent] = useState(false)
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const load = useCallback(() => { fetchReaders().then(setList).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  if (!list) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const classes = [...new Set(list.map((r) => r.className).filter(Boolean))]
  const shown = list.filter((r) => (!type || r.type === type) && (!cls || r.className === cls) && (!q || fold(`${r.name} ${r.id}`).includes(fold(q))))
  const act = async (fn: () => Promise<string>) => { setError(""); setOk(""); try { setOk(await fn()); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const importFile = async (file: File) => {
    if (!bulkConsent) { setError("Đánh dấu xác nhận đã thu phiếu đồng ý của cha mẹ trước khi nhập danh sách học sinh"); return }
    const XLSX = await import("xlsx")
    const wb = XLSX.read(await file.arrayBuffer())
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" })
    const readers = rows.map((r) => ({ name: String(r["Họ tên"] ?? r["Họ và tên"] ?? "").trim(), className: String(r["Lớp"] ?? "").trim(), type: "Học sinh", guardianConsent: true })).filter((r) => r.name)
    act(async () => { const r = await createReaders(readers); return `Đã thêm ${r.created.length} học sinh.${r.errors.length ? ` Bỏ qua: ${r.errors.slice(0, 3).join("; ")}` : ""}` })
  }
  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={ok} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className={`${card} p-5 space-y-3`}>
          <h3 className="font-bold text-gray-900">Thêm bạn đọc</h3>
          <div className="grid grid-cols-3 gap-2">
            <input aria-label="Họ tên" className={`${field} col-span-3`} placeholder="Họ và tên" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <select aria-label="Loại" className={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{["Học sinh", "Giáo viên", "Nhân viên"].map((t) => <option key={t}>{t}</option>)}</select>
            {f.type === "Học sinh" && <input aria-label="Lớp" className={field} placeholder="Lớp (7A2)" value={f.className} onChange={(e) => setF({ ...f, className: e.target.value.toUpperCase() })} />}
          </div>
          {f.type === "Học sinh" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.guardianConsent} onChange={(e) => setF({ ...f, guardianConsent: e.target.checked })} />Đã có phiếu đồng ý của cha mẹ / người giám hộ cho việc ghi họ tên, lớp và lượt mượn sách của học sinh.</label>}
          <div className="flex justify-end"><button onClick={() => act(async () => { await createReaders([f]); setF({ ...f, name: "" }); return "Đã thêm bạn đọc" })} className={btnPrimary}>Thêm</button></div>
        </div>
        <div className={`${card} p-5 space-y-3`}>
          <h3 className="font-bold text-gray-900">Thêm hàng loạt</h3>
          <p className="text-xs text-gray-500">Danh sách học sinh từ Excel: cột <strong>Họ tên</strong> và <strong>Lớp</strong>. Chỉ ghi tối thiểu họ tên, lớp – không ngày sinh, địa chỉ.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={bulkConsent} onChange={(e) => setBulkConsent(e.target.checked)} />Nhà trường đã thu đủ phiếu đồng ý của cha mẹ cho các học sinh trong danh sách.</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportExcel("Mau-danh-sach-ban-doc.xlsx", [{ name: "Bạn đọc", rows: [{ "Họ tên": "Nguyễn Văn A", "Lớp": "6A1" }] }])} className={btnGhost}>Tải file mẫu</button>
            <button onClick={() => fileRef.current?.click()} className={btnGhost}>Nhập danh sách học sinh</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) importFile(x); e.target.value = "" }} />
            <button onClick={() => act(async () => `Đã thêm ${(await readersFromUsers()).added} giáo viên, nhân viên từ tài khoản`)} className={btnGhost}>Thêm giáo viên từ tài khoản</button>
          </div>
        </div>
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap gap-2 items-center">
          <input type="search" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" placeholder="Tìm tên, mã thẻ…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Loại bạn đọc" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}><option value="">Mọi loại</option>{["Học sinh", "Giáo viên", "Nhân viên"].map((t) => <option key={t}>{t}</option>)}</select>
          <select aria-label="Lớp" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">Mọi lớp</option>{classes.sort((a, b) => a.localeCompare(b, "vi", { numeric: true })).map((c) => <option key={c}>{c}</option>)}</select>
          <span className="text-sm text-gray-500">{shown.length} bạn đọc</span>
          <button disabled={!shown.length} onClick={() => printReaderCards(shown)} className={`${btnPrimary} ml-auto`}>In thẻ ({shown.length})</button>
        </div>
        <div className="overflow-x-auto max-h-[32rem]"><table className="w-full text-sm"><thead className="sticky top-0"><tr className="bg-gray-50">{["Mã thẻ", "Họ tên", "Loại", "Lớp", "Đang mượn", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-50">{shown.map((r) => (
            <tr key={r.id} className={r.status !== "active" ? "opacity-60" : ""}><td className="px-3 py-2 font-mono text-xs">{r.id}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-xs">{r.type}</td><td className="px-3 py-2">{r.className}</td><td className="px-3 py-2">{r.onLoan || 0}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap"><button onClick={() => act(async () => { await updateReader(r.id, { status: r.status === "active" ? "locked" : "active" }); return r.status === "active" ? "Đã khóa thẻ" : "Đã mở thẻ" })} className="text-xs font-semibold text-gray-500 hover:underline mr-3">{r.status === "active" ? "Khóa thẻ" : "Mở thẻ"}</button>
                <button onClick={() => { if (confirm(`Xóa bạn đọc ${r.name}? Lượt mượn cũ được giữ ở dạng ẩn danh để thống kê.`)) act(async () => { await deleteReader(r.id); return "Đã xóa bạn đọc" }) }} className="text-xs text-gray-400 hover:text-red-600">Xóa</button></td></tr>
          ))}</tbody></table></div>
      </div>
    </div>
  )
}

// ===================================================================
// TIẾT ĐỌC THƯ VIỆN
// ===================================================================
export function ReadingPeriodsTab() {
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchReadingPeriods>> | null>(null)
  const [f, setF] = useState({ date: new Date().toLocaleDateString("sv-SE"), slot: "S1", className: "", topic: "", leader: "" })
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const load = useCallback(() => { fetchReadingPeriods().then(setD).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  if (!d) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const act = async (fn: () => Promise<string>) => { setError(""); setOk(""); try { setOk(await fn()); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const lacking = d.summary.filter((s) => !s.ok1 || !s.ok2).length
  const printBook = () => printDoc("SỔ THEO DÕI TIẾT ĐỌC THƯ VIỆN", `Năm học ${d.schoolYear.replace("-", " – ")} · tối thiểu ${d.min} tiết/học kỳ/lớp (Thông tư 16/2022/TT-BGDĐT)`,
    ["STT", "Ngày", "Tiết", "Lớp", "Học kỳ", "Nội dung", "Người tổ chức", "Sĩ số tham gia", "Trạng thái", "Ghi chú"],
    d.periods.map((p, i) => [i + 1, vn(p.date), p.slotName, p.className, p.term, p.topic, p.leader, p.attendance ?? "", p.status, p.note]), true)
  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={ok} />
      {lacking > 0 && <p className="text-sm text-amber-800">{lacking} lớp chưa đủ {d.min} tiết đọc trong học kỳ.</p>}
      <div className={`${card} p-5`}>
        <h3 className="font-bold text-gray-900 mb-3">Xếp tiết đọc</h3>
        <div className="grid sm:grid-cols-6 gap-2">
          <input aria-label="Ngày" type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <select aria-label="Tiết" className={field} value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })}>{SLOTS.map((s) => <option key={s} value={s}>{slotName(s)}</option>)}</select>
          <input aria-label="Lớp" className={field} placeholder="Lớp (7A2)" value={f.className} onChange={(e) => setF({ ...f, className: e.target.value.toUpperCase() })} />
          <input aria-label="Nội dung" className={`${field} sm:col-span-2`} placeholder="Nội dung (VD: Giới thiệu sách về Bác Hồ)" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
          <input aria-label="Người tổ chức" className={field} placeholder="Người tổ chức" value={f.leader} onChange={(e) => setF({ ...f, leader: e.target.value })} />
        </div>
        <div className="flex justify-end mt-2"><button onClick={() => act(async () => { await createReadingPeriod(f); return `Đã xếp tiết đọc lớp ${f.className}` })} className={btnPrimary}>Xếp tiết</button></div>
      </div>
      <div className="grid lg:grid-cols-5 gap-4 items-start">
        <div className={`lg:col-span-2 ${card} overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-gray-100"><h3 className="font-semibold text-gray-900">Mức đạt theo lớp</h3></div>
          {d.summary.length === 0 ? <p className="p-6 text-sm text-gray-400">Chưa có lớp (thêm bạn đọc học sinh trước)</p> : (
            <table className="w-full text-sm"><thead><tr className="bg-gray-50">{["Lớp", "HK I", "HK II", "Kế hoạch"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{d.summary.map((s) => <tr key={s.className}><td className="px-3 py-2 font-medium">{s.className}</td>
                <td className={`px-3 py-2 font-semibold ${s.ok1 ? "text-green-700" : "text-red-700"}`}>{s.hk1}/{d.min}</td><td className={`px-3 py-2 font-semibold ${s.ok2 ? "text-green-700" : "text-red-700"}`}>{s.hk2}/{d.min}</td><td className="px-3 py-2">{s.planned}</td></tr>)}</tbody></table>
          )}
        </div>
        <div className={`lg:col-span-3 ${card} overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between"><h3 className="font-semibold text-gray-900">Lịch tiết đọc năm học {d.schoolYear}</h3><button onClick={printBook} className={btnGhost}>In sổ theo dõi</button></div>
          {d.periods.length === 0 ? <p className="p-6 text-sm text-gray-400">Chưa xếp tiết đọc</p> : (
            <ul className="divide-y divide-gray-50">{d.periods.map((p) => (
              <li key={p.id} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div><strong>{p.className}</strong> · {vn(p.date)} · {p.slotName} · {p.term}<div className="text-xs text-gray-500">{p.topic}{p.leader ? ` · ${p.leader}` : ""}{p.attendance != null ? ` · ${p.attendance} HS` : ""}</div></div>
                <div className="flex items-center gap-2"><span className={`text-xs font-bold ${p.status === "Đã dạy" ? "text-green-700" : p.status === "Hủy" ? "text-gray-400" : "text-amber-700"}`}>{p.status}</span>
                  {p.status === "Kế hoạch" && <><button onClick={() => { const n = prompt("Sĩ số học sinh tham gia:", ""); if (n) act(async () => { await updateReadingPeriod(p.id, { status: "Đã dạy", attendance: Number(n) }); return "Đã ghi tiết đọc" }) }} className="text-xs font-semibold text-[#1a3670] hover:underline">Đã dạy</button>
                    <button onClick={() => act(async () => { await updateReadingPeriod(p.id, { status: "Hủy" }); return "Đã hủy" })} className="text-xs text-gray-500 hover:underline">Hủy</button></>}
                  <button onClick={() => act(async () => { await deleteReadingPeriod(p.id); return "Đã xóa" })} className="text-xs text-gray-400 hover:text-red-600">Xóa</button></div>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ===================================================================
// KIỂM KÊ – THANH LỌC KHO SÁCH
// ===================================================================
export function StocktakeTab() {
  const [list, setList] = useState<LibAudit[] | null>(null)
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [cur, setCur] = useState<LibAudit | null>(null)
  const [scan, setScan] = useState("")
  const [form, setForm] = useState({ shelf: "", title: "" })
  const [cands, setCands] = useState<(BookCopy & { title?: string })[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [weed, setWeed] = useState({ reason: "Hư hỏng", decisionNo: "" })
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const scanRef = useRef<HTMLInputElement>(null)
  const load = useCallback(async () => {
    fetchStocktakes().then(setList).catch((e) => setError(e.message)); fetchShelves().then(setShelves).catch(() => {})
    const [cs, ts] = await Promise.all([fetchCopies(), fetchTitles()]); const m = new Map(ts.map((t: BookTitle) => [t.id, t.title]))
    setCands(cs.filter((c) => c.status === "Hỏng" || c.status === "Mất").map((c) => ({ ...c, title: m.get(c.titleId) })))
  }, [])
  useEffect(() => { load() }, [load])
  if (!list) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const act = async (fn: () => Promise<string>) => { setError(""); setOk(""); try { setOk(await fn()); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const printAudit = (a: LibAudit) => printHtml({
    title: "Biên bản kiểm kê kho sách thư viện", subtitle: a.title,
    body: `<h2>I. Thành phần</h2>${dots(3)}<h2>II. Kết quả</h2><p>Phạm vi: ${a.shelf ? `kệ ${esc(a.shelf)}` : "toàn bộ kho"}. Số bản theo sổ (trên giá): <b>${a.expected.length}</b>; kiểm đếm thực tế: <b>${a.found.length}</b>; không tìm thấy: <b>${(a.missing || []).length}</b>; ngoài sổ / sai kệ: <b>${a.extra.length}</b>.</p>
      ${(a.missing || []).length ? `<p><b>Danh sách bản không tìm thấy</b>${a.markedMissing ? " (đã chuyển tình trạng “Mất”)" : ""}:</p><p style="font-family:monospace">${(a.missing || []).map(esc).join(", ")}</p>` : ""}
      ${a.extra.length ? `<p><b>Bản ngoài phạm vi / sai kệ:</b></p><p style="font-family:monospace">${a.extra.map(esc).join(", ")}</p>` : ""}
      <h2>III. Kiến nghị</h2>${dots(3)}`,
    signs: [["Thủ thư", "(Ký, ghi rõ họ tên)"], ["Tổ kiểm kê", "(Ký, ghi rõ họ tên)"], ["Hiệu trưởng", "(Ký, đóng dấu)"]],
  })
  const printWeed = (codes: string[]) => printHtml({
    title: "Biên bản thanh lọc tài liệu thư viện", subtitle: weed.decisionNo ? `Theo quyết định số ${weed.decisionNo}` : undefined,
    body: `<p>Lý do thanh lọc: <b>${esc(weed.reason)}</b>. Số bản: <b>${codes.length}</b>.</p>${table(["STT", "Số ĐKCB", "Tên tài liệu", "Giá (đ)", "Tình trạng trước"], cands.filter((c) => codes.includes(c.code)).map((c, i) => [i + 1, c.code, c.title || "", c.price.toLocaleString("vi-VN"), c.status]))}<h2>Hình thức xử lý</h2>${dots(2)}`,
    signs: [["Thủ thư", "(Ký, ghi rõ họ tên)"], ["Hội đồng thanh lý", "(Ký, ghi rõ họ tên)"], ["Hiệu trưởng", "(Ký, đóng dấu)"]],
  })
  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={ok} />
      {cur ? (
        <div className={`${card} p-5`}>
          <div className="flex flex-wrap justify-between gap-2 mb-3"><h3 className="font-bold text-gray-900">{cur.title}{cur.shelf ? ` · kệ ${cur.shelf}` : ""}</h3><button onClick={() => setCur(null)} className={btnGhost}>Đóng</button></div>
          <div className="grid grid-cols-3 gap-3 mb-3">{([["Theo sổ", cur.expected.length], ["Đã đếm", cur.found.length], ["Ngoài sổ / sai kệ", cur.extra.length]] as const).map(([l, v]) => <div key={l} className="rounded-xl bg-[#F6F7F9] p-3"><div className="text-2xl font-bold">{v}</div><div className="text-xs text-gray-500">{l}</div></div>)}</div>
          <div className="h-2 rounded bg-gray-100 overflow-hidden mb-3"><div className="h-full bg-[#1a3670]" style={{ width: `${(cur.found.length / cur.expected.length) * 100}%` }} /></div>
          {cur.status === "Đang kiểm kê" ? <>
            <form onSubmit={(e) => { e.preventDefault(); const c = cleanCode(scan); if (c) act(async () => { setCur(await scanStocktake(cur.id, [c])); setScan(""); scanRef.current?.focus(); return `Đã đếm ${c}` }) }} className="flex gap-2"><input ref={scanRef} autoFocus aria-label="Quét sách" className={field} placeholder="Quét lần lượt nhãn từng quyển trên giá" value={scan} onChange={(e) => setScan(e.target.value)} /><button className={btnGhost}>Thêm</button></form>
            <div className="flex flex-wrap justify-end gap-2 mt-3">
              <button onClick={() => act(async () => { setCur(await finishStocktake(cur.id, false)); return "Đã kết thúc kiểm kê (giữ nguyên tình trạng bản chưa tìm thấy)" })} className={btnGhost}>Kết thúc, tìm tiếp sau</button>
              <button onClick={() => { if (confirm(`Chuyển ${cur.expected.length - cur.found.length} bản không tìm thấy sang tình trạng “Mất”?`)) act(async () => { setCur(await finishStocktake(cur.id, true)); return "Đã kết thúc kiểm kê" }) }} className={btnPrimary}>Kết thúc, ghi mất bản không tìm thấy</button>
            </div>
          </> : <div className="flex justify-end"><button onClick={() => printAudit(cur)} className={btnPrimary}>In biên bản kiểm kê</button></div>}
        </div>
      ) : (
        <div className={`${card} p-5`}>
          <h3 className="font-bold text-gray-900 mb-3">Kiểm kê kho sách</h3>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Phạm vi" className="border border-gray-200 rounded-lg px-2 text-sm" value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })}><option value="">Toàn bộ kho</option>{shelves.map((s) => <option key={s.id} value={s.code}>Kệ {s.code}</option>)}</select>
            <input aria-label="Tên đợt" className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]" placeholder="Tên đợt (VD: Kiểm kê cuối năm học)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <button onClick={() => act(async () => { setCur(await createStocktake(form.shelf, form.title)); return "Đã mở phiên kiểm kê – quét lần lượt từng quyển" })} className={btnPrimary}>Bắt đầu kiểm kê</button>
          </div>
          {list.length > 0 && <ul className="mt-4 divide-y divide-gray-100 text-sm">{list.map((a) => <li key={a.id} className="py-2 flex justify-between gap-2"><span>{a.title}{a.shelf ? ` · kệ ${a.shelf}` : ""} · {a.found.length}/{a.expected.length} · <strong>{a.status}</strong></span><button onClick={() => setCur(a)} className="text-xs font-semibold text-[#1a3670] hover:underline">Mở</button></li>)}</ul>}
        </div>
      )}
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-gray-100"><h3 className="font-semibold text-gray-900">Thanh lọc tài liệu</h3><p className="text-xs text-gray-500">Các bản đang “Hỏng” hoặc “Mất”. Chọn bản cần đưa ra khỏi kho theo quyết định thanh lý.</p></div>
        {cands.length === 0 ? <p className="p-6 text-sm text-gray-400">Không có bản hỏng, mất</p> : <>
          <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">{cands.map((c) => <li key={c.code}><label className="flex items-center gap-3 px-5 py-2 text-sm"><input type="checkbox" checked={sel.includes(c.code)} onChange={(e) => setSel(e.target.checked ? [...sel, c.code] : sel.filter((x) => x !== c.code))} /><span className="font-mono text-xs w-24">{c.code}</span><span className="flex-1">{c.title}</span><span className="text-xs text-red-700">{c.status}</span></label></li>)}</ul>
          <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-2 items-center">
            <select aria-label="Lý do" className="border border-gray-200 rounded-lg px-2 py-2 text-sm" value={weed.reason} onChange={(e) => setWeed({ ...weed, reason: e.target.value })}>{["Hư hỏng", "Nội dung lạc hậu", "Mất", "Khác"].map((r) => <option key={r}>{r}</option>)}</select>
            <input aria-label="Số quyết định" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Số quyết định thanh lý" value={weed.decisionNo} onChange={(e) => setWeed({ ...weed, decisionNo: e.target.value })} />
            <button disabled={!sel.length} onClick={() => { const codes = [...sel]; if (confirm(`Thanh lọc ${codes.length} bản?`)) act(async () => { const r = await weedCopies(codes, weed.reason, weed.decisionNo); printWeed(r.weeded); setSel([]); return `Đã thanh lọc ${r.weeded.length} bản` }) }} className={`${btnPrimary} ml-auto`}>Thanh lọc và in biên bản ({sel.length})</button>
          </div>
        </>}
      </div>
    </div>
  )
}

// ===================================================================
// THỐNG KÊ THƯ VIỆN
// ===================================================================
export function LibraryStatsTab() {
  const [s, setS] = useState<LibStats | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { fetchLibStats().then(setS).catch((e) => setError(e.message)) }, [])
  if (!s) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const months = Object.entries(s.loans.byMonth).sort()
  const maxM = Math.max(1, ...months.map((m) => m[1]))
  const k = (l: string, v: string | number, sub = "") => <div className={`${card} px-4 py-3`}><div className="text-2xl font-bold tabular-nums">{v}</div><div className="text-xs text-gray-500">{l}</div>{sub && <div className="text-[11px] text-gray-400">{sub}</div>}</div>
  const printReport = () => printHtml({
    title: "Báo cáo thống kê hoạt động thư viện", subtitle: `Năm học ${s.schoolYear.replace("-", " – ")}`,
    body: `<h2>1. Tài nguyên thông tin</h2><p>${s.collection.titles} đầu tài liệu, ${s.collection.copies} bản đang lưu hành${s.readers.copiesPerStudent != null ? ` (bình quân ${s.readers.copiesPerStudent} bản/học sinh)` : ""}; đang cho mượn ${s.collection.onLoan}; hỏng ${s.collection.damaged}; mất ${s.collection.lost}; đã thanh lọc ${s.collection.weeded}.</p>
      <h2>2. Bạn đọc</h2><p>Học sinh: ${s.readers.students} bạn đọc, ${s.readers.studentsActive} em đã mượn sách trong năm học (${s.readers.studentPct}%). Giáo viên: ${s.readers.teachers} bạn đọc, ${s.readers.teachersActive} người đã mượn (${s.readers.teacherPct}%).</p>
      <h2>3. Lưu thông</h2><p>${s.loans.total} lượt (mượn về nhà ${s.loans.home}, đọc tại chỗ ${s.loans.inLibrary}); đang mượn ${s.loans.open}; quá hạn ${s.loans.overdue}.</p>
      ${table(["Lớp", "Số bạn đọc", "Đã mượn sách", "Tỉ lệ (%)", "Lượt mượn"], Object.entries(s.byClass).sort((a, b) => a[0].localeCompare(b[0], "vi", { numeric: true })).map(([c, x]) => [c, x.readers, x.active, x.readers ? Math.round((x.active / x.readers) * 100) : 0, x.loans]))}
      <h2>4. Tiết đọc thư viện</h2><p>Đã tổ chức ${s.readingPeriods.done} tiết; còn ${s.readingPeriods.planned} tiết theo kế hoạch.</p>
      <h2>5. Tài liệu được mượn nhiều nhất</h2>${table(["Tên tài liệu", "Lượt mượn"], s.loans.topTitles.map((t) => [t.title, t.loans]))}
      <h2>6. Đánh giá, kiến nghị</h2>${dots(3)}`,
    signs: [["Thủ thư", "(Ký, ghi rõ họ tên)"], ["Hiệu trưởng", "(Ký, đóng dấu)"]],
  })
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center"><p className="text-sm text-gray-600">Năm học {s.schoolYear}. Tỉ lệ bạn đọc = số người đã mượn ít nhất một lần / tổng số bạn đọc.</p><button onClick={printReport} className={btnPrimary}>In báo cáo thống kê</button></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {k("Đầu tài liệu", s.collection.titles)}{k("Bản đang lưu hành", s.collection.copies, s.readers.copiesPerStudent != null ? `${s.readers.copiesPerStudent} bản/học sinh` : "")}
        {k("Học sinh đã mượn sách", `${s.readers.studentPct}%`, `${s.readers.studentsActive}/${s.readers.students}`)}{k("Giáo viên đã mượn sách", `${s.readers.teacherPct}%`, `${s.readers.teachersActive}/${s.readers.teachers}`)}
        {k("Lượt lưu thông", s.loans.total, `về nhà ${s.loans.home} · tại chỗ ${s.loans.inLibrary}`)}{k("Đang mượn", s.loans.open)}{k("Quá hạn", s.loans.overdue)}{k("Tiết đọc đã tổ chức", s.readingPeriods.done, `kế hoạch còn ${s.readingPeriods.planned}`)}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={`${card} p-5`}><h3 className="font-semibold text-gray-900 mb-3">Lượt mượn theo tháng</h3>
          {months.length === 0 ? <p className="text-sm text-gray-400">Chưa có</p> : <div className="flex items-end gap-2 h-40">{months.map(([m, v]) => <div key={m} className="flex-1 h-full flex flex-col items-center justify-end gap-1"><span className="text-xs font-semibold">{v}</span><div className="w-full bg-[#1a3670] rounded-t" style={{ height: `${Math.max(4, (v / maxM) * 75)}%` }} /><span className="text-[10px] text-gray-500">{m.slice(5)}/{m.slice(2, 4)}</span></div>)}</div>}
        </div>
        <div className={`${card} p-5`}><h3 className="font-semibold text-gray-900 mb-3">Mượn nhiều nhất</h3>
          {s.loans.topTitles.length === 0 ? <p className="text-sm text-gray-400">Chưa có</p> : <ol className="text-sm space-y-1 list-decimal pl-5">{s.loans.topTitles.map((t) => <li key={t.title}>{t.title} <span className="text-gray-500">· {t.loans}</span></li>)}</ol>}
        </div>
      </div>
    </div>
  )
}

// ===================================================================
// TRA CỨU SÁCH (CÔNG KHAI, KHÔNG CẦN ĐĂNG NHẬP)
// ===================================================================
export function OpacPage() {
  const [q, setQ] = useState("")
  const [kind, setKind] = useState("")
  const [d, setD] = useState<{ results: OpacResult[]; kinds: Record<string, string> } | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { const t = setTimeout(() => { searchOpac(q, kind).then(setD).catch((e) => setError(e.message)) }, 250); return () => clearTimeout(t) }, [q, kind])
  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10"><div className="max-w-4xl">
      <div className="mb-6"><div className="text-sm font-semibold text-gray-500 mb-1">Thư viện Trường THCS Lê Độ</div><h1 className="text-[28px] sm:text-3xl font-bold text-[#1F2937] tracking-tight">Tra cứu sách</h1></div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input type="search" autoFocus aria-label="Tìm sách" className="flex-1 min-w-[240px] border border-gray-200 rounded-xl px-4 py-3 text-[15px]" placeholder="Tên sách, tác giả, chủ đề (không cần dấu)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Loại tài liệu" className="border border-gray-200 rounded-xl px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Mọi loại</option>{Object.entries(d?.kinds || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <Err msg={error} />
      {!d ? <p className="text-sm text-gray-400">Đang tải…</p> : d.results.length === 0 ? <p className="text-sm text-gray-500">Không tìm thấy sách phù hợp.</p> : (
        <ul className="space-y-3">{d.results.map((r) => (
          <li key={r.id} className="bg-white rounded-2xl border border-gray-200/80 p-4 flex flex-wrap gap-3 justify-between">
            <div className="min-w-0 flex-1"><div className="font-semibold text-gray-900">{r.title}</div><div className="text-sm text-gray-600">{[r.author, r.publisher, r.year].filter(Boolean).join(" · ")}</div><div className="text-xs text-gray-500">{r.kind}{r.grade ? ` · khối ${r.grade}` : ""}{r.callNumber ? ` · ký hiệu ${r.callNumber}` : ""}</div>{r.summary && <p className="text-sm text-gray-600 mt-1">{r.summary}</p>}</div>
            <div className="text-right"><div className={`text-sm font-bold ${r.available ? "text-green-700" : "text-red-700"}`}>{r.available ? `Còn ${r.available}/${r.total} bản` : "Đã cho mượn hết"}</div>{r.shelves.length > 0 && <div className="text-xs text-gray-500">Kệ {r.shelves.join(", ")}</div>}</div>
          </li>
        ))}</ul>
      )}
      <p className="text-xs text-gray-400 mt-6">Muốn mượn sách: mang thẻ thư viện tới quầy thủ thư. <a href="#thong-tin" className="underline">Nội quy thư viện</a></p>
    </div></main>
  )
}

/** Sách thư viện giáo viên đang mượn (hiện ở “Phiếu của tôi”) */
export function MyLibraryLoans() {
  const [d, setD] = useState<{ reader: Reader | null; loans: BookLoan[] } | null>(null)
  useEffect(() => { import("@/api").then((m) => m.fetchMyLibraryLoans().then(setD).catch(() => {})) }, [])
  if (!d?.reader) return null
  const open = d.loans.filter((l) => !l.returnedAt)
  const today = new Date().toLocaleDateString("sv-SE")
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-5 mt-6">
      <h2 className="font-semibold text-gray-900 mb-1">Sách thư viện đang mượn</h2>
      <p className="text-xs text-gray-500 mb-3">Thẻ {d.reader.id} · đã mượn {d.loans.length} lượt</p>
      {open.length === 0 ? <p className="text-sm text-gray-400">Không có sách đang mượn</p> : <ul className="divide-y divide-gray-100 text-sm">{open.map((l) => <li key={l.id} className="py-2 flex justify-between gap-2"><span>{l.title} <span className="font-mono text-xs text-gray-500">{l.copyCode}</span></span><span className={l.dueDate < today ? "text-red-700 font-semibold" : "text-gray-600"}>hạn {vn(l.dueDate)}</span></li>)}</ul>}
    </section>
  )
}

const KIND_NAMES: Record<string, string> = { SGK: "Sách giáo khoa", STK: "Sách tham khảo", STN: "Sách thiếu nhi, truyện", SNV: "Sách nghiệp vụ", BTC: "Báo, tạp chí" }
const MODE_NAMES: Record<string, string> = { loan: "Mượn về nhà có thời hạn", year: "Mượn theo năm học", staff: "Chỉ giáo viên, nhân viên mượn về", inLibrary: "Chỉ đọc tại chỗ" }
function RulesEditor({ rules, setRules, onSave }: { rules: LibRules; setRules: (r: LibRules) => void; onSave: () => void }) {
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0))
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-[#F6F7F9] p-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div><label className="text-[11px] text-gray-500">Học sinh: số quyển</label><input type="number" className={field} value={rules.student.maxBooks} onChange={(e) => setRules({ ...rules, student: { ...rules.student, maxBooks: num(e.target.value) } })} /></div>
        <div><label className="text-[11px] text-gray-500">Học sinh: số ngày</label><input type="number" className={field} value={rules.student.days} onChange={(e) => setRules({ ...rules, student: { ...rules.student, days: num(e.target.value) } })} /></div>
        <div><label className="text-[11px] text-gray-500">GV, NV: số quyển</label><input type="number" className={field} value={rules.staff.maxBooks} onChange={(e) => setRules({ ...rules, staff: { ...rules.staff, maxBooks: num(e.target.value) } })} /></div>
        <div><label className="text-[11px] text-gray-500">GV, NV: số ngày</label><input type="number" className={field} value={rules.staff.days} onChange={(e) => setRules({ ...rules, staff: { ...rules.staff, days: num(e.target.value) } })} /></div>
        <div><label className="text-[11px] text-gray-500">Số lần gia hạn</label><input type="number" className={field} value={rules.maxRenewals} onChange={(e) => setRules({ ...rules, maxRenewals: num(e.target.value) })} /></div>
        <div><label className="text-[11px] text-gray-500">Mỗi lần gia hạn (ngày)</label><input type="number" className={field} value={rules.renewDays} onChange={(e) => setRules({ ...rules, renewDays: num(e.target.value) })} /></div>
        <div><label className="text-[11px] text-gray-500">Bồi thường sách hỏng (% giá)</label><input type="number" className={field} value={rules.damageRate} onChange={(e) => setRules({ ...rules, damageRate: num(e.target.value) })} /></div>
        <div><label className="text-[11px] text-gray-500">Cuối năm học (tháng-ngày)</label><input className={field} value={rules.schoolYearEnd} onChange={(e) => setRules({ ...rules, schoolYearEnd: e.target.value })} placeholder="05-31" /></div>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={rules.blockWhenOverdue} onChange={(e) => setRules({ ...rules, blockWhenOverdue: e.target.checked })} />Chưa trả sách quá hạn thì không được mượn tiếp</label>
      <table className="w-full text-xs"><thead><tr><th className="text-left py-1">Loại tài liệu</th><th className="text-left py-1">Cách cho mượn</th></tr></thead>
        <tbody>{Object.keys(KIND_NAMES).map((k) => <tr key={k}><td className="py-1">{KIND_NAMES[k]}</td><td className="py-1"><select aria-label={`Cách cho mượn ${KIND_NAMES[k]}`} className="border border-gray-200 rounded px-1.5 py-1" value={rules.kinds[k]} onChange={(e) => setRules({ ...rules, kinds: { ...rules.kinds, [k]: e.target.value } })}>{Object.entries(MODE_NAMES).map(([m, n]) => <option key={m} value={m}>{n}</option>)}</select></td></tr>)}</tbody></table>
      <button onClick={onSave} className={`${btnPrimary} w-full`}>Lưu quy định</button>
    </div>
  )
}
/** Nội quy mượn sách hiển thị công khai (sinh từ quy định đang áp dụng) */
export function LibraryRulesNotice() {
  const [r, setR] = useState<LibRules | null>(null)
  useEffect(() => { fetchLibRules().then(setR).catch(() => {}) }, [])
  if (!r) return null
  const byMode = (m: string) => Object.keys(KIND_NAMES).filter((k) => r.kinds[k] === m).map((k) => KIND_NAMES[k].toLowerCase())
  const items = [
    "Xuất trình thẻ thư viện khi mượn, trả sách; kiểm tra sách trước khi mang ra khỏi thư viện, thấy rách, mất trang thì báo ngay thủ thư.",
    `Học sinh mượn về nhà tối đa ${r.student.maxBooks} quyển trong ${r.student.days} ngày; giáo viên, nhân viên tối đa ${r.staff.maxBooks} quyển trong ${r.staff.days} ngày.`,
    r.maxRenewals ? `Đọc chưa xong được gia hạn ${r.maxRenewals > 1 ? `tối đa ${r.maxRenewals} lần, ` : ""}thêm ${r.renewDays} ngày tại quầy thủ thư.` : "",
    r.blockWhenOverdue ? "Chưa trả sách quá hạn thì chưa được mượn sách mới." : "",
    byMode("year").length ? `Mượn theo năm học: ${byMode("year").join(", ")} (trả trước ngày ${r.schoolYearEnd.split("-").reverse().join("/")}); không tính vào số quyển được mượn.` : "",
    byMode("staff").length ? `Chỉ giáo viên, nhân viên mượn về: ${byMode("staff").join(", ")}; học sinh đọc tại thư viện.` : "",
    byMode("inLibrary").length ? `Chỉ đọc tại chỗ: ${byMode("inLibrary").join(", ")}.` : "",
    `Làm mất sách phải đền sách cùng tên hoặc tiền bằng giá sách; làm hỏng bồi thường khoảng ${r.damageRate}% giá sách tùy mức độ.`,
    "Giữ trật tự, vệ sinh; không viết, vẽ, gấp trang, làm rách sách.",
  ].filter(Boolean)
  return (
    <ol className="list-decimal pl-5 space-y-1">{items.map((t) => <li key={t}>{t}</li>)}</ol>
  )
}
