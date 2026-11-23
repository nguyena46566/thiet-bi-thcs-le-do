// Phòng bộ môn và đề xuất mua sắm
import { useCallback, useEffect, useState } from "react"
import {
  fetchRooms, createRoom, updateRoom, deleteRoom, fetchProposals, createProposal, decideProposal, markProposalPurchased,
  type Room, type Proposal, type ProposalItem,
} from "@/api"
import type { Subject } from "./Inventory"

const money = (n: number) => `${(n || 0).toLocaleString("vi-VN")} đ`
const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/50 focus:border-[#1a3670] bg-white"
const label = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const card = "bg-white rounded-2xl shadow-sm border border-gray-100"
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)
const STATUS_CLS: Record<string, string> = { "Chờ duyệt": "bg-amber-50 text-amber-700", "Đã duyệt": "bg-blue-50 text-blue-700", "Từ chối": "bg-red-50 text-red-700", "Đã mua": "bg-green-50 text-green-700" }

// ===================================================================
// PHÒNG BỘ MÔN (danh mục)
// ===================================================================
export function RoomsTab({ subjects }: { subjects: Subject[] }) {
  const [list, setList] = useState<Room[] | null>(null)
  const [f, setF] = useState<Partial<Room> & { id?: string }>({ name: "", kind: "Phòng học bộ môn", subjectIds: [], note: "" })
  const [error, setError] = useState("")
  const load = useCallback(() => { fetchRooms().then(setList).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setError("")
    try { if (f.id) await updateRoom(f.id, f); else await createRoom(f); setF({ name: "", kind: "Phòng học bộ môn", subjectIds: [], note: "" }); load() }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const remove = async (r: Room) => {
    if (!confirm(`Xóa “${r.name}”?`)) return
    try { await deleteRoom(r.id); load() } catch (e) { alert(e instanceof Error ? e.message : "Lỗi") }
  }
  return (
    <div className="grid lg:grid-cols-5 gap-5 items-start">
      <div className={`lg:col-span-2 ${card} p-5`}>
        <h2 className="font-bold text-gray-900 mb-1">{f.id ? "Sửa phòng" : "Thêm phòng bộ môn"}</h2>
        <p className="text-xs text-gray-500 mb-4">Giáo viên chọn phòng khi đăng ký mượn; hệ thống không cho hai lớp dùng cùng phòng ở cùng tiết.</p>
        <Err msg={error} />
        <div className="space-y-3">
          <div><label className={label} htmlFor="rm-name">Tên phòng *</label><input id="rm-name" className={field} value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="VD: Phòng thực hành Vật lí" /></div>
          <div><label className={label} htmlFor="rm-kind">Loại</label><select id="rm-kind" className={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["Phòng học bộ môn", "Phòng thí nghiệm", "Phòng Tin học", "Phòng đa chức năng", "Nhà đa năng / sân tập", "Khác"].map((k) => <option key={k}>{k}</option>)}</select></div>
          <div><span className={label}>Dùng cho môn</span>
            <div className="grid grid-cols-2 gap-1.5">{subjects.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={(f.subjectIds || []).includes(s.id)} onChange={(e) => setF({ ...f, subjectIds: e.target.checked ? [...(f.subjectIds || []), s.id] : (f.subjectIds || []).filter((x) => x !== s.id) })} />{s.name}</label>
            ))}</div>
          </div>
          <div><label className={label} htmlFor="rm-note">Ghi chú</label><input id="rm-note" className={field} value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="VD: Tầng 2 nhà B, 45 chỗ" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          {f.id && <button onClick={() => setF({ name: "", kind: "Phòng học bộ môn", subjectIds: [], note: "" })} className={btnGhost}>Hủy sửa</button>}
          <button onClick={save} disabled={!f.name?.trim()} className={btnPrimary}>{f.id ? "Lưu" : "Thêm phòng"}</button>
        </div>
      </div>
      <div className={`lg:col-span-3 ${card} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Danh sách phòng ({list?.length ?? 0})</h2></div>
        {list === null ? <p className="p-6 text-sm text-gray-500">Đang tải…</p> : list.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Chưa có phòng nào</p> : (
          <ul className="divide-y divide-gray-50">{list.map((r) => (
            <li key={r.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
              <div><div className="font-medium text-gray-900">{r.name} <span className="text-xs text-gray-500 font-normal">· {r.kind}</span>{r.subjectIds.length > 1 && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700" title="Thông tư 23/2024/TT-BGDĐT cho phép ghép phòng học bộ môn có chức năng tương đồng, phải bảo đảm đủ thiết bị và thời gian dạy học">Phòng ghép {r.subjectIds.length} môn</span>}</div>
                <div className="text-xs text-gray-500">{r.subjectIds.map((id) => subjects.find((s) => s.id === id)?.name).filter(Boolean).join(", ") || "Mọi môn"}{r.note ? ` · ${r.note}` : ""}</div></div>
              <div className="flex gap-1"><button onClick={() => setF(r)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200">Sửa</button><button onClick={() => remove(r)} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50">Xóa</button></div>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  )
}

// ===================================================================
// ĐỀ XUẤT MUA SẮM
// ===================================================================
const emptyItem = (): ProposalItem => ({ name: "", subjectId: "", quantity: 1, estPrice: 0, reason: "" })

/** Form giáo viên / tổ trưởng gửi đề xuất + danh sách đề xuất của mình */
export function MyProposals({ subjects }: { subjects: Subject[] }) {
  const [list, setList] = useState<Proposal[] | null>(null)
  const [open, setOpen] = useState(false)
  const [purpose, setPurpose] = useState("")
  const [items, setItems] = useState<ProposalItem[]>([emptyItem()])
  const [error, setError] = useState("")
  const load = useCallback(() => { fetchProposals(true).then((r) => setList(r.proposals)).catch(() => setList([])) }, [])
  useEffect(() => { load() }, [load])
  const setItem = (i: number, p: Partial<ProposalItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const send = async () => {
    setError("")
    try { await createProposal({ purpose, items: items.filter((x) => x.name.trim()) }); setOpen(false); setPurpose(""); setItems([emptyItem()]); load() }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  return (
    <div className={`${card} p-4 sm:p-5 mt-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div><h2 className="font-bold text-gray-900">Đề xuất mua sắm thiết bị</h2><p className="text-xs text-gray-500">Thiếu hoặc hỏng thiết bị cho bài dạy? Gửi đề xuất để Ban giám hiệu xem xét.</p></div>
        {!open && <button onClick={() => setOpen(true)} className={btnPrimary}>+ Đề xuất mới</button>}
      </div>
      {open && (
        <div className="border border-gray-100 rounded-xl p-4 mb-3 space-y-3">
          <Err msg={error} />
          <div><label className={label} htmlFor="pp-purpose">Mục đích</label><input id="pp-purpose" className={field} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="VD: Bổ sung thiết bị thực hành Sinh học lớp 7" /></div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
              <div className="col-span-2"><label className={label}>Tên thiết bị *</label><input className={field} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} /></div>
              <div><label className={label}>Môn</label><select className={field} value={it.subjectId} onChange={(e) => setItem(i, { subjectId: e.target.value })}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className={label}>Số lượng</label><input type="number" min={1} className={field} value={it.quantity} onChange={(e) => setItem(i, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></div>
              <div><label className={label}>Đơn giá dự kiến</label><input type="number" min={0} className={field} value={it.estPrice} onChange={(e) => setItem(i, { estPrice: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></div>
              <div><label className={label}>Lý do</label><input className={field} value={it.reason} onChange={(e) => setItem(i, { reason: e.target.value })} /></div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setItems([...items, emptyItem()])} className="text-sm font-semibold text-[#1a3670] hover:underline">+ Thêm dòng</button>
            <div className="flex items-center gap-2"><span className="text-sm">Dự kiến: <strong>{money(items.reduce((a, x) => a + x.quantity * x.estPrice, 0))}</strong></span>
              <button onClick={() => setOpen(false)} className={btnGhost}>Hủy</button><button onClick={send} disabled={!items.some((x) => x.name.trim())} className={btnPrimary}>Gửi đề xuất</button></div>
          </div>
        </div>
      )}
      {list && list.length > 0 && (
        <ul className="divide-y divide-gray-50">{list.map((p) => (
          <li key={p.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2 text-sm">
            <div className="min-w-0"><div className="font-medium text-gray-900">{p.items.map((x) => `${x.name} ×${x.quantity}`).join(", ")}</div>
              <div className="text-xs text-gray-500">{fmt(p.createdAt)} · {money(p.total)}{p.decisionNote ? ` · BGH: ${p.decisionNote}` : ""}</div></div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_CLS[p.status]}`}>{p.status}</span>
          </li>
        ))}</ul>
      )}
    </div>
  )
}

/** Trang quản trị: danh sách đề xuất, Ban giám hiệu duyệt, nhân viên thiết bị đánh dấu đã mua */
export function ProposalsTab() {
  const [d, setD] = useState<{ proposals: Proposal[]; canDecide: boolean } | null>(null)
  const [filter, setFilter] = useState("Chờ duyệt")
  const [error, setError] = useState("")
  const load = useCallback(() => { fetchProposals().then(setD).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const decide = async (p: Proposal, approve: boolean) => {
    const note = prompt(approve ? "Ý kiến khi duyệt (có thể để trống):" : "Lý do không duyệt:", "")
    if (note === null) return
    try { await decideProposal(p.id, approve, note); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const bought = async (p: Proposal) => {
    const note = prompt("Ghi chú mua sắm (số hợp đồng, ngày giao…). Nhớ lập phiếu Ghi tăng để cộng vào kho.", "")
    if (note === null) return
    try { await markProposalPurchased(p.id, note); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  if (!d) return <p className="text-sm text-gray-500">{error || "Đang tải…"}</p>
  const shown = d.proposals.filter((p) => !filter || p.status === filter)
  const total = shown.reduce((a, p) => a + p.total, 0)
  return (
    <div className="space-y-4">
      <Err msg={error} />
      <div className="flex flex-wrap gap-2 items-center">
        {["Chờ duyệt", "Đã duyệt", "Đã mua", "Từ chối", ""].map((s) => (
          <button key={s || "all"} onClick={() => setFilter(s)} aria-pressed={filter === s} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === s ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            {s || "Tất cả"} ({d.proposals.filter((p) => !s || p.status === s).length})
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500">Tổng dự kiến: <strong className="text-gray-800">{money(total)}</strong></span>
      </div>
      {!d.canDecide && <p className="text-xs text-gray-500">Duyệt hoặc không duyệt do Ban giám hiệu thực hiện. Sau khi mua về, đánh dấu “Đã mua” và lập phiếu Ghi tăng.</p>}
      <div className={`${card} overflow-hidden`}>
        {shown.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Không có đề xuất</p> : (
          <ul className="divide-y divide-gray-50">{shown.map((p) => (
            <li key={p.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><div className="font-medium text-gray-900">{p.userName} <span className="text-xs text-gray-500 font-normal">· {fmt(p.createdAt)}</span></div>{p.purpose && <div className="text-sm text-gray-600">{p.purpose}</div>}</div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_CLS[p.status]}`}>{p.status}</span>
              </div>
              <table className="w-full text-sm mt-2"><tbody>{p.items.map((it, i) => (
                <tr key={i} className="border-t border-gray-50"><td className="py-1.5">{it.name}{it.reason && <span className="block text-[11px] text-gray-500">{it.reason}</span>}</td><td className="py-1.5 text-right whitespace-nowrap">{it.quantity} × {money(it.estPrice)}</td><td className="py-1.5 text-right font-semibold whitespace-nowrap w-32">{money(it.quantity * it.estPrice)}</td></tr>
              ))}</tbody></table>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <span className="text-xs text-gray-500">{p.decidedBy ? `BGH: ${p.decidedBy}${p.decisionNote ? ` – ${p.decisionNote}` : ""}` : ""}{p.purchaseNote ? ` · Mua: ${p.purchaseNote}` : ""}</span>
                <div className="flex gap-2">
                  {p.status === "Chờ duyệt" && d.canDecide && <><button onClick={() => decide(p, false)} className={btnGhost}>Không duyệt</button><button onClick={() => decide(p, true)} className={btnPrimary}>Duyệt</button></>}
                  {p.status === "Đã duyệt" && <button onClick={() => bought(p)} className={btnPrimary}>Đánh dấu đã mua</button>}
                </div>
              </div>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  )
}
