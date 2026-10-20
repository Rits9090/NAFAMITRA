import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { track, ACTIVATION } from '@/lib/analytics';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import Modal from '@/components/Modal';
import { fmt } from '@/lib/money';
import { shortDate } from '@/lib/dates';
import { CUSTOMERS } from '@/constants/testIds';
import {
  Users, Plus, Search, X, ChevronRight, Phone, ShoppingBag, CreditCard,
  Gift, StickyNote, User, Inbox, Calendar,
} from 'lucide-react';

const SEGMENTS = [
  { key: 'all', labelKey: 'customers.segmentAll' },
  { key: 'new', labelKey: 'customers.segmentNew' },
  { key: 'repeat', labelKey: 'customers.segmentRepeat' },
  { key: 'high_value', labelKey: 'customers.segmentHighValue' },
  { key: 'credit_due', labelKey: 'customers.segmentCreditDue' },
  { key: 'inactive', labelKey: 'customers.segmentInactive' },
];

function NewCustomerForm({ onClose, onCreated, initial = {} }) {
  const { t, lang } = useI18n();
  const [form, setForm] = useState({ name: initial.name || '', phone: initial.phone || '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError(t('customers.nameRequired'));
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/customers', {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
      });
      track(ACTIVATION.CUSTOMER_CREATED, { has_phone: !!form.phone.trim() });
      onCreated(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} label={t('customers.newCustomerTitle')}>
      <form onSubmit={save} className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">{t('customers.newCustomerTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('common.close')}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="cust-name">{t('common.name')} *</label>
        <input id="cust-name" data-testid={CUSTOMERS.nameInput} value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
        <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="cust-phone">{t('common.phone')}</label>
        <input id="cust-phone" data-testid={CUSTOMERS.phoneInput} type="tel" inputMode="tel" value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder={t('auth.phonePlaceholder')}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
        <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="cust-notes">{t('common.notes')} ({t('common.optional')})</label>
        <textarea id="cust-notes" value={form.notes} rows={2}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
        {error && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}
        <button type="submit" data-testid={CUSTOMERS.saveBtn} disabled={loading}
          className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50">
          {loading ? t('common.loading') : t('common.save')}
        </button>
      </form>
    </Modal>
  );
}

