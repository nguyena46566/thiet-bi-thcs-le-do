/**
 * Email Notification Module
 * Gửi email thông báo cho admin khi có đăng ký mượn/trả mới
 */

import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("[Mailer] SMTP chưa được cấu hình - email sẽ không được gửi");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STATUS_STYLE = {
  "Chờ duyệt": { label: "Chờ duyệt", bg: "#fef3c7", fg: "#b45309" },
  "Mượn": { label: "Đang mượn", bg: "#dbeafe", fg: "#1d4ed8" },
  "Trả": { label: "Đã trả", bg: "#dcfce7", fg: "#15803d" },
  "Từ chối": { label: "Từ chối", bg: "#fee2e2", fg: "#b91c1c" },
};

/**
 * Gửi email cho admin khi có yêu cầu mượn mới (trạng thái "Chờ duyệt").
 */
export async function sendBorrowNotification(record) {
  const transport = getTransporter();
  if (!transport) return;

  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (!notifyEmail) return;

  const st = STATUS_STYLE[record.status] || STATUS_STYLE["Chờ duyệt"];
  // Tiêu đề email là văn bản thuần, chỉ cần bỏ xuống dòng
  const plain = (v, n) => String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, n);
  const subject = `[Thiết bị] Yêu cầu mượn mới: ${plain(record.teacherName, 60)} - ${plain(record.equipment, 80)}`;

  const row = (label, value, bold = false) =>
    `<tr><td style="padding: 8px 0; color: #6b7280; width: 130px;">${label}:</td><td style="padding: 8px 0;${bold ? " font-weight: bold;" : ""}">${value}</td></tr>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a3670; color: white; padding: 20px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Yêu cầu mượn thiết bị mới</h2>
        <p style="margin: 5px 0 0; opacity: 0.8; font-size: 13px;">Trường THCS Lê Độ - vào trang Quản trị để duyệt</p>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${row("Giáo viên", esc(record.teacherName), true)}
          ${row("Lớp", esc(record.className))}
          ${row("Môn học", esc(record.subjectName))}
          ${row("Thiết bị", esc(record.equipment), true)}
          ${row("Số lượng", esc(record.quantity))}
          ${row("Ngày mượn", esc(record.borrowDate) + (record.period ? ` (${esc(record.period)})` : ""))}
          ${row("Ngày trả", esc(record.returnDate))}
          ${record.periodPPCT ? row("Tiết PPCT", esc(record.periodPPCT)) : ""}
          ${row("Trạng thái", `<span style="background: ${st.bg}; color: ${st.fg}; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 12px;">${st.label}</span>`)}
          ${record.notes ? row("Ghi chú", esc(record.notes)) : ""}
        </table>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Thời gian đăng ký: ${new Date(record.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
      </div>
    </div>
  `;

  try {
    await transport.sendMail({
      from: `"Hệ thống Thiết bị THCS Lê Độ" <${process.env.SMTP_USER}>`,
      to: notifyEmail,
      subject,
      html,
    });
    console.log(`[Mailer] Đã gửi email thông báo đến ${notifyEmail}`);
  } catch (err) {
    console.error("[Mailer] Lỗi gửi email:", err.message);
  }
}

/**
 * Gửi email cho giáo viên khi phiếu được duyệt hoặc bị từ chối.
 */
