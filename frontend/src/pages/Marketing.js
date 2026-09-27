import React, { useState } from 'react';
import { Megaphone, Send, MessageSquare, Users, Star, Gift, ShoppingBag, Cake, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';

const CAMPAIGN_TEMPLATES = [
  { id: 'festival', icon: Star, title: 'Festival Offer', desc: 'Diwali, Holi, Eid special discount', color: 'amber', template: 'Happy Festival! Get 15% OFF on all purchases. Use code: FEST15. Valid for 3 days. Visit us at {business_name}!' },
  { id: 'new_product', icon: ShoppingBag, title: 'New Stock Arrived', desc: 'Announce new products to customers', color: 'blue', template: 'Exciting news! Fresh stock just arrived at {business_name}. Come check out our new collection. See you soon!' },
  { id: 'loyalty', icon: Gift, title: 'Loyalty Reward', desc: 'Reward your loyal customers', color: 'purple', template: 'Dear Customer, your loyalty matters! You have earned bonus points. Redeem them on your next visit to {business_name}.' },
  { id: 'winback', icon: Users, title: 'Win-Back Campaign', desc: 'Re-engage inactive customers', color: 'red', template: 'We miss you! It\'s been a while since your last visit. Come back to {business_name} and enjoy a special 10% discount. Limited time!' },
  { id: 'birthday', icon: Cake, title: 'Birthday Wishes', desc: 'Send birthday greetings + offers', color: 'pink', template: 'Happy Birthday! Wishing you a wonderful day! As a gift from {business_name}, enjoy a special birthday discount on your next visit.' },
  { id: 'clearance', icon: Megaphone, title: 'Clearance Sale', desc: 'Promote discounted stock', color: 'emerald', template: 'BIG SALE at {business_name}! Up to 30% OFF on selected items. Limited stock. Hurry, offer valid today only!' },
];

const COLORS = { amber: 'bg-amber-50 border-amber-200 text-amber-700', blue: 'bg-blue-50 border-blue-200 text-blue-700', purple: 'bg-purple-50 border-purple-200 text-purple-700', red: 'bg-red-50 border-red-200 text-red-700', pink: 'bg-pink-50 border-pink-200 text-pink-700', emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
const ICON_BG = { amber: 'bg-amber-100', blue: 'bg-blue-100', purple: 'bg-purple-100', red: 'bg-red-100', pink: 'bg-pink-100', emerald: 'bg-emerald-100' };

export default function Marketing() {
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState('all');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) { toast.error('Write a message first'); return; }
    setSending(true);
    await new Promise(r => setTimeout(r, 1500));
    setSent(true);
    setSending(false);
    toast.success('Campaign sent! (Demo mode — WhatsApp API not configured)');
  };

  return (
    <div className="space-y-5 animate-fadeInUp">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Marketing & Campaigns</h1>
        <p className="text-slate-500 text-sm">Reach your customers with targeted messages</p>
      </div>

      {/* WhatsApp Status Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-700 font-medium">WhatsApp Business API not configured. Messages will be shown in DEMO mode.</p>
      </div>

      {/* Campaign Templates */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Choose a Campaign Type</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CAMPAIGN_TEMPLATES.map(t => {
            const Icon = t.icon;
            const isSelected = selected?.id === t.id;
            return (
              <button key={t.id} onClick={() => { setSelected(t); setMessage(t.template.replace('{business_name}', 'Our Store')); setSent(false); }}
                className={`p-3 rounded-xl border text-left transition-all card-hover ${isSelected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/30' : COLORS[t.color] + ' border'}`}>
                <div className={`w-8 h-8 rounded-lg ${ICON_BG[t.color]} flex items-center justify-center mb-2`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="font-bold text-sm text-slate-700">{t.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Message Composer */}
      {selected && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4 animate-fadeInUp">
          <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>Compose Message</h3>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Target Audience</label>
            <select value={segment} onChange={e => setSegment(e.target.value)} className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white">
              <option value="all">All Customers</option>
              <option value="vip">VIP Customers</option>
              <option value="inactive">Inactive Customers (30+ days)</option>
              <option value="high_value">High Value Customers</option>
              <option value="new">New Customers (last 30 days)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Message Text</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none" placeholder="Write your campaign message..." />
            <p className="text-xs text-slate-400 mt-1 text-right">{message.length} chars · ~{Math.ceil(message.length / 160)} SMS</p>
          </div>

          {/* WhatsApp Preview */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">WhatsApp Preview</p>
            <div className="bg-[#128C7E] rounded-xl p-4">
              <div className="bg-white rounded-xl p-3 shadow-sm max-w-64 ml-auto">
                <p className="text-sm text-slate-700 leading-relaxed">{message || 'Your message here...'}</p>
                <p className="text-xs text-slate-400 text-right mt-1">now ✓✓</p>
              </div>
            </div>
          </div>

          {sent ? (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-emerald-800">Campaign Sent! (Demo Mode)</p>
                <p className="text-sm text-emerald-600">Configure WhatsApp Business API to send real messages.</p>
              </div>
            </div>
          ) : (
            <button onClick={handleSend} disabled={sending} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60">
              {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Send className="w-4 h-4" /><span>Send Campaign</span></>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
