import { useState, useEffect, useCallback, useRef } from "react"
import logoImg from "@/imports/Logo.jpg"
import { AuthProvider, useAuth } from "@/AuthContext"
import { InventoryTab, PurchasesTab, PointsTab, ReturnDialog, MyPointsCard } from "./Inventory"
import { AuditTab, MaintenanceTab, ReportsTab, EquipmentPage, Dashboard, DisposalTab, BooksTab, LossTab } from "./Operations"
import { RoomsTab, ProposalsTab, MyProposals } from "./School"
import ChatWidget from "@/ChatWidget"
import {
  fetchRecords,
  fetchMyRecords,
  createRecord,
  updateRecordStatus,
  deleteRecord,
  fetchStats,
  fetchSubjectStats,
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type BorrowRecord,
  type BorrowDraft,
  type BorrowItem,
  type RecordStatus,
  type Stats,
  type Notification,
  sendRemindersNow,
  fetchAvailable,
  fetchRoomsAvailability,
  type AvailableItem,
  type Room,
} from "@/api"

type Page = "home" | "admin" | "noiquy" | "mine" | string

const SUBJECTS = [
  { id: "hoa-hoc", group: "Tổ Khoa học tự nhiên", name: "Hóa học", color: "#059669", img: "https://images.unsplash.com/photo-1614308460927-5024ba2e1dcb?w=600&h=400&fit=crop&auto=format", desc: "Thiết bị thí nghiệm, dụng cụ phòng lab hóa học" },
  { id: "vat-li", group: "Tổ Khoa học tự nhiên", name: "Vật lí", color: "#2563eb", img: "https://images.unsplash.com/photo-1763098844157-d0fffcc966a1?w=600&h=400&fit=crop&auto=format", desc: "Dụng cụ thí nghiệm, mô hình vật lí" },
  { id: "sinh-hoc", group: "Tổ Khoa học tự nhiên", name: "Sinh học", color: "#16a34a", img: "https://images.unsplash.com/photo-1614308459036-779d0dfe51ff?w=600&h=400&fit=crop&auto=format", desc: "Kính hiển vi, tiêu bản sinh học, mô hình" },
  { id: "cong-nghe", group: "Tổ Khoa học tự nhiên", name: "Công nghệ", color: "#7c3aed", img: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&h=400&fit=crop&auto=format", desc: "Thiết bị công nghệ, máy tính, công cụ kỹ thuật" },
  { id: "toan-hoc", group: "Tổ Toán – Tin", name: "Toán học", color: "#dc2626", img: "https://images.unsplash.com/photo-1635372722656-389f87a941b7?w=600&h=400&fit=crop&auto=format", desc: "Bộ đồ dùng hình học, thước, compa, mô hình" },
  { id: "lich-su-dia-li", group: "Tổ Khoa học xã hội", name: "Lịch Sử - Địa lí", color: "#d97706", img: "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=600&h=400&fit=crop&auto=format", desc: "Bản đồ, quả địa cầu, tranh ảnh lịch sử" },
  { id: "gdtc", group: "Tổ Nghệ thuật – Thể chất", name: "GDTC", color: "#0891b2", img: "https://images.unsplash.com/photo-1559369064-c4d65141e408?w=600&h=400&fit=crop&auto=format", desc: "Dụng cụ thể dục thể thao, bóng, lưới" },
  { id: "ngu-van-gdcd", group: "Tổ Khoa học xã hội", name: "Ngữ văn - GDCD", color: "#be185d", img: "https://images.unsplash.com/photo-1604866830893-c13cafa515d5?w=600&h=400&fit=crop&auto=format", desc: "Sách tham khảo, tranh ảnh minh họa, đồ dùng" },
  { id: "tieng-anh", group: "Tổ Ngoại ngữ", name: "Tiếng Anh", color: "#0e7490", img: "https://images.unsplash.com/photo-1543109740-4bdb38fda756?w=600&h=400&fit=crop&auto=format", desc: "Sách giáo khoa, thiết bị nghe nhìn, flash cards" },
]

// ============ TIỆN ÍCH NGÀY THÁNG ============
/** "DD/MM/YYYY" -> Date (00:00 giờ máy) hoặc null */
function parseVN(d?: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((d || "").trim())
  if (!m) return null
  const dt = new Date(0)
  dt.setFullYear(+m[3], +m[2] - 1, +m[1]) // setFullYear: năm < 100 không bị đổi thành 19xx
  dt.setHours(0, 0, 0, 0)
  return dt.getDate() === +m[1] ? dt : null
}
/** "DD/MM/YYYY" -> "YYYY-MM-DD" cho ô chọn ngày */
const vnToIso = (d: string) => { const dt = parseVN(d); return dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}` : "" }
/** "YYYY-MM-DD" -> "DD/MM/YYYY" */
const isoToVn = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]}/${m[2]}/${m[1]}` : "" }
const todayStart = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
const tomorrowVN = () => { const t = todayStart(); t.setDate(t.getDate() + 1); return `${String(t.getDate()).padStart(2, "0")}/${String(t.getMonth() + 1).padStart(2, "0")}/${t.getFullYear()}` }
/** Phiếu đang mượn đã quá ngày trả */
const isOverdue = (r: BorrowRecord) => r.status === "Mượn" && (parseVN(r.returnDate)?.getTime() ?? Infinity) < todayStart().getTime()
/** Phiếu chưa được duyệt mà đã qua ngày mượn */
const isStalePending = (r: BorrowRecord) => r.status === "Chờ duyệt" && (parseVN(r.borrowDate)?.getTime() ?? Infinity) < todayStart().getTime()

const STATUS_LABEL: Record<string, string> = { "Chờ duyệt": "Chờ duyệt", "Mượn": "Đang mượn", "Trả": "Đã trả", "Từ chối": "Từ chối" }
const STATUS_CLS: Record<string, string> = { "Chờ duyệt": "bg-amber-50 text-amber-700", "Mượn": "bg-blue-50 text-blue-700", "Trả": "bg-green-50 text-green-700", "Từ chối": "bg-red-50 text-red-700" }

