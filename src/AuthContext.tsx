import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { fetchCurrentUser, getGoogleLoginURL, logout as apiLogout, type User } from "@/api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Đã chờ lâu (máy chủ đang khởi động) */
  slow: boolean;
  /** Thử nhiều lần vẫn không kết nối được máy chủ */
  offline: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  slow: false,
  offline: false,
  login: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(false);

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
        setUser(u); setOffline(false); setLoading(false);
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

  const login = () => {
    // Redirect to backend Google OAuth
    window.location.href = getGoogleLoginURL();
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, slow, offline, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
