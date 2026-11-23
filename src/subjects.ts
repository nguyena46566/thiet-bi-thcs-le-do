// Các môn học có thiết bị (trùng mã với máy chủ: backend/chatTools.js)
export const SUBJECTS = [
  { id: "hoa-hoc", group: "Tổ Khoa học tự nhiên", name: "Hóa học", color: "#059669", img: "https://images.unsplash.com/photo-1614308460927-5024ba2e1dcb?w=600&h=400&fit=crop&auto=format", desc: "Thiết bị thí nghiệm, dụng cụ phòng lab hóa học" },
  { id: "vat-li", group: "Tổ Khoa học tự nhiên", name: "Vật lí", color: "#2563eb", img: "https://images.unsplash.com/photo-1763098844157-d0fffcc966a1?w=600&h=400&fit=crop&auto=format", desc: "Dụng cụ thí nghiệm, mô hình vật lí" },
  { id: "sinh-hoc", group: "Tổ Khoa học tự nhiên", name: "Sinh học", color: "#16a34a", img: "https://images.unsplash.com/photo-1614308459036-779d0dfe51ff?w=600&h=400&fit=crop&auto=format", desc: "Kính hiển vi, tiêu bản sinh học, mô hình" },
  { id: "cong-nghe", group: "Tổ Khoa học tự nhiên", name: "Công nghệ", color: "#7c3aed", img: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&h=400&fit=crop&auto=format", desc: "Thiết bị công nghệ, máy tính, công cụ kỹ thuật" },
  { id: "toan-hoc", group: "Tổ Toán – Tin", name: "Toán học", color: "#dc2626", img: "https://images.unsplash.com/photo-1635372722656-389f87a941b7?w=600&h=400&fit=crop&auto=format", desc: "Bộ đồ dùng hình học, thước, compa, mô hình" },
  { id: "lich-su-dia-li", group: "Tổ Khoa học xã hội", name: "Lịch Sử - Địa lí", color: "#d97706", img: "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=600&h=400&fit=crop&auto=format", desc: "Bản đồ, quả địa cầu, tranh ảnh lịch sử" },
  { id: "gdtc", group: "Tổ Nghệ thuật – Thể chất", name: "GDTC", color: "#0891b2", img: "https://images.unsplash.com/photo-1559369064-c4d65141e408?w=600&h=400&fit=crop&auto=format", desc: "Dụng cụ thể dục thể thao, bóng, lưới" },
  { id: "ngu-van-gdcd", group: "Tổ Khoa học xã hội", name: "Ngữ văn - GDCD", color: "#be185d", img: "https://images.unsplash.com/photo-1604866830893-c13cafa515d5?w=600&h=400&fit=crop&auto=format", desc: "Sách tham khảo, tranh ảnh minh họa, đồ dùng" },
  { id: "tieng-anh", group: "Tổ Ngoại ngữ", name: "Tiếng Anh", color: "#0e7490", img: "https://images.unsplash.com/photo-1543109740-4bdb38fda756?w=600&h=400&fit=crop&auto=format", desc: "Sách giáo khoa, thiết bị nghe nhìn, flash cards" },
]

/** Màu nền cho nhãn chữ trắng: tối hơn màu môn 30% để đủ tương phản (≥ 4,5:1) */
export function badgeColor(hex?: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "")
  if (!m) return "#4b5563"
  const n = parseInt(m[1], 16)
  const d = (v: number) => Math.round(v * 0.7).toString(16).padStart(2, "0")
  return `#${d((n >> 16) & 255)}${d((n >> 8) & 255)}${d(n & 255)}`
}
