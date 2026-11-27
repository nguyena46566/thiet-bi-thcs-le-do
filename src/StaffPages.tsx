// Trang riêng của từng người quản lý: nhân viên thiết bị, thủ thư, quản trị hệ thống
// (Ban giám hiệu và tổ trưởng có trang riêng ở Roles.tsx). Mỗi trang là "việc cần làm hôm nay" kèm lối tắt.
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { fetchStaffOverview, fetchLibraryOverview, fetchAdminOverview, resolveIssue, updateRecordStatus, type StaffOverview, type LibraryOverview, type AdminOverview, type StaffRecord } from "@/api"

const card = "bg-white rounded-2xl border border-gray-200/80"
const btnPrimary = "px-3.5 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-xs font-semibold"
const btnGhost = "px-3.5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold"
const vnTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "")
const vnDay = (iso: string) => { const [y, m, d] = (iso || "").split("-"); return d ? `${d}/${m}/${y}` : iso }

const Shell = ({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) => (
  <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10"><div className="max-w-[1200px]">
    <div className="text-sm font-semibold text-gray-500 mb-1">{kicker}</div>
    <h1 className="text-[28px] sm:text-3xl font-bold text-[#1F2937] tracking-tight mb-5">{title}</h1>
    {children}
  </div></main>
)
const Stats = ({ items }: { items: [string, number | string, string?][] }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{items.map(([l, v, c]) => <div key={l} className={`${card} px-4 py-3`}><div className={`text-2xl font-bold tabular-nums ${c || ""}`}>{v}</div><div className="text-xs text-gray-500">{l}</div></div>)}</div>
)
const Box = ({ title, n, children, empty = "Không có việc chờ", tone = "amber" }: { title: string; n: number; children?: ReactNode; empty?: string; tone?: "amber" | "red" }) => (
  <section className={`${card} overflow-hidden`}>
    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between"><h2 className="font-semibold text-gray-900">{title}</h2>
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${n ? (tone === "red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800") : "bg-gray-100 text-gray-500"}`}>{n}</span></div>
    {n === 0 ? <p className="px-5 py-5 text-sm text-gray-500">{empty}</p> : <ul className="divide-y divide-gray-50">{children}</ul>}
  </section>
)
const Row = ({ main, sub, children }: { main: ReactNode; sub?: ReactNode; children?: ReactNode }) => (
  <li className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm"><div className="min-w-0"><div className="font-medium text-gray-900">{main}</div>{sub && <div className="text-xs text-gray-500">{sub}</div>}</div>{children && <div className="flex gap-2">{children}</div>}</li>
)
const Shortcuts = ({ items, go }: { items: [string, string][]; go: (p: string) => void }) => (
  <section className="mt-5"><h2 className="font-semibold text-gray-900 mb-2 text-sm">Đi nhanh tới</h2><div className="flex flex-wrap gap-2">{items.map(([l, p]) => <button key={p} onClick={() => go(p)} className={btnGhost}>{l}</button>)}</div></section>
)
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{msg}</div> : null)
const slotOf = (r: StaffRecord) => (r.periods?.length ? r.periods.join(", ") : r.period || "")

// ===================================================================
// NHÂN VIÊN THIẾT BỊ
// ===================================================================
export function EquipmentStaffPage({ go }: { go: (p: string) => void }) {
  const [d, setD] = useState<StaffOverview | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(() => { fetchStaffOverview().then(setD).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const act = async (fn: () => Promise<unknown>) => { setError(""); try { await fn(); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const todo = d ? d.pending.length + d.overdue.length + d.dueToday.length + d.issues.length + d.toBuy.length : 0
  return (
    <Shell kicker="Trang nhân viên thiết bị" title={d ? (todo ? `${todo} việc cần làm hôm nay` : "Hôm nay không có việc tồn đọng") : "Việc của tôi"}>
      <Err msg={error} />
      {d && <>
        <Stats items={[["Phiếu chờ duyệt", d.pending.length, "text-amber-700"], ["Đến hạn trả hôm nay", d.dueToday.length], ["Quá hạn trả", d.overdue.length, "text-red-700"], ["Báo hỏng chờ xử lý", d.issues.length, "text-amber-700"]]} />
        <div className="grid lg:grid-cols-2 gap-5">
          <Box title="Phiếu mượn chờ duyệt" n={d.pending.length}>{d.pending.map((r) => (
            <Row key={r.id} main={`${r.teacherName} · lớp ${r.className} · ${r.subjectName}`} sub={`${r.equipment} · ${r.borrowDate}${r.returnDate !== r.borrowDate ? ` → ${r.returnDate}` : ""} · ${slotOf(r)}${r.needsSpecialApproval ? " · cần Ban giám hiệu duyệt" : ""}`}>
              <button onClick={() => { const n = prompt("Lý do từ chối:", ""); if (n) act(() => updateRecordStatus(r.id, "Từ chối", n)) }} className={btnGhost}>Từ chối</button>
              {!r.needsSpecialApproval && <button onClick={() => act(() => updateRecordStatus(r.id, "Mượn"))} className={btnPrimary}>Duyệt</button>}
            </Row>))}</Box>
          <Box title="Quá hạn trả" n={d.overdue.length} tone="red" empty="Không có phiếu quá hạn">{d.overdue.map((r) => <Row key={r.id} main={`${r.teacherName} · lớp ${r.className}`} sub={`${r.equipment} · hạn ${r.returnDate}`}><button onClick={() => go("admin/muon-tra")} className={btnGhost}>Mở nhận trả</button></Row>)}</Box>
          <Box title="Đến hạn trả hôm nay" n={d.dueToday.length} empty="Không có phiếu đến hạn hôm nay">{d.dueToday.map((r) => <Row key={r.id} main={`${r.teacherName} · lớp ${r.className}`} sub={`${r.equipment} · ${slotOf(r)}`}><button onClick={() => go("admin/muon-tra")} className={btnGhost}>Mở nhận trả</button></Row>)}</Box>
          <Box title="Giáo viên báo hỏng thiết bị" n={d.issues.length}>{d.issues.map((i) => (
            <Row key={i.id} main={`${i.name} × ${i.quantity}`} sub={`${i.reporterName} · ${vnTime(i.createdAt)} · ${i.note}`}>
              <button onClick={() => { const n = prompt("Lý do không xác nhận:", ""); if (n) act(() => resolveIssue(i.id, false, n)) }} className={btnGhost}>Không xác nhận</button>
              <button onClick={() => act(() => resolveIssue(i.id, true))} className={btnPrimary}>Xác nhận hỏng</button>
            </Row>))}</Box>
          <Box title="Đề xuất đã duyệt, chờ mua" n={d.toBuy.length} empty="Không có đề xuất nào chờ mua">{d.toBuy.map((p) => <Row key={p.id} main={`${p.userName}: ${p.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}`} sub={`Dự kiến ${p.total.toLocaleString("vi-VN")} đ`}><button onClick={() => go("admin/de-xuat")} className={btnGhost}>Mở đề xuất</button></Row>)}</Box>
          <section className={`${card} p-5`}>
            <h2 className="font-semibold text-gray-900 mb-3">Đang chờ người khác</h2>
            <ul className="text-sm space-y-1.5">
              <li className="flex justify-between"><span>Báo mất chờ Ban giám hiệu xác nhận</span><strong>{d.lossesWaiting.length}</strong></li>
              <li className="flex justify-between"><span>Đề nghị thanh lý chờ Ban giám hiệu duyệt</span><strong>{d.disposalsWaiting.length}</strong></li>
            </ul>
            <h2 className="font-semibold text-gray-900 mt-4 mb-3">Kho thiết bị</h2>
            <ul className="text-sm space-y-1.5">
              <li className="flex justify-between"><span>Hóa chất hết hạn / sắp hết hạn (30 ngày)</span><strong className={d.alerts.expired ? "text-red-700" : ""}>{d.alerts.expired} / {d.alerts.expiringSoon}</strong></li>
              <li className="flex justify-between"><span>Dưới mức tồn tối thiểu</span><strong>{d.alerts.lowStock}</strong></li>
              <li className="flex justify-between"><span>Đợt kiểm kê đang làm / lượt bảo trì đang sửa</span><strong>{d.auditsRunning} / {d.maintenanceRunning}</strong></li>
              <li className="flex justify-between"><span>Thiết bị chưa có đơn giá</span><strong>{d.stats.noPrice} / {d.stats.types}</strong></li>
              <li className="flex justify-between"><span>Tốt · hỏng · đang sửa</span><strong>{d.stats.good} · {d.stats.broken} · {d.stats.repair}</strong></li>
            </ul>
          </section>
        </div>
        <Shortcuts go={go} items={[["Mượn – trả thiết bị", "admin/muon-tra"], ["Ghi tăng (nhập kho)", "admin/ghi-tang"], ["Kiểm kê", "admin/kiem-ke"], ["Hóa chất – vật tư", "admin/hoa-chat"], ["Danh mục tối thiểu TT 38", "admin/toi-thieu"], ["Báo cáo tổng hợp", "admin/bao-cao"], ["Tổng quan chi tiết", "admin/tong-quan"]]} />
      </>}
    </Shell>
  )
}

// ===================================================================
// THỦ THƯ
// ===================================================================
export function LibrarianPage({ go }: { go: (p: string) => void }) {
  const [d, setD] = useState<LibraryOverview | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { fetchLibraryOverview().then(setD).catch((e) => setError(e.message)) }, [])
  const todo = d ? d.overdue.length + d.compensation.length + d.receiptsWaiting.length + d.readingLacking.length : 0
  return (
    <Shell kicker="Trang nhân viên thư viện" title={d ? (todo ? `${todo} việc cần làm hôm nay` : "Hôm nay không có việc tồn đọng") : "Việc của tôi"}>
      <Err msg={error} />
      {d && <>
        <Stats items={[["Đang mượn về nhà", d.stats.borrowing], ["Sách quá hạn", d.overdue.length, "text-red-700"], ["Chờ bồi thường", d.compensation.length, "text-amber-700"], ["Phiếu nhập chờ kiểm đếm", d.receiptsWaiting.length, "text-amber-700"]]} />
        <div className="grid lg:grid-cols-2 gap-5">
          <Box title="Sách quá hạn" n={d.overdue.length} tone="red" empty="Không có sách quá hạn">{d.overdue.slice(0, 12).map((l) => <Row key={l.id} main={`${l.readerName}${l.className ? ` · lớp ${l.className}` : ` · ${l.readerType}`}`} sub={`${l.title || l.copyCode} · hạn ${vnDay(l.dueDate)} · quá ${l.overdueDays} ngày`}><button onClick={() => go("admin/muon-tra-sach")} className={btnGhost}>Mở mượn – trả</button></Row>)}</Box>
          <Box title="Sách mất, hỏng chờ bồi thường" n={d.compensation.length} empty="Không có khoản chờ xử lý">{d.compensation.slice(0, 12).map((l) => <Row key={l.id} main={`${l.readerName}${l.className ? ` · lớp ${l.className}` : ""}`} sub={`${l.title || l.copyCode} · ${l.condition} · ${(l.compensation?.amount || 0).toLocaleString("vi-VN")} đ`}><button onClick={() => go("admin/muon-tra-sach")} className={btnGhost}>Ghi nhận</button></Row>)}</Box>
          <Box title="Phiếu nhập sách chờ kiểm đếm" n={d.receiptsWaiting.length} empty="Không có phiếu chờ">{d.receiptsWaiting.map((x) => <Row key={x.id} main={`Hóa đơn ${x.invoiceNo}`} sub={`${x.supplier} · ${x.lineCount} dòng`}><button onClick={() => go("admin/nhan-sach")} className={btnGhost}>Kiểm đếm</button></Row>)}</Box>
          <Box title={`Lớp chưa đủ ${d.minReading} tiết đọc ${d.term}`} n={d.readingLacking.length} empty="Mọi lớp đã đủ tiết đọc">{d.readingLacking.map((x) => <Row key={x.className} main={`Lớp ${x.className}`} sub={`Đã dạy ${x.done}/${d.minReading} tiết`}><button onClick={() => go("admin/tiet-doc")} className={btnGhost}>Xếp tiết</button></Row>)}</Box>
        </div>
        <section className={`${card} p-5 mt-5`}>
          <h2 className="font-semibold text-gray-900 mb-3">Hôm nay ({vnDay(d.today)})</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            {([["Lượt mượn", d.stats.loansToday], ["Lượt trả", d.stats.returnsToday], ["Tiết đọc trong ngày", d.readingToday], ["Sách trên giá", `${d.stats.onShelf}/${d.stats.copies}`], ["Chưa xếp giá", d.stats.unshelved]] as const).map(([l, v]) => <div key={l}><div className="text-xl font-bold tabular-nums">{v}</div><div className="text-xs text-gray-500">{l}</div></div>)}
          </div>
          <p className="text-xs text-gray-500 mt-3">{d.stats.titles} đầu sách · {d.stats.copies} bản · {d.stats.readers} bạn đọc</p>
        </section>
        <Shortcuts go={go} items={[["Mượn – trả sách", "admin/muon-tra-sach"], ["Bạn đọc, thẻ thư viện", "admin/ban-doc"], ["Nhận sách theo hóa đơn", "admin/nhan-sach"], ["Kệ sách, xếp giá", "admin/ke-sach"], ["Tiết đọc", "admin/tiet-doc"], ["Kiểm kê – thanh lọc", "admin/kiem-ke-sach"], ["Thống kê thư viện", "admin/thong-ke-thu-vien"], ["Sổ khách", "admin/khach-vang-lai"]]} />
      </>}
    </Shell>
  )
}

// ===================================================================
// QUẢN TRỊ HỆ THỐNG
// ===================================================================
export function SysadminPage({ go }: { go: (p: string) => void }) {
  const [d, setD] = useState<AdminOverview | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { fetchAdminOverview().then(setD).catch((e) => setError(e.message)) }, [])
  const todo = d ? d.pendingUsers.length + d.dataRequests.length + d.failedChecks.length : 0
  return (
    <Shell kicker="Trang quản trị hệ thống" title={d ? (todo ? `${todo} việc cần xử lý` : "Hệ thống ổn định, không có việc tồn đọng") : "Việc của tôi"}>
      <Err msg={error} />
      {d && <>
        {d.demoActive && <div role="status" className="mb-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2.5 text-sm">Đang bật dữ liệu mẫu. <button onClick={() => go("admin/he-thong")} className="font-semibold underline">Quản lý dữ liệu mẫu</button></div>}
        <Stats items={[["Tài khoản chờ duyệt", d.pendingUsers.length, "text-amber-700"], ["Yêu cầu dữ liệu cá nhân", d.dataRequests.length, "text-amber-700"], ["Đăng nhập lỗi (24 giờ)", d.logins24h.failed, d.logins24h.failed ? "text-red-700" : ""], ["Cấu hình còn thiếu", d.failedChecks.length, d.failedChecks.length ? "text-red-700" : ""]]} />
        <div className="grid lg:grid-cols-2 gap-5">
          <Box title="Tài khoản chờ duyệt" n={d.pendingUsers.length}>{d.pendingUsers.map((u) => <Row key={u.id} main={u.name} sub={`${u.email || u.username || ""} · xin vai trò: ${(u.requestedRoles || []).join(", ") || "chưa chọn"}`}><button onClick={() => go("admin/nguoi-dung")} className={btnPrimary}>Duyệt</button></Row>)}</Box>
          <Box title="Yêu cầu về dữ liệu cá nhân" n={d.dataRequests.length}>{d.dataRequests.map((x) => <Row key={x.id} main={`${x.userName || ""} · ${x.type}`} sub={`${vnTime(x.createdAt)} · ${x.content}`}><button onClick={() => go("admin/du-lieu-ca-nhan")} className={btnPrimary}>Xử lý</button></Row>)}</Box>
          <Box title="Cấu hình còn thiếu" n={d.failedChecks.length} tone="red" empty="Mọi mục kiểm tra đều đạt">{d.failedChecks.map((c) => <Row key={c.label} main={c.label}><button onClick={() => go("admin/he-thong")} className={btnGhost}>Xem hướng dẫn</button></Row>)}</Box>
          <section className={`${card} p-5`}>
            <h2 className="font-semibold text-gray-900 mb-3">Tình trạng hệ thống</h2>
            <ul className="text-sm space-y-1.5">
              <li className="flex justify-between"><span>Lưu trữ</span><strong>{d.storage}</strong></li>
              <li className="flex justify-between"><span>Sao lưu gần nhất</span><strong>{d.lastBackup ? vnTime(d.lastBackup.at) : "Chưa có"}</strong></li>
              <li className="flex justify-between"><span>Sao lưu mã hóa</span><strong>{d.backupEncrypted ? "Có" : "Chưa (đặt BACKUP_KEY)"}</strong></li>
              <li className="flex justify-between"><span>Đăng nhập 24 giờ</span><strong>{d.logins24h.ok} thành công · {d.logins24h.failed} lỗi</strong></li>
              <li className="flex justify-between"><span>Máy chủ đã chạy</span><strong>{d.uptimeMinutes} phút</strong></li>
              <li className="flex justify-between"><span>Tài khoản: hoạt động · khóa · chờ duyệt</span><strong>{d.users.active} · {d.users.locked} · {d.users.pending}</strong></li>
            </ul>
          </section>
        </div>
        <Shortcuts go={go} items={[["Người dùng và phân quyền", "admin/nguoi-dung"], ["Yêu cầu dữ liệu cá nhân", "admin/du-lieu-ca-nhan"], ["Nhật ký đăng nhập", "admin/nhat-ky-dang-nhap"], ["Sao lưu, trạng thái hệ thống", "admin/he-thong"]]} />
      </>}
    </Shell>
  )
}
