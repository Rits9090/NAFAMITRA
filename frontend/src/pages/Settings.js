import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Settings as SettingsIcon, Store, Save, CreditCard, Users, Package, Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Settings() {
  const { business, refreshBusiness } = useAuth();
  const [form, setForm] = useState({ name: '', category: '', address: '', phone: '', gst_number: '' });
  const [loyaltyRules, setLoyaltyRules] = useState({ points_per_100: 1, silver_threshold: 500, gold_threshold: 2000, vip_threshold: 5000, redemption_value: 0.1 });
  const [saving, setSaving] = useState(false);
  const [savingLoyalty, setSavingLoyalty] = useState(false);

  const CATEGORIES = [
    { value: 'kirana', label: 'Kirana / General Store' }, { value: 'apparel', label: 'Clothing / Apparel' },
    { value: 'pharmacy', label: 'Pharmacy / Medical' }, { value: 'electronics', label: 'Electronics / Mobile' },
    { value: 'salon', label: 'Salon / Beauty' }, { value: 'hardware', label: 'Hardware' },
    { value: 'restaurant', label: 'Restaurant / Food' }, { value: 'other', label: 'Other' },
  ];

  useEffect(() => {
    if (business) setForm({ name: business.name || '', category: business.category || '', address: business.address || '', phone: business.phone || '', gst_number: business.gst_number || '' });
    loadLoyaltyRules();
  }, [business]);

  const loadLoyaltyRules = async () => {
    try {
      const { data } = await axios.get(`${API}/loyalty/rules`);
      setLoyaltyRules(data);
    } catch {}
  };

  const handleSaveBusiness = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/auth/business`, form);
      await refreshBusiness();
      toast.success('Business settings saved!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLoyalty = async (e) => {
    e.preventDefault();
    setSavingLoyalty(true);
    try {
      await axios.put(`${API}/loyalty/rules`, loyaltyRules);
      toast.success('Loyalty rules updated!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setSavingLoyalty(false);
    }
  };

  const setL = (k) => (e) => setLoyaltyRules(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  const setF = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-5 animate-fadeInUp max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Settings</h1>
        <p className="text-slate-500 text-sm">Manage your business configuration</p>
      </div>

      {/* Business Profile */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50 bg-slate-50">
          <Store className="w-4.5 h-4.5 text-emerald-600" style={{width:'18px',height:'18px'}} />
          <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>Business Profile</h3>
        </div>
        <form onSubmit={handleSaveBusiness} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Business Name *</label>
              <input value={form.name} onChange={setF('name')} required placeholder="Your store name" className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</label>
              <select value={form.category} onChange={setF('category')} className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</label>
              <input value={form.phone} onChange={setF('phone')} placeholder="Business phone" className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Address</label>
              <input value={form.address} onChange={setF('address')} placeholder="Full business address" className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">GST Number</label>
              <input value={form.gst_number} onChange={setF('gst_number')} placeholder="GSTIN (optional)" className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="flex items-center gap-2 bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </form>
      </div>

      {/* Loyalty Rules */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50 bg-purple-50">
          <CreditCard className="w-4.5 h-4.5 text-purple-600" style={{width:'18px',height:'18px'}} />
          <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>Loyalty Rules</h3>
        </div>
        <form onSubmit={handleSaveLoyalty} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'points_per_100', label: 'Points per ₹100 spent', min: 0.1, step: 0.1 },
              { key: 'redemption_value', label: '₹ value per point', min: 0.01, step: 0.01 },
              { key: 'silver_threshold', label: 'Silver tier (points)', min: 1, step: 1 },
              { key: 'gold_threshold', label: 'Gold tier (points)', min: 1, step: 1 },
              { key: 'vip_threshold', label: 'VIP tier (points)', min: 1, step: 1 },
            ].map(({ key, label, min, step }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
                <input type="number" value={loyaltyRules[key]} onChange={setL(key)} min={min} step={step} className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 font-mono" />
              </div>
            ))}
          </div>
          <button type="submit" disabled={savingLoyalty} className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60">
            {savingLoyalty ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Save Loyalty Rules
          </button>
        </form>
      </div>

      {/* Subscription Info */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-emerald-800" style={{fontFamily:'Outfit,sans-serif'}}>NafaMitra Pro Plan</p>
            <p className="text-sm text-emerald-600 mt-0.5">All features unlocked · Unlimited customers & products</p>
          </div>
          <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">Active</span>
        </div>
      </div>
    </div>
  );
}
