/**
 * Chạy:  cd backend && node eval/run-eval.js
 * Cần ANTHROPIC_API_KEY trong .env. Kết quả chi tiết ghi vào eval/last-run.json.
 * Lưu ý: ca kiểm tra tồn kho dùng dữ liệu hiện có trong data/records.json; nên chạy trên bản sao dữ liệu thử.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { evaluate } from "./evaluate.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Thiếu ANTHROPIC_API_KEY trong môi trường / backend/.env");
  process.exit(1);
}
const cases = JSON.parse(fs.readFileSync(path.join(dir, "cases.json"), "utf-8"));
console.log(`Mô hình: ${process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"} | ${cases.length} ca\n`);

const results = await evaluate({
  client: new Anthropic(),
  cases,
  onResult: (r) => console.log(`${r.pass ? "ĐẠT  " : "TRƯỢT"} ${r.id}${r.pass ? "" : "\n        - " + r.fails.join("\n        - ")}`),
});

const passed = results.filter((r) => r.pass).length;
console.log(`\nKết quả: ${passed}/${results.length} ca đạt (${Math.round((passed / results.length) * 100)}%)`);
fs.writeFileSync(path.join(dir, "last-run.json"), JSON.stringify(results, null, 2));
process.exit(passed === results.length ? 0 : 1);
