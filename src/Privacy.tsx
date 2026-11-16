// Dữ liệu cá nhân: thông báo xử lý dữ liệu, đồng ý, hồ sơ của tôi, khách vãng lai, yêu cầu về dữ liệu
import { useCallback, useEffect, useState } from "react"
import {
  fetchPrivacyMeta, giveConsent, fetchMyProfile, updateMyProfile, sendDataRequest, fetchDataRequests, handleDataRequest,
  guestSelfCheckIn, fetchGuestSlip, fetchMyLogins, type LoginEntry, fetchGuests, addGuest, checkoutGuest, anonymizeGuest,
  type PrivacyMeta, type MyProfile, type DataRequest, type Guest,
} from "@/api"
import { useAuth } from "./AuthContext"
import { ChangePassword } from "./Roles"
import { exportExcel } from "./Operations"

const card = "bg-white rounded-2xl border border-gray-200/80"
const field = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1a3670]/20 focus:border-[#1a3670] bg-white"
const label = "block text-sm font-semibold text-gray-700 mb-1.5"
const btnPrimary = "px-4 py-2.5 rounded-xl bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const th = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const vnTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-3">{msg}</div> : null)
const Ok = ({ msg }: { msg: string }) => (msg ? <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm mb-3">{msg}</div> : null)
const Main = ({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) => <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10"><div className={narrow ? "max-w-2xl" : "max-w-5xl"}>{children}</div></main>
const Head = ({ kicker, title }: { kicker: string; title: string }) => <div className="mb-6"><div className="text-sm font-semibold text-gray-500 mb-1">{kicker}</div><h1 className="text-[28px] sm:text-3xl font-bold text-[#1F2937] tracking-tight">{title}</h1></div>
const useMeta = () => { const [m, setM] = useState<PrivacyMeta | null>(null); useEffect(() => { fetchPrivacyMeta().then(setM).catch(() => {}) }, []); return m }

// ===================================================================
// THÔNG BÁO XỬ LÝ DỮ LIỆU CÁ NHÂN
// ===================================================================
function NoticeBody({ retention }: { retention: number }) {
  const S = ({ t, children }: { t: string; children: React.ReactNode }) => <section className="mb-5"><h2 className="font-semibold text-gray-900 mb-1.5">{t}</h2><div className="text-[15px] text-gray-700 space-y-1.5">{children}</div></section>
  return (
    <>
      <S t="1. Đơn vị xử lý dữ liệu">
        <p>Trường THCS Lê Độ quản lý website này và chịu trách nhiệm về dữ liệu cá nhân thu thập qua website. Người được nhà trường giao quản trị hệ thống là đầu mối tiếp nhận các yêu cầu về dữ liệu.</p>
      </S>
      <S t="2. Dữ liệu được thu thập">
        <p><strong>Tài khoản:</strong> họ tên, email, ảnh đại diện (khi đăng nhập Google), tên đăng nhập, mật khẩu (chỉ lưu dạng mã hóa một chiều), số điện thoại và chức vụ nếu bạn tự khai, vai trò và tổ chuyên môn.</p>
        <p><strong>Hoạt động:</strong> phiếu mượn – trả (lớp, tiết, bài dạy, thiết bị, tình trạng khi trả), điểm thi đua, đề xuất mua sắm, các thao tác nghiệp vụ và thời điểm đăng nhập.</p>
        <p><strong>Khách vãng lai:</strong> họ tên, đối tượng, đơn vị, số điện thoại (không bắt buộc), mục đích, nơi đến, giờ vào và giờ ra.</p>
        <p><strong>Trợ lý AI:</strong> nội dung câu hỏi bạn gõ vào khung trò chuyện. Không nhập thông tin cá nhân của học sinh vào trợ lý.</p>
      </S>
      <S t="3. Mục đích">
        <p>Quản lý thiết bị, phòng học bộ môn, thư viện; xác định trách nhiệm khi thiết bị hỏng, mất; lập sổ sách, báo cáo theo quy định; bảo đảm an ninh trường học. Nhà trường không dùng dữ liệu để quảng cáo và không bán dữ liệu.</p>
      </S>
      <S t="4. Nơi lưu trữ và bên tham gia xử lý">
        <p>Website chạy trên dịch vụ máy chủ Render, cơ sở dữ liệu đặt tại Supabase; đăng nhập và gửi email qua dịch vụ của Google; câu hỏi gửi trợ lý được chuyển tới Google Gemini để trả lời. Một số dịch vụ này đặt máy chủ ở nước ngoài.</p>
      </S>
      <S t="5. Thời gian lưu">
        <p>Tài khoản được giữ trong thời gian bạn công tác tại trường và bị khóa khi nghỉ việc, chuyển trường. Phiếu mượn – trả và sổ sách lưu theo thời hạn lưu trữ hồ sơ của nhà trường. Thông tin khách vãng lai tự động được ẩn danh sau <strong>{retention} ngày</strong>.</p>
      </S>
      <S t="6. Quyền của bạn">
        <p>Được biết về việc xử lý dữ liệu; đồng ý hoặc rút lại đồng ý; xem và tải toàn bộ dữ liệu của mình (trang “Hồ sơ của tôi”); yêu cầu sửa, xóa dữ liệu (trừ phần nhà trường phải lưu theo quy định về sổ sách, tài sản công); phản ánh, khiếu nại. Gửi yêu cầu ở trang “Hồ sơ của tôi” hoặc liên hệ quản trị hệ thống.</p>
      </S>
      <S t="7. Biện pháp bảo vệ">
        <p>Kết nối mã hóa (HTTPS), mật khẩu mã hóa một chiều, phân quyền theo vai trò, tài khoản mới phải được duyệt, khóa tạm thời khi nhập sai mật khẩu nhiều lần, ghi nhật ký thay đổi dữ liệu và phân quyền.</p>
      </S>
      <S t="8. Dữ liệu học sinh">
        <p>Hiện website không lập tài khoản cho học sinh. Khi mở rộng (ví dụ mượn sách thư viện cho học sinh), nhà trường sẽ bổ sung quy định và xin ý kiến cha mẹ học sinh theo quy định về dữ liệu cá nhân của trẻ em.</p>
      </S>
    </>
  )
}

export function PrivacyPage() {
  const meta = useMeta()
  return (
    <Main narrow>
      <Head kicker="Bảo vệ dữ liệu cá nhân" title="Thông báo xử lý dữ liệu cá nhân" />
      <div className={`${card} p-6`}>
        <p className="text-xs text-gray-500 mb-4">Phiên bản {meta?.version}. Căn cứ Luật Bảo vệ dữ liệu cá nhân 2025 (Luật số 91/2025/QH15) và Nghị định 356/2025/NĐ-CP, hiệu lực từ 01/01/2026. <strong>Bản dự thảo do nhóm phát triển soạn – nhà trường rà soát pháp lý trước khi áp dụng chính thức.</strong></p>
        <NoticeBody retention={meta?.guestRetentionDays || 365} />
      </div>
    </Main>
  )
}

/** Hộp đồng ý: hiện khi đăng nhập mà chưa đồng ý phiên bản thông báo hiện tại */
export function ConsentGate() {
  const { user, logout, setLoggedIn } = useAuth()
  const meta = useMeta()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (!user || !user.roles || !meta || user.consentVersion === meta.version) return null
  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-3">
      <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <h2 id="consent-title" className="text-xl font-bold text-gray-900 mb-2">Đồng ý xử lý dữ liệu cá nhân</h2>
        <p className="text-[15px] text-gray-700">Để dùng website, nhà trường cần bạn đồng ý cho việc xử lý dữ liệu cá nhân (họ tên, email, phiếu mượn – trả, nhật ký thao tác) nhằm quản lý thiết bị, thư viện và lập sổ sách. Dữ liệu lưu trên máy chủ thuê ngoài (Render, Supabase) và dịch vụ Google; bạn có thể xem, tải, yêu cầu sửa hoặc xóa ở trang “Hồ sơ của tôi”.</p>
        <button onClick={() => setOpen(!open)} className="mt-2 text-sm font-semibold text-[#1a3670] hover:underline">{open ? "Thu gọn" : "Đọc toàn văn thông báo"}</button>
        {open && <div className="mt-3 border-t border-gray-100 pt-3"><NoticeBody retention={meta.guestRetentionDays} /></div>}
        <Err msg={error} />
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button onClick={logout} className={btnGhost}>Không đồng ý, đăng xuất</button>
          <button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await giveConsent(meta.version); setLoggedIn({ ...user, consentVersion: meta.version }) } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) } }} className={btnPrimary}>Tôi đã đọc và đồng ý</button>
        </div>
      </div>
    </div>
  )
}

