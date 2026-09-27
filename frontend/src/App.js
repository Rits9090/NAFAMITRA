import React, { Suspense, lazy } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/context/AuthContext';

const Login = lazy(() => import('@/pages/Login'));
const Layout = lazy(() => import('@/components/Layout'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Billing = lazy(() => import('@/pages/Billing'));
const Customers = lazy(() => import('@/pages/Customers'));
const Products = lazy(() => import('@/pages/Products'));
const Udhaar = lazy(() => import('@/pages/Udhaar'));
const Suppliers = lazy(() => import('@/pages/Suppliers'));
const Loyalty = lazy(() => import('@/pages/Loyalty'));
const Reports = lazy(() => import('@/pages/Reports'));
const VoiceAssistant = lazy(() => import('@/pages/VoiceAssistant'));
const AIAssistant = lazy(() => import('@/pages/AIAssistant'));
const Settings = lazy(() => import('@/pages/Settings'));
const Marketing = lazy(() => import('@/pages/Marketing'));

function ProtectedRoute({ children }) {
  const { token, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-slate-500 font-medium">Loading NafaMitra...</p>
      </div>
    </div>
  );
  if (!token) return <Navigate to="/auth" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
      <Routes>
        <Route path="/auth" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="billing" element={<Billing />} />
          <Route path="customers" element={<Customers />} />
          <Route path="products" element={<Products />} />
          <Route path="udhaar" element={<Udhaar />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="loyalty" element={<Loyalty />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="reports" element={<Reports />} />
          <Route path="voice" element={<VoiceAssistant />} />
          <Route path="assistant" element={<AIAssistant />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" richColors expand={false} />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