export async function sendStatusEmail(record, status, reason) {
  const transport = getTransporter();
  if (!transport || !record.userEmail) return;
  const approved = status === "Mượn";
  const st = STATUS_STYLE[status];
  const plain = (v, n) => String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, n);
  const subject = `[Thiết bị] ${approved ? "Đã duyệt" : "Từ chối"} yêu cầu mượn: ${plain(record.equipment, 80)}`;
  const row = (label, value) =>
    `<tr><td style="padding: 6px 0; color: #6b7280; width: 130px;">${label}:</td><td style="padding: 6px 0;">${value}</td></tr>`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${approved ? "#1a3670" : "#991b1b"}; color: white; padding: 20px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${approved ? "Yêu cầu mượn đã được duyệt" : "Yêu cầu mượn bị từ chối"}</h2>
        <p style="margin: 5px 0 0; opacity: 0.85; font-size: 13px;">Trường THCS Lê Độ - Hệ thống quản lý thiết bị</p>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 12px; font-size: 14px;">Chào ${esc(record.teacherName)},</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${row("Thiết bị", `<b>${esc(record.equipment)}</b>`)}
          ${row("Lớp", esc(record.className))}
          ${row("Ngày mượn", esc(record.borrowDate) + (record.period ? ` (${esc(record.period)})` : ""))}
          ${row("Ngày trả", esc(record.returnDate))}
          ${row("Trạng thái", `<span style="background: ${st.bg}; color: ${st.fg}; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 12px;">${st.label}</span>`)}
          ${reason ? row("Lý do", esc(reason)) : ""}
        </table>
        <p style="font-size: 13px; color: #374151; margin: 16px 0 0;">${approved ? "Thầy/cô vui lòng đến phòng thiết bị nhận đồ dùng trước giờ dạy và trả đúng hạn." : "Thầy/cô có thể đăng ký lại với ngày hoặc thiết bị khác trên website."}</p>
      </div>
    </div>`;
  try {
    await transport.sendMail({ from: `"Hệ thống Thiết bị THCS Lê Độ" <${process.env.SMTP_USER}>`, to: record.userEmail, subject, html });
    console.log(`[Mailer] Đã gửi email trạng thái đến ${record.userEmail}`);
  } catch (err) {
    console.error("[Mailer] Lỗi gửi email:", err.message);
  }
}

/**
 * Nhắc giáo viên trả thiết bị: kind = "due" (hạn trả là ngày mai) | "overdue" (đã quá hạn)
 */
export async function sendReminderEmail(record, kind, lateDays = 0) {
  const transport = getTransporter();
  if (!transport || !record.userEmail) return false;
  const due = kind === "due";
  const subject = due
    ? `[Thiết bị] Nhắc trả thiết bị ngày mai: ${String(record.equipment).slice(0, 80)}`
    : `[Thiết bị] Quá hạn trả ${lateDays} ngày: ${String(record.equipment).slice(0, 80)}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${due ? "#1a3670" : "#9f1239"}; color: white; padding: 20px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${due ? "Nhắc hạn trả thiết bị" : "Thiết bị đã quá hạn trả"}</h2>
        <p style="margin: 5px 0 0; opacity: 0.85; font-size: 13px;">Trường THCS Lê Độ - Hệ thống quản lý thiết bị</p>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; font-size: 14px;">
        <p style="margin: 0 0 12px;">Chào ${esc(record.teacherName)},</p>
        <p style="margin: 0 0 12px;">${due ? "Thầy/cô có thiết bị cần trả vào <b>ngày mai</b>" : `Thầy/cô đang giữ thiết bị đã <b>quá hạn ${lateDays} ngày</b>`}:</p>
        <p style="margin: 0 0 4px;"><b>${esc(record.equipment)}</b></p>
        <p style="margin: 0 0 12px; color: #6b7280;">Lớp ${esc(record.className)} · mượn ${esc(record.borrowDate)} · hạn trả ${esc(record.returnDate)}</p>
        <p style="margin: 0; color: #374151;">${due ? "Vui lòng mang trả phòng thiết bị đúng hạn. Nếu cần gia hạn, hãy báo trước cho phòng thiết bị." : "Theo quy chế, trả trễ từ lần thứ 2 trong năm học sẽ bị trừ điểm thi đua. Vui lòng trả thiết bị sớm."}</p>
      </div>
    </div>`;
  try {
    await transport.sendMail({ from: `"Hệ thống Thiết bị THCS Lê Độ" <${process.env.SMTP_USER}>`, to: record.userEmail, subject, html });
    return true;
  } catch (err) {
    console.error("[Mailer] Lỗi gửi email nhắc:", err.message);
    return false;
  }
}

/** Gửi một email HTML bất kỳ (dùng cho email xác nhận của Ban giám hiệu) */
export async function sendHtmlEmail(to, subject, html) {
  const transport = getTransporter();
  if (!transport || !to) return false;
  try {
    await transport.sendMail({ from: `"Hệ thống Thiết bị THCS Lê Độ" <${process.env.SMTP_USER}>`, to, subject: String(subject).replace(/[\r\n]+/g, " "), html });
    console.log(`[Mailer] Đã gửi email đến ${to}`);
    return true;
  } catch (err) {
    console.error("[Mailer] Lỗi gửi email:", err.message);
    return false;
  }
}

export default { sendBorrowNotification, sendStatusEmail, sendReminderEmail, sendHtmlEmail };
