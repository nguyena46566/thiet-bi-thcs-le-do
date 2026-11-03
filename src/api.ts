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
  /** Biên bản trả: hỏng / mất / trễ hạn */
  returnReport?: {
    items: { equipmentId: string; name: string; damaged: number; lost: number; unitPrice: number }[];
    note: string; lateDays: number; returnedOn: string; pointsDeducted: number; compensation: number;
  } | null;
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

// ============ KHO THIẾT BỊ, NHẬP KHO, ĐIỂM THI ĐUA ============

export interface Equipment {
  id: string;
  name: string;
  subjectId: string;
  grades: number[];
  keywords: string[];
  location: string;
  unitPrice: number;
  qtyGood: number;
  qtyBroken: number;
  qtyLost: number;
  qtyRepair: number;
  qtyDisposed?: number;
  unit?: string;
  origin?: string;
  fundSource?: string;
  yearInUse?: number | null;
  shared?: boolean;
  note: string;
  condition?: string;
  updatedAt?: string;
}

export interface PurchaseItem { equipmentId: string; name?: string; quantity: number; unitPrice: number; amount?: number }
export interface Purchase { id: string; date: string; supplier: string; note: string; items: PurchaseItem[]; total: number; createdBy: string; createdAt: string }

export interface PenaltyEntry {
  id: string; createdAt: string; userId: string; teacherName: string; recordId?: string;
  kind: "late" | "damage" | "loss" | "manual"; points: number; reason: string; compensation?: number; createdBy?: string;
}
export interface PointRules { startPoints: number; lockBelow: number; latePerDay: number; lateMaxPerRecord: number; damagePerUnit: number; lossPerUnit: number }
export interface TeacherScore { userId: string; teacherName: string; score: number; locked: boolean; records: number; late: number; damaged: number; lost: number }
export interface ReturnReportInput { items: { equipmentId: string; damaged: number; lost: number }[]; note?: string }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra, vui lòng thử lại");
  return data as T;
}

export const fetchInventory = () => call<Equipment[]>("GET", "/api/inventory/equipment");
export const createEquipment = (e: Partial<Equipment>) => call<Equipment>("POST", "/api/inventory/equipment", e);
export const updateEquipment = (id: string, e: Partial<Equipment>) => call<Equipment>("PATCH", `/api/inventory/equipment/${encodeURIComponent(id)}`, e);
export const deleteEquipment = (id: string) => call<boolean>("DELETE", `/api/inventory/equipment/${encodeURIComponent(id)}`);
export const fetchPurchases = () => call<Purchase[]>("GET", "/api/inventory/purchases");
export const createPurchase = (p: { date: string; supplier: string; note: string; items: PurchaseItem[] }) => call<Purchase>("POST", "/api/inventory/purchases", p);
export const fetchMyPoints = () => call<{ score: number; locked: boolean; history: PenaltyEntry[]; rules: PointRules; schoolYear: string }>("GET", "/api/points/me");
export const fetchAllPoints = () => call<{ teachers: TeacherScore[]; rules: PointRules; schoolYear: string }>("GET", "/api/points");
export const fetchTeacherPoints = (userId: string) => call<{ score: number; locked: boolean; history: PenaltyEntry[] }>("GET", `/api/points/${encodeURIComponent(userId)}`);
export const adjustPoints = (b: { userId: string; teacherName: string; points: number; reason: string }) => call<PenaltyEntry>("POST", "/api/points/adjust", b);
export const unlockTeacher = (b: { userId: string; teacherName: string }) => call<PenaltyEntry>("POST", "/api/points/unlock", b);
export const returnRecord = (id: string, returnReport: ReturnReportInput) => call<BorrowRecord>("PATCH", `/api/records/${encodeURIComponent(id)}/status`, { status: "Trả", returnReport });

// ============ KIỂM KÊ, BẢO TRÌ, BÁO CÁO ============
export interface AuditItem { equipmentId: string; name: string; subjectId: string; location: string; sysGood: number; sysBroken: number; out: number; countGood: number | null; countBroken: number | null; note: string; expected?: number; diff?: number }
export interface Audit { id: string; status: "Đang kiểm kê" | "Hoàn tất"; title: string; subjectId: string; createdAt: string; createdBy: string; finishedAt?: string; items: AuditItem[]; summary?: { counted: number; notCounted: number; missing: number; surplus: number; discrepancies: number }; itemCount?: number; countedCount?: number }
export interface Maintenance { id: string; equipmentId: string; name: string; subjectId: string; quantity: number; source: "good" | "broken"; kind: string; content: string; vendor: string; date: string; status: "Đang thực hiện" | "Hoàn thành"; cost: number; repaired?: number; disposed?: number; resultNote?: string; finishedOn?: string; createdBy: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Report = any

export const fetchAudits = () => call<Audit[]>("GET", "/api/audits");
export const startAudit = (b: { subjectId?: string; title?: string }) => call<Audit>("POST", "/api/audits", b);
export const fetchAudit = (id: string) => call<Audit>("GET", `/api/audits/${encodeURIComponent(id)}`);
export const saveAudit = (id: string, items: { equipmentId: string; countGood: number | null; countBroken: number | null; note: string }[]) => call<Audit>("PATCH", `/api/audits/${encodeURIComponent(id)}`, { items });
export const finishAudit = (id: string) => call<Audit>("POST", `/api/audits/${encodeURIComponent(id)}/finish`);
export const cancelAudit = (id: string) => call<boolean>("DELETE", `/api/audits/${encodeURIComponent(id)}`);
export const fetchMaintenance = () => call<Maintenance[]>("GET", "/api/maintenance");
export const createMaintenance = (b: { equipmentId: string; quantity: number; source: string; kind: string; content: string; vendor: string; date: string }) => call<Maintenance>("POST", "/api/maintenance", b);
export const completeMaintenance = (id: string, b: { repaired: number; disposed: number; cost: number; note: string }) => call<Maintenance>("POST", `/api/maintenance/${encodeURIComponent(id)}/complete`, b);
export const fetchReport = (from: string, to: string) => call<Report>("GET", `/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const sendRemindersNow = () => call<{ due: number; overdue: number; sent: number; noEmail: number }>("POST", "/api/cron/reminders");
export const fetchEquipmentDetail = (id: string) => call<{ equipment: Equipment; subjectName: string; days: { date: string; available: number }[]; history?: { id: string; teacherName: string; className: string; borrowDate: string; returnDate: string; status: string; quantity: number }[]; maintenance?: Maintenance[] }>("GET", `/api/inventory/equipment/${encodeURIComponent(id)}/detail`);

// ============ GHI GIẢM ============
export interface Disposal { id: string; equipmentId: string; name: string; subjectId: string; quantity: number; source: "good" | "broken" | "lost"; reason: string; decisionNo: string; note: string; date: string; unitPrice: number; value: number; createdBy: string; createdAt: string }
export const fetchDisposals = () => call<Disposal[]>("GET", "/api/disposals");
export const createDisposal = (b: { equipmentId: string; quantity: number; source: string; reason: string; decisionNo: string; note: string; date: string }) => call<Disposal>("POST", "/api/disposals", b);
