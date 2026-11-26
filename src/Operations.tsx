// Kiểm kê, bảo trì, báo cáo tổng hợp, nhãn QR và trang chi tiết thiết bị
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  fetchAudits, startAudit, fetchAudit, saveAudit, finishAudit, cancelAudit,
  fetchInventory, fetchMaintenance, createMaintenance, completeMaintenance, fetchReport, fetchEquipmentDetail,
  fetchDisposals, createDisposal, decideDisposal, fetchCapabilities, type Capabilities, reportIssue, fetchIssues, fetchMyIssues, resolveIssue, type EquipmentIssue, fetchRecords, fetchNotifications, fetchLossReports, confirmLoss, rejectLoss, fetchRooms, fetchRoomLog,
  fetchEquipmentHistory, verifyLoss, fetchAlerts, fetchChanges, type EquipmentHistory,
  type Audit, type AuditItem, type Equipment, type Maintenance, type Report, type BorrowDraft, type Disposal, type BorrowRecord, type Notification, type LossReport, type Room,
} from "@/api"
import type { Subject } from "./Inventory"
import { printHtml, esc, table, dots } from "./printing"
import { printSummaryReport } from "./Planning"

const money = (n: number) => `${(n || 0).toLocaleString("vi-VN")} đ`
const fieldBase = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/50 focus:border-[#1a3670] bg-white"
const field = `w-full ${fieldBase}`
const label = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const card = "bg-white rounded-2xl shadow-sm border border-gray-100"
const th = "relative px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const todayIso = () => new Date().toLocaleDateString("sv-SE")
const isoToVn = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]}/${m[2]}/${m[1]}` : "" }
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)

/** Xuất nhiều bảng ra một file Excel (thư viện chỉ tải khi bấm nút) */
export async function exportExcel(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "": "Không có dữ liệu" }])
    const keys = Object.keys(s.rows[0] || { "": "" })
    ws["!cols"] = keys.map((k) => ({ wch: Math.min(60, Math.max(k.length, ...s.rows.map((r) => String(r[k] ?? "").length)) + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename)
}

// ===================================================================
// KIỂM KÊ
// ===================================================================
export function AuditTab({ subjects }: { subjects: Subject[] }) {
  const [list, setList] = useState<Audit[] | null>(null)
  const [current, setCurrent] = useState<Audit | null>(null)
  const [subjectId, setSubjectId] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [onlyTodo, setOnlyTodo] = useState(false)
  const [scan, setScan] = useState("")
  const [scanMsg, setScanMsg] = useState("")

  const load = useCallback(async () => {
    try {
      const l = await fetchAudits(); setList(l)
      const draft = l.find((a) => a.status === "Đang kiểm kê")
      if (draft && !current) setCurrent(await fetchAudit(draft.id))
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }, [current])
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true); setError("")
    try { setCurrent(await startAudit({ subjectId })); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  const expected = (i: AuditItem) => Math.max(0, i.sysGood - i.out) + i.sysBroken
  const diffOf = (i: AuditItem) => (i.countGood === null ? null : i.countGood + (i.countBroken ?? i.sysBroken) - expected(i))
  const setItem = (id: string, patch: Partial<AuditItem>) => current && setCurrent({ ...current, items: current.items.map((i) => (i.equipmentId === id ? { ...i, ...patch } : i)) })
  const numOrNull = (v: string) => (v === "" ? null : Math.max(0, Math.floor(Number(v) || 0)))
  const payload = () => current!.items.map(({ equipmentId, countGood, countBroken, note }) => ({ equipmentId, countGood, countBroken, note }))

  const save = async () => { if (!current) return; setBusy(true); setError(""); try { setCurrent(await saveAudit(current.id, payload())) } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) } }
  const finish = async () => {
    if (!current) return
    const notCounted = current.items.filter((i) => i.countGood === null).length
    if (!confirm(`Hoàn tất kiểm kê? Kho sẽ được cập nhật theo số đếm.${notCounted ? `\n${notCounted} thiết bị chưa đếm sẽ được giữ nguyên.` : ""}`)) return
    setBusy(true); setError("")
    try { await saveAudit(current.id, payload()); setCurrent(await finishAudit(current.id)); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  const cancel = async () => {
    if (!current || !confirm("Hủy đợt kiểm kê này? Số đã nhập sẽ mất.")) return
    try { await cancelAudit(current.id); setCurrent(null); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  // Quét nhãn QR (hoặc gõ mã) từng thiết bị: mỗi lần quét đếm thêm 1 thiết bị tốt đang có mặt
  const onScan = (ev: React.FormEvent) => {
    ev.preventDefault(); if (!current) return
    const raw = scan.trim(); if (!raw) return
    const id = decodeURIComponent(raw.split("#").pop()!.split("/").pop() || "")
    const it = current.items.find((x) => x.equipmentId === id)
    setScan("")
    if (!it) { setScanMsg(""); setError(`Mã “${id}” không thuộc đợt kiểm kê này`); return }
    setError(""); const n = (it.countGood ?? 0) + 1
    setCurrent({ ...current, items: current.items.map((x) => (x.equipmentId === id ? { ...x, countGood: n } : x)) })
    setScanMsg(`${it.name}: đã đếm ${n}`)
  }
  const fillBook = () => current && setCurrent({ ...current, items: current.items.map((i) => (i.countGood === null ? { ...i, countGood: Math.max(0, i.sysGood - i.out), countBroken: i.sysBroken } : i)) })
  const exportAudit = (a: Audit) => exportExcel(`Bien-ban-kiem-ke-${(a.finishedAt || a.createdAt).slice(0, 10)}.xlsx`, [{
    name: "Biên bản kiểm kê",
    rows: a.items.map((i, n) => ({ "STT": n + 1, "Thiết bị": i.name, "Môn": subjects.find((s) => s.id === i.subjectId)?.name, "Vị trí": i.location,
      "Tốt (sổ)": i.sysGood, "Hỏng (sổ)": i.sysBroken, "Đang cho mượn": i.out, "Phải có trong phòng": i.expected ?? expected(i),
      "Đếm được – tốt": i.countGood ?? "", "Đếm được – hỏng": i.countBroken ?? (i.countGood === null ? "" : i.sysBroken), "Chênh lệch": i.diff ?? diffOf(i) ?? "", "Ghi chú": i.note })),
  }])

  if (current) {
    const done = current.status === "Hoàn tất"
    const items = current.items.filter((i) => !onlyTodo || (done ? !!i.diff : i.countGood === null || !!diffOf(i)))
    const counted = current.items.filter((i) => i.countGood !== null).length
    return (
      <div>
        <Err msg={error} />
        {!done && (
          <form onSubmit={onScan} className={`${card} p-4 mb-4 flex flex-wrap items-center gap-2`}>
            <label htmlFor="au-scan" className="text-sm font-semibold text-gray-700">Quét mã QR thiết bị</label>
            <input id="au-scan" autoComplete="off" className="flex-1 min-w-[220px] border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Quét nhãn (hoặc gõ mã thiết bị) rồi Enter: mỗi lần quét đếm thêm 1" value={scan} onChange={(e) => setScan(e.target.value)} />
            <button type="submit" className={btnGhost}>Đếm thêm 1</button>
            {scanMsg && <span role="status" className="w-full text-sm text-green-700">{scanMsg}</span>}
          </form>
        )}
        <div className={`${card} p-5 mb-4 flex flex-wrap items-center gap-3 justify-between`}>
          <div>
            <h2 className="font-bold text-gray-900">{current.title} {current.subjectId ? `– ${subjects.find((s) => s.id === current.subjectId)?.name}` : "– tất cả môn"}</h2>
            <p className="text-xs text-gray-500">{done ? `Hoàn tất ${fmtTime(current.finishedAt)}` : `Bắt đầu ${fmtTime(current.createdAt)} · đã đếm ${counted}/${current.items.length} thiết bị`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!done && <button onClick={fillBook} className={btnGhost} title="Điền số đếm bằng số sổ sách cho các dòng chưa đếm, sau đó chỉ sửa dòng có chênh lệch">Điền theo sổ sách</button>}
            {!done && <button onClick={save} disabled={busy} className={btnGhost}>Lưu nháp</button>}
            {!done && <button onClick={cancel} className={btnGhost}>Hủy đợt</button>}
            {!done && <button onClick={finish} disabled={busy || counted === 0} className={btnPrimary}>Hoàn tất kiểm kê</button>}
            {done && <button onClick={() => printAuditMinutes(current, subjects)} className={btnPrimary}>In biên bản kiểm kê (Mẫu 6)</button>}
            {done && <button onClick={() => exportAudit(current)} className={btnGhost}>Xuất Excel</button>}
            {done && <button onClick={() => setCurrent(null)} className={btnGhost}>Đóng</button>}
          </div>
        </div>
        {done && current.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[["Đã kiểm", current.summary.counted], ["Có chênh lệch", current.summary.discrepancies], ["Thiếu (chuyển sang mất)", current.summary.missing], ["Thừa (cộng vào tốt)", current.summary.surplus]].map(([l, v]) => (
              <div key={String(l)} className="border border-gray-200 bg-white rounded-xl px-4 py-3"><div className="text-2xl font-bold">{v}</div><div className="text-xs text-gray-500">{l}</div></div>
            ))}
          </div>
        )}
        {!done && <p className="text-xs text-gray-500 mb-2">“Phải có trong phòng” = tốt theo sổ − đang cho mượn + hỏng theo sổ. Nhập số đếm thực tế; ô “hỏng” để trống nghĩa là giữ như sổ. Thiếu sẽ được ghi vào “mất”, thừa được cộng vào “tốt”.</p>}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 mb-2"><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />{done ? "Chỉ hiện dòng có chênh lệch" : "Chỉ hiện dòng chưa đếm hoặc có chênh lệch"}</label>
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">{["Thiết bị", "Tốt (sổ)", "Đang mượn", "Hỏng (sổ)", "Phải có", "Đếm: tốt", "Đếm: hỏng", "Chênh lệch", "Ghi chú"].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((i) => {
                const d = done ? i.diff ?? null : diffOf(i)
                return (
                  <tr key={i.equipmentId} className={d ? (d < 0 ? "bg-rose-50/60" : "bg-amber-50/60") : ""}>
                    <td className="px-3 py-2 min-w-[200px]"><div className="font-medium text-gray-900">{i.name}</div><div className="text-[11px] text-gray-500">{i.location}</div></td>
                    <td className="px-3 py-2 text-gray-600">{i.sysGood}</td>
                    <td className="px-3 py-2 text-gray-600">{i.out}</td>
                    <td className="px-3 py-2 text-gray-600">{i.sysBroken}</td>
                    <td className="px-3 py-2 font-semibold">{i.expected ?? expected(i)}</td>
                    <td className="px-3 py-2 w-24">{done ? i.countGood ?? "–" : <input type="number" min={0} aria-label={`Đếm tốt: ${i.name}`} className={`${field} px-2`} value={i.countGood ?? ""} onChange={(e) => setItem(i.equipmentId, { countGood: numOrNull(e.target.value) })} />}</td>
                    <td className="px-3 py-2 w-24">{done ? i.countBroken ?? "–" : <input type="number" min={0} aria-label={`Đếm hỏng: ${i.name}`} placeholder={String(i.sysBroken)} className={`${field} px-2`} value={i.countBroken ?? ""} onChange={(e) => setItem(i.equipmentId, { countBroken: numOrNull(e.target.value) })} />}</td>
                    <td className={`px-3 py-2 font-bold ${d === null ? "text-gray-300" : d < 0 ? "text-rose-600" : d > 0 ? "text-amber-600" : "text-green-600"}`}>{d === null ? "–" : d > 0 ? `+${d}` : d}</td>
                    <td className="px-3 py-2 min-w-[140px]">{done ? <span className="text-xs text-gray-500">{i.note}</span> : <input aria-label={`Ghi chú: ${i.name}`} className={`${field} px-2`} value={i.note} onChange={(e) => setItem(i.equipmentId, { note: e.target.value })} />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Err msg={error} />
      <div className={`${card} p-5`}>
        <h2 className="font-bold text-gray-900 mb-1">Bắt đầu đợt kiểm kê mới</h2>
        <p className="text-xs text-gray-500 mb-3">Hệ thống chụp lại số liệu sổ sách hiện tại, sau đó bạn nhập số đếm thực tế từng thiết bị. Có thể lưu nháp và làm tiếp sau.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className={label} htmlFor="au-sub">Phạm vi</label>
            <select id="au-sub" className={fieldBase} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Toàn bộ kho</option>{subjects.map((s) => <option key={s.id} value={s.id}>Môn {s.name}</option>)}
            </select>
          </div>
          <button onClick={start} disabled={busy} className={btnPrimary}>Bắt đầu kiểm kê</button>
        </div>
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Các đợt kiểm kê</h2></div>
        {list === null ? <p className="p-6 text-sm text-gray-500">Đang tải…</p> : list.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Chưa có đợt kiểm kê nào</p> : (
          <ul className="divide-y divide-gray-50">
            {list.map((a) => (
              <li key={a.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-gray-900">{a.title} <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${a.status === "Hoàn tất" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{a.status}</span></div>
                  <div className="text-xs text-gray-500">{a.subjectId ? subjects.find((s) => s.id === a.subjectId)?.name : "Toàn bộ kho"} · {a.countedCount}/{a.itemCount} thiết bị · {a.createdBy} · {fmtTime(a.finishedAt || a.createdAt)}
                    {a.summary && ` · thiếu ${a.summary.missing}, thừa ${a.summary.surplus}`}</div>
                </div>
                <button onClick={async () => setCurrent(await fetchAudit(a.id))} className={btnGhost}>{a.status === "Hoàn tất" ? "Xem biên bản" : "Tiếp tục"}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ===================================================================
// BẢO TRÌ / BẢO DƯỠNG
// ===================================================================
export function MaintenanceTab({ subjects }: { subjects: Subject[] }) {
  const [inventory, setInventory] = useState<Equipment[]>([])
  const [list, setList] = useState<Maintenance[] | null>(null)
  const [f, setF] = useState({ equipmentId: "", quantity: 1, source: "broken", kind: "Sửa chữa", content: "", vendor: "", date: todayIso() })
  const [done, setDone] = useState<Maintenance | null>(null)
  const [res, setRes] = useState({ repaired: 0, disposed: 0, cost: 0, note: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    fetchInventory().then(setInventory).catch(() => {})
    fetchMaintenance().then(setList).catch((e) => setError(e.message))
  }, [])
  useEffect(() => { load() }, [load])
  const eq = inventory.find((e) => e.id === f.equipmentId)
  const maxQty = eq ? (f.source === "good" ? eq.qtyGood : eq.qtyBroken) : 0
  const [issues, setIssues] = useState<EquipmentIssue[]>([])
  const loadIssues = useCallback(() => { fetchIssues().then(setIssues).catch(() => {}) }, [])
  useEffect(() => { loadIssues() }, [loadIssues])
  const resolve = async (i: EquipmentIssue, accept: boolean) => {
    const note = accept ? "" : prompt("Lý do không xác nhận:", "") ?? ""
    if (!accept && !note) return
    setError(""); try { await resolveIssue(i.id, accept, note); loadIssues(); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const pendingIssues = issues.filter((i) => i.status === "Chờ xử lý")

  const create = async () => {
    setBusy(true); setError("")
    try { await createMaintenance({ ...f, date: isoToVn(f.date) }); setF({ ...f, equipmentId: "", quantity: 1, content: "", vendor: "" }); load() }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  const complete = async () => {
    if (!done) return
    setBusy(true); setError("")
    try { await completeMaintenance(done.id, res); setDone(null); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  const running = (list || []).filter((m) => m.status === "Đang thực hiện")
  const finished = (list || []).filter((m) => m.status === "Hoàn thành")
  const totalCost = finished.reduce((s, m) => s + (m.cost || 0), 0)
  const broken = inventory.filter((e) => e.qtyBroken > 0)

  return (
    <div className="space-y-5">
    {pendingIssues.length > 0 && (
      <section className={`${card} overflow-hidden border-amber-200`}>
        <div className="px-5 py-3.5 border-b border-gray-100 bg-amber-50"><h2 className="font-semibold text-gray-900">Báo hỏng chờ xử lý ({pendingIssues.length})</h2><p className="text-xs text-gray-600">Giáo viên báo qua mã QR thiết bị. Xác nhận thì thiết bị chuyển sang “hỏng” (không cho mượn); sau đó gửi sửa hoặc thanh lý.</p></div>
        <ul className="divide-y divide-gray-50">{pendingIssues.map((i) => (
          <li key={i.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0"><div className="font-medium text-gray-900">{i.name} × {i.quantity}</div><div className="text-xs text-gray-500">{i.reporterName} · {fmtTime(i.createdAt)} · {i.note}</div></div>
            <div className="flex gap-2"><button onClick={() => resolve(i, false)} className={btnGhost}>Không xác nhận</button><button onClick={() => resolve(i, true)} className={btnPrimary}>Xác nhận hỏng</button></div>
          </li>
        ))}</ul>
      </section>
    )}
    <div className="grid lg:grid-cols-5 gap-5 items-start">
      <div className={`lg:col-span-2 ${card} p-5`}>
        <h2 className="font-bold text-gray-900 mb-1">Gửi bảo trì / bảo dưỡng</h2>
        <p className="text-xs text-gray-500 mb-4">Thiết bị gửi đi chuyển sang trạng thái “đang sửa”, không cho mượn được cho đến khi hoàn thành.</p>
        <Err msg={error} />
        {broken.length > 0 && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">Đang có {broken.reduce((s, e) => s + e.qtyBroken, 0)} thiết bị hỏng chờ xử lý ({broken.length} loại).</p>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label} htmlFor="m-kind">Loại công việc</label><select id="m-kind" className={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, source: e.target.value === "Bảo dưỡng" ? "good" : "broken" })}><option>Sửa chữa</option><option>Bảo dưỡng</option></select></div>
            <div><label className={label} htmlFor="m-date">Ngày gửi</label><input id="m-date" type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          </div>
          <div><label className={label} htmlFor="m-eq">Thiết bị *</label>
            <select id="m-eq" className={field} value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>
              <option value="">Chọn thiết bị…</option>
              {subjects.map((s) => (
                <optgroup key={s.id} label={s.name}>{inventory.filter((e) => e.subjectId === s.id).map((e) => <option key={e.id} value={e.id}>{e.name} (tốt {e.qtyGood}, hỏng {e.qtyBroken})</option>)}</optgroup>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={label}>Lấy từ nhóm</span>
              <div className="flex gap-3 text-sm pt-1.5">
                <label className="flex items-center gap-1"><input type="radio" checked={f.source === "broken"} onChange={() => setF({ ...f, source: "broken" })} />Đang hỏng</label>
                <label className="flex items-center gap-1"><input type="radio" checked={f.source === "good"} onChange={() => setF({ ...f, source: "good" })} />Đang tốt</label>
              </div>
            </div>
            <div><label className={label} htmlFor="m-qty">Số lượng {eq && `(tối đa ${maxQty})`}</label><input id="m-qty" type="number" min={1} max={maxQty || undefined} className={field} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></div>
          </div>
          <div><label className={label} htmlFor="m-content">Nội dung</label><input id="m-content" className={field} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="VD: thay bóng đèn, hiệu chỉnh vạch chia" /></div>
          <div><label className={label} htmlFor="m-vendor">Đơn vị thực hiện</label><input id="m-vendor" className={field} value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="VD: Tổ Vật lí / Công ty…" /></div>
        </div>
        <div className="flex justify-end mt-4"><button onClick={create} disabled={busy || !f.equipmentId || f.quantity > maxQty} className={btnPrimary}>Gửi bảo trì</button></div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <div className={`${card} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Đang thực hiện ({running.length})</h2></div>
          {running.length === 0 ? <p className="p-6 text-center text-sm text-gray-500">Không có thiết bị nào đang bảo trì</p> : (
            <ul className="divide-y divide-gray-50">
              {running.map((m) => (
                <li key={m.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div><div className="font-medium text-gray-900">{m.name} × {m.quantity}</div><div className="text-xs text-gray-500">{m.kind} · gửi {m.date}{m.vendor ? ` · ${m.vendor}` : ""}{m.content ? ` · ${m.content}` : ""}</div></div>
                  <button onClick={() => { setDone(m); setRes({ repaired: m.quantity, disposed: 0, cost: 0, note: "" }) }} className={btnPrimary}>Hoàn thành</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${card} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between"><h2 className="font-bold text-gray-900">Đã hoàn thành</h2><span className="text-sm text-gray-500">Tổng chi phí: <strong className="text-gray-800">{money(totalCost)}</strong></span></div>
          {finished.length === 0 ? <p className="p-6 text-center text-sm text-gray-500">Chưa có</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gray-50">{["Thiết bị", "Loại", "Gửi", "Xong", "Sửa được", "Thanh lý", "Chi phí", ""].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{finished.map((m) => (
                <tr key={m.id}><td className="px-3 py-2 font-medium">{m.name}{m.resultNote && <div className="text-[11px] text-gray-500">{m.resultNote}</div>}</td><td className="px-3 py-2 text-gray-600">{m.kind}</td><td className="px-3 py-2 text-xs text-gray-600">{m.date}</td><td className="px-3 py-2 text-xs text-gray-600">{m.finishedOn}</td>
                  <td className="px-3 py-2 text-green-700 font-semibold">{m.repaired}</td><td className={`px-3 py-2 ${m.disposed ? "text-rose-600 font-semibold" : "text-gray-500"}`}>{m.disposed}</td><td className="px-3 py-2 whitespace-nowrap">{money(m.cost)}</td><td className="px-3 py-2"><button onClick={() => printDamageMinutes(m, inventory.find((e) => e.id === m.equipmentId))} className="text-xs font-semibold text-[#1a3670] hover:underline whitespace-nowrap">In biên bản</button></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>

      {done && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setDone(null) }}>
          <div role="dialog" aria-modal="true" aria-label="Hoàn thành bảo trì" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
            <h2 className="font-bold text-gray-900 mb-1">Hoàn thành: {done.name} × {done.quantity}</h2>
            <p className="text-xs text-gray-500 mb-4">Thiết bị sửa được quay về nhóm “tốt”; không sửa được thì ghi thanh lý (rời khỏi kho).</p>
            <Err msg={error} />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><label className={label} htmlFor="c-rep">Sửa được</label><input id="c-rep" type="number" min={0} max={done.quantity} className={field} value={res.repaired} onChange={(e) => { const v = Math.min(done.quantity, Math.max(0, Math.floor(Number(e.target.value) || 0))); setRes({ ...res, repaired: v, disposed: done.quantity - v }) }} /></div>
              <div><label className={label} htmlFor="c-dis">Thanh lý</label><input id="c-dis" type="number" min={0} max={done.quantity} className={field} value={res.disposed} onChange={(e) => { const v = Math.min(done.quantity, Math.max(0, Math.floor(Number(e.target.value) || 0))); setRes({ ...res, disposed: v, repaired: done.quantity - v }) }} /></div>
              <div><label className={label} htmlFor="c-cost">Chi phí (đ)</label><input id="c-cost" type="number" min={0} className={field} value={res.cost} onChange={(e) => setRes({ ...res, cost: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></div>
            </div>
            <div className="mb-4"><label className={label} htmlFor="c-note">Kết quả / ghi chú</label><input id="c-note" className={field} value={res.note} onChange={(e) => setRes({ ...res, note: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><button onClick={() => setDone(null)} className={btnGhost}>Hủy</button><button onClick={complete} disabled={busy} className={btnPrimary}>Lưu</button></div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

// ===================================================================
// BÁO CÁO TỔNG HỢP
// ===================================================================
function presets() {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth()
  const iso = (d: Date) => d.toLocaleDateString("sv-SE")
  const syStart = m >= 8 ? y : y - 1
  return [
    { k: "month", l: "Tháng này", from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    { k: "hk1", l: "Học kỳ I", from: `${syStart}-09-01`, to: `${syStart + 1}-01-15` },
    { k: "hk2", l: "Học kỳ II", from: `${syStart + 1}-01-16`, to: `${syStart + 1}-05-31` },
    { k: "year", l: `Năm học ${syStart}–${syStart + 1}`, from: `${syStart}-09-01`, to: `${syStart + 1}-08-31` },
  ]
}

export function ReportsTab() {
  const ps = useMemo(presets, [])
  const [from, setFrom] = useState(ps[3].from)
  const [to, setTo] = useState(ps[3].to)
  const [r, setR] = useState<Report | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setBusy(true); setError("")
    try { setR(await fetchReport(isoToVn(from), isoToVn(to))) } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }, [from, to])
  useEffect(() => { load() }, [load])

  const doExport = () => r && exportExcel(`Bao-cao-thiet-bi_${r.from.replace(/\//g, "-")}_${r.to.replace(/\//g, "-")}.xlsx`, [
    { name: "Tổng hợp", rows: [
      { "Chỉ tiêu": "Kỳ báo cáo", "Giá trị": `${r.from} – ${r.to}` },
      { "Chỉ tiêu": "Tổng số phiếu mượn", "Giá trị": r.summary.records },
      { "Chỉ tiêu": "Chờ duyệt / Đang mượn / Đã trả / Từ chối", "Giá trị": `${r.summary.pending} / ${r.summary.borrowing} / ${r.summary.returned} / ${r.summary.rejected}` },
      { "Chỉ tiêu": "Số giáo viên mượn", "Giá trị": r.summary.teachers },
      { "Chỉ tiêu": "Số lần trả trễ", "Giá trị": r.summary.lateReturns },
      { "Chỉ tiêu": "Đang quá hạn (thời điểm xuất)", "Giá trị": r.summary.overdueNow },
      { "Chỉ tiêu": "Thiết bị hỏng / mất khi trả", "Giá trị": `${r.summary.damaged} / ${r.summary.lost}` },
      { "Chỉ tiêu": "Giá trị bồi thường (đ)", "Giá trị": r.summary.compensation },
      { "Chỉ tiêu": "Chi mua mới (đ)", "Giá trị": r.summary.purchaseTotal },
      { "Chỉ tiêu": "Chi bảo trì (đ)", "Giá trị": r.summary.maintenanceCost },
      { "Chỉ tiêu": "Giá trị tài sản hiện tại (đ)", "Giá trị": r.summary.inventoryValue },
    ] },
    { name: "Theo môn", rows: r.bySubject.map((s: Report) => ({ "Môn": s.name, "Số phiếu": s.count, "Tổng số lượng": s.quantity, "Bị từ chối": s.rejected })) },
    { name: "Theo thiết bị", rows: r.byEquipment.map((e: Report, i: number) => ({ "Hạng": i + 1, "Thiết bị": e.name, "Số lượt mượn": e.times, "Tổng số lượng": e.quantity })) },
    { name: "Chưa được mượn", rows: r.unusedEquipment.map((e: Report) => ({ "Thiết bị": e.name, "Môn": e.subject })) },
    { name: "Tiết thực hành – biểu diễn", rows: r.usageBySubject.map((u: Report) => ({ "Tổ bộ môn": u.group, "Môn": u.name, "Số tiết thực hành": u.practice, "Số tiết biểu diễn": u.demo, "Tổng": u.practice + u.demo })) },
    { name: "Theo giáo viên", rows: r.byTeacher.map((t: Report) => ({ "Giáo viên": t.teacherName, "Số phiếu": t.count, "Trả trễ": t.late, "Làm hỏng": t.damaged, "Làm mất": t.lost })) },
    { name: "Danh sách phiếu", rows: r.records.map((x: Report) => ({ "Ngày mượn": x.borrowDate, "Ngày trả": x.returnDate, "Giáo viên": x.teacherName, "Lớp": x.className, "Môn": x.subject, "Tiết": x.period, "Thiết bị": x.equipment, "Số lượng": x.quantity, "Trạng thái": x.status, "Trễ (ngày)": x.lateDays, "Hỏng": x.damaged, "Mất": x.lost })) },
    { name: "Kho hiện tại", rows: r.inventory.map((e: Report) => ({ "Thiết bị": e.name, "Môn": e.subject, "Tốt": e.good, "Hỏng": e.broken, "Đang sửa": e.repair, "Mất": e.lost, "Đã thanh lý": e.disposed, "Đơn giá (đ)": e.unitPrice, "Thành tiền (đ)": (e.good + e.broken + e.repair) * e.unitPrice, "Vị trí": e.location })) },
    { name: "Nhập kho", rows: r.purchases.flatMap((p: Report) => p.items.map((it: Report) => ({ "Ngày": p.date, "Nhà cung cấp": p.supplier, "Thiết bị": it.name, "Số lượng": it.quantity, "Đơn giá (đ)": it.unitPrice, "Thành tiền (đ)": it.amount, "Người lập": p.createdBy }))) },
    { name: "Bảo trì", rows: r.maintenance.map((m: Report) => ({ "Ngày gửi": m.date, "Thiết bị": m.name, "Số lượng": m.quantity, "Loại": m.kind, "Nội dung": m.content, "Đơn vị": m.vendor, "Trạng thái": m.status, "Sửa được": m.repaired ?? "", "Thanh lý": m.disposed ?? "", "Chi phí (đ)": m.cost })) },
  ])

  const maxSubj = r ? Math.max(1, ...r.bySubject.map((s: Report) => s.count)) : 1
  return (
    <div className="space-y-4">
      <div className={`${card} p-5 flex flex-wrap items-end gap-3`}>
        <div className="flex flex-wrap gap-2">{ps.map((p) => (
          <button key={p.k} onClick={() => { setFrom(p.from); setTo(p.to) }} aria-pressed={from === p.from && to === p.to} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${from === p.from && to === p.to ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{p.l}</button>
        ))}</div>
        <div><label className={label} htmlFor="r-from">Từ ngày</label><input id="r-from" type="date" className={fieldBase} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className={label} htmlFor="r-to">Đến ngày</label><input id="r-to" type="date" className={fieldBase} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button onClick={doExport} disabled={!r || busy} className={`${btnPrimary} ml-auto`}>Xuất Excel</button>
      </div>
      <Err msg={error} />
      {!r ? <p className="text-sm text-gray-500">Đang tải…</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Phiếu mượn", r.summary.records, `${r.summary.teachers} giáo viên`],
              ["Trả trễ", r.summary.lateReturns, `đang quá hạn: ${r.summary.overdueNow}`],
              ["Hỏng / mất khi trả", `${r.summary.damaged} / ${r.summary.lost}`, `bồi thường ${money(r.summary.compensation)}`],
              ["Chi phí", money(r.summary.purchaseTotal + r.summary.maintenanceCost), `mua mới ${money(r.summary.purchaseTotal)} · bảo trì ${money(r.summary.maintenanceCost)}`],
            ].map(([l, v, sub]) => (
              <div key={String(l)} className="bg-white border border-gray-200 rounded-xl px-4 py-3"><div className="text-xs text-gray-500">{l}</div><div className="text-2xl font-bold text-gray-900 truncate">{v}</div><div className="text-[11px] text-gray-500 truncate" title={String(sub)}>{sub}</div></div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className={`${card} p-5`}>
              <h2 className="font-bold text-gray-900 mb-3">Lượt mượn theo môn</h2>
              <div className="space-y-2">{r.bySubject.map((s: Report) => (
                <div key={s.subjectId} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-gray-700">{s.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden"><div className="h-3 bg-[#1a3670] rounded-full" style={{ width: `${(s.count / maxSubj) * 100}%` }} /></div>
                  <span className="w-8 text-right font-semibold">{s.count}</span>
                </div>
              ))}</div>
            </div>
            <div className={`${card} p-5`}>
              <h2 className="font-bold text-gray-900 mb-3">Thiết bị được mượn nhiều nhất</h2>
              {r.byEquipment.length === 0 ? <p className="text-sm text-gray-500">Chưa có dữ liệu (phiếu nhập tay không có mã thiết bị: {r.manualRecords})</p> : (
                <ol className="space-y-1.5 text-sm">{r.byEquipment.slice(0, 8).map((e: Report, i: number) => (
                  <li key={e.equipmentId} className="flex justify-between gap-3"><span className="text-gray-700"><span className="text-gray-500 mr-2">{i + 1}.</span>{e.name}</span><span className="font-semibold whitespace-nowrap">{e.times} lượt</span></li>
                ))}</ol>
              )}
              <p className="text-xs text-gray-500 mt-3">{r.unusedEquipment.length} loại thiết bị chưa được mượn lần nào trong kỳ (xem trong file Excel).</p>
            </div>
          </div>
          <div className={`${card} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Số tiết sử dụng thiết bị: thực hành và biểu diễn</h2></div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gray-50">{["Tổ bộ môn", "Môn", "Thực hành", "Biểu diễn", "Tổng"].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{(r.usageBySubject || []).map((u: Report) => <tr key={u.subjectId}><td className="px-3 py-2 text-xs text-gray-500">{u.group}</td><td className="px-3 py-2">{u.name}</td><td className="px-3 py-2 font-semibold">{u.practice}</td><td className="px-3 py-2">{u.demo}</td><td className="px-3 py-2 font-semibold">{u.practice + u.demo}</td></tr>)}</tbody>
            </table></div>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className={`${card} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Theo giáo viên</h2></div>
              <div className="overflow-x-auto max-h-80"><table className="w-full text-sm">
                <thead className="sticky top-0"><tr className="bg-gray-50">{["Giáo viên", "Phiếu", "Trễ", "Hỏng", "Mất"].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">{r.byTeacher.map((t: Report) => <tr key={t.teacherName}><td className="px-3 py-2">{t.teacherName}</td><td className="px-3 py-2">{t.count}</td><td className={`px-3 py-2 ${t.late ? "text-rose-600 font-semibold" : "text-gray-500"}`}>{t.late}</td><td className="px-3 py-2">{t.damaged}</td><td className="px-3 py-2">{t.lost}</td></tr>)}</tbody>
              </table></div>
            </div>
            <div className={`${card} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-gray-100 flex justify-between"><h2 className="font-bold text-gray-900">Tình trạng kho hiện tại</h2><span className="text-sm text-gray-500">{money(r.summary.inventoryValue)}</span></div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="bg-gray-50">{["Môn", "Tốt", "Hỏng", "Sửa", "Mất", "Giá trị"].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">{r.invBySubject.map((s: Report) => <tr key={s.subjectId}><td className="px-3 py-2">{s.name}</td><td className="px-3 py-2 text-green-700">{s.good}</td><td className="px-3 py-2">{s.broken}</td><td className="px-3 py-2">{s.repair}</td><td className="px-3 py-2">{s.lost}</td><td className="px-3 py-2 whitespace-nowrap text-xs">{money(s.value)}</td></tr>)}</tbody>
              </table></div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ===================================================================
// NHÃN QR
// ===================================================================
export async function printQrLabels(items: Equipment[], subjects: Subject[]) {
  const QR = await import("qrcode")
  const base = `${window.location.origin}${window.location.pathname}#thiet-bi/`
  const cells = await Promise.all(items.map(async (e) => {
    const img = await QR.toDataURL(base + encodeURIComponent(e.id), { margin: 1, width: 220, errorCorrectionLevel: "M" })
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
    return `<div class="l"><img src="${img}" alt=""><div><b>${esc(e.name)}</b><span>${esc(subjects.find((s) => s.id === e.subjectId)?.name || "")}${e.location ? " · " + esc(e.location) : ""}</span><code>${esc(e.id)}</code></div></div>`
  }))
  const w = window.open("", "_blank")
  if (!w) { alert("Trình duyệt chặn cửa sổ mới. Hãy cho phép pop-up để in nhãn."); return }
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Nhãn QR thiết bị</title><style>
    body{font-family:Arial,sans-serif;margin:12mm}h1{font-size:14px;margin:0 0 8px}p{font-size:11px;color:#555;margin:0 0 12px}
    .g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.l{display:flex;gap:3mm;align-items:center;border:1px dashed #999;border-radius:2mm;padding:2.5mm;break-inside:avoid}
    .l img{width:24mm;height:24mm}.l b{display:block;font-size:10.5px;line-height:1.25}.l span{display:block;font-size:9px;color:#444;margin-top:1mm}.l code{display:block;font-size:8px;color:#888;margin-top:1mm}
    @media print{h1,p,button{display:none}body{margin:8mm}}</style></head><body>
    <h1>Nhãn QR thiết bị – Trường THCS Lê Độ (${items.length} nhãn)</h1><p>In ra giấy, cắt theo đường nét đứt và dán lên thiết bị/tủ. Quét bằng camera điện thoại để mở thông tin thiết bị.</p>
    <button onclick="window.print()">In nhãn</button><div class="g">${cells.join("")}</div></body></html>`)
  w.document.close()
}

// ===================================================================
// TRANG CHI TIẾT THIẾT BỊ (mở khi quét QR)
// ===================================================================
type Detail = Awaited<ReturnType<typeof fetchEquipmentDetail>>
export function EquipmentPage({ id, isAdmin, loggedIn, login, onBorrow, goHome }: { id: string; isAdmin: boolean; loggedIn: boolean; login: () => void; onBorrow: (d: BorrowDraft) => void; goHome: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState("")
  const [mine, setMine] = useState<EquipmentIssue[]>([])
  const [rep, setRep] = useState({ open: false, quantity: 1, note: "" })
  const [repMsg, setRepMsg] = useState("")
  const loadMine = useCallback(() => { fetchMyIssues().then((l) => setMine(l.filter((i) => i.equipmentId === id))).catch(() => {}) }, [id])
  useEffect(() => { if (loggedIn) { fetchEquipmentDetail(id).then(setD).catch((e) => setError(e.message)); loadMine() } }, [id, loggedIn, loadMine])
  const sendIssue = async () => {
    setRepMsg(""); setError("")
    try { await reportIssue(id, rep.quantity, rep.note); setRep({ open: false, quantity: 1, note: "" }); setRepMsg("Đã gửi báo hỏng. Nhân viên thiết bị sẽ kiểm tra và xác nhận."); loadMine() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }

  const wrap = (children: React.ReactNode) => <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10"><div className="max-w-2xl mx-auto">{children}</div></main>
  if (!loggedIn) return wrap(<div className="text-center py-16"><h1 className="text-xl font-bold text-gray-900 mb-2">Đăng nhập để xem thông tin thiết bị</h1><button onClick={login} className={btnPrimary}>Đăng nhập bằng Google</button></div>)
  if (error) return wrap(<div className="text-center py-16"><p className="text-gray-600 mb-3">{error}</p><button onClick={goHome} className={btnGhost}>Về trang chủ</button></div>)
  if (!d) return wrap(<p className="text-sm text-gray-500">Đang tải…</p>)
  const e = d.equipment
  return wrap(
    <>
      <div className={`${card} p-5 mb-4`}>
        <div className="text-xs text-gray-500 mb-1">{d.subjectName}{e.grades?.length ? ` · lớp ${e.grades.join(", ")}` : ""}</div>
        <h1 className="text-xl font-extrabold text-[#1a3670] mb-2">{e.name}</h1>
        <p className="text-sm text-gray-600 mb-4">Vị trí: {e.location || "chưa ghi"}</p>
        <div className="grid grid-cols-4 gap-2 text-center mb-4">
          {[["Tốt", e.qtyGood, "text-green-700"], ["Hỏng", e.qtyBroken, "text-amber-700"], ["Đang sửa", e.qtyRepair, "text-amber-700"], ["Mất", e.qtyLost, "text-rose-700"]].map(([l, v, c]) => (
            <div key={String(l)} className="bg-gray-50 rounded-xl py-2"><div className={`text-xl font-bold ${c}`}>{v}</div><div className="text-[11px] text-gray-500">{l}</div></div>
          ))}
        </div>
        <div className="text-xs font-semibold text-gray-600 mb-2">Còn trống 7 ngày tới</div>
        <div className="grid grid-cols-7 gap-1 mb-4">{d.days.map((x) => (
          <div key={x.date} className={`rounded-lg py-1.5 text-center ${x.available ? "bg-green-50 text-green-800" : "bg-rose-50 text-rose-700"}`}><div className="text-[10px]">{x.date.slice(0, 5)}</div><div className="font-bold">{x.available}</div></div>
        ))}</div>
        <button className={`${btnPrimary} w-full`} onClick={() => onBorrow({ subjectId: e.subjectId, subjectName: d.subjectName, teacherName: "", className: "", equipment: `${e.name} (x1)`, items: [{ equipmentId: e.id, quantity: 1 }], borrowDate: "", returnDate: "", period: "", periodPPCT: "", notes: "", missing: [] })}>
          Đăng ký mượn thiết bị này
        </button>
      </div>
      <div className={`${card} p-5 mb-4`}>
        <h2 className="font-bold text-gray-900 mb-1">Phát hiện thiết bị hỏng?</h2>
        <p className="text-xs text-gray-500 mb-3">Báo ngay để phòng thiết bị kiểm tra, không cho mượn nhầm thiết bị hỏng.</p>
        {repMsg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-3">{repMsg}</div>}
        {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{error}</div>}
        {rep.open ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2"><div><label htmlFor="iss-q" className="block text-xs font-semibold text-gray-600 mb-1">Số lượng hỏng</label><input id="iss-q" type="number" min={1} max={e.qtyGood} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={rep.quantity} onChange={(x) => setRep({ ...rep, quantity: Math.max(1, Math.floor(Number(x.target.value) || 1)) })} /></div>
              <div className="col-span-2"><label htmlFor="iss-n" className="block text-xs font-semibold text-gray-600 mb-1">Tình trạng hỏng *</label><input id="iss-n" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="VD: vỡ ống, gãy chân đế" value={rep.note} onChange={(x) => setRep({ ...rep, note: x.target.value })} /></div></div>
            <div className="flex gap-2 justify-end"><button onClick={() => setRep({ ...rep, open: false })} className={btnGhost}>Hủy</button><button disabled={!rep.note.trim()} onClick={sendIssue} className={btnPrimary}>Gửi báo hỏng</button></div>
          </div>
        ) : <button onClick={() => setRep({ ...rep, open: true })} disabled={e.qtyGood < 1} className={btnGhost}>Báo thiết bị hỏng</button>}
        {mine.length > 0 && <ul className="mt-3 divide-y divide-gray-100 text-sm">{mine.slice(0, 5).map((i) => <li key={i.id} className="py-1.5 flex justify-between gap-2"><span>{i.quantity} cái: {i.note}</span><span className={`text-xs font-semibold whitespace-nowrap ${i.status === "Đã xác nhận" ? "text-green-700" : i.status === "Không xác nhận" ? "text-gray-500" : "text-amber-700"}`}>{i.status}</span></li>)}</ul>}
      </div>
      {isAdmin && d.history && (
        <div className={`${card} p-5 mb-4`}>
          <h2 className="font-bold text-gray-900 mb-2">Lịch sử mượn gần đây</h2>
          {d.history.length === 0 ? <p className="text-sm text-gray-500">Chưa có</p> : <ul className="text-sm divide-y divide-gray-50">{d.history.map((h) => <li key={h.id} className="py-1.5 flex justify-between gap-2"><span>{h.teacherName} · {h.className} · ×{h.quantity}</span><span className="text-gray-500 text-xs whitespace-nowrap">{h.borrowDate} · {h.status}</span></li>)}</ul>}
          {!!d.maintenance?.length && (<><h2 className="font-bold text-gray-900 mt-4 mb-2">Bảo trì</h2><ul className="text-sm divide-y divide-gray-50">{d.maintenance.map((m) => <li key={m.id} className="py-1.5 flex justify-between gap-2"><span>{m.kind} ×{m.quantity}{m.content ? ` · ${m.content}` : ""}</span><span className="text-gray-500 text-xs whitespace-nowrap">{m.date} · {m.status}</span></li>)}</ul></>)}
        </div>
      )}
    </>,
  )
}

// ===================================================================
// TỔNG QUAN (bảng điều khiển)
// ===================================================================
const parseVnDate = (d: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ""); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }

export function Dashboard({ go }: { go: (section: string) => void }) {
  const [rep, setRep] = useState<Report | null>(null)
  const [records, setRecords] = useState<BorrowRecord[]>([])
  const [inv, setInv] = useState<Equipment[]>([])
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [running, setRunning] = useState(0)
  const [lossPending, setLossPending] = useState(0)
  const [chemAlerts, setChemAlerts] = useState(0)
  useEffect(() => {
    const p = presets()[3]
    fetchReport(isoToVn(p.from), isoToVn(p.to)).then(setRep).catch(() => {})
    fetchRecords().then(setRecords).catch(() => {})
    fetchInventory().then(setInv).catch(() => {})
    fetchNotifications({ limit: 8 }).then(setNotifs).catch(() => {})
    fetchMaintenance().then((l) => setRunning(l.filter((m) => m.status === "Đang thực hiện").length)).catch(() => {})
    fetchAlerts().then((a) => setChemAlerts(a.expired.length + a.expiringSoon.length + a.lowStock.length)).catch(() => {})
    fetchLossReports().then((r) => setLossPending(r.reports.filter((x) => x.status === "Chờ xác nhận").reduce((a, x) => a + x.quantity, 0))).catch(() => {})
  }, [])
  const t0 = new Date(); t0.setHours(0, 0, 0, 0)
  const pending = records.filter((r) => r.status === "Chờ duyệt").sort((a, b) => (parseVnDate(a.borrowDate)?.getTime() || 0) - (parseVnDate(b.borrowDate)?.getTime() || 0))
  const overdue = records.filter((r) => r.status === "Mượn" && (parseVnDate(r.returnDate)?.getTime() ?? Infinity) < t0.getTime())
  const todayOut = records.filter((r) => r.status === "Mượn" && parseVnDate(r.borrowDate)?.getTime() === t0.getTime())
  const broken = inv.reduce((s, e) => s + e.qtyBroken, 0)
  const value = inv.reduce((s, e) => s + (e.qtyGood + e.qtyBroken + e.qtyRepair) * (e.unitPrice || 0), 0)
  const kpis: [string, string | number, string, string][] = [
    ["Chờ duyệt", pending.length, "bg-amber-50 border-amber-200 text-amber-800", "muon-tra"],
    ["Quá hạn trả", overdue.length, "bg-rose-50 border-rose-200 text-rose-800", "muon-tra"],
    ["Đang cho mượn", records.filter((r) => r.status === "Mượn").length, "bg-blue-50 border-blue-200 text-blue-800", "muon-tra"],
    ["Thiết bị hỏng chờ xử lý", broken, "bg-orange-50 border-orange-200 text-orange-800", "bao-tri"],
    ["Đang bảo trì", running, "bg-violet-50 border-violet-200 text-violet-800", "bao-tri"],
    ["Báo mất chờ xác nhận", lossPending, "bg-red-50 border-red-200 text-red-800", "xac-nhan-mat"],
    ["Cảnh báo hóa chất, vật tư", chemAlerts, "bg-yellow-50 border-yellow-200 text-yellow-900", "hoa-chat"],
    ["Giá trị tài sản", money(value), "bg-emerald-50 border-emerald-200 text-emerald-800", "danh-muc"],
  ]
  const months = rep?.byMonth || []
  const maxM = Math.max(1, ...months.map((m: Report) => m.count))
  const task = (r: BorrowRecord, extra: string) => (
    <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0"><span className="font-medium text-gray-900">{r.teacherName}</span> <span className="text-gray-500">· {r.className} · {r.subjectName}</span><span className="block text-xs text-gray-500 truncate">{r.equipment}</span></span>
      <span className="text-xs whitespace-nowrap text-gray-600">{extra}</span>
    </li>
  )
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3">
        {kpis.map(([l, v, c, s]) => (
          <button key={l} onClick={() => go(s)} className={`text-left border rounded-xl px-4 py-3 hover:shadow-md transition-shadow ${c}`}>
            <div className="text-2xl font-bold truncate">{v}</div><div className="text-xs opacity-80">{l}</div>
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${card} p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900">Việc cần làm</h2><button onClick={() => go("muon-tra")} className="text-xs font-semibold text-[#1a3670] hover:underline">Mở Mượn – trả</button></div>
          {pending.length + overdue.length + todayOut.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">Không có việc tồn đọng</p> : (
            <div className="grid md:grid-cols-2 gap-4">
              <div><div className="text-xs font-bold text-amber-700 uppercase mb-1">Chờ duyệt ({pending.length})</div><ul className="divide-y divide-gray-50">{pending.slice(0, 5).map((r) => task(r, `mượn ${r.borrowDate}`))}</ul></div>
              <div><div className="text-xs font-bold text-rose-700 uppercase mb-1">Quá hạn trả ({overdue.length})</div><ul className="divide-y divide-gray-50">{overdue.slice(0, 5).map((r) => task(r, `hạn ${r.returnDate}`))}</ul>
                {todayOut.length > 0 && <><div className="text-xs font-bold text-blue-700 uppercase mt-3 mb-1">Giao trong hôm nay ({todayOut.length})</div><ul className="divide-y divide-gray-50">{todayOut.slice(0, 4).map((r) => task(r, r.period || ""))}</ul></>}
              </div>
            </div>
          )}
        </div>
        <div className={`${card} p-5`}>
          <h2 className="font-bold text-gray-900 mb-3">Hoạt động gần đây</h2>
          {notifs.length === 0 ? <p className="text-sm text-gray-500">Chưa có</p> : (
            <ul className="space-y-2.5">{notifs.map((n) => <li key={n.id} className="text-sm"><div className="font-medium text-gray-800">{n.title}</div><div className="text-xs text-gray-500 truncate" title={n.message}>{n.message}</div><div className="text-[10px] text-gray-500">{fmtTime(n.createdAt)}</div></li>)}</ul>
          )}
        </div>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${card} p-5 lg:col-span-2`}>
          <h2 className="font-bold text-gray-900 mb-3">Lượt mượn theo tháng – năm học {rep?.schoolYear || ""}</h2>
          {months.length === 0 ? <p className="text-sm text-gray-500">Chưa có dữ liệu</p> : (
            <div className="flex items-end gap-3 h-40">{months.map((m: Report) => (
              <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                <span className="text-xs font-semibold text-gray-700 mb-1">{m.count}</span>
                <div className="w-full max-w-12 bg-[#1a3670] rounded-t" style={{ height: `${(m.count / maxM) * 100}%` }} />
                <span className="text-[10px] text-gray-500 mt-1">{m.month.slice(0, 5)}</span>
              </div>
            ))}</div>
          )}
        </div>
        <div className={`${card} p-5`}>
          <h2 className="font-bold text-gray-900 mb-3">Năm học này</h2>
          {rep ? (
            <dl className="text-sm space-y-2">
              {[["Phiếu mượn", rep.summary.records], ["Giáo viên đã mượn", rep.summary.teachers], ["Lần trả trễ", rep.summary.lateReturns], ["Hỏng / mất khi trả", `${rep.summary.damaged} / ${rep.summary.lost}`], ["Chi mua mới", money(rep.summary.purchaseTotal)], ["Chi bảo trì", money(rep.summary.maintenanceCost)], ["Ghi giảm", `${rep.summary.disposedCount || 0} thiết bị`]].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-3"><dt className="text-gray-500">{k}</dt><dd className="font-semibold text-gray-900">{v}</dd></div>
              ))}
            </dl>
          ) : <p className="text-sm text-gray-500">Đang tải…</p>}
        </div>
      </div>
    </div>
  )
}

// ===================================================================
// GHI GIẢM THIẾT BỊ
// ===================================================================
export function DisposalTab({ subjects }: { subjects: Subject[] }) {
  const [inventory, setInventory] = useState<Equipment[]>([])
  const [list, setList] = useState<Disposal[] | null>(null)
  const [f, setF] = useState({ equipmentId: "", quantity: 1, source: "broken", reason: "Thanh lý", decisionNo: "", note: "", date: todayIso() })
  const [error, setError] = useState("")
  const [ok, setOk] = useState("")
  const [busy, setBusy] = useState(false)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  useEffect(() => { fetchCapabilities().then(setCaps).catch(() => {}) }, [])
  // Đã có Ban giám hiệu: nhân viên chỉ lập đề nghị; Ban giám hiệu duyệt (kèm số quyết định) thì mới trừ kho
  const proposeOnly = !!caps?.principalConfigured && !caps.canDecide
  const load = useCallback(() => { fetchInventory().then(setInventory).catch(() => {}); fetchDisposals().then(setList).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const eq = inventory.find((e) => e.id === f.equipmentId)
  const max = eq ? (f.source === "good" ? eq.qtyGood : f.source === "lost" ? eq.qtyLost : eq.qtyBroken) : 0
  const save = async () => {
    setBusy(true); setError(""); setOk("")
    try { const d = await createDisposal({ ...f, date: isoToVn(f.date) }); setOk(d.status === "Chờ duyệt" ? `Đã gửi đề nghị thanh lý ${d.quantity} “${d.name}”. Kho chưa bị trừ cho đến khi Ban giám hiệu duyệt.` : `Đã ghi giảm ${d.quantity} “${d.name}” (${d.reason}).`); setF({ ...f, equipmentId: "", quantity: 1, decisionNo: "", note: "" }); load() }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  const total = (list || []).reduce((s, d) => s + d.value, 0)
  return (
    <div className="grid lg:grid-cols-5 gap-5 items-start">
      <div className={`lg:col-span-2 ${card} p-5`}>
        <h2 className="font-bold text-gray-900 mb-1">{proposeOnly ? "Lập đề nghị thanh lý" : "Lập chứng từ ghi giảm"}</h2>
        <p className="text-xs text-gray-500 mb-4">{proposeOnly ? "Đề nghị được gửi Ban giám hiệu. Ban giám hiệu duyệt và ghi số quyết định thì thiết bị mới rời khỏi số liệu kho." : "Dùng khi thanh lý, xác nhận mất, điều chuyển sang đơn vị khác. Thiết bị ghi giảm rời khỏi số liệu kho."}</p>
        <Err msg={error} />
        {ok && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-3">{ok}</div>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label} htmlFor="d-reason">Lý do</label><select id="d-reason" className={field} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value, source: e.target.value === "Mất" ? "lost" : e.target.value === "Điều chuyển" ? "good" : "broken" })}>{["Thanh lý", "Mất", "Điều chuyển", "Hư hỏng không sửa được", "Khác"].map((r) => <option key={r}>{r}</option>)}</select></div>
            <div><label className={label} htmlFor="d-date">Ngày</label><input id="d-date" type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          </div>
          <div><label className={label} htmlFor="d-eq">Thiết bị *</label>
            <select id="d-eq" className={field} value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>
              <option value="">Chọn thiết bị…</option>
              {subjects.map((s) => <optgroup key={s.id} label={s.name}>{inventory.filter((e) => e.subjectId === s.id).map((e) => <option key={e.id} value={e.id}>{e.name} (tốt {e.qtyGood}, hỏng {e.qtyBroken}, mất {e.qtyLost})</option>)}</optgroup>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label} htmlFor="d-src">Lấy từ nhóm</label><select id="d-src" className={field} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="broken">Đang hỏng</option><option value="lost">Đã ghi mất</option><option value="good">Đang tốt</option></select></div>
            <div><label className={label} htmlFor="d-qty">Số lượng {eq && `(tối đa ${max})`}</label><input id="d-qty" type="number" min={1} className={field} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></div>
          </div>
          <div><label className={label} htmlFor="d-no">Số quyết định / biên bản</label><input id="d-no" className={field} value={f.decisionNo} onChange={(e) => setF({ ...f, decisionNo: e.target.value })} placeholder="VD: 12/QĐ-THCSLĐ" /></div>
          <div><label className={label} htmlFor="d-note">Ghi chú</label><input id="d-note" className={field} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        </div>
        <div className="flex justify-end mt-4"><button onClick={save} disabled={busy || !f.equipmentId || f.quantity > max || (caps?.viewOnlyAdmin ?? false)} className={btnPrimary}>{proposeOnly ? "Gửi đề nghị" : "Ghi giảm"}</button></div>
      </div>
      <div className={`lg:col-span-3 ${card} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between gap-2 flex-wrap"><h2 className="font-bold text-gray-900">Lịch sử ghi giảm</h2>
          <div className="flex items-center gap-3"><span className="text-sm text-gray-500">Giá trị: <strong className="text-gray-800">{money(total)}</strong></span>
            <button disabled={!list?.length} onClick={() => exportExcel("Ghi-giam-thiet-bi.xlsx", [{ name: "Ghi giảm", rows: (list || []).map((d) => ({ "Ngày": d.date, "Thiết bị": d.name, "Số lượng": d.quantity, "Lý do": d.reason, "Số QĐ/BB": d.decisionNo, "Đơn giá (đ)": d.unitPrice, "Giá trị (đ)": d.value, "Ghi chú": d.note, "Người lập": d.createdBy })) }])} className={btnGhost}>Xuất Excel</button></div>
        </div>
        {list === null ? <p className="p-6 text-sm text-gray-500">Đang tải…</p> : list.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Chưa có chứng từ ghi giảm</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50">{["Ngày", "Thiết bị", "SL", "Lý do", "Trạng thái", "Số QĐ/BB", "Giá trị", ""].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{list.map((d) => <tr key={d.id}><td className="px-3 py-2 text-xs whitespace-nowrap">{d.date}</td><td className="px-3 py-2">{d.name}{d.note && <div className="text-[11px] text-gray-500">{d.note}</div>}</td><td className="px-3 py-2 font-semibold">{d.quantity}</td><td className="px-3 py-2">{d.reason}</td><td className="px-3 py-2 text-xs whitespace-nowrap">{d.status === "Chờ duyệt" ? (caps?.canDecide ? <span className="flex gap-1.5"><button onClick={() => { const no = prompt("Số quyết định thanh lý của Hiệu trưởng:", ""); if (no) decideDisposal(d.id, true, no, "").then(load).catch((e) => setError(e.message)) }} className="px-2 py-1 rounded-md bg-[#1a3670] text-white font-semibold">Duyệt</button><button onClick={() => { const n = prompt("Lý do không duyệt:", ""); if (n) decideDisposal(d.id, false, "", n).then(load).catch((e) => setError(e.message)) }} className="px-2 py-1 rounded-md bg-gray-100 font-semibold">Từ chối</button></span> : <span className="text-amber-700 font-semibold">Chờ Ban giám hiệu duyệt</span>) : d.status === "Từ chối" ? <span className="text-red-700 font-semibold" title={d.decisionNote}>Không duyệt</span> : <span className="text-green-700 font-semibold">Đã ghi giảm</span>}</td><td className="px-3 py-2 text-xs">{d.decisionNo}</td><td className="px-3 py-2 whitespace-nowrap text-xs">{money(d.value)}</td><td className="px-3 py-2"><button disabled={d.status === "Chờ duyệt" || d.status === "Từ chối"} onClick={() => printDisposalMinutes(d, inventory.find((e) => e.id === d.equipmentId))} className="text-xs font-semibold text-[#1a3670] hover:underline whitespace-nowrap">In biên bản</button></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}

// ===================================================================
// SỔ SÁCH, BIỂU MẪU IN
// ===================================================================
const escH = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

export function printDoc(title: string, subtitle: string, head: string[], rows: (string | number)[][], landscape = true, opts: { cover?: boolean; comments?: boolean; groupCol?: number } = {}) {
  const w = window.open("", "_blank")
  if (!w) { alert("Trình duyệt chặn cửa sổ mới. Hãy cho phép pop-up để in."); return }
  const today = new Date()
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escH(title)}</title><style>
    @page{size:A4 ${landscape ? "landscape" : "portrait"};margin:12mm}
    body{font-family:"Times New Roman",serif;font-size:12px;color:#000;margin:0}
    .hd{display:flex;justify-content:space-between;text-align:center;margin-bottom:10px}.hd div{width:48%}.hd b{display:block}
    h1{text-align:center;font-size:16px;margin:12px 0 2px}.sub{text-align:center;font-style:italic;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:3px 4px;vertical-align:top}th{background:#eee}
    td.c{text-align:center}.sign{display:flex;justify-content:space-around;margin-top:18px;text-align:center}.sign div{width:30%}.sign i{display:block}
    .bar{margin:8px 0}@media print{.bar{display:none}}.pb{page-break-after:always}
    .cover{height:170mm;display:flex;flex-direction:column;justify-content:space-between;text-align:center;border:3px double #000;padding:12mm}
    .cover h1{font-size:26px;margin:30mm 0 8mm}.lines div{border-bottom:1px dotted #000;height:9mm}tr.g td{background:#f3f3f3;font-weight:bold}</style></head><body>
    <div class="bar"><button onclick="window.print()">In</button></div>
    ${opts.cover ? `<div class="cover pb"><div>PHÒNG GIÁO DỤC VÀ ĐÀO TẠO<br><b>TRƯỜNG THCS LÊ ĐỘ</b></div><div><h1>${escH(title)}</h1><div class="sub">${escH(subtitle)}</div></div><div>Năm học ${today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1}–${today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear()}</div></div>` : ""}
    <div class="hd"><div>PHÒNG GIÁO DỤC VÀ ĐÀO TẠO<b>TRƯỜNG THCS LÊ ĐỘ</b></div><div><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><b>Độc lập – Tự do – Hạnh phúc</b></div></div>
    <h1>${escH(title)}</h1><div class="sub">${escH(subtitle)}</div>
    <table><thead><tr>${head.filter((_, i) => i !== opts.groupCol).map((h) => `<th>${escH(h)}</th>`).join("")}</tr></thead><tbody>
    ${rows.length ? rows.map((r, k) => {
      const gc = opts.groupCol
      const g = gc !== undefined && (k === 0 || rows[k - 1][gc] !== r[gc]) ? `<tr class="g"><td colspan="${head.length - 1}">${escH(r[gc])}</td></tr>` : ""
      return g + `<tr>${r.filter((_, i) => i !== gc).map((c, i) => `<td${i === 0 || typeof c === "number" ? ' class="c"' : ""}>${escH(c)}</td>`).join("")}</tr>`
    }).join("") : `<tr><td colspan="${head.length}" class="c">Không có dữ liệu</td></tr>`}
    </tbody></table>
    ${opts.comments ? `<div class="pb"></div><h1>NHẬN XÉT, Ý KIẾN CỦA HIỆU TRƯỞNG</h1><div class="sub">về việc sử dụng thiết bị dạy học của giáo viên</div><div class="lines">${"<div></div>".repeat(14)}</div>` : ""}
    <div class="sign"><div><b>Người lập</b><i>(Ký, ghi rõ họ tên)</i></div><div><b>Tổ trưởng chuyên môn</b><i>(Ký, ghi rõ họ tên)</i></div><div><i>Ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}</i><b>Hiệu trưởng</b><i>(Ký, đóng dấu)</i></div></div>
    </body></html>`)
  w.document.close()
}

export function BooksTab({ subjects }: { subjects: Subject[] }) {
  const ps = useMemo(presets, [])
  const [from, setFrom] = useState(ps[3].from)
  const [to, setTo] = useState(ps[3].to)
  const [subjectId, setSubjectId] = useState("")
  const [error, setError] = useState("")
  const [printBy, setPrintBy] = useState("teacher")
  const [usage, setUsage] = useState("")
  const [withCover, setWithCover] = useState(true)
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState("")
  useEffect(() => { fetchRooms().then((l) => { setRooms(l); if (l[0]) setRoomId(l[0].id) }).catch(() => {}) }, [])
  const sName = (id: string) => subjects.find((s) => s.id === id)?.name || ""
  const scope = subjectId ? ` – môn ${sName(subjectId)}` : ""

  const borrowBook = async (excel: boolean) => {
    setError("")
    try {
      const r = await fetchReport(isoToVn(from), isoToVn(to))
      const byKey = (x: Report) => (printBy === "teacher" ? x.teacherName : printBy === "group" ? x.group || "(chưa có tổ)" : x.subject)
      // Sổ theo kiểu phần mềm quản lý thiết bị: nhóm theo giáo viên / môn / tổ, trong nhóm xếp theo ngày mượn
      const list = (r.records as Report[])
        .filter((x) => x.status !== "Từ chối" && x.status !== "Chờ duyệt")
        .filter((x) => !subjectId || x.subject === sName(subjectId))
        .filter((x) => !usage || x.usageType === usage)
        .sort((a, b) => String(byKey(a)).localeCompare(String(byKey(b)), "vi") || (parseVnDate(a.borrowDate)?.getTime() || 0) - (parseVnDate(b.borrowDate)?.getTime() || 0))
      const head = ["Nhóm", "STT", "Họ tên giáo viên", "Tổ bộ môn", "Ngày mượn", "Ngày trả", "Số phiếu", "Ngày lập", "Thiết bị mượn sử dụng", "SL", "Tiết dạy", "Tên bài dạy", "Lớp", "Loại tiết", "Tình trạng khi trả", "Ký mượn", "Ký trả"]
      const rows = list.map((x, i) => [byKey(x), i + 1, x.teacherName, x.group, x.borrowDate, x.status === "Trả" ? x.returnDate : "", x.code, x.createdOn, x.equipment, x.quantity, x.period || "", x.lessonName, x.className, x.usageType,
        x.status === "Trả" ? ([x.damaged ? `Hỏng ${x.damaged}` : "", x.lost ? `Mất ${x.lost}` : ""].filter(Boolean).join(", ") || "BT") : "Đang mượn", "", ""])
      const title = "SỔ MƯỢN TRẢ THIẾT BỊ DẠY HỌC"
      const sub = `Từ ngày ${r.from} đến ngày ${r.to}${scope}${usage ? ` – tiết ${usage.toLowerCase()}` : ""}`
      if (excel) await exportExcel(`So-muon-tra-thiet-bi_${r.from.replace(/\//g, "-")}_${r.to.replace(/\//g, "-")}.xlsx`, [{ name: "Sổ mượn trả", rows: rows.map((row) => Object.fromEntries(head.map((h, i) => [h, row[i]]))) }])
      else printDoc(title, sub, head, rows, true, { cover: withCover, comments: withCover, groupCol: 0 })
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const roomBook = async (excel: boolean) => {
    setError("")
    if (!roomId) { setError("Chọn phòng bộ môn để in sổ nhật ký"); return }
    try {
      const r = await fetchRoomLog(roomId, isoToVn(from), isoToVn(to))
      const head = ["STT", "Ngày", "Tiết", "Lớp", "Giáo viên", "Môn", "Tên bài dạy", "Thiết bị sử dụng", "Tình trạng phòng/thiết bị sau tiết", "Ký"]
      const rows = r.entries.map((x, i) => [i + 1, x.date, x.period, x.className, x.teacherName, x.subject, x.lessonName, x.equipment, x.condition || (x.status === "Mượn" ? "Đang sử dụng" : ""), ""])
      if (excel) await exportExcel(`So-nhat-ky-${r.room.name.replace(/\s+/g, "-")}.xlsx`, [{ name: "Nhật ký phòng", rows: rows.map((row) => Object.fromEntries(head.map((h, i) => [h, row[i]]))) }])
      const shareText = r.share && Object.keys(r.share).length > 1 ? ` · Phòng ghép – số tiết theo môn: ${Object.entries(r.share).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""
      if (!excel) printDoc(`SỔ NHẬT KÝ SỬ DỤNG ${r.room.name.toUpperCase()}`, `Từ ngày ${isoToVn(from)} đến ngày ${isoToVn(to)}${shareText}`, head, rows, true, { cover: withCover })
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const assetBook = async (excel: boolean) => {
    setError("")
    try {
      const inv = (await fetchInventory()).filter((e) => !subjectId || e.subjectId === subjectId)
      const head = ["STT", "Mã thiết bị", "Tên thiết bị", "Môn", "ĐVT", "Nước SX", "Năm SD", "Nguồn KP", "Tốt", "Hỏng", "Đang sửa", "Mất", "Đơn giá (đ)", "Thành tiền (đ)", "Vị trí"]
      const rows = inv.map((e, i) => [i + 1, e.id, e.name, sName(e.subjectId), e.unit || "", e.origin || "", e.yearInUse || "", e.fundSource || "", e.qtyGood, e.qtyBroken, e.qtyRepair, e.qtyLost, (e.unitPrice || 0).toLocaleString("vi-VN"), ((e.qtyGood + e.qtyBroken + e.qtyRepair) * (e.unitPrice || 0)).toLocaleString("vi-VN"), e.location])
      if (excel) await exportExcel("So-quan-ly-thiet-bi.xlsx", [{ name: "Sổ quản lý thiết bị", rows: rows.map((row) => Object.fromEntries(head.map((h, i) => [h, row[i]]))) }])
      else printDoc("SỔ QUẢN LÝ THIẾT BỊ DẠY HỌC", `Tính đến ngày ${new Date().toLocaleDateString("vi-VN")}${scope}`, head, rows)
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const damageBook = async (excel: boolean) => {
    setError("")
    try {
      const [m, d] = await Promise.all([fetchMaintenance(), fetchDisposals()])
      const inRange = (x: string) => { const t = parseVnDate(x); return !!t && t >= new Date(from) && t <= new Date(to + "T23:59:59") }
      const rows: (string | number)[][] = [
        ...m.filter((x) => inRange(x.date) && (!subjectId || x.subjectId === subjectId)).map((x) => [x.date, x.name, x.quantity, `${x.kind}: ${x.content || ""}`, x.status === "Hoàn thành" ? `Sửa được ${x.repaired}, thanh lý ${x.disposed}` : "Đang thực hiện", (x.cost || 0).toLocaleString("vi-VN")]),
        ...d.filter((x) => inRange(x.date) && (!subjectId || x.subjectId === subjectId)).map((x) => [x.date, x.name, x.quantity, `Ghi giảm: ${x.reason}${x.decisionNo ? ` (${x.decisionNo})` : ""}`, x.note || "", (x.value || 0).toLocaleString("vi-VN")]),
      ].sort((a, b) => (parseVnDate(String(a[0]))?.getTime() || 0) - (parseVnDate(String(b[0]))?.getTime() || 0)).map((r, i) => [i + 1, ...r])
      const head = ["STT", "Ngày", "Thiết bị", "Số lượng", "Nội dung", "Kết quả / ghi chú", "Chi phí / giá trị (đ)"]
      if (excel) await exportExcel("So-sua-chua-thanh-ly.xlsx", [{ name: "Sửa chữa – thanh lý", rows: rows.map((row) => Object.fromEntries(head.map((h, i) => [h, row[i]]))) }])
      else printDoc("SỔ THEO DÕI SỬA CHỮA, THANH LÝ THIẾT BỊ", `Từ ngày ${isoToVn(from)} đến ngày ${isoToVn(to)}${scope}`, head, rows)
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const conditionBook = async (excel: boolean) => {
    setError("")
    try {
      const t = new Date(), sy = t.getMonth() >= 8 ? t.getFullYear() : t.getFullYear() - 1
      const [inv, ch] = await Promise.all([fetchInventory(), fetchChanges(`${sy}-09-01`, `${sy + 1}-08-31T23:59:59`)])
      const sum = (id: string, keys: string[], pos = true) => ch.filter((c) => c.equipmentId === id).reduce((a, c) => a + keys.reduce((b, k) => b + (pos ? Math.max(0, c.diff[k] || 0) : 0), 0), 0)
      const list = inv.filter((e) => !subjectId || e.subjectId === subjectId)
      const head = ["STT", "Tên thiết bị", "Năm SD", "Nước SX", "Kí hiệu / mã", "Ngày nhập kho", "Số lượng", "Chất lượng (%)", `Tổng số ${sy}–${sy + 1}`, "Nhập mới (SL)", "Hư hỏng, thất thoát (SL)"]
      const rows = list.map((e, i) => {
        const total = e.qtyGood + e.qtyBroken + e.qtyRepair + (e.qtyLostPending || 0)
        const newIn = ch.filter((c) => c.equipmentId === e.id && c.kind === "Ghi tăng").reduce((a, c) => a + (c.diff.qtyGood || 0), 0)
        return [i + 1, e.name, e.yearInUse || "", e.origin || "", e.id, e.updatedAt ? new Date((e as Equipment & { createdAt?: string }).createdAt || e.updatedAt).toLocaleDateString("vi-VN") : "",
          total, total ? Math.round((e.qtyGood / total) * 100) : 0, total, newIn, sum(e.id, ["qtyBroken", "qtyLostPending", "qtyLost"])]
      })
      if (excel) await exportExcel("So-theo-doi-tinh-trang-thiet-bi-Mau1.xlsx", [{ name: "Mẫu 1", rows: rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) }])
      else printDoc("SỔ THEO DÕI TÌNH TRẠNG THIẾT BỊ DẠY HỌC", `Năm học ${sy} – ${sy + 1}${scope} · Chất lượng (%) = số tốt / tổng số`, head, rows, true, { cover: withCover })
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const books: [string, string, (excel: boolean) => void][] = [
    ["Sổ mượn trả thiết bị", "Nhóm theo giáo viên / môn / tổ: ngày mượn – trả, số phiếu, ngày lập phiếu, thiết bị, tiết dạy, tên bài dạy, lớp, loại tiết, tình trạng khi trả (BT/Hỏng/Mất), cột ký. Có trang bìa và trang nhận xét của Hiệu trưởng.", borrowBook],
    ["Sổ nhật ký sử dụng phòng bộ môn", "Theo từng phòng: ngày, tiết, lớp, giáo viên, bài dạy, thiết bị sử dụng, tình trạng sau tiết.", roomBook],
    ["Sổ quản lý thiết bị", "Danh mục toàn bộ thiết bị: mã, đơn vị tính, nước sản xuất, năm sử dụng, nguồn kinh phí, số lượng theo tình trạng, giá trị.", assetBook],
    ["Sổ theo dõi sửa chữa, thanh lý", "Các lần bảo trì, sửa chữa và chứng từ ghi giảm trong kỳ, kèm chi phí.", damageBook],
    ["Sổ theo dõi tình trạng thiết bị (Mẫu 1)", "Năm SX, nước SX, mã, ngày nhập kho, số lượng, chất lượng (%); năm học này: tổng số, nhập mới, hư hỏng – thất thoát (từ nhật ký thay đổi).", conditionBook],
    ["Báo cáo tổng kết năm học", "Theo mẫu báo cáo tổng kết công tác quản lý – sử dụng thiết bị: tình hình, tổ chức thực hiện, kết quả theo tổ, kiến nghị.", () => printSummaryReport("year")],
    ["Báo cáo sơ kết học kỳ I", "Số liệu từ 01/09 đến 15/01 theo cùng bố cục.", () => printSummaryReport("hk1")],
  ]
  return (
    <div className="space-y-4">
      <div className={`${card} p-5 flex flex-wrap items-end gap-3`}>
        <div className="flex flex-wrap gap-2">{ps.map((p) => <button key={p.k} onClick={() => { setFrom(p.from); setTo(p.to) }} aria-pressed={from === p.from && to === p.to} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${from === p.from && to === p.to ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{p.l}</button>)}</div>
        <div><label className={label} htmlFor="b-from">Từ ngày</label><input id="b-from" type="date" className={fieldBase} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className={label} htmlFor="b-to">Đến ngày</label><input id="b-to" type="date" className={fieldBase} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><label className={label} htmlFor="b-sub">Môn</label><select id="b-sub" className={fieldBase} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Tất cả</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className={label} htmlFor="b-by">In theo</label><select id="b-by" className={fieldBase} value={printBy} onChange={(e) => setPrintBy(e.target.value)}><option value="teacher">Giáo viên</option><option value="subject">Môn học</option><option value="group">Tổ bộ môn</option></select></div>
        <div><label className={label} htmlFor="b-use">Loại tiết</label><select id="b-use" className={fieldBase} value={usage} onChange={(e) => setUsage(e.target.value)}><option value="">Tất cả</option><option>Thực hành</option><option>Biểu diễn</option></select></div>
        {rooms.length > 0 && <div><label className={label} htmlFor="b-room">Phòng (sổ nhật ký)</label><select id="b-room" className={fieldBase} value={roomId} onChange={(e) => setRoomId(e.target.value)}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 pb-2"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} />In trang bìa + trang nhận xét</label>
      </div>
      <Err msg={error} />
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {books.map(([t, d, fn]) => (
          <div key={t} className={`${card} p-5 flex flex-col`}>
            <h2 className="font-bold text-gray-900 mb-1">{t}</h2>
            <p className="text-xs text-gray-500 flex-1 mb-4">{d}</p>
            <div className="flex gap-2"><button onClick={() => fn(false)} className={btnPrimary}>Xem & in</button><button onClick={() => fn(true)} className={btnGhost}>Xuất Excel</button></div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Biên bản kiểm kê được xuất trong mục Kiểm kê. Mẫu sổ in ra theo bố cục chung (quốc hiệu, tên trường, chữ ký); nếu trường có mẫu riêng theo quy định của Phòng/Sở, cần đối chiếu và điều chỉnh cột cho khớp.</p>
    </div>
  )
}

// ===================================================================
// XÁC NHẬN THIẾT BỊ BỊ MẤT (Ban giám hiệu)
// ===================================================================
export function LossTab() {
  const [d, setD] = useState<{ reports: LossReport[]; canConfirm: boolean; principalConfigured: boolean } | null>(null)
  const [traceId, setTraceId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState<LossReport | null>(null)
  const [vf, setVf] = useState({ searchScope: "", involved: "", findings: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const load = useCallback(() => { fetchLossReports().then(setD).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const act = async (r: LossReport, ok: boolean) => {
    const note = prompt(ok ? `Xác nhận MẤT ${r.quantity} “${r.name}”? Ghi chú (có thể để trống):` : `Xác nhận KHÔNG mất (đã tìm thấy) ${r.quantity} “${r.name}”? Ghi chú:`, "")
    if (note === null) return
    setBusy(r.id); setError("")
    try { await (ok ? confirmLoss : rejectLoss)(r.id, note); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy("") }
  }
  if (!d) return <p className="text-sm text-gray-500">{error || "Đang tải…"}</p>
  const pending = d.reports.filter((r) => r.status === "Chờ xác nhận")
  const done = d.reports.filter((r) => r.status !== "Chờ xác nhận")
  const src = (r: LossReport) => (r.source === "audit" ? `Kiểm kê: ${r.auditTitle || ""}` : `Phiếu mượn của ${r.teacherName || ""}`)
  return (
    <div className="space-y-4">
      {d.principalConfigured && !d.canConfirm && <p className="text-sm text-gray-500">Việc xác nhận mất do Ban giám hiệu thực hiện; nhân viên thiết bị ghi xác minh và in biên bản.</p>}
      <Err msg={error} />
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Chờ xác nhận ({pending.length})</h2></div>
        {pending.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Không có báo mất nào đang chờ</p> : (
          <ul className="divide-y divide-gray-50">{pending.map((r) => (
            <li key={r.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-gray-900">{r.name} × {r.quantity}<span className="ml-2 text-xs text-gray-500">({money(r.quantity * (r.unitPrice || 0))})</span></div>
                <div className="text-xs text-gray-500">{src(r)} · người báo: {r.reportedBy} · {fmtTime(r.createdAt)}{r.note ? ` · ${r.note}` : ""}</div>
                {r.verification && <div className="text-xs text-emerald-700 mt-0.5">Đã ghi xác minh ({r.verification.by}, {fmtTime(r.verification.at)}): {r.verification.findings || r.verification.searchScope}</div>}
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button onClick={() => setTraceId(r.equipmentId)} className={btnGhost}>Truy vết</button>
                <button onClick={() => { setVerifying(r); setVf({ searchScope: r.verification?.searchScope || "", involved: r.verification?.involved || "", findings: r.verification?.findings || "" }) }} className={btnGhost}>{r.verification ? "Sửa xác minh" : "Ghi xác minh"}</button>
                <button onClick={() => printLossMinutes(r)} className={btnGhost}>In biên bản</button>
              </div>
              {d.canConfirm ? (
                <div className="flex gap-2">
                  <button disabled={busy === r.id} onClick={() => act(r, false)} className={btnGhost}>Không mất (tìm thấy)</button>
                  <button disabled={busy === r.id} onClick={() => act(r, true)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50">Xác nhận mất</button>
                </div>
              ) : <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-3 py-1">Chờ Ban giám hiệu</span>}
            </li>
          ))}</ul>
        )}
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Đã xử lý</h2></div>
        {done.length === 0 ? <p className="p-6 text-center text-sm text-gray-500">Chưa có</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50">{["Thiết bị", "SL", "Nguồn", "Kết quả", "Người xác nhận", "Thời gian"].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{done.map((r) => (
              <tr key={r.id}><td className="px-3 py-2">{r.name}{r.decisionNote && <div className="text-[11px] text-gray-500">{r.decisionNote}</div>}<div className="flex gap-2 mt-1"><button onClick={() => setTraceId(r.equipmentId)} className="text-[11px] font-semibold text-[#1a3670] hover:underline">Truy vết</button><button onClick={() => printLossMinutes(r)} className="text-[11px] font-semibold text-[#1a3670] hover:underline">In biên bản</button></div></td><td className="px-3 py-2">{r.quantity}</td><td className="px-3 py-2 text-xs">{src(r)}</td>
                <td className={`px-3 py-2 text-xs font-semibold ${r.status === "Đã xác nhận mất" ? "text-red-600" : "text-green-700"}`}>{r.status}</td><td className="px-3 py-2 text-xs">{r.decidedBy}</td><td className="px-3 py-2 text-xs whitespace-nowrap">{fmtTime(r.decidedAt)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {traceId && <EquipmentHistoryDialog id={traceId} onClose={() => setTraceId(null)} />}
      {verifying && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setVerifying(null) }}>
          <div role="dialog" aria-modal="true" aria-label="Ghi kết quả xác minh" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3">
            <h2 className="font-bold text-gray-900">Xác minh: {verifying.name} × {verifying.quantity}</h2>
            <p className="text-xs text-gray-500">Dùng nút “Truy vết” để xem những ai giữ thiết bị kể từ lần cuối còn đủ. Nội dung ghi ở đây được in vào biên bản.</p>
            <div><label className={label} htmlFor="v-scope">Phạm vi đã tìm</label><textarea id="v-scope" rows={2} className={field} value={vf.searchScope} onChange={(e) => setVf({ ...vf, searchScope: e.target.value })} placeholder="VD: phòng KHTN, tủ T1–T3, lớp 8A2, phòng chuẩn bị" /></div>
            <div><label className={label} htmlFor="v-inv">Người liên quan đã làm việc</label><textarea id="v-inv" rows={2} className={field} value={vf.involved} onChange={(e) => setVf({ ...vf, involved: e.target.value })} placeholder="VD: cô Ngọc Hồng (người mượn), lớp trưởng 8A2" /></div>
            <div><label className={label} htmlFor="v-find">Kết quả xác minh</label><textarea id="v-find" rows={3} className={field} value={vf.findings} onChange={(e) => setVf({ ...vf, findings: e.target.value })} placeholder="VD: không tìm thấy; người mượn xác nhận làm rơi vỡ khi di chuyển" /></div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setVerifying(null)} className={btnGhost}>Hủy</button>
              <button onClick={async () => { try { await verifyLoss(verifying.id, vf); setVerifying(null); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }} className={btnPrimary}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===================================================================
// TRUY VẾT LỊCH SỬ THIẾT BỊ (UC31) VÀ BIÊN BẢN XÁC MINH MẤT (UC32)
// ===================================================================
const QTY_LABEL: Record<string, string> = { qtyGood: "Tốt", qtyBroken: "Hỏng", qtyRepair: "Đang sửa", qtyLostPending: "Chờ xác nhận mất", qtyLost: "Mất", qtyDisposed: "Thanh lý" }
const diffText = (d: Record<string, number>) => Object.entries(d).map(([k, v]) => `${QTY_LABEL[k] || k} ${v > 0 ? "+" : "−"}${Math.abs(v)}`).join(", ")
const vnTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")

export function EquipmentHistoryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [h, setH] = useState<EquipmentHistory | null>(null)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<"trace" | "changes" | "loans">("trace")
  useEffect(() => { fetchEquipmentHistory(id).then(setH).catch((e) => setError(e.message)) }, [id])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
  const doExport = () => h && exportExcel(`Lich-su-${h.equipment.id}.xlsx`, [
    { name: "Nhật ký thay đổi", rows: h.changes.map((c) => ({ "Thời gian": vnTime(c.createdAt), "Nghiệp vụ": c.kind, "Thay đổi": diffText(c.diff), "Người thực hiện": c.by, "Ghi chú": c.note })) },
    { name: "Lịch sử mượn", rows: h.loans.map((l) => ({ "Số phiếu": l.code, "Giáo viên": l.teacherName, "Lớp": l.className, "Ngày mượn": l.borrowDate, "Ngày trả": l.returnDate, "Tiết": l.period, "Số lượng": l.quantity, "Trạng thái": l.status, "Duyệt lúc": vnTime(l.approvedAt), "Trả lúc": vnTime(l.returnedAt), "Hỏng": l.damaged, "Mất": l.lost })) },
  ])
  // Lý lịch thiết bị: thông tin, số lượng theo tình trạng, nhật ký thay đổi, lịch sử mượn; in để lưu hồ sơ
  const printProfile = () => { if (!h) return; const q = h.equipment; printHtml({
    title: "Lý lịch thiết bị", subtitle: `${q.name}${q.id ? ` (mã ${q.id})` : ""}`,
    body: `${table(["Nội dung", "Thông tin"], [["Tên thiết bị", q.name], ["Đơn vị tính", q.unit || ""], ["Vị trí", q.location || ""], ["Nước sản xuất", q.origin || ""], ["Năm đưa vào sử dụng", q.yearInUse || ""], ["Nguồn kinh phí", q.fundSource || ""], ["Đơn giá (đ)", (q.unitPrice || 0).toLocaleString("vi-VN")],
        ["Số lượng hiện có", `Tốt ${q.qtyGood} · Hỏng ${q.qtyBroken} · Đang sửa ${q.qtyRepair} · Mất ${q.qtyLost}`]])}
      <h2>Nhật ký thay đổi số lượng</h2>${h.changes.length ? table(["Thời gian", "Nghiệp vụ", "Thay đổi", "Người thực hiện", "Ghi chú"], h.changes.map((c) => [vnTime(c.createdAt), c.kind, diffText(c.diff), c.by, c.note || ""])) : "<p>Chưa có</p>"}
      <h2>Lịch sử mượn</h2>${h.loans.length ? table(["Số phiếu", "Giáo viên", "Lớp", "Ngày mượn", "Ngày trả", "Tình trạng"], h.loans.map((l) => [l.code || "", l.teacherName, l.className, l.borrowDate, l.returnDate, l.status])) : "<p>Chưa có</p>"}`,
    signs: [["Người lập", "(Ký, ghi rõ họ tên)"], ["Hiệu trưởng", "(Ký, đóng dấu)"]],
  }) }
  const e = h?.equipment
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Lịch sử thiết bị" className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 font-mono">{e?.id}</div>
            <h2 className="font-bold text-gray-900 text-lg">{e?.name || "Đang tải…"}{e?.deleted && <span className="ml-2 text-xs text-red-600">(đã xóa khỏi danh mục)</span>}</h2>
            {e && !e.deleted && <div className="text-sm text-gray-600 mt-0.5">Tốt {e.qtyGood} · Hỏng {e.qtyBroken} · Đang sửa {e.qtyRepair} · Mất {e.qtyLost}{e.qtyLostPending ? ` · chờ xác nhận mất ${e.qtyLostPending}` : ""}{e.location ? ` · ${e.location}` : ""}</div>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={printProfile} disabled={!h} className={btnGhost}>In lý lịch</button>
            <button onClick={doExport} disabled={!h} className={btnGhost}>Xuất Excel</button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Đóng">✕</button>
          </div>
        </div>
        <div className="px-6 pt-4">
          <Err msg={error} />
          <div className="flex gap-2 mb-4">
            {([["trace", "Truy vết"], ["changes", `Nhật ký thay đổi (${h?.changes.length ?? 0})`], ["loans", `Lịch sử mượn (${h?.loans.length ?? 0})`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="px-6 pb-6">
          {!h ? <p className="text-sm text-gray-500">Đang tải…</p> : tab === "trace" ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#F6F7F9] p-4 text-sm space-y-1.5">
                <div><span className="text-gray-500">Kiểm kê gần nhất còn đủ:</span> <strong>{h.trace.lastAuditOk ? `${h.trace.lastAuditOk.title} (${vnTime(h.trace.lastAuditOk.at)})` : "chưa có"}</strong></div>
                <div><span className="text-gray-500">Lần trả gần nhất không thiếu:</span> <strong>{h.trace.lastReturnOk ? `${vnTime(h.trace.lastReturnOk.at)} – ${h.trace.lastReturnOk.teacherName} (${h.trace.lastReturnOk.code || "phiếu cũ"})` : "chưa có"}</strong></div>
                <div className="text-gray-600">{h.trace.since ? `Từ ${vnTime(h.trace.since)} đến nay, thiết bị đã qua tay những người dưới đây — đây là phạm vi cần xác minh khi phát hiện thiếu.` : "Chưa có mốc xác nhận đủ, phạm vi xác minh là toàn bộ lịch sử mượn."}</div>
              </div>
              {h.trace.candidates.length === 0 ? <p className="text-sm text-gray-500">Không có lượt mượn nào trong phạm vi này.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="bg-gray-50">{["Số phiếu", "Giáo viên", "Lớp", "Mượn – trả", "Tiết", "SL", "Trạng thái", "Khi trả"].map((x) => <th key={x} className={th}>{x}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-50">{h.trace.candidates.map((l) => (
                    <tr key={l.id}><td className="px-3 py-2 text-xs font-mono">{l.code}</td><td className="px-3 py-2 font-medium">{l.teacherName}</td><td className="px-3 py-2">{l.className}</td><td className="px-3 py-2 text-xs whitespace-nowrap">{l.borrowDate} – {l.returnDate}</td><td className="px-3 py-2 text-xs">{l.period}</td><td className="px-3 py-2">{l.quantity}</td><td className="px-3 py-2 text-xs">{l.status}</td>
                      <td className={`px-3 py-2 text-xs ${l.lost ? "text-red-600 font-semibold" : ""}`}>{l.status === "Trả" ? [l.damaged && `hỏng ${l.damaged}`, l.lost && `mất ${l.lost}${l.lostStatus ? ` (${l.lostStatus})` : ""}`].filter(Boolean).join(", ") || "đủ" : "đang giữ"}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
          ) : tab === "changes" ? (
            h.changes.length === 0 ? <p className="text-sm text-gray-500">Chưa có thay đổi nào được ghi (nhật ký bắt đầu từ bản cập nhật này).</p> : (
              <div className="overflow-x-auto max-h-[28rem]"><table className="w-full text-sm">
                <thead className="sticky top-0"><tr className="bg-gray-50">{["Thời gian", "Nghiệp vụ", "Thay đổi", "Người thực hiện", "Ghi chú"].map((x) => <th key={x} className={th}>{x}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">{h.changes.map((c) => (
                  <tr key={c.id}><td className="px-3 py-2 text-xs whitespace-nowrap">{vnTime(c.createdAt)}</td><td className="px-3 py-2 font-medium whitespace-nowrap">{c.kind}</td><td className="px-3 py-2 text-xs">{diffText(c.diff) || "—"}</td><td className="px-3 py-2 text-xs">{c.by}</td><td className="px-3 py-2 text-xs text-gray-600">{c.note}</td></tr>
                ))}</tbody>
              </table></div>
            )
          ) : (
            h.loans.length === 0 ? <p className="text-sm text-gray-500">Chưa có lượt mượn nào có mã thiết bị này.</p> : (
              <div className="overflow-x-auto max-h-[28rem]"><table className="w-full text-sm">
                <thead className="sticky top-0"><tr className="bg-gray-50">{["Số phiếu", "Giáo viên", "Lớp", "Ngày", "Tiết", "SL", "Trạng thái", "Duyệt", "Trả"].map((x) => <th key={x} className={th}>{x}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">{h.loans.map((l) => (
                  <tr key={l.id}><td className="px-3 py-2 text-xs font-mono">{l.code}</td><td className="px-3 py-2">{l.teacherName}</td><td className="px-3 py-2">{l.className}</td><td className="px-3 py-2 text-xs whitespace-nowrap">{l.borrowDate}</td><td className="px-3 py-2 text-xs">{l.period}</td><td className="px-3 py-2">{l.quantity}</td><td className="px-3 py-2 text-xs">{l.status}</td><td className="px-3 py-2 text-xs whitespace-nowrap">{vnTime(l.approvedAt)}</td><td className="px-3 py-2 text-xs whitespace-nowrap">{vnTime(l.returnedAt)}</td></tr>
                ))}</tbody>
              </table></div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

/** In biên bản xác minh thiết bị thất thoát (theo bố cục biên bản hư hỏng, thất thoát – Mẫu 7) */
export async function printLossMinutes(r: LossReport) {
  const w = window.open("", "_blank")
  if (!w) { alert("Trình duyệt chặn cửa sổ mới. Hãy cho phép pop-up để in."); return }
  w.document.write("<p style='font-family:Arial;padding:20px'>Đang chuẩn bị biên bản…</p>")
  let h: EquipmentHistory | null = null
  try { h = await fetchEquipmentHistory(r.equipmentId) } catch { /* vẫn in phần đã có */ }
  const e = h?.equipment, v = r.verification
  const dots = (n: number) => `<div class="lines">${"<div></div>".repeat(n)}</div>`
  const t = new Date()
  const cand = h?.trace.candidates || []
  w.document.open()
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Biên bản xác minh thiết bị thất thoát</title><style>
    @page{size:A4;margin:16mm}body{font-family:"Times New Roman",serif;font-size:13px;color:#000;margin:0;line-height:1.45}
    .hd{display:flex;justify-content:space-between;text-align:center}.hd div{width:48%}.hd b{display:block}h1{text-align:center;font-size:17px;margin:16px 0 4px}
    h2{font-size:13px;margin:12px 0 4px}table{width:100%;border-collapse:collapse;margin:4px 0}th,td{border:1px solid #000;padding:3px 5px;vertical-align:top}th{background:#eee}
    .lines div{border-bottom:1px dotted #000;height:7mm}.sign{display:flex;justify-content:space-between;margin-top:22px;text-align:center}.sign div{width:32%}.sign i{display:block;font-size:12px}
    .bar{margin:8px 0}@media print{.bar{display:none}}</style></head><body>
    <div class="bar"><button onclick="window.print()">In</button></div>
    <div class="hd"><div>PHÒNG GIÁO DỤC VÀ ĐÀO TẠO<b>TRƯỜNG THCS LÊ ĐỘ</b></div><div><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><b>Độc lập – Tự do – Hạnh phúc</b></div></div>
    <h1>BIÊN BẢN XÁC MINH THIẾT BỊ THẤT THOÁT</h1>
    <p style="text-align:center;font-style:italic;margin:0">Hôm nay, ngày ${t.getDate()} tháng ${t.getMonth() + 1} năm ${t.getFullYear()}, tại phòng thiết bị Trường THCS Lê Độ</p>
    <h2>I. Thành phần</h2>${dots(3)}
    <h2>II. Thiết bị thất thoát</h2>
    <table><tr><th>Mã thiết bị</th><th>Tên thiết bị</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá (đ)</th><th>Thành tiền (đ)</th></tr>
    <tr><td>${escH(r.equipmentId)}</td><td>${escH(r.name)}</td><td>${escH(e?.unit || "")}</td><td style="text-align:center">${r.quantity}</td><td style="text-align:right">${(r.unitPrice || 0).toLocaleString("vi-VN")}</td><td style="text-align:right">${((r.unitPrice || 0) * r.quantity).toLocaleString("vi-VN")}</td></tr></table>
    <h2>III. Phát hiện</h2>
    <p>Phát hiện khi: ${r.source === "audit" ? `kiểm kê (${escH(r.auditTitle || "")})` : `nhận lại thiết bị theo phiếu mượn của ${escH(r.teacherName || "")}`}; người báo: ${escH(r.reportedBy)}; thời điểm: ${escH(vnTime(r.createdAt))}.${r.note ? ` Ghi chú: ${escH(r.note)}.` : ""}</p>
    <h2>IV. Truy vết theo hệ thống</h2>
    <p>Lần kiểm kê gần nhất còn đủ: ${h?.trace.lastAuditOk ? escH(`${h.trace.lastAuditOk.title} (${vnTime(h.trace.lastAuditOk.at)})`) : "chưa có"}. Lần trả gần nhất không thiếu: ${h?.trace.lastReturnOk ? escH(`${vnTime(h.trace.lastReturnOk.at)}, ${h.trace.lastReturnOk.teacherName}`) : "chưa có"}.</p>
    ${cand.length ? `<table><tr><th>Số phiếu</th><th>Giáo viên</th><th>Lớp</th><th>Mượn – trả</th><th>Tiết</th><th>SL</th><th>Tình trạng khi trả</th></tr>${cand.map((l) => `<tr><td>${escH(l.code)}</td><td>${escH(l.teacherName)}</td><td>${escH(l.className)}</td><td>${escH(l.borrowDate)} – ${escH(l.returnDate)}</td><td>${escH(l.period)}</td><td style="text-align:center">${l.quantity}</td><td>${l.status === "Trả" ? escH([l.damaged ? `hỏng ${l.damaged}` : "", l.lost ? `mất ${l.lost}` : ""].filter(Boolean).join(", ") || "đủ") : "đang giữ"}</td></tr>`).join("")}</table>` : "<p>Không có lượt mượn trong phạm vi xác minh.</p>"}
    <h2>V. Kết quả xác minh</h2>
    <p><b>Phạm vi đã tìm:</b> ${v?.searchScope ? escH(v.searchScope) : ""}</p>${v?.searchScope ? "" : dots(2)}
    <p><b>Người liên quan đã làm việc:</b> ${v?.involved ? escH(v.involved) : ""}</p>${v?.involved ? "" : dots(2)}
    <p><b>Kết quả:</b> ${v?.findings ? escH(v.findings) : ""}</p>${v?.findings ? "" : dots(3)}
    <h2>VI. Kết luận và đề xuất xử lý</h2>
    <p>Trạng thái trên hệ thống: <b>${escH(r.status)}</b>${r.decidedBy ? ` (${escH(r.decidedBy)}, ${escH(vnTime(r.decidedAt))})` : ""}.</p>${dots(3)}
    <div class="sign"><div><b>Người lập biên bản</b><i>(Ký, ghi rõ họ tên)</i></div><div><b>Người liên quan</b><i>(Ký, ghi rõ họ tên)</i></div><div><b>Hiệu trưởng</b><i>(Ký, đóng dấu)</i></div></div>
    </body></html>`)
  w.document.close()
}

// ===================================================================
// BIÊN BẢN IN THEO MẪU
// ===================================================================
/** Biên bản kiểm kê vật tư thiết bị dạy học (Mẫu 6) kèm phụ lục đầu kỳ – kết quả kiểm kê */
export function printAuditMinutes(a: Audit, subjects: Subject[]) {
  const q = (good: number, broken: number) => { const t = good + broken; return t ? `${Math.round((good / t) * 100)}%` : "" }
  const counted = a.items.filter((i) => i.countGood !== null)
  const sum = a.summary
  const rows = counted.map((i, n) => [n + 1, i.name, i.sysGood + i.sysBroken, q(i.sysGood, i.sysBroken), (i.countGood ?? 0) + (i.countBroken ?? i.sysBroken) + i.out, q((i.countGood ?? 0) + i.out, i.countBroken ?? i.sysBroken), i.diff ? (i.diff > 0 ? `+${i.diff}` : String(i.diff)) : "", i.note])
  printHtml({
    title: "Biên bản kiểm kê vật tư thiết bị dạy học", subtitle: a.title + (a.subjectId ? ` – ${subjects.find((s) => s.id === a.subjectId)?.name}` : " – toàn bộ kho"),
    body: `<p>Tổ kiểm kê tài sản vật tư thiết bị dạy học được thành lập theo Quyết định số ……/QĐ-THCSLĐ của Hiệu trưởng đã tiến hành kiểm kê từ ${esc(new Date(a.createdAt).toLocaleDateString("vi-VN"))} đến ${esc(new Date(a.finishedAt || a.createdAt).toLocaleDateString("vi-VN"))}.</p>
      <h2>I. NHỮNG CÔNG VIỆC ĐÃ TIẾN HÀNH</h2><p>– Kiểm kê, đánh giá chất lượng thiết bị dạy học trong kho do ông (bà) …………………… phụ trách.</p><p>– Đối chiếu số lượng và chất lượng thiết bị so với sổ sách tại thời điểm kiểm kê (thiết bị đang cho mượn được tính riêng) và hóa đơn nhập, xuất.</p>
      <h2>II. KẾT QUẢ KIỂM TRA</h2><p>– Tổng số loại thiết bị được kiểm tra: <b>${sum?.counted ?? counted.length}</b>.</p><p>– Số thiết bị thiếu so với sổ sách (chuyển xác minh mất): <b>${sum?.missing ?? 0}</b>; thừa: <b>${sum?.surplus ?? 0}</b>; số loại có chênh lệch: <b>${sum?.discrepancies ?? 0}</b>.</p>
      <p>– Tổng số loại thiết bị không còn sử dụng được cần thanh lý: ……………</p>
      <h2>III. NHẬN XÉT</h2><p>– Công tác bảo quản: …………………………………………</p><p>– Hiệu quả sử dụng: …………………………………………</p>${dots(1)}
      <h2>IV. CÁC ĐỀ XUẤT, KIẾN NGHỊ</h2>${dots(3)}
      <h2 style="page-break-before:always">PHỤ LỤC KÈM THEO BIÊN BẢN</h2>
      ${table(["STT", "Tên thiết bị", "Sổ sách: số lượng", "Sổ sách: chất lượng", "Kiểm kê: số lượng", "Kiểm kê: chất lượng", "Chênh lệch", "Ghi chú"], rows)}`,
    signs: [["Hiệu trưởng", "(Ký, đóng dấu)"], ["Tổ kiểm kê", "(Ký, ghi rõ họ tên)"], ["Người phụ trách kho", "(Ký, ghi rõ họ tên)"]],
  })
}

/** Biên bản kiểm tra tình trạng hư hỏng của trang thiết bị (từ phiếu bảo trì) */
export function printDamageMinutes(m: Maintenance, e?: Equipment) {
  printHtml({
    title: "Biên bản kiểm tra tình trạng hư hỏng của trang thiết bị",
    body: `<h2>Thành phần</h2>${dots(3)}
      <h2>Nội dung kiểm tra</h2>
      ${table(["Tên thiết bị", "Mã", "Năm sử dụng", "Nước sản xuất", "Số lượng", "Tình trạng hư hỏng"], [[m.name, m.equipmentId, e?.yearInUse || "", e?.origin || "", m.quantity, m.content || ""]])}
      <p>Ngày phát hiện, gửi kiểm tra: ${esc(m.date)}. Hình thức: ${esc(m.kind)}${m.vendor ? `; đơn vị thực hiện: ${esc(m.vendor)}` : ""}.</p>
      <h2>Đề xuất</h2><p>${m.status === "Hoàn thành" ? `Kết quả: sửa được ${m.repaired ?? 0}, không sửa được (đề nghị thanh lý) ${m.disposed ?? 0}. ${esc(m.resultNote || "")}` : "Sửa chữa / thay thế / thanh lý: ………………"}</p>
      <p>Kinh phí: ${m.cost ? `${m.cost.toLocaleString("vi-VN")} đồng` : "……………… đồng"}.</p>${dots(2)}`,
    signs: [["Người sử dụng", "(Ký, ghi rõ họ tên)"], ["Nhân viên thiết bị", "(Ký, ghi rõ họ tên)"], ["Hiệu trưởng", "(Ký, đóng dấu)"]],
  })
}

/** Biên bản thanh lý / ghi giảm thiết bị */
export function printDisposalMinutes(d: Disposal, e?: Equipment) {
  printHtml({
    title: d.reason.startsWith("Tiêu hủy") ? "Biên bản tiêu hủy hóa chất" : "Biên bản thanh lý thiết bị dạy học", number: d.decisionNo ? `theo QĐ ${d.decisionNo}` : undefined,
    body: `<p><i>Căn cứ Luật Quản lý, sử dụng tài sản công và các văn bản sửa đổi, bổ sung; Nghị định 186/2025/NĐ-CP ngày 01/7/2025 của Chính phủ quy định chi tiết một số điều của Luật Quản lý, sử dụng tài sản công;</i></p>
      <p>Căn cứ ${d.decisionNo ? `Quyết định số ${esc(d.decisionNo)}` : "quyết định của Hiệu trưởng"} và kết quả kiểm tra thực tế, Hội đồng tiến hành ${d.reason.startsWith("Tiêu hủy") ? "tiêu hủy" : "thanh lý"} thiết bị sau:</p>
      <h2>I. Thành phần hội đồng</h2>${dots(3)}
      <h2>II. Danh mục</h2>
      ${table(["Mã", "Tên thiết bị", "ĐVT", "Năm sử dụng", "Số lượng", "Đơn giá (đ)", "Giá trị (đ)", "Lý do"], [[d.equipmentId, d.name, e?.unit || "", e?.yearInUse || "", d.quantity, d.unitPrice.toLocaleString("vi-VN"), d.value.toLocaleString("vi-VN"), d.reason]])}
      <p>Ngày thực hiện: ${esc(d.date)}.${d.note ? ` Ghi chú: ${esc(d.note)}.` : ""}</p>
      <h2>III. Hình thức ${d.reason.startsWith("Tiêu hủy") ? "tiêu hủy (bảo đảm an toàn, vệ sinh môi trường)" : "thanh lý"}</h2>${dots(2)}
      <h2>IV. Kết luận</h2>${dots(2)}`,
    signs: [["Thư ký", "(Ký, ghi rõ họ tên)"], ["Chủ tịch hội đồng", "(Ký, ghi rõ họ tên)"], ["Hiệu trưởng", "(Ký, đóng dấu)"]],
  })
}
