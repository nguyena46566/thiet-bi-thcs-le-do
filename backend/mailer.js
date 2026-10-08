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

export default { sendBorrowNotification };
