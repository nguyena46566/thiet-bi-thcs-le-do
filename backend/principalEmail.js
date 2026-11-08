/**
 * Ban giám hiệu xác nhận qua email, không cần đăng nhập:
 *  - Khi có báo mất thiết bị hoặc đề xuất mua sắm, hệ thống gửi email đến PRINCIPAL_EMAILS
 *    kèm 2 nút (Xác nhận / Không). Mỗi nút là một đường dẫn có mã bí mật dùng một lần.
 *  - Bấm nút mở trang xác nhận (GET chỉ hiển thị, không thay đổi gì: tránh việc trình quét
 *    thư tự mở link làm xác nhận nhầm); bấm "Xác nhận" trên trang đó (POST) mới ghi nhận.
 */
import crypto from "crypto";
import express from "express";
import db from "./database.js";
import { sendHtmlEmail } from "./mailer.js";

const TOKEN_DAYS = 14;
const emailList = () => (process.env.PRINCIPAL_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => `${(Number(n) || 0).toLocaleString("vi-VN")} đ`;

/** Địa chỉ công khai của web: APP_URL, hoặc lấy từ GOOGLE_REDIRECT_URI (cùng tên miền) */
export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  try { return new URL(process.env.GOOGLE_REDIRECT_URI).origin; } catch { return "http://localhost:3001"; }
}

export const newEmailToken = () => ({ emailToken: crypto.randomBytes(24).toString("hex"), emailTokenExpires: new Date(Date.now() + TOKEN_DAYS * 864e5).toISOString() });

const button = (href, label, color) =>
  `<a href="${href}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;margin:4px 8px 4px 0">${label}</a>`;

function layout(title, rows, actions, note) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1a3670;color:#fff;padding:20px;border-radius:12px 12px 0 0"><h2 style="margin:0;font-size:18px">${title}</h2>
    <p style="margin:6px 0 0;opacity:.85;font-size:13px">Trường THCS Lê Độ – Hệ thống quản lý thiết bị</p></div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:22px;border-radius:0 0 12px 12px;font-size:14px">
      <table style="width:100%;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b7280;width:150px;vertical-align:top">${k}</td><td style="padding:6px 0">${v}</td></tr>`).join("")}</table>
      <div style="margin:18px 0 6px">${actions}</div>
      <p style="font-size:12px;color:#6b7280;margin:12px 0 0">${note}</p>
    </div></div>`;
}

/** Gửi email xác nhận mất thiết bị cho Ban giám hiệu */
export async function emailLossReport(lr) {
  const to = emailList();
  if (!to.length || !lr.emailToken) return false;
  const base = `${appUrl()}/api/email-action/${lr.emailToken}`;
  const source = lr.source === "audit" ? `Kiểm kê: ${esc(lr.auditTitle || "")}` : `Phiếu mượn của ${esc(lr.teacherName || "")}`;
  const html = layout(`Cần xác nhận thiết bị bị mất`, [
    ["Thiết bị", `<b>${esc(lr.name)}</b> × ${esc(lr.quantity)}`],
    ["Giá trị", money((lr.unitPrice || 0) * lr.quantity)],
    ["Nguồn báo", source],
    ["Người báo", esc(lr.reportedBy || "")],
    ...(lr.note ? [["Ghi chú", esc(lr.note)]] : []),
  ], button(`${base}?a=confirm`, "Xác nhận mất", "#b91c1c") + button(`${base}?a=reject`, "Không mất (đã tìm thấy)", "#15803d"),
  `Bấm một nút sẽ mở trang để thầy/cô kiểm tra lại và bấm xác nhận lần cuối. Đường dẫn chỉ dùng được một lần, hết hạn sau ${TOKEN_DAYS} ngày. Xác nhận mất sẽ ghi vào sổ “mất” và trừ điểm thi đua của giáo viên theo quy chế.`);
  return sendHtmlEmail(to.join(","), `[Thiết bị] Cần xác nhận mất: ${String(lr.name).slice(0, 60)} × ${lr.quantity}`, html);
}