// ===================================================================
// HỒ SƠ CỦA TÔI
// ===================================================================
export function ProfilePage({ go }: { go: (p: string) => void }) {
  const { user, login } = useAuth()
  const meta = useMeta()
  const [p, setP] = useState<MyProfile | null>(null)
  const [f, setF] = useState({ name: "", phone: "", position: "" })
  const [rq, setRq] = useState({ type: "Sửa thông tin", content: "" })
  const [logins, setLogins] = useState<LoginEntry[]>([])
  useEffect(() => { if (user) fetchMyLogins().then(setLogins).catch(() => {}) }, [user])
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const load = useCallback(() => { fetchMyProfile().then((x) => { setP(x); setF({ name: x.user.name, phone: x.user.phone, position: x.user.position }) }).catch((e) => setError(e.message)) }, [])
  useEffect(() => { if (user) load() }, [user, load])
  if (!user) return <Main narrow><div className={`${card} p-6 text-center`}><p className="mb-3">Đăng nhập để xem hồ sơ của bạn</p><button onClick={login} className={btnPrimary}>Đăng nhập</button></div></Main>
  if (!p) return <Main narrow><p className="text-sm text-gray-400">{error || "Đang tải…"}</p></Main>
  const act = async (fn: () => Promise<unknown>, msg: string) => { setError(""); setOk(""); try { await fn(); setOk(msg); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const download = async () => {
    const res = await fetch("/api/me/export", { credentials: "include" })
    const blob = await res.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `du-lieu-cua-toi.json`; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <Main>
      <Head kicker="Tài khoản" title="Hồ sơ của tôi" />
      <Err msg={error} /><Ok msg={ok} />
      <div className="grid lg:grid-cols-5 gap-5 items-start">
        <section className={`lg:col-span-3 ${card} p-6`}>
          <h2 className="font-semibold text-gray-900 mb-4">Thông tin cá nhân</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className={label} htmlFor="pf-name">Họ và tên</label><input id="pf-name" className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className={label} htmlFor="pf-phone">Số điện thoại (không bắt buộc)</label><input id="pf-phone" inputMode="tel" className={field} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div><label className={label} htmlFor="pf-pos">Chức vụ</label><input id="pf-pos" className={field} value={f.position} placeholder="VD: Giáo viên Vật lí" onChange={(e) => setF({ ...f, position: e.target.value })} /></div>
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-4">
            <div><dt className="text-gray-500">Email</dt><dd className="font-medium">{p.user.email || "—"}</dd></div>
            <div><dt className="text-gray-500">Đăng nhập bằng</dt><dd className="font-medium">{p.user.authType === "password" ? `Mật khẩu · ${p.user.username}` : "Google"}</dd></div>
            <div><dt className="text-gray-500">Vai trò</dt><dd className="font-medium">{p.user.roleNames.join(", ") || "—"}</dd></div>
            <div><dt className="text-gray-500">Tổ chuyên môn</dt><dd className="font-medium">{p.user.group || "—"}</dd></div>
            <div><dt className="text-gray-500">Được duyệt bởi</dt><dd className="font-medium">{p.user.approvedBy || "—"}</dd></div>
            <div><dt className="text-gray-500">Đăng nhập gần nhất</dt><dd className="font-medium">{vnTime(p.user.lastLoginAt) || "—"}</dd></div>
          </dl>
          <div className="flex justify-end mt-4"><button onClick={() => act(() => updateMyProfile(f), "Đã lưu thông tin")} className={btnPrimary}>Lưu thông tin</button></div>
        </section>
        <aside className="lg:col-span-2 space-y-5">
          <section className={`${card} p-5`}>
            <h2 className="font-semibold text-gray-900 mb-3">Hoạt động</h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              {([["Phiếu đã đăng ký", p.stats.records], ["Đang mượn", p.stats.borrowing], ["Chờ duyệt", p.stats.pending], ["Đề xuất mua sắm", p.stats.proposals]] as const).map(([l, v]) => <div key={l} className="rounded-xl bg-[#F6F7F9] py-3"><div className="text-2xl font-bold">{v}</div><div className="text-xs text-gray-500">{l}</div></div>)}
            </div>
            <button onClick={() => go("mine")} className="mt-3 text-sm font-semibold text-[#1a3670] hover:underline">Xem phiếu của tôi →</button>
          </section>
          <section className={`${card} p-5`}>
            <h2 className="font-semibold text-gray-900 mb-2">Quyền riêng tư</h2>
            <p className="text-sm text-gray-600">{p.consent ? `Bạn đã đồng ý thông báo xử lý dữ liệu phiên bản ${p.consent.version} lúc ${vnTime(p.consent.at)}.` : "Chưa ghi nhận đồng ý."} <button onClick={() => go("bao-mat")} className="font-semibold text-[#1a3670] hover:underline">Đọc thông báo</button></p>
            <button onClick={download} className={`${btnGhost} mt-3 w-full`}>Tải toàn bộ dữ liệu của tôi</button>
          </section>
        </aside>
      </div>
      <section className={`${card} p-6 mt-5`}>
        <h2 className="font-semibold text-gray-900 mb-1">Yêu cầu về dữ liệu cá nhân</h2>
        <p className="text-sm text-gray-500 mb-3">Gửi tới quản trị hệ thống. Dữ liệu nhà trường phải lưu theo quy định (sổ mượn trả, biên bản tài sản) có thể không xóa được; khi đó bạn sẽ nhận được giải thích.</p>
        <div className="grid sm:grid-cols-4 gap-2">
          <select aria-label="Loại yêu cầu" className={field} value={rq.type} onChange={(e) => setRq({ ...rq, type: e.target.value })}>{meta?.requestTypes.map((t) => <option key={t}>{t}</option>)}</select>
          <input aria-label="Nội dung yêu cầu" className={`${field} sm:col-span-2`} placeholder="Nội dung (VD: sửa họ tên thành…)" value={rq.content} onChange={(e) => setRq({ ...rq, content: e.target.value })} />
          <button onClick={() => act(async () => { await sendDataRequest(rq.type, rq.content); setRq({ ...rq, content: "" }) }, "Đã gửi yêu cầu")} className={btnPrimary}>Gửi yêu cầu</button>
        </div>
        {p.requests.length > 0 && <ul className="mt-4 divide-y divide-gray-100 text-sm">{p.requests.map((r) => <li key={r.id} className="py-2"><strong>{r.type}</strong> · {vnTime(r.createdAt)} · <span className="font-semibold">{r.status}</span>{r.content ? ` – ${r.content}` : ""}{r.response && <div className="text-gray-600">Phản hồi: {r.response}</div>}</li>)}</ul>}
      </section>
      {logins.length > 0 && (
        <section className={`${card} p-6 mt-5`}>
          <h2 className="font-semibold text-gray-900 mb-1">Lần đăng nhập gần đây</h2>
          <p className="text-sm text-gray-500 mb-3">Thấy lần đăng nhập lạ? Đổi mật khẩu và báo quản trị hệ thống.</p>
          <ul className="divide-y divide-gray-100 text-sm">{logins.map((l) => <li key={l.id} className="py-1.5 flex justify-between gap-2"><span>{vnTime(l.at)} · {l.method} · {l.device}</span><span className={l.result === "Thành công" ? "text-green-700" : "text-red-700 font-semibold"}>{l.result}</span></li>)}</ul>
        </section>
      )}
      {p.user.authType === "password" && <ChangePassword />}
    </Main>
  )
}

// ===================================================================
// KHÁCH VÃNG LAI: TỰ ĐĂNG KÝ (KHÔNG CẦN TÀI KHOẢN)
// ===================================================================
const emptyGuest = () => ({ name: "", kind: "", org: "", phone: "", purpose: "", place: "", note: "", consent: false })
function GuestForm({ meta, onSubmit, submitLabel }: { meta: PrivacyMeta; onSubmit: (g: ReturnType<typeof emptyGuest>) => Promise<void>; submitLabel: string }) {
  const [g, setG] = useState(emptyGuest())
  const [error, setError] = useState(""), [busy, setBusy] = useState(false)
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setError(""); setBusy(true); try { await onSubmit(g); setG(emptyGuest()) } catch (x) { setError(x instanceof Error ? x.message : "Lỗi") } finally { setBusy(false) } }} className="space-y-3">
      <Err msg={error} />
      <div><label className={label} htmlFor="g-name">Họ và tên *</label><input id="g-name" autoComplete="name" className={field} value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label} htmlFor="g-kind">Bạn là *</label><select id="g-kind" className={field} value={g.kind} onChange={(e) => setG({ ...g, kind: e.target.value })}><option value="">Chọn…</option>{meta.guestKinds.map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label className={label} htmlFor="g-org">Đơn vị / học sinh lớp (nếu có)</label><input id="g-org" className={field} value={g.org} placeholder="VD: phụ huynh em An lớp 7A2" onChange={(e) => setG({ ...g, org: e.target.value })} /></div>
        <div><label className={label} htmlFor="g-pur">Mục đích *</label><select id="g-pur" className={field} value={g.purpose} onChange={(e) => setG({ ...g, purpose: e.target.value })}><option value="">Chọn…</option>{meta.guestPurposes.map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label className={label} htmlFor="g-place">Nơi đến</label><input id="g-place" className={field} value={g.place} placeholder="VD: Thư viện, phòng KHTN" onChange={(e) => setG({ ...g, place: e.target.value })} /></div>
        <div><label className={label} htmlFor="g-phone">Số điện thoại (không bắt buộc)</label><input id="g-phone" inputMode="tel" className={field} value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} /></div>
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700 bg-[#F6F7F9] rounded-xl p-3">
        <input type="checkbox" className="mt-1" checked={g.consent} onChange={(e) => setG({ ...g, consent: e.target.checked })} />
        <span>Tôi đồng ý để Trường THCS Lê Độ ghi các thông tin trên vào sổ khách nhằm bảo đảm an ninh trường học. Thông tin được tự động ẩn danh sau {meta.guestRetentionDays} ngày; tôi có thể đề nghị xóa sớm với nhân viên nhà trường. <a href="#bao-mat" className="font-semibold text-[#1a3670] underline">Thông báo xử lý dữ liệu</a></span>
      </label>
      <button type="submit" disabled={busy || !g.name || !g.kind || !g.purpose || !g.consent} className={`${btnPrimary} w-full py-3`}>{submitLabel}</button>
    </form>
  )
}

