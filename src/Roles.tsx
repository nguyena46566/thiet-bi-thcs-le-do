// Đăng nhập, chờ duyệt, trang Ban giám hiệu, trang tổ trưởng, quản lý người dùng
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  fetchAuthOptions, loginPassword, registerAccount, changeMyPassword, fetchUsers, approveUser, rejectUser, updateUser, createUser, resetUserPassword,
  fetchPrincipalOverview, fetchHeadOverview, confirmLoss, rejectLoss, decideProposal, updateRecordStatus, fold, decideDisposal, reviewProposal,
  type AuthOptions, type AppUser, type RoleLog, type BorrowRecord, type Proposal, type LossReport, type Plan,
} from "@/api"
import { useAuth } from "./AuthContext"
import { printDoc } from "./Operations"

const card = "bg-white rounded-2xl border border-gray-200/80"
const field = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1a3670]/50 focus:border-[#1a3670] bg-white"
const label = "block text-sm font-semibold text-gray-700 mb-1.5"
const btnPrimary = "px-4 py-2.5 rounded-xl bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const th = "relative px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-3">{msg}</div> : null)
const Ok = ({ msg }: { msg: string }) => (msg ? <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm mb-3">{msg}</div> : null)
const vnTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")
const ROLE_CLS: Record<string, string> = { librarian: "bg-cyan-50 text-cyan-700", sysadmin: "bg-violet-50 text-violet-700", equipment: "bg-blue-50 text-blue-700", principal: "bg-amber-50 text-amber-800", head: "bg-emerald-50 text-emerald-700", teacher: "bg-gray-100 text-gray-700" }
const Main = ({ children }: { children: React.ReactNode }) => <main className="pt-20 lg:pt-10 pb-24 px-4 lg:px-10"><div className="max-w-6xl">{children}</div></main>
const Head = ({ kicker, title, right }: { kicker: string; title: string; right?: React.ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><div className="text-sm font-semibold text-gray-500 mb-1">{kicker}</div><h1 className="text-[28px] sm:text-3xl font-bold text-[#1F2937] tracking-tight">{title}</h1></div>{right}</div>
)

// ===================================================================
// ĐĂNG NHẬP / ĐĂNG KÝ
// ===================================================================
export function LoginPage({ go }: { go: (p: string) => void }) {
  const { loginGoogle, setLoggedIn } = useAuth()
  const [opt, setOpt] = useState<AuthOptions | null>(null)
  const [tab, setTab] = useState<"login" | "register">("login")
  const [f, setF] = useState({ username: "", password: "" })
  const [r, setR] = useState({ name: "", email: "", username: "", password: "", password2: "", requestedRoles: ["teacher"], group: "" })
  const [error, setError] = useState("")
  const [ok, setOk] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetchAuthOptions().then(setOpt).catch(() => {}) }, [])
  const doLogin = async (username = f.username, password = f.password) => {
    setError(""); setBusy(true)
    try { const res = await loginPassword(username, password); setLoggedIn(res.user); go(res.landing || "home") }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi đăng nhập") } finally { setBusy(false) }
  }
  const doRegister = async () => {
    setError(""); setOk("")
    if (r.password !== r.password2) { setError("Hai lần nhập mật khẩu không khớp"); return }
    setBusy(true)
    try { await registerAccount(r); setOk("Đã gửi yêu cầu. Quản trị hệ thống sẽ duyệt và gán vai trò, sau đó bạn đăng nhập bằng tên và mật khẩu vừa tạo."); setTab("login"); setF({ username: r.username, password: "" }) }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  return (
    <Main>
      <Head kicker="Trường THCS Lê Độ" title="Đăng nhập" />
      <div className="grid lg:grid-cols-5 gap-5 items-start">
        <section className={`lg:col-span-3 ${card} p-6`}>
          <div className="flex gap-2 mb-5" role="tablist">
            {([["login", "Đăng nhập"], ["register", "Đăng ký tài khoản"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setError("") }} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === k ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700"}`}>{l}</button>
            ))}
          </div>
          <Err msg={error} /><Ok msg={ok} />
          {tab === "login" ? (
            <div className="space-y-4">
              {opt?.google !== false && <button onClick={loginGoogle} className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-gray-300 hover:bg-gray-50 font-semibold text-gray-800">
                <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                Đăng nhập bằng Google</button>}
              <div className="flex items-center gap-3 text-xs text-gray-500"><span className="flex-1 h-px bg-gray-200" />hoặc tên đăng nhập<span className="flex-1 h-px bg-gray-200" /></div>
              <form onSubmit={(e) => { e.preventDefault(); doLogin() }} className="space-y-3">
                <div><label className={label} htmlFor="lg-user">Tên đăng nhập</label><input id="lg-user" autoComplete="username" className={field} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
                <div><label className={label} htmlFor="lg-pass">Mật khẩu</label><input id="lg-pass" type="password" autoComplete="current-password" className={field} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
                <button type="submit" disabled={busy || !f.username || !f.password} className={`${btnPrimary} w-full`}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
              </form>
              <p className="text-xs text-gray-500">Lần đầu đăng nhập bằng Google, tài khoản sẽ ở trạng thái <strong>chờ duyệt</strong> cho đến khi quản trị hệ thống gán vai trò.</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); doRegister() }} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className={label} htmlFor="rg-name">Họ và tên *</label><input id="rg-name" className={field} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
                <div><label className={label} htmlFor="rg-email">Email</label><input id="rg-email" type="email" className={field} value={r.email} onChange={(e) => setR({ ...r, email: e.target.value })} /></div>
                <div><label className={label} htmlFor="rg-user">Tên đăng nhập *</label><input id="rg-user" className={field} value={r.username} placeholder="vd: nguyenvana" onChange={(e) => setR({ ...r, username: e.target.value.toLowerCase() })} /></div>
                <div />
                <div><label className={label} htmlFor="rg-p1">Mật khẩu * (tối thiểu 8 ký tự)</label><input id="rg-p1" type="password" autoComplete="new-password" className={field} value={r.password} onChange={(e) => setR({ ...r, password: e.target.value })} /></div>
                <div><label className={label} htmlFor="rg-p2">Nhập lại mật khẩu *</label><input id="rg-p2" type="password" autoComplete="new-password" className={field} value={r.password2} onChange={(e) => setR({ ...r, password2: e.target.value })} /></div>
              </div>
              <div><span className={label}>Vai trò đề nghị (quản trị hệ thống sẽ xem xét)</span>
                <div className="flex flex-wrap gap-2">{Object.entries(opt?.roles || {}).filter(([k]) => k !== "sysadmin").map(([k, l]) => (
                  <label key={k} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200"><input type="checkbox" checked={r.requestedRoles.includes(k)} onChange={(e) => setR({ ...r, requestedRoles: e.target.checked ? [...r.requestedRoles, k] : r.requestedRoles.filter((x) => x !== k) })} />{l}</label>
                ))}</div></div>
              {r.requestedRoles.includes("head") && <div><label className={label} htmlFor="rg-g">Tổ chuyên môn</label><select id="rg-g" className={field} value={r.group} onChange={(e) => setR({ ...r, group: e.target.value })}><option value="">Chọn tổ…</option>{opt?.groups.map((g) => <option key={g}>{g}</option>)}</select></div>}
              <button type="submit" disabled={busy || !r.name || !r.username || !r.password} className={`${btnPrimary} w-full`}>Gửi yêu cầu tài khoản</button>
            </form>
          )}
        </section>
        {opt && opt.testAccounts.length > 0 && (
          <aside aria-label="Tài khoản thử nghiệm" className={`lg:col-span-2 ${card} p-5 border-amber-200 bg-amber-50/40`}>
            <h2 className="font-semibold text-gray-900 mb-1">Tài khoản thử nghiệm</h2>
            <p className="text-xs text-gray-600 mb-3">Đang bật chế độ thử nghiệm (TEST_ACCOUNTS=1). Mật khẩu chung: <code className="font-mono font-bold">{opt.testPassword}</code>. Tắt biến này trên máy chủ khi đưa vào sử dụng thật.</p>
            <ul className="space-y-2">{opt.testAccounts.map((t) => (
              <li key={t.username}><button disabled={busy} onClick={() => doLogin(t.username, opt.testPassword || "")} className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-[#1a3670] text-sm">
                <span className="font-mono font-semibold text-[#1a3670]">{t.username}</span><span className="block text-xs text-gray-500">{t.label}</span></button></li>
            ))}</ul>
            {opt.demoAccounts && opt.demoAccounts.length > 0 && <details className="mt-3"><summary className="text-sm font-semibold text-[#1a3670] cursor-pointer">Giáo viên trong dữ liệu mẫu ({opt.demoAccounts.length})</summary>
              <ul className="mt-2 space-y-1">{opt.demoAccounts.map((t) => <li key={t.username}><button disabled={busy} onClick={() => doLogin(t.username, opt.testPassword || "")} className="w-full text-left px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-[#1a3670] text-xs"><span className="font-mono font-semibold text-[#1a3670]">{t.username}</span> · {t.label}</button></li>)}</ul></details>}
          </aside>
        )}
      </div>
    </Main>
  )
}

