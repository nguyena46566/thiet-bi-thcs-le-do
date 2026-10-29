/**
 * Định nghĩa công cụ (tool) cho chatbot + hàm thực thi.
 * LLM chỉ "gọi" công cụ; dữ liệu thật luôn lấy từ danh mục/CSDL của website.
 */
import {
  searchEquipment, checkAvailability, suggestForLesson, searchRules,
  getEquipment, availabilityOf, parseDate, formatDate, hoursUntilBorrow, MIN_NOTICE_HOURS,
} from "./equipment.js";
import db from "./database.js";

// Khớp với SUBJECTS trong src/App.tsx
export const SUBJECTS = [
  { id: "hoa-hoc", name: "Hóa học" },
  { id: "vat-li", name: "Vật lí" },
  { id: "sinh-hoc", name: "Sinh học" },
  { id: "cong-nghe", name: "Công nghệ" },
  { id: "toan-hoc", name: "Toán học" },
  { id: "lich-su-dia-li", name: "Lịch Sử - Địa lí" },
  { id: "gdtc", name: "GDTC" },
  { id: "ngu-van-gdcd", name: "Ngữ văn - GDCD" },
  { id: "tieng-anh", name: "Tiếng Anh" },
];
const SUBJECT_IDS = SUBJECTS.map((s) => s.id);
const PERIODS = ["Tiết 1", "Tiết 2", "Tiết 3", "Tiết 4", "Tiết 5"]; // khớp form mượn

export const TOOLS = [
  {
    name: "search_equipment",
    description:
      "Tìm thiết bị trong danh mục theo từ khóa, môn và khối. Dùng khi giáo viên hỏi 'có ... không', 'tìm ...'. " +
      "Kết quả có mã (id), tên, tồn kho tổng và vị trí; KHÔNG cho biết còn trống theo ngày (dùng check_availability).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Từ khóa tìm kiếm, ví dụ 'kính hiển vi', 'lực đẩy'." },
        subjectId: { type: "string", enum: SUBJECT_IDS, description: "Lọc theo môn (không bắt buộc)." },
        grade: { type: "integer", minimum: 6, maximum: 9, description: "Lọc theo khối lớp (không bắt buộc)." },
      },
      required: ["query"],
    },
  },
  {
    name: "suggest_for_lesson",
    description:
      "Gợi ý thiết bị cần cho một bài dạy. Trả về bài học khớp trong phân phối chương trình (source=lesson_plan) " +
      "hoặc gợi ý theo từ khóa (source=keyword_fallback, độ tin cậy thấp hơn - hãy nói rõ với giáo viên). " +
      "Nếu có ngày mượn/trả thì kèm số lượng còn trống.",
    input_schema: {
      type: "object",
      properties: {
        subjectId: { type: "string", enum: SUBJECT_IDS },
        grade: { type: "integer", minimum: 6, maximum: 9 },
        topic: { type: "string", description: "Tên bài hoặc chủ đề, ví dụ 'áp suất chất lỏng'." },
        borrowDate: { type: "string", description: "DD/MM/YYYY (không bắt buộc)." },
        returnDate: { type: "string", description: "DD/MM/YYYY (không bắt buộc)." },
      },
      required: ["topic"],
    },
  },
  {
    name: "check_availability",
    description:
      "Kiểm tra số lượng còn trống của một hoặc nhiều thiết bị trong khoảng ngày mượn-trả, " +
      "dựa trên các phiếu đang 'Chờ duyệt' hoặc 'Mượn'. Luôn gọi công cụ này trước khi khẳng định còn/hết thiết bị.",
    input_schema: {
      type: "object",
      properties: {
        equipmentIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6, description: "Mã thiết bị lấy từ kết quả search_equipment / suggest_for_lesson." },
        borrowDate: { type: "string", description: "DD/MM/YYYY" },
        returnDate: { type: "string", description: "DD/MM/YYYY; bỏ trống nếu mượn trả trong ngày." },
      },
      required: ["equipmentIds", "borrowDate"],
    },
  },
  {
    name: "draft_borrow_request",
    description:
      "Soạn BẢN NHÁP phiếu mượn để giáo viên xem, bấm 'Điền vào form' hoặc bấm gửi. Công cụ này KHÔNG gửi phiếu. " +
      "Gọi khi đã biết môn, thiết bị và ngày mượn, giáo viên đã đồng ý thiết bị/ngày. Các mục chưa biết (lớp, tiết, PPCT, ngày trả) có thể bỏ trống: " +
      "giáo viên sẽ tự điền nốt trong form. Công cụ tự kiểm tra ngày và tồn kho; nếu lỗi sẽ trả về lý do.",
    input_schema: {
      type: "object",
      properties: {
        subjectId: { type: "string", enum: SUBJECT_IDS },
        teacherName: { type: "string" },
        className: { type: "string", description: "Ví dụ 8A1" },
        items: {
          type: "array", minItems: 1, maxItems: 6,
          items: {
            type: "object",
            properties: { equipmentId: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
            required: ["equipmentId", "quantity"],
          },
        },
        borrowDate: { type: "string", description: "DD/MM/YYYY" },
        returnDate: { type: "string", description: "DD/MM/YYYY. Bỏ trống = trả trong ngày mượn." },
        period: { type: "string", enum: PERIODS, description: "Tiết dạy trong ngày." },
        periodPPCT: { type: "string", description: "Tiết theo PPCT, ví dụ 'Tiết 25 - Bài 12'." },
        notes: { type: "string" },
      },
      required: ["subjectId", "items", "borrowDate"],
    },
  },
  {
    name: "get_rules",
    description: "Tra cứu nội quy mượn/trả thiết bị (thời hạn đăng ký, trả trễ, hư hỏng, mất...). Dùng khi giáo viên hỏi về quy định.",
    input_schema: {
      type: "object",
      properties: { question: { type: "string", description: "Câu hỏi hoặc từ khóa về nội quy." } },
      required: ["question"],
    },
  },
];

