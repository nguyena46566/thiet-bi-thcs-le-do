import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { fetchCurrentUser, getGoogleLoginURL, logout as apiLogout, pendingAccount, type User } from "@/api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Đã chờ lâu (máy chủ đang khởi động) */
  slow: boolean;
  /** Thử nhiều lần vẫn không kết nối được máy chủ */
  offline: boolean;
  /** Mở trang đăng nhập (Google, mật khẩu, đăng ký) */
  login: () => void;
  loginGoogle: () => void;
  /** Gọi sau khi đăng nhập bằng mật khẩu thành công */
  setLoggedIn: (u: User) => void;
  /** Tài khoản Google đã đăng nhập nhưng chưa được duyệt */
  pending: { name: string; email: string } | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  slow: false,
  offline: false,
  login: () => {},
  loginGoogle: () => {},
  setLoggedIn: () => {},
  pending: null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState<{ name: string; email: string } | null>(null);

  // Lấy thông tin đăng nhập; nếu máy chủ đang khởi động (Render "ngủ" dậy, đang nối CSDL) thì thử lại,
  // tối đa khoảng 2 phút rồi mới hiện trang ở chế độ khách kèm thông báo — không xoay mãi.
  useEffect(() => {
    let stop = false;
    let tries = 0;
    const slowTimer = setTimeout(() => { if (!stop) setSlow(true); }, 4000);
    const attempt = async () => {
      try {
        const u = await fetchCurrentUser();
        if (stop) return;
        setUser(u); setPending(pendingAccount); setOffline(false); setLoading(false);
      } catch {
        if (stop) return;
        tries++;
        if (tries < 6) setTimeout(attempt, 5000);
        else { setOffline(true); setLoading(false); }
      }
    };
    attempt();
    return () => { stop = true; clearTimeout(slowTimer); };
  }, []);

  const loginGoogle = () => {
    // Chuyển sang đăng nhập Google ở máy chủ
    window.location.href = getGoogleLoginURL();
  };
  const login = () => { window.location.hash = "dang-nhap"; };
  const setLoggedIn = (u: User) => { setUser(u); setPending(null); };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, slow, offline, login, loginGoogle, setLoggedIn, pending, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
