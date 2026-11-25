import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, setAuthToken } from '../lib/api';
import type {
  CategoryDefinition,
  CurrencyCode,
  ExchangeRateRecord,
  Product,
  ShippingCorridor,
  UserRole,
} from '../lib/types';

export type AppPage =
  | 'home'
  | 'shop'
  | 'category'
  | 'product'
  | 'search'
  | 'compare'
  | 'cart'
  | 'checkout'
  | 'payment-confirmation'
  | 'account'
  | 'orders'
  | 'tracking'
  | 'wishlist'
  | 'about'
  | 'contact'
  | 'merchant-register'
  | 'help'
  | 'terms'
  | 'privacy'
  | 'auth'
  | 'merchant-dashboard'
  | 'admin-dashboard'
  | 'operations-dashboard';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  emailVerified: boolean;
  preferredCurrency: CurrencyCode;
  taxProfile: 'retail_b2c' | 'business_b2b' | 'vat_exempt' | 'export_buyer';
  tinNumber?: string;
  merchant?: {
    id: string;
    businessName: string;
    verificationStatus: string;
  } | null;
}

export interface CartLineItem {
  id: string;
  productId: string;
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  product: Product;
}

export interface RouteState {
  page: AppPage;
  param?: string;
}

interface StoreContextValue {
  route: RouteState;
  navigate: (page: AppPage, param?: string) => void;
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
  logout: () => void;
  categories: CategoryDefinition[];
  products: Product[];
  fx: ExchangeRateRecord | null;
  corridors: ShippingCorridor[];
  cartItems: CartLineItem[];
  wishlistIds: string[];
  compareIds: string[];
  displayCurrency: CurrencyCode;
  setDisplayCurrency: (c: CurrencyCode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loadingCatalog: boolean;
  toast: { type: 'success' | 'error' | 'info'; message: string } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  refreshCatalog: () => Promise<void>;
  refreshCart: () => Promise<void>;
  refreshWishlist: () => Promise<void>;
  addToCart: (productId: string, quantity?: number, variantId?: string | null) => Promise<void>;
  updateCartQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeCartItem: (itemId: string) => Promise<void>;
  toggleWishlist: (productId: string) => Promise<void>;
  toggleCompare: (productId: string) => void;
  lastOrderResult: {
    orderId: string;
    orderNumber: string;
    invoiceNumber: string;
    trackingReference: string;
    deliveryOtpForCustomer?: string;
    paymentId?: string;
    paymentMethod?: string;
    provider?: string;
    providerReference?: string;
    instructions?: string;
    bankDetails?: {
      bankName: string;
      accountName: string;
      accountNumber: string;
      swiftCode: string;
      reference: string;
    };
  } | null;
  setLastOrderResult: React.Dispatch<React.SetStateAction<StoreContextValue['lastOrderResult']>>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function parseInitialRoute(): RouteState {
  const params = new URLSearchParams(window.location.search);
  const page = (params.get('page') as AppPage) || 'home';
  const param = params.get('id') || undefined;
  return { page, param };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<RouteState>(parseInitialRoute);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fx, setFx] = useState<ExchangeRateRecord | null>(null);
  const [corridors, setCorridors] = useState<ShippingCorridor[]>([]);
  const [cartItems, setCartItems] = useState<CartLineItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>(['prd-01', 'prd-06']);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>('TZS');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [lastOrderResult, setLastOrderResult] = useState<StoreContextValue['lastOrderResult']>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4200);
  }, []);

  const navigate = useCallback((page: AppPage, param?: string) => {
    setRoute({ page, param });
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    if (param) {
      url.searchParams.set('id', param);
    } else {
      url.searchParams.delete('id');
    }
    window.history.pushState({ page, param }, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parseInitialRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refreshCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [cats, prodsRes, cors] = await Promise.all([
        apiRequest<CategoryDefinition[]>('/ecommerce/categories'),
        apiRequest<{ products: Product[]; fx: ExchangeRateRecord }>('/ecommerce/products'),
        apiRequest<ShippingCorridor[]>('/ecommerce/corridors'),
      ]);
      setCategories(cats);
      setProducts(prodsRes.products);
      setFx(prodsRes.fx);
      setCorridors(cors);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load catalog', 'error');
    } finally {
      setLoadingCatalog(false);
    }
  }, [showToast]);

  const refreshCart = useCallback(async () => {
    try {
      const data = await apiRequest<{ items: CartLineItem[] }>('/ecommerce/cart');
      setCartItems(data.items);
    } catch {
      // Ignore silent background cart init failure
    }
  }, []);

  const refreshWishlist = useCallback(async () => {
    if (!user) {
      setWishlistIds([]);
      return;
    }
    try {
      const data = await apiRequest<{ productIds: string[] }>('/ecommerce/wishlist');
      setWishlistIds(data.productIds);
    } catch {
      setWishlistIds([]);
    }
  }, [user]);

  useEffect(() => {
    void refreshCatalog();
    void refreshCart();
  }, [refreshCatalog, refreshCart]);

  useEffect(() => {
    void refreshWishlist();
  }, [refreshWishlist]);

  const addToCart = useCallback(
    async (productId: string, quantity = 1, variantId: string | null = null) => {
      try {
        const res = await apiRequest<{ items: CartLineItem[] }>('/ecommerce/cart/items', {
          method: 'POST',
          body: JSON.stringify({ productId, variantId, quantity }),
        });
        setCartItems(res.items);
        showToast('Added to shopping cart', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not add to cart', 'error');
      }
    },
    [showToast]
  );

  const updateCartQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      try {
        const res = await apiRequest<{ items: CartLineItem[] }>(`/ecommerce/cart/items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity }),
        });
        setCartItems(res.items);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not update quantity', 'error');
      }
    },
    [showToast]
  );

  const removeCartItem = useCallback(
    async (itemId: string) => {
      try {
        const res = await apiRequest<{ items: CartLineItem[] }>(`/ecommerce/cart/items/${itemId}`, {
          method: 'DELETE',
        });
        setCartItems(res.items);
        showToast('Item removed from cart', 'info');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not remove item', 'error');
      }
    },
    [showToast]
  );

  const toggleWishlist = useCallback(
    async (productId: string) => {
      if (!user) {
        showToast('Sign in to save items to your wishlist', 'info');
        navigate('auth');
        return;
      }
      const exists = wishlistIds.includes(productId);
      try {
        if (exists) {
          await apiRequest(`/ecommerce/wishlist/${productId}`, { method: 'DELETE' });
          setWishlistIds((prev) => prev.filter((id) => id !== productId));
          showToast('Removed from wishlist', 'info');
        } else {
          await apiRequest('/ecommerce/wishlist', {
            method: 'POST',
            body: JSON.stringify({ productId }),
          });
          setWishlistIds((prev) => [...prev, productId]);
          showToast('Saved to wishlist', 'success');
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Wishlist error', 'error');
      }
    },
    [navigate, showToast, user, wishlistIds]
  );

  const toggleCompare = useCallback(
    (productId: string) => {
      setCompareIds((prev) => {
        if (prev.includes(productId)) {
          showToast('Removed from comparison', 'info');
          return prev.filter((id) => id !== productId);
        }
        if (prev.length >= 4) {
          showToast('Comparison supports up to 4 products at once', 'info');
          return [...prev.slice(1), productId];
        }
        showToast('Added to product comparison', 'success');
        return [...prev, productId];
      });
    },
    [showToast]
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setWishlistIds([]);
    showToast('Signed out', 'info');
    navigate('home');
  }, [navigate, showToast]);

  return (
    <StoreContext.Provider
      value={{
        route,
        navigate,
        user,
        setUser,
        logout,
        categories,
        products,
        fx,
        corridors,
        cartItems,
        wishlistIds,
        compareIds,
        displayCurrency,
        setDisplayCurrency,
        searchQuery,
        setSearchQuery,
        loadingCatalog,
        toast,
        showToast,
        refreshCatalog,
        refreshCart,
        refreshWishlist,
        addToCart,
        updateCartQuantity,
        removeCartItem,
        toggleWishlist,
        toggleCompare,
        lastOrderResult,
        setLastOrderResult,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