/** Gửi email duyệt đề xuất mua sắm cho Ban giám hiệu */
export async function emailProposal(p) {
  const to = emailList();
  if (!to.length || !p.emailToken) return false;
  const base = `${appUrl()}/api/email-action/${p.emailToken}`;
  const items = p.items.map((it) => `${esc(it.name)} × ${it.quantity}${it.estPrice ? ` (${money(it.estPrice)})` : ""}${it.reason ? ` – ${esc(it.reason)}` : ""}`).join("<br>");
  const html = layout(`Đề xuất mua sắm thiết bị cần duyệt`, [
    ["Người đề xuất", esc(p.userName)], ["Mục đích", esc(p.purpose || "")], ["Thiết bị", items], ["Tổng dự kiến", `<b>${money(p.total)}</b>`],
  ], button(`${base}?a=approve`, "Duyệt", "#1a3670") + button(`${base}?a=deny`, "Không duyệt", "#6b7280"),
  `Bấm một nút sẽ mở trang để thầy/cô ghi ý kiến (nếu cần) và bấm xác nhận lần cuối. Đường dẫn chỉ dùng được một lần, hết hạn sau ${TOKEN_DAYS} ngày.`);
  return sendHtmlEmail(to.join(","), `[Thiết bị] Đề xuất mua sắm cần duyệt – ${String(p.userName).slice(0, 40)}`, html);
}

