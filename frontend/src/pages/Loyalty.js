import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Gift, Crown, Star, Award, TrendingUp, Users } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MEMBERSHIP_BADGES = {
  bronze: { Icon: Award, color: 'amber', gradient: 'from-amber-400 to-orange-400' },
  silver: { Icon: Star, color: 'slate', gradient: 'from-slate-400 to-slate-500' },
  gold: { Icon: Crown, color: 'yellow', gradient: 'from-yellow-400 to-amber-400' },
  vip: { Icon: Crown, color: 'purple', gradient: 'from-purple-500 to-indigo-500' },
};

export default function Loyalty() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [rules, setRules] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [l, r, t] = await Promise.all([
        axios.get(`${API}/loyalty/leaderboard`),
        axios.get(`${API}/loyalty/rules`),
        axios.get(`${API}/loyalty/transactions`)
      ]);
      setLeaderboard(l.data || []);
      setRules(r.data || {});
      setTransactions(t.data || []);
    } finally {
      setLoading(false);
    }
  };

  const tierColors = { bronze: 'bg-amber-50 border-amber-200', silver: 'bg-slate-50 border-slate-200', gold: 'bg-yellow-50 border-yellow-200', vip: 'bg-purple-50 border-purple-200' };

  return (
    <div className="space-y-4 animate-fadeInUp">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Loyalty & Rewards</h1>
        <p className="text-slate-500 text-sm">Customer points and membership tiers</p>
      </div>

      {/* Loyalty Rules */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="w-5 h-5 text-purple-600" />
          <h3 className="font-bold text-purple-800" style={{fontFamily:'Outfit,sans-serif'}}>Loyalty Rules</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Points per ₹100', value: rules.points_per_100 || 1 },
            { label: 'Silver at', value: `${rules.silver_threshold || 500} pts` },
            { label: 'Gold at', value: `${rules.gold_threshold || 2000} pts` },
            { label: 'VIP at', value: `${rules.vip_threshold || 5000} pts` },
          ].map(r => (
            <div key={r.label} className="bg-white/80 rounded-xl p-3 text-center">
              <p className="text-lg font-bold font-mono text-purple-700">{r.value}</p>
              <p className="text-xs text-purple-500 font-semibold">{r.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-purple-600 mt-3 font-medium">1 point = ₹{rules.redemption_value || 0.1} discount at checkout</p>
      </div>

      {/* Membership Tiers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(MEMBERSHIP_BADGES).map(([tier, { Icon, color, gradient }]) => {
          const count = leaderboard.filter(c => c.membership_level === tier).length;
          return (
            <div key={tier} className={`rounded-xl border p-4 text-center ${tierColors[tier]}`}>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mx-auto mb-2`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="font-bold text-slate-800 capitalize">{tier}</p>
              <p className="text-2xl font-bold font-mono text-slate-700 mt-1">{count}</p>
              <p className="text-xs text-slate-500">customers</p>
            </div>
          );
        })}
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-50">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>Points Leaderboard</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {leaderboard.map((c, i) => {
              const { Icon, gradient } = MEMBERSHIP_BADGES[c.membership_level] || MEMBERSHIP_BADGES.bronze;
              return (
                <div key={c.id || i} className="flex items-center gap-3 px-4 py-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${i === 0 ? 'bg-yellow-100 text-yellow-600' : i === 1 ? 'bg-slate-100 text-slate-500' : i === 2 ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>{i + 1}</span>
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white font-bold text-sm">{c.name?.[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-700 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{c.membership_level} · {c.customer_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold font-mono text-purple-600">{c.loyalty_points?.toFixed(0)}</p>
                    <p className="text-xs text-slate-400">points</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50">
            <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>Recent Transactions</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {transactions.slice(0, 8).map((t, i) => (
              <div key={t.id || i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Gift className="w-4 h-4 text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">{t.customer?.name || 'Unknown'}</p>
                  <p className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-right">
                  {t.points_earned > 0 && <p className="text-sm font-bold text-emerald-600">+{t.points_earned?.toFixed(1)} pts</p>}
                  {t.points_redeemed > 0 && <p className="text-sm font-bold text-amber-600">-{t.points_redeemed?.toFixed(1)} pts</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