async function draftBorrowRequest(input, ctx) {
  const subject = SUBJECTS.find((s) => s.id === input.subjectId);
  if (!subject) return { ok: false, error: "Môn học không hợp lệ." };

  const from = parseDate(input.borrowDate);
  const to = parseDate(input.returnDate || input.borrowDate);
  if (!from || !to) return { ok: false, error: "Ngày không hợp lệ, cần định dạng DD/MM/YYYY." };
  if (to < from) return { ok: false, error: "Ngày trả phải sau hoặc bằng ngày mượn." };

  const period = input.period ? String(input.period) : "";
  if (period && !PERIODS.includes(period)) return { ok: false, error: `Tiết trong ngày phải là một trong: ${PERIODS.join(", ")}.` };
  if (!Array.isArray(input.items) || !input.items.length) return { ok: false, error: "Cần ít nhất một thiết bị." };

  // Quy định: đăng ký trước ít nhất 24 giờ (tính đến giờ bắt đầu của tiết dạy).
  // Chưa biết tiết thì tính theo tiết sớm nhất (Tiết 1) cho chắc chắn.
  const hours = hoursUntilBorrow(input.borrowDate, period || "Tiết 1");
  if (hours === null || hours < MIN_NOTICE_HOURS) {
    return { ok: false, error: `Phải đăng ký trước ít nhất ${MIN_NOTICE_HOURS} giờ, nhưng ${period || "buổi sáng"} ngày ${formatDate(from)} chỉ còn khoảng ${Math.max(0, Math.floor(hours ?? 0))} giờ. Hãy chọn ngày hoặc tiết muộn hơn.` };
  }

  const records = await db.records.findActive();
  const lines = [];
  const items = [];
  const conflicts = [];
  for (const it of input.items || []) {
    const eq = getEquipment(it.equipmentId);
    if (!eq) return { ok: false, error: `Không có thiết bị mã "${it.equipmentId}" trong danh mục.` };
    const qty = Math.floor(Number(it.quantity));
    if (!qty || qty < 1) return { ok: false, error: `Số lượng của "${eq.name}" không hợp lệ.` };
    const av = availabilityOf(eq, from, to, records);
    if (av.available < qty) conflicts.push({ name: eq.name, requested: qty, available: av.available });
    lines.push(`${eq.name} (x${qty})`);
    items.push({ equipmentId: eq.id, quantity: qty });
  }
  if (conflicts.length) {
    return { ok: false, error: "Không đủ thiết bị trong khoảng ngày này.", conflicts };
  }

  const teacherName = String(input.teacherName || ctx.user?.name || "").trim().slice(0, 80);
  ctx.draft = {
    subjectId: subject.id,
    subjectName: subject.name,
    teacherName,
    className: String(input.className || "").trim().slice(0, 20),
    equipment: lines.join(", "),
    items,
    borrowDate: formatDate(from),
    returnDate: formatDate(to),
    period,
    periodPPCT: String(input.periodPPCT || "").trim().slice(0, 120),
    notes: String(input.notes || "").trim().slice(0, 300),
  };
  // Các mục form bắt buộc mà bản nháp còn thiếu
  const missing = [
    !ctx.draft.teacherName && "họ tên giáo viên",
    !ctx.draft.className && "lớp",
    !period && "tiết trong ngày",
    !ctx.draft.periodPPCT && "tiết theo PPCT",
  ].filter(Boolean);
  ctx.draft.missing = missing;
  return {
    ok: true,
    message: missing.length
      ? `Đã soạn bản nháp còn thiếu: ${missing.join(", ")}. Giáo viên có thể bấm "Điền vào form" rồi tự điền nốt, hoặc trả lời bạn để bổ sung. Phiếu CHƯA được gửi.`
      : "Đã soạn bản nháp đầy đủ, giáo viên có thể bấm 'Gửi yêu cầu' hoặc 'Điền vào form' để sửa. Phiếu CHƯA được gửi.",
    draft: ctx.draft,
  };
}

export async function runTool(name, input = {}, ctx = {}) {
  switch (name) {
    case "search_equipment":
      return { results: searchEquipment(input) };
    case "suggest_for_lesson":
      return suggestForLesson(input);
    case "check_availability":
      return checkAvailability(input);
    case "draft_borrow_request":
      return draftBorrowRequest(input, ctx);
    case "get_rules":
      return { sections: searchRules(input.question) };
    default:
      return { error: `Công cụ không tồn tại: ${name}` };
  }
}
