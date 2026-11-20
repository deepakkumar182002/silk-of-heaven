import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    setAdmin(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) {
      setReady(true);
      return;
    }
    api('/api/auth/me')
      .then((d) => setAdmin(d.admin))
      .catch(() => logout())
      .finally(() => setReady(true));
  }, [logout]);

  const login = async (email, password) => {
    const d = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setToken(d.token);
    setAdmin(d.admin);
  };

  return <AuthCtx.Provider value={{ admin, ready, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
