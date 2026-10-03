/**
 * Authentication context — single-entry phone OTP for the whole product.
 *
 * After OTP verification the server resolves this person's identities:
 *   shops (memberships) and/or customer profiles.
 * The active shop is chosen client-side for convenience but ALWAYS validated
 * server-side (X-Shop-Id + membership check) — never trusted from the client.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { setUnauthorizedHandler, errMsg } from '@/lib/api';

const AuthContext = createContext({});

const TOKEN_KEY = 'nafamitra_token';
const SHOP_KEY = 'nafamitra_shop';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);          // { user, identities }
  const [activeShop, setActiveShop] = useState(() => localStorage.getItem(SHOP_KEY));

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SHOP_KEY);
    setToken(null);
    setMe(null);
    setActiveShop(null);
  }, []);

  // 401 anywhere → clear session once (pages keep their local state)
  useEffect(() => {
    setUnauthorizedHandler(() => { clearSession(); });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const loadMe = useCallback(async (tok) => {
    if (!tok) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setMe(data);
      const shops = data?.identities?.shops || [];
      // keep a valid saved shop, else fall back to the first one
      const saved = localStorage.getItem(SHOP_KEY);
      if (shops.length && !shops.some((s) => s.id === saved)) {
        localStorage.setItem(SHOP_KEY, shops[0].id);
        setActiveShop(shops[0].id);
      } else if (!shops.length) {
        localStorage.removeItem(SHOP_KEY);
        setActiveShop(null);
      }
    } catch (e) {
      if (e?.friendly?.status === 401) clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => { loadMe(token); /* eslint-disable-next-line */ }, [token]);

  const requestOtp = useCallback(async (phone) => {
    const { data } = await api.post('/auth/request-otp', { phone });
    return data;
  }, []);

  const verifyOtp = useCallback(async (phone, code) => {
    const { data } = await api.post('/auth/verify-otp', { phone, code });
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    // resolve identities right away so routing decisions are immediate
    const meData = await api.get('/auth/me').then((r) => r.data);
    setMe(meData);
    const shops = meData?.identities?.shops || [];
    if (shops.length) {
      if (!shops.some((s) => s.id === localStorage.getItem(SHOP_KEY))) {
        localStorage.setItem(SHOP_KEY, shops[0].id);
        setActiveShop(shops[0].id);
      }
    } else {
      localStorage.removeItem(SHOP_KEY);
      setActiveShop(null);
    }
    return { ...data, identities: meData.identities };
  }, []);

  const refresh = useCallback(async () => {
    if (token) await loadMe(token);
  }, [token, loadMe]);

  const chooseShop = useCallback((shopId) => {
    localStorage.setItem(SHOP_KEY, shopId);
    setActiveShop(shopId);
  }, []);

  const onboardShop = useCallback(async (payload) => {
    const { data } = await api.post('/auth/onboard/shop', payload);
    await loadMe(token);
    if (data?.shop?.id) chooseShop(data.shop.id);
    return data;
  }, [token, loadMe, chooseShop]);

  const onboardCustomer = useCallback(async (payload) => {
    const { data } = await api.post('/auth/onboard/customer', payload);
    await loadMe(token);
    return data;
  }, [token, loadMe]);

  const logout = useCallback(() => clearSession(), [clearSession]);

  const identities = me?.identities || null;
  const user = me?.user || null;
  const shop = identities?.shops?.find((s) => s.id === activeShop)
    || identities?.shops?.[0] || null;
  const role = shop?.role || null;

  const value = useMemo(() => ({
    token,
    loading,
    user,
    identities,
    shops: identities?.shops || [],
    customerProfiles: identities?.customer_profiles || [],
    kind: identities?.kind || null,
    activeShop: shop,
    activeShopId: shop?.id || null,
    role,
    requestOtp,
    verifyOtp,
    refresh,
    chooseShop,
    onboardShop,
    onboardCustomer,
    logout,
    clearSession,
  }), [token, loading, user, identities, shop, role, requestOtp, verifyOtp,
       refresh, chooseShop, onboardShop, onboardCustomer, logout, clearSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export { errMsg };
export default AuthContext;
