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
export async function fetchCurrentUser(): Promise<User | null> {
  // Không chờ vô hạn: Render miễn phí có thể mất tới ~1 phút khi khởi động lại
  const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include", signal: AbortSignal.timeout(25000) });
  if (res.status === 503 || res.status >= 500) throw new Error("server-starting"); // máy chủ đang khởi động / đang kết nối CSDL
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
export const fetchRoomLog = (id: string, from: string, to: string) => call<{ room: Room; entries: RoomLogEntry[] }>("GET", `/api/rooms/${encodeURIComponent(id)}/log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

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
export interface MinItem { id: string; mon: string; stt: string; group: string; topic: string; name: string; purpose: string; forTeacher: boolean; forStudent: boolean; unit: string; normQty: number; normPer: string; normDiv?: number; norm?: string; grades: number[]; note: string; siteSubjectId: string; linkedEquipmentIds: string[]; source: string; required: number; have: number; missing: number; status: string }
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
