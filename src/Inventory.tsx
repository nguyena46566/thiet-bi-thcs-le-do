// Phân hệ kho thiết bị (đợt 1): kho, nhập kho, trả thiết bị (hỏng/mất), điểm thi đua
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  fetchInventory, createEquipment, updateEquipment, deleteEquipment, fetchPurchases, createPurchase,
  fetchMyPoints, fetchAllPoints, fetchTeacherPoints, adjustPoints, unlockTeacher, returnRecord,
  type Equipment, type Purchase, type PenaltyEntry, type PointRules, type TeacherScore, type BorrowRecord,
} from "@/api"

import { printQrLabels, exportExcel } from "./Operations"

export type Subject = { id: string; name: string; color: string }

const money = (n: number) => `${(n || 0).toLocaleString("vi-VN")} đ`
const fieldBase = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 focus:border-[#1a3670] bg-white"
const field = `w-full ${fieldBase}`
const label = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold"
const todayIso = () => new Date().toLocaleDateString("sv-SE")
const isoToVn = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]}/${m[2]}/${m[1]}` : "" }
const fmtTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} my-8`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Đóng">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

const ErrorBox = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)

function useRules() {
  const [rules, setRules] = useState<PointRules | null>(null)
  useEffect(() => { fetch("/api/points/rules").then((r) => r.json()).then(setRules).catch(() => {}) }, [])
  return rules
}

