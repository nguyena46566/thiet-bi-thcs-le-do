// Hóa chất – vật tư tiêu hao (UC33), Kế hoạch năm học (UC35), Quyết định thành lập tổ / hội đồng (UC36)
import { useCallback, useEffect, useState } from "react"
import {
  fetchAlerts, fetchConsumptions, consume, fetchInventory, fetchPlans, createPlan, updatePlan, submitPlan, decidePlan, deletePlan,
  fetchDecisions, saveDecision, deleteDecision, fetchMinlist, fetchReport,
  type Equipment, type Consumption, type Plan, type PlanTask, type Decision, type Report,
} from "@/api"
import { printHtml, esc, para, table, dots } from "./printing"

const card = "bg-white rounded-2xl shadow-sm border border-gray-100"
const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 focus:border-[#1a3670] bg-white"
const label = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const th = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const todayIso = () => new Date().toLocaleDateString("sv-SE")
const isoToVn = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "" }
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)

// ===================================================================
// HÓA CHẤT – VẬT TƯ TIÊU HAO
// ===================================================================
export function ChemicalsTab({ go }: { go: (s: string) => void }) {
  const [al, setAl] = useState<{ expired: Equipment[]; expiringSoon: Equipment[]; lowStock: Equipment[]; noExpiry: Equipment[] } | null>(null)
  const [inv, setInv] = useState<Equipment[]>([])
  const [list, setList] = useState<Consumption[]>([])
  const [f, setF] = useState({ equipmentId: "", quantity: 1, receiver: "", purpose: "", date: todayIso() })
  const [error, setError] = useState("")
  const [ok, setOk] = useState("")
  const load = useCallback(() => {
    fetchAlerts().then(setAl).catch((e) => setError(e.message))
    fetchInventory().then(setInv).catch(() => {})
    fetchConsumptions().then(setList).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  const consumables = inv.filter((e) => e.kind === "Hóa chất" || e.kind === "Vật tư tiêu hao")
  const sel = consumables.find((e) => e.id === f.equipmentId)
  const box = (title: string, items: Equipment[], cls: string, extra: (e: Equipment) => string) => (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="font-semibold mb-1">{title} ({items.length})</div>
      {items.length === 0 ? <p className="text-xs opacity-70">Không có</p> : <ul className="text-sm space-y-0.5">{items.slice(0, 8).map((e) => <li key={e.id}>{e.name} <span className="text-xs opacity-80">· {extra(e)}</span></li>)}</ul>}
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-900">
        Hóa chất và vật tư tiêu hao được khai báo ở <button onClick={() => go("danh-muc")} className="font-semibold underline">Danh mục thiết bị</button> (chọn loại “Hóa chất” hoặc “Vật tư tiêu hao”, nhập hạn sử dụng, mức tồn tối thiểu).
        Hóa chất quá hạn tự động <strong>không cho mượn</strong>; khi tiêu hủy, dùng <button onClick={() => go("ghi-giam")} className="font-semibold underline">Ghi giảm</button> với lý do “Tiêu hủy (hóa chất hết hạn)”.
      </div>
      {al && (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          {box("Đã hết hạn", al.expired, "bg-red-50 border-red-200 text-red-800", (e) => `hạn ${e.expiry}, còn ${e.qtyGood} ${e.unit || ""}`)}
          {box("Sắp hết hạn (30 ngày)", al.expiringSoon, "bg-amber-50 border-amber-200 text-amber-900", (e) => `hạn ${e.expiry}`)}
          {box("Dưới mức tồn tối thiểu", al.lowStock, "bg-orange-50 border-orange-200 text-orange-900", (e) => `còn ${e.qtyGood}/${e.minStock}`)}
          {box("Hóa chất chưa ghi hạn dùng", al.noExpiry, "bg-gray-50 border-gray-200 text-gray-700", (e) => e.location || "")}
        </div>
      )}
      <div className="grid lg:grid-cols-5 gap-5 items-start">
        <div className={`lg:col-span-2 ${card} p-5`}>
          <h3 className="font-bold text-gray-900 mb-1">Phiếu xuất dùng</h3>
          <p className="text-xs text-gray-500 mb-4">Xuất hóa chất, vật tư cho tiết thực hành mà không phải trả lại. Khi giáo viên mượn qua phiếu, phần đã dùng được ghi lúc xác nhận trả.</p>
          <Err msg={error} />
          {ok && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-3">{ok}</div>}
          <div className="space-y-3">
            <div><label className={label} htmlFor="c-eq">Hóa chất / vật tư *</label>
              <select id="c-eq" className={field} value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>
                <option value="">Chọn…</option>
                {consumables.map((e) => <option key={e.id} value={e.id} disabled={e.expired}>{e.name} – còn {e.qtyGood} {e.unit || ""}{e.expired ? " (HẾT HẠN)" : e.expiry ? ` · hạn ${e.expiry}` : ""}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label} htmlFor="c-qty">Số lượng {sel?.unit ? `(${sel.unit})` : ""}</label><input id="c-qty" type="number" min={1} className={field} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></div>
              <div><label className={label} htmlFor="c-date">Ngày</label><input id="c-date" type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            </div>
            <div><label className={label} htmlFor="c-rec">Người nhận</label><input id="c-rec" className={field} value={f.receiver} onChange={(e) => setF({ ...f, receiver: e.target.value })} placeholder="VD: cô Ngọc Hồng" /></div>
            <div><label className={label} htmlFor="c-pur">Dùng cho</label><input id="c-pur" className={field} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="VD: lớp 9A2 – Bài 5 thực hành" /></div>
            {sel?.hazard && <p className="text-xs text-red-700 font-semibold">Lưu ý an toàn: {sel.hazard}</p>}
          </div>
          <div className="flex justify-end mt-4"><button disabled={!f.equipmentId} onClick={async () => { setError(""); setOk(""); try { const r = await consume({ ...f, date: isoToVn(f.date) }); setOk(`Đã xuất ${r.quantity} ${r.unit} ${r.name}.`); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }} className={btnPrimary}>Xuất dùng</button></div>
        </div>
        <div className={`lg:col-span-3 ${card} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Sổ theo dõi tiêu hao</h3></div>
          {list.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">Chưa có phiếu xuất dùng</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gray-50">{["Ngày", "Hóa chất / vật tư", "SL", "Người nhận", "Dùng cho", "Người xuất"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{list.map((c) => <tr key={c.id}><td className="px-3 py-2 text-xs whitespace-nowrap">{c.date}</td><td className="px-3 py-2">{c.name}</td><td className="px-3 py-2">{c.quantity} {c.unit}</td><td className="px-3 py-2">{c.receiver}</td><td className="px-3 py-2 text-xs">{c.purpose}</td><td className="px-3 py-2 text-xs">{c.createdBy}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===================================================================
// KẾ HOẠCH NĂM HỌC (UC35)
// ===================================================================
const SECTIONS: [string, string, string][] = [
  ["canCu", "Căn cứ", "Công văn hướng dẫn nhiệm vụ giáo dục trung học của Sở; kế hoạch giáo dục nhà trường; Thông tư 14/2020, Thông tư 38/2021 (sửa đổi bởi Thông tư 26/2023)…"],
  ["thuanLoi", "I.1. Thuận lợi", ""], ["khoKhan", "I.2. Khó khăn", ""],
  ["mucTieu", "II.1. Mục tiêu", ""], ["yeuCau", "II.2. Yêu cầu (cán bộ thiết bị, giáo viên)", ""],
  ["chiTieu", "III.1. Chỉ tiêu *", "VD: 100% giờ dạy khối 6–9 dùng thiết bị theo yêu cầu bài dạy; trả đúng hạn ≥ 95%…"],
  ["chiDao", "III.2.1. Chỉ đạo của cán bộ quản lý", ""], ["canBoThietBi", "III.2.2. Cán bộ quản lý thiết bị", ""],
  ["kinhPhi", "Dự toán kinh phí", "Lấy từ đề xuất mua sắm đã duyệt và kế hoạch sửa chữa"],
]
const STATUS_CLS: Record<string, string> = { "Nháp": "bg-gray-100 text-gray-700", "Chờ duyệt": "bg-amber-50 text-amber-800", "Đã duyệt": "bg-green-50 text-green-700", "Trả lại": "bg-red-50 text-red-700" }

async function autoSituation() {
  // Điền gợi ý phần tình hình từ số liệu trên web
  const [inv, ml] = await Promise.all([fetchInventory(), fetchMinlist().catch(() => null)])
  const good = inv.reduce((a, e) => a + e.qtyGood, 0), broken = inv.reduce((a, e) => a + e.qtyBroken + e.qtyRepair, 0)
  const items = ml?.items || [], ok = items.filter((i) => i.status === "Đủ").length
  return {
    thuanLoi: `Nhà trường quản lý ${inv.length} loại thiết bị với ${good} thiết bị còn tốt trên hệ thống quản lý thiết bị trực tuyến; giáo viên đăng ký mượn theo tiết, có lịch sử dụng phòng học bộ môn.`,
    khoKhan: `${broken} thiết bị đang hỏng hoặc đang sửa.${items.length ? ` Đối chiếu danh mục tối thiểu: ${ok}/${items.length} dòng đã đủ.` : ""}`,
  }
}

export function PlansTab() {
  const [d, setD] = useState<{ plans: Plan[]; canDecide: boolean } | null>(null)
  const [cur, setCur] = useState<Plan | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const load = useCallback(() => { fetchPlans().then((x) => { setD(x); setCur((c) => (c ? x.plans.find((p) => p.id === c.id) || null : null)) }).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  if (!d) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const editable = cur && (cur.status === "Nháp" || cur.status === "Trả lại")
  const act = async (fn: () => Promise<unknown>, msg = "") => { setError(""); setSaved(""); try { await fn(); setSaved(msg); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const setTask = (i: number, p: Partial<PlanTask>) => cur && setCur({ ...cur, tasks: cur.tasks.map((t, j) => (j === i ? { ...t, ...p } : t)) })
  const printPlan = (p: Plan) => printHtml({
    title: "Kế hoạch", subtitle: p.title.replace(/^Kế hoạch\s*/i, ""), number: p.number || "…/KH-THCSLĐ",
    body: `${p.sections.canCu ? `<p><i>Căn cứ:</i></p>${para(p.sections.canCu)}` : ""}
      <h2>I. ĐẶC ĐIỂM TÌNH HÌNH</h2><h2>1. Thuận lợi</h2>${para(p.sections.thuanLoi) || dots(2)}<h2>2. Khó khăn</h2>${para(p.sections.khoKhan) || dots(2)}
      <h2>II. MỤC TIÊU VÀ YÊU CẦU</h2><h2>1. Mục tiêu</h2>${para(p.sections.mucTieu) || dots(2)}<h2>2. Yêu cầu</h2>${para(p.sections.yeuCau) || dots(2)}
      <h2>III. NỘI DUNG</h2><h2>1. Chỉ tiêu</h2>${para(p.sections.chiTieu)}<h2>2. Kế hoạch thực hiện</h2><h2>2.1. Chỉ đạo của cán bộ quản lý</h2>${para(p.sections.chiDao) || dots(2)}
      <h2>2.2. Cán bộ quản lý thiết bị</h2>${para(p.sections.canBoThietBi) || dots(2)}
      <h2>2.3. Lịch công tác</h2>${table(["STT", "Nội dung công việc", "Thời gian", "Người thực hiện"], p.tasks.map((t, i) => [i + 1, t.name, t.start === t.end ? isoToVn(t.start) : `${isoToVn(t.start)} – ${isoToVn(t.end)}`, t.owner]))}
      ${p.sections.kinhPhi ? `<h2>IV. DỰ TOÁN KINH PHÍ</h2>${para(p.sections.kinhPhi)}` : ""}
      ${p.status === "Đã duyệt" ? `<p><i>Kế hoạch đã được duyệt bởi ${esc(p.decidedBy)}${p.decisionNote ? `: ${esc(p.decisionNote)}` : ""}.</i></p>` : ""}`,
    signs: [["Người lập kế hoạch", "(Ký, ghi rõ họ tên)"], ["Duyệt của Hiệu trưởng", "(Ký, đóng dấu)"]],
  })

  if (cur) {
    const done = cur.tasks.filter((t) => t.done).length
    return (
      <div className="space-y-4">
        <div className={`${card} p-5 flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-w-0"><div className="text-xs text-gray-500">Năm học {cur.schoolYear} · <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_CLS[cur.status]}`}>{cur.status}</span>{cur.decisionNote ? ` · Ý kiến: ${cur.decisionNote}` : ""}</div>
            <h3 className="font-bold text-gray-900">{cur.title}</h3></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCur(null)} className={btnGhost}>Đóng</button>
            <button onClick={() => printPlan(cur)} className={btnGhost}>In kế hoạch</button>
            {editable && <button onClick={() => act(() => updatePlan(cur.id, cur), "Đã lưu")} className={btnGhost}>Lưu</button>}
            {editable && <button onClick={() => act(async () => { await updatePlan(cur.id, cur); await submitPlan(cur.id) }, "Đã trình duyệt")} className={btnPrimary}>Trình duyệt</button>}
            {cur.status === "Chờ duyệt" && d.canDecide && <>
              <button onClick={() => { const n = prompt("Ý kiến khi trả lại (bắt buộc):", ""); if (n) act(() => decidePlan(cur.id, false, n)) }} className={btnGhost}>Trả lại</button>
              <button onClick={() => act(() => decidePlan(cur.id, true, prompt("Ý kiến khi duyệt (có thể để trống):", "") || ""), "Đã duyệt")} className={btnPrimary}>Duyệt</button></>}
            {cur.status === "Đã duyệt" && <button onClick={() => act(() => updatePlan(cur.id, { tasks: cur.tasks }), "Đã lưu tiến độ")} className={btnPrimary}>Lưu tiến độ</button>}
          </div>
        </div>
        <Err msg={error} />
        {saved && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">{saved}</div>}
        <div className={`${card} p-5 space-y-3`}>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2"><label className={label}>Tên kế hoạch</label><input disabled={!editable} className={field} value={cur.title} onChange={(e) => setCur({ ...cur, title: e.target.value })} /></div>
            <div><label className={label}>Số kế hoạch</label><input disabled={!editable} className={field} value={cur.number} placeholder="VD: 15/KH-THCSLĐ" onChange={(e) => setCur({ ...cur, number: e.target.value })} /></div>
          </div>
          {editable && <button onClick={async () => { const s = await autoSituation(); setCur({ ...cur, sections: { ...cur.sections, ...Object.fromEntries(Object.entries(s).filter(([k]) => !cur.sections[k])) } }) }} className="text-sm font-semibold text-[#1a3670] hover:underline">Điền gợi ý phần tình hình từ số liệu trên web</button>}
          {SECTIONS.map(([k, l, ph]) => (
            <div key={k}><label className={label}>{l}</label><textarea disabled={!editable} rows={k === "canCu" || k === "chiTieu" ? 3 : 2} className={field} placeholder={ph} value={cur.sections[k] || ""} onChange={(e) => setCur({ ...cur, sections: { ...cur.sections, [k]: e.target.value } })} /></div>
          ))}
        </div>
        <div className={`${card} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between"><h3 className="font-bold text-gray-900">Lịch công tác</h3><span className="text-sm text-gray-500">Đã xong {done}/{cur.tasks.length}</span></div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50">{["Xong", "Nội dung", "Bắt đầu", "Kết thúc", "Người thực hiện", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{cur.tasks.map((t, i) => (
              <tr key={t.id}>
                <td className="px-3 py-2"><input type="checkbox" aria-label={`Đã xong: ${t.name}`} checked={t.done} disabled={cur.status !== "Đã duyệt"} onChange={(e) => setTask(i, { done: e.target.checked })} /></td>
                <td className="px-3 py-2 min-w-[240px]">{editable ? <input className={field} value={t.name} onChange={(e) => setTask(i, { name: e.target.value })} /> : t.name}</td>
                <td className="px-3 py-2">{editable ? <input type="date" className={field} value={t.start} onChange={(e) => setTask(i, { start: e.target.value })} /> : isoToVn(t.start)}</td>
                <td className="px-3 py-2">{editable ? <input type="date" className={field} value={t.end} onChange={(e) => setTask(i, { end: e.target.value })} /> : isoToVn(t.end)}</td>
                <td className="px-3 py-2 min-w-[150px]">{editable ? <input className={field} value={t.owner} onChange={(e) => setTask(i, { owner: e.target.value })} /> : t.owner}</td>
                <td className="px-3 py-2">{editable && <button onClick={() => setCur({ ...cur, tasks: cur.tasks.filter((_, j) => j !== i) })} className="text-xs text-gray-400 hover:text-red-600">Xóa</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {editable && <div className="px-5 py-3 border-t border-gray-100"><button onClick={() => setCur({ ...cur, tasks: [...cur.tasks, { id: `new-${Date.now()}`, name: "", start: todayIso(), end: todayIso(), owner: "", done: false }] })} className="text-sm font-semibold text-[#1a3670] hover:underline">+ Thêm việc</button></div>}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <Err msg={error} />
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-gray-600">Nhân viên thiết bị lập kế hoạch, trình duyệt; Hiệu trưởng duyệt hoặc trả lại kèm ý kiến; sau khi duyệt, đánh dấu từng việc đã xong.</p>
        <button onClick={() => act(async () => { const p = await createPlan(); setCur(p) })} className={btnPrimary}>+ Lập kế hoạch năm học</button>
      </div>
      <div className={`${card} overflow-hidden`}>
        {d.plans.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">Chưa có kế hoạch nào</p> : (
          <ul className="divide-y divide-gray-50">{d.plans.map((p) => (
            <li key={p.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
              <div><div className="font-medium text-gray-900">{p.title}</div><div className="text-xs text-gray-500">{p.number || "Chưa có số"} · lập bởi {p.createdBy} · {p.tasks.filter((t) => t.done).length}/{p.tasks.length} việc đã xong</div></div>
              <div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_CLS[p.status]}`}>{p.status}</span>
                <button onClick={() => setCur(p)} className={btnGhost}>Mở</button>
                {p.status !== "Đã duyệt" && <button onClick={() => { if (confirm("Xóa kế hoạch này?")) act(() => deletePlan(p.id)) }} className="text-xs text-gray-400 hover:text-red-600">Xóa</button>}</div>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  )
}

// ===================================================================
// QUYẾT ĐỊNH THÀNH LẬP TỔ KIỂM KÊ / HỘI ĐỒNG (UC36)
// ===================================================================
const DEC_DUTIES: Record<string, string> = {
  "Tổ kiểm kê": "Kiểm kê toàn bộ thiết bị dạy học, hóa chất, vật tư theo sổ sách và thực tế; đánh giá chất lượng; lập biên bản kiểm kê và danh mục thiết bị hỏng, mất, đề nghị thanh lý; báo cáo Hiệu trưởng.",
  "Hội đồng thanh lý": "Kiểm tra thực tế các thiết bị đề nghị thanh lý; đánh giá tình trạng, giá trị còn lại; lập biên bản đề xuất hình thức thanh lý; trình Hiệu trưởng ra quyết định.",
  "Hội đồng tiếp nhận, bàn giao": "Kiểm tra, đối soát thiết bị được giao với danh mục, số lượng, thông số kỹ thuật, nhà sản xuất; lập biên bản tiếp nhận và bàn giao cho bộ phận quản lý, sử dụng.",
}
const emptyDec = (): Partial<Decision> => ({ type: "Tổ kiểm kê", number: "", date: todayIso(), scope: "", from: "", to: "", duties: DEC_DUTIES["Tổ kiểm kê"], members: [{ name: "", position: "Phó hiệu trưởng", duty: "Tổ trưởng" }, { name: "", position: "Nhân viên thiết bị", duty: "Thư ký" }, { name: "", position: "Tổ trưởng chuyên môn", duty: "Thành viên" }] })

export function printDecision(x: Decision) {
  const d = new Date(x.date)
  printHtml({
    title: "Quyết định", subtitle: `Về việc thành lập ${x.type} ${x.type === "Tổ kiểm kê" ? "tài sản, thiết bị dạy học" : "thiết bị dạy học"}`, number: x.number || "…/QĐ-THCSLĐ",
    body: `<p style="text-align:center;font-weight:bold;margin-top:8px">HIỆU TRƯỞNG TRƯỜNG THCS LÊ ĐỘ</p>
      <p><i>Căn cứ Thông tư 32/2020/TT-BGDĐT ngày 15/9/2020 của Bộ trưởng Bộ Giáo dục và Đào tạo ban hành Điều lệ trường trung học cơ sở, trường trung học phổ thông và trường phổ thông có nhiều cấp học;</i></p>
      <p><i>Căn cứ Thông tư 14/2020/TT-BGDĐT ngày 26/5/2020 của Bộ trưởng Bộ Giáo dục và Đào tạo quy định phòng học bộ môn của cơ sở giáo dục phổ thông;</i></p>
      <p><i>Căn cứ quy định về quản lý, sử dụng tài sản công và tình hình thực tế của nhà trường,</i></p>
      <p style="text-align:center;font-weight:bold;margin:10px 0">QUYẾT ĐỊNH:</p>
      <p><b>Điều 1.</b> Thành lập ${esc(x.type)}${x.scope ? ` (${esc(x.scope)})` : ""}${x.from ? `, làm việc từ ngày ${esc(isoToVn(x.from))}${x.to ? ` đến ngày ${esc(isoToVn(x.to))}` : ""}` : ""}, gồm các ông (bà) có tên sau:</p>
      ${table(["STT", "Họ và tên", "Chức vụ", "Nhiệm vụ"], x.members.map((m, i) => [i + 1, m.name, m.position, m.duty]))}
      <p><b>Điều 2.</b> ${esc(x.duties || DEC_DUTIES[x.type] || "")} ${esc(x.type)} tự giải thể sau khi hoàn thành nhiệm vụ.</p>
      <p><b>Điều 3.</b> Quyết định có hiệu lực kể từ ngày ký. Các ông (bà) có tên tại Điều 1 và các bộ phận liên quan chịu trách nhiệm thi hành Quyết định này.</p>
      <p style="margin-top:10px;font-size:12px"><i>Nơi nhận:</i> Như Điều 3; Lưu VT. (Quyết định ký ngày ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()})</p>`,
    signs: [["Hiệu trưởng", "(Ký, ghi rõ họ tên, đóng dấu)"]],
  })
}

export function DecisionsTab() {
  const [list, setList] = useState<Decision[]>([])
  const [f, setF] = useState<Partial<Decision> | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(() => { fetchDecisions().then(setList).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const setM = (i: number, p: Partial<Decision["members"][number]>) => f && setF({ ...f, members: (f.members || []).map((m, j) => (j === i ? { ...m, ...p } : m)) })
  return (
    <div className="space-y-4">
      <Err msg={error} />
      {!f ? (
        <>
          <div className="flex justify-between flex-wrap gap-2 items-center"><p className="text-sm text-gray-600">Quyết định thành lập tổ kiểm kê (hằng năm), hội đồng thanh lý, hội đồng tiếp nhận – bàn giao; in theo thể thức văn bản để Hiệu trưởng ký.</p>
            <button onClick={() => setF(emptyDec())} className={btnPrimary}>+ Lập quyết định</button></div>
          <div className={`${card} overflow-hidden`}>
            {list.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">Chưa có quyết định</p> : (
              <ul className="divide-y divide-gray-50">{list.map((x) => (
                <li key={x.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div><div className="font-medium text-gray-900">{x.type}{x.number ? ` – ${x.number}` : ""}</div><div className="text-xs text-gray-500">{isoToVn(x.date)} · {x.members.length} thành viên{x.scope ? ` · ${x.scope}` : ""}</div></div>
                  <div className="flex gap-2"><button onClick={() => printDecision(x)} className={btnGhost}>In</button><button onClick={() => setF(x)} className={btnGhost}>Sửa</button>
                    <button onClick={async () => { if (confirm("Xóa quyết định này?")) { await deleteDecision(x.id); load() } }} className="text-xs text-gray-400 hover:text-red-600">Xóa</button></div>
                </li>
              ))}</ul>
            )}
          </div>
        </>
      ) : (
        <div className={`${card} p-5 space-y-3`}>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><label className={label}>Loại</label><select className={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, duties: DEC_DUTIES[e.target.value] })}>{Object.keys(DEC_DUTIES).map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label className={label}>Số quyết định</label><input className={field} value={f.number} placeholder="VD: 12/QĐ-THCSLĐ" onChange={(e) => setF({ ...f, number: e.target.value })} /></div>
            <div><label className={label}>Ngày ký</label><input type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1"><label className={label}>Phạm vi</label><input className={field} value={f.scope} placeholder="VD: toàn bộ kho, phòng KHTN" onChange={(e) => setF({ ...f, scope: e.target.value })} /></div>
            <div><label className={label}>Từ ngày</label><input type="date" className={field} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
            <div><label className={label}>Đến ngày</label><input type="date" className={field} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
          </div>
          <div>
            <span className={label}>Thành viên</span>
            {(f.members || []).map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <input className={`${field} col-span-5`} placeholder="Họ và tên" value={m.name} onChange={(e) => setM(i, { name: e.target.value })} />
                <input className={`${field} col-span-4`} placeholder="Chức vụ" value={m.position} onChange={(e) => setM(i, { position: e.target.value })} />
                <select className={`${field} col-span-2`} value={m.duty} onChange={(e) => setM(i, { duty: e.target.value })}>{["Tổ trưởng", "Chủ tịch", "Phó", "Thư ký", "Thành viên"].map((x) => <option key={x}>{x}</option>)}</select>
                <button onClick={() => setF({ ...f, members: (f.members || []).filter((_, j) => j !== i) })} className="col-span-1 text-gray-400 hover:text-red-600" aria-label="Xóa thành viên">✕</button>
              </div>
            ))}
            <button onClick={() => setF({ ...f, members: [...(f.members || []), { name: "", position: "", duty: "Thành viên" }] })} className="text-sm font-semibold text-[#1a3670] hover:underline">+ Thêm thành viên</button>
          </div>
          <div><label className={label}>Nhiệm vụ (Điều 2)</label><textarea rows={3} className={field} value={f.duties} onChange={(e) => setF({ ...f, duties: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><button onClick={() => setF(null)} className={btnGhost}>Hủy</button>
            <button onClick={async () => { setError(""); try { const x = await saveDecision(f); setF(null); load(); printDecision(x) } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }} className={btnPrimary}>Lưu và in</button></div>
        </div>
      )}
    </div>
  )
}

// ===================================================================
// BÁO CÁO TỔNG KẾT / SƠ KẾT (UC39)
// ===================================================================
export async function printSummaryReport(kind: "year" | "hk1") {
  const t = new Date(), sy = t.getMonth() >= 8 ? t.getFullYear() : t.getFullYear() - 1
  const from = `01/09/${sy}`, to = kind === "year" ? `31/08/${sy + 1}` : `15/01/${sy + 1}`
  const [r, ml, inv] = await Promise.all([fetchReport(from, to), fetchMinlist().catch(() => null), fetchInventory()])
  const byGroup = new Map<string, number>()
  for (const x of r.records as Report[]) if (x.status !== "Từ chối") byGroup.set(x.group || "(chưa có tổ)", (byGroup.get(x.group || "(chưa có tổ)") || 0) + 1)
  const s = r.summary, cls = ml?.settings.classes || {}
  const used = (r.records as Report[]).filter((x) => x.status !== "Từ chối" && x.status !== "Chờ duyệt").length
  const okMin = ml ? ml.items.filter((i) => i.status === "Đủ").length : 0
  printHtml({
    title: kind === "year" ? "Báo cáo tổng kết" : "Báo cáo sơ kết", subtitle: `Công tác quản lý – sử dụng thiết bị dạy học ${kind === "year" ? "" : "học kỳ I "}năm học ${sy} – ${sy + 1}`, number: "…/BC-THCSLĐ",
    body: `<h2>I. ĐẶC ĐIỂM TÌNH HÌNH</h2>
      <p>Số lớp: khối 6: ${cls[6] ?? "…"}, khối 7: ${cls[7] ?? "…"}, khối 8: ${cls[8] ?? "…"}, khối 9: ${cls[9] ?? "…"}. Nhà trường quản lý ${inv.length} loại thiết bị, hóa chất, vật tư trên hệ thống quản lý thiết bị trực tuyến.</p>
      <h2>1. Thuận lợi</h2>${dots(2)}<h2>2. Khó khăn</h2>${dots(2)}
      <h2>II. TỔ CHỨC THỰC HIỆN QUẢN LÝ, SỬ DỤNG THIẾT BỊ</h2>
      <p>1. Quản lý thiết bị: sổ quản lý thiết bị, sổ mượn trả, nhật ký phòng học bộ môn được cập nhật trên hệ thống; mọi thay đổi số lượng đều có nhật ký người thực hiện. ${s.purchaseCount} phiếu ghi tăng, tổng ${s.purchaseTotal.toLocaleString("vi-VN")} đồng; ${s.disposedCount || 0} thiết bị ghi giảm.</p>
      <p>2. Sử dụng thiết bị: ${s.records} phiếu đăng ký, ${used} lượt đã giao thiết bị; ${s.lateReturns} lượt trả trễ; khi trả ghi nhận ${s.damaged} thiết bị hỏng, ${s.lost} thiết bị mất.</p>
      <p>3. Bảo quản, sửa chữa: ${s.maintenanceCount} lượt bảo trì – sửa chữa, chi phí ${s.maintenanceCost.toLocaleString("vi-VN")} đồng.</p>
      <h2>III. KẾT QUẢ THỰC HIỆN CỤ THỂ</h2>
      ${table(["Tổ chuyên môn", "Số lượt mượn"], [...byGroup.entries()].map(([g, n]) => [g, n]).concat([["Toàn trường", s.records - s.rejected]]))}
      ${table(["Môn", "Tiết thực hành", "Tiết biểu diễn"], (r.usageBySubject as Report[]).filter((u) => u.practice + u.demo > 0).map((u) => [u.name, u.practice, u.demo]))}
      ${ml && ml.items.length ? `<p>Đối chiếu danh mục thiết bị dạy học tối thiểu (Thông tư 38/2021): ${okMin}/${ml.items.length} dòng đã đủ.</p>` : ""}
      <h2>IV. KẾT LUẬN, KIẾN NGHỊ – ĐỀ XUẤT</h2>${dots(4)}`,
    signs: [["Xác nhận của nhà trường", "(Ký, ghi rõ họ tên)"], ["Cán bộ thiết bị", "(Ký, ghi rõ họ tên)"]],
  })
}
