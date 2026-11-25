'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, setAuthToken } from '@/services/api';
import type { CartItem, Category, Product, TeeSize, User } from '@/types/store';
import { getEffectivePrice } from '@/lib/storeLogic';

export type AppRoute =
  | { page: 'home' }
  | { page: 'catalog'; category?: string }
  | { page: 'product'; slug: string }
  | { page: 'favorites' }
  | { page: 'cart' }
  | { page: 'checkout' }
  | { page: 'orders' }
  | { page: 'profile' }
  | { page: 'auth' }
  | { page: 'about' }
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
  if (clean === '/orders') return { page: 'orders' };
  if (clean === '/profile') return { page: 'profile' };
  if (clean === '/auth') return { page: 'auth' };
  if (clean === '/about') return { page: 'about' };
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
    case 'orders':
      return '/orders';
    case 'profile':
      return '/profile';
    case 'auth':
      return '/auth';
    case 'about':
      return '/about';
    case 'admin':
      return route.tab && route.tab !== 'dashboard' ? `/admin/${route.tab}` : '/admin';
    case 'home':
    default:
      return '/';
  }
}

interface StoreContextValue {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  user: User | null;
  authReady: boolean;
  purchasedProductIds: string[];
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
  addToCart: (product: Product, size?: TeeSize, color?: string, quantity?: number) => Promise<void>;
  updateCartQty: (productId: string, size: TeeSize, color: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string, size: TeeSize, color: string) => Promise<void>;
  clearCartLocal: () => void;
  toggleWishlist: (product: Product) => Promise<void>;
  loginUser: (email: string, password: string, portal?: 'customer' | 'admin') => Promise<User>;
  registerUser: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    address?: string;
  }) => Promise<User>;
  claimAdminAccount: (payload: {
    name: string;
    email: string;
    password: string;
    passcode?: string;
  }) => Promise<User>;
  logoutUser: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

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
  const [purchasedProductIds, setPurchasedProductIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
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

  const loadAuthenticatedUserExtras = useCallback(async () => {
    try {
      const [cartRes, wishRes] = await Promise.all([api.getCart(), api.getWishlist()]);
      setCart(cartRes.items);
      setWishlistIds(wishRes.products.map((p) => p.id));
    } catch {
      // ignore
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await api.session();
      if (res.authenticated && res.user) {
        setUser(res.user);
        setPurchasedProductIds(res.purchasedProductIds);
        await loadAuthenticatedUserExtras();
      } else {
        setUser(null);
        setPurchasedProductIds([]);
      }
    } catch {
      setUser(null);
      setPurchasedProductIds([]);
    } finally {
      setAuthReady(true);
    }
  }, [loadAuthenticatedUserExtras]);

  useEffect(() => {
    refreshCatalog();
    refreshAuth();
  }, [refreshCatalog, refreshAuth]);

  const addToCart = useCallback(
    async (product: Product, size?: TeeSize, color?: string, quantity = 1) => {
      if (product.stock <= 0) {
        notify('This T-shirt is currently out of stock.', 'error');
        return;
      }
      const chosenSize: TeeSize = size || product.sizes[1] || product.sizes[0] || 'M';
      const chosenColor = color || product.colors[0]?.name || 'Black';

      if (user) {
        try {
          const res = await api.addToCart({
            productId: product.id,
            size: chosenSize,
            color: chosenColor,
            quantity,
          });
          setCart(res.items);
          notify(`Added ${product.name} (${chosenSize}) to cart`, 'success');
        } catch (err) {
          notify(err instanceof Error ? err.message : 'Could not update cart.', 'error');
        }
        return;
      }

      setCart((prev) => {
        const idx = prev.findIndex(
          (i) => i.productId === product.id && i.size === chosenSize && i.color === chosenColor,
        );
        const unitPrice = getEffectivePrice(product);
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
            originalPrice: product.price,
            maxStock: product.stock,
          },
          ...prev,
        ];
      });
      notify(`Added ${product.name} (${chosenSize}) to cart`, 'success');
    },
    [user, notify],
  );

  const updateCartQty = useCallback(
    async (productId: string, size: TeeSize, color: string, quantity: number) => {
      if (user) {
        try {
          const res = await api.updateCartItem(productId, { size, color, quantity });
          setCart(res.items);
        } catch (err) {
          notify(err instanceof Error ? err.message : 'Failed to update quantity.', 'error');
        }
        return;
      }

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
    [user, notify],
  );

  const removeFromCart = useCallback(
    async (productId: string, size: TeeSize, color: string) => {
      if (user) {
        try {
          const res = await api.removeCartItem(productId, size, color);
          setCart(res.items);
          notify('Removed item from cart', 'info');
        } catch (err) {
          notify(err instanceof Error ? err.message : 'Failed to remove item.', 'error');
        }
        return;
      }

      setCart((prev) =>
        prev.filter((i) => !(i.productId === productId && i.size === size && i.color === color)),
      );
      notify('Removed item from cart', 'info');
    },
    [user, notify],
  );

  const clearCartLocal = useCallback(() => {
    setCart([]);
  }, []);

  const toggleWishlist = useCallback(
    async (product: Product) => {
      const exists = wishlistIds.includes(product.id);
      if (user) {
        try {
          if (exists) {
            await api.removeWishlist(product.id);
            setWishlistIds((prev) => prev.filter((id) => id !== product.id));
            notify(`Removed ${product.name} from favorites`, 'info');
          } else {
            await api.addWishlist(product.id);
            setWishlistIds((prev) => [product.id, ...prev]);
            notify(`Saved ${product.name} to favorites`, 'success');
          }
        } catch (err) {
          notify(err instanceof Error ? err.message : 'Wishlist update failed.', 'error');
        }
        return;
      }

      if (exists) {
        setWishlistIds((prev) => prev.filter((id) => id !== product.id));
        notify(`Removed ${product.name} from favorites`, 'info');
      } else {
        setWishlistIds((prev) => [product.id, ...prev]);
        notify(`Saved ${product.name} to favorites`, 'success');
      }
    },
    [user, wishlistIds, notify],
  );

  const syncGuestStateAfterAuth = useCallback(async (guestCart: CartItem[], guestWishlist: string[]) => {
    // Authentication has already succeeded here: a sync hiccup must not be reported
    // as a failed sign-in, and the guest cart should stay on screen if the upload fails.
    try {
      if (guestCart.length > 0) {
        const synced = await api.syncCart(
          guestCart.map((c) => ({
            productId: c.productId,
            size: c.size,
            color: c.color,
            quantity: c.quantity,
          })),
        );
        setCart(synced.items);
      } else {
        const current = await api.getCart();
        setCart(current.items);
      }

      for (const pid of guestWishlist) {
        try {
          await api.addWishlist(pid);
        } catch {
          // ignore
        }
      }
      const wishRes = await api.getWishlist();
      setWishlistIds(wishRes.products.map((p) => p.id));
    } catch {
      // Keep the local guest cart/wishlist as-is so the user does not lose their picks.
    }
  }, []);

  const loginUser = useCallback(
    async (email: string, password: string, portal: 'customer' | 'admin' = 'customer') => {
      const guestCart = [...cart];
      const guestWishlist = [...wishlistIds];
      const res = await api.login({ email, password, portal });
      setAuthToken(res.token);
      setUser(res.user);
      setPurchasedProductIds(res.purchasedProductIds);
      await syncGuestStateAfterAuth(guestCart, guestWishlist);
      return res.user;
    },
    [cart, wishlistIds, syncGuestStateAfterAuth],
  );

  const registerUser = useCallback(
    async (payload: { name: string; email: string; password: string; phone?: string; address?: string }) => {
      const guestCart = [...cart];
      const guestWishlist = [...wishlistIds];
      const res = await api.register(payload);
      setAuthToken(res.token);
      setUser(res.user);
      setPurchasedProductIds(res.purchasedProductIds);
      await syncGuestStateAfterAuth(guestCart, guestWishlist);
      return res.user;
    },
    [cart, wishlistIds, syncGuestStateAfterAuth],
  );

  const claimAdminAccount = useCallback(
    async (payload: { name: string; email: string; password: string; passcode?: string }) => {
      const res = await api.claimAdmin(payload);
      setAuthToken(res.token);
      setUser(res.user);
      setPurchasedProductIds(res.purchasedProductIds);
      return res.user;
    },
    [],
  );

  const logoutUser = useCallback(async () => {
    await api.logout();
    setAuthToken(null);
    setUser(null);
    setPurchasedProductIds([]);
    setCart([]);
    setWishlistIds([]);
    notify('Signed out of TeeStore', 'info');
  }, [notify]);

  return (
    <StoreContext.Provider
      value={{
        route,
        navigate,
        user,
        authReady,
        purchasedProductIds,
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
        claimAdminAccount,
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
