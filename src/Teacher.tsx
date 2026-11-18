// Trang dành cho thầy cô, làm theo cách của MISA EMIS Thiết bị:
// vào là thấy lịch tuần của mình; một phiếu đăng ký duy nhất (tiết, môn, lớp, tiết PPCT, mục đích);
// chọn thiết bị bằng tìm kiếm / lọc môn với nút + −; mượn theo tiết hoặc dài hạn; nhân bản phiếu; hủy khi chưa duyệt
import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchMyRecords, createRecord, deleteRecord, fetchAvailable, fetchRoomsAvailability, fold, type BorrowRecord, type AvailableItem, type Room, type BorrowItem, type BorrowDraft } from "@/api"
import { useAuth } from "./AuthContext"
import { SUBJECTS } from "./subjects"

const card = "bg-white rounded-2xl border border-gray-200/80"
const field = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 focus:border-[#1a3670] bg-white"
const label = "block text-sm font-semibold text-gray-700 mb-1.5"
const btnPrimary = "px-5 py-2.5 rounded-xl bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const MORNING = ["S1", "S2", "S3", "S4", "S5"], AFTERNOON = ["C1", "C2", "C3", "C4", "C5"], ALL_SLOTS = [...MORNING, ...AFTERNOON]
const WD = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]
const iso = (d: Date) => d.toLocaleDateString("sv-SE")
const atStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const fromIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d) }
const fromVn = (s: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ""); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }
const toVn = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}` }
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
const mondayOf = (d: Date) => { const x = atStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const slotText = (slots: string[] = []) => {
  if (slots.length === 10) return "Cả ngày"
  const part = (k: string, n: string) => { const s = slots.filter((x) => x[0] === k).map((x) => x.slice(1)); return s.length ? `${n} tiết ${s.join(", ")}` : "" }
  return [part("S", "Sáng"), part("C", "Chiều")].filter(Boolean).join(" · ")
}
/** Ngày gợi ý đầu tiên đăng ký được (đăng ký trước tối thiểu 24 giờ): ngày kia, bỏ qua Chủ nhật */
const firstBookable = () => { let d = addDays(atStart(new Date()), 2); if (d.getDay() === 0) d = addDays(d, 1); return d }
/** Nhãn trạng thái dễ hiểu cho thầy cô */
function statusOf(r: BorrowRecord) {
  const due = fromVn(r.returnDate)
  if (r.status === "Mượn" && due && due < atStart(new Date())) return ["Quá hạn trả", "bg-red-50 text-red-700 ring-red-200"]
  return ({ "Chờ duyệt": ["Chờ duyệt", "bg-amber-50 text-amber-800 ring-amber-200"], "Mượn": ["Đã mượn", "bg-blue-50 text-blue-700 ring-blue-200"], "Trả": ["Đã trả", "bg-emerald-50 text-emerald-700 ring-emerald-200"], "Từ chối": ["Bị từ chối", "bg-gray-100 text-gray-600 ring-gray-200"] } as Record<string, string[]>)[r.status] || [r.status, "bg-gray-100 text-gray-600 ring-gray-200"]
}
const covers = (r: BorrowRecord, d: Date) => { const a = fromVn(r.borrowDate), b = fromVn(r.returnDate) || a; return !!a && !!b && a <= d && d <= b }

// ===================================================================
// LỊCH MƯỢN CỦA TÔI (trang đầu của thầy cô)
// ===================================================================
export function TeacherHome({ go, onBorrow }: { go: (p: string) => void; onBorrow: (o: { date?: string; clone?: BorrowRecord }) => void }) {
  const { user } = useAuth()
  const [list, setList] = useState<BorrowRecord[] | null>(null)
  const [week, setWeek] = useState(() => mondayOf(new Date()))
  const [day, setDay] = useState(() => { const t = atStart(new Date()); return t.getDay() === 0 ? addDays(t, 1) : t })
  const [msg, setMsg] = useState("")
  const load = useCallback(() => { fetchMyRecords().then(setList).catch(() => setList([])) }, [])
  useEffect(() => { load() }, [load])
  const days = Array.from({ length: 6 }, (_, i) => addDays(week, i))
  const mine = list || []
  const ofDay = mine.filter((r) => covers(r, day)).sort((a, b) => (a.periods?.[0] || "").localeCompare(b.periods?.[0] || ""))
  const overdue = mine.filter((r) => statusOf(r)[0] === "Quá hạn trả")
  const pending = mine.filter((r) => r.status === "Chờ duyệt").length
  const today = atStart(new Date())
  const cancel = async (r: BorrowRecord) => {
    if (!confirm(`Hủy phiếu mượn ngày ${r.borrowDate} (${r.equipment})?`)) return
    try { await deleteRecord(r.id); setMsg("Đã hủy phiếu"); load() } catch (e) { alert(e instanceof Error ? e.message : "Lỗi") }
  }
  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div><div className="text-sm text-gray-500">Xin chào, {user?.name}</div><h1 className="text-[28px] font-bold text-[#1F2937] tracking-tight">Lịch mượn của tôi</h1></div>
          <button onClick={() => onBorrow({})} className={`${btnPrimary} text-base px-6 py-3`}>＋ Đăng ký mượn</button>
        </div>
        {overdue.length > 0 && <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">Thầy/cô có <strong>{overdue.length} phiếu quá hạn trả</strong>: {overdue.map((r) => r.equipment).join("; ")}. Vui lòng mang trả phòng thiết bị.</div>}
        {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm">{msg}</div>}

        <section className={`${card} p-4 mb-4`}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setWeek(addDays(week, -7))} aria-label="Tuần trước" className="w-9 h-9 rounded-lg hover:bg-gray-100 text-lg">‹</button>
            <div className="text-sm font-semibold text-gray-700">Tuần {ddmm(days[0])} – {ddmm(days[5])}{pending ? <span className="ml-2 text-xs font-normal text-amber-700">· {pending} phiếu chờ duyệt</span> : null}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setWeek(mondayOf(today)); setDay(today.getDay() === 0 ? addDays(today, 1) : today) }} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#1a3670] hover:bg-gray-100">Hôm nay</button>
              <button onClick={() => setWeek(addDays(week, 7))} aria-label="Tuần sau" className="w-9 h-9 rounded-lg hover:bg-gray-100 text-lg">›</button>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {days.map((d) => {
              const n = mine.filter((r) => covers(r, d)).length, sel = iso(d) === iso(day), isToday = iso(d) === iso(today)
              return (
                <button key={iso(d)} onClick={() => setDay(d)} aria-pressed={sel} className={`rounded-xl py-2.5 text-center transition-colors ${sel ? "bg-[#1a3670] text-white" : "hover:bg-gray-50"}`}>
                  <div className={`text-[11px] ${sel ? "text-white/80" : "text-gray-500"}`}>{WD[d.getDay()]}</div>
                  <div className={`text-lg font-bold ${isToday && !sel ? "text-[#1a3670]" : ""}`}>{d.getDate()}</div>
                  <div className="h-2 flex justify-center gap-0.5">{Array.from({ length: Math.min(n, 3) }, (_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${sel ? "bg-white" : "bg-emerald-500"}`} />)}</div>
                </button>
              )
            })}
          </div>
        </section>

        <section className={card}>
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-900">{WD[day.getDay()]}, {day.toLocaleDateString("vi-VN")}</h2>
            {day >= firstBookable() && <button onClick={() => onBorrow({ date: iso(day) })} className="text-sm font-semibold text-[#1a3670] hover:underline">＋ Mượn cho ngày này</button>}
          </div>
          {list === null ? <p className="p-6 text-sm text-gray-400">Đang tải…</p> : ofDay.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Không có phiếu mượn trong ngày này.</p> : (
            <ul className="divide-y divide-gray-100">{ofDay.map((r) => {
              const [st, cls] = statusOf(r)
              return (
                <li key={r.id} className="px-5 py-3.5 flex flex-wrap items-start gap-3">
                  <div className="w-28 shrink-0 text-sm font-semibold text-gray-700">{slotText(r.periods) || r.period}</div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium text-gray-900">Lớp {r.className} · {r.subjectName}{r.roomName ? ` · ${r.roomName}` : ""}</div>
                    <div className="text-sm text-gray-600">{r.equipment}</div>
                    {r.borrowDate !== r.returnDate && <div className="text-xs text-gray-500">Mượn dài hạn {r.borrowDate} → {r.returnDate}</div>}
                    {r.status === "Từ chối" && r.adminNote && <div className="text-xs text-gray-500">Lý do: {r.adminNote}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${cls}`}>{st}</span>
                    <button onClick={() => onBorrow({ clone: r })} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 hover:border-[#1a3670]">Nhân bản</button>
                    {r.status === "Chờ duyệt" && <button onClick={() => cancel(r)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 hover:border-red-300 hover:text-red-700">Hủy</button>}
                  </div>
                </li>
              )
            })}</ul>
          )}
        </section>
        <p className="text-sm text-gray-500 mt-4">Xem tất cả phiếu ở <button onClick={() => go("mine")} className="font-semibold text-[#1a3670] hover:underline">Phiếu của tôi</button>. Nội quy, hướng dẫn ở <button onClick={() => go("thong-tin")} className="font-semibold text-[#1a3670] hover:underline">Thông tin thêm</button>.</p>
      </div>
    </main>
  )
}

// ===================================================================
// PHIẾU ĐĂNG KÝ MƯỢN (một trang)
// ===================================================================
export function BorrowPage({ go, preset, onDone }: { go: (p: string) => void; preset: { date?: string; clone?: BorrowRecord; subjectId?: string; draft?: BorrowDraft } | null; onDone: () => void }) {
  const { user, login } = useAuth()
  const [mineAll, setMineAll] = useState<BorrowRecord[]>([])
  const [mode, setMode] = useState<"day" | "long">("day")
  const [date, setDate] = useState(() => preset?.date || iso(firstBookable()))
  const [slots, setSlots] = useState<string[]>([])
  const [longTo, setLongTo] = useState("")
  const [subjectId, setSubjectId] = useState(preset?.subjectId || "")
  const [className, setClassName] = useState("")
  const [periodPPCT, setPeriodPPCT] = useState("")
  const [lessonName, setLessonName] = useState("")
  const [usageType, setUsageType] = useState("Thực hành")
  const [roomId, setRoomId] = useState("")
  const [notes, setNotes] = useState("")
  const [qty, setQty] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState("subject")
  const [q, setQ] = useState("")
  const [avail, setAvail] = useState<AvailableItem[] | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<BorrowRecord | null>(null)

  useEffect(() => { if (user) fetchMyRecords().then(setMineAll).catch(() => {}) }, [user])
  // Môn mặc định: môn thầy cô mượn gần nhất
  useEffect(() => { if (!subjectId && mineAll.length) setSubjectId(mineAll[0].subjectId) }, [mineAll, subjectId])
  // Nhân bản: lấy lại môn, lớp, tiết, thiết bị, phòng; thầy cô chọn ngày mới
  useEffect(() => {
    const r = preset?.clone; if (!r) return
    setSubjectId(r.subjectId); setClassName(r.className); setSlots(r.periods?.length && r.periods.length < 10 ? r.periods : []); setLessonName(r.lessonName || ""); setPeriodPPCT(r.periodPPCT || "")
    setUsageType(r.usageType || "Thực hành"); setRoomId(r.roomId || ""); setQty(Object.fromEntries((r.items || []).map((it) => [it.equipmentId, it.quantity])))
    if (r.borrowDate !== r.returnDate) setMode("long")
  }, [preset])
  // Bản nháp do trợ lý AI hoặc ô "đăng ký nhanh" điền sẵn
  useEffect(() => {
    const d = preset?.draft; if (!d) return
    const isoOf = (v: string) => { const x = fromVn(v); return x ? iso(x) : "" }
    if (d.subjectId) setSubjectId(d.subjectId)
    if (d.className) setClassName(d.className)
    if (isoOf(d.borrowDate)) setDate(isoOf(d.borrowDate))
    if (d.returnDate && d.returnDate !== d.borrowDate && isoOf(d.returnDate)) { setMode("long"); setLongTo(isoOf(d.returnDate)) }
    if (d.periods?.length) setSlots(d.periods)
    if (d.periodPPCT) setPeriodPPCT(d.periodPPCT)
    if (d.notes) setNotes(d.notes)
    if (d.items?.length) setQty(Object.fromEntries(d.items.map((it) => [it.equipmentId, it.quantity])))
  }, [preset])
  const from = date, to = mode === "long" ? longTo || date : date
  const useSlots = mode === "long" ? ALL_SLOTS : slots
  useEffect(() => {
    if (!user) return
    const t = setTimeout(() => {
      fetchAvailable("", toVn(from), toVn(to), useSlots).then(setAvail).catch(() => setAvail([]))
      if (useSlots.length) fetchRoomsAvailability(toVn(from), toVn(to), useSlots).then(setRooms).catch(() => setRooms([])); else setRooms([])
    }, 250)
    return () => clearTimeout(t)
  }, [user, from, to, useSlots.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const f = fold(q.trim())
    return (avail || []).filter((e) => (filter === "all" || f || e.subjectId === subjectId) && (!f || fold(`${e.name} ${e.topic || ""}`).includes(f)))
      .sort((a, b) => (b.available > 0 ? 1 : 0) - (a.available > 0 ? 1 : 0) || a.name.localeCompare(b.name, "vi"))
  }, [avail, q, filter, subjectId])
  const picked = Object.entries(qty).filter(([, n]) => n > 0)
  const nameOf = (id: string) => avail?.find((a) => a.id === id)?.name || preset?.clone?.items?.find((i) => i.equipmentId === id)?.equipmentId || id
  const setN = (id: string, n: number) => setQty((s) => ({ ...s, [id]: Math.max(0, n) }))
  const toggleSlot = (s: string) => setSlots((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s].sort((a, b) => ALL_SLOTS.indexOf(a) - ALL_SLOTS.indexOf(b))))
  const preset2 = (kind: string) => {
    const d = fromIso(date)
    if (kind === "week") setLongTo(iso(addDays(mondayOf(d), 5)))
    if (kind === "month") setLongTo(iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)))
    if (kind === "term") setLongTo(d.getMonth() >= 7 ? `${d.getFullYear() + 1}-01-15` : `${d.getFullYear()}-05-31`)
  }

  if (!user) return <main className="pt-20 lg:pt-10 px-4 lg:px-10"><div className={`${card} p-8 max-w-lg text-center`}><p className="mb-4">Đăng nhập để đăng ký mượn thiết bị</p><button onClick={login} className={btnPrimary}>Đăng nhập</button></div></main>
  if (done) return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10"><div className={`${card} p-8 max-w-lg text-center`}>
      <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 text-2xl flex items-center justify-center mx-auto mb-3">✓</div>
      <h1 className="text-xl font-bold mb-1">Đã gửi phiếu {done.code || ""}</h1>
      <p className="text-sm text-gray-600 mb-5">{done.borrowDate}{done.borrowDate !== done.returnDate ? ` → ${done.returnDate}` : ""} · {slotText(done.periods)} · lớp {done.className}. Phòng thiết bị duyệt xong, thầy/cô sẽ nhận được thông báo.</p>
      <div className="flex flex-wrap justify-center gap-2"><button onClick={onDone} className={btnPrimary}>Về lịch của tôi</button><button onClick={() => { setDone(null); setDate(iso(addDays(fromIso(date), 7))) }} className={btnGhost}>Nhân bản sang tuần sau</button></div>
    </div></main>
  )

  const submit = async () => {
    setError("")
    if (!subjectId) return setError("Chọn môn học")
    if (!className.trim()) return setError("Nhập lớp")
    if (mode === "day" && !slots.length) return setError("Chọn ít nhất một tiết")
    if (mode === "long" && (!longTo || longTo < date)) return setError("Chọn ngày trả sau ngày mượn")
    if (!picked.length) return setError("Chọn ít nhất một thiết bị")
    const over = picked.find(([id, n]) => { const a = avail?.find((x) => x.id === id); return a && n > a.available })
    if (over) return setError(`“${nameOf(over[0])}” chỉ còn ${avail?.find((x) => x.id === over[0])?.available} trong thời gian này`)
    const items: BorrowItem[] = picked.map(([equipmentId, quantity]) => ({ equipmentId, quantity }))
    setBusy(true)
    try {
      const r = await createRecord({ subjectId, subjectName: SUBJECTS.find((s) => s.id === subjectId)?.name, teacherName: user.name, className: className.trim().toUpperCase(),
        equipment: picked.map(([id, n]) => `${nameOf(id)} (x${n})`).join(", "), borrowDate: toVn(from), returnDate: toVn(to), notes, periods: useSlots, periodPPCT, lessonName, usageType, roomId: roomId || undefined, items })
      setDone(r)
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra") } finally { setBusy(false) }
  }
  const SlotBtn = ({ s }: { s: string }) => <button type="button" onClick={() => toggleSlot(s)} aria-pressed={slots.includes(s)} className={`w-11 h-10 rounded-lg text-sm font-semibold border ${slots.includes(s) ? "bg-[#1a3670] text-white border-[#1a3670]" : "bg-white border-gray-200 hover:border-[#1a3670]"}`}>{s.slice(1)}</button>
  const recent = mineAll.filter((r) => r.items?.length).slice(0, 8)

  return (
    <main className="pt-20 lg:pt-10 pb-28 px-4 lg:px-10">
      <div className="max-w-5xl">
        <div className="flex items-center gap-3 mb-5"><button onClick={() => go("home")} className="text-sm text-gray-500 hover:text-gray-800">← Lịch của tôi</button></div>
        <h1 className="text-[28px] font-bold text-[#1F2937] tracking-tight mb-5">{preset?.clone ? "Nhân bản phiếu mượn" : "Đăng ký mượn thiết bị"}</h1>
        <div className="grid lg:grid-cols-5 gap-5 items-start">
          <div className="lg:col-span-3 space-y-5">
            <section className={`${card} p-5`}>
              <div className="flex gap-2 mb-4">{([["day", "Mượn theo tiết"], ["long", "Mượn dài hạn"]] as const).map(([k, l]) => <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className={`px-4 py-2 rounded-xl text-sm font-semibold ${mode === k ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700"}`}>{l}</button>)}</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className={label} htmlFor="b-date">{mode === "long" ? "Từ ngày" : "Ngày dạy"}</label><input id="b-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                {mode === "long" ? <div><label className={label} htmlFor="b-to">Đến ngày</label><input id="b-to" type="date" className={field} value={longTo} onChange={(e) => setLongTo(e.target.value)} />
                  <div className="flex gap-1.5 mt-1.5">{([["week", "Hết tuần"], ["month", "Hết tháng"], ["term", "Hết học kỳ"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => preset2(k)} className="px-2 py-1 rounded-md bg-gray-100 text-xs font-medium hover:bg-gray-200">{l}</button>)}</div></div>
                  : <div><span className={label}>Tiết</span>
                    <div className="space-y-1.5"><div className="flex items-center gap-1.5"><span className="w-12 text-xs text-gray-500">Sáng</span>{MORNING.map((s) => <SlotBtn key={s} s={s} />)}</div>
                      <div className="flex items-center gap-1.5"><span className="w-12 text-xs text-gray-500">Chiều</span>{AFTERNOON.map((s) => <SlotBtn key={s} s={s} />)}</div></div></div>}
                <div><label className={label} htmlFor="b-subject">Môn</label><select id="b-subject" className={field} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Chọn môn…</option>{SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label className={label} htmlFor="b-class">Lớp</label><input id="b-class" className={field} value={className} placeholder="VD: 8A1" onChange={(e) => setClassName(e.target.value)} /></div>
                <div><label className={label} htmlFor="b-ppct">Tiết PPCT (không bắt buộc)</label><input id="b-ppct" className={field} value={periodPPCT} placeholder="VD: Tiết 24" onChange={(e) => setPeriodPPCT(e.target.value)} /></div>
                <div><label className={label} htmlFor="b-lesson">Tên bài (không bắt buộc)</label><input id="b-lesson" className={field} value={lessonName} onChange={(e) => setLessonName(e.target.value)} /></div>
                <div><span className={label}>Mục đích</span><div className="flex gap-2">{["Thực hành", "Biểu diễn"].map((u) => <button key={u} type="button" onClick={() => setUsageType(u)} aria-pressed={usageType === u} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border ${usageType === u ? "border-[#1a3670] bg-[#1a3670]/5 text-[#1a3670]" : "border-gray-200"}`}>{u}</button>)}</div></div>
                <div><label className={label} htmlFor="b-room">Phòng học bộ môn (nếu cần)</label><select id="b-room" className={field} value={roomId} onChange={(e) => setRoomId(e.target.value)}><option value="">Không dùng phòng</option>{rooms.map((r) => <option key={r.id} value={r.id} disabled={r.busy}>{r.name}{r.busy ? ` – bận (${r.busyBy || "đã có lớp"})` : ""}</option>)}</select></div>
              </div>
            </section>

            <section className={card}>
              <div className="px-5 pt-4 pb-3 border-b border-gray-100 space-y-2">
                <h2 className="font-semibold text-gray-900">Chọn thiết bị</h2>
                <div className="flex flex-wrap gap-2">
                  <input type="search" aria-label="Tìm thiết bị" className={`${field} flex-1 min-w-[200px] py-2`} placeholder="Tìm tên thiết bị (không cần dấu)…" value={q} onChange={(e) => setQ(e.target.value)} />
                  <select aria-label="Lọc theo môn" className="border border-gray-200 rounded-xl px-3 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="subject">Môn của phiếu</option><option value="all">Tất cả môn</option></select>
                </div>
                {mode === "day" && !slots.length && <p className="text-xs text-amber-700">Chọn tiết để thấy số lượng còn trống chính xác.</p>}
              </div>
              {avail === null ? <p className="p-6 text-sm text-gray-400">Đang tải…</p> : shown.length === 0 ? <p className="p-6 text-sm text-gray-500">{subjectId || q ? "Không tìm thấy thiết bị." : "Chọn môn hoặc gõ tên thiết bị để tìm."}</p> : (
                <ul className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">{shown.map((e) => {
                  const n = qty[e.id] || 0, out = e.available <= 0
                  return (
                    <li key={e.id} className={`px-5 py-2.5 flex items-center gap-3 ${out ? "opacity-50" : ""}`}>
                      <div className="flex-1 min-w-0"><div className="text-sm font-medium text-gray-900">{e.name}</div><div className="text-xs text-gray-500">{filter === "all" || q ? `${SUBJECTS.find((s) => s.id === e.subjectId)?.name || ""} · ` : ""}{out ? (e.kind === "Hóa chất" ? "Hết hoặc quá hạn" : "Đã hết trong thời gian này") : `Còn ${e.available}${e.unit ? ` ${e.unit.toLowerCase()}` : ""}`}</div></div>
                      <div className="flex items-center gap-1.5">
                        {n > 0 && <><button onClick={() => setN(e.id, n - 1)} aria-label={`Bớt ${e.name}`} className="w-8 h-8 rounded-lg border border-gray-200 text-lg leading-none">−</button><span className="w-6 text-center text-sm font-semibold">{n}</span></>}
                        <button disabled={out || n >= e.available} onClick={() => setN(e.id, n + 1)} aria-label={`Thêm ${e.name}`} className="w-8 h-8 rounded-lg bg-[#1a3670] text-white text-lg leading-none disabled:bg-gray-300">+</button>
                      </div>
                    </li>
                  )
                })}</ul>
              )}
            </section>
          </div>

          <aside className="lg:col-span-2 lg:sticky lg:top-6 space-y-4">
            <section className={`${card} p-5`}>
              <h2 className="font-semibold text-gray-900 mb-3">Phiếu mượn</h2>
              <dl className="text-sm space-y-1 mb-3">
                <div className="flex justify-between gap-2"><dt className="text-gray-500">Thời gian</dt><dd className="text-right font-medium">{toVn(from)}{to !== from ? ` → ${toVn(to)}` : ""}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-gray-500">Tiết</dt><dd className="text-right font-medium">{mode === "long" ? "Cả ngày" : slotText(slots) || "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-gray-500">Lớp, môn</dt><dd className="text-right font-medium">{className || "—"} · {SUBJECTS.find((s) => s.id === subjectId)?.name || "—"}</dd></div>
              </dl>
              {picked.length === 0 ? <p className="text-sm text-gray-400 border-t border-gray-100 pt-3">Chưa chọn thiết bị</p> : (
                <ul className="border-t border-gray-100 pt-2 space-y-1.5">{picked.map(([id, n]) => <li key={id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{nameOf(id)}</span><span className="flex items-center gap-2 shrink-0"><strong>×{n}</strong><button onClick={() => setN(id, 0)} aria-label={`Bỏ ${nameOf(id)}`} className="text-gray-400 hover:text-red-600">✕</button></span></li>)}</ul>
              )}
              <label className="block mt-3"><span className="sr-only">Ghi chú</span><input className={`${field} py-2 text-sm`} placeholder="Ghi chú cho phòng thiết bị (nếu có)" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
              {error && <div role="alert" className="mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}
              <button disabled={busy} onClick={submit} className={`${btnPrimary} w-full mt-3 py-3 text-base`}>{busy ? "Đang gửi…" : "Gửi phiếu mượn"}</button>
            </section>
            {recent.length > 0 && (
              <section className={`${card} p-5`}>
                <h2 className="font-semibold text-gray-900 mb-2 text-sm">Lấy lại thiết bị từ phiếu trước</h2>
                <ul className="space-y-1">{recent.map((r) => <li key={r.id}><button onClick={() => { setSubjectId(r.subjectId); setQty((s) => ({ ...s, ...Object.fromEntries((r.items || []).map((it) => [it.equipmentId, it.quantity])) })) }} className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-50"><span className="text-gray-500">{r.borrowDate} · {r.className}</span><span className="block truncate text-gray-800">{r.equipment}</span></button></li>)}</ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}

// ===================================================================
// THIẾT BỊ THEO MÔN
// ===================================================================
export function SubjectsPage({ go }: { go: (p: string) => void }) {
  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-5xl">
        <h1 className="text-[28px] font-bold text-[#1F2937] tracking-tight mb-1">Thiết bị theo môn</h1>
        <p className="text-sm text-gray-500 mb-5">Chọn môn để xem danh mục thiết bị và lịch sử dụng trong tuần.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{SUBJECTS.map((s) => (
          <button key={s.id} onClick={() => go(s.id)} className={`${card} p-4 text-left hover:border-[#1a3670] transition-colors`}>
            <span className="inline-block w-2.5 h-2.5 rounded-full mb-2" style={{ background: s.color }} />
            <div className="font-semibold text-gray-900">{s.name}</div><div className="text-xs text-gray-500 mt-0.5">{s.group}</div>
          </button>
        ))}</div>
      </div>
    </main>
  )
}

// ===================================================================
// THÔNG TIN THÊM: nội quy, quy định, hướng dẫn (không hiện trên các trang làm việc)
// ===================================================================
export function InfoPage({ equipmentRules, libraryRules, pointsRules, isLibrarian, go }: { equipmentRules: React.ReactNode; libraryRules: React.ReactNode; pointsRules?: React.ReactNode; isLibrarian?: boolean; go: (p: string) => void }) {
  const Sec = ({ t, children, open }: { t: string; children: React.ReactNode; open?: boolean }) => (
    <details open={open} className={`${card} px-5 py-3.5`}>
      <summary className="font-semibold text-gray-900 cursor-pointer">{t}</summary>
      <div className="mt-3 text-[15px] text-gray-700 space-y-2">{children}</div>
    </details>
  )
  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-3xl space-y-3">
        <h1 className="text-[28px] font-bold text-[#1F2937] tracking-tight mb-2">Thông tin thêm</h1>
        <Sec t="Hướng dẫn nhanh cho thầy cô" open>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Bấm <strong>＋ Đăng ký mượn</strong>, chọn ngày, tiết, môn, lớp.</li>
            <li>Tìm thiết bị, bấm <strong>+</strong> để chọn số lượng (số còn trống hiện ngay bên dưới tên).</li>
            <li>Bấm <strong>Gửi phiếu mượn</strong>. Khi phòng thiết bị duyệt, thầy cô nhận thông báo.</li>
            <li>Dạy lặp lại tuần sau: mở phiếu cũ trong <strong>Lịch mượn của tôi</strong>, bấm <strong>Nhân bản</strong>.</li>
            <li>Đổi ý: bấm <strong>Hủy</strong> khi phiếu còn ở trạng thái chờ duyệt.</li>
          </ol>
        </Sec>
        <Sec t="Nội quy mượn – trả thiết bị">{equipmentRules}</Sec>
        {pointsRules && <Sec t="Quy chế điểm thi đua">{pointsRules}</Sec>}
        <Sec t="Nội quy thư viện">{libraryRules}{isLibrarian && <p className="text-sm"><button onClick={() => go("admin/muon-tra-sach")} className="font-semibold text-[#1a3670] hover:underline">Sửa quy định mượn sách →</button></p>}</Sec>
        <Sec t="Bảo vệ dữ liệu cá nhân"><p>Website chỉ thu thập thông tin cần cho việc mượn – trả thiết bị và thư viện. Thầy cô xem, tải hoặc yêu cầu sửa, xóa dữ liệu của mình ở mục Hồ sơ.</p><p><button onClick={() => go("bao-mat")} className="font-semibold text-[#1a3670] hover:underline">Đọc toàn văn thông báo xử lý dữ liệu cá nhân →</button></p></Sec>
        <Sec t="Căn cứ pháp lý">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Thông tư 32/2020/TT-BGDĐT – Điều lệ trường THCS, THPT.</li>
            <li>Thông tư 38/2021/TT-BGDĐT – Danh mục thiết bị dạy học tối thiểu cấp THCS (sửa đổi bởi Thông tư 26/2023/TT-BGDĐT).</li>
            <li>Thông tư 14/2020/TT-BGDĐT – Phòng học bộ môn (sửa đổi bởi Thông tư 23/2024/TT-BGDĐT).</li>
            <li>Thông tư 16/2022/TT-BGDĐT – Tiêu chuẩn thư viện (sửa đổi bởi Thông tư 13/2025/TT-BGDĐT).</li>
            <li>Luật Quản lý, sử dụng tài sản công; Nghị định 186/2025/NĐ-CP.</li>
            <li>Luật Bảo vệ dữ liệu cá nhân 2025; Nghị định 356/2025/NĐ-CP.</li>
          </ul>
        </Sec>
        <Sec t="Cần hỗ trợ?"><p>Liên hệ phòng thiết bị hoặc thư viện của trường. Lỗi tài khoản, quên mật khẩu: liên hệ quản trị hệ thống.</p></Sec>
      </div>
    </main>
  )
}
