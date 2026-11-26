'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, setAuthToken } from '@/services/api';
import type { CartItem, Category, CurrencyCode, DeliveryAddress, Product, TeeSize, User } from '@/types/store';
import { getEffectivePrice } from '@/lib/storeLogic';
import { CURRENCY_STORAGE_KEY, convertCurrency, isCurrencyCode, normalizeCurrency } from '@/utils/currency';
import { LANGUAGE_STORAGE_KEY, normalizeLanguage, translate } from '@/lib/i18n';
import type { LanguageCode, TranslationKey } from '@/lib/i18n';

export type ThemeMode = 'light' | 'dark';
const THEME_STORAGE_KEY = 'eshopall_theme';

export type AppRoute =
  | { page: 'home' }
  | { page: 'catalog'; category?: string }
  | { page: 'product'; slug: string }
  | { page: 'favorites' }
  | { page: 'cart' }
  | { page: 'checkout' }
  | { page: 'about' }
  | { page: 'signup' }
  | { page: 'admin'; tab?: string };

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export function parsePathname(pathname: string, search = ''): AppRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);

  if (clean === '/catalog') {
    return { page: 'catalog', category: params.get('category') || undefined };
  }
  if (clean.startsWith('/product/')) {
    const slug = decodeURIComponent(clean.slice('/product/'.length));
    if (slug) return { page: 'product', slug };
  }
  if (clean === '/favorites') return { page: 'favorites' };
  if (clean === '/cart') return { page: 'cart' };
  if (clean === '/checkout') return { page: 'checkout' };
  if (clean === '/about') return { page: 'about' };
  if (clean === '/signup') return { page: 'signup' };
  if (clean.startsWith('/admin')) {
    const tab = clean.slice('/admin'.length).replace(/^\//, '') || 'dashboard';
    return { page: 'admin', tab };
  }
  return { page: 'home' };
}

export function routeToUrl(route: AppRoute): string {
  switch (route.page) {
    case 'catalog':
      return route.category ? `/catalog?category=${encodeURIComponent(route.category)}` : '/catalog';
    case 'product':
      return `/product/${encodeURIComponent(route.slug)}`;
    case 'favorites':
      return '/favorites';
    case 'cart':
      return '/cart';
    case 'checkout':
      return '/checkout';
    case 'about':
      return '/about';
    case 'signup':
      return '/signup';
    case 'admin':
      return route.tab && route.tab !== 'dashboard' ? `/admin/${route.tab}` : '/admin';
    case 'home':
    default:
      return '/';
  }
}

interface StoreContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  currency: CurrencyCode;
  currencyReady: boolean;
  currencyChosen: boolean;
  setCurrency: (currency: CurrencyCode) => void;
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  /** Only an admin session ever populates this; shoppers check out as guests. */
  user: User | null;
  authReady: boolean;
  categories: Category[];
  products: Product[];
  productsLoading: boolean;
  hydrateInitialCatalog: (categories: Category[], products: Product[]) => void;
  selectedProduct: Product | null;
  setSelectedProduct: (product: Product | null) => void;
  cart: CartItem[];
  wishlistIds: string[];
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  cartDrawerOpen: boolean;
  setCartDrawerOpen: (open: boolean) => void;
  toasts: ToastMessage[];
  notify: (text: string, tone?: ToastMessage['tone']) => void;
  refreshCatalog: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  /** Resolves true when the item actually entered the cart. */
  addToCart: (product: Product, size?: TeeSize, color?: string, quantity?: number) => Promise<boolean>;
  updateCartQty: (productId: string, size: TeeSize, color: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string, size: TeeSize, color: string) => Promise<void>;
  clearCartLocal: () => void;
  toggleWishlist: (product: Product) => Promise<void>;
  loginUser: (email: string, password: string) => Promise<User>;
  registerUser: (phone: string, password: string, gender?: string, name?: string) => Promise<User>;
  /** Creates a pending seller account that a super admin must verify. */
  registerSeller: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    avatarUrl?: string;
  }) => Promise<User>;
  /** Saves or clears the customer's address; only used on explicit opt-in. */
  updateDeliveryAddress: (address: DeliveryAddress | null) => Promise<void>;
  loginShopper: (phone: string, password: string) => Promise<User>;
  claimAdminAccount: (payload: {
    name: string;
    email: string;
    password: string;
    passcode?: string;
    avatarUrl?: string;
  }) => Promise<User>;
  loginSuperAdmin: (email: string, password: string) => Promise<User>;
  claimSuperAdminAccount: (payload: {
    name: string;
    email: string;
    password: string;
    passcode?: string;
    avatarUrl?: string;
  }) => Promise<User>;
  uploadAvatar: (file: File) => Promise<User>;
  logoutUser: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

