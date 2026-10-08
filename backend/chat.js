/**
 * POST /api/chat  - chatbot tư vấn thiết bị (Google Gemini Interactions API)
 */
import { Router } from "express";
import { TOOLS, SUBJECTS, runTool } from "./chatTools.js";
import { todayVN, formatDate } from "./equipment.js";

const MAX_TURNS = 12;
const MAX_CHARS = 2000;
const MAX_STEPS = 6;
const RATE_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 30_000;

const getModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
const getApiKey = () => process.env.GEMINI_API_KEY || "";

// ---------- Rate limit ----------
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

// ---------- Chuyển đổi tools sang định dạng Gemini ----------
function toGeminiTools(tools) {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];
}

// ---------- System prompt ----------
export function buildSystem(user, subjectId) {
  const today = formatDate(todayVN());
  const name = String(user?.name || "").replace(/[\r\n]+/g, " ").slice(0, 60) || "(không rõ)";
  const subject = SUBJECTS.find((s) => s.id === subjectId);
  return `Bạn là "Trợ lý thiết bị" của website quản lý thiết bị dạy học, Trường THCS Lê Độ. Bạn giúp giáo viên: tìm thiết bị, gợi ý thiết bị theo bài dạy, kiểm tra thiết bị còn hay hết, tra cứu nội quy và soạn sẵn phiếu mượn.

Nguyên tắc:
- Mọi thông tin về thiết bị, tồn kho, lịch mượn và nội quy phải lấy từ kết quả công cụ. Không bịa tên thiết bị, số lượng, bài học hay quy định.
- Muốn nói thiết bị còn hay hết, phải gọi check_availability. Không đoán.
- Chỉ soạn bản nháp phiếu mượn bằng draft_borrow_request. Bạn không gửi được phiếu - giáo viên bấm "Gửi yêu cầu" và quản trị viên duyệt.
- Trước khi soạn phiếu cần đủ: thiết bị và số lượng, lớp, ngày mượn, ngày trả, tiết trong ngày (Tiết 1 đến Tiết 5), tiết theo PPCT. Họ tên giáo viên mặc định là tên tài khoản đang đăng nhập.
- Ngày dùng định dạng DD/MM/YYYY. Hôm nay là ${today} (giờ Việt Nam).
- Trả lời bằng tiếng Việt, ngắn gọn, thân thiện. Không dùng bảng hay tiêu đề Markdown.
- Câu hỏi ngoài phạm vi thiết bị: từ chối nhẹ nhàng.

Ngữ cảnh: tài khoản đang đăng nhập tên "${name}".${subject ? ` Giáo viên đang xem trang môn ${subject.name}; ưu tiên môn này.` : ""}`;
}

// ---------- Gọi Gemini generateContent API ----------
async function callGemini({ apiKey, model, systemInstruction, contents, tools }) {
  // API key gửi qua header (không để trên URL, tránh lộ trong log)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    tools,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }

  return data;
}

// ---------- Vòng lặp tool use ----------
export async function runConversation({ apiKey, model, system, messages, ctx }) {
  const geminiTools = toGeminiTools(TOOLS);

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const data = await callGemini({
      apiKey, model,
      systemInstruction: system,
      contents,
      tools: geminiTools,
    });

    const candidate = data.candidates?.[0];
    if (!candidate) return "Mình chưa có câu trả lời phù hợp. Bạn thử hỏi cụ thể hơn nhé.";

    const parts = candidate.content?.parts || [];
    contents.push({ role: "model", parts });

    const functionCalls = parts.filter((p) => p.functionCall);

    if (!functionCalls.length) {
      const text = parts.filter((p) => p.text).map((p) => p.text).join("\n").trim();
      return text || "Mình chưa có câu trả lời phù hợp. Bạn thử hỏi cụ thể hơn nhé.";
    }

    const functionResults = await Promise.all(functionCalls.map(async (p) => {
      const { name, args } = p.functionCall;
      let output;
      try {
        output = await runTool(name, args || {}, ctx);
      } catch (err) {
        console.error(`Tool ${name} lỗi:`, err);
        output = { error: "Công cụ gặp lỗi, hãy thử lại." };
      }
      return { functionResponse: { name, response: { output } } };
    }));

    contents.push({ role: "user", parts: functionResults });
  }

  return "Mình xử lý chưa xong. Bạn thử hỏi cụ thể hơn nhé.";
}

// ---------- Router ----------
export function createChatRouter({ requireAuth } = {}) {
  const router = Router();

  router.post("/", requireAuth, async (req, res) => {
    const user = req.session.user;
    const apiKey = getApiKey();
    if (!apiKey) return res.status(503).json({ error: "Chatbot chưa được cấu hình (thiếu GEMINI_API_KEY)." });

    const rawMessages = req.body?.messages;
    if (!Array.isArray(rawMessages)) return res.status(400).json({ error: "Tin nhắn không hợp lệ." });

    const messages = [];
    for (const m of rawMessages.slice(-MAX_TURNS)) {
      if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
      const content = m.content.trim().slice(0, MAX_CHARS);
      if (content) messages.push({ role: m.role, content });
    }
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length) return res.status(400).json({ error: "Tin nhắn không hợp lệ." });

    if (rateLimited(user.id)) return res.status(429).json({ error: "Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút." });

    const subjectId = SUBJECTS.some((s) => s.id === req.body?.context?.subjectId)
      ? req.body.context.subjectId : undefined;

    const ctx = { user, draft: null };
    try {
      const reply = await runConversation({
        apiKey, model: getModel(),
        system: buildSystem(user, subjectId),
        messages, ctx,
      });
      res.json({ reply, draft: ctx.draft });
    } catch (err) {
      console.error("Chat error:", err?.status, err?.message);
      if (err?.status === 429) return res.status(429).json({ error: "Trợ lý đang bận, vui lòng thử lại sau 1 phút." });
      if (err?.status === 503) return res.status(503).json({ error: "Model đang quá tải, vui lòng thử lại sau ít phút." });
      if (err?.name === "TimeoutError") return res.status(504).json({ error: "Trợ lý phản hồi quá lâu, vui lòng thử lại." });
      // Không trả nguyên văn lỗi của Google cho người dùng (có thể lộ cấu hình)
      res.status(502).json({ error: "Trợ lý đang gặp sự cố, vui lòng thử lại sau." });
    }
  });

  return router;
}
