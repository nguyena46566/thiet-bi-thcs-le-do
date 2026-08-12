/**
 * In-app Notification System
 * Lưu thông báo vào file JSON, admin xem trong trang quản lý
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const notiPath = path.join(dataDir, "notifications.json");

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(notiPath)) {
  fs.writeFileSync(notiPath, JSON.stringify([], null, 2), "utf-8");
}

function readNotifications() {
  try {
    return JSON.parse(fs.readFileSync(notiPath, "utf-8"));
  } catch {
    return [];
  }
}

function writeNotifications(notifications) {
  fs.writeFileSync(notiPath, JSON.stringify(notifications, null, 2), "utf-8");
}

/**
 * Tạo thông báo mới
 */
export function createNotification({ type, title, message, recordId, userId, userName }) {
  const notifications = readNotifications();
  const notification = {
    id: Date.now().toString(),
    type, // 'borrow', 'return', 'overdue', 'system'
    title,
    message,
    recordId: recordId || null,
    userId: userId || null,
    userName: userName || null,
    read: false,
    createdAt: new Date().toISOString(),
  };
  notifications.unshift(notification);

  // Giữ tối đa 200 thông báo
  if (notifications.length > 200) {
    notifications.splice(200);
  }

  writeNotifications(notifications);
  return notification;
}

/**
 * Lấy tất cả thông báo (cho admin)
 */
export function getNotifications({ limit = 50, unreadOnly = false } = {}) {
  let notifications = readNotifications();

  if (unreadOnly) {
    notifications = notifications.filter((n) => !n.read);
  }

  return notifications.slice(0, limit);
}

/**
 * Đếm thông báo chưa đọc
 */
export function getUnreadCount() {
  const notifications = readNotifications();
  return notifications.filter((n) => !n.read).length;
}

/**
 * Đánh dấu đã đọc
 */
export function markAsRead(notificationId) {
  const notifications = readNotifications();
  const index = notifications.findIndex((n) => n.id === notificationId);
  if (index !== -1) {
    notifications[index].read = true;
    writeNotifications(notifications);
    return notifications[index];
  }
  return null;
}

/**
 * Đánh dấu tất cả đã đọc
 */
export function markAllAsRead() {
  const notifications = readNotifications();
  notifications.forEach((n) => {
    n.read = true;
  });
  writeNotifications(notifications);
  return { updated: notifications.length };
}

/**
 * Xóa thông báo
 */
export function deleteNotification(notificationId) {
  const notifications = readNotifications();
  const index = notifications.findIndex((n) => n.id === notificationId);
  if (index !== -1) {
    notifications.splice(index, 1);
    writeNotifications(notifications);
    return true;
  }
  return false;
}

export default {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
