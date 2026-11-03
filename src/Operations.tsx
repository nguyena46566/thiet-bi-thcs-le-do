// Kiểm kê, bảo trì, báo cáo tổng hợp, nhãn QR và trang chi tiết thiết bị
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  fetchAudits, startAudit, fetchAudit, saveAudit, finishAudit, cancelAudit,
  fetchInventory, fetchMaintenance, createMaintenance, completeMaintenance, fetchReport, fetchEquipmentDetail,
  type Audit, type AuditItem, type Equipment, type Maintenance, type Report, type BorrowDraft,
} from "@/api"
import type { Subject } from "./Inventory"

const money = (n: number) => `${(n || 0).toLocaleString("vi-VN")} đ`
const fieldBase = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 focus:border-[#1a3670] bg-white"
const field = `w-full ${fieldBase}`
const label = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const card = "bg-white rounded-2xl shadow-sm border border-gray-100"
const th = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const todayIso = () => new Date().toLocaleDateString("sv-SE")
const isoToVn = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]}/${m[2]}/${m[1]}` : "" }
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)

/** Xuất nhiều bảng ra một file Excel (thư viện chỉ tải khi bấm nút) */
async function exportExcel(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
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
        <div className={`${card} p-5 mb-4 flex flex-wrap items-center gap-3 justify-between`}>
          <div>
            <h3 className="font-bold text-gray-900">{current.title} {current.subjectId ? `– ${subjects.find((s) => s.id === current.subjectId)?.name}` : "– tất cả môn"}</h3>
            <p className="text-xs text-gray-500">{done ? `Hoàn tất ${fmtTime(current.finishedAt)}` : `Bắt đầu ${fmtTime(current.createdAt)} · đã đếm ${counted}/${current.items.length} thiết bị`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!done && <button onClick={fillBook} className={btnGhost} title="Điền số đếm bằng số sổ sách cho các dòng chưa đếm, sau đó chỉ sửa dòng có chênh lệch">Điền theo sổ sách</button>}
            {!done && <button onClick={save} disabled={busy} className={btnGhost}>Lưu nháp</button>}
            {!done && <button onClick={cancel} className={btnGhost}>Hủy đợt</button>}
            {!done && <button onClick={finish} disabled={busy || counted === 0} className={btnPrimary}>Hoàn tất kiểm kê</button>}
            {done && <button onClick={() => exportAudit(current)} className={btnPrimary}>Xuất biên bản Excel</button>}
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
            <thead><tr className="bg-gray-50 border-b border-gray-100">{["Thiết bị", "Tốt (sổ)", "Đang mượn", "Hỏng (sổ)", "Phải có", "Đếm: tốt", "Đếm: hỏng", "Chênh lệch", "Ghi chú"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((i) => {
                const d = done ? i.diff ?? null : diffOf(i)
                return (
                  <tr key={i.equipmentId} className={d ? (d < 0 ? "bg-rose-50/60" : "bg-amber-50/60") : ""}>
                    <td className="px-3 py-2 min-w-[200px]"><div className="font-medium text-gray-900">{i.name}</div><div className="text-[11px] text-gray-400">{i.location}</div></td>
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
        <h3 className="font-bold text-gray-900 mb-1">Bắt đầu đợt kiểm kê mới</h3>
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
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Các đợt kiểm kê</h3></div>
        {list === null ? <p className="p-6 text-sm text-gray-400">Đang tải…</p> : list.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">Chưa có đợt kiểm kê nào</p> : (
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
    <div className="grid lg:grid-cols-5 gap-5 items-start">
      <div className={`lg:col-span-2 ${card} p-5`}>
        <h3 className="font-bold text-gray-900 mb-1">Gửi bảo trì / bảo dưỡng</h3>
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
          <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Đang thực hiện ({running.length})</h3></div>
          {running.length === 0 ? <p className="p-6 text-center text-sm text-gray-400">Không có thiết bị nào đang bảo trì</p> : (
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
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between"><h3 className="font-bold text-gray-900">Đã hoàn thành</h3><span className="text-sm text-gray-500">Tổng chi phí: <strong className="text-gray-800">{money(totalCost)}</strong></span></div>
          {finished.length === 0 ? <p className="p-6 text-center text-sm text-gray-400">Chưa có</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gray-50">{["Thiết bị", "Loại", "Gửi", "Xong", "Sửa được", "Thanh lý", "Chi phí"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{finished.map((m) => (
                <tr key={m.id}><td className="px-3 py-2 font-medium">{m.name}{m.resultNote && <div className="text-[11px] text-gray-400">{m.resultNote}</div>}</td><td className="px-3 py-2 text-gray-600">{m.kind}</td><td className="px-3 py-2 text-xs text-gray-600">{m.date}</td><td className="px-3 py-2 text-xs text-gray-600">{m.finishedOn}</td>
                  <td className="px-3 py-2 text-green-700 font-semibold">{m.repaired}</td><td className={`px-3 py-2 ${m.disposed ? "text-rose-600 font-semibold" : "text-gray-400"}`}>{m.disposed}</td><td className="px-3 py-2 whitespace-nowrap">{money(m.cost)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>

      {done && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setDone(null) }}>
          <div role="dialog" aria-modal="true" aria-label="Hoàn thành bảo trì" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
            <h3 className="font-bold text-gray-900 mb-1">Hoàn thành: {done.name} × {done.quantity}</h3>
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
      {!r ? <p className="text-sm text-gray-400">Đang tải…</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Phiếu mượn", r.summary.records, `${r.summary.teachers} giáo viên`],
              ["Trả trễ", r.summary.lateReturns, `đang quá hạn: ${r.summary.overdueNow}`],
              ["Hỏng / mất khi trả", `${r.summary.damaged} / ${r.summary.lost}`, `bồi thường ${money(r.summary.compensation)}`],
              ["Chi phí", money(r.summary.purchaseTotal + r.summary.maintenanceCost), `mua mới ${money(r.summary.purchaseTotal)} · bảo trì ${money(r.summary.maintenanceCost)}`],
            ].map(([l, v, sub]) => (
              <div key={String(l)} className="bg-white border border-gray-200 rounded-xl px-4 py-3"><div className="text-xs text-gray-500">{l}</div><div className="text-2xl font-bold text-gray-900 truncate">{v}</div><div className="text-[11px] text-gray-400 truncate" title={String(sub)}>{sub}</div></div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className={`${card} p-5`}>
              <h3 className="font-bold text-gray-900 mb-3">Lượt mượn theo môn</h3>
              <div className="space-y-2">{r.bySubject.map((s: Report) => (
                <div key={s.subjectId} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-gray-700">{s.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden"><div className="h-3 bg-[#1a3670] rounded-full" style={{ width: `${(s.count / maxSubj) * 100}%` }} /></div>
                  <span className="w-8 text-right font-semibold">{s.count}</span>
                </div>
              ))}</div>
            </div>
            <div className={`${card} p-5`}>
              <h3 className="font-bold text-gray-900 mb-3">Thiết bị được mượn nhiều nhất</h3>
              {r.byEquipment.length === 0 ? <p className="text-sm text-gray-400">Chưa có dữ liệu (phiếu nhập tay không có mã thiết bị: {r.manualRecords})</p> : (
                <ol className="space-y-1.5 text-sm">{r.byEquipment.slice(0, 8).map((e: Report, i: number) => (
                  <li key={e.equipmentId} className="flex justify-between gap-3"><span className="text-gray-700"><span className="text-gray-400 mr-2">{i + 1}.</span>{e.name}</span><span className="font-semibold whitespace-nowrap">{e.times} lượt</span></li>
                ))}</ol>
              )}
              <p className="text-xs text-gray-500 mt-3">{r.unusedEquipment.length} loại thiết bị chưa được mượn lần nào trong kỳ (xem trong file Excel).</p>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className={`${card} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Theo giáo viên</h3></div>
              <div className="overflow-x-auto max-h-80"><table className="w-full text-sm">
                <thead className="sticky top-0"><tr className="bg-gray-50">{["Giáo viên", "Phiếu", "Trễ", "Hỏng", "Mất"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">{r.byTeacher.map((t: Report) => <tr key={t.teacherName}><td className="px-3 py-2">{t.teacherName}</td><td className="px-3 py-2">{t.count}</td><td className={`px-3 py-2 ${t.late ? "text-rose-600 font-semibold" : "text-gray-400"}`}>{t.late}</td><td className="px-3 py-2">{t.damaged}</td><td className="px-3 py-2">{t.lost}</td></tr>)}</tbody>
              </table></div>
            </div>
            <div className={`${card} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-gray-100 flex justify-between"><h3 className="font-bold text-gray-900">Tình trạng kho hiện tại</h3><span className="text-sm text-gray-500">{money(r.summary.inventoryValue)}</span></div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="bg-gray-50">{["Môn", "Tốt", "Hỏng", "Sửa", "Mất", "Giá trị"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
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
  useEffect(() => { if (loggedIn) fetchEquipmentDetail(id).then(setD).catch((e) => setError(e.message)) }, [id, loggedIn])

  const wrap = (children: React.ReactNode) => <main className="pt-24 pb-20 px-4"><div className="max-w-2xl mx-auto">{children}</div></main>
  if (!loggedIn) return wrap(<div className="text-center py-16"><h1 className="text-xl font-bold text-gray-900 mb-2">Đăng nhập để xem thông tin thiết bị</h1><button onClick={login} className={btnPrimary}>Đăng nhập bằng Google</button></div>)
  if (error) return wrap(<div className="text-center py-16"><p className="text-gray-600 mb-3">{error}</p><button onClick={goHome} className={btnGhost}>Về trang chủ</button></div>)
  if (!d) return wrap(<p className="text-sm text-gray-400">Đang tải…</p>)
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
      {isAdmin && d.history && (
        <div className={`${card} p-5 mb-4`}>
          <h2 className="font-bold text-gray-900 mb-2">Lịch sử mượn gần đây</h2>
          {d.history.length === 0 ? <p className="text-sm text-gray-400">Chưa có</p> : <ul className="text-sm divide-y divide-gray-50">{d.history.map((h) => <li key={h.id} className="py-1.5 flex justify-between gap-2"><span>{h.teacherName} · {h.className} · ×{h.quantity}</span><span className="text-gray-500 text-xs whitespace-nowrap">{h.borrowDate} · {h.status}</span></li>)}</ul>}
          {!!d.maintenance?.length && (<><h2 className="font-bold text-gray-900 mt-4 mb-2">Bảo trì</h2><ul className="text-sm divide-y divide-gray-50">{d.maintenance.map((m) => <li key={m.id} className="py-1.5 flex justify-between gap-2"><span>{m.kind} ×{m.quantity}{m.content ? ` · ${m.content}` : ""}</span><span className="text-gray-500 text-xs whitespace-nowrap">{m.date} · {m.status}</span></li>)}</ul></>)}
        </div>
      )}
    </>,
  )
}
