const API_BASE = import.meta.env.VITE_API_URL || "";

// ============ TYPES ============

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  isAdmin: boolean;
}

export interface BorrowRecord {
  id: string;
  subjectId: string;
  subjectName: string;
  teacherName: string;
  className: string;
  equipment: string;
  quantity: number;
  borrowDate: string;
  returnDate: string;
  notes: string;
  status: "Mượn" | "Trả" | "Chờ duyệt" | "Từ chối";
  userId?: string;
  userName?: string;
  createdAt: string;
}

export interface Stats {
  total: number;
  borrowing: number;
  returned: number;
  pending: number;
}

export interface Notification {
  id: string;
  type: "borrow" | "return" | "overdue" | "system";
  title: string;
  message: string;
  recordId: string | null;
  userId: string | null;
  userName: string | null;
  read: boolean;
  createdAt: string;
}
// ============ AUTH ============
export async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user;
}
export function getZaloLoginURL(): string {
  return `${API_BASE}/api/auth/zalo/login`;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

// ============ RECORDS ============

export async function fetchRecords(params?: {
  subjectId?: string;
  status?: string;
  search?: string;
}): Promise<BorrowRecord[]> {
  const url = new URL(`${API_BASE}/api/records`, window.location.origin);
  if (params?.subjectId) url.searchParams.set("subjectId", params.subjectId);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.search) url.searchParams.set("search", params.search);

  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error("Không thể tải dữ liệu");
  return res.json();
}

export async function createRecord(
  data: Omit<BorrowRecord, "id" | "createdAt" | "userId" | "userName">
): Promise<BorrowRecord> {
  const res = await fetch(`${API_BASE}/api/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...data, id: Date.now().toString() }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Không thể tạo bản ghi");
  }
  return res.json();
}

export async function updateRecordStatus(
  id: string,
  status: "Mượn" | "Trả" | "Chờ duyệt" | "Từ chối"
): Promise<BorrowRecord> {
  const res = await fetch(`${API_BASE}/api/records/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Không thể cập nhật trạng thái");
  return res.json();
}

export async function deleteRecord(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/records/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Không thể xóa bản ghi");
}

// ============ STATS ============

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats`, { credentials: "include" });
  if (!res.ok) throw new Error("Không thể tải thống kê");
  return res.json();
}

export async function fetchSubjectStats(subjectId: string): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats/${subjectId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Không thể tải thống kê môn học");
  return res.json();
}

// ============ NOTIFICATIONS ============

export async function fetchNotifications(params?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<Notification[]> {
  const url = new URL(`${API_BASE}/api/notifications`, window.location.origin);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.unreadOnly) url.searchParams.set("unreadOnly", "true");

  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error("Không thể tải thông báo");
  return res.json();
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/notifications/unread-count`, {
    credentials: "include",
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/notifications/${id}/read`, {
    method: "PATCH",
    credentials: "include",
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch(`${API_BASE}/api/notifications/mark-all-read`, {
    method: "POST",
    credentials: "include",
  });
}
