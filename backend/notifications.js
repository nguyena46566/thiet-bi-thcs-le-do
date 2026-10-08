/**
 * Thông báo trong trang quản trị (lưu qua database.js)
 */
import db, { newId } from "./database.js";

export async function createNotification({ type, title, message, recordId, userId, userName }) {
  return db.notifications.create({
    id: newId(),
    type, // 'borrow' | 'return' | 'overdue' | 'system'
    title,
    message,
    recordId: recordId || null,
    userId: userId || null,
    userName: userName || null,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export const getNotifications = (opts) => db.notifications.list(opts);
export const getUnreadCount = () => db.notifications.unreadCount();
export const markAsRead = (id) => db.notifications.markRead(id);
export const markAllAsRead = () => db.notifications.markAllRead();
export const deleteNotification = (id) => db.notifications.remove(id);

export default { createNotification, getNotifications, getUnreadCount, markAsRead, markAllAsRead, deleteNotification };
