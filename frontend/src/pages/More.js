import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package, Gift, BarChart2, UserCog, Settings, Truck, Megaphone, Mic,
  MessageSquare, LogOut, UserCircle2, Languages, Store, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { LanguageSwitcher } from '@/pages/Login';

const items = [
  { to: '/products', labelKey: 'nav.products', icon: Package },
  { to: '/loyalty', labelKey: 'nav.loyalty', icon: Gift },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart2 },
  { to: '/staff', labelKey: 'nav.staff', icon: UserCog },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
  { to: '/suppliers', labelKey: 'nav.suppliers', icon: Truck },
  { to: '/marketing', labelKey: 'nav.marketing', icon: Megaphone },
  { to: '/requirements', labelKey: 'nav.requirements', icon: ClipboardList },
  { to: '/voice', labelKey: 'nav.voice', icon: Mic },
  { to: '/assistant', labelKey: 'nav.assistant', icon: MessageSquare },
];

export default function More() {
  const { t } = useI18n();
  const { user, kind, logout, activeShop } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="max-w-lg mx-auto space-y-4 animate-fadeInUp">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">{t('nav.more')}</h1>
        <p className="text-xs text-slate-500">{activeShop?.name}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
        {items.map(({ to, labelKey, icon: Icon }) => (
          <Link key={to} to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50">
            <Icon className="w-4.5 h-4.5 text-slate-400" style={{ width: 18, height: 18 }} />
            <span className="text-sm font-medium text-slate-700">{t(labelKey)}</span>
            <span className="ml-auto text-slate-300">›</span>
          </Link>
        ))}
      </div>

      {kind === 'both' && (
        <button
          onClick={() => navigate('/c')}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-white rounded-xl border border-slate-100 shadow-sm text-left"
        >
          <UserCircle2 className="w-4.5 h-4.5 text-emerald-600" style={{ width: 18, height: 18 }} />
          <div>
            <p className="text-sm font-semibold text-slate-700">{t('nav.myCustomer')}</p>
            <p className="text-[11px] text-slate-400">{t('auth.iAmCustomerSub')}</p>
          </div>
        </button>
      )}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <Languages className="w-4 h-4 text-slate-400" /> {t('common.language')}
        </span>
        <LanguageSwitcher />
      </div>

      <button
        onClick={() => { logout(); navigate('/auth'); }}
        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-white border border-red-100 text-red-600 text-sm font-semibold shadow-sm"
      >
        <LogOut className="w-4 h-4" /> {t('common.logout')}
      </button>

      <p className="text-center text-[11px] text-slate-400 pb-4">NafaMitra · {t('brand.tagline')}</p>
    </div>
  );
}
