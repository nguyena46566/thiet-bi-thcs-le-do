// Vận hành: trạng thái hệ thống, sao lưu – khôi phục, nhật ký đăng nhập, xuất dữ liệu CSDL ngành, minh chứng kiểm định
import { useCallback, useEffect, useRef, useState } from "react"
import {
  fetchSystemStatus, fetchBackups, downloadBackup, restoreBackup, fetchLoginLog, fetchRooms, fetchInventory, fetchMinlist, fetchLibStats,
  fetchAudits, fetchMaintenance, fetchDecisions, fetchStocktakes, fetchReadingPeriods, fetchDemoStatus, createDemoData, removeDemoData,
  type SystemStatus, type BackupEntry, type LoginEntry,
} from "@/api"
import { exportExcel } from "./Operations"

const card = "bg-white rounded-2xl shadow-sm border border-gray-100"
const btnPrimary = "px-4 py-2 rounded-lg bg-[#1a3670] hover:bg-[#132d5e] text-white text-sm font-semibold disabled:opacity-50"
const btnGhost = "px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50"
const th = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap"
const vnTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)
const Err = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)
const Ok = ({ msg }: { msg: string }) => (msg ? <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-3">{msg}</div> : null)
const TABLE_NAMES: Record<string, string> = {
  __records: "Phiếu mượn thiết bị", equipment: "Thiết bị", users: "Người dùng", minlist: "Danh mục tối thiểu", changelog: "Nhật ký thay đổi", audits: "Kiểm kê thiết bị",
  booktitles: "Đầu sách", bookcopies: "Bản sách", bookloans: "Lượt mượn sách", readers: "Bạn đọc", guests: "Khách vãng lai", __notifications: "Thông báo",
}

// ===================================================================
// TRẠNG THÁI HỆ THỐNG, SAO LƯU, KHÔI PHỤC
// ===================================================================
export function SystemTab() {
  const [s, setS] = useState<SystemStatus | null>(null)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [preview, setPreview] = useState<{ file: File; createdAt?: string; counts: Record<string, number>; current?: Record<string, number> } | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const load = useCallback(() => { fetchSystemStatus().then(setS).catch((e) => setError(e.message)); fetchBackups().then(setBackups).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  if (!s) return <p className="text-sm text-gray-400">{error || "Đang tải…"}</p>
  const act = async (fn: () => Promise<string>) => { setBusy(true); setError(""); setOk(""); try { setOk(await fn()); load() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) } }
  const passed = s.checks.filter((c) => c.ok).length
  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={ok} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([["Lưu trữ", s.storage], ["Sao lưu gần nhất", s.lastBackup ? vnTime(s.lastBackup.at) : "Chưa có"], ["Đăng nhập 24 giờ", `${s.logins24h.ok} thành công · ${s.logins24h.failed} lỗi`], ["Máy chủ đã chạy", `${s.uptimeMinutes} phút · Node ${s.node}`]] as const).map(([l, v]) => (
          <div key={l} className={`${card} px-4 py-3`}><div className="text-xs text-gray-500">{l}</div><div className="font-semibold text-gray-900">{v}</div></div>
        ))}
      </div>
      <DemoPanel onChange={load} />
      <div className={`${card} p-5`}>
        <h3 className="font-bold text-gray-900 mb-1">Kiểm tra trước khi vận hành chính thức ({passed}/{s.checks.length})</h3>
        <ul className="grid md:grid-cols-2 gap-x-6 gap-y-1.5 mt-3 text-sm">{s.checks.map((c) => <li key={c.label} className="flex gap-2"><span aria-hidden="true" className={c.ok ? "text-green-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span><span className={c.ok ? "text-gray-700" : "text-gray-900 font-medium"}>{c.label}</span><span className="sr-only">{c.ok ? "đạt" : "chưa đạt"}</span></li>)}</ul>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className={`${card} p-5`}>
          <h3 className="font-bold text-gray-900 mb-1">Sao lưu</h3>
          <p className="text-sm text-gray-600 mb-3">{s.backupEncrypted ? "Bản sao lưu được nén và mã hóa bằng BACKUP_KEY." : "Chưa đặt BACKUP_KEY: bản tải về chỉ nén, KHÔNG mã hóa (có mật khẩu đã mã hóa và họ tên người dùng) – cất giữ cẩn thận, không gửi qua mạng xã hội."} Sao lưu tự động hằng đêm do GitHub Actions thực hiện (tệp <code>.github/workflows/sao-luu.yml</code>), giữ 30 ngày.</p>
          <button disabled={busy} onClick={() => act(async () => `Đã tải ${await downloadBackup()}`)} className={btnPrimary}>Tải bản sao lưu ngay</button>
          {backups.length > 0 && <ul className="mt-4 divide-y divide-gray-100 text-sm max-h-60 overflow-y-auto">{backups.map((b) => <li key={b.id} className="py-1.5 flex justify-between gap-2"><span>{vnTime(b.at)} · {b.kind} · {b.by}</span><span className="text-xs text-gray-500">{kb(b.size)}{b.encrypted ? " · mã hóa" : ""}</span></li>)}</ul>}
        </div>
        <div className={`${card} p-5`}>
          <h3 className="font-bold text-gray-900 mb-1">Khôi phục từ bản sao lưu</h3>
          <p className="text-sm text-gray-600 mb-3">Thay <strong>toàn bộ</strong> dữ liệu hiện tại bằng dữ liệu trong bản sao lưu. Hãy tải một bản sao lưu hiện tại trước. Nếu lỗi giữa chừng, hệ thống tự quay lại dữ liệu cũ.</p>
          <input ref={fileRef} type="file" accept=".tbk,.gz" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) act(async () => { const r = await restoreBackup(f, true); setPreview({ file: f, ...r }); setConfirmText(""); return "Đã đọc bản sao lưu – kiểm tra số liệu trước khi khôi phục" }) }} />
          <button disabled={busy} onClick={() => fileRef.current?.click()} className={btnGhost}>Chọn tệp sao lưu…</button>
          {preview && (
            <div className="mt-4">
              <p className="text-sm">Bản sao lưu lúc <strong>{vnTime(preview.createdAt)}</strong> ({preview.file.name})</p>
              <table className="w-full text-sm mt-2"><thead><tr className="bg-gray-50">{["Dữ liệu", "Hiện tại", "Trong bản sao lưu"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">{Object.keys(TABLE_NAMES).map((k) => <tr key={k}><td className="px-3 py-1.5">{TABLE_NAMES[k]}</td><td className="px-3 py-1.5">{preview.current?.[k] ?? 0}</td><td className={`px-3 py-1.5 font-semibold ${(preview.counts[k] ?? 0) < (preview.current?.[k] ?? 0) ? "text-red-700" : ""}`}>{preview.counts[k] ?? 0}</td></tr>)}</tbody></table>
              <label className="block text-xs font-semibold text-gray-600 mt-3 mb-1" htmlFor="rs-confirm">Gõ <code>KHOI-PHUC</code> để xác nhận</label>
              <div className="flex gap-2"><input id="rs-confirm" className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                <button disabled={busy || confirmText !== "KHOI-PHUC"} onClick={() => act(async () => { const r = await restoreBackup(preview.file, false); setPreview(null); return `Đã khôi phục dữ liệu từ bản ${vnTime(r.restoredFrom)}. Người dùng nên tải lại trang.` })} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50">Khôi phục</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===================================================================
// NHẬT KÝ ĐĂNG NHẬP
// ===================================================================
export function LoginLogTab() {
  const [list, setList] = useState<LoginEntry[] | null>(null)
  const [q, setQ] = useState(""), [result, setResult] = useState("")
  const [error, setError] = useState("")
  useEffect(() => { const t = setTimeout(() => fetchLoginLog(q, result).then(setList).catch((e) => setError(e.message)), 250); return () => clearTimeout(t) }, [q, result])
  return (
    <div className="space-y-4">
      <Err msg={error} />
      <div className={`${card} p-4 flex flex-wrap gap-2 items-center`}>
        <input type="search" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Tìm tên, email, IP…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Kết quả" className="border border-gray-200 rounded-lg px-2 py-2 text-sm" value={result} onChange={(e) => setResult(e.target.value)}><option value="">Mọi kết quả</option>{["Thành công", "Sai mật khẩu", "Không có tài khoản", "Tạm khóa do sai nhiều lần", "Chờ duyệt", "Tài khoản bị khóa", "Tài khoản thử nghiệm đã tắt"].map((r) => <option key={r}>{r}</option>)}</select>
        <button disabled={!list?.length} onClick={() => list && exportExcel("Nhat-ky-dang-nhap.xlsx", [{ name: "Đăng nhập", rows: list.map((x) => ({ "Thời gian": vnTime(x.at), "Người dùng": x.name || x.username || x.email || "", "Cách": x.method, "Kết quả": x.result, "IP": x.ip, "Thiết bị": x.ua || "" })) }])} className={`${btnGhost} ml-auto`}>Xuất Excel</button>
      </div>
      <div className={`${card} overflow-hidden`}>
        {!list ? <p className="p-6 text-sm text-gray-400">Đang tải…</p> : list.length === 0 ? <p className="p-6 text-sm text-gray-400">Không có</p> : (
          <div className="overflow-x-auto max-h-[36rem]"><table className="w-full text-sm"><thead className="sticky top-0"><tr className="bg-gray-50">{["Thời gian", "Người dùng", "Cách", "Kết quả", "IP"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{list.map((x) => <tr key={x.id} className={x.result !== "Thành công" ? "bg-red-50/40" : ""}><td className="px-3 py-1.5 text-xs whitespace-nowrap">{vnTime(x.at)}</td><td className="px-3 py-1.5">{x.name || x.username || x.email}</td><td className="px-3 py-1.5 text-xs">{x.method}</td><td className={`px-3 py-1.5 text-xs font-semibold ${x.result === "Thành công" ? "text-green-700" : "text-red-700"}`}>{x.result}</td><td className="px-3 py-1.5 text-xs font-mono">{x.ip}</td></tr>)}</tbody></table></div>
        )}
      </div>
      <p className="text-xs text-gray-500">Nhật ký đăng nhập lưu 180 ngày rồi tự xóa. Nhiều lần “Sai mật khẩu” liên tiếp từ cùng một IP là dấu hiệu dò mật khẩu: khóa tài khoản liên quan và yêu cầu đổi mật khẩu.</p>
    </div>
  )
}

// ===================================================================
// XUẤT DỮ LIỆU CSVC – TBDH (cập nhật cơ sở dữ liệu ngành)
// ===================================================================
export function CsdlExportTab({ subjects }: { subjects: { id: string; name: string }[] }) {
  const [error, setError] = useState(""), [ok, setOk] = useState(""), [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true); setError(""); setOk("")
    try {
      const [rooms, inv, ml, lib] = await Promise.all([fetchRooms(), fetchInventory(), fetchMinlist(), fetchLibStats().catch(() => null)])
      const sName = (id: string) => subjects.find((s) => s.id === id)?.name || id
      const bySubject = subjects.map((s) => { const l = inv.filter((e) => e.subjectId === s.id); return { "Môn": s.name, "Số loại thiết bị": l.length, "Số lượng tốt": l.reduce((a, e) => a + e.qtyGood, 0), "Hỏng / đang sửa": l.reduce((a, e) => a + e.qtyBroken + e.qtyRepair, 0), "Mất": l.reduce((a, e) => a + e.qtyLost, 0), "Giá trị (đ)": l.reduce((a, e) => a + (e.qtyGood + e.qtyBroken + e.qtyRepair) * (e.unitPrice || 0), 0) } })
      const minBy = ml.subjects.map((m) => { const it = ml.items.filter((i) => i.mon === m); return { "Môn (TT 38/2021)": m, "Số dòng danh mục": it.length, "Đủ": it.filter((i) => i.status === "Đủ").length, "Thiếu": it.filter((i) => i.status === "Thiếu").length, "Chưa có": it.filter((i) => i.status === "Chưa có").length, "Chưa liên kết / khai báo": it.filter((i) => i.status === "Chưa liên kết" || i.status === "Chưa khai báo số GV").length, "Tỉ lệ đủ (%)": it.length ? Math.round((it.filter((i) => i.status === "Đủ").length / it.length) * 100) : 0 } }).filter((r) => r["Số dòng danh mục"])
      const sheets = [
        { name: "Phòng học bộ môn", rows: rooms.map((r) => ({ "Tên phòng": r.name, "Loại": r.kind, "Môn sử dụng": (r.subjectIds || []).map(sName).join(", ") || "Mọi môn", "Phòng ghép": (r.subjectIds || []).length > 1 ? "Có" : "Không", "Ghi chú": r.note })) },
        { name: "Thiết bị theo môn", rows: bySubject },
        { name: "Mức đáp ứng TT38", rows: minBy },
        ...(lib ? [{ name: "Thư viện", rows: [{ "Năm học": lib.schoolYear, "Đầu tài liệu": lib.collection.titles, "Bản đang lưu hành": lib.collection.copies, ...Object.fromEntries(Object.entries(lib.collection.byKind).map(([k, v]) => [`Bản ${k}`, v])), "Bạn đọc học sinh": lib.readers.students, "Bạn đọc giáo viên": lib.readers.teachers, "Tỉ lệ HS mượn sách (%)": lib.readers.studentPct, "Lượt lưu thông": lib.loans.total, "Tiết đọc đã tổ chức": lib.readingPeriods.done }] }] : []),
      ]
      await exportExcel(`Du-lieu-CSVC-TBDH-${new Date().toLocaleDateString("sv-SE")}.xlsx`, sheets)
      setOk("Đã xuất tệp Excel.")
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4 max-w-3xl">
      <Err msg={error} /><Ok msg={ok} />
      <div className={`${card} p-5`}>
        <h3 className="font-bold text-gray-900 mb-1">Dữ liệu cơ sở vật chất, thiết bị dạy học, thư viện</h3>
        <p className="text-sm text-gray-600 mb-3">Bảng tổng hợp để cán bộ phụ trách nhập vào cơ sở dữ liệu ngành giáo dục (Thông tư 42/2021/TT-BGDĐT) và báo cáo thống kê định kỳ. Website không kết nối trực tiếp với hệ thống của Bộ; biểu mẫu nhập liệu thực tế do Sở / Phòng GD&ĐT hướng dẫn, nên đối chiếu tên cột trước khi nhập.</p>
        <p className="text-sm text-gray-600 mb-4">Gồm 4 trang: phòng học bộ môn (có đánh dấu phòng ghép), thiết bị theo môn (số loại, số lượng tốt, hỏng, mất, giá trị), mức đáp ứng danh mục tối thiểu theo môn, số liệu thư viện.</p>
        <button disabled={busy} onClick={run} className={btnPrimary}>{busy ? "Đang tổng hợp…" : "Xuất tệp Excel"}</button>
      </div>
    </div>
  )
}

// ===================================================================
// MINH CHỨNG KIỂM ĐỊNH (Tiêu chuẩn 3 – Thông tư 18/2018, sửa đổi bởi Thông tư 22/2024)
// ===================================================================
export function EvidenceTab({ go }: { go: (section: string) => void }) {
  const [d, setD] = useState<Record<string, { have: boolean; text: string }> | null>(null)
  useEffect(() => {
    const t = new Date(), sy = t.getMonth() >= 8 ? t.getFullYear() : t.getFullYear() - 1, from = `${sy}-09-01`
    Promise.all([fetchMinlist().catch(() => null), fetchAudits().catch(() => []), fetchMaintenance().catch(() => []), fetchDecisions().catch(() => []), fetchLibStats().catch(() => null), fetchStocktakes().catch(() => []), fetchReadingPeriods().catch(() => null)])
      .then(([ml, au, mt, dc, lib, st, rp]) => {
        const items = ml?.items || [], okN = items.filter((i) => i.status === "Đủ").length
        const auY = au.filter((a) => a.status === "Hoàn tất" && (a.finishedAt || "") >= from)
        const toIso = (v: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : "" }
        const mtY = mt.filter((m) => toIso(m.date) >= from)
        const dcY = dc.filter((x) => x.type === "Tổ kiểm kê" && x.date >= from)
        const stY = st.filter((x) => x.status === "Hoàn tất" && (x.finishedAt || "") >= from)
        setD({
          minlist: { have: items.length > 0 && okN === items.length, text: items.length ? `${okN}/${items.length} dòng đủ (${Math.round((okN / items.length) * 100)}%)` : "Chưa có" },
          audit: { have: auY.length > 0, text: `${auY.length} đợt kiểm kê hoàn tất trong năm học` },
          decision: { have: dcY.length > 0, text: `${dcY.length} quyết định thành lập tổ kiểm kê` },
          repair: { have: mtY.length > 0, text: `${mtY.length} lượt bảo trì, sửa chữa` },
          libStats: { have: !!lib && lib.collection.copies > 0, text: lib ? `${lib.collection.copies} bản; ${lib.readers.studentPct}% HS, ${lib.readers.teacherPct}% GV đã mượn sách` : "Chưa có" },
          reading: { have: !!rp && rp.summary.length > 0 && rp.summary.every((s) => s.ok1 || s.ok2), text: rp ? `${rp.summary.filter((s) => s.ok1).length}/${rp.summary.length} lớp đủ tiết đọc HK I` : "Chưa có" },
          libStock: { have: stY.length > 0, text: `${stY.length} đợt kiểm kê kho sách` },
        })
      })
  }, [])
  const rows: [string, string, string, string, string][] = [
    ["3.5 b", "Có đủ thiết bị dạy học đáp ứng yêu cầu tối thiểu theo quy định", "Báo cáo mức đáp ứng danh mục tối thiểu (TT 38/2021, sửa đổi TT 26/2023); sổ phân định thiết bị", "minlist", "toi-thieu"],
    ["3.5 c", "Hằng năm các thiết bị được kiểm kê", "Quyết định thành lập tổ kiểm kê", "decision", "quyet-dinh"],
    ["3.5 c", "Hằng năm các thiết bị được kiểm kê", "Biên bản kiểm kê (Mẫu 6) kèm phụ lục", "audit", "kiem-ke"],
    ["3.5 c", "Hằng năm các thiết bị được sửa chữa", "Sổ theo dõi sửa chữa, biên bản kiểm tra hư hỏng", "repair", "bao-tri"],
    ["3.6", "Thư viện", "Báo cáo thống kê thư viện; sổ đăng ký tổng quát, cá biệt", "libStats", "thong-ke-thu-vien"],
    ["3.6", "Thư viện", "Sổ theo dõi tiết đọc thư viện (tối thiểu 3 tiết/học kỳ/lớp – TT 16/2022)", "reading", "tiet-doc"],
    ["3.6", "Thư viện", "Biên bản kiểm kê kho sách", "libStock", "kiem-ke-sach"],
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Tiêu chuẩn 3 – tiêu chí 3.5 (thiết bị) và 3.6 (thư viện). Mã minh chứng do Hội đồng tự đánh giá đánh số.</p>
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50">{["Tiêu chí", "Yêu cầu", "Minh chứng trên website", "Năm học này", "Mã minh chứng", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-50">{rows.map(([c, req, ev, k, sec], i) => (
            <tr key={i}><td className="px-3 py-2 font-semibold whitespace-nowrap">{c}</td><td className="px-3 py-2 text-xs text-gray-600 min-w-[180px]">{req}</td><td className="px-3 py-2 min-w-[220px]">{ev}</td>
              <td className={`px-3 py-2 text-xs font-semibold min-w-[160px] ${d?.[k]?.have ? "text-green-700" : "text-amber-700"}`}>{d ? `${d[k].have ? "✓" : "✗"} ${d[k].text}` : "…"}</td>
              <td className="px-3 py-2 text-xs text-gray-400">[……]</td><td className="px-3 py-2"><button onClick={() => go(sec)} className="text-xs font-semibold text-[#1a3670] hover:underline whitespace-nowrap">Mở để in</button></td></tr>
          ))}</tbody></table></div>
      </div>
    </div>
  )
}

/** Dữ liệu mẫu để chạy thử: chỉ hiện khi máy chủ bật TEST_ACCOUNTS=1 */
function DemoPanel({ onChange }: { onChange: () => void }) {
  const [st, setSt] = useState<{ active: boolean; at: string | null; summary: Record<string, number> | null } | null>(null)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(""), [ok, setOk] = useState("")
  const load = useCallback(() => { fetchDemoStatus().then(setSt).catch(() => setHidden(true)) }, [])
  useEffect(() => { load() }, [load])
  if (hidden || !st) return null
  const act = async (fn: () => Promise<string>) => { setBusy(true); setError(""); setOk(""); try { setOk(await fn()); load(); onChange() } catch (e) { setError(e instanceof Error ? e.message : "Lỗi") } finally { setBusy(false) } }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <h3 className="font-bold text-gray-900 mb-1">Dữ liệu mẫu để chạy thử</h3>
      <p className="text-sm text-gray-700 mb-3">Tạo dữ liệu đầy đủ cho mọi chức năng: 12 giáo viên (mật khẩu Test@2026), phiếu mượn từ đầu năm học (đã trả, đang mượn, quá hạn, chờ duyệt, từ chối, trả hỏng, báo mất), hóa chất sắp hết hạn và đã hết hạn, kiểm kê, bảo trì, ghi giảm, đề xuất mua sắm, kế hoạch năm học, quyết định, thư viện (19 đầu sách, 96 học sinh, lượt mượn, tiết đọc), khách vãng lai… Trước khi tạo, dữ liệu hiện tại được chụp lại; “Xóa dữ liệu mẫu” đưa web về đúng như cũ.</p>
      <Err msg={error} /><Ok msg={ok} />
      {st.active ? <>
        <p className="text-sm mb-2">Đang có dữ liệu mẫu (tạo lúc {vnTime(st.at)}).</p>
        {st.summary && <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-4 text-xs text-gray-700 mb-3">{Object.entries(st.summary).map(([k, v]) => <li key={k}>{k}: <strong>{v}</strong></li>)}</ul>}
        <button disabled={busy} onClick={() => { if (confirm("Xóa toàn bộ dữ liệu mẫu và đưa web về trạng thái trước khi tạo? Dữ liệu nhập thêm sau đó cũng bị xóa.")) act(async () => { await removeDemoData(); return "Đã xóa dữ liệu mẫu" }) }} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50">Xóa dữ liệu mẫu</button>
      </> : <button disabled={busy} onClick={() => act(async () => { const r = await createDemoData(); return `Đã tạo dữ liệu mẫu: ${Object.values(r.summary).reduce((a, b) => a + b, 0)} bản ghi` })} className={btnPrimary}>{busy ? "Đang tạo… (khoảng 1 phút)" : "Tạo dữ liệu mẫu"}</button>}
    </div>
  )
}
