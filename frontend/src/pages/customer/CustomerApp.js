import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Receipt, Gift, Wallet, UserCircle2, Repeat2, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { LanguageSwitcher } from '@/pages/Login';

const nav = [
  { to: '/c', labelKey: 'nav.home', icon: Home, exact: true },
  { to: '/c/bills', labelKey: 'nav.bills', icon: Receipt },
  { to: '/c/loyalty', labelKey: 'nav.loyalty', icon: Gift },
  { to: '/c/credit', labelKey: 'nav.credit', icon: Wallet },
  { to: '/c/profile', labelKey: 'common.profile', icon: UserCircle2 },
];

export default function CustomerApp() {
  const { t } = useI18n();
  const { kind, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-20 px-4 py-2.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
              <span className="text-white text-xs font-extrabold">N</span>
            </div>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-slate-800">NafaMitra</p>
              <p className="text-[10px] text-emerald-700 font-semibold -mt-0.5">{t('brand.tagline')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            {kind === 'merchant' || kind === 'both' ? (
              <button
                onClick={() => navigate('/')}
                title={t('nav.myShop')}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <Repeat2 className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 flex pb-[env(safe-area-inset-bottom)]">
        {nav.map(({ to, labelKey, icon: Icon, exact }) => (
          <NavLink key={to} to={to} end={exact}
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
            <Icon style={{ width: 20, height: 20 }} />
            <span className="text-[10px]">{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
