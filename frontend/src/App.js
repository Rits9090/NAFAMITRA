import React, { Suspense, lazy } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { I18nProvider } from '@/i18n';

const Login = lazy(() => import('@/pages/Login'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Layout = lazy(() => import('@/components/Layout'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Billing = lazy(() => import('@/pages/Billing'));
const BillsList = lazy(() => import('@/pages/Bills').then((m) => ({ default: m.BillsList })));
const BillDetail = lazy(() => import('@/pages/Bills').then((m) => ({ default: m.BillDetail })));
const CustomersList = lazy(() => import('@/pages/Customers'));
const CustomerDetail = lazy(() => import('@/pages/Customers').then((m) => ({ default: m.CustomerDetail })));
const Products = lazy(() => import('@/pages/Products'));
const Credit = lazy(() => import('@/pages/Credit'));
const Loyalty = lazy(() => import('@/pages/Loyalty'));
const Staff = lazy(() => import('@/pages/Staff'));
const More = lazy(() => import('@/pages/More'));
const Suppliers = lazy(() => import('@/pages/Suppliers'));
const Reports = lazy(() => import('@/pages/Reports'));
const VoiceAssistant = lazy(() => import('@/pages/VoiceAssistant'));
const AIAssistant = lazy(() => import('@/pages/AIAssistant'));
const Settings = lazy(() => import('@/pages/Settings'));
const Marketing = lazy(() => import('@/pages/Marketing'));
const CustomerApp = lazy(() => import('@/pages/customer/CustomerApp'));
const CustomerHome = lazy(() => import('@/pages/customer/Home'));
const CustomerBills = lazy(() => import('@/pages/customer/Bills').then((m) => ({ default: m.CustomerBills })));
const CustomerBillDetail = lazy(() => import('@/pages/customer/Bills').then((m) => ({ default: m.CustomerBillDetail })));
const CustomerLoyalty = lazy(() => import('@/pages/customer/Bills').then((m) => ({ default: m.CustomerLoyalty })));
const CustomerCredit = lazy(() => import('@/pages/customer/Bills').then((m) => ({ default: m.CustomerCredit })));
const CustomerProfile = lazy(() => import('@/pages/customer/Profile').then((m) => ({ default: m.CustomerProfile })));
const PassbookEntry = lazy(() => import('@/pages/customer/Profile').then((m) => ({ default: m.PassbookEntry })));
const CustomerSearch = lazy(() => import('@/pages/customer/Search'));
const CustomerMyNafa = lazy(() => import('@/pages/customer/MyNafa'));
const CustomerNotifications = lazy(() => import('@/pages/customer/Notifications'));
const MerchantRequirements = lazy(() => import('@/pages/Requirements'));
const PublicReceipt = lazy(() => import('@/pages/PublicReceipt'));

function Boot({ children }) {
  const { isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-500 font-medium">NafaMitra…</p>
      </div>
    </div>
  );
  return children;
}

/** Merchant shell: needs a session with merchant identity + a shop. */
function MerchantGuard({ children }) {
  const { token, kind, shops, activeShop, refresh } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (kind === 'customer') return <Navigate to="/c" replace />;
  if (shops.length === 0) return <Navigate to="/onboarding?intent=merchant" replace />;
  if (!activeShop) { refresh(); return null; }
  return children;
}

/** Customer shell: needs a session with a customer identity. */
function CustomerGuard({ children }) {
  const { token, kind } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (kind === 'merchant') return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { token, kind, shops } = useAuth();
  if (!token) return <Navigate to="/auth" replace />;
  if (kind === 'customer') return <Navigate to="/c" replace />;
  if (shops.length === 0) return <Navigate to="/onboarding?intent=merchant" replace />;
  return <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <Routes>
        {/* Public */}
        <Route path="/auth" element={<Login />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/receipt/:token" element={<PublicReceipt />} />
        <Route path="/c/passbook" element={<PassbookEntry />} />

        {/* Merchant portal */}
        <Route path="/" element={<MerchantGuard><Layout /></MerchantGuard>}>
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="billing" element={<Billing />} />
          <Route path="bills" element={<BillsList />} />
          <Route path="bills/:id" element={<BillDetail />} />
          <Route path="customers" element={<CustomersList />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="products" element={<Products />} />
          <Route path="credit" element={<Credit />} />
          <Route path="loyalty" element={<Loyalty />} />
          <Route path="staff" element={<Staff />} />
          <Route path="more" element={<More />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="reports" element={<Reports />} />
          <Route path="voice" element={<VoiceAssistant />} />
          <Route path="assistant" element={<AIAssistant />} />
          <Route path="settings" element={<Settings />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="requirements" element={<MerchantRequirements />} />
          {/* legacy paths preserved */}
          <Route path="udhaar" element={<Navigate to="/credit" replace />} />
          <Route path="dhanlabh" element={<Navigate to="/loyalty" replace />} />
          <Route path="reports-old" element={<Navigate to="/reports" replace />} />
        </Route>

        {/* Customer app */}
        <Route path="/c" element={<CustomerGuard><CustomerApp /></CustomerGuard>}>
          <Route index element={<CustomerHome />} />
          <Route path="bills" element={<CustomerBills />} />
          <Route path="bills/:id" element={<CustomerBillDetail />} />
          <Route path="loyalty" element={<CustomerLoyalty />} />
          <Route path="credit" element={<CustomerCredit />} />
          <Route path="search" element={<CustomerSearch />} />
          <Route path="nafa" element={<CustomerMyNafa />} />
          <Route path="notifications" element={<CustomerNotifications />} />
          <Route path="profile" element={<CustomerProfile />} />
        </Route>

        <Route path="/home" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <I18nProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-right" richColors expand={false} />
          </BrowserRouter>
        </I18nProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