function StatusBadge({ r, small }: { r: BorrowRecord; small?: boolean }) {
  const overdue = isOverdue(r)
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${small ? "text-[10px]" : "text-xs"} ${overdue ? "bg-rose-100 text-rose-700" : STATUS_CLS[r.status] || "bg-gray-100 text-gray-600"}`}>
      {overdue ? "Quá hạn trả" : STATUS_LABEL[r.status] || r.status}
      {isStalePending(r) && <span className="ml-1 font-normal opacity-80" title="Đã qua ngày mượn mà chưa được duyệt">· đã qua ngày</span>}
    </span>
  )
}

/** Báo cho các thành phần khác (badge trên thanh điều hướng) rằng thông báo vừa thay đổi */
const notifyNotifsChanged = () => window.dispatchEvent(new Event("notifs-changed"))

// ============ NAV ============
// ============ KHUNG TRANG: THANH BÊN TRÁI (máy tính) + THANH TRÊN (điện thoại) ============
function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const { user, login, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const inAdmin = page.startsWith("admin")
  const adminSection = inAdmin ? page.split("/")[1] || "tong-quan" : ""

  useEffect(() => {
    if (!user?.isAdmin) return
    const refresh = () => { if (document.visibilityState === "visible") fetchUnreadCount().then(setUnreadCount).catch(() => {}) }
    refresh()
    const interval = setInterval(refresh, 30000)
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("notifs-changed", refresh)
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("notifs-changed", refresh) }
  }, [user?.isAdmin])
  useEffect(() => { setOpen(false) }, [page])

  const go = (p: Page) => { setPage(p); setOpen(false) }
  const badge = unreadCount > 99 ? "99+" : String(unreadCount)
  const item = (key: string, label: string, active: boolean, onClick: () => void, dot?: string, extra?: React.ReactNode) => (
    <button key={key} onClick={onClick} aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[15px] text-left transition-colors ${active ? "bg-white text-[#1a3670] font-semibold shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
      {dot !== undefined && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot || "#F5B841" }} />}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {extra}
    </button>
  )
  const groupTitle = (t: string) => <div className="px-3 pt-5 pb-1.5 text-xs font-semibold text-white/50">{t}</div>

  const content = (
    <div className="flex flex-col h-full">
      <button onClick={() => go("home")} className="flex items-center gap-3 px-5 py-5 border-b border-white/10 text-left" aria-label="Trang chủ">
        <img src={logoImg} alt="" className="h-11 w-11 rounded-xl object-cover bg-white" />
        <span className="leading-tight">
          <span className="block text-xs font-semibold text-[#9FD3B5]">Trường THCS</span>
          <span className="block text-base font-bold text-white">Lê Độ</span>
        </span>
      </button>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Điều hướng chính">
        {inAdmin ? (
          <>
            <div className="pt-4">{item("back", "← Trang giáo viên", false, () => go("home"))}</div>
            {ADMIN_MENU.map((g) => (
              <div key={g.group || "chung"}>
                {groupTitle(g.group || "Điều hành")}
                {g.items.map((it) => item(it.id, it.label, adminSection === it.id, () => go(`admin/${it.id}`), undefined,
                  it.id === "thong-bao" && unreadCount > 0 ? <span className="text-[11px] font-bold rounded-full px-1.5 bg-red-500 text-white">{badge}</span> : null))}
              </div>
            ))}
          </>
        ) : (
          <>
            {groupTitle("Tổng quan")}
            {item("home", "Trang chủ", page === "home", () => go("home"), "")}
            {user && item("mine", "Phiếu của tôi", page === "mine", () => go("mine"), "#9FD3B5")}
            {item("noiquy", "Nội quy", page === "noiquy", () => go("noiquy"), "#CBD5E1")}
            {groupTitle("Môn học")}
            {SUBJECTS.map((s) => item(s.id, s.name, page === s.id, () => go(s.id), s.color))}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-2">
        {user?.isAdmin && !inAdmin && (
          <button onClick={() => go("admin")} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F5B841] text-[#1a2b55] font-semibold text-sm hover:bg-[#f7c463]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            <span className="flex-1 text-left">Quản lý đăng ký</span>
            {unreadCount > 0 && <span className="text-[11px] font-bold rounded-full px-1.5 bg-[#1a2b55] text-white">{badge}</span>}
          </button>
        )}
        {user ? (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            {user.avatar ? <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" /> : <span className="w-8 h-8 rounded-full bg-white/15 text-white text-sm font-bold flex items-center justify-center">{user.name.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</span>}
            <span className="flex-1 min-w-0"><span className="block text-sm text-white font-medium truncate">{user.name}</span><span className="block text-xs text-white/50">{user.isAdmin ? "Quản trị" : "Giáo viên"}</span></span>
            <button onClick={logout} className="text-xs text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10">Đăng xuất</button>
          </div>
        ) : (
          <button onClick={login} className="w-full px-3 py-2.5 rounded-xl bg-white text-[#1a3670] font-semibold text-sm hover:bg-white/90">Đăng nhập bằng Google</button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 bg-[#1a3670] z-40">{content}</aside>
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-[#1a3670] text-white flex items-center px-3 gap-2 shadow">
        <button onClick={() => go("home")} className="flex items-center gap-2 flex-1 min-w-0" aria-label="Trang chủ">
          <img src={logoImg} alt="" className="h-9 w-9 rounded-lg object-cover bg-white" />
          <span className="font-bold truncate">THCS Lê Độ</span>
        </button>
        {user?.isAdmin && unreadCount > 0 && <span className="text-[11px] font-bold rounded-full px-1.5 bg-red-500">{badge}</span>}
        <button onClick={() => setOpen(true)} className="p-2 rounded-lg hover:bg-white/10" aria-label="Mở menu" aria-expanded={open}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#1a3670] shadow-2xl">{content}</div>
        </div>
      )}
    </>
  )
}

/** Tiêu đề trang thống nhất: dòng phụ nhỏ + tiêu đề lớn + nút bên phải */
function PageHeader({ kicker, title, right, back }: { kicker?: React.ReactNode; title: string; right?: React.ReactNode; back?: { label: string; onClick: () => void } }) {
  return (
    <div className="mb-6">
      {back && <button onClick={back.onClick} className="text-sm text-gray-500 hover:text-[#1a3670] mb-3">‹ {back.label}</button>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {kicker && <div className="text-sm font-semibold text-gray-500 mb-1">{kicker}</div>}
          <h1 className="text-[28px] sm:text-3xl font-bold text-[#1F2937] tracking-tight">{title}</h1>
        </div>
        {right}
      </div>
    </div>
  )
}

// ============ NỘI QUY PAGE ============
function NoiQuyPage() {
  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-[#1a3670] text-white px-8 py-6">
            <h1 className="text-2xl font-extrabold">Nội Quy & Quy Chế Mượn Thiết Bị</h1>
            <p className="text-white/70 text-sm mt-1">Trường THCS Lê Độ - Áp dụng từ năm học 2024-2025</p>
          </div>
          <div className="px-8 py-8 space-y-8 text-sm text-gray-700 leading-relaxed">

            <section>
              <h2 className="text-lg font-bold text-[#1a3670] mb-3 flex items-center gap-2">
                <span className="w-7 h-7 bg-[#1a3670] text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                Quy định chung
              </h2>
              <ul className="space-y-2 ml-9">
                <li>- Thiết bị dạy học là tài sản của nhà trường, phục vụ công tác giảng dạy và học tập.</li>
                <li>- Giáo viên có trách nhiệm bảo quản thiết bị trong suốt thời gian mượn.</li>
                <li>- Mọi hành vi làm hỏng, mất thiết bị phải báo cáo ngay và chịu trách nhiệm bồi thường.</li>
                <li>- Không được cho người khác mượn lại thiết bị đã đăng ký.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1a3670] mb-3 flex items-center gap-2">
                <span className="w-7 h-7 bg-[#1a3670] text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                Quy trình đăng ký mượn
              </h2>
              <ul className="space-y-2 ml-9">
                <li className="font-semibold text-red-600">- Đăng ký mượn phải thực hiện trước ít nhất 24 giờ so với thời gian cần sử dụng.</li>
                <li>- Quản trị viên (nhân viên thiết bị) sẽ đăng ký trên hệ thống theo yêu cầu của giáo viên.</li>
                <li>- Giáo viên cung cấp đầy đủ thông tin: họ tên, lớp dạy, tên thiết bị, số lượng, ngày mượn, ngày trả.</li>
                <li>- Sau khi đăng ký thành công, hệ thống sẽ gửi thông báo xác nhận.</li>
                <li>- Giáo viên nhận thiết bị tại phòng thiết bị vào ngày đã đăng ký.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1a3670] mb-3 flex items-center gap-2">
                <span className="w-7 h-7 bg-[#1a3670] text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                Quy định trả thiết bị
              </h2>
              <ul className="space-y-2 ml-9">
                <li>- Trả thiết bị đúng hạn đã đăng ký.</li>
                <li>- Kiểm tra tình trạng thiết bị trước khi trả, đảm bảo đầy đủ và nguyên vẹn.</li>
                <li>- Vệ sinh thiết bị sạch sẽ trước khi trả (đặc biệt thiết bị thí nghiệm).</li>
                <li>- Nếu cần gia hạn, phải thông báo trước khi hết hạn.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1a3670] mb-3 flex items-center gap-2">
                <span className="w-7 h-7 bg-[#1a3670] text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                Xử lý vi phạm
              </h2>
              <ul className="space-y-2 ml-9">
                <li>- Trả trễ: nhắc nhở lần 1, lần 2 trở đi sẽ bị hạn chế quyền mượn.</li>
                <li>- Làm hỏng thiết bị: bồi thường theo giá trị hoặc mua mới thay thế.</li>
                <li>- Làm mất thiết bị: bồi thường 100% giá trị thiết bị.</li>
              </ul>
            </section>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mt-6">
              <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                Lưu ý quan trọng
              </h3>
              <p className="text-amber-700 text-sm">
                Phải đăng ký mượn <strong>trước ít nhất 24 giờ</strong>. Hệ thống sẽ không chấp nhận đăng ký nếu ngày mượn cách thời điểm hiện tại chưa đủ 24 giờ.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

// ============ HOME PAGE (public - hiển thị danh sách cho mọi người xem) ============
const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]
/** "Thứ Sáu, 06/11" */
const dayLabel = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
const SLOT_OPTIONS = [1, 2, 3, 4, 5].map((n) => [`S${n}`, `Sáng – tiết ${n}`]).concat([1, 2, 3, 4, 5].map((n) => [`C${n}`, `Chiều – tiết ${n}`]))
const card = "bg-white rounded-2xl border border-gray-200/80"

function HomePage({ setPage, onQuick }: { setPage: (p: Page) => void; onQuick: (d: BorrowDraft) => void }) {
  const { user, login } = useAuth()
  const [records, setRecords] = useState<BorrowRecord[]>([])
  const [mine, setMine] = useState<BorrowRecord[] | null>(null)
  const [shown, setShown] = useState(8)
  // Mặc định ngày kia: ngày mai tiết sớm thường không đủ 24 giờ theo nội quy
  const [quick, setQuick] = useState(() => { const t = todayStart(); t.setDate(t.getDate() + 2); return { subjectId: SUBJECTS[0].id, date: t.toLocaleDateString("sv-SE"), slot: "S1" } })

  useEffect(() => { fetchRecords().then(setRecords).catch(console.error) }, [])
  useEffect(() => { if (user) fetchMyRecords().then(setMine).catch(() => setMine([])) }, [user])

  const today = todayStart()
  const sameDay = (s: string) => parseVN(s)?.getTime() === today.getTime()
  const lending = records.filter((r) => r.status === "Mượn").length
  const dueToday = records.filter((r) => r.status === "Mượn" && sameDay(r.returnDate)).length
  const pending = records.filter((r) => r.status === "Chờ duyệt").length
  const overdue = records.filter(isOverdue).length
  const upcoming = (mine || [])
    .filter((r) => (r.status === "Chờ duyệt" || r.status === "Mượn") && (parseVN(r.returnDate)?.getTime() ?? 0) >= today.getTime())
    .sort((a, b) => (parseVN(a.borrowDate)?.getTime() || 0) - (parseVN(b.borrowDate)?.getTime() || 0))
  const quickDate = parseVN(isoToVn(quick.date))
  const firstName = user?.name.trim().split(/\s+/).pop()

  const submitQuick = () => {
    if (!user) { login(); return }
    const s = SUBJECTS.find((x) => x.id === quick.subjectId)!
    onQuick({ subjectId: s.id, subjectName: s.name, teacherName: "", className: "", equipment: "", items: [], borrowDate: isoToVn(quick.date), returnDate: isoToVn(quick.date), period: "", periods: [quick.slot], periodPPCT: "", notes: "", missing: [] })
  }
  const selectCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 focus:border-[#1a3670]"

  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-6xl">
        <PageHeader kicker={dayLabel(new Date())} title={user ? (user.isAdmin ? `Xin chào, ${user.name}` : `Xin chào thầy/cô ${firstName}`) : "Phòng thiết bị dạy học"}
          right={<span className="flex items-center gap-2 text-sm text-gray-600"><span className="w-2 h-2 rounded-full bg-emerald-500" />Hệ thống đăng ký đang hoạt động</span>} />

        {/* Đăng ký nhanh */}
        <section className={`${card} mb-5`} aria-labelledby="quick-title">
          <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100">
            <span className="w-9 h-9 rounded-xl bg-[#1a3670]/8 text-[#1a3670] flex items-center justify-center text-xl leading-none" aria-hidden="true">+</span>
            <div><h2 id="quick-title" className="font-semibold text-gray-900">Đăng ký mượn nhanh</h2><p className="text-sm text-gray-500">Chọn môn, ngày và tiết để xem thiết bị còn trống rồi điền phiếu.</p></div>
          </div>
          <div className="grid gap-3 px-6 py-5 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
            <label className="block"><span className="block text-sm font-semibold text-gray-700 mb-1.5">Môn học</span>
              <select className={selectCls} value={quick.subjectId} onChange={(e) => setQuick({ ...quick, subjectId: e.target.value })}>{SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="block"><span className="block text-sm font-semibold text-gray-700 mb-1.5">Ngày sử dụng {quickDate && <span className="font-normal text-gray-500">· {dayLabel(quickDate)}</span>}</span>
              <input type="date" className={selectCls} min={user?.isAdmin ? undefined : vnToIso(tomorrowVN())} value={quick.date} onChange={(e) => setQuick({ ...quick, date: e.target.value })} /></label>
            <label className="block"><span className="block text-sm font-semibold text-gray-700 mb-1.5">Tiết học</span>
              <select className={selectCls} value={quick.slot} onChange={(e) => setQuick({ ...quick, slot: e.target.value })}>{SLOT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <button onClick={submitQuick} className="h-[46px] px-5 rounded-xl bg-[#1a3670] hover:bg-[#132d5e] text-white font-semibold text-[15px] whitespace-nowrap">{user ? "Tìm thiết bị còn trống" : "Đăng nhập để đăng ký"}</button>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2 mb-5">
          {/* Phiếu sắp tới */}
          <section className={`${card} p-6`}>
            <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-gray-900">{user ? "Phiếu sắp tới của tôi" : "Mượn thiết bị như thế nào?"}</h2>{user && <span className="text-sm text-gray-500">{upcoming.length} phiếu</span>}</div>
            {!user ? (
              <ol className="space-y-2.5 text-[15px] text-gray-700 list-decimal pl-5">
                <li>Đăng nhập bằng tài khoản Google của trường.</li>
                <li>Chọn môn, ngày, tiết và thiết bị; đăng ký trước giờ dạy ít nhất 24 giờ.</li>
                <li>Chờ phòng thiết bị duyệt, nhận email, đến lấy thiết bị và trả đúng hạn.</li>
              </ol>
            ) : mine === null ? <p className="text-sm text-gray-400">Đang tải…</p> : upcoming.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-xl py-8 text-center">
                <p className="font-semibold text-gray-800">Chưa có phiếu sắp tới</p>
                <p className="text-sm text-gray-500 mt-1">Dùng đăng ký nhanh ở trên để tạo phiếu đầu tiên.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">{upcoming.slice(0, 4).map((r) => {
                const bd = parseVN(r.borrowDate)
                return (
                  <li key={r.id} className="py-3 flex items-start gap-3">
                    <span className="w-12 flex-shrink-0 text-center rounded-lg bg-[#F6F7F9] py-1"><span className="block text-[11px] text-gray-500">{bd ? WEEKDAYS[bd.getDay()].replace("Thứ ", "T").replace("Chủ nhật", "CN") : ""}</span><span className="block font-bold text-[#1a3670] tabular-nums">{r.borrowDate.slice(0, 5)}</span></span>
                    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{r.equipment}</span><span className="block text-xs text-gray-500">{r.subjectName} · lớp {r.className} · {r.period || "chưa ghi tiết"}</span></span>
                    <StatusBadge r={r} small />
                  </li>
                )
              })}</ul>
            )}
            {user && upcoming.length > 0 && <button onClick={() => setPage("mine")} className="mt-3 text-sm font-semibold text-[#1a3670] hover:underline">Xem tất cả phiếu của tôi</button>}
          </section>

          {/* Hôm nay */}
          <section className={`${card} p-6`}>
            <h2 className="font-semibold text-gray-900 mb-4">Hôm nay ở phòng thiết bị</h2>
            <div className="grid grid-cols-3 gap-3">
              {([["Đang cho mượn", lending, "bg-[#F1F4F9] text-[#1a3670]"], ["Cần trả hôm nay", dueToday, "bg-amber-50 text-amber-700"], ["Chờ duyệt", pending, "bg-gray-50 text-gray-700"]] as const).map(([l, v, c]) => (
                <div key={l} className={`rounded-xl px-4 py-3.5 ${c}`}><div className="text-3xl font-bold tabular-nums">{v}</div><div className="text-sm mt-0.5 opacity-90">{l}</div></div>
              ))}
            </div>
            {overdue > 0 ? <p className="mt-4 text-sm text-red-700">Có {overdue} phiếu đã quá hạn trả.</p>
              : <p className="mt-4 text-sm text-gray-500">Kiểm tra thiết bị khi nhận và báo ngay cho phòng thiết bị nếu có hư hỏng.</p>}
          </section>
        </div>

        {/* Môn học */}
        <section className={`${card} p-6 mb-5`}>
          <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-gray-900">Môn học</h2><span className="text-sm text-gray-500">Chọn môn để xem lịch tuần và đăng ký</span></div>
          <div className="flex flex-wrap gap-2.5">
            {SUBJECTS.map((s) => {
              const busy = records.filter((r) => r.subjectId === s.id && r.status === "Mượn").length
              return (
                <button key={s.id} onClick={() => setPage(s.id)} className="flex items-center gap-2.5 pl-3.5 pr-3 py-2 rounded-xl border border-gray-200 hover:border-[#1a3670]/40 hover:bg-[#F6F7F9] text-[15px] text-gray-800">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />{s.name}
                  {busy > 0 && <span className="text-xs text-gray-500">· {busy} đang mượn</span>}
                  <span className="text-gray-400" aria-hidden="true">›</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Đăng ký gần đây */}
        <section className={`${card} overflow-hidden`}>
          <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100"><h2 className="font-semibold text-gray-900">Đăng ký gần đây</h2><span className="text-sm text-gray-500">{records.length} phiếu</span></div>
          {records.length === 0 ? <p className="px-6 py-10 text-center text-sm text-gray-500">Chưa có đăng ký nào.</p> : (
            <ul className="divide-y divide-gray-100">{records.slice(0, shown).map((r) => {
              const sub = SUBJECTS.find((s) => s.id === r.subjectId)
              return (
                <li key={r.id} className="px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sub?.color }} aria-hidden="true" />
                  <span className="font-medium text-gray-900 w-40 truncate">{r.teacherName}</span>
                  <span className="text-sm text-gray-500 w-36">{r.subjectName} · {r.className}</span>
                  <span className="text-sm text-gray-700 flex-1 min-w-[12rem] truncate" title={r.equipment}>{r.equipment}</span>
                  <span className="text-sm text-gray-500 tabular-nums whitespace-nowrap">{r.borrowDate}{r.period ? ` · ${r.period}` : ""}</span>
                  <StatusBadge r={r} small />
                </li>
              )
            })}</ul>
          )}
          {records.length > shown && <div className="px-6 py-3 border-t border-gray-100 text-center"><button onClick={() => setShown(shown + 20)} className="text-sm font-semibold text-[#1a3670] hover:underline">Xem thêm ({records.length - shown} phiếu)</button></div>}
        </section>
      </div>
    </main>
  )
}

// ============ BORROW FORM ============
interface FormState {
  teacherName: string
  className: string
  borrowDate: string
  period: string
  periodPPCT: string
  equipment: string
  returnDate: string
  notes: string
}

const EMPTY_FORM: FormState = { teacherName: "", className: "", borrowDate: "", period: "", periodPPCT: "", equipment: "", returnDate: "", notes: "" }

function BorrowForm({ subjectId, subjectName, onCreated, prefill, onPrefillUsed }: {
  subjectId: string
  subjectName: string
  onCreated?: () => void
  prefill?: Prefill
  onPrefillUsed?: () => void
}) {
  const { user, login } = useAuth()
  // Họ tên mặc định lấy từ tài khoản Google, giáo viên vẫn sửa được
  const blankForm = (): FormState => ({ ...EMPTY_FORM, teacherName: user?.name || "" })
  const [form, setForm] = useState<FormState>(blankForm)
  useEffect(() => { if (user?.name) setForm((f) => (f.teacherName ? f : { ...f, teacherName: user.name })) }, [user?.name])
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  // Danh sách mã thiết bị do chatbot chọn (để server kiểm tra tồn kho chính xác)
  // Thiết bị chọn từ danh mục của môn (máy chủ kiểm tra tồn kho theo mã) + đồ dùng khác ghi tay
  const [picked, setPicked] = useState<BorrowItem[]>([])
  const [otherEquip, setOtherEquip] = useState("")
  const [available, setAvailable] = useState<AvailableItem[] | null>(null)
  const [eqQuery, setEqQuery] = useState("")
  // Tiết sử dụng (S1..S5 sáng, C1..C5 chiều), bài dạy, loại tiết, phòng bộ môn
  const [slots, setSlots] = useState<string[]>([])
  const [lessonName, setLessonName] = useState("")
  const [usageType, setUsageType] = useState("Biểu diễn")
  const [roomId, setRoomId] = useState("")
  const [rooms, setRooms] = useState<Room[]>([])
  const [step, setStep] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const [fromChat, setFromChat] = useState(false)

  // Nhận bản nháp từ Trợ lý thiết bị -> điền sẵn vào form để giáo viên kiểm tra
  useEffect(() => {
    if (!prefill) return
    const d = prefill.draft
    setForm({
      teacherName: d.teacherName || user?.name || "",
      className: d.className || "",
      borrowDate: vnToIso(d.borrowDate || ""),
      period: d.period || "",
      periodPPCT: d.periodPPCT || "",
      equipment: d.equipment || "",
      returnDate: vnToIso(d.returnDate || d.borrowDate || ""),
      notes: d.notes || "",
    })
    setPicked(d.items?.length ? d.items.map((it) => ({ equipmentId: it.equipmentId, quantity: it.quantity })) : [])
    setSlots(d.periods?.length ? d.periods : d.period ? [`S${d.period.replace(/\D/g, "")}`] : [])
    setOtherEquip(d.items?.length ? "" : d.equipment || "")
    setFromChat(true)
    setStep(0)
    setSubmitted(false)
    setError("")
    onPrefillUsed?.()
    // Chờ form hiện ra rồi cuộn tới
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }, [prefill?.key])

  // Số thiết bị còn trống theo ngày mượn – trả đang chọn
  useEffect(() => {
    if (!user) return
    let stop = false
    const from = form.borrowDate ? isoToVn(form.borrowDate) : ""
    const to = form.returnDate ? isoToVn(form.returnDate) : from
    const t = setTimeout(() => {
      fetchAvailable(subjectId, from, to, slots).then((l) => { if (!stop) setAvailable(l) }).catch(() => { if (!stop) setAvailable([]) })
      fetchRoomsAvailability(from, to, slots).then((l) => { if (!stop) setRooms(l) }).catch(() => {})
    }, 250)
    return () => { stop = true; clearTimeout(t) }
  }, [subjectId, form.borrowDate, form.returnDate, slots.join(","), user])

  // Chưa đăng nhập
  if (!user) {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h3 className="text-base font-bold text-gray-800 mb-1">Đăng nhập để gửi yêu cầu mượn</h3>
        <p className="text-sm text-gray-500 mb-5">Vui lòng đăng nhập bằng Google để gửi yêu cầu mượn thiết bị. Admin sẽ duyệt yêu cầu của bạn.</p>
        <button onClick={login} className="px-6 py-3 rounded-xl bg-white border-2 border-gray-200 hover:border-[#1a3670] text-gray-700 hover:text-[#1a3670] font-semibold text-sm transition-colors">
          Đăng nhập bằng Google
        </button>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!slots.length) { setError("Chọn ít nhất một tiết dạy"); return }
    if (!picked.length && !otherEquip.trim()) { setError("Chọn ít nhất một thiết bị trong danh sách hoặc ghi đồ dùng khác"); return }
    if (roomId && rooms.find((r) => r.id === roomId)?.busy) { setError("Phòng đã chọn đang bận ở tiết này, hãy chọn phòng hoặc tiết khác"); return }
    const nameOf = (id: string) => available?.find((a) => a.id === id)?.name || id
    const over = picked.find((p) => { const a = available?.find((x) => x.id === p.equipmentId); return a && p.quantity > a.available })
    if (over) { setError(`“${nameOf(over.equipmentId)}” chỉ còn ${available?.find((x) => x.id === over.equipmentId)?.available} trong những ngày này`); return }
    const equipment = [...picked.map((p) => `${nameOf(p.equipmentId)} (x${p.quantity})`), otherEquip.trim()].filter(Boolean).join(", ")

    setLoading(true)
    try {
      // Ô chọn ngày dùng YYYY-MM-DD, máy chủ nhận DD/MM/YYYY
      await createRecord({ subjectId, subjectName, ...form, equipment, periods: slots, lessonName, usageType, roomId: roomId || undefined,
        borrowDate: isoToVn(form.borrowDate), returnDate: isoToVn(form.returnDate), items: picked.length ? picked : undefined })
      setSubmitted(true)
      setPicked([])
      setOtherEquip("")
      setSlots([]); setLessonName(""); setRoomId(""); setStep(0)
      setFromChat(false)
      onCreated?.()
      setTimeout(() => { setSubmitted(false); setForm(blankForm()) }, 3500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setLoading(false)
    }
  }

  const fieldCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1a3670]/25 focus:border-[#1a3670] bg-white transition-all placeholder:text-gray-400"
  const labelCls = "block text-sm font-semibold text-gray-700 mb-1.5"

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Gửi yêu cầu thành công!</h3>
        <p className="text-gray-500 text-sm">Yêu cầu mượn thiết bị đã được gửi. Vui lòng chờ admin duyệt.</p>
      </div>
    )
  }

  const slotText = (sl: string[]) => [["S", "Sáng"], ["C", "Chiều"]].map(([k, n]) => { const t = sl.filter((x) => x[0] === k).map((x) => x.slice(1)).sort(); return t.length ? `${n}: tiết ${t.join(", ")}` : "" }).filter(Boolean).join(" · ")
  const nameOfEq = (id: string) => available?.find((a) => a.id === id)?.name || id
  const bdDate = parseVN(isoToVn(form.borrowDate)), rdDate = parseVN(isoToVn(form.returnDate))
  const STEPS = ["Thời gian & lớp", "Thiết bị & phòng", "Xem lại & gửi"]
  const next = () => {
    setError("")
    if (step === 0) {
      if (!form.teacherName.trim() || !form.className.trim()) return setError("Nhập họ tên giáo viên và lớp dạy")
      if (!form.borrowDate || !form.returnDate) return setError("Chọn ngày mượn và ngày trả")
      if (!slots.length) return setError("Chọn ít nhất một tiết sử dụng thiết bị")
    }
    if (step === 1) {
      if (!picked.length && !otherEquip.trim()) return setError("Chọn ít nhất một thiết bị trong danh sách hoặc ghi đồ dùng khác")
      const over = picked.find((p) => { const a = available?.find((x) => x.id === p.equipmentId); return a && p.quantity > a.available })
      if (over) return setError(`“${nameOfEq(over.equipmentId)}” chỉ còn ${available?.find((x) => x.id === over.equipmentId)?.available} ở thời gian đã chọn`)
      if (roomId && rooms.find((r) => r.id === roomId)?.busy) return setError("Phòng đã chọn đang bận ở tiết này")
    }
    setStep(step + 1)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }
  const summaryRow = (label: string, value: React.ReactNode) => (
    <div><dt className="text-xs text-gray-500">{label}</dt><dd className="text-sm font-semibold text-gray-900 mt-0.5">{value || <span className="font-normal text-gray-400">Chưa chọn</span>}</dd></div>
  )

  return (
    <form ref={formRef} onSubmit={(e) => { if (step < 2) { e.preventDefault(); next() } else handleSubmit(e) }} className="scroll-mt-24 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">
        {/* Thanh bước */}
        <ol className="grid grid-cols-3 gap-3 mb-6" aria-label="Các bước đăng ký">
          {STEPS.map((t, i) => (
            <li key={t}>
              <button type="button" disabled={i > step} onClick={() => setStep(i)} className="w-full text-left disabled:cursor-default" aria-current={i === step ? "step" : undefined}>
                <span className={`block h-1.5 rounded-full mb-2 ${i <= step ? "bg-[#1a3670]" : "bg-gray-200"}`} />
                <span className={`text-sm font-semibold ${i === step ? "text-[#1a3670]" : i < step ? "text-gray-700" : "text-gray-400"}`}>{i + 1}. {t}</span>
              </button>
            </li>
          ))}
        </ol>

        {fromChat && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-start justify-between gap-3 mb-4">
            <span>Một số thông tin đã được điền sẵn. Kiểm tra lại từng bước trước khi gửi.</span>
            <button type="button" onClick={() => { setFromChat(false); setPicked([]); setOtherEquip(""); setSlots([]); setForm(blankForm()); setStep(0) }} className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline">Xóa</button>
          </div>
        )}
        {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium mb-4">{error}</div>}

        {step === 0 && (
          <div className="space-y-5">
            <div><h3 className="text-lg font-bold text-gray-900">Thời gian và lớp học</h3><p className="text-sm text-gray-500">Ai sử dụng thiết bị, cho lớp nào và vào tiết nào.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls} htmlFor="teacherName">Họ tên giáo viên <span className="text-red-500">*</span></label><input id="teacherName" className={fieldCls} placeholder="Nguyễn Văn A" value={form.teacherName} onChange={(e) => setForm({ ...form, teacherName: e.target.value })} /></div>
              <div><label className={labelCls} htmlFor="className">Lớp dạy <span className="text-red-500">*</span></label><input id="className" className={fieldCls} placeholder="8A1" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></div>
              <div>
                <label className={labelCls} htmlFor="borrowDate">Ngày mượn <span className="text-red-500">*</span></label>
                <input id="borrowDate" type="date" className={fieldCls} min={user.isAdmin ? undefined : vnToIso(tomorrowVN())} value={form.borrowDate}
                  onChange={(e) => {
                    const v = e.target.value
                    const complete = /^[1-9]\d{3}-\d{2}-\d{2}$/.test(v)
                    const follow = complete && (!form.returnDate || form.returnDate < v)
                    setForm({ ...form, borrowDate: v, returnDate: follow ? v : form.returnDate })
                  }} />
                <p className="text-xs text-gray-500 mt-1">{bdDate ? dayLabel(bdDate) : "Đăng ký trước giờ dạy ít nhất 24 giờ"}</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="returnDate">Ngày trả dự kiến <span className="text-red-500">*</span></label>
                <input id="returnDate" type="date" className={fieldCls} min={form.borrowDate || undefined} value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
                <p className="text-xs text-gray-500 mt-1">{rdDate ? dayLabel(rdDate) : "Chưa chọn"}</p>
              </div>
            </div>
            <div>
              <span className={labelCls}>Tiết sử dụng thiết bị <span className="text-red-500">*</span> <span className="font-normal text-gray-500 text-xs">(chọn một hoặc nhiều tiết)</span></span>
              <div className="space-y-2">
                {([["S", "Sáng"], ["C", "Chiều"]] as const).map(([k, name]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-12 text-sm font-medium text-gray-500">{name}</span>
                    <div className="grid grid-cols-5 gap-1.5 flex-1">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const code = `${k}${n}`, on = slots.includes(code)
                        return (
                          <button type="button" key={code} aria-pressed={on} onClick={() => setSlots((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]))}
                            className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${on ? "bg-[#1a3670] border-[#1a3670] text-white" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                            Tiết {n}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {form.borrowDate && form.returnDate && form.borrowDate !== form.returnDate && <p className="text-xs text-amber-700 mt-1.5">Mượn nhiều ngày: thiết bị được tính là đang ở chỗ thầy/cô từ tiết đầu của ngày mượn đến tiết cuối của ngày trả, nên lớp khác không mượn được trong khoảng đó. Nếu chỉ dùng trong một ngày, hãy chọn ngày trả bằng ngày mượn.</p>}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div><h3 className="text-lg font-bold text-gray-900">Thiết bị và phòng</h3><p className="text-sm text-gray-500">Số “Còn” tính theo ngày và tiết đã chọn ở bước 1.</p></div>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {available && available.length > 8 && (
                <div className="p-2 border-b border-gray-100 bg-gray-50"><input type="search" aria-label="Tìm thiết bị" className={fieldCls} placeholder="Tìm thiết bị…" value={eqQuery} onChange={(e) => setEqQuery(e.target.value)} /></div>
              )}
              <ul className="max-h-[26rem] overflow-y-auto divide-y divide-gray-100">
                {available === null && <li className="px-4 py-3 text-sm text-gray-400">Đang tải danh mục…</li>}
                {available?.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Môn này chưa có thiết bị trong danh mục. Ghi đồ dùng ở ô bên dưới.</li>}
                {available?.filter((a) => !eqQuery || a.name.toLowerCase().includes(eqQuery.toLowerCase())).map((a) => {
                  const qty = picked.find((p) => p.equipmentId === a.id)?.quantity || 0
                  const setQty = (n: number) => setPicked((prev) => (n <= 0 ? prev.filter((p) => p.equipmentId !== a.id) : prev.some((p) => p.equipmentId === a.id) ? prev.map((p) => (p.equipmentId === a.id ? { ...p, quantity: n } : p)) : [...prev, { equipmentId: a.id, quantity: n }]))
                  return (
                    <li key={a.id} className={`px-4 py-3 flex items-center gap-3 ${qty ? "bg-[#1a3670]/[.04]" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-gray-900">{a.name}</div>
                        <div className="text-xs text-gray-500">{a.grades.length ? `Lớp ${a.grades.join(", ")} · ` : ""}{a.location}</div>
                      </div>
                      <span className={`text-sm font-semibold whitespace-nowrap ${a.available === 0 ? "text-red-600" : "text-emerald-700"}`}>{a.available === 0 ? "Hết" : `Còn ${a.available}`}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" aria-label={`Bớt ${a.name}`} disabled={!qty} onClick={() => setQty(qty - 1)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 font-bold">−</button>
                        <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">{qty}</span>
                        <button type="button" aria-label={`Thêm ${a.name}`} disabled={qty >= a.available} onClick={() => setQty(qty + 1)} className="w-8 h-8 rounded-lg bg-[#1a3670] text-white hover:bg-[#132d5e] disabled:opacity-30 font-bold">+</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div><label className={labelCls} htmlFor="otherEquip">Đồ dùng khác (không có trong danh sách)</label><input id="otherEquip" className={fieldCls} placeholder="Ghi thêm nếu có…" value={otherEquip} onChange={(e) => setOtherEquip(e.target.value)} /></div>
            {rooms.length > 0 && (
              <div>
                <label className={labelCls} htmlFor="roomId">Phòng bộ môn</label>
                <select id="roomId" className={fieldCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  <option value="">Không mượn phòng (dạy tại lớp)</option>
                  {rooms.map((r) => <option key={r.id} value={r.id} disabled={r.busy}>{r.name}{r.busy ? ` – đang bận: ${r.busyBy}` : ""}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div><h3 className="text-lg font-bold text-gray-900">Bài dạy và xác nhận</h3><p className="text-sm text-gray-500">Thông tin này được ghi vào sổ mượn trả thiết bị.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls} htmlFor="lessonName">Tên bài dạy</label><input id="lessonName" className={fieldCls} placeholder="VD: Bài 8 – Áp suất chất lỏng" value={lessonName} onChange={(e) => setLessonName(e.target.value)} /></div>
              <div><label className={labelCls} htmlFor="ppct">Tiết theo PPCT <span className="text-red-500">*</span></label><input id="ppct" required className={fieldCls} placeholder="VD: Tiết 25" value={form.periodPPCT} onChange={(e) => setForm({ ...form, periodPPCT: e.target.value })} /></div>
            </div>
            <div>
              <span className={labelCls}>Loại tiết</span>
              <div className="flex gap-2 max-w-sm">
                {["Biểu diễn", "Thực hành"].map((t) => (
                  <button type="button" key={t} aria-pressed={usageType === t} onClick={() => setUsageType(t)} className={`flex-1 py-2.5 rounded-xl border text-sm font-medium ${usageType === t ? "bg-[#1a3670] border-[#1a3670] text-white" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>{t}</button>
                ))}
              </div>
            </div>
            <div><label className={labelCls} htmlFor="notes">Ghi chú</label><textarea id="notes" rows={2} className={fieldCls} placeholder="Ghi chú thêm nếu có…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <p className="text-sm text-gray-600 bg-[#F6F7F9] rounded-xl px-4 py-3">Phiếu được gửi đến phòng thiết bị để duyệt. Thầy/cô nhận email khi phiếu được duyệt hoặc từ chối và theo dõi tại “Phiếu của tôi”.</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-7 pt-5 border-t border-gray-100">
          {step > 0 ? <button type="button" onClick={() => { setError(""); setStep(step - 1) }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200">Quay lại</button> : <span />}
          <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-xl bg-[#1a3670] hover:bg-[#132d5e] text-white font-semibold text-sm disabled:opacity-60">
            {step < 2 ? "Tiếp tục" : loading ? "Đang gửi…" : "Gửi yêu cầu mượn"}
          </button>
        </div>
      </div>

      {/* Tóm tắt phiếu */}
      <aside className="lg:sticky lg:top-8 self-start">
        <div className="rounded-2xl bg-[#F6F7F9] border border-gray-200/80 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Tóm tắt phiếu</h3>
          <dl className="space-y-3.5">
            {summaryRow("Môn học", subjectName)}
            {summaryRow("Thời gian", bdDate ? <>{dayLabel(bdDate)}{rdDate && rdDate.getTime() !== bdDate.getTime() ? ` → ${dayLabel(rdDate)}` : ""}{slots.length ? <span className="block font-normal text-gray-600">{slotText(slots)}</span> : null}</> : null)}
            {summaryRow("Lớp", form.className)}
            {summaryRow("Thiết bị", picked.length || otherEquip ? <ul className="space-y-0.5">{picked.map((p) => <li key={p.equipmentId}>{nameOfEq(p.equipmentId)} <span className="text-gray-500">×{p.quantity}</span></li>)}{otherEquip && <li>{otherEquip}</li>}</ul> : null)}
            {roomId && summaryRow("Phòng", rooms.find((r) => r.id === roomId)?.name)}
          </dl>
        </div>
      </aside>
    </form>
  )
}

// ============ SUBJECT PAGE ============
type Prefill = { draft: BorrowDraft; key: number } | null

/** Các tiết một phiếu chiếm (phiếu cũ "Tiết n" = buổi sáng) */
const recSlots = (r: BorrowRecord) => (r.periods?.length ? r.periods : /^Tiết (\d)$/.test(r.period || "") ? [`S${r.period!.slice(-1)}`] : [])

/** Lịch sử dụng trong tuần dạng thời khóa biểu: Thứ 2–6 × tiết */
function WeekGrid({ records }: { records: BorrowRecord[] }) {
  const [offset, setOffset] = useState(0)
  const [picked, setPicked] = useState<{ key: string; list: BorrowRecord[] } | null>(null)
  const monday = todayStart(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7)
  const days = [0, 1, 2, 3, 4].map((i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
  const active = records.filter((r) => r.status !== "Từ chối")
  const ORDER = ["S1", "S2", "S3", "S4", "S5", "C1", "C2", "C3", "C4", "C5"]
  /** "use" = tiết dạy đã chọn; "hold" = thiết bị đang ở chỗ giáo viên (mượn nhiều ngày) nhưng không phải tiết dạy */
  const kind = (r: BorrowRecord, d: Date, slot: string): "use" | "hold" | null => {
    const bd = parseVN(r.borrowDate), rd = parseVN(r.returnDate)
    if (!bd || !rd || d < bd || d > rd) return null
    const sl = recSlots(r)
    if (!sl.length) return "use"
    if (sl.includes(slot)) return "use"
    if (bd.getTime() === rd.getTime()) return null
    const i = ORDER.indexOf(slot)
    if (d.getTime() === bd.getTime()) return i >= ORDER.indexOf(sl[0]) ? "hold" : null
    if (d.getTime() === rd.getTime()) return i <= ORDER.indexOf(sl[sl.length - 1]) ? "hold" : null
    return "hold"
  }
  const at = (d: Date, slot: string) => active.filter((r) => kind(r, d, slot) === "use")
  const held = (d: Date, slot: string) => active.filter((r) => kind(r, d, slot) === "hold")
  const hasAfternoon = days.some((d) => [1, 2, 3, 4, 5].some((n) => at(d, `C${n}`).length || held(d, `C${n}`).length))
  const [showPM, setShowPM] = useState(false)
  const rows = [1, 2, 3, 4, 5].map((n) => `S${n}`).concat(showPM || hasAfternoon ? [1, 2, 3, 4, 5].map((n) => `C${n}`) : [])
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
  const isToday = (d: Date) => d.getTime() === todayStart().getTime()

  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 mb-6" aria-labelledby="week-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
        <div>
          <h2 id="week-title" className="font-semibold text-gray-900">Lịch sử dụng {offset === 0 ? "tuần này" : offset === 1 ? "tuần sau" : offset === -1 ? "tuần trước" : "tuần " + fmt(days[0])}</h2>
          <p className="text-sm text-gray-500">Tuần {fmt(days[0])}–{fmt(days[4])}. Chọn ô có lớp để xem thiết bị.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-3 text-xs text-gray-500 mr-2"><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#1a3670]" />Đã có lớp</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-300" />Chờ duyệt</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#1a3670]/15 border border-[#1a3670]/30" />Đang giữ (mượn nhiều ngày)</span></span>
          <button onClick={() => setOffset(offset - 1)} className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200" aria-label="Tuần trước">‹</button>
          {offset !== 0 && <button onClick={() => setOffset(0)} className="px-3 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">Tuần này</button>}
          <button onClick={() => setOffset(offset + 1)} className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200" aria-label="Tuần sau">›</button>
        </div>
      </div>
      <div className="overflow-x-auto px-6 py-5">
        <table className="w-full min-w-[34rem] border-separate border-spacing-1.5 table-fixed">
          <thead><tr>
            <th className="w-20" />
            {days.map((d) => <th key={d.getTime()} className={`text-sm font-semibold pb-1 ${isToday(d) ? "text-[#1a3670]" : "text-gray-700"}`}>{WEEKDAYS[d.getDay()].replace("Thứ ", "Thứ ")}<span className="block text-xs font-normal text-gray-500">{fmt(d)}</span></th>)}
          </tr></thead>
          <tbody>
            {rows.map((slot) => (
              <tr key={slot}>
                <th className="text-left text-sm font-medium text-gray-600 pr-2 whitespace-nowrap">{slot[0] === "S" ? "" : "Chiều "}Tiết {slot.slice(1)}</th>
                {days.map((d) => {
                  const list = at(d, slot)
                  const holding = list.length ? [] : held(d, slot)
                  const key = `${d.getTime()}-${slot}`
                  const pending = list.length > 0 && list.every((r) => r.status === "Chờ duyệt")
                  return (
                    <td key={key} className="p-0">
                      {list.length ? (
                        <button onClick={() => setPicked(picked?.key === key ? null : { key, list })} aria-expanded={picked?.key === key}
                          className={`w-full h-11 rounded-lg text-sm font-semibold truncate px-2 ${pending ? "bg-amber-100 text-amber-900 hover:bg-amber-200" : "bg-[#1a3670] text-white hover:bg-[#23468e]"} ${picked?.key === key ? "ring-2 ring-offset-1 ring-[#F5B841]" : ""}`}>
                          {[...new Set(list.map((r) => r.className))].join(", ")}
                        </button>
                      ) : holding.length ? (
                        <button onClick={() => setPicked(picked?.key === key ? null : { key, list: holding })} aria-expanded={picked?.key === key}
                          title="Thiết bị đang ở chỗ giáo viên (mượn nhiều ngày), không phải tiết dạy"
                          className={`w-full h-11 rounded-lg text-xs font-medium truncate px-2 bg-[#1a3670]/10 text-[#1a3670] border border-dashed border-[#1a3670]/30 hover:bg-[#1a3670]/15 ${picked?.key === key ? "ring-2 ring-offset-1 ring-[#F5B841]" : ""}`}>
                          đang giữ
                        </button>
                      ) : <div className={`h-11 rounded-lg ${isToday(d) ? "bg-[#1a3670]/[.06]" : "bg-[#F1F3F6]"}`} />}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!hasAfternoon && <button onClick={() => setShowPM(!showPM)} className="mt-2 text-sm text-[#1a3670] font-semibold hover:underline">{showPM ? "Ẩn buổi chiều" : "Hiện buổi chiều"}</button>}
        {picked && (
          <div className="mt-4 rounded-xl border border-gray-200 divide-y divide-gray-100">
            {picked.list.map((r) => (
              <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold text-gray-900">{r.className} · {r.teacherName}</span>
                <span className="text-gray-600 flex-1 min-w-[12rem]">{r.equipment}</span>
                {r.roomName && <span className="text-gray-500">{r.roomName}</span>}
                <StatusBadge r={r} small />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function SubjectPage({ subjectId, setPage, refreshKey = 0, prefill = null, onPrefillUsed }: {
  subjectId: string
  setPage: (p: Page) => void
  refreshKey?: number
  prefill?: Prefill
  onPrefillUsed?: () => void
}) {
  const subject = SUBJECTS.find((s) => s.id === subjectId)!
  const [records, setRecords] = useState<BorrowRecord[]>([])
  const [eqCount, setEqCount] = useState<number | null>(null)
  const [shown, setShown] = useState(8)
  const formBox = useRef<HTMLElement>(null)
  const { user } = useAuth()

  const loadData = useCallback(() => { fetchRecords({ subjectId }).then(setRecords).catch(console.error) }, [subjectId])
  useEffect(() => { loadData() }, [loadData, refreshKey])
  useEffect(() => { if (user) fetchAvailable(subjectId, "", "").then((l) => setEqCount(l.length)).catch(() => {}) }, [subjectId, user])

  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-6xl">
        <PageHeader back={{ label: "Trang chủ", onClick: () => setPage("home") }}
          kicker={<span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subject.color }} />{subject.group}{eqCount !== null ? ` · ${eqCount} loại thiết bị` : ""}</span>}
          title={subject.name}
          right={<button onClick={() => formBox.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="px-5 py-3 rounded-xl bg-[#1a3670] hover:bg-[#132d5e] text-white font-semibold text-[15px]">+ Đăng ký mượn</button>} />

        <WeekGrid records={records} />

        <section ref={formBox} className="bg-white rounded-2xl border border-gray-200/80 mb-6 scroll-mt-20" aria-labelledby="form-title">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 id="form-title" className="font-semibold text-gray-900">Tạo phiếu đăng ký</h2>
            <p className="text-sm text-gray-500">Hoàn thành 3 bước; thông tin đã nhập luôn hiện ở phần tóm tắt.</p>
          </div>
          <div className="p-6">
            <BorrowForm subjectId={subjectId} subjectName={subject.name} onCreated={loadData} prefill={prefill} onPrefillUsed={onPrefillUsed} />
          </div>
        </section>

        {records.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"><h2 className="font-semibold text-gray-900">Lịch sử mượn – trả</h2><span className="text-sm text-gray-500">{records.length} phiếu</span></div>
            <ul className="divide-y divide-gray-100">{records.slice(0, shown).map((r) => (
              <li key={r.id} className="px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium text-gray-900 w-40 truncate">{r.teacherName}</span>
                <span className="text-sm text-gray-500 w-16">{r.className}</span>
                <span className="text-sm text-gray-700 flex-1 min-w-[12rem] truncate" title={r.equipment}>{r.equipment}</span>
                <span className="text-sm text-gray-500 tabular-nums whitespace-nowrap">{r.borrowDate}{r.period ? ` · ${r.period}` : ""}</span>
                <StatusBadge r={r} small />
              </li>
            ))}</ul>
            {records.length > shown && <div className="px-6 py-3 border-t border-gray-100 text-center"><button onClick={() => setShown(shown + 20)} className="text-sm font-semibold text-[#1a3670] hover:underline">Xem thêm ({records.length - shown} phiếu)</button></div>}
          </section>
        )}
      </div>
    </main>
  )
}

// ============ ADMIN PAGE ============
// Menu trang quản trị (bố cục kiểu phần mềm quản lý: thanh bên trái chia nhóm nghiệp vụ)
const ADMIN_MENU: { group: string; items: { id: string; label: string; tab: string }[] }[] = [
  { group: "", items: [{ id: "tong-quan", label: "Tổng quan", tab: "dashboard" }] },
  { group: "Nghiệp vụ", items: [
    { id: "muon-tra", label: "Mượn – trả thiết bị", tab: "records" },
    { id: "ghi-tang", label: "Ghi tăng (nhập kho)", tab: "purchases" },
    { id: "ghi-giam", label: "Ghi giảm (thanh lý, mất)", tab: "disposals" },
    { id: "kiem-ke", label: "Kiểm kê", tab: "audit" },
    { id: "bao-tri", label: "Bảo trì – sửa chữa", tab: "maintenance" },
    { id: "xac-nhan-mat", label: "Xác nhận mất thiết bị", tab: "loss" },
    { id: "de-xuat", label: "Đề xuất mua sắm", tab: "proposals" },
  ] },
  { group: "Danh mục", items: [{ id: "danh-muc", label: "Danh mục thiết bị", tab: "inventory" }, { id: "phong", label: "Phòng bộ môn", tab: "rooms" }] },
  { group: "Giáo viên", items: [{ id: "thi-dua", label: "Điểm thi đua", tab: "points" }] },
  { group: "Báo cáo", items: [
    { id: "bao-cao", label: "Báo cáo tổng hợp", tab: "reports" },
    { id: "so-sach", label: "Sổ sách, biểu mẫu", tab: "books" },
  ] },
  { group: "Hệ thống", items: [{ id: "thong-bao", label: "Thông báo", tab: "notifications" }] },
]
const ADMIN_ITEMS = ADMIN_MENU.flatMap((g) => g.items)

function AdminPage({ section = "tong-quan", go }: { section?: string; go: (section: string) => void }) {
  const { user } = useAuth()
  const current = ADMIN_ITEMS.find((i) => i.id === section) || ADMIN_ITEMS[0]
  const tab = current.tab
  useEffect(() => { if (tab === "notifications") loadNotifsRef.current?.() }, [tab])
  const loadNotifsRef = useRef<(() => void) | null>(null)
  const [returning, setReturning] = useState<BorrowRecord | null>(null)
  const [records, setRecords] = useState<BorrowRecord[]>([])
  const [filterSubject, setFilterSubject] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const isAdmin = !!user?.isAdmin
  const latestRequest = useRef<AbortController | null>(null)

  // Chờ người dùng ngừng gõ 300ms rồi mới tìm, tránh gọi API sau mỗi phím
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadData = useCallback(() => {
    if (!isAdmin) return
    latestRequest.current?.abort() // hủy request cũ để kết quả không bị ghi đè lộn xộn
    const ctrl = new AbortController()
    latestRequest.current = ctrl
    setLoading(true)
    const status = filterStatus === "overdue" ? "Mượn" : filterStatus
    fetchRecords({ subjectId: filterSubject || undefined, status: status || undefined, search: debouncedSearch || undefined }, ctrl.signal)
      .then((list) => setRecords(filterStatus === "overdue" ? list.filter(isOverdue) : list))
      .catch((err) => { if (err?.name !== "AbortError") console.error(err) })
      .finally(() => { if (latestRequest.current === ctrl) setLoading(false) })
  }, [isAdmin, filterSubject, filterStatus, debouncedSearch])

  const loadNotifs = useCallback(() => {
    if (!isAdmin) return
    fetchNotifications().then(setNotifs).catch(console.error)
    fetchUnreadCount().then((n) => { setUnreadCount(n); notifyNotifsChanged() }).catch(() => {})
  }, [isAdmin])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadNotifs() }, [loadNotifs])
  loadNotifsRef.current = loadNotifs
  useEffect(() => () => latestRequest.current?.abort(), [])

  if (!user?.isAdmin) {
    return (
      <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Không có quyền truy cập</h2>
          <p className="text-gray-500 text-sm">Trang quản trị chỉ dành cho quản trị viên.</p>
        </div>
      </main>
    )
  }

  const handleStatusChange = async (id: string, newStatus: RecordStatus) => {
    let reason: string | undefined
    if (newStatus === "Từ chối") {
      const r = prompt("Lý do từ chối (sẽ gửi cho giáo viên, có thể để trống):", "")
      if (r === null) return // bấm Hủy
      reason = r.trim()
    }
    try { await updateRecordStatus(id, newStatus, reason); loadData(); loadNotifs() } catch (err) { alert(err instanceof Error ? err.message : "Lỗi") }
  }
  const handleDelete = async (id: string) => {
    if (!confirm("Xác nhận xóa?")) return
    try { await deleteRecord(id); loadData() } catch (err) { alert(err instanceof Error ? err.message : "Lỗi") }
  }

  const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 bg-white text-gray-700"

  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-[1500px] mx-auto">
        <div>
        <section className="flex-1 min-w-0">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-500 mb-1">Trung tâm điều hành · {ADMIN_MENU.find((g) => g.items.includes(current))?.group || "Tổng quan"}</div>
            <h1 className="text-[28px] sm:text-3xl font-bold text-[#1F2937] tracking-tight">{current.label}</h1>
          </div>
          <select aria-label="Chọn chức năng" className="lg:hidden w-full sm:w-auto border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={current.id} onChange={(e) => go(e.target.value)}>
            {ADMIN_MENU.map((g) => <optgroup key={g.group || "home"} label={g.group || "Chung"}>{g.items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}</optgroup>)}
          </select>
        </div>

        {tab === "dashboard" && <Dashboard go={go} />}
        {tab === "disposals" && <DisposalTab subjects={SUBJECTS} />}
        {tab === "books" && <BooksTab subjects={SUBJECTS} />}
        {tab === "loss" && <LossTab />}
        {tab === "rooms" && <RoomsTab subjects={SUBJECTS} />}
        {tab === "proposals" && <ProposalsTab />}
        {tab === "records" && <AdminSummary onPick={(st) => { setFilterStatus(st); setFilterSubject(""); setSearch("") }} active={filterStatus} refreshKey={records} />}
        {tab === "records" && (
          <div className="flex justify-end -mt-2 mb-3">
            <button onClick={async () => {
              try { const r = await sendRemindersNow(); alert(`Đã kiểm tra: ${r.due} phiếu sắp đến hạn, ${r.overdue} phiếu quá hạn. Đã gửi ${r.sent} email nhắc.${r.sent < r.due + r.overdue ? "\nMột số phiếu không gửi được (chưa cấu hình email hoặc phiếu cũ không có email giáo viên)." : ""}`) }
              catch (e) { alert(e instanceof Error ? e.message : "Lỗi") }
            }} className="text-xs font-semibold text-[#1a3670] hover:underline">Gửi email nhắc hạn trả ngay</button>
          </div>
        )}

        {tab === "records" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
              <input type="search" aria-label="Tìm kiếm" placeholder="Tìm giáo viên, lớp, đồ dùng..." className="border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 bg-white w-full sm:w-64 placeholder:text-gray-400" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className={selectCls} value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
                <option value="">Tất cả môn</option>
                {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className={selectCls} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="Chờ duyệt">Chờ duyệt</option>
                <option value="Mượn">Đang mượn</option>
                <option value="Trả">Đã trả</option>
                <option value="Từ chối">Từ chối</option>
                <option value="overdue">Quá hạn trả</option>
              </select>
              <span className="text-sm text-gray-400 ml-auto">{loading ? "..." : `${records.length} kết quả`}</span>
            </div>
            {records.length === 0 ? (
              <div className="text-center py-16 text-gray-400"><div className="text-5xl mb-3">📋</div><p className="text-sm">Trống</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {["Giáo viên", "Lớp", "Môn", "Tiết", "Đồ dùng", "Mượn", "Trả", "Trạng thái", "Thao tác"].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.map((r) => {
                      const sub = SUBJECTS.find((s) => s.id === r.subjectId)
                      const btn = "px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
                      return (
                        <tr key={r.id} className={isOverdue(r) ? "bg-rose-50/50" : "hover:bg-gray-50/60"}>
                          <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{r.teacherName}{(r.code || r.roomName) && <div className="text-[10px] text-gray-400 font-normal">{[r.code, r.roomName].filter(Boolean).join(" · ")}</div>}</td>
                          <td className="px-3 py-3 text-gray-600">{r.className}</td>
                          <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white whitespace-nowrap" style={{ backgroundColor: sub?.color || "#888" }}>{r.subjectName}</span></td>
                          <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{r.period || "-"}</td>
                          <td className="px-3 py-3 text-gray-700 min-w-[180px] max-w-[280px]">
                            <div className="line-clamp-2" title={r.equipment}>{r.equipment}</div>
                            {r.notes && <div className="text-[11px] text-gray-400 truncate" title={r.notes}>Ghi chú: {r.notes}</div>}
                          </td>
                          <td className="px-3 py-3 text-gray-600 whitespace-nowrap text-xs">{r.borrowDate}</td>
                          <td className="px-3 py-3 text-gray-600 whitespace-nowrap text-xs">{r.returnDate}</td>
                          <td className="px-3 py-3"><StatusBadge r={r} small />
                            {r.returnReport && (r.returnReport.items.length > 0 || r.returnReport.lateDays > 0) && (
                              <div className="text-[10px] text-rose-600 mt-1 whitespace-nowrap" title={r.returnReport.note || undefined}>
                                {[r.returnReport.lateDays > 0 && `trễ ${r.returnReport.lateDays} ngày`, r.returnReport.items.some((x) => x.damaged) && `hỏng ${r.returnReport.items.reduce((a, x) => a + x.damaged, 0)}`, r.returnReport.items.some((x) => x.lost) && `mất ${r.returnReport.items.reduce((a, x) => a + x.lost, 0)}`].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1.5">
                              {r.status === "Chờ duyệt" && <button onClick={() => handleStatusChange(r.id, "Mượn")} className={`${btn} bg-green-600 hover:bg-green-700 text-white`}>Duyệt</button>}
                              {r.status === "Chờ duyệt" && <button onClick={() => handleStatusChange(r.id, "Từ chối")} className={`${btn} bg-red-50 hover:bg-red-100 text-red-700`}>Từ chối</button>}
                              {r.status === "Mượn" && <button onClick={() => setReturning(r)} className={`${btn} bg-[#1a3670] hover:bg-[#132d5e] text-white`}>Đã trả</button>}
                              {r.status === "Trả" && <button onClick={() => handleStatusChange(r.id, "Mượn")} className={`${btn} bg-gray-100 hover:bg-gray-200 text-gray-700`}>Hoàn tác</button>}
                              <button onClick={() => handleDelete(r.id)} className={`${btn} text-gray-400 hover:text-red-600 hover:bg-red-50`} aria-label="Xóa phiếu" title="Xóa phiếu">Xóa</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "inventory" && <InventoryTab subjects={SUBJECTS} />}
        {tab === "purchases" && <PurchasesTab subjects={SUBJECTS} />}
        {tab === "points" && <PointsTab />}
        {tab === "audit" && <AuditTab subjects={SUBJECTS} />}
        {tab === "maintenance" && <MaintenanceTab subjects={SUBJECTS} />}
        {tab === "reports" && <ReportsTab />}
        {returning && <ReturnDialog record={returning} subjects={SUBJECTS} onClose={() => setReturning(null)} onDone={() => { setReturning(null); loadData(); loadNotifs() }} />}

        {tab === "notifications" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Thông báo ({notifs.length})</h2>
              {unreadCount > 0 && <button onClick={async () => { await markAllNotificationsRead(); loadNotifs() }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Đọc hết</button>}
            </div>
            {notifs.length === 0 ? (
              <div className="text-center py-16 text-gray-400"><div className="text-5xl mb-3">🔔</div><p className="text-sm">Trống</p></div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifs.map((n) => (
                  <div key={n.id} className={`px-5 py-4 flex items-start gap-3 ${n.read ? "" : "bg-blue-50/40"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${n.type === "borrow" ? "bg-blue-100 text-blue-600" : n.type === "return" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"}`}>
                      {n.type === "borrow" ? "📥" : n.type === "return" ? "📤" : "ℹ️"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm ${n.read ? "text-gray-700" : "font-bold text-gray-900"}`}>{n.title}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString("vi-VN")}</p>
                    </div>
                    {!n.read && <button onClick={async () => { await markNotificationRead(n.id); loadNotifs() }} className="text-[10px] text-blue-500 font-bold">OK</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </section>
        </div>
      </div>
    </main>
  )
}

// ============ ADMIN: Ô TÓM TẮT VIỆC CẦN LÀM ============
function AdminSummary({ onPick, active, refreshKey }: { onPick: (status: string) => void; active: string; refreshKey: unknown }) {
  const [all, setAll] = useState<BorrowRecord[]>([])
  useEffect(() => { fetchRecords().then(setAll).catch(() => {}) }, [refreshKey])
  const items = [
    { key: "Chờ duyệt", label: "Chờ duyệt", value: all.filter((r) => r.status === "Chờ duyệt").length, cls: "border-amber-200 bg-amber-50 text-amber-800" },
    { key: "overdue", label: "Quá hạn trả", value: all.filter(isOverdue).length, cls: "border-rose-200 bg-rose-50 text-rose-800" },
    { key: "Mượn", label: "Đang mượn", value: all.filter((r) => r.status === "Mượn").length, cls: "border-blue-200 bg-blue-50 text-blue-800" },
    { key: "", label: "Tất cả phiếu", value: all.length, cls: "border-gray-200 bg-white text-gray-700" },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {items.map((it) => (
        <button key={it.label} onClick={() => onPick(it.key)} aria-pressed={active === it.key}
          className={`text-left border rounded-xl px-4 py-3 transition-shadow hover:shadow-md ${it.cls} ${active === it.key ? "ring-2 ring-[#1a3670]/40" : ""}`}>
          <div className="text-2xl font-bold">{it.value}</div>
          <div className="text-xs font-medium opacity-80">{it.label}</div>
        </button>
      ))}
    </div>
  )
}

// ============ PHIẾU CỦA TÔI (giáo viên) ============
function MyRecordsPage({ setPage }: { setPage: (p: Page) => void }) {
  const { user, login } = useAuth()
  const [records, setRecords] = useState<BorrowRecord[] | null>(null)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    if (!user) return
    fetchMyRecords().then(setRecords).catch((e) => setError(e.message))
  }, [user])
  useEffect(() => { load() }, [load])

  if (!user) {
    return (
      <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
        <div className="max-w-md mx-auto text-center py-16">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Đăng nhập để xem phiếu của bạn</h2>
          <button onClick={login} className="mt-3 px-6 py-3 rounded-xl bg-[#1a3670] text-white font-semibold text-sm">Đăng nhập bằng Google</button>
        </div>
      </main>
    )
  }

  const cancel = async (r: BorrowRecord) => {
    if (!confirm(`Hủy yêu cầu mượn "${r.equipment}" ngày ${r.borrowDate}?`)) return
    try { await deleteRecord(r.id); load() } catch (e) { alert(e instanceof Error ? e.message : "Lỗi") }
  }

  const list = records || []
  const overdue = list.filter(isOverdue)

  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-[28px] sm:text-3xl font-bold text-[#1F2937] tracking-tight">Phiếu của tôi</h1>
          <p className="text-gray-500 text-sm mt-1">Theo dõi các yêu cầu mượn thiết bị bạn đã gửi.</p>
        </div>
        <MyPointsCard />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>}
        {overdue.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm mb-4">
            Bạn có <strong>{overdue.length}</strong> phiếu đã quá ngày trả. Vui lòng mang thiết bị trả phòng thiết bị sớm.
          </div>
        )}
        {records === null ? (
          <p className="text-sm text-gray-400">Đang tải...</p>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-500">
            <p className="text-sm mb-3">Bạn chưa gửi yêu cầu mượn nào.</p>
            <button onClick={() => setPage("home")} className="text-sm font-semibold text-[#1a3670] hover:underline">Chọn môn học để đăng ký</button>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((r) => {
              const sub = SUBJECTS.find((s) => s.id === r.subjectId)
              return (
                <div key={r.id} className={`bg-white rounded-2xl border p-4 sm:p-5 ${isOverdue(r) ? "border-rose-200" : "border-gray-100"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: sub?.color || "#888" }}>{r.subjectName}</span>
                        <span className="text-xs text-gray-500">Lớp {r.className}</span>
                      </div>
                      <div className="font-semibold text-gray-900">{r.equipment}</div>
                    </div>
                    <StatusBadge r={r} />
                  </div>
                  <div className="mt-2 text-sm text-gray-600 flex flex-wrap gap-x-5 gap-y-1">
                    <span>Mượn: <strong className="font-medium text-gray-800">{r.borrowDate}</strong>{r.period ? ` (${r.period})` : ""}</span>
                    <span>Trả: <strong className="font-medium text-gray-800">{r.returnDate}</strong></span>
                    {r.periodPPCT && <span>PPCT: {r.periodPPCT}</span>}
                  </div>
                  {r.status === "Từ chối" && r.adminNote && <p className="mt-2 text-sm text-red-700">Lý do từ chối: {r.adminNote}</p>}
                  {r.returnReport && (r.returnReport.items.length > 0 || r.returnReport.lateDays > 0) && (
                    <p className="mt-2 text-sm text-rose-700">
                      Biên bản trả ngày {r.returnReport.returnedOn}: {[r.returnReport.lateDays > 0 && `trễ ${r.returnReport.lateDays} ngày`, ...r.returnReport.items.map((x) => [x.damaged && `hỏng ${x.damaged} ${x.name}`, x.lost && `báo mất ${x.lost} ${x.name} (${x.lostStatus || "đã ghi mất"})`].filter(Boolean).join(", "))].filter(Boolean).join("; ")}
                      {r.returnReport.pointsDeducted < 0 && ` · trừ ${-r.returnReport.pointsDeducted} điểm`}
                      {r.returnReport.compensation > 0 && ` · bồi thường ${r.returnReport.compensation.toLocaleString("vi-VN")} đ`}
                    </p>
                  )}
                  {r.status === "Chờ duyệt" && (
                    <div className="mt-3">
                      <button onClick={() => cancel(r)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:border-red-300 hover:text-red-700">Hủy yêu cầu</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <MyProposals subjects={SUBJECTS} />
      </div>
    </main>
  )
}

// ============ MAIN APP ============
const PAGES = new Set<string>(["home", "noiquy", "admin", "mine", ...SUBJECTS.map((s) => s.id)])
function readHash(): Page {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""))
  if (/^admin\/[a-z-]+$/.test(h)) return h // các mục trong trang quản trị
  if (/^thiet-bi\/[\w.-]+$/.test(h)) return h // trang chi tiết thiết bị (mở từ mã QR)
  return PAGES.has(h) ? h : "home"
}

function AppContent() {
  const { loading, user, login, slow, offline } = useAuth()
  // Trang hiện tại lưu trên URL (#vat-li, #admin...) để tải lại trang không bị mất,
  // nút Back của trình duyệt hoạt động và có thể gửi link cho người khác.
  const [page, setPageState] = useState<Page>(readHash)
  useEffect(() => {
    const onHash = () => { setPageState(readHash()); window.scrollTo(0, 0) }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  const setPage = useCallback((p: Page) => {
    if (p === readHash()) { window.scrollTo(0, 0); return }
    window.location.hash = p === "home" ? "" : p
  }, [])
  useEffect(() => {
    const name = page === "home" ? "" : page === "noiquy" ? "Nội quy" : page.startsWith("admin") ? "Quản trị" : page === "mine" ? "Phiếu của tôi" : page.startsWith("thiet-bi/") ? "Thiết bị" : SUBJECTS.find((s) => s.id === page)?.name
    document.title = (name ? `${name} – ` : "") + "Quản lý thiết bị THCS Lê Độ"
  }, [page])
  // Bản nháp từ chatbot chờ được điền vào form (key để điền lại được nhiều lần)
  const [prefill, setPrefill] = useState<{ draft: BorrowDraft; key: number } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fillFormFromChat = useCallback((draft: BorrowDraft) => {
    setPage(draft.subjectId)
    setPrefill({ draft, key: Date.now() })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#1a3670] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Đang tải...</p>
          {slow && <p className="text-sm text-gray-500 mt-3 max-w-xs mx-auto">Máy chủ đang khởi động lại sau thời gian không có người dùng. Lần mở đầu có thể mất đến 1 phút, trang sẽ tự hiện khi sẵn sàng.</p>}
        </div>
      </div>
    )
  }

  const currentSubjectId = SUBJECTS.find((s) => s.id === page)?.id

  return (
    <div className="min-h-screen bg-[#F6F7F9] font-sans lg:pl-64">
      <Sidebar page={page} setPage={setPage} />
      {offline && (
        <div role="alert" className="fixed top-14 lg:top-0 inset-x-0 lg:left-64 z-30 bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <span>Chưa kết nối được máy chủ (có thể đang khởi động hoặc cơ sở dữ liệu đang tạm dừng). Bạn đang xem ở chế độ khách.</span>
          <button onClick={() => window.location.reload()} className="font-semibold underline">Tải lại</button>
        </div>
      )}
      {page === "home" && <HomePage setPage={setPage} onQuick={fillFormFromChat} />}
      {page === "noiquy" && <NoiQuyPage />}
      {page.startsWith("admin") && <AdminPage section={page.split("/")[1]} go={(sec) => setPage(`admin/${sec}`)} />}
      {page === "mine" && <MyRecordsPage setPage={setPage} />}
      {page.startsWith("thiet-bi/") && <EquipmentPage key={page} id={page.slice(9)} isAdmin={!!user?.isAdmin} loggedIn={!!user} login={login} onBorrow={fillFormFromChat} goHome={() => setPage("home")} />}
      {SUBJECTS.some((s) => s.id === page) && (
        <SubjectPage
          key={page}
          subjectId={page}
          setPage={setPage}
          refreshKey={refreshKey}
          prefill={prefill?.draft.subjectId === page ? prefill : null}
          onPrefillUsed={() => setPrefill(null)}
        />
      )}
      <ChatWidget
        subjectId={currentSubjectId}
        onFillForm={fillFormFromChat}
        onRecordCreated={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
