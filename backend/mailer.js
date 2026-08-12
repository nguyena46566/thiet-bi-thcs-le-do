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

/**
 * Gửi email thông báo khi có đăng ký mới
 */
export async function sendBorrowNotification(record) {
  const transport = getTransporter();
  if (!transport) return;

  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (!notifyEmail) return;

  const statusText = record.status === "Mượn" ? "MƯỢN" : "TRẢ";
  const subject = `[Thiết bị] ${record.teacherName} - ${statusText} ${record.equipment}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a3670; color: white; padding: 20px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Thông báo đăng ký ${record.status === "Mượn" ? "mượn" : "trả"} thiết bị</h2>
        <p style="margin: 5px 0 0; opacity: 0.8; font-size: 13px;">Trường THCS Lê Độ</p>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #6b7280; width: 130px;">Giáo viên:</td><td style="padding: 8px 0; font-weight: bold;">${record.teacherName}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Lớp:</td><td style="padding: 8px 0;">${record.className}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Môn học:</td><td style="padding: 8px 0;">${record.subjectName}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Thiết bị:</td><td style="padding: 8px 0; font-weight: bold;">${record.equipment}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Số lượng:</td><td style="padding: 8px 0;">${record.quantity}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Ngày mượn:</td><td style="padding: 8px 0;">${record.borrowDate}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Ngày trả:</td><td style="padding: 8px 0;">${record.returnDate}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Trạng thái:</td><td style="padding: 8px 0;"><span style="background: ${record.status === "Mượn" ? "#dbeafe" : "#dcfce7"}; color: ${record.status === "Mượn" ? "#1d4ed8" : "#15803d"}; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 12px;">${record.status === "Mượn" ? "Đang mượn" : "Đã trả"}</span></td></tr>
          ${record.notes ? `<tr><td style="padding: 8px 0; color: #6b7280;">Ghi chú:</td><td style="padding: 8px 0;">${record.notes}</td></tr>` : ""}
        </table>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Thời gian đăng ký: ${new Date(record.createdAt).toLocaleString("vi-VN")}</p>
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