// Guest shoppers have no server-side storage, so their cart and favorites are
// kept in the browser between visits.
const GUEST_CART_KEY = 'teestore_guest_cart';
const GUEST_WISHLIST_KEY = 'teestore_guest_wishlist';

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.productId === 'string' &&
    typeof item.size === 'string' &&
    typeof item.color === 'string' &&
    typeof item.quantity === 'number'
  );
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [searchStr, setSearchStr] = useState('');

  useEffect(() => {
    setSearchStr(typeof window !== 'undefined' ? window.location.search : '');
  }, [pathname]);

  const route = useMemo(() => parsePathname(pathname, searchStr), [pathname, searchStr]);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // Set as soon as a server-rendered page hands us its catalogue, so the first
  // client render does not refetch the same products and categories.
  const catalogFromServerRef = useRef(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [currency, setCurrencyState] = useState<CurrencyCode>('USD');
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currencyReady, setCurrencyReady] = useState(false);
  const [currencyChosen, setCurrencyChosen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (isCurrencyCode(saved)) {
        setCurrencyState(normalizeCurrency(saved));
        setCurrencyChosen(true);
      }
    } catch {
      // Ignore unavailable or corrupted storage.
    }
    setCurrencyReady(true);
  }, []);

  useEffect(() => {
    try {
      setLanguageState(normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)));
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setThemeState(savedTheme);
      }
      // First visit defaults to the white theme; the welcome step lets the
      // visitor opt into dark instead of inheriting the operating system.
    } catch {
      // Storage blocked: fall back to English in light mode.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore unavailable storage.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: LanguageCode) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Ignore unavailable storage.
    }
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  );

  const setCurrency = useCallback((next: CurrencyCode) => {
    const normalized = normalizeCurrency(next);
    setCurrencyState(normalized);
    setCurrencyChosen(true);
    try {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, normalized);
    } catch {
      // Ignore unavailable storage.
    }
  }, []);

  const [globalSearch, setGlobalSearch] = useState('');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const navigate = useCallback(
    (nextRoute: AppRoute) => {
      const url = routeToUrl(nextRoute);
      router.push(url);
    },
    [router],
  );

  const pickDefaultSelected = useCallback((list: Product[], prev: Product | null) => {
    if (prev) {
      const updated = list.find((p) => p.id === prev.id);
      if (updated) return updated;
    }
    return (
      list.find((p) => p.slug === 'classic-crest-tee') ||
      list.find((p) => p.popular && p.reviewCount > 0) ||
      list[0] ||
      null
    );
  }, []);

  const hydrateInitialCatalog = useCallback(
    (initialCats: Category[], initialProds: Product[]) => {
      if (initialCats.length > 0 || initialProds.length > 0) {
        catalogFromServerRef.current = true;
      }
      if (initialCats.length > 0 && categories.length === 0) {
        setCategories(initialCats);
      }
      if (initialProds.length > 0 && products.length === 0) {
        setProducts(initialProds);
        setSelectedProduct((prev) => pickDefaultSelected(initialProds, prev));
        setProductsLoading(false);
      }
    },
    [categories.length, products.length, pickDefaultSelected],
  );

  const refreshCatalog = useCallback(async () => {
    setProductsLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        api.getCategories(),
        api.getProducts({ limit: 100 }),
      ]);
      setCategories(catRes.categories);
      setProducts(prodRes.products);
      setSelectedProduct((prev) => pickDefaultSelected(prodRes.products, prev));
    } catch {
      // keep existing SSR data if available
    } finally {
      setProductsLoading(false);
    }
  }, [pickDefaultSelected]);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await api.session();
      setUser(res.authenticated && res.user ? res.user : null);
    } catch {
      setUser(null);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
    // A server-rendered page has already supplied the catalogue; only fetch it
    // again when this page did not (admin, account and checkout routes).
    if (!catalogFromServerRef.current) {
      refreshCatalog();
    }
  }, [refreshCatalog, refreshAuth]);

  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      const savedCart = window.localStorage.getItem(GUEST_CART_KEY);
      const savedWishlist = window.localStorage.getItem(GUEST_WISHLIST_KEY);
      const cartItems: unknown = savedCart ? JSON.parse(savedCart) : null;
      const wishlistValues: unknown = savedWishlist ? JSON.parse(savedWishlist) : null;
      if (Array.isArray(cartItems)) {
        setCart(cartItems.filter(isCartItem));
      }
      if (Array.isArray(wishlistValues)) {
        setWishlistIds(wishlistValues.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      // Unreadable storage: start with an empty cart instead of failing to render.
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
    } catch {
      // Storage can be full or blocked; the in-memory cart still works.
    }
  }, [cart, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(wishlistIds));
    } catch {
      // Storage can be full or blocked; favorites still work for this visit.
    }
  }, [wishlistIds, storageReady]);

  const addToCart = useCallback(
    async (product: Product, size?: TeeSize, color?: string, quantity = 1) => {
      if (product.stock <= 0) {
        notify('This T-shirt is currently out of stock.', 'error');
        return false;
      }
      const chosenSize: TeeSize = size || product.sizes[1] || product.sizes[0] || 'M';
      const chosenColor = color || product.colors[0]?.name || 'Black';

      setCart((prev) => {
        const idx = prev.findIndex(
          (i) => i.productId === product.id && i.size === chosenSize && i.color === chosenColor,
        );
        const unitPrice = convertCurrency(getEffectivePrice(product), product.currency, 'USD');
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            quantity: Math.min(product.stock, next[idx].quantity + quantity),
            maxStock: product.stock,
          };
          return next;
        }
        return [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productImage: product.images[0] || '/images/tee_black_classic_1795513062767.jpg',
            size: chosenSize,
            color: chosenColor,
            quantity: Math.min(product.stock, quantity),
            unitPrice,
            originalPrice: convertCurrency(product.price, product.currency, 'USD'),
            maxStock: product.stock,
          },
          ...prev,
        ];
      });
      notify(`Added ${product.name} (${chosenSize}) to cart`, 'success');
      return true;
    },
    [notify],
  );

  const updateCartQty = useCallback(
    async (productId: string, size: TeeSize, color: string, quantity: number) => {
      setCart((prev) => {
        if (quantity <= 0) {
          return prev.filter((i) => !(i.productId === productId && i.size === size && i.color === color));
        }
        return prev.map((i) =>
          i.productId === productId && i.size === size && i.color === color
            ? { ...i, quantity: Math.min(i.maxStock, quantity) }
            : i,
        );
      });
    },
    [],
  );

  const removeFromCart = useCallback(
    async (productId: string, size: TeeSize, color: string) => {
      setCart((prev) =>
        prev.filter((i) => !(i.productId === productId && i.size === size && i.color === color)),
      );
      notify('Removed item from cart', 'info');
    },
    [notify],
  );

  const clearCartLocal = useCallback(() => {
    setCart([]);
  }, []);

  const toggleWishlist = useCallback(
    async (product: Product) => {
      const exists = wishlistIds.includes(product.id);
      if (exists) {
        setWishlistIds((prev) => prev.filter((id) => id !== product.id));
        notify(`Removed ${product.name} from favorites`, 'info');
      } else {
        setWishlistIds((prev) => [product.id, ...prev]);
        notify(`Saved ${product.name} to favorites`, 'success');
      }
    },
    [wishlistIds, notify],
  );

  // Shopper accounts are gone: the only sign-in is the store admin console.
  const loginUser = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password, portal: 'admin' });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  // Shopper sign-up: phone number + password only, then signed in immediately.
  const registerUser = useCallback(async (phone: string, password: string, gender?: string, name?: string) => {
    const res = await api.register({ phone, password, gender, name });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const registerSeller = useCallback(
    async (payload: { name: string; email: string; password: string; phone?: string; avatarUrl?: string }) => {
      const res = await api.registerSeller(payload);
      setAuthToken(res.token);
      setUser(res.user);
      return res.user;
    },
    [],
  );

  const loginShopper = useCallback(async (phone: string, password: string) => {
    const res = await api.login({ email: phone, password, portal: 'customer' });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const claimAdminAccount = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      passcode?: string;
      avatarUrl?: string;
    }) => {
      const res = await api.claimAdmin(payload);
      setAuthToken(res.token);
      setUser(res.user);
      return res.user;
    },
    [],
  );

  const loginSuperAdmin = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password, portal: 'super' });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const claimSuperAdminAccount = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      passcode?: string;
      avatarUrl?: string;
    }) => {
      const res = await api.claimSuperAdmin(payload);
      setAuthToken(res.token);
      setUser(res.user);
      return res.user;
    },
    [],
  );

  const uploadAvatar = useCallback(async (file: File) => {
    const res = await api.uploadAvatar(file);
    setUser(res.user);
    return res.user;
  }, []);

  const updateDeliveryAddress = useCallback(async (address: DeliveryAddress | null) => {
    const res = address ? await api.saveDeliveryAddress(address) : await api.clearDeliveryAddress();
    setUser(res.user);
  }, []);

  const logoutUser = useCallback(async () => {
    await api.logout();
    setAuthToken(null);
    setUser(null);
    notify('Signed out of E-shop All Admin', 'info');
  }, [notify]);

  return (
    <StoreContext.Provider
      value={{
        language,
        setLanguage,
        t,
        theme,
        setTheme,
        settingsOpen,
        setSettingsOpen,
        currency,
        currencyReady,
        currencyChosen,
        setCurrency,
        route,
        navigate,
        user,
        authReady,
        categories,
        products,
        productsLoading,
        hydrateInitialCatalog,
        selectedProduct,
        setSelectedProduct,
        cart,
        wishlistIds,
        globalSearch,
        setGlobalSearch,
        cartDrawerOpen,
        setCartDrawerOpen,
        toasts,
        notify,
        refreshCatalog,
        refreshAuth,
        addToCart,
        updateCartQty,
        removeFromCart,
        clearCartLocal,
        toggleWishlist,
        loginUser,
        registerUser,
        registerSeller,
        updateDeliveryAddress,
        loginShopper,
        claimAdminAccount,
        loginSuperAdmin,
        claimSuperAdminAccount,
        uploadAvatar,
        logoutUser,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
