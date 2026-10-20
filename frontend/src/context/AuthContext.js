/**
 * Authentication context — ONE session, provided by Supabase Auth.
 *
 * Email/password and Google sign-in create a Supabase session; its verified
 * access_token is the token the API layer sends (Authorization + X-Shop-Id
 * channel unchanged). The backend resolves identities (shop memberships
 * and/or customer profiles) for the session's user id on /auth/me — client
 * role values are display-only and never trusted.
 *
 * Phone OTP and demo-entry remain only as clearly-gated test fixtures:
 * compiled out of production builds (DEMO_ENABLED) and refused by the
 * backend unless explicitly enabled (ALLOW_PHONE_OTP).
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { setUnauthorizedHandler, errMsg, setSessionToken, clearSessionToken, beginDemo } from '@/lib/api';
import { getSupabase, tryGetSupabase } from '@/lib/supabase';
import { signOutEverywhere } from '@/lib/authActions';
import { DEMO_ENABLED } from '@/lib/demoFlag';
import { getDemo, setDemo, subscribeDemo } from '@/demo/demoMode';
import { DEMO_SHOP, DEMO_ME, DEMO_CUSTOMER } from '@/demo/fixtures';

const AuthContext = createContext({});

const TOKEN_KEY = 'nafamitra_token';
const SHOP_KEY = 'nafamitra_shop';

const DEMO_CUSTOMER_PROFILE =
  (DEMO_CUSTOMER && DEMO_CUSTOMER['/customer/me'] && DEMO_CUSTOMER['/customer/me'].profiles
    && DEMO_CUSTOMER['/customer/me'].profiles[0]) || null;

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);          // { user, identities }
  const [activeShop, setActiveShop] = useState(() => localStorage.getItem(SHOP_KEY));
  const [authEvent, setAuthEvent] = useState(null); // PASSWORD_RECOVERY / SIGNED_OUT …
  const [bootError, setBootError] = useState(null); // config/network problems at restore

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

  const adoptSession = useCallback((session) => {
    if (session?.access_token) {
      setSessionToken(session.access_token);
      setToken(session.access_token);
    } else {
      clearSessionToken();
      setToken(null);
      setMe(null);
    }
  }, []);

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

  // ── Supabase session restore + auth-state subscription ──────────────────
  useEffect(() => {
    let cancelled = false;
    let subscription = null;
    (async () => {
      try {
        const supabase = getSupabase(); // throws typed config error when unset
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) setBootError(error);
        const session = data?.session || null;
        adoptSession(session);
        setLoading(false);
        if (session) loadMe(session.access_token);
      } catch (e) {
        if (!cancelled) {
          setBootError(e);
          clearSessionToken();
          setLoading(false);
        }
      }
    })();
    try {
      const supabase = getSupabase();
      const sub = supabase.auth.onAuthStateChange((event, session) => {
        setAuthEvent(event);
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          clearSession();
          setLoading(false);
          return;
        }
        if (event === 'PASSWORD_RECOVERY') {
          adoptSession(session);
          if (session) loadMe(session.access_token);
          return;
        }
        adoptSession(session);
        if (session?.access_token) loadMe(session.access_token);
        else setLoading(false);
      });
      subscription = sub.data?.subscription || null;
    } catch (e) {
      setBootError(e);
    }
    return () => {
      cancelled = true;
      if (subscription) { try { subscription.unsubscribe(); } catch { /* already gone */ } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /**
   * Logout: server-side invalidation when reachable, guaranteed local clear
   * (Supabase storage + app token/shop keys + me) either way.
   */
  const logout = useCallback(async () => {
    try { await signOutEverywhere(); } catch { /* storage clear below */ }
    clearSession();
    setAuthEvent('SIGNED_OUT');
  }, [clearSession]);

  // ---- Demo mode (test builds only — compiled out of production) ---------
  const [demo, setDemoState] = useState(getDemo);
  useEffect(() => subscribeDemo((next) => setDemoState(next)), []);
  const enterDemo = useCallback((role2) => {
    if (!DEMO_ENABLED) return;
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
    if (!DEMO_ENABLED) {
      return {
        user: realUser, identities, shops: identities?.shops || [],
        activeShopView: shop, kindView: identities?.kind || null, roleView: role,
      };
    }
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
    isLoading: loading,
    loading,
    session: null,
    authEvent,
    bootError,
    user: demoView.user,
    identities,
    shops: demoView.shops,
    customerProfiles: !DEMO_ENABLED ? (identities?.customer_profiles || [])
      : (demo === 'customer'
        ? (DEMO_CUSTOMER['/customer/me']?.profiles || [])
        : (identities?.customer_profiles || [])),
    kind: demoView.kindView,
    activeShop: demoView.activeShopView,
    activeShopId: demoView.activeShopView?.id || null,
    role: demoView.roleView,
    demo,
    enterDemo,
    exitDemo,
    refresh,
    chooseShop,
    onboardShop,
    onboardCustomer,
    logout,
    clearSession,
  }), [token, loading, authEvent, bootError, identities, demoView, demo, enterDemo,
       exitDemo, refresh, chooseShop, onboardShop, onboardCustomer, logout, clearSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export { errMsg };
export default AuthContext;
