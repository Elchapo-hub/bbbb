import React from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './components/HomePage';
import { CatalogPage } from './components/CatalogPage';
import { ProductDetailPage } from './components/ProductDetailPage';
import { ComparePage } from './components/ComparePage';
import { CartPage, CheckoutPage, PaymentConfirmationPage } from './components/CartCheckoutPages';
import { StaticInfoPage, TrackingPage } from './components/TrackingAndInfoPages';
import { AuthPage, MerchantRegisterPage } from './components/AuthAndMerchantRegPages';
import { CustomerDashboard } from './components/CustomerDashboard';
import { MerchantDashboard } from './components/MerchantDashboard';
import { OperationsDashboard } from './components/OperationsDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { SmoothScroll } from './components/SmoothScroll';

function AppShell() {
  const { route, toast } = useStore();

  const renderPage = () => {
    switch (route.page) {
      case 'home':
        return <HomePage />;
      case 'shop':
        return <CatalogPage mode="shop" />;
      case 'category':
        return <CatalogPage mode="category" />;
      case 'search':
        return <CatalogPage mode="search" />;
      case 'product':
        return <ProductDetailPage productId={route.param || 'prd-01'} />;
      case 'compare':
        return <ComparePage />;
      case 'cart':
        return <CartPage />;
      case 'checkout':
        return <CheckoutPage />;
      case 'payment-confirmation':
        return <PaymentConfirmationPage />;
      case 'tracking':
        return <TrackingPage initialRef={route.param} />;
      case 'account':
        return <CustomerDashboard initialTab="profile" />;
      case 'orders':
        return <CustomerDashboard initialTab="orders" />;
      case 'wishlist':
        return <CustomerDashboard initialTab="wishlist" />;
      case 'auth':
        return <AuthPage />;
      case 'merchant-register':
        return <MerchantRegisterPage />;
      case 'merchant-dashboard':
        return <MerchantDashboard />;
      case 'operations-dashboard':
        return <OperationsDashboard />;
      case 'admin-dashboard':
        return <AdminDashboard />;
      case 'about':
      case 'contact':
      case 'help':
      case 'terms':
      case 'privacy':
        return <StaticInfoPage page={route.page} />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050B18] text-white">
      <Navbar />
      <div className="flex-1">{renderPage()}</div>
      <Footer />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-20 right-4 sm:right-8 z-50 max-w-sm px-4 py-3 rounded-lg border text-xs font-medium shadow-2xl ${
            toast.type === 'error'
              ? 'bg-[#0B1426] border-red-400 text-red-200'
              : toast.type === 'success'
              ? 'bg-[#0B1426] border-[#10B981] text-[#10B981]'
              : 'bg-[#0B1426] border-[#F5B82E] text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <SmoothScroll />
      <AppShell />
    </StoreProvider>
  );
}
