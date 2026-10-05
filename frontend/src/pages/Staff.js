import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { UserCog, Plus, Trash2, X, ShieldCheck } from 'lucide-react';

const ROLES = ['owner', 'manager', 'cashier'];

export default function Staff() {
  const { t } = useI18n();
  const { role: myRole } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState('');
  const [newRole, setNewRole] = useState('cashier');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isOwner = myRole === 'owner';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/staff');
      setStaff(data.staff || []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/auth/staff', { phone, role: newRole });
      toast.success(t('staff.added'));
      setShowAdd(false);
      setPhone('');
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m) => {
    if (!window.confirm(t('staff.removeConfirm'))) return;
    try {
      await api.delete(`/auth/staff/${m.membership_id}`);
      toast.success(t('staff.removed'));
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const roleBadge = (r) => ({
    owner: 'bg-amber-50 text-amber-700 border-amber-200',
    manager: 'bg-blue-50 text-blue-700 border-blue-200',
    cashier: 'bg-slate-50 text-slate-600 border-slate-200',
  }[r] || 'bg-slate-50 text-slate-600 border-slate-200');

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeInUp">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('staff.title')}</h1>
          <p className="text-xs text-slate-500">{t('staff.sub')}</p>
        </div>
        {isOwner && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-xl text-sm font-bold">
            <Plus className="w-4 h-4" /> {t('common.add')}
          </button>
        )}
      </div>

      {!isOwner && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 font-semibold flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" /> {t('staff.onlyOwner')}
        </div>
      )}

      {/* role legend */}
      <div className="grid grid-cols-3 gap-2">
        {ROLES.map((r) => (
          <div key={r} className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
            <p className={`text-xs font-bold inline-block px-2 py-0.5 rounded-full border ${roleBadge(r)}`}>{t(`staff.${r}`)}</p>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">{t(`staff.${r === 'owner' ? 'ownerDesc' : r === 'manager' ? 'managerDesc' : 'cashierDesc'}`)}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <ul className="space-y-2">
          {staff.map((m) => (
            <li key={m.membership_id} className="bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-slate-600">{(m.name || '?')[0].toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{m.name}</p>
                  <p className="text-[11px] text-slate-400">{m.phone || m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${roleBadge(m.role)}`}>{t(`staff.${m.role}`)}</span>
                {isOwner && m.role !== 'owner' && (
                  <button onClick={() => remove(m)} aria-label={t('staff.remove')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAdd(false)} aria-hidden="true" />
          <form onSubmit={add} className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 animate-fadeInUp" role="dialog" aria-label={t('staff.add')}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">{t('staff.add')}</h3>
              <button type="button" onClick={() => setShowAdd(false)} aria-label={t('common.close')}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <label htmlFor="staff-phone" className="block text-xs font-semibold text-slate-500 mb-1">{t('staff.invitePhone')}</label>
            <input id="staff-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder={t('auth.phonePlaceholder')} autoFocus
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <span className="block text-xs font-semibold text-slate-500 mb-1.5">{t('staff.role')}</span>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setNewRole(r)}
                  className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    newRole === r ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600'}`}>
                  {t(`staff.${r}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mb-3">{t(`staff.${newRole === 'owner' ? 'ownerDesc' : newRole === 'manager' ? 'managerDesc' : 'cashierDesc'}`)} · {t('staff.pendingNote')}</p>
            {error && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}
            <button type="submit" disabled={saving} data-testid="staff-submit"
              className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
