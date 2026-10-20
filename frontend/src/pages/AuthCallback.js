/**
 * /auth/callback — Supabase auth return target.
 *
 * Handles email confirmation, password recovery (PKCE code exchange runs in
 * supabase-js via detectSessionInUrl as the client initializes), Google
 * OAuth return, and provider/error redirects. Never claims success before a
 * session exists; maps provider errors to friendly localized messages.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import { tryGetSupabase, supabaseAuthErrorKey } from '@/lib/supabase';

export default function AuthCallback() {
  const { t } = useI18n();
  const { token, loading, authEvent } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('working'); // working | error
  const [errorKey, setErrorKey] = useState(null);

  // Surface explicit provider errors appended to the callback URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const desc = params.get('error_description') || params.get('error_code') || params.get('error');
    if (desc && desc !== 'code_challenge') {
      setErrorKey(supabaseAuthErrorKey({ message: decodeURIComponent(desc) }) || 'auth.errGeneric');
      setPhase('error');
    }
  }, []);

  // Wait for detectSessionInUrl's code exchange (client init) then route.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tick = setInterval(async () => {
      if (cancelled) return;
      tries += 1;
      const supabase = tryGetSupabase();
      let session = null;
      if (supabase) {
        const { data } = await supabase.auth.getSession().catch(() => ({ data: null }));
        session = data?.session || null;
      }
      if (session) {
        clearInterval(tick);
        if (authEvent === 'PASSWORD_RECOVERY' || /recovery/i.test(window.location.hash + window.location.search)) {
          navigate('/auth?recovery=1', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
        return;
      }
      if (token && !loading) {
        clearInterval(tick);
        navigate('/', { replace: true });
        return;
      }
      if (tries > 60) { // ~6s: link may be single-use/expired
        clearInterval(tick);
        if (phase !== 'error') {
          setErrorKey('auth.errLinkInvalid');
          setPhase('error');
        }
      }
    }, 100);
    return () => { cancelled = true; clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loading, authEvent]);

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="text-sm text-slate-700 font-medium" data-testid="callback-error">
            {t(errorKey || 'auth.errGeneric')}
          </p>
          <button type="button" data-testid="callback-back"
            onClick={() => navigate('/auth', { replace: true })}
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
            {t('auth.backToSignIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center space-y-3" data-testid="callback-working">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
        <p className="text-sm text-slate-600 font-medium">{t('auth.callbackWorking')}</p>
      </div>
    </div>
  );
}
