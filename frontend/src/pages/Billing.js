import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ShoppingCart, Search, Plus, Minus, X, User, Check, Printer, Share2, Receipt } from 'lucide-react';
import { BILLING } from '@/constants/testIds';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash', color: 'emerald' },
  { value: 'upi', label: 'UPI', color: 'blue' },
  { value: 'card', label: 'Card', color: 'indigo' },
  { value: 'udhaar', label: 'Udhaar', color: 'red' },
];

export default function Billing() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    const { data } = await axios.get(`${API}/products?limit=200`);
    setProducts(data.products || []);
  };

  useEffect(() => {
    if (productSearch.length > 0) {
      const filtered = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase()));
      setFilteredProducts(filtered.slice(0, 8));
      setShowProductDropdown(true);
    } else {
      setShowProductDropdown(false);
    }
  }, [productSearch, products]);

  const searchCustomers = async (q) => {
    setCustomerSearch(q);
    if (q.length < 2) { setCustomers([]); setShowCustomerDropdown(false); return; }
    const { data } = await axios.get(`${API}/customers/search?q=${q}`);
    setCustomers(data);
    setShowCustomerDropdown(true);
  };

  const addToCart = (product) => {
    if (product.stock_quantity <= 0) { toast.error(`${product.name} is out of stock`); return; }
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) { toast.error('Insufficient stock'); return prev; }
        return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unit_price } : i);
      }
      return [...prev, { product_id: product.id, product_name: product.name, sku: product.sku, quantity: 1, unit_price: product.selling_price, stock_max: product.stock_quantity, discount: 0, total: product.selling_price }];
    });
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const newQty = Math.max(1, Math.min(i.quantity + delta, i.stock_max));
      return { ...i, quantity: newQty, total: newQty * i.unit_price };
    }));
  };

  const removeFromCart = (productId) => setCart(prev => prev.filter(i => i.product_id !== productId));

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const discountAmt = parseFloat(discount) || 0;
  const total = subtotal - discountAmt;

  const handleCreateBill = async () => {
    if (cart.length === 0) { toast.error('Add at least one product'); return; }
    if (paymentMode === 'udhaar' && !selectedCustomer) { toast.error('Select a customer for Udhaar'); return; }
    setSubmitting(true);
    try {
      const payload = {
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer?.name || null,
        items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity, discount: i.discount })),
        discount: discountAmt,
        payment_mode: paymentMode,
        paid_amount: paymentMode === 'partial' ? parseFloat(paidAmount) : null
      };
      const { data } = await axios.post(`${API}/sales`, payload);
      setInvoice(data);
      toast.success(`Bill created! ${data.invoice_number}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create bill');
    } finally {
      setSubmitting(false);
    }
  };

  const resetBilling = () => { setCart([]); setSelectedCustomer(null); setCustomerSearch(''); setDiscount(0); setPaymentMode('cash'); setInvoice(null); };

  if (invoice) return (
    <div data-testid={BILLING.invoiceModal} className="max-w-md mx-auto animate-fadeInUp">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white text-center">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold" style={{fontFamily:'Outfit,sans-serif'}}>Bill Created!</h2>
          <p className="text-emerald-100 text-sm mt-1">{invoice.invoice_number}</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Customer</span><span className="font-semibold">{invoice.customer_name || 'Walk-in'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Items</span><span className="font-semibold">{invoice.items?.length} items</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span className="font-mono font-semibold">₹{invoice.subtotal?.toFixed(2)}</span></div>
          {invoice.discount > 0 && <div className="flex justify-between text-sm text-amber-600"><span>Discount</span><span className="font-mono">-₹{invoice.discount?.toFixed(2)}</span></div>}
          <div className="flex justify-between text-base font-bold border-t border-slate-100 pt-2"><span>Total</span><span className="font-mono text-emerald-600">₹{invoice.total_amount?.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Payment</span><span className="font-semibold capitalize">{invoice.payment_mode}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Status</span><span className={`font-semibold capitalize ${invoice.payment_status === 'paid' ? 'text-emerald-600' : 'text-red-600'}`}>{invoice.payment_status}</span></div>
          <div className="flex gap-2 pt-2">
            <button onClick={resetBilling} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-colors">New Bill</button>
            <button className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50"><Share2 className="w-4 h-4" />WhatsApp</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div data-testid={BILLING.page} className="max-w-4xl mx-auto space-y-4 animate-fadeInUp">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Billing / POS</h1>
        <p className="text-slate-500 text-sm">Create a new bill quickly</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Customer + Products */}
        <div className="lg:col-span-3 space-y-4">
          {/* Customer */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Customer (Optional)</p>
            <div className="relative">
              {selectedCustomer ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-emerald-700">{selectedCustomer.name[0]}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{selectedCustomer.name}</p>
                      <p className="text-xs text-slate-400">{selectedCustomer.phone} · {selectedCustomer.loyalty_points?.toFixed(0)} pts</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCustomer(null)} className="p-1 rounded-lg hover:bg-emerald-100"><X className="w-4 h-4 text-slate-400" /></button>
                </div>
              ) : (
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input data-testid={BILLING.customerSearch} value={customerSearch} onChange={e => searchCustomers(e.target.value)} placeholder="Search customer by name or phone..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
              )}
              {showCustomerDropdown && customers.length > 0 && !selectedCustomer && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-xl border border-slate-100 shadow-xl overflow-hidden">
                  {customers.map(c => (
                    <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomers([]); setShowCustomerDropdown(false); setCustomerSearch(''); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-emerald-700">{c.name[0]}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.phone} · {c.loyalty_points?.toFixed(0)} pts</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Product Search */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Add Products</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input data-testid={BILLING.productSearch} value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search product by name or SKU..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              {showProductDropdown && filteredProducts.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-xl border border-slate-100 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button key={p.id} onClick={() => addToCart(p)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.sku} · Stock: {p.stock_quantity}</p>
                      </div>
                      <span className="text-sm font-bold font-mono text-emerald-600">₹{p.selling_price}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          {cart.length > 0 && (
            <div data-testid={BILLING.cart} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cart ({cart.length} items)</p>
                <button onClick={() => setCart([])} className="text-xs text-red-500 font-semibold hover:text-red-700">Clear All</button>
              </div>
              <div className="divide-y divide-slate-50">
                {cart.map(item => (
                  <div key={item.product_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{item.product_name}</p>
                      <p className="text-xs text-slate-400 font-mono">₹{item.unit_price} each</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQty(item.product_id, -1)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product_id, 1)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                    <span className="text-sm font-bold font-mono text-slate-700 w-16 text-right">₹{item.total.toFixed(0)}</span>
                    <button onClick={() => removeFromCart(item.product_id)} className="p-1 text-slate-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Checkout */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3 lg:sticky lg:top-20">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Summary</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono font-semibold">₹{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Discount (₹)</span>
                <input data-testid={BILLING.discountInput} type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" min="0" max={subtotal} className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
              </div>
              <div className="flex justify-between text-base font-bold border-t border-slate-100 pt-2">
                <span>Total</span>
                <span className="font-mono text-emerald-600">₹{total.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Payment Mode</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PAYMENT_MODES.map(mode => (
                  <button key={mode.value} data-testid={`${BILLING.paymentModeSelect}-${mode.value}`} onClick={() => setPaymentMode(mode.value)} className={`py-2 rounded-xl text-sm font-semibold transition-colors border ${paymentMode === mode.value ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <button data-testid={BILLING.createBillBtn} onClick={handleCreateBill} disabled={cart.length === 0 || submitting} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Receipt className="w-4 h-4" /><span>Create Bill</span></>}
            </button>

            {cart.length === 0 && (
              <p className="text-xs text-slate-400 text-center">Add products to create a bill</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
