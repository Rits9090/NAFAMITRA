import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Users, Package, CreditCard, Truck, Gift,
  Megaphone, BarChart2, Mic, MessageSquare, Settings, LogOut, ChevronRight,
  Bell, Store, Menu, X
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import VoiceButton from '@/components/VoiceButton';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/billing', label: 'Billing / POS', icon: ShoppingCart },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/udhaar', label: 'Udhaar', icon: CreditCard },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/loyalty', label: 'Loyalty', icon: Gift },
  { to: '/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/reports', label: 'Reports', icon: BarChart2 },
  { to: '/voice', label: 'Voice Assistant', icon: Mic },
  { to: '/assistant', label: 'AI Assistant', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const mobileNavItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard, exact: true },
  { to: '/billing', label: 'Billing', icon: ShoppingCart },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/udhaar', label: 'Udhaar', icon: CreditCard },
  { to: '/products', label: 'Products', icon: Package },
];

export default function Layout() {
  const { user, business, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/auth'); };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-800 text-sm truncate" style={{fontFamily:'Outfit,sans-serif'}}>
              {business?.name || 'NafaMitra'}
            </p>
            <p className="text-xs text-slate-500 capitalize">{business?.category || 'Business'}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <Icon className="w-4.5 h-4.5 flex-shrink-0" style={{width:'18px',height:'18px'}} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
            <span className="text-xs font-bold text-emerald-700">{user?.name?.[0]?.toUpperCase() || 'U'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-700 truncate">{user?.name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-500 text-sm font-medium hover:bg-red-50 transition-colors">
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-slate-100 fixed top-0 left-0 h-screen z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-2xl z-50">
            <div className="absolute top-4 right-4">
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:ml-56">
        {/* Top Header */}
        <header className="bg-white/90 backdrop-blur border-b border-slate-100 sticky top-0 z-20 px-4 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <button className="lg:hidden p-2 rounded-lg hover:bg-slate-100" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <div className="lg:hidden flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Store className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-slate-800 text-sm" style={{fontFamily:'Outfit,sans-serif'}}>NafaMitra</span>
              </div>
              <div className="hidden lg:block">
                <span className="text-lg font-bold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>
                  {business?.name || 'NafaMitra'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg hover:bg-slate-100 relative">
                <Bell className="w-5 h-5 text-slate-500" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-emerald-700">{user?.name?.[0]?.toUpperCase()}</span>
                </div>
                <span className="text-sm font-medium text-slate-700">{user?.name?.split(' ')[0]}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 pb-24 lg:pb-6 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 flex">
        {mobileNavItems.map(({ to, label, icon: Icon, exact }) => (
          <NavLink key={to} to={to} end={exact} className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
            <Icon style={{width:'20px',height:'20px'}} />
            <span className="text-[10px]">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Global Voice Button */}
      <VoiceButton />
    </div>
  );
}
