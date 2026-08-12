import { useState, useEffect, useCallback } from "react"
import logoImg from "@/imports/Logo.jpg"
import { AuthProvider, useAuth } from "@/AuthContext"
import {
  fetchRecords,
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
  type Stats,
  type Notification,
} from "@/api"

type Page = "home" | "admin" | "noiquy" | string

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

// ============ NAV ============
function Nav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const { user, login, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (user?.isAdmin) {
      fetchUnreadCount().then(setUnreadCount).catch(() => {})
      const interval = setInterval(() => fetchUnreadCount().then(setUnreadCount).catch(() => {}), 30000)
      return () => clearInterval(interval)
    }
  }, [user])

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#1a3670] text-white shadow-xl">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center h-16 gap-3">
        <button onClick={() => setPage("home")} className="flex items-center gap-3 flex-shrink-0 hover:opacity-90 transition-opacity">
          <img src={logoImg} alt="Logo" className="h-10 w-10 rounded-full object-cover border-2 border-white/40 shadow" />
          <div className="hidden sm:block leading-tight">
            <div className="text-[10px] font-medium text-white/60 uppercase tracking-wider">Trường THCS</div>
            <div className="text-sm font-bold tracking-wide">Lê Độ</div>
          </div>
        </button>

        <div className="hidden xl:flex items-center gap-0.5 flex-1 ml-4">
          <NavBtn label="Trang chủ" active={page === "home"} onClick={() => setPage("home")} />
          <NavBtn label="Nội quy" active={page === "noiquy"} onClick={() => setPage("noiquy")} />
          {SUBJECTS.map((s) => <NavBtn key={s.id} label={s.name} active={page === s.id} onClick={() => setPage(s.id)} />)}
        </div>

        <div className="flex-1 xl:hidden" />

        {user?.isAdmin && (
          <button onClick={() => setPage("admin")} className={`hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-white/30 transition-colors relative ${page === "admin" ? "bg-white/20 border-white/50" : "hover:bg-white/10"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Quản trị
            {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
        )}

        {user ? (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10">
              {user.avatar && <img src={user.avatar} alt="" className="w-6 h-6 rounded-full" />}
              <span className="text-xs font-medium max-w-[120px] truncate">{user.name}</span>
            </div>
            <button onClick={logout} className="px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors">Đăng xuất</button>
          </div>
        ) : (
          <button onClick={login} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Đăng nhập
          </button>
        )}

        <button onClick={() => setMenuOpen(!menuOpen)} className="xl:hidden p-2 hover:bg-white/10 rounded-lg transition-colors" aria-label="Menu">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
        </button>
      </div>

      {menuOpen && (
        <div className="xl:hidden bg-[#132d5e] border-t border-white/10">
          <div className="max-w-screen-xl mx-auto px-4 py-3 grid grid-cols-2 gap-1">
            <button onClick={() => { setPage("home"); setMenuOpen(false) }} className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium col-span-2 ${page === "home" ? "bg-white/20" : "hover:bg-white/10"}`}>Trang chủ</button>
            <button onClick={() => { setPage("noiquy"); setMenuOpen(false) }} className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium col-span-2 ${page === "noiquy" ? "bg-white/20" : "hover:bg-white/10"}`}>Nội quy mượn thiết bị</button>
            {SUBJECTS.map((s) => <button key={s.id} onClick={() => { setPage(s.id); setMenuOpen(false) }} className={`text-left px-3 py-2.5 rounded-lg text-sm ${page === s.id ? "bg-white/20" : "hover:bg-white/10"}`}>{s.name}</button>)}
            {user?.isAdmin && <button onClick={() => { setPage("admin"); setMenuOpen(false) }} className="text-left px-3 py-2.5 rounded-lg text-sm font-medium col-span-2 border-t border-white/10 mt-1 pt-3 hover:bg-white/10">Quản trị</button>}
          </div>
        </div>
      )}
    </header>
  )
}

function NavBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>{label}</button>
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Tổng đăng ký", value: stats.total, icon: "📋", color: "bg-slate-50 border-slate-200 text-slate-700" },
            { label: "Chờ duyệt", value: stats.pending, icon: "⏳", color: "bg-amber-50 border-amber-200 text-amber-700" },
            { label: "Đang mượn", value: stats.borrowing, icon: "🔵", color: "bg-blue-50 border-blue-200 text-blue-700" },
            { label: "Đã trả", value: stats.returned, icon: "✅", color: "bg-green-50 border-green-200 text-green-700" },
          ].map((stat) => (
            <div key={stat.label} className={`border rounded-2xl px-6 py-5 flex items-center gap-4 ${stat.color}`}>
              <span className="text-3xl">{stat.icon}</span>
              <div><div className="text-2xl font-bold">{stat.value}</div><div className="text-sm opacity-75">{stat.label}</div></div>
            </div>
          ))}
        </div>

        {/* Danh sách đăng ký - PUBLIC cho mọi người xem */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-12">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Danh sách đăng ký mượn/trả</h2>
              <p className="text-xs text-gray-500 mt-0.5">Ai cũng có thể xem - Cập nhật realtime</p>
            </div>
            <span className="text-sm text-gray-400">{records.length} bản ghi</span>
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
                  {records.map((r) => {
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
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${r.status === "Chờ duyệt" ? "bg-amber-50 text-amber-700" : r.status === "Mượn" ? "bg-blue-50 text-blue-700" : r.status === "Từ chối" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${r.status === "Chờ duyệt" ? "bg-amber-500" : r.status === "Mượn" ? "bg-blue-500" : r.status === "Từ chối" ? "bg-red-500" : "bg-green-500"}`} />
                            {r.status === "Chờ duyệt" ? "Chờ duyệt" : r.status === "Mượn" ? "Đang mượn" : r.status === "Từ chối" ? "Từ chối" : "Đã trả"}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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

function BorrowForm({ subjectId, subjectName, onCreated }: { subjectId: string; subjectName: string; onCreated?: () => void }) {
  const { user, login } = useAuth()
  const [form, setForm] = useState<FormState>({ teacherName: "", className: "", borrowDate: "", period: "", periodPPCT: "", equipment: "", returnDate: "", notes: "" })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

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

    setLoading(true)
    try {
      await createRecord({ subjectId, subjectName, ...form })
      setSubmitted(true)
      onCreated?.()
      setTimeout(() => { setSubmitted(false); setForm({ teacherName: "", className: "", borrowDate: "", period: "", periodPPCT: "", equipment: "", returnDate: "", notes: "" }) }, 3500)
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
        {user.avatar && <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />}
        <div><span className="font-semibold text-blue-800">{user.name}</span><span className="text-blue-600 ml-1 text-xs">đang gửi yêu cầu</span></div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className={labelCls}>Họ và tên giáo viên <span className="text-red-500">*</span></label><input required className={fieldCls} placeholder="Nguyễn Văn A" value={form.teacherName} onChange={(e) => setForm({ ...form, teacherName: e.target.value })} /></div>
        <div><label className={labelCls}>Lớp dạy học <span className="text-red-500">*</span></label><input required className={fieldCls} placeholder="8A1" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></div>
      </div>
      <div><label className={labelCls}>Ngày mượn đồ dùng <span className="text-red-500">*</span></label><input required type="date" className={fieldCls} value={form.borrowDate} onChange={(e) => setForm({ ...form, borrowDate: e.target.value })} /></div>
      <div>
        <label className={labelCls}>Tiết dạy trong ngày <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-5 gap-2 mt-1">
          {["Tiết 1", "Tiết 2", "Tiết 3", "Tiết 4", "Tiết 5"].map((t) => (
            <label key={t} className={`flex items-center gap-2 cursor-pointer px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all select-none ${form.period === t ? "bg-[#1a3670] border-[#1a3670] text-white" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              <input type="radio" name="period" value={t} checked={form.period === t} onChange={() => setForm({ ...form, period: t })} className="sr-only" required />
              {t}
            </label>
          ))}
        </div>
      </div>
      <div><label className={labelCls}>Tiết theo PPCT <span className="text-red-500">*</span></label><input required className={fieldCls} placeholder="VD: Tiết 25 - Bài 12" value={form.periodPPCT} onChange={(e) => setForm({ ...form, periodPPCT: e.target.value })} /></div>
      <div><label className={labelCls}>Đồ dùng cần mượn <span className="text-red-500">*</span></label><textarea required rows={2} className={fieldCls} placeholder="Ống nghiệm, kính hiển vi, mô hình..." value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} /></div>
      <div><label className={labelCls}>Ngày trả đồ dùng <span className="text-red-500">*</span></label><input required type="date" className={fieldCls} value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} /></div>
      <div><label className={labelCls}>Ghi chú</label><textarea rows={2} className={fieldCls} placeholder="Ghi chú thêm nếu có..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
        <strong>Lưu ý:</strong> Yêu cầu mượn sẽ được gửi đến admin để duyệt. Bạn sẽ nhận được thông báo khi yêu cầu được xử lý.
      </div>

      <button type="submit" disabled={loading} className="w-full bg-[#1a3670] hover:bg-[#132d5e] active:scale-[.99] text-white font-bold py-3.5 rounded-xl transition-all text-sm shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
        {loading ? "Đang gửi..." : "Gửi yêu cầu mượn"}
      </button>
    </form>
  )
}

// ============ SUBJECT PAGE ============
function SubjectPage({ subjectId, setPage }: { subjectId: string; setPage: (p: Page) => void }) {
  const subject = SUBJECTS.find((s) => s.id === subjectId)!
  const [stats, setStats] = useState<Stats>({ total: 0, borrowing: 0, returned: 0, pending: 0 })
  const [records, setRecords] = useState<BorrowRecord[]>([])

  const loadData = useCallback(() => {
    fetchSubjectStats(subjectId).then(setStats).catch(console.error)
    fetchRecords({ subjectId }).then(setRecords).catch(console.error)
  }, [subjectId])

  useEffect(() => { loadData() }, [loadData])

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
                <BorrowForm subjectId={subjectId} subjectName={subject.name} onCreated={loadData} />
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
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${r.status === "Chờ duyệt" ? "bg-amber-50 text-amber-700" : r.status === "Mượn" ? "bg-blue-50 text-blue-700" : r.status === "Từ chối" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                              {r.status === "Chờ duyệt" ? "Chờ duyệt" : r.status === "Mượn" ? "Đang mượn" : r.status === "Từ chối" ? "Từ chối" : "Đã trả"}
                            </span>
                          </td>
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
function AdminPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<"records" | "notifications">("records")
  const [records, setRecords] = useState<BorrowRecord[]>([])
  const [filterSubject, setFilterSubject] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const loadData = useCallback(() => {
    setLoading(true)
    fetchRecords({ subjectId: filterSubject || undefined, status: filterStatus || undefined, search: search || undefined })
      .then(setRecords).catch(console.error).finally(() => setLoading(false))
  }, [filterSubject, filterStatus, search])

  const loadNotifs = useCallback(() => {
    fetchNotifications().then(setNotifs).catch(console.error)
    fetchUnreadCount().then(setUnreadCount).catch(() => {})
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadNotifs() }, [loadNotifs])

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

  const handleStatusChange = async (id: string, newStatus: "Mượn" | "Trả") => {
    try { await updateRecordStatus(id, newStatus); loadData() } catch (err) { alert(err instanceof Error ? err.message : "Lỗi") }
  }
  const handleDelete = async (id: string) => {
    if (!confirm("Xác nhận xóa?")) return
    try { await deleteRecord(id); loadData() } catch (err) { alert(err instanceof Error ? err.message : "Lỗi") }
  }

  const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 bg-white text-gray-700"

  return (
    <main className="pt-24 pb-20 px-4">
      <div className="max-w-screen-xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1a3670]">Trang Quản Trị</h1>
            <p className="text-gray-500 text-sm mt-1">Quản lý thiết bị & thông báo</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab("records")} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === "records" ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Mượn/Trả</button>
            <button onClick={() => { setTab("notifications"); loadNotifs() }} className={`px-4 py-2 rounded-xl text-sm font-semibold relative ${tab === "notifications" ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              Thông báo
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{unreadCount}</span>}
            </button>
          </div>
        </div>

        {tab === "records" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
              <input type="text" placeholder="Tìm kiếm..." className="border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 bg-white w-52 placeholder:text-gray-400" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              </select>
              <span className="text-sm text-gray-400 ml-auto">{loading ? "..." : `${records.length} kết quả`}</span>
            </div>
            {records.length === 0 ? (
              <div className="text-center py-16 text-gray-400"><div className="text-5xl mb-3">📋</div><p className="text-sm">Trống</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {["GV", "Lớp", "Môn", "Tiết", "Đồ dùng", "Mượn", "Trả", "TT", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.map((r) => {
                      const sub = SUBJECTS.find((s) => s.id === r.subjectId)
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/60 group">
                          <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{r.teacherName}</td>
                          <td className="px-3 py-3 text-gray-600">{r.className}</td>
                          <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: sub?.color || "#888" }}>{r.subjectName}</span></td>
                          <td className="px-3 py-3 text-gray-600 text-xs">{r.period || "-"}</td>
                          <td className="px-3 py-3 text-gray-700 max-w-[140px] truncate">{r.equipment}</td>
                          <td className="px-3 py-3 text-gray-600 whitespace-nowrap text-xs">{r.borrowDate}</td>
                          <td className="px-3 py-3 text-gray-600 whitespace-nowrap text-xs">{r.returnDate}</td>
                          <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === "Chờ duyệt" ? "bg-amber-50 text-amber-700" : r.status === "Mượn" ? "bg-blue-50 text-blue-700" : r.status === "Từ chối" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{r.status}</span></td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {r.status === "Chờ duyệt" && <button onClick={() => handleStatusChange(r.id, "Mượn")} className="px-2 py-0.5 bg-green-50 hover:bg-green-100 text-green-700 rounded text-[10px] font-bold">Duyệt</button>}
                              {r.status === "Chờ duyệt" && <button onClick={() => handleStatusChange(r.id, "Từ chối")} className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded text-[10px] font-bold">Từ chối</button>}
                              {r.status === "Mượn" && <button onClick={() => handleStatusChange(r.id, "Trả")} className="px-2 py-0.5 bg-green-50 hover:bg-green-100 text-green-700 rounded text-[10px] font-bold">Đã trả</button>}
                              {r.status === "Trả" && <button onClick={() => handleStatusChange(r.id, "Mượn")} className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10px] font-bold">Hoàn tác</button>}
                              <button onClick={() => handleDelete(r.id)} className="px-2 py-0.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded text-[10px] font-bold">Xóa</button>
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
      </div>
    </main>
  )
}

// ============ MAIN APP ============
function AppContent() {
  const { loading } = useAuth()
  const [page, setPage] = useState<Page>("home")

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

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Nav page={page} setPage={setPage} />
      {page === "home" && <HomePage setPage={setPage} />}
      {page === "noiquy" && <NoiQuyPage />}
      {page === "admin" && <AdminPage />}
      {SUBJECTS.some((s) => s.id === page) && <SubjectPage subjectId={page} setPage={setPage} />}
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
