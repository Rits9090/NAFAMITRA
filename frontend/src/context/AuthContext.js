/**
 * Authentication context — single-entry phone OTP for the whole product.
 *
 * After OTP verification the server resolves this person's identities:
 *   shops (memberships) and/or customer profiles.
 * The active shop is chosen client-side for convenience but ALWAYS validated
 * server-side (X-Shop-Id + membership check) — never trusted from the client.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { setUnauthorizedHandler, errMsg, setSessionToken, clearSessionToken, beginDemo } from '@/lib/api';
import { getDemo, setDemo, subscribeDemo } from '@/demo/demoMode';
import { DEMO_SHOP, DEMO_ME, DEMO_CUSTOMER } from '@/demo/fixtures';

const AuthContext = createContext({});

const TOKEN_KEY = 'nafamitra_token';
const SHOP_KEY = 'nafamitra_shop';

const DEMO_CUSTOMER_PROFILE =
  (DEMO_CUSTOMER && DEMO_CUSTOMER['/customer/me'] && DEMO_CUSTOMER['/customer/me'].profiles
    && DEMO_CUSTOMER['/customer/me'].profiles[0]) || null;

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);          // { user, identities }
  const [activeShop, setActiveShop] = useState(() => localStorage.getItem(SHOP_KEY));

  const clearSession = useCallback(() => {
    clearSessionToken();
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

  // loadMe is stable (useCallback with a stable clearSession dep) — safe in deps.
  useEffect(() => { loadMe(token); }, [token, loadMe]);

  const requestOtp = useCallback(async (phone) => {
    const { data } = await api.post('/auth/request-otp', { phone });
    return data;
  }, []);

  const verifyOtp = useCallback(async (phone, code) => {
    const { data } = await api.post('/auth/verify-otp', { phone, code });
    setSessionToken(data.token);
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

  // ---- Demo mode (clearly labeled, unauthenticated, local fixtures only) ----
  const [demo, setDemoState] = useState(getDemo);
  useEffect(() => subscribeDemo((next) => setDemoState(next)), []);
  const enterDemo = useCallback((role2) => {
    beginDemo(role2);        // fresh synthetic dataset
    setDemo(role2);          // module flag + persistence
    setDemoState(role2);
  }, []);
  const exitDemo = useCallback(() => {
    setDemo(null);
    setDemoState(null);
  }, []);

  const identities = me?.identities || null;
  const realUser = me?.user || null;
  const shop = identities?.shops?.find((s) => s.id === activeShop)
    || identities?.shops?.[0] || null;
  const role = shop?.role || null;

  // Demo-aware view for the UI shells (display only — no token exists and
  // the server never sees demo state; authorization stays server-side).
  // Memoized as one unit so hook deps stay stable (react-hooks/exhaustive-deps).
  const demoView = useMemo(() => {
    if (demo === 'merchant') {
      return {
        user: DEMO_ME.user, identities: DEMO_ME.identities, shops: [DEMO_SHOP],
        activeShopView: DEMO_SHOP, kindView: 'merchant', roleView: 'owner',
      };
    }
    if (demo === 'customer') {
      // Customer demo must present the CUSTOMER identity (profile + NM id),
      // never the merchant's — display only, no token involved.
      const prof = DEMO_CUSTOMER_PROFILE;
      return {
        user: prof
          ? { id: 'demo-customer-001', phone: '98765432xx', name: prof.name, is_active: true }
          : DEMO_ME.user,
        identities, shops: identities?.shops || [],
        activeShopView: shop, kindView: 'customer', roleView: role,
      };
    }
    return {
      user: realUser, identities, shops: identities?.shops || [],
      activeShopView: shop, kindView: identities?.kind || null, roleView: role,
    };
  }, [demo, realUser, identities, shop, role]);

  const value = useMemo(() => ({
    token,
    loading,
    user: demoView.user,
    identities,
    shops: demoView.shops,
    customerProfiles: demo === 'customer'
      ? (DEMO_CUSTOMER['/customer/me']?.profiles || [])
      : (identities?.customer_profiles || []),
    kind: demoView.kindView,
    activeShop: demoView.activeShopView,
    activeShopId: demoView.activeShopView?.id || null,
    role: demoView.roleView,
    demo,
    enterDemo,
    exitDemo,
    requestOtp,
    verifyOtp,
    refresh,
    chooseShop,
    onboardShop,
    onboardCustomer,
    logout,
    clearSession,
  }), [token, loading, identities, demoView, demo, enterDemo, exitDemo,
       requestOtp, verifyOtp, refresh, chooseShop, onboardShop,
       onboardCustomer, logout, clearSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export { errMsg };
export default AuthContext;