export function PendingPage() {
  const { pending, logout } = useAuth()
  return (
    <Main>
      <Head kicker="Tài khoản" title="Đang chờ duyệt" />
      <section className={`${card} p-6 max-w-xl`}>
        <p className="text-[15px] text-gray-700">Tài khoản <strong>{pending?.name}</strong>{pending?.email ? ` (${pending.email})` : ""} đã được ghi nhận. Quản trị hệ thống sẽ duyệt và gán vai trò (giáo viên, tổ trưởng, nhân viên thiết bị, Ban giám hiệu).</p>
        <p className="text-sm text-gray-500 mt-2">Sau khi được duyệt, đăng nhập lại để vào trang của mình.</p>
        <button onClick={logout} className={`${btnGhost} mt-4`}>Đăng xuất</button>
      </section>
    </Main>
  )
}

/** Đổi mật khẩu (tài khoản đăng nhập bằng mật khẩu) */
export function ChangePassword() {
  const [f, setF] = useState({ current: "", password: "", password2: "" })
  const [msg, setMsg] = useState(""), [error, setError] = useState("")
  return (
    <section className={`${card} p-5 mt-6 max-w-lg`}>
      <h2 className="font-semibold text-gray-900 mb-3">Đổi mật khẩu</h2>
      <Err msg={error} /><Ok msg={msg} />
      <div className="space-y-2">
        {([["current", "Mật khẩu hiện tại"], ["password", "Mật khẩu mới (tối thiểu 8 ký tự)"], ["password2", "Nhập lại mật khẩu mới"]] as const).map(([k, l]) => (
          <div key={k}><label className={label} htmlFor={`cp-${k}`}>{l}</label><input id={`cp-${k}`} type="password" className={field} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
      </div>
      <button onClick={async () => { setError(""); setMsg(""); if (f.password !== f.password2) return setError("Mật khẩu mới không khớp"); try { await changeMyPassword(f.current, f.password); setMsg("Đã đổi mật khẩu"); setF({ current: "", password: "", password2: "" }) } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }} className={`${btnPrimary} mt-3`}>Đổi mật khẩu</button>
    </section>
  )
}

// ===================================================================
// TRANG BAN GIÁM HIỆU
// ===================================================================
export function PrincipalPage({ go }: { go: (p: string) => void }) {
  const [d, setD] = useState<{ losses: LossReport[]; proposals: Proposal[]; plans: Plan[]; special: BorrowRecord[]; disposals: import("@/api").Disposal[]; directEdits: { id: string; name: string; by: string; createdAt: string; diff: Record<string, number>; note: string }[]; stats: { monthRecords: number; borrowing: number; overdue: number; pending: number } } | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(() => { fetchPrincipalOverview().then(setD).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const act = async (fn: () => Promise<unknown>) => { setError(""); try { await fn(); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  const total = d ? d.losses.length + d.proposals.length + d.plans.length + d.special.length + d.disposals.length : 0
  const box = (title: string, n: number, children: React.ReactNode) => (
    <section className={`${card} overflow-hidden`}>
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between"><h2 className="font-semibold text-gray-900">{title}</h2><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${n ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"}`}>{n}</span></div>
      {n === 0 ? <p className="px-5 py-6 text-sm text-gray-500">Không có việc chờ</p> : <ul className="divide-y divide-gray-50">{children}</ul>}
    </section>
  )
  return (
    <Main>
      <Head kicker="Trang Ban giám hiệu" title={total ? `${total} việc chờ thầy/cô quyết định` : "Không có việc chờ quyết định"} />
      <Err msg={error} />
      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {([["Lượt mượn tháng này", d.stats.monthRecords, ""], ["Đang cho mượn", d.stats.borrowing, ""], ["Quá hạn trả", d.stats.overdue, "text-red-700"], ["Phiếu chờ duyệt", d.stats.pending, "text-amber-700"]] as const).map(([l, v, c]) => (
              <div key={l} className={`${card} px-4 py-3`}><div className={`text-2xl font-bold tabular-nums ${c}`}>{v}</div><div className="text-xs text-gray-500">{l}</div></div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-5">
            {box("Xác nhận thiết bị bị mất", d.losses.length, d.losses.map((x) => (
              <li key={x.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="font-medium text-gray-900">{x.name} × {x.quantity}</div><div className="text-xs text-gray-500">{x.source === "audit" ? `Kiểm kê: ${x.auditTitle}` : `Phiếu mượn của ${x.teacherName}`}{x.verification ? ` · đã xác minh: ${x.verification.findings || x.verification.searchScope}` : " · chưa ghi xác minh"}</div></div>
                <div className="flex gap-2"><button onClick={() => act(() => rejectLoss(x.id, prompt("Ghi chú (tìm thấy ở đâu…):", "") || ""))} className={btnGhost}>Tìm thấy</button><button onClick={() => { const n = prompt("Ghi chú xác nhận mất:", ""); if (n !== null) act(() => confirmLoss(x.id, n)) }} className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Xác nhận mất</button></div>
              </li>
            )))}
            {box("Đề xuất mua sắm", d.proposals.length, d.proposals.map((p) => (
              <li key={p.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="font-medium text-gray-900">{p.userName}: {p.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</div>{(p.headReviews || []).map((h) => <div key={h.group} className="text-xs mt-0.5"><span className="text-gray-500">{h.group}:</span> <strong className={h.opinion === "Đồng ý" ? "text-green-700" : "text-red-700"}>{h.opinion}</strong>{h.note ? <span className="text-gray-600"> – {h.note}</span> : null}</div>)}<div className="text-xs text-gray-500">{p.total.toLocaleString("vi-VN")} đ{p.purpose ? ` · ${p.purpose}` : ""}</div></div>
                <div className="flex gap-2"><button onClick={() => { const n = prompt("Lý do không duyệt:", ""); if (n !== null) act(() => decideProposal(p.id, false, n)) }} className={btnGhost}>Không duyệt</button><button onClick={() => act(() => decideProposal(p.id, true, prompt("Ý kiến (có thể để trống):", "") || ""))} className={btnPrimary}>Duyệt</button></div>
              </li>
            )))}
            {box("Phiếu mượn dài ngày thiết bị giá trị cao", d.special.length, d.special.map((r) => (
              <li key={r.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="font-medium text-gray-900">{r.teacherName} · lớp {r.className}</div><div className="text-xs text-gray-500">{r.equipment} · {r.borrowDate} → {r.returnDate}</div></div>
                <div className="flex gap-2"><button onClick={() => { const n = prompt("Lý do từ chối:", ""); if (n) act(() => updateRecordStatus(r.id, "Từ chối", n)) }} className={btnGhost}>Từ chối</button><button onClick={() => act(() => updateRecordStatus(r.id, "Mượn", undefined, prompt("Ghi chú duyệt:", "Ban giám hiệu đồng ý") || "Ban giám hiệu đồng ý"))} className={btnPrimary}>Duyệt</button></div>
              </li>
            )))}
            {box("Đề nghị thanh lý (ghi giảm)", d.disposals.length, d.disposals.map((x) => (
              <li key={x.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="font-medium text-gray-900">{x.name} × {x.quantity}</div><div className="text-xs text-gray-500">{x.reason} · lập bởi {x.createdBy} · giá trị {x.value.toLocaleString("vi-VN")} đ{x.note ? ` · ${x.note}` : ""}</div></div>
                <div className="flex gap-2"><button onClick={() => { const n = prompt("Lý do không duyệt:", ""); if (n) act(() => decideDisposal(x.id, false, "", n)) }} className={btnGhost}>Không duyệt</button><button onClick={() => { const no = prompt("Số quyết định thanh lý của Hiệu trưởng:", ""); if (no) act(() => decideDisposal(x.id, true, no, "")) }} className={btnPrimary}>Duyệt</button></div>
              </li>
            )))}
            {box("Kế hoạch chờ duyệt", d.plans.length, d.plans.map((p) => (
              <li key={p.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div><div className="font-medium text-gray-900">{p.title}</div><div className="text-xs text-gray-500">Trình bởi {p.createdBy} · {vnTime(p.submittedAt)}</div></div>
                <button onClick={() => go("admin/ke-hoach")} className={btnPrimary}>Mở để duyệt</button>
              </li>
            )))}
          </div>
          {d.directEdits.length > 0 && (
            <section className={`${card} overflow-hidden mt-5`}>
              <div className="px-5 py-3.5 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Giám sát: sửa tay làm giảm số lượng (30 ngày qua)</h2><p className="text-xs text-gray-500">Các lần nhân viên sửa trực tiếp số lượng thiết bị thay vì lập phiếu. Cần đối chiếu nếu thấy bất thường.</p></div>
              <ul className="divide-y divide-gray-50 text-sm">{d.directEdits.map((x) => <li key={x.id} className="px-5 py-2.5 flex flex-wrap justify-between gap-2"><span>{x.name} · {Object.entries(x.diff).map(([k, v]) => `${k.replace("qty", "")}: ${v > 0 ? "+" : ""}${v}`).join(", ")}</span><span className="text-xs text-gray-500">{x.by} · {vnTime(x.createdAt)}</span></li>)}</ul>
            </section>
          )}
          <div className="flex flex-wrap gap-2 mt-5">
            {([["admin/bao-cao", "Báo cáo tổng hợp"], ["admin/so-sach", "Sổ sách, biểu mẫu"], ["admin/toi-thieu", "Mức đáp ứng danh mục tối thiểu"], ["admin", "Tổng quan phòng thiết bị"]] as const).map(([h, l]) => (
              <button key={h} onClick={() => go(h)} className={btnGhost}>{l} →</button>
            ))}
          </div>
        </>
      )}
    </Main>
  )
}

// ===================================================================
// TRANG TỔ TRƯỞNG CHUYÊN MÔN
// ===================================================================
export function HeadPage({ WeekGrid }: { WeekGrid: (p: { records: BorrowRecord[] }) => React.ReactElement }) {
  const { user } = useAuth()
  const [d, setD] = useState<{ group: string; subjects: { id: string; name: string }[]; records: BorrowRecord[]; proposals: Proposal[] } | null>(null)
  const [subject, setSubject] = useState("")
  const [error, setError] = useState("")
  const loadHead = useCallback(() => { fetchHeadOverview().then(setD).catch((e) => setError(e.message)) }, [])
  useEffect(() => { loadHead() }, [loadHead])
  // Tổ trưởng cho ý kiến về đề xuất của tổ; Ban giám hiệu thấy ý kiến này khi duyệt
  const review = async (id: string, opinion: "Đồng ý" | "Không đồng ý") => {
    const note = opinion === "Không đồng ý" ? prompt("Lý do không đồng ý:", "") : prompt("Ghi chú (không bắt buộc):", "") ?? ""
    if (note === null || (opinion === "Không đồng ý" && !note)) return
    setError(""); try { await reviewProposal(id, opinion, note); loadHead() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") }
  }
  const recs = useMemo(() => (d?.records || []).filter((r) => !subject || r.subjectId === subject), [d, subject])
  const byTeacher = useMemo(() => {
    const m = new Map<string, { n: number; late: number; practice: number }>()
    for (const r of recs) { if (r.status === "Từ chối") continue; const x = m.get(r.teacherName) || { n: 0, late: 0, practice: 0 }; x.n++; if (r.usageType === "Thực hành") x.practice++; m.set(r.teacherName, x) }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [recs])
  const printBook = () => printDoc(`SỔ MƯỢN TRẢ THIẾT BỊ – ${(d?.group || "").toUpperCase()}`, `${subject ? d?.subjects.find((s) => s.id === subject)?.name : "Tất cả môn của tổ"}`,
    ["STT", "Giáo viên", "Môn", "Lớp", "Ngày mượn", "Tiết", "Thiết bị", "Bài dạy", "Loại tiết", "Trạng thái", "Ký"],
    recs.filter((r) => r.status !== "Từ chối").map((r, i) => [i + 1, r.teacherName, r.subjectName || "", r.className, r.borrowDate, r.period || "", r.equipment, r.lessonName || "", r.usageType || "", r.status, ""]), true)
  if (!d) return <Main><p className="text-sm text-gray-500">{error || "Đang tải…"}</p></Main>
  const pending = recs.filter((r) => r.status === "Chờ duyệt")
  return (
    <Main>
      <Head kicker={`Trang tổ trưởng · ${user?.name}`} title={d.group || "Chưa được gán tổ"} right={<button onClick={printBook} className={btnGhost}>In sổ mượn trả của tổ</button>} />
      <Err msg={error} />
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setSubject("")} aria-pressed={!subject} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!subject ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700"}`}>Cả tổ</button>
        {d.subjects.map((s) => <button key={s.id} onClick={() => setSubject(s.id)} aria-pressed={subject === s.id} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${subject === s.id ? "bg-[#1a3670] text-white" : "bg-gray-100 text-gray-700"}`}>{s.name}</button>)}
      </div>
      <WeekGrid records={recs} />
      <div className="grid lg:grid-cols-2 gap-5">
        <section className={`${card} overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Sử dụng thiết bị theo giáo viên</h2></div>
          {byTeacher.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500">Chưa có lượt mượn</p> : (
            <table className="w-full text-sm"><thead><tr className="bg-gray-50">{["Giáo viên", "Lượt mượn", "Tiết thực hành"].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{byTeacher.map(([n, x]) => <tr key={n}><td className="px-3 py-2">{n}</td><td className="px-3 py-2 font-semibold">{x.n}</td><td className="px-3 py-2">{x.practice}</td></tr>)}</tbody></table>
          )}
        </section>
        <section className={`${card} overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Phiếu của tổ đang chờ duyệt ({pending.length})</h2></div>
          {pending.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500">Không có</p> : <ul className="divide-y divide-gray-50">{pending.map((r) => <li key={r.id} className="px-5 py-2.5 text-sm"><span className="font-medium">{r.teacherName}</span> · {r.className} · {r.borrowDate} {r.period}<div className="text-xs text-gray-500 truncate">{r.equipment}</div></li>)}</ul>}
        </section>
        <section className={`${card} overflow-hidden lg:col-span-2`}>
          <div className="px-5 py-3.5 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Đề xuất mua sắm của tổ</h2></div>
          {d.proposals.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500">Chưa có đề xuất</p> : (
            <table className="w-full text-sm"><thead><tr className="bg-gray-50">{["Người đề xuất", "Thiết bị", "Dự kiến", "Trạng thái", "Ý kiến của tổ"].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{d.proposals.map((p) => <tr key={p.id}><td className="px-3 py-2">{p.userName}</td><td className="px-3 py-2">{p.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</td><td className="px-3 py-2 whitespace-nowrap">{p.total.toLocaleString("vi-VN")} đ</td><td className="px-3 py-2 text-xs font-semibold">{p.status}</td><td className="px-3 py-2 text-xs">{(() => { const mine = (p.headReviews || []).find((x) => x.group === d.group); return mine ? <span><strong className={mine.opinion === "Đồng ý" ? "text-green-700" : "text-red-700"}>{mine.opinion}</strong>{mine.note ? ` – ${mine.note}` : ""}</span> : p.status === "Chờ duyệt" ? <span className="flex gap-1.5"><button onClick={() => review(p.id, "Đồng ý")} className="px-2 py-1 rounded-md bg-[#1a3670] text-white font-semibold">Đồng ý</button><button onClick={() => review(p.id, "Không đồng ý")} className="px-2 py-1 rounded-md bg-gray-100 font-semibold">Không đồng ý</button></span> : "—" })()}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>
    </Main>
  )
}

// ===================================================================
// QUẢN TRỊ HỆ THỐNG: NGƯỜI DÙNG VÀ PHÂN QUYỀN
// ===================================================================
export function UsersTab() {
  const { user: me } = useAuth()
  const [d, setD] = useState<{ users: AppUser[]; roles: Record<string, string>; groups: string[]; logs: RoleLog[]; testAccounts: boolean } | null>(null)
  const [q, setQ] = useState("")
  const [draft, setDraft] = useState<Record<string, { roles: string[]; group: string }>>({})
  const [nu, setNu] = useState<{ name: string; username: string; email: string; password: string; roles: string[]; group: string; test: boolean } | null>(null)
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const load = useCallback(() => { fetchUsers().then(setD).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const act = async (fn: () => Promise<unknown>, msg = "") => { setError(""); setOk(""); try { await fn(); setOk(msg); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } }
  if (!d) return <p className="text-sm text-gray-500">{error || "Đang tải…"}</p>
  const pending = d.users.filter((u) => u.status === "pending")
  const others = d.users.filter((u) => u.status !== "pending" && (!q || fold(`${u.name} ${u.email} ${u.username || ""}`).includes(fold(q))))
  const roleBoxes = (val: string[], set: (r: string[]) => void, idp: string) => (
    <div className="flex flex-wrap gap-1.5">{Object.entries(d.roles).map(([k, l]) => (
      <label key={k} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${val.includes(k) ? "border-[#1a3670] bg-[#1a3670]/5" : "border-gray-200"}`}><input type="checkbox" aria-label={`${l} ${idp}`} checked={val.includes(k)} onChange={(e) => set(e.target.checked ? [...val, k] : val.filter((x) => x !== k))} />{l}</label>
    ))}</div>
  )
  const groupSel = (val: string, set: (g: string) => void) => <select aria-label="Tổ chuyên môn" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" value={val} onChange={(e) => set(e.target.value)}><option value="">— Tổ —</option>{d.groups.map((g) => <option key={g}>{g}</option>)}</select>
  return (
    <div className="space-y-5">
      <Err msg={error} /><Ok msg={ok} />
      {d.testAccounts && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">Đang bật <strong>tài khoản thử nghiệm</strong> (biến TEST_ACCOUNTS=1). Xóa biến này trên Render khi đưa vào sử dụng thật: các tài khoản thử nghiệm sẽ không đăng nhập được nữa.</div>}
      <section className={`${card} overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Yêu cầu chờ duyệt ({pending.length})</h2></div>
        {pending.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500">Không có yêu cầu</p> : (
          <ul className="divide-y divide-gray-50">{pending.map((u) => {
            const dr = draft[u.id] || { roles: u.requestedRoles?.length ? u.requestedRoles : ["teacher"], group: u.requestedGroup || "" }
            return (
              <li key={u.id} className="px-5 py-3.5 space-y-2">
                <div className="flex flex-wrap justify-between gap-2"><div><div className="font-medium text-gray-900">{u.name}</div><div className="text-xs text-gray-500">{u.authType === "google" ? `Google · ${u.email}` : `Tên đăng nhập: ${u.username}${u.email ? ` · ${u.email}` : ""}`} · {vnTime(u.createdAt)}</div></div>
                  <div className="flex gap-2"><button onClick={() => { if (confirm(`Từ chối yêu cầu của ${u.name}?`)) act(() => rejectUser(u.id), "Đã từ chối") }} className={btnGhost}>Từ chối</button>
                    <button onClick={() => act(() => approveUser(u.id, dr.roles, dr.group), `Đã duyệt ${u.name}`)} className={btnPrimary}>Duyệt</button></div></div>
                <div className="flex flex-wrap items-center gap-2">{roleBoxes(dr.roles, (roles) => setDraft({ ...draft, [u.id]: { ...dr, roles } }), u.name)}{dr.roles.includes("head") && groupSel(dr.group, (group) => setDraft({ ...draft, [u.id]: { ...dr, group } }))}</div>
              </li>
            )
          })}</ul>
        )}
      </section>
      <section className={`${card} overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap gap-2 items-center justify-between">
          <h2 className="font-semibold text-gray-900">Người dùng ({others.length})</h2>
          <div className="flex gap-2"><input type="search" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" placeholder="Tìm tên, email…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button onClick={() => setNu({ name: "", username: "", email: "", password: "", roles: ["teacher"], group: "", test: false })} className={btnPrimary}>+ Tạo tài khoản</button></div>
        </div>
        {nu && (
          <div className="px-5 py-4 border-b border-gray-100 bg-[#F6F7F9] space-y-2">
            <div className="grid sm:grid-cols-4 gap-2">
              <input className={field} placeholder="Họ và tên" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
              <input className={field} placeholder="Tên đăng nhập" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value.toLowerCase() })} />
              <input className={field} placeholder="Email (không bắt buộc)" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
              <input className={field} placeholder="Mật khẩu (≥ 8 ký tự)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-2">{roleBoxes(nu.roles, (roles) => setNu({ ...nu, roles }), "tài khoản mới")}{nu.roles.includes("head") && groupSel(nu.group, (group) => setNu({ ...nu, group }))}
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={nu.test} onChange={(e) => setNu({ ...nu, test: e.target.checked })} />Tài khoản thử nghiệm</label></div>
            <div className="flex gap-2 justify-end"><button onClick={() => setNu(null)} className={btnGhost}>Hủy</button><button onClick={() => act(async () => { await createUser(nu); setNu(null) }, "Đã tạo tài khoản")} className={btnPrimary}>Tạo</button></div>
          </div>
        )}
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="bg-gray-50">{["Người dùng", "Đăng nhập", "Vai trò", "Tổ", "Trạng thái", ""].map((h) => <th key={h} className={th}>{h || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-50">{others.map((u) => (
            <tr key={u.id} className={u.status === "locked" ? "opacity-60" : ""}>
              <td className="px-3 py-2.5 min-w-[180px]"><div className="font-medium text-gray-900">{u.name}{u.test && <span className="ml-1 text-[10px] font-bold text-amber-700">THỬ NGHIỆM</span>}{u.id === me?.id && <span className="ml-1 text-[10px] text-gray-500">(bạn)</span>}</div><div className="text-xs text-gray-500">{u.email}</div></td>
              <td className="px-3 py-2.5 text-xs">{u.authType === "google" ? "Google" : `Mật khẩu · ${u.username}`}<div className="text-gray-500">{u.lastLoginAt ? `lần cuối ${vnTime(u.lastLoginAt)}` : "chưa đăng nhập"}</div></td>
              <td className="px-3 py-2.5 min-w-[440px]">{roleBoxes(u.roles, (roles) => act(() => updateUser(u.id, { roles }), "Đã cập nhật vai trò"), u.name)}</td>
              <td className="px-3 py-2.5">{u.roles.includes("head") ? groupSel(u.group || "", (group) => act(() => updateUser(u.id, { group }), "Đã cập nhật tổ")) : <span className="text-xs text-gray-300">—</span>}</td>
              <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${u.status === "active" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{u.status === "active" ? "Hoạt động" : "Đã khóa"}</span></td>
              <td className="px-3 py-2.5 whitespace-nowrap text-right">
                {u.authType === "password" && <button onClick={() => { const p = prompt(`Mật khẩu mới cho ${u.name} (≥ 8 ký tự):`, ""); if (p) act(() => resetUserPassword(u.id, p), "Đã đặt lại mật khẩu") }} className="text-xs font-semibold text-[#1a3670] hover:underline mr-3">Đặt lại mật khẩu</button>}
                <button onClick={() => act(() => updateUser(u.id, { status: u.status === "active" ? "locked" : "active" }), u.status === "active" ? "Đã khóa tài khoản" : "Đã mở khóa")} className="text-xs font-semibold text-gray-500 hover:text-red-600">{u.status === "active" ? "Khóa" : "Mở khóa"}</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className={`${card} overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Nhật ký phân quyền</h2></div>
        {d.logs.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500">Chưa có</p> : <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">{d.logs.map((l) => <li key={l.id} className="px-5 py-2 text-sm"><span className="text-xs text-gray-500 mr-2">{vnTime(l.createdAt)}</span><strong>{l.by}</strong> · {l.action} · {l.targetName}{l.detail ? ` – ${l.detail}` : ""}</li>)}</ul>}
      </section>
      <p className="text-xs text-gray-500">Vai trò: <span className={`px-1.5 rounded ${ROLE_CLS.sysadmin}`}>Quản trị hệ thống</span> quản lý tài khoản · <span className={`px-1.5 rounded ${ROLE_CLS.equipment}`}>Nhân viên thiết bị</span> nghiệp vụ phòng thiết bị · <span className={`px-1.5 rounded ${ROLE_CLS.principal}`}>Ban giám hiệu</span> xác nhận mất, duyệt mua sắm, kế hoạch · <span className={`px-1.5 rounded ${ROLE_CLS.head}`}>Tổ trưởng</span> theo dõi tổ · <span className={`px-1.5 rounded ${ROLE_CLS.teacher}`}>Giáo viên</span> đăng ký mượn. Email trong ADMIN_EMAILS luôn có quyền quản trị (tài khoản dự phòng).</p>
    </div>
  )
}