export function CustomersList() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [segment, setSegment] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(params.get('add') === '1');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/customers', {
        params: { segment, search: search || undefined, limit: 50 },
      });
      setCustomers(data.customers || []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [segment, search]);

  useEffect(() => {
    const id = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeInUp" data-testid={CUSTOMERS.page}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('customers.title')}</h1>
          <p className="text-xs text-slate-500">{t('customers.sub')}</p>
        </div>
        <button
          data-testid={CUSTOMERS.addBtn}
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-xl text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> {t('common.add')}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          data-testid={CUSTOMERS.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('customers.search')}
          className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Segments">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => setSegment(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              segment === s.key ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 py-12 text-center" data-testid="customers-empty">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600 mt-3">{t('customers.empty')}</p>
          <p className="text-xs text-slate-400 px-6">{t('customers.emptySub')}</p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid={CUSTOMERS.list}>
          {customers.map((c) => (
            <li key={c.id}>
              <button
                data-testid={CUSTOMERS.card}
                onClick={() => navigate(`/customers/${c.id}`)}
                className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-emerald-200 text-left shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-emerald-700">{(c.name || '?')[0].toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {c.phone} · {c.nm_id}
                      {c.is_repeat && <span className="text-emerald-600 font-semibold"> · {t('customers.segmentRepeat')}</span>}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold font-mono text-slate-700">{fmt(c.total_spend_paise || 0)}</p>
                  <p className={`text-[11px] font-semibold ${(c.credit_due_paise || 0) > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                    {(c.credit_due_paise || 0) > 0 ? fmt(c.credit_due_paise) : `🪙 ${c.loyalty_points || 0}`}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <NewCustomerForm
          onClose={() => { setShowAdd(false); setParams({}); }}
          onCreated={(c) => {
            setShowAdd(false);
            setParams({});
            toast.success(`${c.name} ✓`);
            navigate(`/customers/${c.id}`);
          }}
        />
      )}
    </div>
  );
}

const TABS = [
  { key: 'overview', labelKey: 'customers.overview' },
  { key: 'bills', labelKey: 'nav.bills' },
  { key: 'credit', labelKey: 'customers.creditTab' },
  { key: 'loyalty', labelKey: 'customers.dhanlabhTab' },
  { key: 'notes', labelKey: 'customers.notesTab' },
];

export function CustomerDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/customers/${id}`);
      setData(data);
      setNotes(data.customer?.notes || '');
    } catch (e) {
      setError(errMsg(e, t('customers.empty')));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  const saveNotes = async () => {
    try {
      await api.put(`/customers/${id}`, { notes });
      toast.success(t('customers.notesSaved'));
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (loading) return <div className="max-w-2xl mx-auto space-y-3"><div className="h-40 bg-slate-200 rounded-2xl animate-pulse" /></div>;
  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16" role="alert">
        <p className="text-sm text-slate-600">{error}</p>
        <button onClick={() => navigate('/customers')} className="mt-4 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold">← {t('customers.title')}</button>
      </div>
    );
  }

  const c = data.customer;
  const since = c.customer_since ? shortDate(c.customer_since, lang) : t('customers.never');

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeInUp">
      <button onClick={() => navigate('/customers')} className="text-sm text-slate-500 hover:text-slate-700">← {t('customers.title')}</button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4" data-testid="customer-detail">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-emerald-700">{(c.name || '?')[0].toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold text-slate-800 truncate">{c.name}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> {c.phone || '—'} <span className="text-slate-300">·</span> {c.nm_id}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="bg-slate-50 rounded-xl py-2">
            <p className="text-base font-extrabold font-mono text-slate-800">{c.purchase_count || 0}</p>
            <p className="text-[10px] text-slate-500 font-semibold">{t('customers.purchases')}</p>
          </div>
          <div className="bg-slate-50 rounded-xl py-2">
            <p className="text-base font-extrabold font-mono text-slate-800">{fmt(c.total_spend_paise || 0)}</p>
            <p className="text-[10px] text-slate-500 font-semibold">{t('customers.totalSpend')}</p>
          </div>
          <div className="bg-slate-50 rounded-xl py-2">
            <p className={`text-base font-extrabold font-mono ${(c.credit_due_paise || 0) > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {fmt(c.credit_due_paise || 0)}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold">{t('customers.creditTab')}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto" role="tablist">
        {TABS.map(({ key, labelKey }) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`flex-1 min-w-max px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
            {t(labelKey)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50">
          <InfoRow icon={Calendar} label={t('customers.since')} value={since} />
          <InfoRow icon={ShoppingBag} label={t('customers.purchases')} value={String(c.purchase_count || 0)} />
          <InfoRow icon={User} label={t('customers.avgBill')} value={fmt(c.avg_bill_paise || 0)} />
          <InfoRow icon={CreditCard} label={t('customers.lastPurchase')}
            value={c.last_purchase_at ? shortDate(c.last_purchase_at, lang) : t('customers.never')} />
          <InfoRow icon={Gift} label={t('customers.dhanlabhTab')} value={`${c.loyalty_points || 0} 🪙`} />
        </div>
      )}

      {tab === 'bills' && (
        <div className="space-y-2">
          {(data.bills || []).length === 0 && (data.legacy_sales || []).length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">{t('billsList.empty')}</p>
          )}
          {(data.bills || []).map((b) => (
            <Link key={b.id} to={`/bills/${b.id}`}
              className="bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between hover:border-emerald-200">
              <div>
                <p className="text-sm font-semibold text-slate-700">{b.invoice_number}</p>
                <p className="text-[11px] text-slate-400">{b.created_at ? shortDate(b.created_at, lang) : ''}</p>
              </div>
              <span className={`text-sm font-bold font-mono ${b.status === 'VOIDED' ? 'text-red-500 line-through' : 'text-slate-800'}`}>
                {fmt(b.total_paise || 0)}
              </span>
            </Link>
          ))}
          {(data.legacy_sales || []).map((s) => (
            <div key={s.id} className="bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">{s.invoice_number}</p>
                <p className="text-[11px] text-slate-400">{s.created_at ? shortDate(s.created_at, lang) : ''}</p>
              </div>
              <span className="text-sm font-bold font-mono text-slate-800">₹{Number(s.total_amount || 0).toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'credit' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-600">{t('credit.outstanding')}</span>
            <span className={`text-xl font-extrabold font-mono ${(c.credit_due_paise || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {fmt(c.credit_due_paise || 0)}
            </span>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {(data.credit_transactions || []).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-slate-700 font-medium">{t(`credit.type${tx.type.charAt(0) + tx.type.slice(1).toLowerCase()}`)}</p>
                  <p className="text-[11px] text-slate-400">{tx.created_at ? shortDate(tx.created_at, lang) : ''}</p>
                </div>
                <span className={`font-mono font-bold ${tx.delta_paise > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {tx.delta_paise > 0 ? '+' : ''}{fmt(tx.delta_paise || 0)}
                </span>
              </div>
            ))}
            {(data.credit_transactions || []).length === 0 && (
              <p className="text-center text-sm text-slate-400 py-4">{t('credit.empty')}</p>
            )}
          </div>
        </div>
      )}

      {tab === 'loyalty' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="text-center py-3">
            <p className="text-3xl font-extrabold font-mono text-violet-700">{c.loyalty_points || 0}</p>
            <p className="text-xs text-slate-500 font-semibold">🪙 {t('app.dhanlabh')} · {c.nm_id}</p>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {(data.loyalty_transactions || []).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-slate-700 font-medium">{tx.type}</p>
                  <p className="text-[11px] text-slate-400">{tx.note || (tx.created_at ? shortDate(tx.created_at, lang) : '')}</p>
                </div>
                <span className={`font-mono font-bold ${(tx.delta || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(tx.delta || 0) >= 0 ? '+' : ''}{tx.delta ?? tx.points}
                </span>
              </div>
            ))}
            {(data.loyalty_transactions || []).length === 0 && (
              <p className="text-center text-sm text-slate-400 py-4">{t('loyalty.empty')}</p>
            )}
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <label htmlFor="cust-detail-notes" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" /> {t('customers.notesTab')}
          </label>
          <textarea
            id="cust-detail-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="…"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button onClick={saveNotes} data-testid="save-notes"
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
            {t('customers.saveNotes')}
          </button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-500 flex items-center gap-2"><Icon className="w-4 h-4 text-slate-400" /> {label}</span>
      <span className="text-sm font-semibold text-slate-700 font-mono">{value}</span>
    </div>
  );
}

export default CustomersList;
