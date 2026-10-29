const API_BASE = import.meta.env.VITE_API_URL || "";

// ============ TYPES ============

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  isAdmin: boolean;
}

export type RecordStatus = "Mượn" | "Trả" | "Chờ duyệt" | "Từ chối";

export interface BorrowItem {
  equipmentId: string;
  quantity: number;
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
  period?: string;
  periodPPCT?: string;
  status: RecordStatus;
  items?: BorrowItem[];
  userId?: string;
  userName?: string;
  createdAt: string;
  updatedAt?: string;
  returnedAt?: string;
  /** Lý do admin ghi khi từ chối */
  adminNote?: string;
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
export function getGoogleLoginURL(): string {
  return `${API_BASE}/api/auth/google/login`;
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
}, signal?: AbortSignal): Promise<BorrowRecord[]> {
  const url = new URL(`${API_BASE}/api/records`, window.location.origin);
  if (params?.subjectId) url.searchParams.set("subjectId", params.subjectId);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.search) url.searchParams.set("search", params.search);

  const res = await fetch(url.toString(), { credentials: "include", signal });
  if (!res.ok) throw new Error("Không thể tải dữ liệu");
  return res.json();
}

/** Phiếu do chính người đang đăng nhập tạo */
export async function fetchMyRecords(): Promise<BorrowRecord[]> {
  const res = await fetch(`${API_BASE}/api/records/mine`, { credentials: "include" });
  if (!res.ok) throw new Error("Không thể tải phiếu của bạn");
  return res.json();
}

/** Dữ liệu gửi lên khi tạo phiếu. id, trạng thái, số lượng... do server tự điền. */
export type NewRecordInput = Pick<
  BorrowRecord,
  "subjectId" | "teacherName" | "className" | "equipment" | "borrowDate" | "returnDate" | "notes"
> & { subjectName?: string; period?: string; periodPPCT?: string; items?: BorrowItem[] };

export async function createRecord(data: NewRecordInput): Promise<BorrowRecord> {
  const res = await fetch(`${API_BASE}/api/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Không thể tạo bản ghi");
  }
  return res.json();
}

export async function updateRecordStatus(id: string, status: RecordStatus, reason?: string): Promise<BorrowRecord> {
  const res = await fetch(`${API_BASE}/api/records/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) throw new Error("Không thể cập nhật trạng thái");
  return res.json();
}

export async function deleteRecord(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/records/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Không thể xóa bản ghi");
  }
}

// ============ STATS ============

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats`, { credentials: "include" });
  if (!res.ok) throw new Error("Không thể tải thống kê");
  return res.json();
}

export async function fetchSubjectStats(subjectId: string): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats/${encodeURIComponent(subjectId)}`, {
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
  await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(id)}/read`, {
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

// ============ CHAT ============

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BorrowDraft {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  className: string;
  equipment: string;
  items?: BorrowItem[];
  borrowDate: string;
  returnDate: string;
  period: string;
  periodPPCT: string;
  notes: string;
  /** Các mục bắt buộc còn thiếu - phải điền nốt trong form trước khi gửi */
  missing?: string[];
}

export async function sendChat(
  messages: ChatMessage[],
  context?: { subjectId?: string }
): Promise<{ reply: string; draft: BorrowDraft | null }> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages, context }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Không thể gửi tin nhắn");
  }
  return res.json();
}
