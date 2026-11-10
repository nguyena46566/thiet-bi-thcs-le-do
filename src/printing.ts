// In văn bản hành chính (biên bản, quyết định, kế hoạch, báo cáo) theo thể thức chung của nhà trường
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
export const dots = (n: number) => `<div class="lines">${"<div></div>".repeat(n)}</div>`
export const para = (s: string) => (s ? s.split(/\n+/).map((l) => `<p>${esc(l)}</p>`).join("") : "")
export const vnDate = (d = new Date()) => `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`
export const table = (head: string[], rows: (string | number)[][]) =>
  `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td${typeof c === "number" ? ' class="n"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${head.length}" class="c">Không có dữ liệu</td></tr>`}</table>`

/**
 * Mở cửa sổ in. number: số văn bản (VD "12/QĐ-THCSLĐ"); signs: các khối chữ ký [chức danh, ghi chú].
 */
export function printHtml(opts: { title: string; subtitle?: string; number?: string; body: string; signs?: [string, string][]; landscape?: boolean; place?: string }) {
  const w = window.open("", "_blank")
  if (!w) { alert("Trình duyệt chặn cửa sổ mới. Hãy cho phép pop-up để in."); return }
  const signs = opts.signs || [["Người lập", "(Ký, ghi rõ họ tên)"], ["Hiệu trưởng", "(Ký, đóng dấu)"]]
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
    @page{size:A4 ${opts.landscape ? "landscape" : "portrait"};margin:16mm 15mm}
    body{font-family:"Times New Roman",serif;font-size:13.5px;color:#000;margin:0;line-height:1.45}
    .hd{display:flex;justify-content:space-between;text-align:center}.hd div{width:48%}.hd b{display:block}.hd .no{margin-top:6px}
    .place{text-align:right;font-style:italic;margin:8px 0 0}
    h1{text-align:center;font-size:17px;margin:14px 0 2px;text-transform:uppercase}.sub{text-align:center;font-weight:bold;margin-bottom:10px}
    h2{font-size:13.5px;margin:12px 0 4px}p{margin:3px 0;text-align:justify}
    table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #000;padding:3px 5px;vertical-align:top;font-size:12.5px}th{background:#eee}td.n,td.c{text-align:center}
    .lines div{border-bottom:1px dotted #000;height:7mm}
    .sign{display:flex;justify-content:space-around;margin-top:22px;text-align:center;page-break-inside:avoid}.sign div{flex:1}.sign i{display:block;font-size:12px}
    .bar{margin:8px 0}@media print{.bar{display:none}}</style></head><body>
    <div class="bar"><button onclick="window.print()">In</button></div>
    <div class="hd"><div>PHÒNG GIÁO DỤC VÀ ĐÀO TẠO<b>TRƯỜNG THCS LÊ ĐỘ</b>${opts.number ? `<div class="no">Số: ${esc(opts.number)}</div>` : ""}</div><div><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><b>Độc lập – Tự do – Hạnh phúc</b></div></div>
    <p class="place">${esc(opts.place || "…………")}, ${vnDate()}</p>
    <h1>${esc(opts.title)}</h1>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ""}
    ${opts.body}
    <div class="sign">${signs.map(([a, b]) => `<div><b>${esc(a)}</b><i>${esc(b)}</i></div>`).join("")}</div>
    </body></html>`)
  w.document.close()
}
