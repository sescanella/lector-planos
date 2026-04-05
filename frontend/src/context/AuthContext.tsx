import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AUTH_STORAGE_KEY, INTENDED_PATH_KEY } from '@/constants';

interface AuthContextValue {
  apiKey: string | null;
  isAuthenticated: boolean;
  login: (key: string) => void;
  logout: () => void;
  getIntendedPath: () => string | null;
  setIntendedPath: (path: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(
    () => sessionStorage.getItem(AUTH_STORAGE_KEY),
  );

  const login = useCallback((key: string) => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, key);
    setApiKey(key);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(INTENDED_PATH_KEY);
    setApiKey(null);
  }, []);

  const getIntendedPath = useCallback(() => {
    const path = sessionStorage.getItem(INTENDED_PATH_KEY);
    sessionStorage.removeItem(INTENDED_PATH_KEY);
    return path;
  }, []);

  const setIntendedPath = useCallback((path: string) => {
    sessionStorage.setItem(INTENDED_PATH_KEY, path);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ apiKey, isAuthenticated: apiKey !== null, login, logout, getIntendedPath, setIntendedPath }),
    [apiKey, login, logout, getIntendedPath, setIntendedPath],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
