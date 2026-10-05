/**
 * POST /api/chat  - chatbot tư vấn và gợi ý thiết bị (Claude + tool use)
 *
 * Request : { messages: [{role:"user"|"assistant", content:string}], context?: { subjectId?: string } }
 * Response: { reply: string, draft: BorrowDraft | null }
 *
 * Chatbot chỉ soạn bản nháp phiếu mượn; việc gửi phiếu vẫn đi qua POST /api/records
 * (giáo viên bấm nút) và quản trị viên duyệt như cũ.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { TOOLS, SUBJECTS, runTool } from "./chatTools.js";
import { todayVN, formatDate } from "./equipment.js";

const MAX_TURNS = 12;   // số tin nhắn gần nhất được gửi lên model
const MAX_CHARS = 2000; // độ dài tối đa mỗi tin
const MAX_STEPS = 6;    // số vòng gọi tool tối đa cho một câu hỏi
const RATE_LIMIT = 10;  // số yêu cầu / phút / người dùng

const getModel = () => process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// ---------- Rate limit đơn giản trong bộ nhớ ----------
const hits = new Map();
function rateLimited(userId) {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT) { hits.set(userId, recent); return true; }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of hits) if (!arr.some((t) => now - t < 60_000)) hits.delete(id);
}, 5 * 60_000).unref();

// ---------- Prompt ----------
export function buildSystem(user, subjectId) {
  const today = formatDate(todayVN());
  const name = String(user?.name || "").replace(/[\r\n]+/g, " ").slice(0, 60) || "(không rõ)";
  const subject = SUBJECTS.find((s) => s.id === subjectId);
  return `Bạn là "Trợ lý thiết bị" của website quản lý thiết bị dạy học, Trường THCS Lê Độ. Bạn giúp giáo viên: tìm thiết bị, gợi ý thiết bị theo bài dạy, kiểm tra thiết bị còn hay hết, tra cứu nội quy và soạn sẵn phiếu mượn.

Nguyên tắc:
- Mọi thông tin về thiết bị, tồn kho, lịch mượn và nội quy phải lấy từ kết quả công cụ. Không bịa tên thiết bị, số lượng, bài học hay quy định. Nếu công cụ không trả về gì, nói rõ là không tìm thấy trong danh mục.
- Muốn nói thiết bị còn hay hết, phải gọi check_availability (hoặc suggest_for_lesson kèm ngày). Không đoán.
- Nếu suggest_for_lesson trả về source=keyword_fallback, nói rõ đây là gợi ý theo từ khóa, chưa có trong phân phối chương trình, giáo viên nên tự kiểm tra lại.
- Bạn chỉ soạn bản nháp phiếu mượn bằng draft_borrow_request. Bạn không gửi được phiếu: giáo viên bấm "Gửi yêu cầu" và quản trị viên sẽ duyệt. Không nói là đã đăng ký thành công.
- Trước khi soạn phiếu cần đủ: thiết bị và số lượng, lớp, ngày mượn, ngày trả, tiết trong ngày (Tiết 1 đến Tiết 5), tiết theo PPCT (ví dụ "Tiết 25 - Bài 12"). Thiếu gì thì hỏi gọn một lần cho tất cả phần còn thiếu. Họ tên giáo viên mặc định là tên tài khoản đang đăng nhập, trừ khi họ nói khác.
- Ngày dùng định dạng DD/MM/YYYY. Hôm nay là ${today} (giờ Việt Nam). Khi giáo viên nói "tuần sau", "thứ Hai tới", hãy quy ra ngày cụ thể và nêu lại để họ xác nhận.
- Khi liên quan, nhắc quy định đăng ký trước ít nhất 24 giờ.
- Trả lời bằng tiếng Việt, ngắn gọn, thân thiện. Liệt kê thiết bị bằng các dòng bắt đầu bằng "- ". Không dùng bảng hay tiêu đề Markdown.
- Câu hỏi ngoài phạm vi thiết bị dạy học và mượn trả: từ chối nhẹ nhàng và đưa về phạm vi của bạn.

Ngữ cảnh: tài khoản đang đăng nhập tên "${name}".${subject ? ` Giáo viên đang xem trang môn ${subject.name}; ưu tiên môn này khi câu hỏi chưa nêu rõ môn.` : ""}`;
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const msgs = [];
  for (const m of raw.slice(-MAX_TURNS)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (content) msgs.push({ role: m.role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

/** Vòng lặp tool use: gọi model -> chạy tool -> trả kết quả -> lặp đến khi model trả lời bằng văn bản. */
export async function runConversation({ client, system, messages, ctx }) {
  const convo = [...messages];
  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await client.messages.create({
      model: getModel(),
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages: convo,
    });
    convo.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") {
      const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return text || "Mình chưa có câu trả lời phù hợp. Bạn thử hỏi cụ thể hơn nhé.";
    }

    const results = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      let output, isError = false;
      ctx.toolsUsed?.push(block.name);
      try {
        output = runTool(block.name, block.input, ctx);
      } catch (err) {
        console.error(`Tool ${block.name} lỗi:`, err);
        output = { error: "Công cụ gặp lỗi, hãy thử lại hoặc báo cho quản trị viên." };
        isError = true;
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output), ...(isError && { is_error: true }) });
    }
    convo.push({ role: "user", content: results });
  }
  return "Mình xử lý chưa xong yêu cầu này. Bạn thử chia nhỏ câu hỏi hoặc nêu rõ môn, khối và ngày cần mượn nhé.";
}

export function createChatRouter({ requireAuth, client: injected } = {}) {
  const router = Router();
  let cached = injected || null;
  const getClient = () => {
    if (!cached && process.env.ANTHROPIC_API_KEY) cached = new Anthropic(); // đọc ANTHROPIC_API_KEY từ môi trường
    return cached;
  };

  router.post("/", requireAuth, async (req, res) => {
    const user = req.session.user;
    const messages = sanitizeMessages(req.body?.messages);
    if (!messages) return res.status(400).json({ error: "Tin nhắn không hợp lệ." });
    if (rateLimited(user.id)) return res.status(429).json({ error: "Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút." });

    const client = getClient();
    if (!client) return res.status(503).json({ error: "Chatbot chưa được cấu hình (thiếu ANTHROPIC_API_KEY)." });

    const subjectId = SUBJECTS.some((s) => s.id === req.body?.context?.subjectId) ? req.body.context.subjectId : undefined;
    const ctx = { user, draft: null };
    try {
      const reply = await runConversation({ client, system: buildSystem(user, subjectId), messages, ctx });
      res.json({ reply, draft: ctx.draft });
    } catch (err) {
      console.error("Chat error:", err?.status, err?.message);
      if (err?.status === 429) return res.status(503).json({ error: "Trợ lý đang bận, vui lòng thử lại sau ít phút." });
      if (err?.status === 401 || err?.status === 403) return res.status(503).json({ error: "Chatbot chưa được cấu hình đúng." });
      res.status(502).json({ error: "Trợ lý tạm thời không phản hồi, vui lòng thử lại." });
    }
  });

  return router;
}
