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
    access_type: "offline",
    state,
    prompt: "select_account",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code) {
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

  const data = await response.json();
  if (data.error) {
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

  const data = await response.json();
  if (data.error) {
    throw new Error(`Google profile error: ${data.error.message || ""}`);
  }
  return data;
}

/**
 * Check if email is admin
 */
export function isAdmin(email) {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.toLowerCase());
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
export function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Vui lòng đăng nhập" });
  }
  if (!req.session.user.isAdmin) {
    return res.status(403).json({ error: "Bạn không có quyền truy cập" });
  }
  next();
}
