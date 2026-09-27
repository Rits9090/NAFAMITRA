import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Store, Eye, EyeOff, ArrowRight, ChevronRight } from 'lucide-react';
import { AUTH } from '@/constants/testIds';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIES = [
  { value: 'kirana', label: 'Kirana / General Store' },
  { value: 'apparel', label: 'Clothing / Apparel' },
  { value: 'pharmacy', label: 'Pharmacy / Medical' },
  { value: 'electronics', label: 'Electronics / Mobile' },
  { value: 'salon', label: 'Salon / Beauty' },
  { value: 'hardware', label: 'Hardware / Tools' },
  { value: 'restaurant', label: 'Restaurant / Food' },
  { value: 'other', label: 'Other Business' },
];

export default function Login() {
  const { login, register, setupBusiness } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' });
  const [businessForm, setBusinessForm] = useState({ name: '', category: 'kirana', address: '', phone: '', gst_number: '' });

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const setBiz = (k) => (e) => setBusinessForm(p => ({ ...p, [k]: e.target.value }));

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      // First seed the demo data
      await axios.post(`${API}/seed`).catch(() => {});
      await login('demo@nafamitra.com', 'Demo@123');
      navigate('/');
    } catch {
      toast.error('Demo login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      if (!data.business) { setNeedsSetup(true); } else { navigate('/'); }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return toast.error('Please fill all required fields');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.phone);
      setNeedsSetup(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBusinessSetup = async (e) => {
    e.preventDefault();
    if (!businessForm.name || !businessForm.category) return toast.error('Business name and category are required');
    setLoading(true);
    try {
      await setupBusiness(businessForm);
      toast.success('Business setup complete! Welcome to NafaMitra.');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  if (needsSetup) return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Store className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Setup Your Business</h1>
          <p className="text-slate-500 text-sm mt-1">Tell us about your store</p>
        </div>
        <form data-testid={AUTH.businessSetupForm} onSubmit={handleBusinessSetup} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Business Name *</label>
            <input data-testid={AUTH.businessNameInput} value={businessForm.name} onChange={setBiz('name')} placeholder="e.g. Shree Ganesh General Store" required className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Business Category *</label>
            <select data-testid={AUTH.businessCategorySelect} value={businessForm.category} onChange={setBiz('category')} className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Business Address</label>
            <input value={businessForm.address} onChange={setBiz('address')} placeholder="Shop address (optional)" className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">GST Number (optional)</label>
            <input value={businessForm.gst_number} onChange={setBiz('gst_number')} placeholder="e.g. 27AAPFG1234A1Z5" className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <button data-testid={AUTH.setupBusinessBtn} type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><span>Start Using NafaMitra</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-xl">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight" style={{fontFamily:'Outfit,sans-serif'}}>NafaMitra</h1>
          <p className="text-slate-500 text-sm mt-1">ग्राहक बढ़ाओ, मुनाफ़ा बढ़ाओ!</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {['login', 'register'].map(t => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3.5 text-sm font-semibold transition-colors capitalize ${tab === t ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-600'}`}>
                {t === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'login' ? (
              <form data-testid={AUTH.loginForm} onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                  <input data-testid={AUTH.emailInput} type="email" value={form.email} onChange={set('email')} placeholder="your@email.com" required className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
                  <div className="relative mt-1.5">
                    <input data-testid={AUTH.passwordInput} type={showPwd ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Enter password" required className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 pr-11" />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button data-testid={AUTH.loginBtn} type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Sign In'}
                </button>
              </form>
            ) : (
              <form data-testid={AUTH.loginForm} onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Name *</label>
                  <input data-testid={AUTH.nameInput} type="text" value={form.name} onChange={set('name')} placeholder="Your name" required className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email *</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="your@email.com" required className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password *</label>
                  <div className="relative mt-1.5">
                    <input type={showPwd ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Min 6 characters" required className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 pr-11" />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button data-testid={AUTH.registerBtn} type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Create Account'}
                </button>
              </form>
            )}

            <div className="mt-4 relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100" /></div>
              <div className="relative flex justify-center"><span className="px-3 bg-white text-xs text-slate-400">or</span></div>
            </div>

            <button onClick={handleDemoLogin} disabled={loading} className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-emerald-200 text-emerald-700 font-semibold text-sm hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2">
              <ChevronRight className="w-4 h-4" />
              Try Demo — Shree Ganesh General Store
            </button>

            <p className="text-center text-xs text-slate-400 mt-4">Demo: demo@nafamitra.com / Demo@123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
