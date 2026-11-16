# Hướng dẫn cập nhật bản tối ưu

## Bước 1 — Đổi toàn bộ khóa bí mật (bắt buộc)

File `.env` thật đã từng được đẩy lên GitHub (commit `59c6a80` và `8fde3f3`). Xóa file ở commit sau không xóa được lịch sử, nên cần coi như các khóa sau đã lộ và đổi hết:

1. **Google Client Secret**: Google Cloud Console > APIs & Services > Credentials > chọn OAuth client > *Reset secret*.
2. **Mật khẩu ứng dụng Gmail (SMTP_PASS)**: myaccount.google.com/apppasswords > xóa mật khẩu cũ, tạo mật khẩu mới.
3. **ANTHROPIC_API_KEY**: console.anthropic.com > API Keys > xóa key cũ (web không còn dùng key này).
4. **GEMINI_API_KEY**: nằm trong file .rar đã chia sẻ, nên tạo key mới tại aistudio.google.com/apikey rồi xóa key cũ.
5. **SESSION_SECRET**: Render tự tạo giá trị mới (`generateValue`), không cần làm gì thêm.

## Bước 2 — Tạo cơ sở dữ liệu miễn phí (Supabase)

1. Đăng ký tại supabase.com > *New project* (chọn region Singapore cho gần Việt Nam).
2. Vào *Connect* (hoặc Project Settings > Database) > *Connection string* > chọn **Session pooler**. Render không kết nối được với địa chỉ "Direct connection" vì địa chỉ đó chỉ hỗ trợ IPv6.
3. Copy chuỗi dạng `postgresql://postgres.xxxx:[MẬT-KHẨU]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` và thay `[MẬT-KHẨU]` bằng mật khẩu database.

Không cần tạo bảng: server tự tạo bảng `records`, `notifications`, `user_sessions` khi chạy lần đầu. Nếu backend còn file `data/records.json` cũ thì dữ liệu trong đó được tự chép sang.

> Lưu ý: gói miễn phí của Supabase tạm dừng project nếu 7 ngày không có truy cập nào. Khi đó chỉ cần vào trang Supabase bấm *Restore*. Gói Postgres miễn phí của Render bị xóa sau 30 ngày, nên không nên dùng.

## Bước 3 — Cập nhật biến môi trường trên Render

Trong Render > service > *Environment*:

- Thêm `DATABASE_URL` = chuỗi kết nối ở bước 2
- Cập nhật `GOOGLE_CLIENT_SECRET`, `SMTP_PASS`, `GEMINI_API_KEY` bằng giá trị mới ở bước 1
- Xóa `ANTHROPIC_API_KEY` nếu còn

## Bước 4 — Đẩy code lên GitHub

Chép các file trong gói này đè vào thư mục dự án (giữ nguyên `.git`), rồi:

```
git add -A
git commit -m "Toi uu: Postgres, bao mat, sua loi"
git push
```

Render sẽ tự deploy lại. Log khởi động đúng sẽ có dòng `Lưu trữ: postgres`.

## Chạy thử trên máy

```
npm install
cd backend && npm install && cp .env.example .env   # rồi điền .env
npm run dev                                          # trong thư mục backend
```

Mở thêm một terminal ở thư mục gốc và chạy `npm run dev`. Nếu để trống `DATABASE_URL`, dữ liệu sẽ lưu vào `backend/data/`.

## Biến môi trường mới (bản v13 – v17)

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `BACKUP_KEY` | Nên có | Khóa mã hóa bản sao lưu. Chuỗi dài, ngẫu nhiên; **cất giữ ở nơi an toàn ngoài Render** – mất khóa thì không mở được bản sao lưu. Chưa đặt thì sao lưu tự động bị từ chối. |
| `TEST_ACCOUNTS` | Không | `1` = bật 6 tài khoản thử nghiệm (mật khẩu chung `Test@2026`). **Xóa khi dùng chính thức.** |
| `HIGH_VALUE_VND` | Không | Ngưỡng thiết bị giá trị cao (mặc định 5 000 000). |
| `GUEST_RETENTION_DAYS` | Không | Số ngày giữ thông tin khách vãng lai trước khi ẩn danh (mặc định 365). |

## Sao lưu tự động hằng đêm

1. Trên Render đặt `BACKUP_KEY` (và `CRON_SECRET` nếu chưa có).
2. Trên GitHub > Settings > Secrets and variables > Actions có `APP_URL`, `CRON_SECRET` (dùng chung với nhắc hạn trả).
3. Tệp `.github/workflows/sao-luu.yml` chạy lúc 1 giờ sáng, lưu bản sao lưu đã mã hóa ở tab **Actions > Sao luu du lieu > Artifacts**, giữ 30 ngày. Có thể bấm **Run workflow** để chạy ngay.
4. Mở bản sao lưu ngoài máy chủ: `BACKUP_KEY="..." node backend/tools/giai-ma-sao-luu.mjs tep.tbk > du-lieu.json`.
5. Khôi phục: đăng nhập quản trị hệ thống > **Hệ thống > Sao lưu, trạng thái hệ thống > Khôi phục**.
