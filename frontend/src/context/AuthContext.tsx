import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  login as apiLogin,
  register as apiRegister,
  setToken,
  getToken,
  setUnauthorizedHandler,
  type User,
} from '../api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  department: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      localStorage.removeItem('user');
    });

    const savedUser = localStorage.getItem('user');
    const savedToken = getToken();
    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('user');
        setToken(null);
      }
    }
    setLoading(false);

    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    setToken(response.token);
    setUser(response.user);
    localStorage.setItem('user', JSON.stringify(response.user));
  };

  const register = async (data: RegisterData) => {
    const response = await apiRegister(data);
    setToken(response.token);
    setUser(response.user);
    localStorage.setItem('user', JSON.stringify(response.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
