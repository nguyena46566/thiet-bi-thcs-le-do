# Bộ kiểm thử tự động (API) – 558 kiểm tra, 10 nhóm

| Tệp | Nội dung | Số kiểm tra |
| --- | --- | --- |
| s1_auth.py | đăng nhập, đăng ký, duyệt, phân quyền, nhật ký, đồng ý dữ liệu | 62 |
| s2_borrow.py | đăng ký mượn, chống trùng, phòng, duyệt, trả hỏng/mất, điểm thi đua | 61 |
| s3_inventory.py | ghi tăng, thanh lý (đề nghị - duyệt), bảo trì, kiểm kê, hóa chất, nhật ký | 66 |
| s4_principal.py | Ban giám hiệu: mất, mua sắm, kế hoạch, quyết định, danh mục TT 38 | 54 |
| s5_library.py | thư viện: nhận sách, ĐKCB, mượn - trả, bồi thường, tiết đọc, kiểm kê | 78 |
| s6_privacy.py | hồ sơ, dữ liệu cá nhân, khách vãng lai, ẩn danh tự động | 36 |
| s7_ops.py | sao lưu, khôi phục, dữ liệu mẫu (chế độ thử nghiệm), thông báo, header, nén | 51 |
| s8_matrix.py | phân công, phân quyền: ma trận 7 vai trò x 43 chức năng | 69 |
| s9_demo_tools.py | dữ liệu mẫu an toàn trên web thật, rà soát nhanh TT 38, nhập đơn giá, mã minh chứng | 49 |
| s10_issues_opac.py | giáo viên báo hỏng thiết bị, kiểm kê một phần, sách mới nhập | 32 |

Đã chạy lặp 5 vòng liên tiếp (mỗi nhóm trên cơ sở dữ liệu mới, kèm 3 bộ kiểm tra giao diện bằng trình duyệt tự động): 5/5 vòng đạt toàn bộ.

## Cách chạy (cho người có kiến thức lập trình)
1. Cần PostgreSQL ở `localhost:5432` (user `app`, mật khẩu `app`, quyền tạo cơ sở dữ liệu `thietbi`).
2. `start.sh`, `reset.mjs`, `sql.mjs` đang ghi sẵn đường dẫn `/home/claude/w/...`: **sửa cho khớp máy bạn**.
3. Mỗi nhóm chạy trên cơ sở dữ liệu mới: `./start.sh TEST_ACCOUNTS=1 BACKUP_KEY=k` rồi `python3 s1_auth.py` (s7 tự khởi động lại máy chủ).
4. **Chỉ chạy trên máy thử nghiệm.** Mỗi lần khởi động bộ này xóa sạch cơ sở dữ liệu `thietbi`.

Các kiểm tra giao diện (trình duyệt tự động) chưa nằm trong bộ này.