// ---------------------------------------------------------------------------
function page(title, body) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
  <style>body{font-family:Arial,sans-serif;background:#F6F7F9;margin:0;padding:24px;color:#1F2937}.c{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px}
  h1{font-size:20px;margin:0 0 12px;color:#1a3670}td{padding:6px 0;vertical-align:top}td:first-child{color:#6b7280;width:140px}textarea{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:10px;padding:10px;font:inherit}
  button{border:0;border-radius:10px;padding:12px 20px;font-weight:bold;color:#fff;font-size:15px;cursor:pointer;margin-top:12px}.muted{color:#6b7280;font-size:13px}a{color:#1a3670}</style></head>
  <body><div class="c">${body}</div></body></html>`;
}

async function findByToken(token) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  for (const [kind, col] of [["loss", "lossreports"], ["proposal", "proposals"]]) {
    const doc = (await db.collection(col).all()).find((x) => x.emailToken === token);
    if (doc) return { kind, doc };
  }
  return null;
}

const ACTIONS = {
  loss: { confirm: ["Xác nhận mất", "#b91c1c"], reject: ["Không mất (đã tìm thấy)", "#15803d"] },
  proposal: { approve: ["Duyệt đề xuất", "#1a3670"], deny: ["Không duyệt", "#6b7280"] },
};

/**
 * @param handlers { confirmLoss(id, user, note), rejectLoss(id, user, note), decideProposal(id, approve, note, user) }
 */
export function registerEmailActionRoutes(app, { wrap, handlers }) {
  const get = async (token) => {
    const f = await findByToken(token);
    if (!f) return { error: "Đường dẫn không hợp lệ hoặc đã được dùng." };
    if (new Date(f.doc.emailTokenExpires) < new Date()) return { error: "Đường dẫn đã hết hạn. Vui lòng xác nhận trong trang quản trị." };
    const pending = f.kind === "loss" ? f.doc.status === "Chờ xác nhận" : f.doc.status === "Chờ duyệt";
    if (!pending) return { error: `Mục này đã được xử lý: ${f.doc.status}${f.doc.decidedBy ? ` (bởi ${f.doc.decidedBy})` : ""}.` };
    return f;
  };
  const describe = (f) => f.kind === "loss"
    ? `<table><tr><td>Thiết bị</td><td><b>${esc(f.doc.name)}</b> × ${esc(f.doc.quantity)}</td></tr><tr><td>Nguồn báo</td><td>${f.doc.source === "audit" ? `Kiểm kê: ${esc(f.doc.auditTitle || "")}` : `Phiếu mượn của ${esc(f.doc.teacherName || "")}`}</td></tr><tr><td>Người báo</td><td>${esc(f.doc.reportedBy || "")}</td></tr></table>`
    : `<table><tr><td>Người đề xuất</td><td>${esc(f.doc.userName)}</td></tr><tr><td>Thiết bị</td><td>${f.doc.items.map((it) => `${esc(it.name)} × ${it.quantity}`).join("<br>")}</td></tr><tr><td>Tổng dự kiến</td><td><b>${money(f.doc.total)}</b></td></tr></table>`;

  // Trang xác nhận: chỉ hiển thị
  app.get("/api/email-action/:token", wrap(async (req, res) => {
    const f = await get(req.params.token);
    if (f.error) return res.status(410).send(page("Không thực hiện được", `<h1>Không thực hiện được</h1><p>${esc(f.error)}</p><p class="muted"><a href="${appUrl()}/#admin">Mở trang quản trị</a></p>`));
    const acts = ACTIONS[f.kind];
    const chosen = acts[req.query.a] ? req.query.a : Object.keys(acts)[0];
    res.send(page("Xác nhận của Ban giám hiệu", `<h1>${f.kind === "loss" ? "Xác nhận thiết bị bị mất" : "Duyệt đề xuất mua sắm"}</h1>${describe(f)}
      <form method="post"><input type="hidden" name="a" value="${chosen}">
        <p><label class="muted" for="note">Ý kiến của Ban giám hiệu (không bắt buộc)</label><br><textarea id="note" name="note" rows="3" maxlength="300"></textarea></p>
        <button type="submit" style="background:${acts[chosen][1]}">${acts[chosen][0]}</button></form>
      <p class="muted">Chọn nhầm? ${Object.entries(acts).filter(([k]) => k !== chosen).map(([k, [l]]) => `<a href="?a=${k}">${l}</a>`).join(" · ")}</p>`));
  }));

  // Ghi nhận khi bấm nút trên trang
  app.post("/api/email-action/:token", express.urlencoded({ extended: false, limit: "10kb" }), wrap(async (req, res) => {
    const f = await get(req.params.token);
    if (f.error) return res.status(410).send(page("Không thực hiện được", `<h1>Không thực hiện được</h1><p>${esc(f.error)}</p>`));
    const a = req.body?.a, note = String(req.body?.note || "").slice(0, 300);
    if (!ACTIONS[f.kind][a]) return res.status(400).send(page("Lỗi", "<h1>Thao tác không hợp lệ</h1>"));
    const by = { name: `Ban giám hiệu (qua email ${emailList()[0] || ""})`, isAdmin: true, isPrincipal: true };
    const r = f.kind === "loss"
      ? await (a === "confirm" ? handlers.confirmLoss : handlers.rejectLoss)(f.doc.id, by, note)
      : await handlers.decideProposal(f.doc.id, a === "approve", note, by);
    if (r?.error) return res.status(r.status || 400).send(page("Không thực hiện được", `<h1>Không thực hiện được</h1><p>${esc(r.error)}</p>`));
    await db.collection(f.kind === "loss" ? "lossreports" : "proposals").update(f.doc.id, { emailToken: null, decidedVia: "email" });
    res.send(page("Đã ghi nhận", `<h1>Đã ghi nhận</h1><p>${esc(ACTIONS[f.kind][a][0])}: ${f.kind === "loss" ? `${esc(f.doc.name)} × ${esc(f.doc.quantity)}` : `đề xuất của ${esc(f.doc.userName)}`}.</p><p class="muted">Có thể đóng trang này. Kết quả đã cập nhật trên hệ thống.</p>`));
  }));
}