export function GuestPage() {
  const meta = useMeta()
  const [slip, setSlip] = useState<{ code: string; name: string; checkInAt: string; purpose: string; place: string } | null>(null)
  if (!meta) return <Main narrow><p className="text-sm text-gray-400">Đang tải…</p></Main>
  return (
    <Main narrow>
      <Head kicker="Trường THCS Lê Độ" title={slip ? "Phiếu khách" : "Đăng ký khách đến trường"} />
      {slip ? <SlipCard s={{ ...slip, checkOutAt: null }} /> : (
        <section className={`${card} p-6`}>
          <p className="text-[15px] text-gray-600 mb-4">Dành cho phụ huynh, khách công tác, bạn đọc vãng lai… không có tài khoản. Điền thông tin rồi đưa <strong>mã phiếu</strong> cho nhân viên nhà trường.</p>
          <GuestForm meta={meta} submitLabel="Đăng ký" onSubmit={async (g) => { setSlip(await guestSelfCheckIn(g)) }} />
        </section>
      )}
    </Main>
  )
}
function SlipCard({ s }: { s: { code: string; name: string; checkInAt: string; checkOutAt: string | null; purpose: string; place: string } }) {
  return (
    <section className={`${card} p-6 text-center`}>
      <div className="text-sm text-gray-500">Mã phiếu</div>
      <div className="font-mono text-4xl font-bold text-[#1a3670] my-2">{s.code}</div>
      <div className="text-lg font-semibold">{s.name}</div>
      <div className="text-sm text-gray-600 mt-1">{s.purpose}{s.place ? ` · ${s.place}` : ""}</div>
      <div className="text-sm text-gray-600">Vào lúc {vnTime(s.checkInAt)}{s.checkOutAt ? ` · ra lúc ${vnTime(s.checkOutAt)}` : ""}</div>
      <p className="text-sm text-gray-500 mt-4">Đưa màn hình này cho nhân viên nhà trường. Có thể mở lại tại <span className="font-mono">#khach/{s.code}</span>.</p>
    </section>
  )
}
export function GuestSlipPage({ code }: { code: string }) {
  const [s, setS] = useState<Awaited<ReturnType<typeof fetchGuestSlip>> | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { fetchGuestSlip(code).then(setS).catch((e) => setError(e.message)) }, [code])
  return <Main narrow><Head kicker="Trường THCS Lê Độ" title="Phiếu khách" />{s ? <SlipCard s={s} /> : <p className="text-sm text-gray-500">{error || "Đang tải…"}</p>}</Main>
}

