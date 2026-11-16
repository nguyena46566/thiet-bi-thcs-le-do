const API_BASE = import.meta.env.VITE_API_URL || "";

// ============ TYPES ============

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  isAdmin: boolean;
  isPrincipal?: boolean;
  isSysadmin?: boolean;
  isEquipment?: boolean;
  isHead?: boolean;
  isLibrarian?: boolean;
  consentVersion?: string;
  roles?: string[];
  group?: string;
  authType?: string;
  test?: boolean;
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
  code?: string;
  group?: string;
  lessonName?: string;
  usageType?: string;
  periods?: string[];
  roomId?: string;
  roomName?: string;
  needsSpecialApproval?: boolean;
  specialReason?: string;
  specialApproval?: { note: string; by: string; at: string };
  /** Biên bản trả: hỏng / mất / trễ hạn */
  returnReport?: {
    items: { equipmentId: string; name: string; damaged: number; lost: number; consumed?: number; unitPrice: number; lostStatus?: string }[];
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
export let pendingAccount: { name: string; email: string } | null = null;
export async function fetchCurrentUser(): Promise<User | null> {
  // Không chờ vô hạn: Render miễn phí có thể mất tới ~1 phút khi khởi động lại
  const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include", signal: AbortSignal.timeout(25000) });
  if (res.status === 503 || res.status >= 500) throw new Error("server-starting"); // máy chủ đang khởi động / đang kết nối CSDL
  if (!res.ok) return null;
  const data = await res.json();
  pendingAccount = data.pending || null;
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
> & { subjectName?: string; period?: string; periods?: string[]; periodPPCT?: string; items?: BorrowItem[]; lessonName?: string; usageType?: string; roomId?: string };

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

export async function updateRecordStatus(id: string, status: RecordStatus, reason?: string, specialApprovalNote?: string): Promise<BorrowRecord> {
  const res = await fetch(`${API_BASE}/api/records/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status, reason, specialApprovalNote }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Không thể cập nhật trạng thái"); }
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
  /** Mã tiết S1..S5, C1..C5 (đăng ký nhanh) */
  periods?: string[];
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
  qtyLostPending?: number;
  qtyConsumed?: number;
  kind?: "Thiết bị" | "Hóa chất" | "Vật tư tiêu hao";
  expiry?: string;
  expired?: boolean;
  hazard?: string;
  concentration?: string;
  minStock?: number;
  highValue?: boolean;
  topic?: string;
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
export interface ReturnReportInput { items: { equipmentId: string; damaged: number; lost: number; consumed?: number }[]; note?: string }

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

// ============ THIẾT BỊ CÒN TRỐNG (form đăng ký), BÁO MẤT ============
export interface AvailableItem { id: string; name: string; grades: number[]; unit: string; location: string; good: number; available: number }
export const fetchAvailable = (subjectId: string, from: string, to: string, periods: string[] = []) =>
  call<AvailableItem[]>("GET", `/api/inventory/available?subjectId=${encodeURIComponent(subjectId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&periods=${periods.join(",")}`);
export interface LossReport { verification?: { searchScope: string; involved: string; findings: string; by: string; at: string }; id: string; status: string; createdAt: string; equipmentId: string; name: string; quantity: number; unitPrice: number; source: "return" | "audit"; recordId?: string; teacherName?: string; auditTitle?: string; note?: string; reportedBy: string; decidedBy?: string; decidedAt?: string; decisionNote?: string }
export const fetchLossReports = () => call<{ reports: LossReport[]; canConfirm: boolean; principalConfigured: boolean }>("GET", "/api/loss-reports");
export const confirmLoss = (id: string, note: string) => call<LossReport>("POST", `/api/loss-reports/${encodeURIComponent(id)}/confirm`, { note });
export const rejectLoss = (id: string, note: string) => call<LossReport>("POST", `/api/loss-reports/${encodeURIComponent(id)}/reject`, { note });

// ============ PHÒNG BỘ MÔN, ĐỀ XUẤT MUA SẮM ============
export interface Room { id: string; name: string; kind: string; subjectIds: string[]; note: string; busy?: boolean; busyBy?: string }
export const fetchRooms = () => call<Room[]>("GET", "/api/rooms");
export const fetchRoomsAvailability = (from: string, to: string, periods: string[]) =>
  call<Room[]>("GET", `/api/rooms/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&periods=${periods.join(",")}`);
export const createRoom = (r: Partial<Room>) => call<Room>("POST", "/api/rooms", r);
export const updateRoom = (id: string, r: Partial<Room>) => call<Room>("PATCH", `/api/rooms/${encodeURIComponent(id)}`, r);
export const deleteRoom = (id: string) => call<boolean>("DELETE", `/api/rooms/${encodeURIComponent(id)}`);
export interface RoomLogEntry { date: string; period: string; className: string; teacherName: string; subject: string; lessonName: string; equipment: string; status: string; condition: string }
export const fetchRoomLog = (id: string, from: string, to: string) => call<{ room: Room; share?: Record<string, number>; entries: RoomLogEntry[] }>("GET", `/api/rooms/${encodeURIComponent(id)}/log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export interface ProposalItem { name: string; subjectId: string; equipmentId?: string | null; quantity: number; estPrice: number; reason: string }
export interface Proposal { id: string; status: "Chờ duyệt" | "Đã duyệt" | "Từ chối" | "Đã mua"; items: ProposalItem[]; total: number; purpose: string; userId: string; userName: string; createdAt: string; decisionNote?: string; decidedBy?: string; purchaseNote?: string }
export const fetchProposals = (mine = false) => call<{ proposals: Proposal[]; canDecide: boolean }>("GET", `/api/proposals${mine ? "?mine=1" : ""}`);
export const createProposal = (b: { purpose: string; items: ProposalItem[] }) => call<Proposal>("POST", "/api/proposals", b);
export const decideProposal = (id: string, approve: boolean, note: string) => call<Proposal>("POST", `/api/proposals/${encodeURIComponent(id)}/decide`, { approve, note });
export const markProposalPurchased = (id: string, note: string) => call<Proposal>("POST", `/api/proposals/${encodeURIComponent(id)}/purchased`, { note });

// ============ TRUY VẾT THIẾT BỊ, XÁC MINH MẤT ============
export interface ChangeEntry { id: string; createdAt: string; equipmentId: string; name: string; kind: string; refId: string | null; by: string; note: string; diff: Record<string, number> }
export interface LoanEntry { id: string; code: string; teacherName: string; className: string; subjectName: string; borrowDate: string; returnDate: string; period: string; status: string; quantity: number; createdAt: string; approvedAt: string | null; approvedBy: string; returnedAt: string | null; damaged: number; lost: number; lostStatus: string; roomName: string }
export interface EquipmentHistory {
  equipment: Equipment & { deleted?: boolean };
  changes: ChangeEntry[]; loans: LoanEntry[]; losses: LossReport[];
  trace: { lastAuditOk: { at: string; title: string } | null; lastReturnOk: { at: string; teacherName: string; code: string } | null; since: string | null; candidates: LoanEntry[] };
}
export const fetchEquipmentHistory = (id: string) => call<EquipmentHistory>("GET", `/api/inventory/equipment/${encodeURIComponent(id)}/history`);
export const verifyLoss = (id: string, b: { searchScope: string; involved: string; findings: string }) => call<LossReport>("PATCH", `/api/loss-reports/${encodeURIComponent(id)}/verify`, b);

// ============ DANH MỤC THIẾT BỊ TỐI THIỂU (TT 38/2021) ============
export interface MinItem { id: string; mon: string; stt: string; group: string; topic: string; name: string; purpose: string; forTeacher: boolean; forStudent: boolean; unit: string; normQty: number; normPer: string; normDiv?: number; norm?: string; grades: number[]; note: string; siteSubjectId: string; linkedEquipmentIds: string[]; source: string; amendedBy?: string; required: number; have: number; missing: number; status: string }
export interface MinSettings { teachers: Record<string, number>; rooms?: Record<string, number>; classes: Record<string, number>; hsPerRoom: number }
export const fetchMinlist = () => call<{ subjects: string[]; amended?: string[]; settings: MinSettings; items: MinItem[] }>("GET", "/api/minlist");
export const reseedMinlist = (mon: string) => call<{ imported: number }>("POST", "/api/minlist/reseed", { mon });
export const saveMinSettings = (s: MinSettings) => call<MinSettings>("PUT", "/api/minlist/settings", s);
export const linkMinItem = (id: string, linkedEquipmentIds: string[]) => call<MinItem>("PATCH", `/api/minlist/${encodeURIComponent(id)}`, { linkedEquipmentIds });
export const deleteMinItem = (id: string) => call<boolean>("DELETE", `/api/minlist/${encodeURIComponent(id)}`);
export const importMinlist = (rows: Record<string, unknown>[], replace: boolean) => call<{ imported: number; errors: string[] }>("POST", "/api/minlist/import", { rows, replace });

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu */
export const fold = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// ============ HÓA CHẤT, VẬT TƯ; KẾ HOẠCH; QUYẾT ĐỊNH ============
export const fetchAlerts = () => call<{ expired: Equipment[]; expiringSoon: Equipment[]; lowStock: Equipment[]; noExpiry: Equipment[] }>("GET", "/api/inventory/alerts");
export interface Consumption { id: string; equipmentId: string; name: string; unit: string; quantity: number; receiver: string; purpose: string; date: string; createdBy: string; createdAt: string }
export const fetchConsumptions = () => call<Consumption[]>("GET", "/api/inventory/consumptions");
export const consume = (b: { equipmentId: string; quantity: number; receiver: string; purpose: string; date: string }) => call<Consumption>("POST", "/api/inventory/consume", b);
export const fetchChanges = (from: string, to: string) => call<ChangeEntry[]>("GET", `/api/inventory/changes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export interface PlanTask { id: string; name: string; start: string; end: string; owner: string; done: boolean }
export interface Plan { id: string; schoolYear: string; title: string; number: string; status: "Nháp" | "Chờ duyệt" | "Đã duyệt" | "Trả lại"; sections: Record<string, string>; tasks: PlanTask[]; createdBy: string; createdAt: string; submittedAt?: string; decidedBy?: string; decidedAt?: string; decisionNote?: string }
export const fetchPlans = () => call<{ plans: Plan[]; canDecide: boolean }>("GET", "/api/plans");
export const createPlan = (b: Partial<Plan> = {}) => call<Plan>("POST", "/api/plans", b);
export const updatePlan = (id: string, b: Partial<Plan>) => call<Plan>("PATCH", `/api/plans/${encodeURIComponent(id)}`, b);
export const submitPlan = (id: string) => call<Plan>("POST", `/api/plans/${encodeURIComponent(id)}/submit`);
export const decidePlan = (id: string, approve: boolean, note: string) => call<Plan>("POST", `/api/plans/${encodeURIComponent(id)}/decide`, { approve, note });
export const deletePlan = (id: string) => call<boolean>("DELETE", `/api/plans/${encodeURIComponent(id)}`);

export interface Decision { id: string; type: string; number: string; date: string; scope: string; from: string; to: string; members: { name: string; position: string; duty: string }[]; duties: string; createdBy: string; createdAt: string }
export const fetchDecisions = () => call<Decision[]>("GET", "/api/decisions");
export const saveDecision = (b: Partial<Decision>) => (b.id ? call<Decision>("PATCH", `/api/decisions/${encodeURIComponent(b.id)}`, b) : call<Decision>("POST", "/api/decisions", b));
export const deleteDecision = (id: string) => call<boolean>("DELETE", `/api/decisions/${encodeURIComponent(id)}`);

// ============ ĐĂNG NHẬP, NGƯỜI DÙNG, TRANG THEO VAI TRÒ ============
export interface AuthOptions { google: boolean; testAccounts: { username: string; label: string }[]; testPassword: string | null; roles: Record<string, string>; groups: string[] }
export const fetchAuthOptions = () => call<AuthOptions>("GET", "/api/auth/options");
export const loginPassword = (username: string, password: string) => call<{ user: User; landing: string }>("POST", "/api/auth/login", { username, password });
export const registerAccount = (b: { name: string; email: string; username: string; password: string; requestedRoles: string[]; group: string }) => call<{ ok: boolean }>("POST", "/api/auth/register", b);
export const changeMyPassword = (current: string, password: string) => call<{ ok: boolean }>("POST", "/api/auth/password", { current, password });
export interface AppUser { id: string; username?: string; email: string; name: string; avatar?: string | null; roles: string[]; requestedRoles?: string[]; requestedGroup?: string; group?: string; status: "pending" | "active" | "locked"; authType: string; test?: boolean; createdAt: string; approvedBy?: string; lastLoginAt?: string }
export interface RoleLog { id: string; action: string; targetName: string; by: string; detail: string; createdAt: string }
export const fetchUsers = () => call<{ users: AppUser[]; roles: Record<string, string>; groups: string[]; logs: RoleLog[]; testAccounts: boolean }>("GET", "/api/users");
export const approveUser = (id: string, roles: string[], group: string) => call<AppUser>("POST", `/api/users/${encodeURIComponent(id)}/approve`, { roles, group });
export const rejectUser = (id: string) => call<{ ok: boolean }>("POST", `/api/users/${encodeURIComponent(id)}/reject`, {});
export const updateUser = (id: string, b: Partial<AppUser>) => call<AppUser>("PATCH", `/api/users/${encodeURIComponent(id)}`, b);
export const createUser = (b: { name: string; username: string; email: string; password: string; roles: string[]; group: string; test?: boolean }) => call<AppUser>("POST", "/api/users", b);
export const resetUserPassword = (id: string, password: string) => call<{ ok: boolean }>("POST", `/api/users/${encodeURIComponent(id)}/password`, { password });
export const fetchPrincipalOverview = () => call<{ losses: LossReport[]; proposals: Proposal[]; plans: Plan[]; special: BorrowRecord[]; stats: { monthRecords: number; borrowing: number; overdue: number; pending: number } }>("GET", "/api/principal/overview");
export const fetchHeadOverview = (group = "") => call<{ group: string; subjects: { id: string; name: string; group: string }[]; records: BorrowRecord[]; proposals: Proposal[] }>("GET", `/api/head/overview?group=${encodeURIComponent(group)}`);

// ============ THƯ VIỆN ============
export interface ReceiptLine { id: string; title: string; author: string; publisher: string; year: string; kind: string; grade: string; isbn: string; invoiceQty: number; price: number; receivedQty: number | null; note: string; titleId?: string; codeFrom?: string; codeTo?: string; diff?: number }
export interface BookReceipt { id: string; status: string; invoiceNo: string; invoiceDate: string; supplier: string; source: string; note: string; defaultShelf: string; lines: ReceiptLine[]; invoiceTotal: number; receivedTotal?: number; receivedCopies?: number; countNote?: string; createdBy: string; createdAt: string; receivedBy?: string; receivedAt?: string; copies?: BookCopy[] }
export interface BookTitle { id: string; title: string; author: string; publisher: string; year: string; kind: string; grade: string; price: number; isbn?: string; classification?: string; callNumber?: string; keywords?: string; summary?: string; pages?: string; size?: string; copies: number; onShelf: number; unshelved: number }
export interface BookCopy { id: string; code: string; titleId: string; receiptId: string; price: number; shelf: string; status: string; note?: string; createdAt: string }
export interface Shelf { id: string; code: string; name: string; room: string; kinds: string[]; count: number }
export const fetchLibraryMeta = () => call<{ kinds: Record<string, string>; statuses: string[]; sources: string[] }>("GET", "/api/library/meta");
export const fetchReceipts = () => call<BookReceipt[]>("GET", "/api/library/receipts");
export const fetchReceipt = (id: string) => call<BookReceipt>("GET", `/api/library/receipts/${encodeURIComponent(id)}`);
export const createReceipt = (b: Partial<BookReceipt>) => call<BookReceipt>("POST", "/api/library/receipts", b);
export const updateReceipt = (id: string, b: Partial<BookReceipt>) => call<BookReceipt>("PATCH", `/api/library/receipts/${encodeURIComponent(id)}`, b);
export const deleteReceipt = (id: string) => call<boolean>("DELETE", `/api/library/receipts/${encodeURIComponent(id)}`);
export const receiveReceipt = (id: string, lines: { id: string; receivedQty: number }[], countNote: string, shelf: string) => call<BookReceipt>("POST", `/api/library/receipts/${encodeURIComponent(id)}/receive`, { lines, countNote, shelf });
export const fetchTitles = () => call<BookTitle[]>("GET", "/api/library/titles");
export const fetchCopies = (q: { titleId?: string; shelf?: string; status?: string; receiptId?: string } = {}) => call<BookCopy[]>("GET", `/api/library/copies?${new URLSearchParams(q as Record<string, string>)}`);
export const fetchCopy = (code: string) => call<{ copy: BookCopy; title: BookTitle; shelf: Shelf | null; receipt: { invoiceNo: string; invoiceDate: string; supplier: string; source: string } | null; staff: boolean }>("GET", `/api/library/copies/${encodeURIComponent(code)}`);
export const updateCopy = (code: string, b: { status?: string; note?: string }) => call<BookCopy>("PATCH", `/api/library/copies/${encodeURIComponent(code)}`, b);
export const shelveCopies = (shelf: string, codes: string[]) => call<{ shelf: string; done: string[]; notFound: string[]; skipped: string[] }>("POST", "/api/library/shelve", { shelf, codes });
export const fetchShelves = () => call<Shelf[]>("GET", "/api/library/shelves");
export const createShelf = (b: { code: string; name: string; room: string; kinds: string[] }) => call<Shelf>("POST", "/api/library/shelves", b);
export const deleteShelf = (id: string) => call<boolean>("DELETE", `/api/library/shelves/${encodeURIComponent(id)}`);

// ============ DỮ LIỆU CÁ NHÂN, HỒ SƠ, KHÁCH VÃNG LAI ============
export interface PrivacyMeta { version: string; guestRetentionDays: number; requestTypes: string[]; guestKinds: string[]; guestPurposes: string[] }
export interface DataRequest { id: string; userId: string; userName: string; email: string; type: string; content: string; status: string; response?: string; handledBy?: string; handledAt?: string; createdAt: string }
export interface MyProfile { user: { id: string; name: string; email: string; username: string; phone: string; position: string; roles: string[]; roleNames: string[]; group: string; authType: string; createdAt: string | null; lastLoginAt: string | null; approvedBy: string }; consent: { version: string; at: string } | null; privacyVersion: string; stats: { records: number; borrowing: number; pending: number; proposals: number }; requests: DataRequest[] }
export interface Guest { id: string; code: string; name: string; kind: string; org: string; phone: string; purpose: string; place: string; note: string; checkInAt: string; checkOutAt: string | null; createdBy: string; anonymized?: boolean }
export const fetchPrivacyMeta = () => call<PrivacyMeta>("GET", "/api/privacy/meta");
export const giveConsent = (version: string) => call<{ ok: boolean }>("POST", "/api/privacy/consent", { version });
export const fetchMyProfile = () => call<MyProfile>("GET", "/api/me/profile");
export const updateMyProfile = (b: { name?: string; phone?: string; position?: string }) => call<{ ok: boolean }>("PATCH", "/api/me/profile", b);
export const sendDataRequest = (type: string, content: string) => call<DataRequest>("POST", "/api/me/requests", { type, content });
export const fetchDataRequests = () => call<DataRequest[]>("GET", "/api/data-requests");
export const handleDataRequest = (id: string, status: string, response: string) => call<DataRequest>("PATCH", `/api/data-requests/${encodeURIComponent(id)}`, { status, response });
export const guestSelfCheckIn = (b: Partial<Guest> & { consent: boolean }) => call<{ code: string; name: string; checkInAt: string; purpose: string; place: string }>("POST", "/api/guests/self", b);
export const fetchGuestSlip = (code: string) => call<{ code: string; name: string; checkInAt: string; checkOutAt: string | null; purpose: string; place: string }>("GET", `/api/guests/slip/${encodeURIComponent(code)}`);
export const fetchGuests = (from: string, to: string) => call<{ guests: Guest[]; retentionDays: number }>("GET", `/api/guests?from=${from}&to=${to}`);
export const addGuest = (b: Partial<Guest> & { consent: boolean }) => call<Guest>("POST", "/api/guests", b);
export const checkoutGuest = (id: string) => call<Guest>("POST", `/api/guests/${encodeURIComponent(id)}/checkout`, {});
export const anonymizeGuest = (id: string) => call<Guest>("POST", `/api/guests/${encodeURIComponent(id)}/anonymize`, {});

// ============ THƯ VIỆN: BẠN ĐỌC, LƯU THÔNG, TIẾT ĐỌC, TRA CỨU, KIỂM KÊ, THỐNG KÊ ============
export interface Reader { id: string; name: string; type: string; className: string; grade: number | null; userId: string | null; status: string; onLoan?: number; createdAt: string }
export interface BookLoan { id: string; copyCode: string; titleId: string; title?: string; readerId: string; readerName: string; readerType: string; className: string; mode: string; loanDate: string; dueDate: string; returnedAt: string | null; returnDate?: string; condition?: string; renewals: number; overdueDays?: number; lateDays?: number; shelf?: string }
export interface LibRules { studentMax: number; studentDays: number; staffMax: number; staffDays: number }
export interface ReadingPeriod { id: string; date: string; slot: string; slotName: string; className: string; schoolYear: string; term: string; topic: string; leader: string; status: string; attendance: number | null; note: string }
export interface LibAudit { id: string; title: string; shelf: string; expected: string[]; found: string[]; extra: string[]; missing?: string[]; status: string; createdBy: string; createdAt: string; finishedAt?: string; markedMissing?: boolean }
export interface OpacResult { id: string; title: string; author: string; publisher: string; year: string; kind: string; grade: string; callNumber: string; summary: string; total: number; available: number; shelves: string[] }
export const fetchLibRules = () => call<LibRules>("GET", "/api/library/rules");
export const saveLibRules = (r: LibRules) => call<LibRules>("PUT", "/api/library/rules", r);
export const fetchReaders = () => call<Reader[]>("GET", "/api/library/readers");
export const createReaders = (readers: Record<string, unknown>[]) => call<{ created: Reader[]; errors: string[] }>("POST", "/api/library/readers", { readers });
export const readersFromUsers = () => call<{ added: number }>("POST", "/api/library/readers/from-users", {});
export const updateReader = (id: string, b: { status?: string; className?: string }) => call<Reader>("PATCH", `/api/library/readers/${encodeURIComponent(id)}`, b);
export const deleteReader = (id: string) => call<{ ok: boolean }>("DELETE", `/api/library/readers/${encodeURIComponent(id)}`);
export const fetchLoans = (q: { readerId?: string; open?: string; overdue?: string } = {}) => call<BookLoan[]>("GET", `/api/library/loans?${new URLSearchParams(q as Record<string, string>)}`);
export const fetchMyLibraryLoans = () => call<{ reader: Reader | null; loans: BookLoan[] }>("GET", "/api/library/my-loans");
export const lendBooks = (b: { readerId: string; codes: string[]; mode: string; dueDate?: string }) => call<BookLoan[]>("POST", "/api/library/loans", b);
export const returnBook = (code: string, condition: string, note = "") => call<BookLoan>("POST", "/api/library/returns", { code, condition, note });
export const renewLoan = (id: string) => call<BookLoan>("POST", `/api/library/loans/${encodeURIComponent(id)}/renew`, {});
export const fetchReadingPeriods = (schoolYear = "") => call<{ schoolYear: string; min: number; periods: ReadingPeriod[]; summary: { className: string; hk1: number; hk2: number; planned: number; ok1: boolean; ok2: boolean }[] }>("GET", `/api/library/reading-periods?schoolYear=${schoolYear}`);
export const createReadingPeriod = (b: { date: string; slot: string; className: string; topic: string; leader: string }) => call<ReadingPeriod>("POST", "/api/library/reading-periods", b);
export const updateReadingPeriod = (id: string, b: { status?: string; attendance?: number; note?: string }) => call<ReadingPeriod>("PATCH", `/api/library/reading-periods/${encodeURIComponent(id)}`, b);
export const deleteReadingPeriod = (id: string) => call<boolean>("DELETE", `/api/library/reading-periods/${encodeURIComponent(id)}`);
export const searchOpac = (q: string, kind = "", grade = "") => call<{ results: OpacResult[]; kinds: Record<string, string> }>("GET", `/api/opac?q=${encodeURIComponent(q)}&kind=${kind}&grade=${grade}`);
export const catalogTitle = (id: string, b: Record<string, string>) => call<BookTitle>("PATCH", `/api/library/titles/${encodeURIComponent(id)}`, b);
export const fetchStocktakes = () => call<LibAudit[]>("GET", "/api/library/stocktakes");
export const createStocktake = (shelf: string, title: string) => call<LibAudit>("POST", "/api/library/stocktakes", { shelf, title });
export const scanStocktake = (id: string, codes: string[]) => call<LibAudit>("POST", `/api/library/stocktakes/${encodeURIComponent(id)}/scan`, { codes });
export const finishStocktake = (id: string, markMissing: boolean) => call<LibAudit>("POST", `/api/library/stocktakes/${encodeURIComponent(id)}/finish`, { markMissing });
export const weedCopies = (codes: string[], reason: string, decisionNo: string) => call<{ weeded: string[] }>("POST", "/api/library/weed", { codes, reason, decisionNo });
export interface LibStats { schoolYear: string; collection: { titles: number; copies: number; byKind: Record<string, number>; onLoan: number; damaged: number; lost: number; weeded: number }; readers: { students: number; teachers: number; studentsActive: number; teachersActive: number; studentPct: number; teacherPct: number; copiesPerStudent: number | null }; loans: { total: number; home: number; inLibrary: number; open: number; overdue: number; byMonth: Record<string, number>; topTitles: { title: string; loans: number }[] }; byClass: Record<string, { readers: number; active: number; loans: number }>; readingPeriods: { done: number; planned: number } }
export const fetchLibStats = () => call<LibStats>("GET", "/api/library/stats");

// ============ VẬN HÀNH ============
export interface BackupEntry { id: string; at: string; by: string; kind: string; size: number; encrypted: boolean; counts: Record<string, number> }
export interface LoginEntry { id: string; at: string; method: string; username?: string; email?: string; name?: string; userId?: string | null; result: string; ip: string; ua?: string; device?: string }
export interface SystemStatus { storage: string; uptimeMinutes: number; node: string; counts: Record<string, number>; lastBackup: BackupEntry | null; backupEncrypted: boolean; logins24h: { ok: number; failed: number }; checks: { label: string; ok: boolean }[] }
export const fetchSystemStatus = () => call<SystemStatus>("GET", "/api/admin/status");
export const fetchBackups = () => call<BackupEntry[]>("GET", "/api/admin/backups");
export const fetchLoginLog = (q = "", result = "") => call<LoginEntry[]>("GET", `/api/admin/login-log?q=${encodeURIComponent(q)}&result=${encodeURIComponent(result)}`);
export const fetchMyLogins = () => call<LoginEntry[]>("GET", "/api/me/logins");
export async function downloadBackup() {
  const res = await fetch(`${API_BASE}/api/admin/backup`, { credentials: "include" })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Không tải được bản sao lưu")
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "sao-luu.tbk"
  const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click(); URL.revokeObjectURL(a.href)
  return name
}
export async function restoreBackup(file: File, dry: boolean) {
  const res = await fetch(`${API_BASE}/api/admin/restore?${dry ? "dry=1" : "confirm=KHOI-PHUC"}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream" }, body: await file.arrayBuffer() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Khôi phục thất bại")
  return data as { createdAt?: string; restoredFrom?: string; counts: Record<string, number>; current?: Record<string, number> }
}