// ===================================================================
// TRẢ THIẾT BỊ: ghi hỏng / mất
// ===================================================================
export function ReturnDialog({ record, subjects, onClose, onDone }: { record: BorrowRecord; subjects: Subject[]; onClose: () => void; onDone: () => void }) {
  const rules = useRules()
  const [inventory, setInventory] = useState<Equipment[]>([])
  const [rows, setRows] = useState<{ equipmentId: string; borrowed?: number; damaged: number; lost: number }[]>(
    (record.items || []).map((it) => ({ equipmentId: it.equipmentId, borrowed: it.quantity, damaged: 0, lost: 0 })),
  )
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { fetchInventory().then(setInventory).catch((e) => setError(e.message)) }, [])
  const byId = useMemo(() => new Map(inventory.map((e) => [e.id, e])), [inventory])

  // Ngày trễ (ước tính phía giao diện; máy chủ tính lại khi lưu)
  const lateDays = (() => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(record.returnDate)
    if (!m) return 0
    const due = new Date(+m[3], +m[2] - 1, +m[1]); const t = new Date(); t.setHours(0, 0, 0, 0)
    return Math.max(0, Math.round((t.getTime() - due.getTime()) / 864e5))
  })()
  const damaged = rows.reduce((s, r) => s + r.damaged, 0), lost = rows.reduce((s, r) => s + r.lost, 0)
  const comp = rows.reduce((s, r) => s + (r.damaged + r.lost) * (byId.get(r.equipmentId)?.unitPrice || 0), 0)
  const subjectEq = inventory.filter((e) => e.subjectId === record.subjectId && !rows.some((r) => r.equipmentId === e.id))

  const save = async () => {
    setBusy(true); setError("")
    try {
      await returnRecord(record.id, { items: rows.filter((r) => r.damaged || r.lost).map(({ equipmentId, damaged, lost }) => ({ equipmentId, damaged, lost })), note })
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }

  return (
    <Modal title="Xác nhận trả thiết bị" onClose={onClose} wide>
      <ErrorBox msg={error} />
      <div className="text-sm text-gray-700 mb-4 space-y-1">
        <div><strong>{record.teacherName}</strong> · lớp {record.className} · {subjects.find((s) => s.id === record.subjectId)?.name}</div>
        <div className="text-gray-500">{record.equipment}</div>
        <div>Hạn trả: <strong>{record.returnDate}</strong>{lateDays > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">Trễ {lateDays} ngày</span>}</div>
      </div>

      <div className="text-xs font-semibold text-gray-600 mb-2">Thiết bị hỏng / mất khi trả (để 0 nếu đầy đủ, nguyên vẹn)</div>
      <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-3 py-2">Thiết bị</th><th className="px-3 py-2 w-20">Mượn</th><th className="px-3 py-2 w-24">Hỏng</th><th className="px-3 py-2 w-24">Mất</th><th className="w-8" /></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-gray-400 text-center text-xs">Phiếu nhập tay không có mã thiết bị. Nếu có hỏng/mất, thêm thiết bị ở ô bên dưới.</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.equipmentId}>
                <td className="px-3 py-2">{byId.get(r.equipmentId)?.name || r.equipmentId}</td>
                <td className="px-3 py-2 text-center text-gray-500">{r.borrowed ?? "–"}</td>
                {(["damaged", "lost"] as const).map((k) => (
                  <td key={k} className="px-3 py-2"><input type="number" min={0} max={r.borrowed ?? 999} aria-label={k === "damaged" ? "Số hỏng" : "Số mất"} className={field} value={r[k]}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : x)))} /></td>
                ))}
                <td>{r.borrowed === undefined && <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 px-2" aria-label="Bỏ dòng">✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {subjectEq.length > 0 && (
        <select className={`${field} mb-3`} value="" aria-label="Thêm thiết bị hỏng hoặc mất" onChange={(e) => e.target.value && setRows([...rows, { equipmentId: e.target.value, damaged: 0, lost: 0 }])}>
          <option value="">+ Thêm thiết bị hỏng/mất khác của môn này…</option>
          {subjectEq.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      )}
      <label className={label} htmlFor="ret-note">Ghi chú tình trạng</label>
      <textarea id="ret-note" className={`${field} mb-4`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: vỡ 1 vật kính, đã lập biên bản" />

      {rules && (lateDays > 0 || damaged > 0 || lost > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900 mb-4 space-y-1">
          <div className="font-semibold">Theo quy chế, khi lưu hệ thống sẽ:</div>
          {lateDays > 0 && <div>• Trả trễ {lateDays} ngày: nhắc nhở nếu là lần đầu trong năm học; từ lần 2 trừ {Math.min(rules.lateMaxPerRecord, lateDays * rules.latePerDay)} điểm.</div>}
          {damaged > 0 && <div>• Làm hỏng {damaged} thiết bị: trừ {damaged * rules.damagePerUnit} điểm.</div>}
          {lost > 0 && <div>• Làm mất {lost} thiết bị: trừ {lost * rules.lossPerUnit} điểm.</div>}
          {comp > 0 && <div>• Giá trị bồi thường theo đơn giá: <strong>{money(comp)}</strong>.</div>}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={btnGhost}>Hủy</button>
        <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Đang lưu…" : "Xác nhận đã trả"}</button>
      </div>
    </Modal>
  )
}

// ===================================================================
// KHO THIẾT BỊ
// ===================================================================
const emptyEq = (subjectId: string): Partial<Equipment> => ({ name: "", subjectId, grades: [], keywords: [], location: "", unitPrice: 0, qtyGood: 0, qtyBroken: 0, qtyLost: 0, qtyRepair: 0, note: "", unit: "Cái", origin: "Việt Nam", fundSource: "Ngân sách", yearInUse: new Date().getFullYear() })

function EquipmentForm({ initial, subjects, onClose, onSaved }: { initial: Partial<Equipment>; subjects: Subject[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Equipment>>(initial)
  const [kw, setKw] = useState((initial.keywords || []).join(", "))
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const num = (k: keyof Equipment) => (
    <input type="number" min={0} className={field} value={Number(f[k] ?? 0)} onChange={(e) => setF({ ...f, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
  )
  const save = async () => {
    setBusy(true); setError("")
    try {
      const body = { ...f, keywords: kw.split(",").map((s) => s.trim()).filter(Boolean) }
      if (initial.id) await updateEquipment(initial.id, body); else await createEquipment(body)
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  return (
    <Modal title={initial.id ? "Sửa thiết bị" : "Thêm thiết bị"} onClose={onClose}>
      <ErrorBox msg={error} />
      <div className="space-y-3">
        <div><label className={label}>Tên thiết bị *</label><input className={field} value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Môn học *</label>
            <select className={field} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </div>
          <div><label className={label}>Đơn giá (đồng)</label>{num("unitPrice")}</div>
        </div>
        <div>
          <span className={label}>Khối lớp sử dụng</span>
          <div className="flex gap-3">{[6, 7, 8, 9].map((g) => (
            <label key={g} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={(f.grades || []).includes(g)} onChange={(e) => setF({ ...f, grades: e.target.checked ? [...(f.grades || []), g].sort() : (f.grades || []).filter((x) => x !== g) })} />Lớp {g}</label>
          ))}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div><label className={label}>Tốt</label>{num("qtyGood")}</div>
          <div><label className={label}>Hỏng</label>{num("qtyBroken")}</div>
          <div><label className={label}>Đang sửa</label>{num("qtyRepair")}</div>
          <div><label className={label}>Mất</label>{num("qtyLost")}</div>
        </div>
        {initial.id && <p className="text-xs text-gray-500 -mt-1">Số lượng sửa ở đây là điều chỉnh trực tiếp. Mua thêm nên dùng “Nhập kho” để lưu chứng từ.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div><label className={label}>Đơn vị tính</label><input className={field} value={f.unit ?? ""} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="Cái, Bộ…" /></div>
          <div><label className={label}>Nước sản xuất</label><input className={field} value={f.origin ?? ""} onChange={(e) => setF({ ...f, origin: e.target.value })} /></div>
          <div><label className={label}>Năm sử dụng</label><input type="number" min={1990} max={2100} className={field} value={f.yearInUse ?? ""} onChange={(e) => setF({ ...f, yearInUse: e.target.value ? Number(e.target.value) : null })} /></div>
          <div><label className={label}>Nguồn kinh phí</label><select className={field} value={f.fundSource || "Ngân sách"} onChange={(e) => setF({ ...f, fundSource: e.target.value })}>{["Ngân sách", "Xã hội hóa", "Tài trợ", "Khác"].map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        <div><label className={label}>Vị trí cất</label><input className={field} value={f.location || ""} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="VD: Phòng thiết bị – Tủ Lí 2" /></div>
        <div><label className={label}>Từ khóa (giúp trợ lý AI tìm, cách nhau bằng dấu phẩy)</label><input className={field} value={kw} onChange={(e) => setKw(e.target.value)} /></div>
        <div><label className={label}>Ghi chú</label><input className={field} value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className={btnGhost}>Hủy</button>
        <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Đang lưu…" : "Lưu"}</button>
      </div>
    </Modal>
  )
}

export function InventoryTab({ subjects }: { subjects: Subject[] }) {
  const [list, setList] = useState<Equipment[] | null>(null)
  const [q, setQ] = useState("")
  const [subject, setSubject] = useState("")
  const [onlyIssue, setOnlyIssue] = useState(false)
  const [editing, setEditing] = useState<Partial<Equipment> | null>(null)
  const [error, setError] = useState("")
  const [pageNo, setPageNo] = useState(1)
  const PAGE = 20
  const load = useCallback(() => { fetchInventory().then(setList).catch((e) => setError(e.message)) }, [])
  useEffect(() => { setPageNo(1) }, [q, subject, onlyIssue])
  useEffect(() => { load() }, [load])

  const shown = (list || []).filter((e) =>
    (!subject || e.subjectId === subject) &&
    (!onlyIssue || e.qtyBroken > 0 || e.qtyLost > 0 || e.qtyRepair > 0) &&
    (!q || [e.name, e.location, e.id].some((v) => (v || "").toLowerCase().includes(q.toLowerCase()))))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const pageItems = shown.slice((pageNo - 1) * PAGE, pageNo * PAGE)
  const exportList = () => exportExcel("Danh-muc-thiet-bi.xlsx", [{ name: "Danh mục thiết bị", rows: shown.map((e, i) => ({
    "STT": i + 1, "Mã thiết bị": e.id, "Tên thiết bị": e.name, "Môn": subjects.find((s) => s.id === e.subjectId)?.name, "Khối": (e.grades || []).join(", "), "ĐVT": e.unit || "",
    "Nước SX": e.origin || "", "Năm SD": e.yearInUse || "", "Nguồn KP": e.fundSource || "", "Tốt": e.qtyGood, "Hỏng": e.qtyBroken, "Đang sửa": e.qtyRepair, "Mất": e.qtyLost,
    "Đơn giá (đ)": e.unitPrice || 0, "Thành tiền (đ)": (e.qtyGood + e.qtyBroken + e.qtyRepair) * (e.unitPrice || 0), "Vị trí": e.location })) }])
  const sum = (k: "qtyGood" | "qtyBroken" | "qtyLost" | "qtyRepair") => shown.reduce((s, e) => s + e[k], 0)
  const value = shown.reduce((s, e) => s + (e.qtyGood + e.qtyBroken + e.qtyRepair) * e.unitPrice, 0)
  const noPrice = shown.filter((e) => !e.unitPrice).length

  const remove = async (e: Equipment) => {
    if (!confirm(`Xóa thiết bị “${e.name}” khỏi kho?`)) return
    try { await deleteEquipment(e.id); load() } catch (err) { alert(err instanceof Error ? err.message : "Lỗi") }
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          ["Loại thiết bị", String(shown.length), "bg-white border-gray-200"],
          ["Còn tốt", String(sum("qtyGood")), "bg-green-50 border-green-200 text-green-800"],
          ["Hỏng / đang sửa", `${sum("qtyBroken")} / ${sum("qtyRepair")}`, "bg-amber-50 border-amber-200 text-amber-800"],
          ["Mất", String(sum("qtyLost")), "bg-rose-50 border-rose-200 text-rose-800"],
          ["Giá trị tài sản", money(value), "bg-blue-50 border-blue-200 text-blue-800"],
        ].map(([l, v, c]) => <div key={l} className={`border rounded-xl px-4 py-3 ${c}`}><div className="text-xl font-bold truncate">{v}</div><div className="text-xs opacity-80">{l}</div></div>)}
      </div>
      {noPrice > 0 && <p className="text-xs text-gray-500 mb-3">{noPrice} thiết bị chưa có đơn giá, nên giá trị tài sản và tiền bồi thường chưa đầy đủ. Bấm “Sửa” để nhập đơn giá.</p>}
      <ErrorBox msg={error} />
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <input type="search" aria-label="Tìm thiết bị" placeholder="Tìm mã, tên, vị trí…" className={`${fieldBase} w-full sm:w-60`} value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Lọc theo môn" className={fieldBase} value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Tất cả môn</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600"><input type="checkbox" checked={onlyIssue} onChange={(e) => setOnlyIssue(e.target.checked)} />Chỉ thiết bị có hỏng/mất/đang sửa</label>
          <button onClick={exportList} disabled={!shown.length} className={`${btnGhost} ml-auto`}>Xuất Excel</button>
          <button onClick={() => printQrLabels(shown, subjects)} disabled={!shown.length} className={btnGhost} title="In nhãn mã QR cho các thiết bị đang hiển thị">In nhãn QR ({shown.length})</button>
          <button onClick={() => setEditing(emptyEq(subject || subjects[0].id))} className={btnPrimary}>+ Thêm thiết bị</button>
        </div>
        {list === null ? <p className="p-6 text-sm text-gray-400">Đang tải…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {["Mã", "Thiết bị", "Môn", "ĐVT", "Tốt", "Hỏng", "Đang sửa", "Mất", "Đơn giá", "Vị trí", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {pageItems.map((e) => {
                  const s = subjects.find((x) => x.id === e.subjectId)
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2.5 text-[11px] text-gray-400 font-mono whitespace-nowrap">{e.id}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 min-w-[200px]">{e.name}{e.grades?.length ? <span className="block text-[11px] text-gray-400">Lớp {e.grades.join(", ")}</span> : null}</td>
                      <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white whitespace-nowrap" style={{ backgroundColor: s?.color || "#888" }}>{s?.name}</span></td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{e.unit || ""}</td>
                      <td className="px-3 py-2.5 font-semibold text-green-700">{e.qtyGood}</td>
                      <td className={`px-3 py-2.5 ${e.qtyBroken ? "text-amber-700 font-semibold" : "text-gray-400"}`}>{e.qtyBroken}</td>
                      <td className={`px-3 py-2.5 ${e.qtyRepair ? "text-amber-700 font-semibold" : "text-gray-400"}`}>{e.qtyRepair}</td>
                      <td className={`px-3 py-2.5 ${e.qtyLost ? "text-rose-700 font-semibold" : "text-gray-400"}`}>{e.qtyLost}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{e.unitPrice ? money(e.unitPrice) : <span className="text-gray-300">chưa có</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 min-w-[140px]">{e.location}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button onClick={() => setEditing(e)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700">Sửa</button>
                        <button onClick={() => remove(e)} className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50">Xóa</button>
                      </td>
                    </tr>
                  )
                })}
                {shown.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">Không có thiết bị phù hợp</td></tr>}
              </tbody>
            </table>
            {pages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-500">{(pageNo - 1) * PAGE + 1}–{Math.min(pageNo * PAGE, shown.length)} / {shown.length} thiết bị</span>
                <div className="flex gap-1">
                  <button disabled={pageNo === 1} onClick={() => setPageNo(pageNo - 1)} className="px-3 py-1 rounded-lg bg-gray-100 disabled:opacity-40">‹ Trước</button>
                  <span className="px-3 py-1">Trang {pageNo}/{pages}</span>
                  <button disabled={pageNo === pages} onClick={() => setPageNo(pageNo + 1)} className="px-3 py-1 rounded-lg bg-gray-100 disabled:opacity-40">Sau ›</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {editing && <EquipmentForm initial={editing} subjects={subjects} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

// ===================================================================
// NHẬP KHO (MUA MỚI)
// ===================================================================
export function PurchasesTab({ subjects }: { subjects: Subject[] }) {
  const [inventory, setInventory] = useState<Equipment[]>([])
  const [list, setList] = useState<Purchase[] | null>(null)
  const [date, setDate] = useState(todayIso())
  const [supplier, setSupplier] = useState("")
  const [note, setNote] = useState("")
  const [rows, setRows] = useState<{ equipmentId: string; quantity: number; unitPrice: number }[]>([{ equipmentId: "", quantity: 1, unitPrice: 0 }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [ok, setOk] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const load = useCallback(() => {
    fetchInventory().then(setInventory).catch(() => {})
    fetchPurchases().then(setList).catch((e) => setError(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  const total = rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0)
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const save = async () => {
    setBusy(true); setError(""); setOk("")
    try {
      const items = rows.filter((r) => r.equipmentId)
      const p = await createPurchase({ date: isoToVn(date), supplier, note, items })
      setOk(`Đã nhập kho ${p.items.length} thiết bị, tổng ${money(p.total)}.`)
      setRows([{ equipmentId: "", quantity: 1, unitPrice: 0 }]); setSupplier(""); setNote("")
      load()
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  const grandTotal = (list || []).reduce((s, p) => s + p.total, 0)

  return (
    <div className="grid lg:grid-cols-5 gap-5 items-start">
      <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 mb-1">Lập phiếu nhập kho</h3>
        <p className="text-xs text-gray-500 mb-4">Dùng khi mua mới hoặc được cấp thêm thiết bị. Số lượng được cộng vào mục “Tốt”, đơn giá của thiết bị được cập nhật.</p>
        <ErrorBox msg={error} />
        {ok && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-3">{ok}</div>}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={label} htmlFor="p-date">Ngày nhập *</label><input id="p-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className={label} htmlFor="p-sup">Nhà cung cấp</label><input id="p-sup" className={field} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        </div>
        <div className="space-y-2 mb-2">
          {rows.map((r, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-3">
              <select aria-label="Thiết bị" className={`${field} mb-2`} value={r.equipmentId} onChange={(e) => setRow(i, { equipmentId: e.target.value, unitPrice: inventory.find((x) => x.id === e.target.value)?.unitPrice || 0 })}>
                <option value="">Chọn thiết bị…</option>
                {subjects.map((s) => (
                  <optgroup key={s.id} label={s.name}>{inventory.filter((e) => e.subjectId === s.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
                ))}
              </select>
              <div className="flex gap-2 items-end">
                <div className="w-24"><label className={label}>Số lượng</label><input type="number" min={1} className={field} value={r.quantity} onChange={(e) => setRow(i, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></div>
                <div className="flex-1"><label className={label}>Đơn giá (đ)</label><input type="number" min={0} className={field} value={r.unitPrice} onChange={(e) => setRow(i, { unitPrice: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></div>
                {rows.length > 1 && <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="px-2 py-2 text-gray-400 hover:text-red-600" aria-label="Xóa dòng">✕</button>}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setRows([...rows, { equipmentId: "", quantity: 1, unitPrice: 0 }])} className="text-sm font-semibold text-[#1a3670] hover:underline mb-3">+ Thêm dòng</button>
        <div><label className={label} htmlFor="p-note">Ghi chú / số chứng từ</label><input id="p-note" className={`${field} mb-4`} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="flex items-center justify-between">
          <div className="text-sm">Tổng tiền: <strong className="text-[#1a3670]">{money(total)}</strong></div>
          <button onClick={save} disabled={busy || !rows.some((r) => r.equipmentId)} className={btnPrimary}>{busy ? "Đang lưu…" : "Lưu phiếu nhập"}</button>
        </div>
      </div>

      <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Lịch sử nhập kho</h3>
          <span className="text-sm text-gray-500">Tổng chi: <strong className="text-gray-800">{money(grandTotal)}</strong></span>
        </div>
        {list === null ? <p className="p-6 text-sm text-gray-400">Đang tải…</p> : list.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">Chưa có phiếu nhập kho nào</p> : (
          <ul className="divide-y divide-gray-50">
            {list.map((p) => (
              <li key={p.id} className="px-5 py-3">
                <button onClick={() => setOpen(open === p.id ? null : p.id)} className="w-full text-left flex flex-wrap items-center justify-between gap-2" aria-expanded={open === p.id}>
                  <span><strong className="text-gray-900">{p.date}</strong> · {p.supplier || "Không ghi nhà cung cấp"} <span className="text-gray-400 text-xs">({p.items.length} thiết bị, người lập: {p.createdBy})</span></span>
                  <span className="font-semibold text-[#1a3670]">{money(p.total)}</span>
                </button>
                {open === p.id && (
                  <table className="w-full text-xs mt-2 bg-gray-50 rounded-lg">
                    <tbody>{p.items.map((it, i) => <tr key={i}><td className="px-3 py-1.5">{it.name}</td><td className="px-3 py-1.5 text-right">{it.quantity} × {money(it.unitPrice)}</td><td className="px-3 py-1.5 text-right font-semibold">{money(it.amount || 0)}</td></tr>)}</tbody>
                  </table>
                )}
                {open === p.id && p.note && <p className="text-xs text-gray-500 mt-1">Ghi chú: {p.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ===================================================================
// ĐIỂM THI ĐUA
// ===================================================================
const KIND_LABEL: Record<string, string> = { late: "Trả trễ", damage: "Làm hỏng", loss: "Làm mất", manual: "Điều chỉnh" }

function History({ items }: { items: PenaltyEntry[] }) {
  if (!items.length) return <p className="text-sm text-gray-400">Chưa có lần trừ/cộng điểm nào trong năm học.</p>
  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {items.map((p) => (
        <li key={p.id} className="py-2 flex items-start justify-between gap-3">
          <div><span className="text-xs font-semibold text-gray-500 mr-2">{KIND_LABEL[p.kind]}</span>{p.reason}
            <div className="text-[11px] text-gray-400">{fmtTime(p.createdAt)}{p.compensation ? ` · bồi thường ${money(p.compensation)}` : ""}{p.createdBy ? ` · ${p.createdBy}` : ""}</div>
          </div>
          <span className={`font-bold whitespace-nowrap ${p.points < 0 ? "text-rose-600" : p.points > 0 ? "text-green-600" : "text-gray-400"}`}>{p.points > 0 ? "+" : ""}{p.points}</span>
        </li>
      ))}
    </ul>
  )
}

function RulesBox({ rules }: { rules: PointRules }) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-900 space-y-0.5">
      <div className="font-semibold text-sm mb-1">Quy chế điểm thi đua</div>
      <div>Đầu năm học mỗi giáo viên có {rules.startPoints} điểm. Dưới {rules.lockBelow} điểm tạm khóa quyền đăng ký mượn.</div>
      <div>Trả trễ: lần đầu nhắc nhở; từ lần 2 trừ {rules.latePerDay} điểm/ngày, tối đa {rules.lateMaxPerRecord} điểm/phiếu.</div>
      <div>Làm hỏng: trừ {rules.damagePerUnit} điểm/thiết bị. Làm mất: trừ {rules.lossPerUnit} điểm/thiết bị. Kèm bồi thường theo đơn giá.</div>
    </div>
  )
}

export function PointsTab() {
  const [data, setData] = useState<{ teachers: TeacherScore[]; rules: PointRules; schoolYear: string } | null>(null)
  const [error, setError] = useState("")
  const [detail, setDetail] = useState<{ t: TeacherScore; history: PenaltyEntry[] } | null>(null)
  const [adjust, setAdjust] = useState<TeacherScore | null>(null)
  const [pts, setPts] = useState(-5)
  const [reason, setReason] = useState("")
  const load = useCallback(() => { fetchAllPoints().then(setData).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])

  const openDetail = async (t: TeacherScore) => {
    try { const r = await fetchTeacherPoints(t.userId); setDetail({ t, history: r.history }) } catch (e) { alert(e instanceof Error ? e.message : "Lỗi") }
  }
  const unlock = async (t: TeacherScore) => {
    if (!confirm(`Mở khóa quyền mượn cho ${t.teacherName}? Điểm sẽ được đưa về ${data?.rules.lockBelow}.`)) return
    try { await unlockTeacher({ userId: t.userId, teacherName: t.teacherName }); load() } catch (e) { alert(e instanceof Error ? e.message : "Lỗi") }
  }
  const saveAdjust = async () => {
    if (!adjust) return
    try { await adjustPoints({ userId: adjust.userId, teacherName: adjust.teacherName, points: pts, reason }); setAdjust(null); setReason(""); load() }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }

  if (!data) return <div className="text-sm text-gray-400">{error || "Đang tải…"}</div>
  return (
    <div className="space-y-4">
      <RulesBox rules={data.rules} />
      <ErrorBox msg={error} />
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Điểm thi đua năm học {data.schoolYear}</h3>
          <span className="text-sm text-gray-500">{data.teachers.length} giáo viên</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">{["Giáo viên", "Số phiếu", "Trễ hạn", "Hỏng", "Mất", "Điểm", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {data.teachers.map((t) => (
                <tr key={t.userId} className={t.locked ? "bg-rose-50/50" : ""}>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{t.teacherName}{t.locked && <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">Tạm khóa</span>}</td>
                  <td className="px-3 py-2.5 text-gray-600">{t.records}</td>
                  <td className="px-3 py-2.5 text-gray-600">{t.late}</td>
                  <td className="px-3 py-2.5 text-gray-600">{t.damaged}</td>
                  <td className="px-3 py-2.5 text-gray-600">{t.lost}</td>
                  <td className={`px-3 py-2.5 font-bold ${t.score < data.rules.lockBelow ? "text-rose-600" : t.score < data.rules.startPoints ? "text-amber-600" : "text-green-700"}`}>{t.score}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <button onClick={() => openDetail(t)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700">Lịch sử</button>
                    <button onClick={() => { setAdjust(t); setPts(-5); setReason("") }} className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700">Điều chỉnh</button>
                    {t.locked && <button onClick={() => unlock(t)} className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white">Mở khóa</button>}
                  </td>
                </tr>
              ))}
              {data.teachers.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Chưa có giáo viên nào</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {detail && <Modal title={`Lịch sử điểm – ${detail.t.teacherName}`} onClose={() => setDetail(null)}><History items={detail.history} /></Modal>}
      {adjust && (
        <Modal title={`Điều chỉnh điểm – ${adjust.teacherName}`} onClose={() => setAdjust(null)}>
          <p className="text-sm text-gray-600 mb-3">Điểm hiện tại: <strong>{adjust.score}</strong>. Nhập số âm để trừ, số dương để cộng.</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className={label} htmlFor="adj-pts">Số điểm</label><input id="adj-pts" type="number" min={-100} max={100} className={field} value={pts} onChange={(e) => setPts(Math.trunc(Number(e.target.value) || 0))} /></div>
            <div className="col-span-2"><label className={label} htmlFor="adj-r">Lý do *</label><input id="adj-r" className={field} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Vi phạm nội quy phòng thiết bị" /></div>
          </div>
          <div className="flex justify-end gap-2"><button onClick={() => setAdjust(null)} className={btnGhost}>Hủy</button><button onClick={saveAdjust} disabled={!reason.trim() || !pts} className={btnPrimary}>Lưu</button></div>
        </Modal>
      )}
    </div>
  )
}

// Thẻ điểm của giáo viên trên trang “Phiếu của tôi”
export function MyPointsCard() {
  const [d, setD] = useState<{ score: number; locked: boolean; history: PenaltyEntry[]; rules: PointRules; schoolYear: string } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { fetchMyPoints().then(setD).catch(() => {}) }, [])
  if (!d) return null
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 mb-4 ${d.locked ? "bg-rose-50 border-rose-200" : "bg-white border-gray-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-gray-500">Điểm thi đua năm học {d.schoolYear}</div>
          <div className={`text-3xl font-extrabold ${d.locked ? "text-rose-600" : d.score < d.rules.startPoints ? "text-amber-600" : "text-green-700"}`}>{d.score}<span className="text-base text-gray-400 font-semibold">/{d.rules.startPoints}</span></div>
        </div>
        <button onClick={() => setOpen(!open)} className="text-sm font-semibold text-[#1a3670] hover:underline" aria-expanded={open}>{open ? "Ẩn chi tiết" : "Xem chi tiết và quy chế"}</button>
      </div>
      {d.locked && <p className="text-sm text-rose-700 mt-2">Tài khoản đang tạm khóa quyền đăng ký mượn do điểm dưới {d.rules.lockBelow}. Vui lòng liên hệ phòng thiết bị.</p>}
      {open && <div className="mt-4 space-y-3"><RulesBox rules={d.rules} /><History items={d.history} /></div>}
    </div>
  )
}
