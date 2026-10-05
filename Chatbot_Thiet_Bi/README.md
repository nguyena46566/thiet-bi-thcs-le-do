# Chatbot tư vấn thiết bị - gói tổng hợp

## Cấu trúc
- `code/`  : file mới và file đã sửa, cùng đường dẫn với dự án "Website Quan Ly Thiet Bi". Giải nén đè vào thư mục dự án.
- `docs/De_xuat_va_trien_khai_chatbot_AI.docx` : tài liệu đề xuất + kết quả triển khai (10 mục).

## Cài đặt
1. Chép nội dung `code/` đè vào dự án.
2. `cd backend && npm install` (thêm @anthropic-ai/sdk).
3. Thêm vào `backend/.env` (và biến môi trường trên Render):
   ANTHROPIC_API_KEY=...
   ANTHROPIC_MODEL=claude-haiku-4-5-20251001   (tùy chọn)
4. Chạy lại ứng dụng, đăng nhập, bấm nút chat ở góc phải dưới.
5. Chạy bộ kiểm thử chatbot: `cd backend && node eval/run-eval.js`

## File mới
- backend/chat.js            Endpoint POST /api/chat (vòng lặp tool use, giới hạn tần suất)
- backend/chatTools.js       5 công cụ: search_equipment, suggest_for_lesson, check_availability, draft_borrow_request, get_rules
- backend/equipment.js       Tìm kiếm bỏ dấu, tồn kho theo ngày, gợi ý theo bài, tra nội quy, quy tắc 24 giờ
- backend/catalog/*.json     Danh mục thiết bị, bài học (PPCT), nội quy - DỮ LIỆU MẪU, cần thay bằng dữ liệu thật
- backend/eval/              14 ca kiểm thử + trình chấm điểm
- src/ChatWidget.tsx         Widget chat + thẻ bản nháp phiếu mượn

## File đã sửa (chỉ vài dòng mỗi file)
- backend/server.js          Gắn router /api/chat; kiểm tra 24 giờ ở POST /api/records
- backend/package.json       Thêm @anthropic-ai/sdk
- backend/.env.example       Thêm ANTHROPIC_API_KEY, ANTHROPIC_MODEL
- src/api.ts                 Thêm sendChat và kiểu ChatMessage, BorrowDraft
- src/App.tsx                Gắn <ChatWidget />, làm mới danh sách sau khi gửi phiếu
- render.yaml                Thêm biến ANTHROPIC_API_KEY

## Cần lưu ý
- PERIOD_START (equipment.js) là giờ bắt đầu tiết GIẢ ĐỊNH, hãy sửa theo thời khóa biểu của trường.
- Chưa chạy thử với Claude API thật và trên trình duyệt.
- records.json trên Render sẽ mất sau mỗi lần deploy; cần CSDL bền vững.
- Không có file .env nào được đọc hay đóng gói.
