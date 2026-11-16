// Mở một bản sao lưu ngoài máy chủ (để kiểm tra hoặc lấy lại dữ liệu):
//   BACKUP_KEY="khoa-bi-mat" node backend/tools/giai-ma-sao-luu.mjs sao-luu-2026-11-16.tbk > du-lieu.json
import fs from "fs";
import crypto from "crypto";
import zlib from "zlib";
const file = process.argv[2];
if (!file) { console.error("Cách dùng: BACKUP_KEY=... node giai-ma-sao-luu.mjs <tệp .tbk hoặc .json.gz>"); process.exit(1); }
let buf = fs.readFileSync(file);
if (buf.subarray(0, 4).toString() === "TBK1") {
  if (!process.env.BACKUP_KEY) { console.error("Tệp đã mã hóa: cần đặt BACKUP_KEY"); process.exit(1); }
  const key = crypto.createHash("sha256").update(process.env.BACKUP_KEY).digest();
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(4, 16));
  d.setAuthTag(buf.subarray(16, 32));
  buf = Buffer.concat([d.update(buf.subarray(32)), d.final()]);
}
process.stdout.write(zlib.gunzipSync(buf).toString("utf8"));
