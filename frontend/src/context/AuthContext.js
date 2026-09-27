import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext({});

// Axios interceptor to add auth token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('nafamitra_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('nafamitra_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchMe();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const fetchMe = async () => {
    try {
      const { data } = await axios.get(`${API}/auth/me`);
      setUser(data.user);
      setBusiness(data.business);
    } catch {
      localStorage.removeItem('nafamitra_token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    localStorage.setItem('nafamitra_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setBusiness(data.business);
    return data;
  };

  const register = async (email, password, name, phone) => {
    const { data } = await axios.post(`${API}/auth/register`, { email, password, name, phone });
    localStorage.setItem('nafamitra_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const setupBusiness = async (businessData) => {
    const { data } = await axios.post(`${API}/auth/setup-business`, businessData);
    localStorage.setItem('nafamitra_token', data.token);
    setToken(data.token);
    setBusiness(data.business);
    setUser(prev => ({ ...prev, business_id: data.business.id }));
    return data;
  };

  const logout = () => {
    localStorage.removeItem('nafamitra_token');
    setToken(null);
    setUser(null);
    setBusiness(null);
  };

  const refreshBusiness = async () => {
    if (token) await fetchMe();
  };

  return (
    <AuthContext.Provider value={{ user, business, token, isLoading, login, register, logout, setupBusiness, refreshBusiness }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
