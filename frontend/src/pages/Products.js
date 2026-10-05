import React, { useCallback, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Package, Plus, Search, Edit2, Trash2, X, AlertTriangle, TrendingUp } from 'lucide-react';
import { PRODUCTS } from '@/constants/testIds';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';


const STOCK_STATUS = {
  in_stock: { labelKey: 'prod.inStock', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  low_stock: { labelKey: 'prod.lowStock', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  out_of_stock: { labelKey: 'prod.outStock', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

const EMPTY_FORM = { name: '', category: '', selling_price: '', purchase_price: '', stock_quantity: '', low_stock_threshold: 5, sku: '', brand: '', unit: 'piece' };

export default function Products() {
  const { t } = useI18n();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Mount-only initial load (filters start empty; debounced effect below handles changes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadProducts(); loadCategories(); }, []);
  useEffect(() => {
    const t = setTimeout(() => loadProducts(), 400);
    return () => clearTimeout(t);
  }, [loadProducts]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (search) params.append('search', search);
      if (categoryFilter) params.append('category', categoryFilter);
      const { data } = await api.get(`/products?${params}`);
      setProducts(data.products || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);
  const loadCategories = async () => {
    const { data } = await api.get(`/products/categories`);
    setCategories(data || []);
  };

  const openEdit = (p) => {
    setEditProduct(p);
    setForm({ name: p.name, category: p.category, selling_price: p.selling_price, purchase_price: p.purchase_price, stock_quantity: p.stock_quantity, low_stock_threshold: p.low_stock_threshold, sku: p.sku || '', brand: p.brand || '', unit: p.unit || 'piece' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.selling_price || !form.purchase_price) return toast.error(t('prod.nameRequired'));
    setSubmitting(true);
    try {
      if (editProduct) {
        await api.put(`/products/${editProduct.id}`, form);
        toast.success(t('prod.updated'));
      } else {
        await api.post(`/products`, form);
        toast.success(t('prod.added', { name: form.name }));
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditProduct(null);
      loadProducts();
      loadCategories();
    } catch (err) {
      toast.error(errMsg(err, t('prod.saveFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(t('prod.confirmDelete', { name: p.name }))) return;
    await api.delete(`/products/${p.id}`);
    toast.success(t('prod.deleted'));
    loadProducts();
  };

  const getStatus = (p) => {
    if (p.stock_quantity === 0) return 'out_of_stock';
    if (p.stock_quantity <= (p.low_stock_threshold || 5)) return 'low_stock';
    return 'in_stock';
  };

  return (
    <div data-testid={PRODUCTS.page} className="space-y-4 animate-fadeInUp">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>{t('nav.products')}</h1>
          <p className="text-slate-500 text-sm">{t('prod.catalogue', { n: String(total) })}</p>
        </div>
        <button data-testid={PRODUCTS.addBtn} onClick={() => { setEditProduct(null); setForm(EMPTY_FORM); setShowModal(true); }} className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('prod.add')}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input data-testid={PRODUCTS.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('prod.phSearch')} className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
          <option value="">{t('prod.allCategories')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div data-testid={PRODUCTS.list} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map(p => {
            const status = getStatus(p);
            const sc = STOCK_STATUS[status];
            const margin = p.purchase_price > 0 ? ((p.selling_price - p.purchase_price) / p.purchase_price * 100).toFixed(1) : 0;
            return (
              <div key={p.id} data-testid={PRODUCTS.card} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-emerald-200 hover:shadow-md transition-all card-hover">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.category} · {p.sku}</p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl font-bold font-mono text-slate-800">₹{p.selling_price}</span>
                  <span className="text-xs text-slate-400 font-mono line-through">₹{p.purchase_price}</span>
                  <span className="text-xs text-emerald-600 font-semibold ml-auto"><TrendingUp className="w-3 h-3 inline mr-0.5" />{margin}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${sc.bg} ${sc.text} border ${sc.border}`}>{t(sc.labelKey)}</span>
                  <span className="text-xs text-slate-500 font-semibold">{t('prod.stockLine', { n: String(p.stock_quantity), unit: p.unit })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-fadeInUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>{editProduct ? t('prod.edit') : t('prod.addNew')}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('prod.fName')}</label>
                <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder={t('prod.phName')} required className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('prod.fSell')}</label>
                  <input data-testid={PRODUCTS.priceInput} type="number" value={form.selling_price} onChange={e => setForm(p => ({...p, selling_price: e.target.value}))} placeholder="₹0" required min="0" className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('prod.fBuy')}</label>
                  <input type="number" value={form.purchase_price} onChange={e => setForm(p => ({...p, purchase_price: e.target.value}))} placeholder="₹0" required min="0" className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('prod.fCat')}</label>
                  <input value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))} placeholder={t('prod.phCat')} className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('prod.fStock')}</label>
                  <input type="number" value={form.stock_quantity} onChange={e => setForm(p => ({...p, stock_quantity: e.target.value}))} min="0" className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</label>
                  <input value={form.sku} onChange={e => setForm(p => ({...p, sku: e.target.value}))} placeholder={t('prod.phSku')} className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('prod.fUnit')}</label>
                  <select value={form.unit} onChange={e => setForm(p => ({...p, unit: e.target.value}))} className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white">
                    {['piece','kg','litre','packet','box','bottle','jar'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">{t('common.cancel')}</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 flex items-center justify-center">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (editProduct ? t('prod.saveChanges') : t('prod.add'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
