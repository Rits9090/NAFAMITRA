import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { track, ACTIVATION } from '@/lib/analytics';
import api, { errMsg } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { fmt, toPaise, parseMoney, newIdempotencyKey, SYMBOL } from '@/lib/money';
import ReceiptModal from '@/components/Receipt';
import { BILLING, CUSTOMERS } from '@/constants/testIds';
import {
  Search, User, X, Plus, Minus, ScanLine, AlertTriangle, Check,
  ChevronDown, Sparkles, Clock,
} from 'lucide-react';

const PAYMENTS = ['cash', 'upi', 'card', 'credit'];

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function CustomerPicker({ selected, onSelect, onClear, onCreateNew }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const debounced = useDebounced(q, 250);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!debounced || debounced.length < 2) { setResults([]); return undefined; }
    let cancelled = false;
    setLoading(true);
    api.get('/customers/search', { params: { q: debounced } })
      .then(({ data }) => { if (!cancelled) setResults(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const scanQr = async () => {
    if (!('BarcodeDetector' in window)) {
      toast.info(t('billing.enterManually'));
      return;
    }
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const token = await new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = async () => {
          try {
            const codes = await detector.detect(video);
            if (codes.length) { resolve(codes[0].rawValue); return; }
          } catch { /* keep trying */ }
          if (Date.now() - started > 8000) { reject(new Error('timeout')); return; }
          setTimeout(tick, 250);
        };
        tick();
      });
      stream.getTracks().forEach((tr) => tr.stop());
      const { data } = await api.post('/customers/resolve', { qr_token: token });
      onSelect(data);
      setOpen(false);
    } catch {
      toast.error(t('billing.enterManually'));
    } finally {
      setScanning(false);
    }
  };

  if (selected) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-2" data-testid="selected-customer">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-emerald-700">{(selected.name || '?')[0].toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{selected.name}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {selected.phone} · {selected.nm_id}
            </p>
            <p className="text-[11px] text-slate-600 font-medium">
              🪙 {selected.loyalty_points || 0} {t('app.dhanlabh')}
              {(selected.credit_due_paise || 0) > 0 && (
                <span className="text-red-500"> · {t('billing.dueAmount', { amount: fmt(selected.credit_due_paise).replace('₹', '') })}</span>
              )}
              {selected.last_purchase_at && (
                <span className="text-slate-400"> · {t('billing.lastPurchase', {
                  when: Math.floor((Date.now() - new Date(selected.last_purchase_at)) / 86400000) <= 0
                    ? t('billing.agoToday') : t('billing.agoDays', { n: Math.floor((Date.now() - new Date(selected.last_purchase_at)) / 86400000) }),
                })}</span>
              )}
            </p>
          </div>
        </div>
        <button onClick={onClear} aria-label={t('common.close')} className="p-1.5 rounded-lg hover:bg-emerald-100 flex-shrink-0">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          data-testid={BILLING.customerSearch}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={t('billing.searchCustomer')}
          autoComplete="off"
          className="w-full pl-9 pr-24 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            type="button"
            onClick={scanQr}
            disabled={scanning}
            title={t('billing.scanQr')}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <ScanLine className="w-4 h-4" />
          </button>
        </div>
      </div>

      {open && (q.length >= 2 || results.length > 0) && (
        <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden animate-fadeInUp">
          {loading && <p className="px-4 py-3 text-xs text-slate-400">{t('common.loading')}</p>}
          {!loading && results.length === 0 && q.length >= 2 && (
            <button
              type="button"
              data-testid="create-inline-customer"
              onClick={() => { setOpen(false); onCreateNew(q); }}
              className="w-full px-4 py-3 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              {t('billing.createInline', { q })}
            </button>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c); setOpen(false); setQ(''); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-emerald-700">{(c.name || '?')[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                <p className="text-[11px] text-slate-400">
                  {c.phone} · 🪙 {c.loyalty_points || 0}
                  {(c.credit_due_paise || 0) > 0 && ` · ${fmt(c.credit_due_paise)}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCustomerModal({ initialPhone, onClose, onCreated }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(initialPhone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('customers.nameRequired'));
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/customers', { name: name.trim(), phone: phone.trim() || null });
      onCreated(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <form onSubmit={save} className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 animate-fadeInUp" role="dialog" aria-label={t('customers.newCustomerTitle')}>
        <h3 className="font-bold text-slate-800 mb-4">{t('customers.newCustomerTitle')}</h3>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5" htmlFor="new-cust-name">{t('common.name')}</label>
        <input
          id="new-cust-name"
          data-testid={CUSTOMERS.nameInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('onboarding.customerNamePh')}
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <label className="block text-xs font-semibold text-slate-500 mb-1.5" htmlFor="new-cust-phone">{t('common.phone')} <span className="text-slate-400">({t('common.optional')})</span></label>
        <input
          id="new-cust-phone"
          data-testid={CUSTOMERS.phoneInput}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('auth.phonePlaceholder')}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        {error && <div role="alert" className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button type="button" onClick={onClose} className="py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            data-testid={CUSTOMERS.saveBtn}
            disabled={loading}
            className="py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {loading ? t('billing.savingCustomer') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Billing() {
  const { t } = useI18n();
  const { activeShop } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('quick'); // quick | items
  const [customer, setCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  // quick mode
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [redeemPoints, setRedeemPoints] = useState('');

  // itemised mode
  const [products, setProducts] = useState([]);
  const [productQ, setProductQ] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('');
  const [priceWarnings, setPriceWarnings] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [bill, setBill] = useState(null);
  const idemKey = useRef(newIdempotencyKey());

  const shopSettings = activeShop?.settings || {};
  const redemptionPaise = shopSettings.redemption_value_paise ?? 10;
  const pointsPer100 = shopSettings.loyalty_points_per_100 ?? 1;

  useEffect(() => {
    api.get('/products', { params: { limit: 200 } })
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => setProducts([]));
  }, []);

  // ---- cart maths (all in paise) -----------------------------------------
  const subtotal = cart.reduce((s, i) => s + i.totalPaise, 0);
  const discountPaise = Math.min(parseMoney(discount), subtotal);
  const redeem = Math.max(0, parseInt(redeemPoints || '0', 10) || 0);
  const maxRedeemable = Math.floor((subtotal - discountPaise) / Math.max(redemptionPaise, 1));
  const redeemValue = Math.min(redeem, maxRedeemable) * redemptionPaise;
  const total = Math.max(0, subtotal - discountPaise - redeemValue);

  const paid = paymentMode === 'credit' ? 0
    : paidAmount !== '' ? Math.min(parseMoney(paidAmount), total) : total;
  const due = total - paid;

  const estimatedPoints = shopSettings.loyalty_enabled !== false
    ? Math.floor((total / 10000) * pointsPer100) : 0;

  // ---- product add --------------------------------------------------------
  const addProduct = (p) => {
    const pricePaise = toPaise(p.selling_price);
    const minPaise = p.min_selling_price != null ? toPaise(p.min_selling_price) : null;
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) => i.product_id === p.id
          ? { ...i, quantity: i.quantity + 1, totalPaise: (i.quantity + 1) * i.unitPricePaise }
          : i);
      }
      return [...prev, {
        product_id: p.id, name: p.name, quantity: 1,
        unitPricePaise: pricePaise, totalPaise: pricePaise,
        minPaise, stock: p.stock_quantity ?? null, costPaise: toPaise(p.purchase_price || 0),
      }];
    });
    setProductQ('');
  };

  const changeQty = (id, delta) => {
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== id) return i;
      const quantity = Math.max(1, i.quantity + delta);
      return { ...i, quantity, totalPaise: quantity * i.unitPricePaise };
    }));
  };

  const setLinePrice = (id, value) => {
    setWarningsFor(id, value);
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== id) return i;
      let pricePaise;
      try { pricePaise = toPaise(value); } catch { pricePaise = i.unitPricePaise; }
      pricePaise = Math.max(0, pricePaise);
      return { ...i, unitPricePaise: pricePaise, totalPaise: pricePaise * i.quantity };
    }));
  };

  const setWarningsFor = (id, value) => {
    let pricePaise;
    try { pricePaise = toPaise(value); } catch { return; }
    const item = cart.find((i) => i.product_id === id);
    if (!item || item.minPaise == null) {
      setPriceWarnings((w) => w.filter((x) => x.product_id !== id));
      return;
    }
    if (pricePaise < item.minPaise) {
      const margin = pricePaise - item.costPaise;
      setPriceWarnings((w) => [
        ...w.filter((x) => x.product_id !== id),
        { product_id: id, name: item.name, margin },
      ]);
    } else {
      setPriceWarnings((w) => w.filter((x) => x.product_id !== id));
    }
  };

  const removeLine = (id) => setCart((prev) => prev.filter((i) => i.product_id !== id));

  const filteredProducts = productQ
    ? products.filter((p) => p.name.toLowerCase().includes(productQ.toLowerCase())
        || (p.sku || '').toLowerCase().includes(productQ.toLowerCase())
        || (p.barcode || '').includes(productQ)).slice(0, 8)
    : [];

  // ---- submit -------------------------------------------------------------
  const blockedBySafePrice = !!shopSettings.prevent_below_min && priceWarnings.length > 0;
  const canSubmit = (mode === 'quick'
    ? parseMoney(amount) > 0 && !(due > 0 && !customer)
    : cart.length > 0 && !(due > 0 && !customer)) && !blockedBySafePrice;

  const submit = async () => {
    if (submitting || !canSubmit) {
      if (mode === 'quick' && parseMoney(amount) <= 0) toast.error(t('billing.amountRequired'));
      else if (mode === 'items' && cart.length === 0) toast.error(t('billing.itemsRequired'));
      else if (due > 0 && !customer) toast.error(t('billing.selectForCredit'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        payment_mode: paymentMode,
        idempotency_key: idemKey.current,
        ...(customer ? { customer_id: customer.id } : {}),
        ...(redeem > 0 ? { loyalty_redeem_points: Math.min(redeem, maxRedeemable) } : {}),
      };
      if (mode === 'quick') {
        payload.mode = 'quick';
        payload.amount = (parseMoney(amount) / 100).toFixed(2);
        if (paidAmount !== '') payload.paid_amount = (parseMoney(paidAmount) / 100).toFixed(2);
      } else {
        payload.mode = 'items';
        payload.items = cart.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: (i.unitPricePaise / 100).toFixed(2),
        }));
        if (discountPaise > 0) payload.discount = (discountPaise / 100).toFixed(2);
        if (paidAmount !== '' && paymentMode !== 'credit') {
          payload.paid_amount = (parseMoney(paidAmount) / 100).toFixed(2);
        }
      }
      const { data } = await api.post('/sales', payload);
      track(ACTIVATION.FIRST_BILL, { mode: payload.mode, total_paise: data.total_paise ?? null });
      setBill(data);
      idemKey.current = newIdempotencyKey(); // fresh key for the next bill
    } catch (err) {
      toast.error(errMsg(err, t('common.errorTitle')));
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setBill(null); setCustomer(null); setAmount(''); setPaidAmount('');
    setRedeemPoints(''); setCart([]); setDiscount(''); setPaymentMode('cash');
    setPriceWarnings([]);
    idemKey.current = newIdempotencyKey();
  };

  if (bill) {
    return (
      <ReceiptModal
        bill={bill}
        shopName={activeShop?.name}
        onClose={() => setBill(null)}
        onNewBill={resetAll}
      />
    );
  }

  const filtered = productQ ? filteredProducts : [];

  return (
    <div data-testid={BILLING.page} className="max-w-2xl mx-auto space-y-4 animate-fadeInUp">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>
            {t('billing.title')}
          </h1>
          <p className="text-xs text-slate-500">{activeShop?.name}</p>
        </div>
        {/* mode toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1" role="tablist" aria-label="Billing mode">
          <button
            role="tab"
            aria-selected={mode === 'quick'}
            data-testid="mode-quick"
            onClick={() => setMode('quick')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === 'quick' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
          >
            {t('billing.quick')}
          </button>
          <button
            role="tab"
            aria-selected={mode === 'items'}
            data-testid="mode-items"
            onClick={() => setMode('items')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === 'items' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
          >
            {t('billing.items')}
          </button>
        </div>
      </div>

      {/* Customer */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('billing.customerOptional')}</p>
        <CustomerPicker
          selected={customer}
          onSelect={setCustomer}
          onClear={() => setCustomer(null)}
          onCreateNew={(q) => {
            const digits = q.replace(/\D/g, '');
            setNewCustomerPhone(digits.length === 10 ? digits : '');
            setShowNewCustomer(true);
          }}
        />
        <button
          onClick={() => { setNewCustomerPhone(''); setShowNewCustomer(true); }}
          data-testid={BILLING.addCustomerInline || 'add-customer-inline'}
          className="text-sm font-semibold text-emerald-700 hover:underline"
        >
          {t('billing.newCustomer')}
        </button>
      </section>

      {/* Mode-specific body */}
      {mode === 'quick' ? (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div>
            <label htmlFor="bill-amount" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('billing.amount')}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">{SYMBOL}</span>
              <input
                id="bill-amount"
                data-testid={BILLING.discountInput ? 'bill-amount' : 'bill-amount'}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder={t('billing.amountPh')}
                className="w-full pl-10 pr-4 py-5 text-3xl font-extrabold font-mono rounded-xl border-2 border-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            {customer && shopSettings.loyalty_enabled !== false && estimatedPoints > 0 && (
              <p className="text-xs text-amber-600 font-semibold mt-1.5">
                🪙 {t('billing.loyaltyEarned', { points: Math.floor(total / 10000) * pointsPer100 })}
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              data-testid={BILLING.productSearch}
              value={productQ}
              onChange={(e) => setProductQ(e.target.value)}
              placeholder={t('billing.searchProduct')}
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          {filtered.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  disabled={(p.stock_quantity ?? 1) <= 0}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-emerald-50 text-left disabled:opacity-40 border-b border-slate-50 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-400">{p.stock_quantity} in stock</p>
                  </div>
                  <span className="text-sm font-bold font-mono text-slate-700">{fmt(toPaise(p.selling_price))}</span>
                </button>
              ))}
            </div>
          )}

          <div data-testid={BILLING.cart} className="space-y-2">
            {cart.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-3">{t('billing.itemsRequired')}</p>
            )}
            {cart.map((i) => (
              <div key={i.product_id} className="border border-slate-200 rounded-xl p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700 truncate flex-1">{i.name}</p>
                  <button onClick={() => removeLine(i.product_id)} aria-label={t('common.delete')} className="p-1 text-slate-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2 gap-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeQty(i.product_id, -1)} aria-label="decrease" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold font-mono">{i.quantity}</span>
                    <button onClick={() => changeQty(i.product_id, 1)} aria-label="increase" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={t('billing.price')}
                      inputMode="decimal"
                      defaultValue={(i.unitPricePaise / 100).toFixed(2)}
                      onBlur={(e) => setLinePrice(i.product_id, e.target.value)}
                      onChange={(e) => setWarningsFor(i.product_id, e.target.value)}
                      className="w-20 px-2 py-1.5 text-sm font-mono font-semibold text-right border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-sm font-bold font-mono text-slate-800 w-20 text-right">{fmt(i.totalPaise)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {priceWarnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 space-y-1" role="alert"
                 data-testid="safe-price-warning">
              {priceWarnings.map((w) => (
                <div key={w.product_id} className="text-xs text-amber-800 font-semibold">
                  <p className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {t('billing.belowSafePrice')} — {w.name}</p>
                  <p className="font-medium pl-5">{t('billing.marginInfo', { margin: Math.round(w.margin / 100) })}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Payment */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('billing.payment')}</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('billing.payment')} data-testid={BILLING.paymentModeSelect}>
          {PAYMENTS.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={paymentMode === m}
              onClick={() => { setPaymentMode(m); setPaidAmount(''); }}
              className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors capitalize ${
                paymentMode === m
                  ? (m === 'credit' ? 'bg-red-500 text-white border-red-500' : 'bg-emerald-600 text-white border-emerald-600')
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
              }`}
            >
              {t(`billing.${m}`)}
            </button>
          ))}
        </div>

        {mode === 'items' && (
          <div>
            <label htmlFor="order-discount" className="block text-xs font-semibold text-slate-500 mb-1">{t('billing.discount')}</label>
            <input
              id="order-discount"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        )}

        {customer && (customer.loyalty_points || 0) > 0 && shopSettings.loyalty_enabled !== false && (
          <div className="flex items-center justify-between gap-3 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-bold text-violet-700">🪙 {t('billing.redeemPoints')}</p>
              <p className="text-[11px] text-violet-500">
                {t('billing.available')}: {customer.loyalty_points} · {fmt(redemptionPaise)}/pt
              </p>
            </div>
            <input
              data-testid="redeem-input"
              inputMode="numeric"
              value={redeemPoints}
              onChange={(e) => setRedeemPoints(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-20 px-2 py-1.5 text-sm font-mono font-bold text-right border border-violet-300 rounded-lg focus:outline-none"
            />
          </div>
        )}

        {paymentMode !== 'credit' && (
          <div>
            <label htmlFor="paid-amount" className="block text-xs font-semibold text-slate-500 mb-1">
              {t('billing.paidAmount')} <span className="text-slate-400">({t('common.optional')})</span>
            </label>
            <input
              id="paid-amount"
              inputMode="decimal"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder={(total / 100).toFixed(2)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        )}

        {customer && (customer.credit_due_paise || 0) > 0 && (
          <p className="text-xs text-red-500 font-semibold">
            {t('billing.dueAmount', { amount: fmt(customer.credit_due_paise).replace('₹', '') })}
          </p>
        )}
      </section>

      {/* Totals + submit (sticky) */}
      <div className="sticky bottom-20 lg:bottom-4 z-10 bg-white rounded-2xl border border-slate-200 shadow-lg p-4 space-y-3">
        <div className="space-y-1 text-sm">
          {mode === 'items' && (
            <>
              <div className="flex justify-between text-slate-500">
                <span>{t('billing.subtotal')}</span><span className="font-mono">{fmt(subtotal)}</span>
              </div>
              {discountPaise > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>{t('billing.discount')}</span><span className="font-mono">-{fmt(discountPaise)}</span>
                </div>
              )}
            </>
          )}
          {redeemValue > 0 && (
            <div className="flex justify-between text-violet-600">
              <span>{t('billing.redeemPoints')} ({Math.min(redeem, maxRedeemable)})</span>
              <span className="font-mono">-{fmt(redeemValue)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-slate-100">
            <span className="font-bold text-slate-800">{t('billing.total')}</span>
            <span className="text-2xl font-extrabold font-mono text-emerald-700">{fmt(total)}</span>
          </div>
          {due > 0 && (
            <div className="flex justify-between text-red-600 font-semibold">
              <span>{t('billing.due')}</span><span className="font-mono">{fmt(due)}</span>
            </div>
          )}
          {!customer && paymentMode !== 'credit' && due > 0 && (
            <p className="text-xs text-red-500">{t('billing.selectForCredit')}</p>
          )}
          {!customer && paymentMode !== 'credit' && total > 0 && due === 0 && (
            <p className="text-xs text-slate-400">{t('billing.walkinNote')}</p>
          )}
        </div>
        <button
          data-testid={BILLING.createBillBtn}
          onClick={submit}
          disabled={submitting || !canSubmit}
          className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
        >
          {submitting ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t('billing.creating')}
            </>
          ) : (
            <>{t('billing.createBill')} · {fmt(total)}</>
          )}
        </button>
      </div>

      {showNewCustomer && (
        <NewCustomerModal
          initialPhone={newCustomerPhone}
          onClose={() => setShowNewCustomer(false)}
          onCreated={(c) => {
            // return to the SAME bill with the customer pre-selected
            setCustomer(c);
            setShowNewCustomer(false);
            toast.success(`${c.name} ✓`);
          }}
        />
      )}
    </div>
  );
}