// ===================================================================
// SỔ KHÁCH VÃNG LAI (NHÂN VIÊN)
// ===================================================================
const todayIso = () => new Date().toLocaleDateString("sv-SE")
export function GuestsTab() {
  const meta = useMeta()
  const [range, setRange] = useState({ from: todayIso(), to: todayIso() })
  const [d, setD] = useState<{ guests: Guest[]; retentionDays: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const load = useCallback(() => { fetchGuests(range.from, range.to).then(setD).catch((e) => setError(e.message)) }, [range])
  useEffect(() => { load() }, [load])
  if (!d || !meta) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const inside = d.guests.filter((g) => !g.checkOutAt).length
  const act = async (fn: () => Promise<unknown>, msg: string) => { setError(""); setOk(""); try { await fn(); setOk(msg); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const printPoster = async () => {
    const QR = await import("qrcode")
    const url = `${window.location.origin}${window.location.pathname}#khach`
    const img = await QR.toDataURL(url, { width: 600, margin: 1 })
    const w = window.open("", "_blank"); if (!w) return
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Đăng ký khách</title><style>body{font-family:Arial,sans-serif;text-align:center;margin:20mm}h1{font-size:30px;margin:0}p{font-size:18px}img{width:110mm;height:110mm}@media print{button{display:none}}</style></head><body><button onclick="window.print()">In</button><h1>TRƯỜNG THCS LÊ ĐỘ</h1><p>Khách đến trường (phụ huynh, khách công tác, bạn đọc vãng lai)<br><b>quét mã để đăng ký</b></p><img src="${img}" alt=""><p>Đưa mã phiếu trên điện thoại cho nhân viên nhà trường</p></body></html>`)
    w.document.close()
  }
  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={ok} />
      <div className="grid grid-cols-3 gap-3">
        {([["Lượt khách", d.guests.length], ["Đang ở trong trường", inside], ["Đã ra về", d.guests.length - inside]] as const).map(([l, v]) => <div key={l} className={`${card} px-4 py-3`}><div className="text-2xl font-bold">{v}</div><div className="text-xs text-gray-500">{l}</div></div>)}
      </div>
      <div className={`${card} p-4 flex flex-wrap gap-2 items-end`}>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Từ ngày</label><input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Đến ngày</label><input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        <div className="flex gap-2 ml-auto">
          <button onClick={printPoster} className={btnGhost}>In mã QR đăng ký khách</button>
          <button onClick={() => exportExcel("So-khach-vang-lai.xlsx", [{ name: "Sổ khách", rows: d.guests.map((g) => ({ "Mã": g.code, "Họ tên": g.name, "Đối tượng": g.kind, "Đơn vị": g.org, "SĐT": g.phone, "Mục đích": g.purpose, "Nơi đến": g.place, "Vào": vnTime(g.checkInAt), "Ra": vnTime(g.checkOutAt), "Người ghi": g.createdBy })) }])} className={btnGhost}>Xuất Excel</button>
          <button onClick={() => setAdding(!adding)} className={btnPrimary}>+ Ghi khách</button>
        </div>
      </div>
      {adding && <div className={`${card} p-5 max-w-2xl`}><GuestForm meta={meta} submitLabel="Ghi vào sổ" onSubmit={async (g) => { await addGuest(g); setAdding(false); setOk("Đã ghi khách"); load() }} /></div>}
      <div className={`${card} overflow-hidden`}>
        {d.guests.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">Chưa có khách trong khoảng ngày này</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50">{["Mã", "Khách", "Mục đích", "Vào", "Ra", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{d.guests.map((g) => (
              <tr key={g.id} className={g.anonymized ? "opacity-60" : ""}>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{g.code}</td>
                <td className="px-3 py-2"><div className="font-medium">{g.name}</div><div className="text-xs text-gray-500">{[g.kind, g.org, g.phone].filter(Boolean).join(" · ")}</div></td>
                <td className="px-3 py-2 text-xs">{g.purpose}{g.place ? ` · ${g.place}` : ""}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{vnTime(g.checkInAt)}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{g.checkOutAt ? vnTime(g.checkOutAt) : <button onClick={() => act(() => checkoutGuest(g.id), `${g.code} đã ra về`)} className="px-2.5 py-1 rounded-lg bg-[#1a3670] text-white text-xs font-semibold">Ra về</button>}</td>
                <td className="px-3 py-2 text-right">{!g.anonymized && <button onClick={() => { if (confirm(`Xóa thông tin cá nhân của ${g.name}? (giữ lại số liệu thống kê)`)) act(() => anonymizeGuest(g.id), "Đã ẩn danh") }} className="text-xs text-gray-400 hover:text-red-600">Xóa thông tin</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <p className="text-xs text-gray-500">Thông tin khách tự động ẩn danh sau {d.retentionDays} ngày (đặt bằng biến GUEST_RETENTION_DAYS). Khách tự đăng ký tại <span className="font-mono">#khach</span> – in mã QR dán ở cổng, thư viện.</p>
    </div>
  )
}

// ===================================================================
// YÊU CẦU VỀ DỮ LIỆU CÁ NHÂN (QUẢN TRỊ HỆ THỐNG)
// ===================================================================
export function DataRequestsTab() {
  const [list, setList] = useState<DataRequest[] | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(() => { fetchDataRequests().then(setList).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  if (!list) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const act = async (id: string, status: string) => { const resp = prompt(status === "Từ chối" ? "Lý do từ chối (bắt buộc):" : "Phản hồi cho người yêu cầu:", "") ?? ""; if (status === "Từ chối" && !resp) return; try { await handleDataRequest(id, status, resp); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  return (
    <div className="space-y-4">
      <Err msg={error} />
      <p className="text-sm text-gray-600">Yêu cầu sửa, xóa dữ liệu, rút lại đồng ý của người dùng. Sửa thông tin tài khoản tại “Người dùng và phân quyền”; dữ liệu nhà trường phải lưu theo quy định (sổ mượn trả, biên bản tài sản) thì giải thích khi từ chối.</p>
      <div className={`${card} overflow-hidden`}>
        {list.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">Chưa có yêu cầu</p> : (
          <ul className="divide-y divide-gray-50">{list.map((r) => (
            <li key={r.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><div className="font-medium text-gray-900">{r.userName} · {r.type}</div><div className="text-xs text-gray-500">{vnTime(r.createdAt)} · {r.email}{r.content ? ` · ${r.content}` : ""}</div>{r.response && <div className="text-xs text-gray-600">Phản hồi ({r.handledBy}): {r.response}</div>}</div>
              <div className="flex items-center gap-2"><span className="text-xs font-bold">{r.status}</span>
                {r.status !== "Đã xử lý" && r.status !== "Từ chối" && <><button onClick={() => act(r.id, "Đang xử lý")} className={btnGhost}>Đang xử lý</button><button onClick={() => act(r.id, "Từ chối")} className={btnGhost}>Từ chối</button><button onClick={() => act(r.id, "Đã xử lý")} className={btnPrimary}>Đã xử lý</button></>}</div>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  )
}
