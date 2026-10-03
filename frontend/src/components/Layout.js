import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, Users, Package, CreditCard, Gift, BarChart2,
  Settings, LogOut, Store, Menu, X, UserCircle2, Truck, Megaphone, Mic,
  MessageSquare, Plus, MoreHorizontal, UserCog, Languages, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { LanguageSwitcher } from '@/pages/Login';

const mainNav = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, exact: true },
  { to: '/billing', labelKey: 'nav.newBill', icon: Plus },
  { to: '/bills', labelKey: 'nav.bills', icon: Receipt },
  { to: '/customers', labelKey: 'nav.customers', icon: Users },
  { to: '/products', labelKey: 'nav.products', icon: Package },
  { to: '/credit', labelKey: 'nav.credit', icon: CreditCard },
  { to: '/loyalty', labelKey: 'nav.loyalty', icon: Gift },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart2 },
  { to: '/staff', labelKey: 'nav.staff', icon: UserCog },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

const toolNav = [
  { to: '/suppliers', labelKey: 'nav.suppliers', icon: Truck },
  { to: '/marketing', labelKey: 'nav.marketing', icon: Megaphone },
  { to: '/voice', labelKey: 'nav.voice', icon: Mic },
  { to: '/assistant', labelKey: 'nav.assistant', icon: MessageSquare },
];

const mobileNav = [
  { to: '/', labelKey: 'nav.home', icon: LayoutDashboard, exact: true },
  { to: '/bills', labelKey: 'nav.bills', icon: Receipt },
  { to: '/customers', labelKey: 'nav.customers', icon: Users },
  { to: '/credit', labelKey: 'nav.credit', icon: CreditCard },
  { to: '/more', labelKey: 'nav.more', icon: MoreHorizontal },
];

export default function Layout() {
  const { user, activeShop, shops, role, kind, chooseShop, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/auth'); };

  const firstName = (user?.name || '').split(' ')[0] || t('nav.myShop');

  const switchToCustomer = () => { setSwitcherOpen(false); navigate('/c'); };

  const NavItems = ({ onNavigate }) => (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {mainNav.map(({ to, labelKey, icon: Icon, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          onClick={onNavigate}
        >
          <Icon className="w-[18px] h-[18px] flex-shrink-0" />
          <span>{t(labelKey)}</span>
        </NavLink>
      ))}
      <div className="pt-3 mt-3 border-t border-slate-100">
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('nav.more')}</p>
        {toolNav.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <Icon className="w-[18px] h-[18px] flex-shrink-0" />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );

  const ShopBlock = () => (
    <div className="p-4 border-b border-slate-100">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
          <Store className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-800 text-sm truncate" style={{ fontFamily: 'Outfit,sans-serif' }}>
            {activeShop?.name || 'NafaMitra'}
          </p>
          <p className="text-xs text-slate-500 capitalize truncate">{activeShop?.category || 'shop'}</p>
        </div>
      </div>
      {(shops.length > 1 || kind === 'both') && (
        <button
          onClick={() => setSwitcherOpen(true)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg py-2 transition-colors"
        >
          <UserCircle2 className="w-3.5 h-3.5" /> {t('common.switchAccount')}
        </button>
      )}
    </div>
  );

  const UserBlock = ({ onNavigate }) => (
    <div className="p-3 border-t border-slate-100 space-y-1">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-emerald-700">{(user?.name || 'U')[0].toUpperCase()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-700 truncate">{firstName}</p>
          <p className="text-[11px] text-slate-400 truncate">{role}</p>
        </div>
      </div>
      <div className="px-1 pb-1"><LanguageSwitcher compact /></div>
      <button
        onClick={() => { onNavigate?.(); handleLogout(); }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        <span>{t('common.logout')}</span>
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-slate-100 fixed top-0 left-0 h-screen z-30">
        <ShopBlock />
        <NavItems />
        <UserBlock />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-2xl z-50 flex flex-col" role="dialog" aria-label="Menu">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
            <ShopBlock />
            <NavItems onNavigate={() => setDrawerOpen(false)} />
            <UserBlock onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col lg:ml-56 min-w-0">
        <header className="bg-white/90 backdrop-blur border-b border-slate-100 sticky top-0 z-20 px-4 py-2.5">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div className="flex items-center gap-2 min-w-0">
              <button
                className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <div className="lg:hidden flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                  <Store className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-slate-800 text-sm truncate" style={{ fontFamily: 'Outfit,sans-serif' }}>
                  {activeShop?.name || 'NafaMitra'}
                </span>
              </div>
              <span className="hidden lg:block text-lg font-bold text-slate-800 truncate" style={{ fontFamily: 'Outfit,sans-serif' }}>
                {activeShop?.name || 'NafaMitra'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/billing"
                className="hidden sm:flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" /> {t('nav.newBill')}
              </Link>
              {kind === 'both' && (
                <button
                  onClick={switchToCustomer}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
                  title={t('nav.myCustomer')}
                >
                  <UserCircle2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('nav.myCustomer')}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-28 lg:pb-8 max-w-6xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* Mobile: floating New Bill */}
      <Link
        to="/billing"
        aria-label={t('nav.newBill')}
        className="lg:hidden fixed right-4 bottom-20 z-30 h-14 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 active:scale-95 transition-transform"
      >
        <Plus className="w-5 h-5" /> {t('nav.newBill')}
      </Link>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 flex pb-[env(safe-area-inset-bottom)]">
        {mobileNav.map(({ to, labelKey, icon: Icon, exact }) => (
          <NavLink key={to} to={to} end={exact} className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
            <Icon style={{ width: 20, height: 20 }} />
            <span className="text-[10px]">{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Account switcher */}
      {switcherOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSwitcherOpen(false)} aria-hidden="true" />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 animate-fadeInUp" role="dialog" aria-label={t('common.switchAccount')}>
            <h3 className="font-bold text-slate-800 mb-3">{t('common.switchAccount')}</h3>
            <button
              onClick={() => { setSwitcherOpen(false); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 mb-2"
            >
              <Store className="w-5 h-5 text-emerald-600" />
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">{t('nav.myShop')}</p>
                <p className="text-xs text-slate-500">{activeShop?.name}</p>
              </div>
            </button>
            {kind === 'both' && (
              <button onClick={switchToCustomer} className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 hover:border-emerald-300 mb-2">
                <UserCircle2 className="w-5 h-5 text-slate-500" />
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-800">{t('nav.myCustomer')}</p>
                  <p className="text-xs text-slate-500">{t('auth.iAmCustomerSub')}</p>
                </div>
              </button>
            )}
            <button onClick={() => setSwitcherOpen(false)} className="w-full text-center text-sm text-slate-500 py-2">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
