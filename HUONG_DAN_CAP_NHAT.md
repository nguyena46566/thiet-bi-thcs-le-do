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

## Dữ liệu mẫu để trình chiếu (bản v24)

Đăng nhập quản trị hệ thống > **Hệ thống > Sao lưu, trạng thái hệ thống > Dữ liệu mẫu > Tạo dữ liệu mẫu**. Dùng được cả khi đã tắt `TEST_ACCOUNTS` (không cần bật tài khoản thử nghiệm).

- Thiết bị, sách, phòng mẫu có chữ "(mẫu)" hoặc mã riêng (SGK-M0001, BD-M0001...). **Dữ liệu thật không bị thay đổi.**
- Khi tắt `TEST_ACCOUNTS`, mỗi giáo viên mẫu có **mật khẩu ngẫu nhiên**, chỉ hiện một lần lúc tạo (có nút chép; quên thì bấm "Đặt lại mật khẩu tài khoản mẫu").
- Trong lúc bật, các trang quản lý có biểu ngữ vàng cảnh báo số liệu có lẫn dữ liệu mẫu.
- **Xóa dữ liệu mẫu** chỉ xóa phần mẫu và mọi thao tác thử trên phần đó; dữ liệu thật nhập thêm trong lúc bật vẫn giữ nguyên.

## Tính năng mới ở bản v25

- **Báo hỏng thiết bị:** giáo viên quét mã QR thiết bị > "Báo thiết bị hỏng" (số lượng, mô tả). Nhân viên thiết bị xác nhận ở **Bảo trì – sửa chữa > Báo hỏng chờ xử lý** thì thiết bị mới chuyển sang "hỏng" (không cho mượn). Ban giám hiệu chỉ xem.
- **Kiểm kê bằng quét QR:** trong đợt kiểm kê, quét nhãn QR (hoặc gõ mã) vào ô "Quét mã QR thiết bị"; mỗi lần quét đếm thêm 1. Có thể kiểm kê một phần bằng cách chỉ định danh sách thiết bị (`equipmentIds`) khi mở đợt.
- **In lý lịch thiết bị:** Danh mục thiết bị > Lịch sử > "In lý lịch" (thông tin, nhật ký thay đổi, lịch sử mượn, chỗ ký).
- **Tra cứu sách:** dải "Sách mới nhập" (8 đầu sách mới nhất) khi chưa gõ tìm kiếm.

## Tài khoản có sẵn từng vai trò trong dữ liệu mẫu (bản v26)

Bấm **Tạo dữ liệu mẫu** là hệ thống tạo luôn, không cần tự gán quyền: `tb.mau` (nhân viên thiết bị), `tv.mau` (thủ thư), `bgh.mau` (Ban giám hiệu), `tt.mau` (tổ trưởng Khoa học tự nhiên) và 12 giáo viên mẫu (`gv.hong`, `gv.nam`...). Mật khẩu ngẫu nhiên hiện một lần lúc tạo (có nút "Chép tất cả").

Lưu ý: trong lúc có `bgh.mau`, thanh lý, xác nhận mất, mua sắm, điểm thi đua chuyển sang chờ Ban giám hiệu duyệt (đúng như khi dùng thật). **Xóa dữ liệu mẫu** là xóa luôn các tài khoản này.

## Trang riêng của từng người quản lý (bản v27)

Sau khi đăng nhập, mỗi người vào thẳng trang "việc cần làm hôm nay" của mình (mục **Trang của tôi** ở menu trái):

- **Nhân viên thiết bị** (`#nv-thiet-bi`): phiếu chờ duyệt (duyệt, từ chối ngay trên trang), đến hạn và quá hạn trả, báo hỏng của giáo viên, đề xuất đã duyệt chờ mua, cảnh báo hóa chất, việc đang chờ Ban giám hiệu.
- **Nhân viên thư viện** (`#thu-thu`): sách quá hạn, chờ bồi thường, phiếu nhập chờ kiểm đếm, lớp chưa đủ tiết đọc, sách chưa xếp giá, số liệu trong ngày.
- **Quản trị hệ thống** (`#quan-tri`): tài khoản chờ duyệt, yêu cầu dữ liệu cá nhân, cấu hình còn thiếu, đăng nhập lỗi, sao lưu, dữ liệu mẫu.
- **Ban giám hiệu** (`#bgh`) và **tổ trưởng** (`#to-truong`): như các bản trước.
