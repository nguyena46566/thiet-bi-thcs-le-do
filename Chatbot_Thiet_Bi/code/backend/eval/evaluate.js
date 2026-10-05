/**
 * Chấm điểm chatbot trên bộ câu hỏi mẫu (cases.json).
 * Mỗi ca có thể kiểm tra:
 *   tools        - các tool BẮT BUỘC đã được gọi
 *   notTools     - các tool KHÔNG được gọi
 *   includes     - các chuỗi BẮT BUỘC có trong câu trả lời (không phân biệt hoa/thường, dấu)
 *   includesAny  - ít nhất một chuỗi trong danh sách phải có
 *   excludes     - các chuỗi KHÔNG được có
 *   draft        - true/false: có bản nháp phiếu hay không
 *   draftIncludes- { trường: chuỗi } nội dung phải có trong bản nháp
 */
import { runConversation, buildSystem } from "../chat.js";
import { normalize } from "../equipment.js";

const has = (text, needle) => normalize(text).includes(normalize(needle));

export function checkCase(c, { reply, draft, toolsUsed }) {
  const fails = [];
  for (const t of c.tools || []) if (!toolsUsed.includes(t)) fails.push(`thiếu tool ${t}`);
  for (const t of c.notTools || []) if (toolsUsed.includes(t)) fails.push(`không được gọi tool ${t}`);
  for (const s of c.includes || []) if (!has(reply, s)) fails.push(`thiếu "${s}"`);
  if (c.includesAny && !c.includesAny.some((s) => has(reply, s))) fails.push(`thiếu một trong [${c.includesAny.join(" | ")}]`);
  for (const s of c.excludes || []) if (has(reply, s)) fails.push(`không được chứa "${s}"`);
  if (c.draft === true && !draft) fails.push("cần có bản nháp");
  if (c.draft === false && draft) fails.push("không được có bản nháp");
  for (const [k, v] of Object.entries(c.draftIncludes || {})) {
    if (!draft || !has(String(draft[k] ?? ""), v)) fails.push(`bản nháp.${k} thiếu "${v}"`);
  }
  return fails;
}

export async function evaluate({ client, cases, user = { id: "eval", name: "Nguyễn Văn A" }, onResult }) {
  const results = [];
  for (const c of cases) {
    const ctx = { user, draft: null, toolsUsed: [] };
    let reply = "", error = null;
    try {
      reply = await runConversation({ client, system: buildSystem(user, c.subjectId), messages: c.messages, ctx });
    } catch (e) {
      error = e.message;
    }
    const fails = error ? [`lỗi gọi API: ${error}`] : checkCase(c, { reply, draft: ctx.draft, toolsUsed: ctx.toolsUsed });
    const r = { id: c.id, pass: fails.length === 0, fails, reply, tools: ctx.toolsUsed, draft: ctx.draft };
    results.push(r);
    onResult?.(r);
  }
  return results;
}
