// Đối chiếu danh mục thiết bị dạy học tối thiểu (Thông tư 38/2021, sửa đổi bởi Thông tư 26/2023) với kho của trường
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fetchMinlist, saveMinSettings, linkMinItem, deleteMinItem, importMinlist, reseedMinlist, fetchInventory, fold, type MinItem, type MinSettings, type Equipment } from "@/api"
import { exportExcel, printDoc } from "./Operations"

const card = "bg-white rounded-2xl shadow-sm border border-gray-100"
const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 focus:border-[#1a3670] bg-white"
const label = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const th = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const ST_CLS: Record<string, string> = { "Đủ": "bg-green-50 text-green-700", "Thiếu": "bg-amber-50 text-amber-800", "Chưa có": "bg-red-50 text-red-700", "Chưa liên kết": "bg-gray-100 text-gray-600", "Chưa khai báo số GV": "bg-blue-50 text-blue-700" }
const normText = (i: MinItem) => i.norm || `${String(i.normQty).padStart(2, "0")}${i.normPer === "trường" ? "" : "/" + i.normPer}`
const target = (i: MinItem) => [i.forTeacher && "GV", i.forStudent && "HS"].filter(Boolean).join(", ")

// Cột file mẫu (giống bảng trong Thông tư)
const COLS: [string, string][] = [["Môn", "mon"], ["STT", "stt"], ["Nhóm", "group"], ["Chủ đề dạy học", "topic"], ["Tên thiết bị", "name"], ["Mục đích sử dụng", "purpose"],
  ["Đối tượng sử dụng (GV/HS)", "target"], ["Đơn vị", "unit"], ["Số lượng (VD: 01/GV)", "norm"], ["Dùng cho lớp", "grades"], ["Ghi chú", "note"]]

export function MinlistTab({ subjects: siteSubjects }: { subjects: { id: string; name: string }[] }) {
  const [d, setD] = useState<{ subjects: string[]; amended?: string[]; settings: MinSettings; items: MinItem[] } | null>(null)
  const [mon, setMon] = useState("Toán")
  const [onlyAmended, setOnlyAmended] = useState(false)
  const [inv, setInv] = useState<Equipment[]>([])
  const [linking, setLinking] = useState<MinItem | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [st, setSt] = useState<MinSettings | null>(null)
  const [msg, setMsg] = useState("")
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const load = useCallback(() => { fetchMinlist().then((x) => { setD(x); setSt(x.settings) }).catch((e) => setError(e.message)); fetchInventory().then(setInv).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const out: Record<string, { total: number; ok: number; short: number; none: number; unlinked: number }> = {}
    for (const i of d?.items || []) {
      const s = (out[i.mon] ||= { total: 0, ok: 0, short: 0, none: 0, unlinked: 0 })
      s.total++
      if (i.status === "Đủ") s.ok++; else if (i.status === "Thiếu") s.short++; else if (i.status === "Chưa có") s.none++; else s.unlinked++
    }
    return out
  }, [d])
  if (!d || !st) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const items = d.items.filter((i) => i.mon === mon && (!onlyAmended || i.amendedBy))
  const amendedCount = d.items.filter((i) => i.amendedBy).length
  const all = d.items.length, ok = d.items.filter((i) => i.status === "Đủ").length

  const downloadTemplate = () => exportExcel("Mau-nhap-danh-muc-toi-thieu-TT38.xlsx", [{ name: "Danh mục", rows: [
    Object.fromEntries(COLS.map(([h, k]) => [h, ({ mon: "Khoa học tự nhiên", stt: "1", group: "I. Tranh ảnh", topic: "Chủ đề …", name: "Tên thiết bị theo Thông tư", purpose: "…", target: "GV, HS", unit: "Bộ", norm: "08/GV", grades: "6", note: "" } as Record<string, string>)[k]])),
  ] }])
  const onFile = async (f: File) => {
    setError(""); setMsg("")
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.read(await f.arrayBuffer())
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" })
      const rows = raw.map((r) => Object.fromEntries(COLS.map(([h, k]) => [k, String(r[h] ?? "").trim()]))).filter((r) => r.name)
      if (!rows.length) { setError("Không đọc được dòng nào. Hãy dùng đúng file mẫu (giữ nguyên dòng tiêu đề)."); return }
      const mons = [...new Set(rows.map((r) => r.mon))].join(", ")
      const replace = confirm(`Đọc được ${rows.length} dòng của môn: ${mons}.\nBấm OK để THAY THẾ danh mục hiện có của các môn này, Cancel để THÊM vào.`)
      const r = await importMinlist(rows, replace)
      setMsg(`Đã nhập ${r.imported} dòng.${r.errors.length ? ` Bỏ qua ${r.errors.length} dòng lỗi: ${r.errors.slice(0, 3).join("; ")}` : ""}`)
      load()
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi đọc file") }
  }
  const exportReport = () => exportExcel("Muc-dap-ung-danh-muc-toi-thieu.xlsx", [
    { name: "Tổng hợp theo môn", rows: d.subjects.filter((m) => summary[m]).map((m) => ({ "Môn": m, "Số dòng danh mục": summary[m].total, "Đủ": summary[m].ok, "Thiếu": summary[m].short, "Chưa có": summary[m].none, "Chưa liên kết / khai báo": summary[m].unlinked, "Tỉ lệ đủ (%)": Math.round((summary[m].ok / summary[m].total) * 100) })) },
    { name: "Chi tiết", rows: d.items.map((i) => ({ "Môn": i.mon, "STT": i.stt, "Chủ đề": i.topic, "Tên thiết bị": i.name, "Đối tượng": target(i), "ĐVT": i.unit, "Định mức": normText(i), "Cần có": i.required, "Đang có (tốt)": i.have, "Còn thiếu": i.missing, "Trạng thái": i.status, "Thiết bị liên kết": i.linkedEquipmentIds.map((id) => inv.find((e) => e.id === id)?.name || id).join("; "), "Ghi chú": i.note })) },
  ])
  const printBook = () => printDoc(`SỔ PHÂN ĐỊNH THIẾT BỊ DẠY HỌC TỐI THIỂU – MÔN ${mon.toUpperCase()}`, `Theo Thông tư 38/2021/TT-BGDĐT (sửa đổi bởi Thông tư 26/2023/TT-BGDĐT) · năm học ${new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1}–${new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear()}`,
    ["STT", "Chủ đề / bài dạy", "Tên thiết bị", "Đối tượng", "ĐVT", "Định mức", "Cần có", "Hiện có", "Ghi chú"],
    items.map((i) => [i.stt, i.topic, i.name, target(i), i.unit, normText(i), i.required, i.have, [i.grades.length ? `Lớp ${i.grades.join(", ")}` : "", i.note].filter(Boolean).join(". ")]), true, { cover: true })

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-900">
        Đã nạp đủ danh mục <strong>12 môn và thiết bị dùng chung</strong> theo Thông tư 38/2021 ({d.items.length} dòng). Mỗi dòng cần <strong>liên kết</strong> với thiết bị trong kho để hệ thống đếm số đang có. Môn Ngoại ngữ có 3 phương án trang bị: xóa các dòng của phương án trường không chọn. Môn Giáo dục thể chất: chỉ giữ các môn thể thao tự chọn mà trường dạy.
      </div>
      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">{msg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3"><div className="text-2xl font-bold">{all ? Math.round((ok / all) * 100) : 0}%</div><div className="text-xs text-gray-500">Dòng danh mục đã đủ ({ok}/{all})</div></div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800"><div className="text-2xl font-bold">{d.items.filter((i) => i.status === "Thiếu").length}</div><div className="text-xs">Đang thiếu</div></div>
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-800"><div className="text-2xl font-bold">{d.items.filter((i) => i.status === "Chưa có").length}</div><div className="text-xs">Chưa có</div></div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700"><div className="text-2xl font-bold">{d.items.filter((i) => i.status === "Chưa liên kết" || i.status === "Chưa khai báo số GV").length}</div><div className="text-xs">Chưa liên kết / khai báo</div></div>
      </div>

      <div className={`${card} p-4 flex flex-wrap gap-2 items-center`}>
        <button onClick={() => setShowSettings(!showSettings)} className={btnGhost}>{showSettings ? "Ẩn" : "Khai báo"} số giáo viên, số lớp</button>
        <button onClick={downloadTemplate} className={btnGhost}>Tải file mẫu Excel</button>
        <button onClick={() => fileRef.current?.click()} className={btnGhost}>Nhập từ Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = "" }} />
        <label className="flex items-center gap-1.5 text-sm ml-2"><input type="checkbox" checked={onlyAmended} onChange={(e) => setOnlyAmended(e.target.checked)} />Chỉ mục đã sửa đổi ({amendedCount})</label>
        <button onClick={exportReport} className={`${btnPrimary} ml-auto`}>Xuất báo cáo mức đáp ứng</button>
      </div>

      {showSettings && (
        <div className={`${card} p-5`}>
          <p className="text-xs text-gray-500 mb-3">Định mức “/GV” nhân với số giáo viên trực tiếp dạy môn; “/HS” (hoặc “/6HS”, “/2 HS”) tính theo số học sinh mỗi phòng (lớp THCS không quá 45 học sinh theo Điều lệ trường); “/lớp”, “/05 lớp” tính theo số lớp; số không ghi đơn vị ở KHTN, Công nghệ, Tin học, Mĩ thuật là cho 01 phòng học bộ môn, nhân với số phòng.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            {d.subjects.map((m) => (
              <div key={m}><span className={label}>{m}</span>
                <div className="flex gap-2">
                  <input type="number" min={0} aria-label={`Số giáo viên ${m}`} className={field} value={st.teachers[m] ?? ""} placeholder="số GV" onChange={(e) => setSt({ ...st, teachers: { ...st.teachers, [m]: Number(e.target.value) } })} />
                  <input type="number" min={1} aria-label={`Số phòng bộ môn ${m}`} className={`${field} w-28`} value={st.rooms?.[m] ?? ""} placeholder="số phòng" onChange={(e) => setSt({ ...st, rooms: { ...(st.rooms || {}), [m]: Number(e.target.value) } })} />
                </div></div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[6, 7, 8, 9].map((g) => <div key={g}><label className={label}>Số lớp khối {g}</label><input type="number" min={0} className={field} value={st.classes[g] ?? 0} onChange={(e) => setSt({ ...st, classes: { ...st.classes, [g]: Number(e.target.value) } })} /></div>)}
            <div><label className={label}>Học sinh / phòng</label><input type="number" min={1} max={45} className={field} value={st.hsPerRoom} onChange={(e) => setSt({ ...st, hsPerRoom: Number(e.target.value) })} /></div>
          </div>
          <div className="flex justify-end mt-3"><button onClick={async () => { try { await saveMinSettings(st); setShowSettings(false); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }} className={btnPrimary}>Lưu</button></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {d.subjects.map((m) => (
          <button key={m} onClick={() => setMon(m)} aria-pressed={mon === m} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mon === m ? "bg-[#1a3670] text-white" : summary[m] ? "bg-gray-100 text-gray-800 hover:bg-gray-200" : "bg-white border border-dashed border-gray-300 text-gray-400"}`}>
            {m}{summary[m] ? ` (${summary[m].ok}/${summary[m].total})` : ""}
          </button>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-gray-900">{mon === "Thiết bị dùng chung" ? mon : `Môn ${mon}`}{st.teachers[mon] ? ` · ${st.teachers[mon]} giáo viên` : ""} <span className="text-sm font-normal text-gray-500">· {items.length} dòng</span></h3>
          <div className="flex gap-2">
            <button onClick={async () => { if (confirm(`Khôi phục danh mục gốc của ${mon} theo Thông tư 38/2021?\nCác dòng hiện có của môn này (kể cả liên kết thiết bị) sẽ bị thay thế.`)) { try { const r = await reseedMinlist(mon); setMsg(`Đã khôi phục ${r.imported} dòng của ${mon}.`); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } } }} className={btnGhost}>Khôi phục danh mục gốc</button>
            <button onClick={printBook} disabled={!items.length} className={btnGhost}>In sổ phân định (Mẫu 3)</button>
          </div>
        </div>
        {d.amended?.includes(mon) && <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-900">Một số mục của {mon === "Thiết bị dùng chung" ? "phần này" : "môn này"} đã được <strong>Thông tư 26/2023/TT-BGDĐT</strong> (hiệu lực 12/02/2024) sửa đổi, bổ sung. Danh mục trên chép theo bản gốc năm 2021, cần đối chiếu các mục được sửa.</div>}
        {items.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Chưa có danh mục môn này. Tải file mẫu, chép bảng của môn từ Thông tư 38/2021 rồi bấm “Nhập từ Excel”.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50">{["STT", "Chủ đề", "Tên thiết bị", "Đối tượng", "ĐVT", "Định mức", "Cần có", "Đang có", "Trạng thái", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{items.map((i, k) => (
              <Fragment key={i.id}>
              {(k === 0 || items[k - 1].group !== i.group) && i.group && <tr className="bg-[#F6F7F9]"><td colSpan={10} className="px-3 py-2 text-xs font-bold text-[#1a3670]">{i.group}</td></tr>}
              <tr>
                <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{i.stt}</td>
                <td className="px-3 py-2 text-xs text-gray-600 min-w-[160px]">{i.topic}</td>
                <td className="px-3 py-2 min-w-[220px]"><div className="font-medium text-gray-900">{i.name}</div>
                  <div className="text-[11px] text-gray-400">{[i.grades.length ? `Lớp ${i.grades.join(", ")}` : "", i.note].filter(Boolean).join(" · ")}</div>
                  {i.amendedBy && <div className="text-[11px] font-semibold text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5 inline-block" title={i.amendedBy}>Sửa đổi theo TT 26/2023</div>}
                  {i.linkedEquipmentIds.length > 0 && <div className="text-[11px] text-[#1a3670]">↳ {i.linkedEquipmentIds.map((id) => inv.find((e) => e.id === id)?.name || id).join("; ")}</div>}</td>
                <td className="px-3 py-2 text-xs">{target(i)}</td>
                <td className="px-3 py-2 text-xs">{i.unit}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{normText(i)}</td>
                <td className="px-3 py-2 font-semibold">{i.required}</td>
                <td className="px-3 py-2 font-semibold">{i.have}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${ST_CLS[i.status] || ""}`}>{i.status}{i.status === "Thiếu" ? ` ${i.missing}` : ""}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => setLinking(i)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200">Liên kết</button>
                  <button onClick={async () => { if (confirm(`Xóa dòng “${i.name}” khỏi danh mục?`)) { await deleteMinItem(i.id); load() } }} className="ml-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-red-600">Xóa</button>
                </td>
              </tr>
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {linking && <LinkDialog item={linking} inv={inv} siteSubjects={siteSubjects} onClose={() => setLinking(null)} onSaved={() => { setLinking(null); load() }} />}
    </div>
  )
}

function LinkDialog({ item, inv, siteSubjects, onClose, onSaved }: { item: MinItem; inv: Equipment[]; siteSubjects: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [sel, setSel] = useState<string[]>(item.linkedEquipmentIds)
  const [q, setQ] = useState("")
  const [subject, setSubject] = useState(item.siteSubjectId)
  // gợi ý theo các từ trong tên danh mục
  const words = fold(item.name).split(/[^a-z0-9]+/).filter((w) => w.length > 3)
  const score = (e: Equipment) => words.filter((w) => fold(e.name).includes(w)).length
  const list = inv.filter((e) => (!subject || e.subjectId === subject) && (!q || fold(`${e.name} ${e.id}`).includes(fold(q)))).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "vi"))
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Liên kết thiết bị" className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-5 my-8">
        <h3 className="font-bold text-gray-900 mb-1">Liên kết thiết bị trong kho</h3>
        <p className="text-sm text-gray-600 mb-3">{item.mon} · {item.name} · định mức {normText(item)}</p>
        <div className="flex gap-2 mb-3">
          <input type="search" className={field} placeholder="Tìm (không cần dấu)…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="border border-gray-200 rounded-lg px-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Mọi môn</option>{siteSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
        <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-xl">
          {list.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Không có thiết bị phù hợp. Có thể thêm thiết bị ở mục Danh mục thiết bị.</li>}
          {list.map((e) => (
            <li key={e.id}><label className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={sel.includes(e.id)} onChange={(ev) => setSel(ev.target.checked ? [...sel, e.id] : sel.filter((x) => x !== e.id))} />
              <span className="flex-1">{e.name}{score(e) > 0 && <span className="ml-2 text-[10px] font-bold text-emerald-700">gợi ý</span>}</span>
              <span className="text-xs text-gray-500 whitespace-nowrap">tốt {e.qtyGood}</span>
            </label></li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className={btnGhost}>Hủy</button><button onClick={async () => { await linkMinItem(item.id, sel); onSaved() }} className={btnPrimary}>Lưu ({sel.length})</button></div>
      </div>
    </div>
  )
}
