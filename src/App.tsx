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
  { id: "hoa-hoc", name: "Hóa học", color: "#059669", img: "https://images.unsplash.com/photo-1614308460927-5024ba2e1dcb?w=600&h=400&fit=crop&auto=format", desc: "Thiết bị thí nghiệm, dụng cụ phòng lab hóa học" },
  { id: "vat-li", name: "Vật lí", color: "#2563eb", img: "https://images.unsplash.com/photo-1763098844157-d0fffcc966a1?w=600&h=400&fit=crop&auto=format", desc: "Dụng cụ thí nghiệm, mô hình vật lí" },
  { id: "sinh-hoc", name: "Sinh học", color: "#16a34a", img: "https://images.unsplash.com/photo-1614308459036-779d0dfe51ff?w=600&h=400&fit=crop&auto=format", desc: "Kính hiển vi, tiêu bản sinh học, mô hình" },
  { id: "cong-nghe", name: "Công nghệ", color: "#7c3aed", img: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&h=400&fit=crop&auto=format", desc: "Thiết bị công nghệ, máy tính, công cụ kỹ thuật" },
  { id: "toan-hoc", name: "Toán học", color: "#dc2626", img: "https://images.unsplash.com/photo-1635372722656-389f87a941b7?w=600&h=400&fit=crop&auto=format", desc: "Bộ đồ dùng hình học, thước, compa, mô hình" },
  { id: "lich-su-dia-li", name: "Lịch Sử - Địa lí", color: "#d97706", img: "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=600&h=400&fit=crop&auto=format", desc: "Bản đồ, quả địa cầu, tranh ảnh lịch sử" },
  { id: "gdtc", name: "GDTC", color: "#0891b2", img: "https://images.unsplash.com/photo-1559369064-c4d65141e408?w=600&h=400&fit=crop&auto=format", desc: "Dụng cụ thể dục thể thao, bóng, lưới" },
  { id: "ngu-van-gdcd", name: "Ngữ văn - GDCD", color: "#be185d", img: "https://images.unsplash.com/photo-1604866830893-c13cafa515d5?w=600&h=400&fit=crop&auto=format", desc: "Sách tham khảo, tranh ảnh minh họa, đồ dùng" },
  { id: "tieng-anh", name: "Tiếng Anh", color: "#0e7490", img: "https://images.unsplash.com/photo-1543109740-4bdb38fda756?w=600&h=400&fit=crop&auto=format", desc: "Sách giáo khoa, thiết bị nghe nhìn, flash cards" },
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
function Nav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const { user, login, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const dropRef = useRef<HTMLDivElement>(null)
  const isSubjectPage = SUBJECTS.some((s) => s.id === page)

  useEffect(() => {
    if (!user?.isAdmin) return
    const refresh = () => {
      // Không gọi API khi tab đang ẩn
      if (document.visibilityState === "visible") fetchUnreadCount().then(setUnreadCount).catch(() => {})
    }
    refresh()
    const interval = setInterval(refresh, 30000)
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("notifs-changed", refresh)
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("notifs-changed", refresh) }
  }, [user?.isAdmin])

  // Đổi trang (kể cả bằng nút Back) thì đóng các menu đang mở
  useEffect(() => { setMenuOpen(false); setSubjectsOpen(false) }, [page])

  // Đóng menu môn học khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!subjectsOpen) return
    const onDown = (e: MouseEvent) => { if (!dropRef.current?.contains(e.target as Node)) setSubjectsOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSubjectsOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
  }, [subjectsOpen])

  const go = (p: Page) => { setPage(p); setMenuOpen(false); setSubjectsOpen(false) }
  const badge = unreadCount > 9 ? "9+" : String(unreadCount)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#1a3670] text-white shadow-xl">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center h-16 gap-2">
        <button onClick={() => go("home")} className="flex items-center gap-3 flex-shrink-0 hover:opacity-90 transition-opacity" aria-label="Trang chủ">
          <img src={logoImg} alt="Logo" className="h-10 w-10 rounded-full object-cover border-2 border-white/40 shadow" />
          <div className="hidden sm:block leading-tight text-left whitespace-nowrap">
            <div className="text-[10px] font-medium text-white/60 uppercase tracking-wider">Trường THCS</div>
            <div className="text-sm font-bold tracking-wide">Lê Độ</div>
          </div>
        </button>

        <nav className="hidden lg:flex items-center gap-1 flex-1 ml-4 min-w-0" aria-label="Điều hướng chính">
          <NavBtn label="Trang chủ" active={page === "home"} onClick={() => go("home")} />
          <NavBtn label="Nội quy" active={page === "noiquy"} onClick={() => go("noiquy")} />
          <div className="relative" ref={dropRef}>
            <button onClick={() => setSubjectsOpen(!subjectsOpen)} aria-expanded={subjectsOpen} aria-haspopup="true"
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isSubjectPage || subjectsOpen ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
              {isSubjectPage ? SUBJECTS.find((s) => s.id === page)!.name : "Môn học"}
              <svg className={`w-3.5 h-3.5 transition-transform ${subjectsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {subjectsOpen && (
              <div className="absolute left-0 top-full mt-2 w-[22rem] bg-white text-gray-800 rounded-xl shadow-2xl border border-gray-100 p-2 grid grid-cols-2 gap-1">
                {SUBJECTS.map((s) => (
                  <button key={s.id} onClick={() => go(s.id)} className={`flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm ${page === s.id ? "bg-gray-100 font-semibold" : "hover:bg-gray-50"}`}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {user && <NavBtn label="Phiếu của tôi" active={page === "mine"} onClick={() => go("mine")} />}
        </nav>

        <div className="flex-1 lg:hidden" />

        {user?.isAdmin && (
          <button onClick={() => go("admin")} className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-white/30 transition-colors relative whitespace-nowrap flex-shrink-0 ${page.startsWith("admin") ? "bg-white text-[#1a3670]" : "hover:bg-white/10"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Quản trị
            {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center">{badge}</span>}
          </button>
        )}

        {user ? (
          <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10" title={user.email}>
              {user.avatar && <img src={user.avatar} alt="" className="w-6 h-6 rounded-full" />}
              <span className="text-xs font-medium max-w-[130px] truncate">{user.name}</span>
            </div>
            <button onClick={logout} className="px-2.5 py-1.5 rounded-lg text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">Đăng xuất</button>
          </div>
        ) : (
          <button onClick={login} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0">
            Đăng nhập
          </button>
        )}

        <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors relative" aria-label="Menu" aria-expanded={menuOpen}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          {user?.isAdmin && unreadCount > 0 && <span className="sm:hidden absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />}
        </button>
      </div>

      {menuOpen && (
        <div className="lg:hidden bg-[#132d5e] border-t border-white/10 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="max-w-screen-xl mx-auto px-4 py-3 grid grid-cols-2 gap-1">
            {user && (
              <div className="col-span-2 flex items-center justify-between gap-2 px-3 py-2 mb-1 rounded-lg bg-white/10">
                <span className="text-sm font-medium truncate">{user.name}</span>
                <button onClick={() => { setMenuOpen(false); logout() }} className="text-xs text-white/80 hover:text-white whitespace-nowrap">Đăng xuất</button>
              </div>
            )}
            <MenuItem label="Trang chủ" active={page === "home"} onClick={() => go("home")} wide />
            <MenuItem label="Nội quy" active={page === "noiquy"} onClick={() => go("noiquy")} wide />
            {user && <MenuItem label="Phiếu của tôi" active={page === "mine"} onClick={() => go("mine")} wide />}
            {user?.isAdmin && <MenuItem label={unreadCount > 0 ? `Quản trị (${badge} thông báo mới)` : "Quản trị"} active={page.startsWith("admin")} onClick={() => go("admin")} wide />}
            <div className="col-span-2 px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-white/50">Môn học</div>
            {SUBJECTS.map((s) => <MenuItem key={s.id} label={s.name} active={page === s.id} onClick={() => go(s.id)} />)}
          </div>
        </div>
      )}
    </header>
  )
}

function NavBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} aria-current={active ? "page" : undefined} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>{label}</button>
}

function MenuItem({ label, active, onClick, wide }: { label: string; active: boolean; onClick: () => void; wide?: boolean }) {
  return <button onClick={onClick} className={`text-left px-3 py-2.5 rounded-lg text-sm ${wide ? "col-span-2 font-medium" : ""} ${active ? "bg-white/20" : "hover:bg-white/10"}`}>{label}</button>
}

// ============ NỘI QUY PAGE ============
function NoiQuyPage() {
  return (
    <main className="pt-24 pb-20 px-4">
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
function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  const [records, setRecords] = useState<BorrowRecord[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, borrowing: 0, returned: 0, pending: 0 })
  const [shown, setShown] = useState(10) // hiển thị dần, tránh bảng quá dài

  useEffect(() => {
    fetchRecords().then(setRecords).catch(console.error)
    fetchStats().then(setStats).catch(console.error)
  }, [])

  return (
    <main className="pt-24 pb-20 px-4">
      <div className="max-w-screen-xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-[#1a3670]/8 text-[#1a3670] rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-5">
            <img src={logoImg} alt="" className="h-5 w-5 rounded-full object-cover" />
            Trường THCS Lê Độ
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a3670] mb-4 tracking-tight">
            Quản Lý Thiết Bị<br /><span className="text-[#1a3670]/50 font-light">Dạy Học</span>
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">
            Hệ thống đăng ký mượn và trả thiết bị, đồ dùng dạy học theo từng môn học.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10">
          {[
            { label: "Tổng đăng ký", value: stats.total, icon: "📋", color: "bg-slate-50 border-slate-200 text-slate-700" },
            { label: "Chờ duyệt", value: stats.pending, icon: "⏳", color: "bg-amber-50 border-amber-200 text-amber-700" },
            { label: "Đang mượn", value: stats.borrowing, icon: "🔵", color: "bg-blue-50 border-blue-200 text-blue-700" },
            { label: "Đã trả", value: stats.returned, icon: "✅", color: "bg-green-50 border-green-200 text-green-700" },
          ].map((stat) => (
            <div key={stat.label} className={`border rounded-2xl px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3 sm:gap-4 ${stat.color}`}>
              <span className="text-2xl sm:text-3xl">{stat.icon}</span>
              <div><div className="text-2xl font-bold">{stat.value}</div><div className="text-sm opacity-75">{stat.label}</div></div>
            </div>
          ))}
        </div>

        {/* Danh sách đăng ký - PUBLIC cho mọi người xem */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-12">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Danh sách đăng ký mượn/trả</h2>
              <p className="text-xs text-gray-500 mt-0.5">Công khai cho mọi người xem, mới nhất ở trên</p>
            </div>
            <span className="text-sm text-gray-400 whitespace-nowrap">{records.length} bản ghi</span>
          </div>

          {records.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">📋</div>
              <p className="text-sm">Chưa có đăng ký nào</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Giáo viên", "Lớp", "Môn học", "Tiết", "Đồ dùng mượn", "Ngày mượn", "Ngày trả", "Trạng thái"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.slice(0, shown).map((r) => {
                    const sub = SUBJECTS.find((s) => s.id === r.subjectId)
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{r.teacherName}</td>
                        <td className="px-4 py-3 text-gray-600">{r.className}</td>
                        <td className="px-4 py-3"><span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: sub?.color || "#888" }}>{r.subjectName}</span></td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.period || "-"}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate" title={r.equipment}>{r.equipment}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.borrowDate}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.returnDate}</td>
                        <td className="px-4 py-3"><StatusBadge r={r} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {records.length > shown && (
                <div className="px-6 py-3 border-t border-gray-100 text-center">
                  <button onClick={() => setShown(shown + 20)} className="text-sm font-semibold text-[#1a3670] hover:underline">
                    Xem thêm ({records.length - shown} phiếu)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Subject cards */}
        <h2 className="text-xl font-bold text-[#1a3670] mb-5">Danh mục môn học</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SUBJECTS.map((s) => {
            const subjectBorrows = records.filter((r) => r.subjectId === s.id && r.status === "Mượn").length
            return (
              <button key={s.id} onClick={() => setPage(s.id)} className="group relative rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1.5 text-left bg-gray-200" style={{ aspectRatio: "4/3" }}>
                <img src={s.img} alt={s.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 opacity-60 group-hover:opacity-70 transition-opacity" style={{ background: `linear-gradient(to top, ${s.color}ee 0%, ${s.color}44 50%, transparent 100%)` }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                {subjectBorrows > 0 && <div className="absolute top-4 right-4"><span className="bg-white/90 text-gray-800 text-xs font-bold px-2.5 py-1 rounded-full shadow">{subjectBorrows} đang mượn</span></div>}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <h2 className="text-white text-xl font-bold drop-shadow-md">{s.name}</h2>
                  <p className="text-white/75 text-xs mt-1.5 line-clamp-2">{s.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
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
    setSlots(d.period ? [`S${d.period.replace(/\D/g, "")}`] : [])
    setOtherEquip(d.items?.length ? "" : d.equipment || "")
    setFromChat(true)
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
      setSlots([]); setLessonName(""); setRoomId("")
      setFromChat(false)
      onCreated?.()
      setTimeout(() => { setSubmitted(false); setForm(blankForm()) }, 3500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setLoading(false)
    }
  }

  const fieldCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/25 focus:border-[#1a3670] bg-white transition-all placeholder:text-gray-400"
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

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 scroll-mt-24">
      {fromChat && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-start justify-between gap-3">
          <span>
            Thông tin đã được điền sẵn từ Trợ lý thiết bị. Kiểm tra lại, sửa nếu cần rồi bấm "Gửi yêu cầu mượn".
          </span>
          <button type="button" onClick={() => { setFromChat(false); setPicked([]); setOtherEquip(""); setForm(blankForm()) }} className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline">
            Xóa
          </button>
        </div>
      )}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
        {user.avatar && <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />}
        <div><span className="font-semibold text-blue-800">{user.name}</span><span className="text-blue-600 ml-1 text-xs">đang gửi yêu cầu</span></div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className={labelCls}>Họ và tên giáo viên <span className="text-red-500">*</span></label><input required className={fieldCls} placeholder="Nguyễn Văn A" value={form.teacherName} onChange={(e) => setForm({ ...form, teacherName: e.target.value })} /></div>
        <div><label className={labelCls}>Lớp dạy học <span className="text-red-500">*</span></label><input required className={fieldCls} placeholder="8A1" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="borrowDate">Ngày mượn đồ dùng <span className="text-red-500">*</span></label>
          <input id="borrowDate" type="date" required className={fieldCls} min={user.isAdmin ? undefined : vnToIso(tomorrowVN())} value={form.borrowDate}
            onChange={(e) => {
              const v = e.target.value // YYYY-MM-DD (có thể đang gõ dở)
              // Ngày trả mặc định = ngày mượn; nếu ngày trả đang sớm hơn ngày mượn thì kéo theo (chỉ khi năm đã đủ 4 số)
              const complete = /^[1-9]\d{3}-\d{2}-\d{2}$/.test(v)
              const follow = complete && (!form.returnDate || form.returnDate < v)
              setForm({ ...form, borrowDate: v, returnDate: follow ? v : form.returnDate })
            }} />
        </div>
        <div>
          <label className={labelCls} htmlFor="returnDate">Ngày trả đồ dùng <span className="text-red-500">*</span></label>
          <input id="returnDate" type="date" required className={fieldCls} min={form.borrowDate || undefined} value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
        </div>
      </div>
      <p className="-mt-3 text-xs text-gray-500">Theo nội quy, cần đăng ký trước giờ dạy ít nhất 24 giờ.</p>
      <div>
        <span className={labelCls}>Tiết sử dụng thiết bị <span className="text-red-500">*</span> <span className="font-normal text-gray-500 text-xs">(chọn một hoặc nhiều tiết)</span></span>
        <div className="space-y-2">
          {([["S", "Sáng"], ["C", "Chiều"]] as const).map(([k, name]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-12 text-xs font-semibold text-gray-500">{name}</span>
              <div className="grid grid-cols-5 gap-1.5 flex-1">
                {[1, 2, 3, 4, 5].map((n) => {
                  const code = `${k}${n}`, on = slots.includes(code)
                  return (
                    <button type="button" key={code} aria-pressed={on} onClick={() => setSlots((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]))}
                      className={`py-2 rounded-lg border-2 text-sm font-medium transition-all ${on ? "bg-[#1a3670] border-[#1a3670] text-white" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      Tiết {n}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {form.borrowDate && form.returnDate && form.borrowDate !== form.returnDate && <p className="text-xs text-amber-700 mt-1">Mượn nhiều ngày: thiết bị được giữ cả ngày trong suốt thời gian mượn.</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className={labelCls} htmlFor="lessonName">Tên bài dạy</label><input id="lessonName" className={fieldCls} placeholder="VD: Bài 8 – Áp suất chất lỏng" value={lessonName} onChange={(e) => setLessonName(e.target.value)} /></div>
        <div>
          <span className={labelCls}>Loại tiết</span>
          <div className="flex gap-2">
            {["Biểu diễn", "Thực hành"].map((t) => (
              <button type="button" key={t} aria-pressed={usageType === t} onClick={() => setUsageType(t)} className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium ${usageType === t ? "bg-[#1a3670] border-[#1a3670] text-white" : "bg-white border-gray-200 text-gray-600"}`}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      {rooms.length > 0 && (
        <div>
          <label className={labelCls} htmlFor="roomId">Phòng bộ môn (nếu cần)</label>
          <select id="roomId" className={fieldCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Không mượn phòng (dạy tại lớp)</option>
            {rooms.map((r) => <option key={r.id} value={r.id} disabled={r.busy}>{r.name}{r.busy ? ` – đang bận: ${r.busyBy}` : ""}</option>)}
          </select>
        </div>
      )}
      <div><label className={labelCls}>Tiết theo PPCT <span className="text-red-500">*</span></label><input required className={fieldCls} placeholder="VD: Tiết 25 - Bài 12" value={form.periodPPCT} onChange={(e) => setForm({ ...form, periodPPCT: e.target.value })} /></div>
      <div>
        <div className="flex items-end justify-between gap-3 mb-1.5">
          <span className={labelCls + " mb-0"}>Đồ dùng cần mượn <span className="text-red-500">*</span></span>
          <span className="text-xs text-gray-500">{form.borrowDate ? "Số còn trống tính theo ngày đã chọn" : "Chọn ngày mượn để xem số còn trống chính xác"}</span>
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {available && available.length > 8 && (
            <div className="p-2 border-b border-gray-100 bg-gray-50"><input type="search" aria-label="Tìm thiết bị" className={fieldCls} placeholder="Tìm thiết bị…" value={eqQuery} onChange={(e) => setEqQuery(e.target.value)} /></div>
          )}
          <ul className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {available === null && <li className="px-4 py-3 text-sm text-gray-400">Đang tải danh mục…</li>}
            {available?.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Môn này chưa có thiết bị trong danh mục. Ghi đồ dùng ở ô bên dưới.</li>}
            {available?.filter((a) => !eqQuery || a.name.toLowerCase().includes(eqQuery.toLowerCase())).map((a) => {
              const qty = picked.find((p) => p.equipmentId === a.id)?.quantity || 0
              const setQty = (n: number) => setPicked((prev) => (n <= 0 ? prev.filter((p) => p.equipmentId !== a.id) : prev.some((p) => p.equipmentId === a.id) ? prev.map((p) => (p.equipmentId === a.id ? { ...p, quantity: n } : p)) : [...prev, { equipmentId: a.id, quantity: n }]))
              return (
                <li key={a.id} className={`px-4 py-2.5 flex items-center gap-3 ${qty ? "bg-blue-50/60" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{a.name}</div>
                    <div className="text-[11px] text-gray-500">{a.grades.length ? `Lớp ${a.grades.join(", ")} · ` : ""}{a.location}</div>
                  </div>
                  <span className={`text-xs font-semibold whitespace-nowrap ${a.available === 0 ? "text-rose-600" : "text-green-700"}`}>{a.available === 0 ? "Hết" : `Còn ${a.available}${a.unit ? " " + a.unit.toLowerCase() : ""}`}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Bớt ${a.name}`} disabled={!qty} onClick={() => setQty(qty - 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 font-bold">−</button>
                    <span className="w-6 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
                    <button type="button" aria-label={`Thêm ${a.name}`} disabled={qty >= a.available} onClick={() => setQty(qty + 1)} className="w-7 h-7 rounded-lg bg-[#1a3670] text-white hover:bg-[#132d5e] disabled:opacity-30 font-bold">+</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        {picked.length > 0 && <p className="text-xs text-[#1a3670] mt-1.5">Đã chọn: {picked.map((p) => `${available?.find((a) => a.id === p.equipmentId)?.name || p.equipmentId} ×${p.quantity}`).join(", ")}</p>}
        <input className={fieldCls + " mt-2"} placeholder="Đồ dùng khác không có trong danh sách (nếu có)…" value={otherEquip} onChange={(e) => setOtherEquip(e.target.value)} />
      </div>
      <div><label className={labelCls}>Ghi chú</label><textarea rows={2} className={fieldCls} placeholder="Ghi chú thêm nếu có..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
        <strong>Lưu ý:</strong> Yêu cầu mượn sẽ được gửi đến admin để duyệt. Bạn sẽ nhận email khi yêu cầu được duyệt hoặc từ chối, và có thể theo dõi tại mục “Phiếu của tôi”.
      </div>

      <button type="submit" disabled={loading} className="w-full bg-[#1a3670] hover:bg-[#132d5e] active:scale-[.99] text-white font-bold py-3.5 rounded-xl transition-all text-sm shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
        {loading ? "Đang gửi..." : "Gửi yêu cầu mượn"}
      </button>
    </form>
  )
}

// ============ SUBJECT PAGE ============
type Prefill = { draft: BorrowDraft; key: number } | null

function SubjectPage({ subjectId, setPage, refreshKey = 0, prefill = null, onPrefillUsed }: {
  subjectId: string
  setPage: (p: Page) => void
  refreshKey?: number
  prefill?: Prefill
  onPrefillUsed?: () => void
}) {
  const subject = SUBJECTS.find((s) => s.id === subjectId)!
  const [stats, setStats] = useState<Stats>({ total: 0, borrowing: 0, returned: 0, pending: 0 })
  const [records, setRecords] = useState<BorrowRecord[]>([])

  const loadData = useCallback(() => {
    fetchSubjectStats(subjectId).then(setStats).catch(console.error)
    fetchRecords({ subjectId }).then(setRecords).catch(console.error)
  }, [subjectId])

  useEffect(() => { loadData() }, [loadData, refreshKey])

  return (
    <main className="pt-16 pb-20">
      <div className="relative h-48 sm:h-60 overflow-hidden bg-gray-300">
        <img src={subject.img} alt={subject.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${subject.color}cc 0%, ${subject.color}44 60%, transparent 100%)` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="px-6 sm:px-8 pb-6 max-w-screen-xl mx-auto w-full">
            <button onClick={() => setPage("home")} className="flex items-center gap-1 text-white/70 hover:text-white text-xs mb-2 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Trang chủ
            </button>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-md">{subject.name}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Form đăng ký - chỉ admin */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100" style={{ borderTopColor: subject.color, borderTopWidth: 3 }}>
                <h2 className="text-base font-bold text-gray-900">Đăng ký mượn - trả đồ dùng</h2>
                <p className="text-xs text-gray-500 mt-0.5">{subject.name} - Trường THCS Lê Độ</p>
              </div>
              <div className="p-6">
                <BorrowForm subjectId={subjectId} subjectName={subject.name} onCreated={loadData} prefill={prefill} onPrefillUsed={onPrefillUsed} />
              </div>
            </div>

            {/* Danh sách đăng ký môn này - PUBLIC */}
            {records.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-base font-bold text-gray-900">Lịch sử mượn/trả - {subject.name}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {["Giáo viên", "Lớp", "Tiết", "Đồ dùng", "Ngày mượn", "Ngày trả", "Trạng thái"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {records.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{r.teacherName}</td>
                          <td className="px-4 py-2.5 text-gray-600">{r.className}</td>
                          <td className="px-4 py-2.5 text-gray-600">{r.period || "-"}</td>
                          <td className="px-4 py-2.5 text-gray-700">{r.equipment}</td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.borrowDate}</td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.returnDate}</td>
                          <td className="px-4 py-2.5"><StatusBadge r={r} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-4">Thống kê</h3>
              <div className="space-y-3">
                {[
                  { label: "Tổng đăng ký", value: stats.total, color: "text-gray-700" },
                  { label: "Đang mượn", value: stats.borrowing, color: "text-blue-600" },
                  { label: "Đã trả", value: stats.returned, color: "text-green-600" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-500">{stat.label}</span>
                    <span className={`text-lg font-bold ${stat.color}`}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Mô tả</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{subject.desc}</p>
            </div>
          </div>
        </div>
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
      <main className="pt-24 pb-20 px-4">
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
    <main className="pt-24 pb-20 px-4">
      <div className="max-w-[1500px] mx-auto">
        <div className="flex gap-6">
        <aside className="hidden lg:block w-60 shrink-0 self-start sticky top-24">
          <nav aria-label="Menu quản trị" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            <div className="px-3 pt-1 pb-3 border-b border-gray-100 mb-2">
              <div className="text-xs text-gray-500">Phân hệ</div>
              <div className="font-bold text-[#1a3670] leading-tight">Quản lý thiết bị dạy học</div>
            </div>
            {ADMIN_MENU.map((g) => (
              <div key={g.group || "home"} className="mb-1">
                {g.group && <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{g.group}</div>}
                {g.items.map((it) => (
                  <button key={it.id} onClick={() => go(it.id)} aria-current={section === it.id ? "page" : undefined}
                    className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm ${current.id === it.id ? "bg-[#1a3670] text-white font-semibold" : "text-gray-700 hover:bg-gray-100"}`}>
                    {it.label}
                    {it.id === "thong-bao" && unreadCount > 0 && <span className={`text-[10px] font-bold rounded-full px-1.5 ${current.id === it.id ? "bg-white text-[#1a3670]" : "bg-red-500 text-white"}`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <section className="flex-1 min-w-0">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">Quản trị <span className="mx-1">›</span> {ADMIN_MENU.find((g) => g.items.includes(current))?.group || "Tổng quan"}</div>
            <h1 className="text-2xl font-extrabold text-[#1a3670]">{current.label}</h1>
          </div>
          <select aria-label="Chọn chức năng" className="lg:hidden border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={current.id} onChange={(e) => go(e.target.value)}>
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
      <main className="pt-24 pb-20 px-4">
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
    <main className="pt-24 pb-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-[#1a3670]">Phiếu của tôi</h1>
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
  const { loading, user, login } = useAuth()
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
        </div>
      </div>
    )
  }

  const currentSubjectId = SUBJECTS.find((s) => s.id === page)?.id

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Nav page={page} setPage={setPage} />
      {page === "home" && <HomePage setPage={setPage} />}
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
