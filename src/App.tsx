import { useState, useEffect, useCallback, useRef } from "react"
import logoImg from "@/imports/Logo.jpg"
import { AuthProvider, useAuth } from "@/AuthContext"
import { InventoryTab, PurchasesTab, PointsTab, ReturnDialog, MyPointsCard } from "./Inventory"
import { AuditTab, MaintenanceTab, ReportsTab, EquipmentPage, Dashboard, DisposalTab, BooksTab, LossTab } from "./Operations"
import { RoomsTab, ProposalsTab, MyProposals } from "./School"
import { MinlistTab } from "./Minlist"
import { ChemicalsTab, PlansTab, DecisionsTab } from "./Planning"
import { LoginPage, PendingPage, PrincipalPage, HeadPage, UsersTab, ChangePassword } from "./Roles"
import { SystemTab, LoginLogTab, CsdlExportTab, EvidenceTab } from "./Ops"
import { PrivacyPage, ConsentGate, ProfilePage, GuestPage, GuestSlipPage, GuestsTab, DataRequestsTab } from "./Privacy"
import { CirculationTab, ReadersTab, ReadingPeriodsTab, StocktakeTab, LibraryStatsTab, OpacPage, MyLibraryLoans, LibraryRulesNotice } from "./Circulation"
import { SUBJECTS, badgeColor } from "./subjects"
import { TeacherHome, BorrowPage, SubjectsPage, InfoPage } from "./Teacher"
import { PointsRulesText } from "./Inventory"
import { ReceiptsTab, BooksTab as LibBooksTab, ShelvesTab, LibraryLedgerTab, BookCopyPage, ShelfPage } from "./Library"
import ChatWidget from "@/ChatWidget"
import {
  fetchRecords,
  fetchMyRecords,
  updateRecordStatus,
  deleteRecord,
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type BorrowRecord,
  type BorrowDraft,
  type RecordStatus,
  type Notification,
  sendRemindersNow,
  fetchAvailable,
} from "@/api"

