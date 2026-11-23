/**
 * Google OAuth 2.0 Authentication Module
 *
 * Flow:
 * 1. Frontend redirect đến /api/auth/google/login
 * 2. Server redirect đến Google OAuth consent page
 * 3. User đồng ý -> Google redirect về /api/auth/google/callback?code=xxx
 * 4. Server đổi code lấy access_token
 * 5. Server dùng access_token lấy thông tin user (email, name, avatar)
 * 6. Lưu user vào session, redirect về frontend
 */

import crypto from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * Get Google OAuth consent URL
 */
export function getGoogleAuthURL(req) {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code) {
  if (typeof code !== "string" || code.length > 2048) throw new Error("Mã xác thực không hợp lệ");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(`Google token error: ${data.error} - ${data.error_description || ""}`);
  }
  return data;
}

/**
 * Get user profile from Google
 */
export async function getGoogleProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(`Google profile error: ${data.error?.message || response.status}`);
  }
  return data;
}

/**
 * So sánh state trả về từ Google với state đã lưu trong session (chống CSRF đăng nhập).
 * State chỉ dùng được một lần.
 */
export function verifyOAuthState(req, state) {
  const expected = req.session?.oauthState;
  delete req.session.oauthState;
  if (!expected || typeof state !== "string" || state.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected));
}

/**
 * Check if email is admin
 */
const emailList = (v) => (v || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Ban giám hiệu (cấp cao nhất): xác nhận thiết bị bị mất. Cấu hình bằng PRINCIPAL_EMAILS. */
export function isPrincipal(email) {
  return !!email && emailList(process.env.PRINCIPAL_EMAILS).includes(email.toLowerCase());
}
// Có Ban giám hiệu khi: khai báo PRINCIPAL_EMAILS, hoặc có tài khoản được gán vai trò Ban giám hiệu (users.js cập nhật)
let principalActive = false;
export const setPrincipalActive = (v) => { principalActive = !!v; };
export const principalConfigured = () => emailList(process.env.PRINCIPAL_EMAILS).length > 0 || principalActive;

export function isAdmin(email) {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // Ban giám hiệu cũng có quyền vào trang quản trị
  return adminEmails.includes(email.toLowerCase()) || isPrincipal(email);
}

/**
 * Auth middleware - require logged in
 */
export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Vui lòng đăng nhập" });
  }
  next();
}

/**
 * Admin middleware - require admin role
 */
/** Người có quyền quyết định: Ban giám hiệu khi trường đã có tài khoản Ban giám hiệu, nếu chưa thì nhân viên thiết bị */
export const canDecide = (u) => (principalConfigured() ? !!u?.isPrincipal : !!u?.isAdmin);

/**
 * Việc Ban giám hiệu được GHI dữ liệu (ngoài việc xem): chỉ ra quyết định.
 * Tác nghiệp hằng ngày (nhập kho, trả thiết bị, kiểm kê, thanh lý…) do nhân viên thiết bị làm để tách người làm và người duyệt.
 */
const PRINCIPAL_WRITE = [
  ["POST", /^\/api\/loss-reports\/[^/]+\/(confirm|reject)$/],
  ["POST", /^\/api\/proposals\/[^/]+\/decide$/],
  ["POST", /^\/api\/disposals\/[^/]+\/decide$/],
  ["POST", /^\/api\/plans\/[^/]+\/decide$/],
  ["POST", /^\/api\/points\/(adjust|unlock)$/],
  ["PATCH", /^\/api\/records\/[^/]+\/status$/],
  ["PATCH", /^\/api\/notifications\/[^/]+\/read$/],
  ["POST", /^\/api\/notifications\/mark-all-read$/],
];
export function requireAdmin(req, res, next) {
  const u = req.session?.user;
  if (!u) return res.status(401).json({ error: "Vui lòng đăng nhập" });
  if (!u.isAdmin) return res.status(403).json({ error: "Bạn không có quyền truy cập" });
  if (u.isPrincipal && !u.isEquipment && req.method !== "GET" && req.method !== "HEAD") {
    const path = req.originalUrl.split("?")[0];
    if (!PRINCIPAL_WRITE.some(([m, re]) => m === req.method && re.test(path))) {
      return res.status(403).json({ error: "Ban giám hiệu xem và ra quyết định; thao tác này do nhân viên thiết bị thực hiện" });
    }
  }
  next();
}
