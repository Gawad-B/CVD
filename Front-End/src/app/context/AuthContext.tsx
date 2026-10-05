import { createContext, useCallback, useContext, useRef, useState, ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { getCurrentUser, loginUser as apiLoginUser, logoutUser as apiLogoutUser } from '../api/client';
import { setSessionExpiredHandler } from '../api/errors';
import type { User } from '../api/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  sessionEnded: SessionEnded | null;
  clearSessionEnded: () => void;
}

/** Why the previous session ended without the user logging out (e.g. the demo expired mid-use). */
export interface SessionEnded {
  code?: string;
  message: string;
  contactEmail?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('cardio_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('cardio_token');
  });
  const userRef = useRef(user);
  userRef.current = user;
  const [sessionEnded, setSessionEnded] = useState<SessionEnded | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      return;
    }

    const current = userRef.current;
    getCurrentUser()
      .then((rawUser) => {
        const validatedUser: User = {
          userId: Number(rawUser.id ?? rawUser.user_id ?? current?.userId ?? 0),
          username: String(rawUser.username ?? current?.username ?? ''),
          email: String(rawUser.email ?? current?.email ?? ''),
          fullName: String(rawUser.full_name ?? rawUser.username ?? current?.fullName ?? ''),
          role: (rawUser.role ?? current?.role ?? 'clinician') as User['role'],
          isActive: true,
          createdAt: rawUser.created_at ?? current?.createdAt,
          isDemo: Boolean(rawUser.is_demo),
          demoExpiresAt: rawUser.demo_expires_at ?? null,
        };
        setUser(validatedUser);
        localStorage.setItem('cardio_user', JSON.stringify(validatedUser));
      })
      .catch(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('cardio_user');
        localStorage.removeItem('cardio_token');
      });
  }, [token]);

  useEffect(() => {
    // Any authenticated call answered with 403 demo_expired ends the session.
    setSessionExpiredHandler((error) => {
      setUser(null);
      setToken(null);
      localStorage.removeItem('cardio_user');
      localStorage.removeItem('cardio_token');
      // RequireAuth redirects to /login; Login shows this message once.
      setSessionEnded({ code: error.code, message: error.message, contactEmail: error.contactEmail });
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await apiLoginUser(username, password);

      // Extract user and token from response
      const userData = response as any;
      const loggedInUser: User = {
        userId: userData.id || userData.userId || userData.user_id || 0,
        username: userData.username,
        email: userData.email || '',
        fullName: userData.full_name || userData.username || '',
        role: userData.role || 'clinician',
        isActive: true,
        createdAt: userData.created_at,
        isDemo: Boolean(userData.is_demo),
        demoExpiresAt: userData.demo_expires_at ?? null,
      };

      const authToken = userData.token || userData.access_token || '';

      setUser(loggedInUser);
      setToken(authToken);
      localStorage.setItem('cardio_user', JSON.stringify(loggedInUser));
      localStorage.setItem('cardio_token', authToken);
      const from = (location.state as { from?: unknown } | null)?.from;
      navigate(typeof from === 'string' && from.startsWith('/') && from !== '/login' && from !== '/' ? from : '/dashboard');
    } catch (error) {
      throw error;
    }
  };

  const clearSessionEnded = useCallback(() => setSessionEnded(null), []);

  const logout = () => {
    if (token) {
      void apiLogoutUser().catch(() => undefined);
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('cardio_user');
    localStorage.removeItem('cardio_token');
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user, sessionEnded, clearSessionEnded }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function getAuthToken(): string | null {
  return localStorage.getItem('cardio_token');
}