type Page = "home" | "admin" | "noiquy" | "mine" | string


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
  const groupTitle = (t: string) => <div className="px-3 pt-5 pb-1.5 text-xs font-semibold text-white/70">{t}</div>

  const content = (
    <div className="flex flex-col h-full">
      <button onClick={() => go("home")} className="flex items-center gap-3 px-5 py-5 border-b border-white/10 text-left" aria-label="Trường THCS Lê Độ – Trang chủ">
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
            {ADMIN_MENU.filter((g) => g.items.some((it) => menuAllowed(user, g.group, it.id))).map((g) => (
              <div key={g.group || "chung"}>
                {groupTitle(g.group || "Điều hành")}
                {g.items.filter((it) => menuAllowed(user, g.group, it.id)).map((it) => item(it.id, it.label, adminSection === it.id, () => go(`admin/${it.id}`), undefined,
                  it.id === "thong-bao" && unreadCount > 0 ? <span className="text-[11px] font-bold rounded-full px-1.5 bg-red-500 text-white">{badge}</span> : null))}
              </div>
            ))}
          </>
        ) : (
          <>
            {(user?.isHead || user?.isPrincipal || user?.isSysadmin) && <>
              {groupTitle("Trang của tôi")}
              {user?.isPrincipal && item("bgh", "Ban giám hiệu", page === "bgh", () => go("bgh"), "#F5B841")}
              {user?.isHead && item("to-truong", `Tổ trưởng – ${user.group?.replace(/^Tổ /, "") || "tổ"}`, page === "to-truong", () => go("to-truong"), "#9FD3B5")}
              {user?.isSysadmin && item("qtht", "Quản trị hệ thống", false, () => go("admin/nguoi-dung"), "#C4B5FD")}
            </>}
            {groupTitle(user ? "Thiết bị" : "Tra cứu")}
            {item("home", user ? "Lịch mượn của tôi" : "Trang chủ", page === "home", () => go("home"), "")}
            {user && item("muon", "Đăng ký mượn", page === "muon", () => go("muon"), "#F5B841")}
            {user && item("mine", "Phiếu của tôi", page === "mine", () => go("mine"), "#9FD3B5")}
            {item("mon-hoc", "Thiết bị theo môn", page === "mon-hoc" || SUBJECTS.some((s) => s.id === page), () => go("mon-hoc"), "#93C5FD")}
            {groupTitle("Thư viện")}
            {item("tra-cuu-sach", "Tra cứu sách", page === "tra-cuu-sach", () => go("tra-cuu-sach"), "#7DD3FC")}
            {!user && item("khach", "Đăng ký khách đến trường", page === "khach", () => go("khach"), "#F5B841")}
            {groupTitle("Khác")}
            {item("thong-tin", "Thông tin thêm", page === "thong-tin" || page === "noiquy", () => go("thong-tin"), "#CBD5E1")}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-2">
        {user?.isLibrarian && !user.isEquipment && !inAdmin && (
          <button onClick={() => go("admin/nhan-sach")} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F5B841] text-[#1a2b55] font-semibold text-sm hover:bg-[#f7c463]">Thư viện</button>
        )}
        {(user?.isEquipment || user?.isPrincipal) && !inAdmin && (
          <button onClick={() => go("admin")} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F5B841] text-[#1a2b55] font-semibold text-sm hover:bg-[#f7c463]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            <span className="flex-1 text-left">Quản lý đăng ký</span>
            {unreadCount > 0 && <span className="text-[11px] font-bold rounded-full px-1.5 bg-[#1a2b55] text-white">{badge}</span>}
          </button>
        )}
        {user ? (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            {user.avatar ? <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" /> : <span className="w-8 h-8 rounded-full bg-white/15 text-white text-sm font-bold flex items-center justify-center">{user.name.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</span>}
            <button onClick={() => go("ho-so")} title="Hồ sơ của tôi" className="flex-1 min-w-0 text-left"><span className="block text-sm text-white font-medium truncate">{user.name}</span><span className="block text-xs text-white/70 truncate">{user.isSysadmin ? "Quản trị hệ thống" : user.isPrincipal ? "Ban giám hiệu" : user.isEquipment ? "Nhân viên thiết bị" : user.isLibrarian ? "Nhân viên thư viện" : user.isHead ? "Tổ trưởng" : "Giáo viên"}{user.test ? " · thử nghiệm" : ""} · Hồ sơ</span></button>
            <button onClick={logout} className="text-xs text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10">Đăng xuất</button>
          </div>
        ) : (
          <button onClick={login} className="w-full px-3 py-2.5 rounded-xl bg-white text-[#1a3670] font-semibold text-sm hover:bg-white/90">Đăng nhập</button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <aside aria-label="Menu chính" className="hidden lg:block fixed inset-y-0 left-0 w-64 bg-[#1a3670] z-40">{content}</aside>
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-[#1a3670] text-white flex items-center px-3 gap-2 shadow">
        <button onClick={() => go("home")} className="flex items-center gap-2 flex-1 min-w-0" aria-label="THCS Lê Độ – Trang chủ">
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
/** Nội quy mượn – trả thiết bị: hiển thị trong mục Thông tin thêm */
function NoiQuyContent() {
  return (
    <div className="space-y-6 text-sm text-gray-700 leading-relaxed">

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
  const selectCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3670]/50 focus:border-[#1a3670]"

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
              <select aria-label="Môn học" className={selectCls} value={quick.subjectId} onChange={(e) => setQuick({ ...quick, subjectId: e.target.value })}>{SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="block"><span className="block text-sm font-semibold text-gray-700 mb-1.5">Ngày sử dụng {quickDate && <span className="font-normal text-gray-500">· {dayLabel(quickDate)}</span>}</span>
              <input type="date" className={selectCls} min={user?.isAdmin ? undefined : vnToIso(tomorrowVN())} value={quick.date} onChange={(e) => setQuick({ ...quick, date: e.target.value })} /></label>
            <label className="block"><span className="block text-sm font-semibold text-gray-700 mb-1.5">Tiết học</span>
              <select aria-label="Tiết học" className={selectCls} value={quick.slot} onChange={(e) => setQuick({ ...quick, slot: e.target.value })}>{SLOT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
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
            ) : mine === null ? <p className="text-sm text-gray-500">Đang tải…</p> : upcoming.length === 0 ? (
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
                <div key={l} className={`rounded-xl px-4 py-3.5 ${c}`}><div className="text-3xl font-bold tabular-nums">{v}</div><div className="text-sm mt-0.5">{l}</div></div>
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
                  <span className="text-gray-500" aria-hidden="true">›</span>
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

// ============ TRANG MÔN HỌC ============

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

function SubjectPage({ subjectId, setPage, refreshKey = 0, onBorrow }: {
  onBorrow: (subjectId: string) => void
  subjectId: string
  setPage: (p: Page) => void
  refreshKey?: number
}) {
  const subject = SUBJECTS.find((s) => s.id === subjectId)!
  const [records, setRecords] = useState<BorrowRecord[]>([])
  const [eqCount, setEqCount] = useState<number | null>(null)
  const [shown, setShown] = useState(8)
  const { user } = useAuth()

  const loadData = useCallback(() => { fetchRecords({ subjectId }).then(setRecords).catch(console.error) }, [subjectId])
  useEffect(() => { loadData() }, [loadData, refreshKey])
  useEffect(() => { if (user) fetchAvailable(subjectId, "", "").then((l) => setEqCount(l.length)).catch(() => {}) }, [subjectId, user])

  return (
    <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10">
      <div className="max-w-6xl">
        <PageHeader back={{ label: "Thiết bị theo môn", onClick: () => setPage("mon-hoc") }}
          kicker={<span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subject.color }} />{subject.group}{eqCount !== null ? ` · ${eqCount} loại thiết bị` : ""}</span>}
          title={subject.name}
          right={<button onClick={() => onBorrow(subjectId)} className="px-5 py-3 rounded-xl bg-[#1a3670] hover:bg-[#132d5e] text-white font-semibold text-[15px]">+ Đăng ký mượn</button>} />

        <WeekGrid records={records} />


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
    { id: "hoa-chat", label: "Hóa chất – vật tư tiêu hao", tab: "chemicals" },
    { id: "xac-nhan-mat", label: "Xác nhận mất thiết bị", tab: "loss" },
    { id: "de-xuat", label: "Đề xuất mua sắm", tab: "proposals" },
  ] },
  { group: "Danh mục", items: [{ id: "danh-muc", label: "Danh mục thiết bị", tab: "inventory" }, { id: "phong", label: "Phòng bộ môn", tab: "rooms" }, { id: "toi-thieu", label: "Danh mục tối thiểu (TT 38)", tab: "minlist" }] },
  { group: "Thư viện", items: [
    { id: "muon-tra-sach", label: "Mượn – trả sách", tab: "lib-circ" },
    { id: "ban-doc", label: "Bạn đọc, thẻ thư viện", tab: "lib-readers" },
    { id: "tiet-doc", label: "Tiết đọc thư viện", tab: "lib-periods" },
    { id: "nhan-sach", label: "Nhận sách theo hóa đơn", tab: "lib-receipts" },
    { id: "kho-sach", label: "Kho sách", tab: "lib-books" },
    { id: "ke-sach", label: "Kệ sách, xếp giá", tab: "lib-shelves" },
    { id: "kiem-ke-sach", label: "Kiểm kê – thanh lọc", tab: "lib-stock" },
    { id: "thong-ke-thu-vien", label: "Thống kê thư viện", tab: "lib-stats" },
    { id: "so-thu-vien", label: "Sổ thư viện", tab: "lib-ledger" },
  ] },
  { group: "Kế hoạch", items: [
    { id: "ke-hoach", label: "Kế hoạch năm học", tab: "plans" },
    { id: "quyet-dinh", label: "Quyết định thành lập", tab: "decisions" },
  ] },
  { group: "Giáo viên", items: [{ id: "thi-dua", label: "Điểm thi đua", tab: "points" }] },
  { group: "Báo cáo", items: [
    { id: "bao-cao", label: "Báo cáo tổng hợp", tab: "reports" },
    { id: "so-sach", label: "Sổ sách, biểu mẫu", tab: "books" },
    { id: "minh-chung", label: "Minh chứng kiểm định", tab: "evidence" },
    { id: "du-lieu-nganh", label: "Xuất dữ liệu CSDL ngành", tab: "csdl" },
  ] },
  { group: "Hệ thống", items: [
    { id: "thong-bao", label: "Thông báo", tab: "notifications" },
    { id: "khach-vang-lai", label: "Sổ khách vãng lai", tab: "guests" },
    { id: "nguoi-dung", label: "Người dùng và phân quyền", tab: "users" },
    { id: "du-lieu-ca-nhan", label: "Yêu cầu dữ liệu cá nhân", tab: "datareq" },
    { id: "nhat-ky-dang-nhap", label: "Nhật ký đăng nhập", tab: "loginlog" },
    { id: "he-thong", label: "Sao lưu, trạng thái hệ thống", tab: "system" },
  ] },
]
const ADMIN_ITEMS = ADMIN_MENU.flatMap((g) => g.items)
/** Các mục quản trị chỉ quản trị hệ thống dùng */
const SYSTEM_ITEMS = ["nguoi-dung", "du-lieu-ca-nhan", "nhat-ky-dang-nhap", "he-thong"]
/** Ban giám hiệu: xem và ra quyết định (duyệt mất, mua sắm, thanh lý, kế hoạch, điểm thi đua), xem báo cáo */
const PRINCIPAL_ITEMS = ["tong-quan", "muon-tra", "xac-nhan-mat", "de-xuat", "ghi-giam", "ke-hoach", "thi-dua", "toi-thieu", "thong-ke-thu-vien", "bao-cao", "so-sach", "minh-chung", "thong-bao"]
/**
 * Mỗi người chỉ thấy mục việc của mình (một người có thể nhiều vai trò thì cộng các mục lại):
 *  - Nhân viên thiết bị: toàn bộ nghiệp vụ thiết bị và thư viện (thường kiêm nhiệm), sổ khách
 *  - Nhân viên thư viện: nhóm Thư viện và Sổ khách
 *  - Ban giám hiệu: các mục ra quyết định và báo cáo
 *  - Quản trị hệ thống: người dùng, nhật ký, sao lưu, yêu cầu dữ liệu cá nhân
 */
function menuAllowed(user: ReturnType<typeof useAuth>["user"], group: string, id: string) {
  if (!user) return false
  if (user.isEquipment && !SYSTEM_ITEMS.includes(id)) return true
  if (user.isLibrarian && (group === "Thư viện" || id === "khach-vang-lai")) return true
  if (user.isPrincipal && PRINCIPAL_ITEMS.includes(id)) return true
  if (user.isSysadmin && SYSTEM_ITEMS.includes(id)) return true
  // tài khoản Google cũ chỉ có cờ quản lý, chưa gán vai trò: giữ nguyên quyền cũ
  if (user.isAdmin && (!user.roles || user.roles.length === 0) && !SYSTEM_ITEMS.includes(id)) return true
  return false
}

function AdminPage({ section = "tong-quan", go }: { section?: string; go: (section: string) => void }) {
  const { user } = useAuth()
  const current = ADMIN_ITEMS.find((i) => i.id === section) || ADMIN_ITEMS[0]
  const tab = current.tab
  // Nhân viên thư viện chỉ được vào nhóm Thư viện và Sổ khách: các mục khác chuyển về trang mượn – trả sách
  const currentGroup = ADMIN_MENU.find((g) => g.items.some((i) => i.id === current.id))?.group || ""
  const blocked = !menuAllowed(user, currentGroup, current.id)
  const firstAllowed = ADMIN_MENU.flatMap((g) => g.items.map((it) => ({ g: g.group, id: it.id }))).find((x) => menuAllowed(user, x.g, x.id))?.id
  useEffect(() => { if (blocked && firstAllowed) go(firstAllowed) }, [blocked, firstAllowed, go])
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

  if (blocked) return null
  if (!(user?.isAdmin || user?.isStaff)) {
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
    let specialNote: string | undefined
    const rec = records.find((r) => r.id === id)
    if (newStatus === "Mượn" && rec?.needsSpecialApproval) {
      const n = prompt(`${rec.specialReason}.\nGhi xác nhận đã được Ban giám hiệu đồng ý (bắt buộc):`, "")
      if (!n || !n.trim()) return
      specialNote = n.trim()
    }
    if (newStatus === "Từ chối") {
      const r = prompt("Lý do từ chối (sẽ gửi cho giáo viên, có thể để trống):", "")
      if (r === null) return // bấm Hủy
      reason = r.trim()
    }
    try { await updateRecordStatus(id, newStatus, reason, specialNote); loadData(); loadNotifs() } catch (err) { alert(err instanceof Error ? err.message : "Lỗi") }
  }
  const handleDelete = async (id: string) => {
    if (!confirm("Xác nhận xóa?")) return
    try { await deleteRecord(id); loadData() } catch (err) { alert(err instanceof Error ? err.message : "Lỗi") }
  }

  const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/50 bg-white text-gray-700"

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
        {tab === "minlist" && <MinlistTab subjects={SUBJECTS} />}
        {tab === "chemicals" && <ChemicalsTab go={go} />}
        {tab === "plans" && <PlansTab />}
        {tab === "decisions" && <DecisionsTab />}
        {tab === "guests" && <GuestsTab />}
        {tab === "evidence" && <EvidenceTab go={go} />}
        {tab === "csdl" && <CsdlExportTab subjects={SUBJECTS} />}
        {tab === "loginlog" && (user?.isSysadmin ? <LoginLogTab /> : <p className="text-sm text-gray-500">Chỉ quản trị hệ thống.</p>)}
        {tab === "system" && (user?.isSysadmin ? <SystemTab /> : <p className="text-sm text-gray-500">Chỉ quản trị hệ thống.</p>)}
        {tab === "datareq" && (user?.isSysadmin ? <DataRequestsTab /> : <p className="text-sm text-gray-500">Chỉ quản trị hệ thống.</p>)}
        {tab === "lib-circ" && <CirculationTab />}
        {tab === "lib-readers" && <ReadersTab />}
        {tab === "lib-periods" && <ReadingPeriodsTab />}
        {tab === "lib-stock" && <StocktakeTab />}
        {tab === "lib-stats" && <LibraryStatsTab />}
        {tab === "lib-receipts" && <ReceiptsTab />}
        {tab === "lib-books" && <LibBooksTab />}
        {tab === "lib-shelves" && <ShelvesTab />}
        {tab === "lib-ledger" && <LibraryLedgerTab />}
        {tab === "users" && (user?.isSysadmin ? <UsersTab /> : <p className="text-sm text-gray-500">Chỉ quản trị hệ thống quản lý người dùng.</p>)}
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
              <input type="search" aria-label="Tìm kiếm" placeholder="Tìm giáo viên, lớp, đồ dùng..." className="border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/50 bg-white w-full sm:w-64 placeholder:text-gray-500" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select aria-label="Lọc theo môn" className={selectCls} value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
                <option value="">Tất cả môn</option>
                {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select aria-label="Lọc theo trạng thái" className={selectCls} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="Chờ duyệt">Chờ duyệt</option>
                <option value="Mượn">Đang mượn</option>
                <option value="Trả">Đã trả</option>
                <option value="Từ chối">Từ chối</option>
                <option value="overdue">Quá hạn trả</option>
              </select>
              <span className="text-sm text-gray-500 ml-auto">{loading ? "..." : `${records.length} kết quả`}</span>
            </div>
            {records.length === 0 ? (
              <div className="text-center py-16 text-gray-500"><div className="text-5xl mb-3">📋</div><p className="text-sm">Trống</p></div>
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
                          <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{r.teacherName}{(r.code || r.roomName) && <div className="text-[10px] text-gray-500 font-normal">{[r.code, r.roomName].filter(Boolean).join(" · ")}</div>}{r.needsSpecialApproval && <div className="text-[10px] font-bold text-violet-700" title={r.specialReason}>{r.specialApproval ? "Đã duyệt đặc biệt" : "Cần duyệt đặc biệt"}</div>}</td>
                          <td className="px-3 py-3 text-gray-600">{r.className}</td>
                          <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white whitespace-nowrap" style={{ backgroundColor: badgeColor(sub?.color) }}>{r.subjectName}</span></td>
                          <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{r.period || "-"}</td>
                          <td className="px-3 py-3 text-gray-700 min-w-[180px] max-w-[280px]">
                            <div className="line-clamp-2" title={r.equipment}>{r.equipment}</div>
                            {r.notes && <div className="text-[11px] text-gray-500 truncate" title={r.notes}>Ghi chú: {r.notes}</div>}
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
                              {r.status === "Chờ duyệt" && <button onClick={() => handleStatusChange(r.id, "Mượn")} className={`${btn} bg-green-700 hover:bg-green-800 text-white`}>Duyệt</button>}
                              {r.status === "Chờ duyệt" && <button onClick={() => handleStatusChange(r.id, "Từ chối")} className={`${btn} bg-red-50 hover:bg-red-100 text-red-700`}>Từ chối</button>}
                              {r.status === "Mượn" && <button onClick={() => setReturning(r)} className={`${btn} bg-[#1a3670] hover:bg-[#132d5e] text-white`}>Đã trả</button>}
                              {r.status === "Trả" && <button onClick={() => handleStatusChange(r.id, "Mượn")} className={`${btn} bg-gray-100 hover:bg-gray-200 text-gray-700`}>Hoàn tác</button>}
                              <button onClick={() => handleDelete(r.id)} className={`${btn} text-gray-500 hover:text-red-600 hover:bg-red-50`} aria-label="Xóa phiếu" title="Xóa phiếu">Xóa</button>
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
              <div className="text-center py-16 text-gray-500"><div className="text-5xl mb-3">🔔</div><p className="text-sm">Trống</p></div>
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
                      <p className="text-[10px] text-gray-500 mt-1">{new Date(n.createdAt).toLocaleString("vi-VN")}</p>
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
          <div className="text-xs font-medium">{it.label}</div>
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
          <p className="text-sm text-gray-500">Đang tải...</p>
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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: badgeColor(sub?.color) }}>{r.subjectName}</span>
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
        <MyLibraryLoans />
        {user?.authType === "password" && <ChangePassword />}
      </div>
    </main>
  )
}

// ============ MAIN APP ============
const PAGES = new Set<string>(["home", "noiquy", "admin", "mine", "dang-nhap", "cho-duyet", "bgh", "to-truong", "bao-mat", "ho-so", "khach", "tra-cuu-sach", "muon", "mon-hoc", "thong-tin", ...SUBJECTS.map((s) => s.id)])
function readHash(): Page {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""))
  if (/^admin\/[a-z-]+$/.test(h)) return h // các mục trong trang quản trị
  if (/^thiet-bi\/[\w.-]+$/.test(h)) return h // trang chi tiết thiết bị (mở từ mã QR)
  if (/^(sach|ke)\/[\w.-]+$/i.test(h)) return h // quyển sách, kệ sách (mở từ mã QR)
  if (/^khach\/[\w-]+$/i.test(h)) return h // phiếu khách vãng lai
  return PAGES.has(h) ? h : "home"
}

function AppContent() {
  const { loading, user, login, slow, offline, pending } = useAuth()
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
    const name = page === "home" ? "" : page === "muon" ? "Đăng ký mượn" : page === "thong-tin" || page === "noiquy" ? "Thông tin thêm" : page.startsWith("admin") ? "Quản trị" : page === "mine" ? "Phiếu của tôi" : page.startsWith("thiet-bi/") ? "Thiết bị" : SUBJECTS.find((s) => s.id === page)?.name
    document.title = (name ? `${name} – ` : "") + "Quản lý thiết bị THCS Lê Độ"
  }, [page])
  const [refreshKey, setRefreshKey] = useState(0)
  // Mở phiếu đăng ký mượn: theo ngày chọn, nhân bản phiếu cũ, hoặc theo môn
  const [borrowPreset, setBorrowPreset] = useState<{ date?: string; clone?: BorrowRecord; subjectId?: string; draft?: BorrowDraft; key?: number } | null>(null)
  const openBorrow = useCallback((o: { date?: string; clone?: BorrowRecord; subjectId?: string; draft?: BorrowDraft }) => { setBorrowPreset({ ...o, key: Date.now() }); setPage("muon") }, [setPage])

  // Trợ lý AI, đăng ký nhanh, trang thiết bị: đều mở chung một phiếu đăng ký
  const fillFormFromChat = useCallback((draft: BorrowDraft) => { setBorrowPreset({ draft, key: Date.now() }); setPage("muon") }, [setPage])

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
      {pending && !user ? <PendingPage /> : <>
      {page === "dang-nhap" && <LoginPage go={setPage} />}
      {page === "bao-mat" && <PrivacyPage />}
      {page === "tra-cuu-sach" && <OpacPage />}
      {page === "ho-so" && <ProfilePage go={setPage} />}
      {page === "khach" && <GuestPage />}
      {/^khach\//i.test(page) && <GuestSlipPage key={page} code={page.slice(6).toUpperCase()} />}
      {page === "cho-duyet" && <PendingPage />}
      {page === "bgh" && (user?.isPrincipal ? <PrincipalPage go={setPage} /> : <main className="pt-24 px-6 text-sm text-gray-500">Trang dành cho Ban giám hiệu.</main>)}
      {page === "to-truong" && (user?.isHead ? <HeadPage WeekGrid={WeekGrid} /> : <main className="pt-24 px-6 text-sm text-gray-500">Trang dành cho tổ trưởng chuyên môn.</main>)}
      {page === "home" && (user ? <TeacherHome go={setPage} onBorrow={openBorrow} /> : <HomePage setPage={setPage} onQuick={fillFormFromChat} />)}
      {page === "muon" && <BorrowPage key={borrowPreset?.key || 0} go={setPage} preset={borrowPreset} onDone={() => { setBorrowPreset(null); setPage("home") }} />}
      {page === "mon-hoc" && <SubjectsPage go={setPage} />}
      {(page === "thong-tin" || page === "noiquy") && <InfoPage go={setPage} equipmentRules={<NoiQuyContent />} libraryRules={<LibraryRulesNotice />} pointsRules={user ? <PointsRulesText /> : undefined} isLibrarian={!!(user?.isLibrarian || user?.isSysadmin)} />}
      {page.startsWith("admin") && <AdminPage section={page.split("/")[1]} go={(sec) => setPage(`admin/${sec}`)} />}
      {page === "mine" && <MyRecordsPage setPage={setPage} />}
      {/^sach\//i.test(page) && <BookCopyPage key={page} code={page.slice(5).toUpperCase()} />}
      {/^ke\//i.test(page) && <ShelfPage key={page} code={page.slice(3).toUpperCase()} />}
      {page.startsWith("thiet-bi/") && <EquipmentPage key={page} id={page.slice(9)} isAdmin={!!user?.isAdmin} loggedIn={!!user} login={login} onBorrow={fillFormFromChat} goHome={() => setPage("home")} />}
      {SUBJECTS.some((s) => s.id === page) && (
        <SubjectPage
          key={page}
          subjectId={page}
          setPage={setPage}
          refreshKey={refreshKey}
          onBorrow={(sid) => openBorrow({ subjectId: sid })}
        />
      )}
      </>}
      <ConsentGate />
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
