import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { getCurrentUser, loginUser as apiLoginUser, logoutUser as apiLogoutUser } from '../api/client';
import type { User } from '../api/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
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
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user && location.pathname !== '/login') {
      navigate('/login');
    }
  }, [user, location.pathname, navigate]);

  useEffect(() => {
    if (!token) {
      return;
    }

    getCurrentUser()
      .then((rawUser) => {
        const validatedUser: User = {
          userId: Number(rawUser.id ?? rawUser.user_id ?? user?.userId ?? 0),
          username: String(rawUser.username ?? user?.username ?? ''),
          email: String(rawUser.email ?? user?.email ?? ''),
          fullName: String(rawUser.full_name ?? rawUser.username ?? user?.fullName ?? ''),
          role: (rawUser.role ?? user?.role ?? 'clinician') as User['role'],
          isActive: true,
          createdAt: rawUser.created_at ?? user?.createdAt,
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
        createdAt: userData.created_at
      };

      const authToken = userData.token || userData.access_token || '';

      setUser(loggedInUser);
      setToken(authToken);
      localStorage.setItem('cardio_user', JSON.stringify(loggedInUser));
      localStorage.setItem('cardio_token', authToken);
      navigate('/');
    } catch (error) {
      throw error;
    }
  };

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
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user }}>
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
