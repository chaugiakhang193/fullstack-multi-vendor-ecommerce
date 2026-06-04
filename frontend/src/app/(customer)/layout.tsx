"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import authApiRequest from "@/apiRequests/auth/auth";
import categoriesApiRequest from "@/apiRequests/products/categories";
import productsApiRequest from "@/apiRequests/products/products";
import useDebounce from "@/hooks/useDebounce";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tabId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// Khai báo price formatter ngoài component để tránh re-creation và tuân thủ rule
const priceFormatterObj = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

const formatPriceVal = (val: number) => {
  return priceFormatterObj.format(val);
};

// Cart Store, Custom Hook & Drawer Component
import { useCartStore } from "@/store/useCartStore";
import { useActiveCart } from "@/hooks/useActiveCart";
import cartApiRequest from "@/apiRequests/carts/carts";
import CartDrawer from "@/components/cart/CartDrawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  ShoppingCart,
  User,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Settings,
  ShoppingBag,
  Store,
  LayoutDashboard,
  AlertCircle,
  Loader2,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
} from "lucide-react";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const [isClient, setIsClient] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const searchMobileWrapperRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Gọi gợi ý tìm kiếm qua React Query khi gõ từ 2 ký tự trở lên
  const isSuggestionsEnabled = debouncedSearchQuery.trim().length >= 2;
  
  const suggestionsQuery = useQuery({
    queryKey: ["product-suggestions", debouncedSearchQuery],
    queryFn: async () => {
      const getParams = { q: debouncedSearchQuery, limit: 5 };
      const response = await productsApiRequest.getPublicProducts(getParams);
      return response;
    },
    enabled: isSuggestionsEnabled,
    staleTime: 1000 * 60 * 1, // Cache gợi ý trong 1 phút
  });

  const suggestions = suggestionsQuery.data?.data?.items || [];
  const isSuggestionsLoading = suggestionsQuery.isLoading;

  // Lắng nghe click outside để ẩn gợi ý tìm kiếm
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isOutsideDesktop = !searchWrapperRef.current || !searchWrapperRef.current.contains(event.target as Node);
      const isOutsideMobile = !searchMobileWrapperRef.current || !searchMobileWrapperRef.current.contains(event.target as Node);
      if (isOutsideDesktop && isOutsideMobile) {
        setIsSuggestionsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSuggestionClick = (product: any) => {
    const slugId = `${product.slug}-i.${product.id}`;
    const detailUrl = `/products/${slugId}`;
    router.push(detailUrl);
    setSearchQuery("");
    setIsSuggestionsOpen(false);
    setIsMobileSearchOpen(false);
    setActiveIndex(-1);
  };

  // Helper tô đậm từ khóa tìm kiếm trùng khớp
  const highlightText = (text: string, query: string) => {
    if (!query) return <span>{text}</span>;
    const regexPattern = new RegExp(`(${query})`, "gi");
    const parts = text.split(regexPattern);
    return (
      <span>
        {parts.map((part, index) => {
          const keyVal = `highlight-part-${index}`;
          const isMatch = part.toLowerCase() === query.toLowerCase();
          return isMatch ? (
            <span key={keyVal} className="font-extrabold text-violet-600 dark:text-violet-400">
              {part}
            </span>
          ) : (
            <span key={keyVal}>{part}</span>
          );
        })}
      </span>
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      }
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        const selectedProduct = suggestions[activeIndex];
        handleSuggestionClick(selectedProduct);
      } else {
        handleSearchSubmit();
      }
    } else if (e.key === "Escape") {
      setIsSuggestionsOpen(false);
      setActiveIndex(-1);
    }
  };

  const renderSuggestionsList = () => {
    if (!isSuggestionsOpen) return null;
    
    // Chỉ hiển thị gợi ý khi có từ 2 ký tự trở lên
    const hasMinLength = searchQuery.trim().length >= 2;
    if (!hasMinLength) return null;

    return (
      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-900 animate-fade-in max-h-96 overflow-y-auto">
        {isSuggestionsLoading ? (
          <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            <span>Đang tìm kiếm gợi ý...</span>
          </div>
        ) : suggestions.length > 0 ? (
          <>
            <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 shrink-0 flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gợi ý sản phẩm</span>
              <span className="text-[9px] text-muted-foreground font-semibold">Dùng ↑↓ Enter để chọn</span>
            </div>
            {suggestions.map((product: any, index: number) => {
              const isActive = index === activeIndex;
              const productKey = `suggestion-${product.id}`;
              const priceText = formatPriceVal(product.price);
              
              return (
                <div
                  key={productKey}
                  onClick={() => handleSuggestionClick(product)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors ${
                    isActive
                      ? "bg-violet-500/10 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400 font-medium"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <div className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0 bg-zinc-100 dark:bg-zinc-800">
                    <Image
                      src={product.thumbnail_url || "/placeholder-product.png"}
                      alt={product.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="text-sm font-bold text-foreground truncate group-hover:text-violet-600">
                      {highlightText(product.name, searchQuery)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {product.shop?.name || "Cửa hàng"}
                    </div>
                  </div>
                  <div className="text-sm font-black text-violet-600 dark:text-violet-400">
                    {priceText}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground italic flex flex-col items-center justify-center gap-2">
            <AlertCircle className="h-5 w-5 text-zinc-400" />
            <span>Không tìm thấy gợi ý phù hợp cho "<strong className="text-foreground not-italic">{searchQuery}</strong>"</span>
          </div>
        )}
      </div>
    );
  };
  const queryClient = useQueryClient();
  const { cart } = useActiveCart();
  const setIsCartOpen = useCartStore((state) => state.setIsOpen);
  const localCartItems = useCartStore((state) => state.items);
  const clearLocalCart = useCartStore((state) => state.clearCart);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Sync / Merge guest cart items into user cart database upon login
  useEffect(() => {
    const hasLocalItems = localCartItems.length > 0;
    if (isAuthenticated && hasLocalItems) {
      const syncCart = async () => {
        try {
          const guestItemsMapped = localCartItems.map((item) => {
            const mappedObj = {
              product_id: item.productId,
              variant_id: item.variantId || undefined,
              quantity: item.quantity,
            };
            return mappedObj;
          });
          const mergePayload = {
            items: guestItemsMapped,
          };
          await cartApiRequest.merge(mergePayload);
          clearLocalCart();

          const queryKeyObj = { queryKey: ["cart"] };
          await queryClient.invalidateQueries(queryKeyObj);

          const syncSuccessMsg = "Giỏ hàng của bạn đã được đồng bộ hóa thành công!";
          toast.success(syncSuccessMsg);
        } catch (error) {
          const logMsg = "Lỗi đồng bộ giỏ hàng:";
          console.error(logMsg, error);
        }
      };
      syncCart();
    }
  }, [isAuthenticated, localCartItems, clearLocalCart, queryClient]);

  const cartCount = cart?.total_quantity || 0;

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Gọi API lấy danh mục sản phẩm qua React Query
  const fetchCategoriesFn = () => categoriesApiRequest.getAll();
  const queryConfig = {
    queryKey: ["categories"],
    queryFn: fetchCategoriesFn,
  };
  const { data: categoriesRes } = useQuery(queryConfig);
  const categories = categoriesRes?.data || [];

  // Lọc lấy các danh mục gốc (không có parent)
  const filterRootCategories = (category: any) => {
    const parentVal = category.parent;
    return !parentVal;
  };
  const rootCategories = categories.filter(filterRootCategories);

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      const query = searchQuery.trim();
      const encodedQuery = encodeURIComponent(query);
      const targetUrl = `/products?q=${encodedQuery}`;
      router.push(targetUrl);
      setIsMobileSearchOpen(false);
      setIsSuggestionsOpen(false);
      setActiveIndex(-1);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApiRequest.logout();
    } catch (error) {
      const logTitle = "Lỗi đăng xuất:";
      console.error(logTitle, error);
    } finally {
      logout();
      
      const authChannelName = "auth-channel";
      const channel = new BroadcastChannel(authChannelName);
      const postMsgObj = { type: "logout_success", senderTabId: tabId };
      channel.postMessage(postMsgObj);
      channel.close();

      const successMsg = "Đăng xuất thành công";
      toast.success(successMsg);
      
      setIsLogoutConfirmOpen(false);
      setIsLoggingOut(false);
      setIsUserDropdownOpen(false);

      const targetPath = "/login";
      router.push(targetPath);
      router.refresh();
    }
  };

  const navigateTo = (path: string) => {
    setIsUserDropdownOpen(false);
    setIsMobileMenuOpen(false);
    router.push(path);
  };

  if (!isClient) return null;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-900 text-foreground">
      {/* HEADER SECTION */}
      <header className="sticky top-0 z-40 h-32 w-full border-b bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-none w-full h-full px-6 md:px-12 flex items-center justify-between gap-4 relative">
          
          {/* Logo & Category Menu (Left) */}
          <div className="flex items-center gap-3 md:gap-8">
            {/* Mobile Hamburger Trigger */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-3.5 rounded-2xl border-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition md:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>

            <Link
              href="/"
              className="font-extrabold text-4xl tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent select-none cursor-pointer"
            >
              Giang Kha
            </Link>

            {/* Category Dropdown (Desktop) */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                className="flex items-center space-x-1.5 px-6 h-16 rounded-2xl border-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition text-base font-bold"
              >
                <span>Danh mục</span>
                <ChevronDown className={`h-5 w-5 transition-transform ${isCategoryMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {isCategoryMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsCategoryMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-zinc-950 border rounded-xl shadow-xl z-20 py-2 divide-y divide-zinc-100 dark:divide-zinc-900 animate-fade-in">
                    <div className="py-1">
                      {rootCategories.length > 0 ? (
                        rootCategories.map((cat: any) => (
                          <Link
                            key={cat.id}
                            href={`/categories/${cat.slug}`}
                            onClick={() => setIsCategoryMenuOpen(false)}
                            className="block px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                          >
                            {cat.name}
                          </Link>
                        ))
                      ) : (
                        <span className="block px-4 py-2 text-sm text-muted-foreground italic">
                          Không có danh mục
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Search Bar (Middle - Desktop) */}
          <div ref={searchWrapperRef} className="relative flex-1 max-w-4xl mx-auto hidden md:block">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm kiếm sản phẩm..."
              className="w-full h-16 pl-14 pr-6 text-base border-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                setIsSuggestionsOpen(true);
              }}
              onFocus={() => setIsSuggestionsOpen(true)}
              onKeyDown={handleKeyDown}
            />
            {renderSuggestionsList()}
          </div>

          {/* Right Actions Section */}
          <div className="flex items-center gap-3 md:gap-4">
            {/* Mobile Search Button */}
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="p-3.5 rounded-2xl border-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition md:hidden"
            >
              <Search className="h-6 w-6" />
            </button>

            {!user && (
              <Link href="/register-seller" className="hidden md:inline-block">
                <button className="text-base font-bold px-6 h-16 border-2 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition">
                  Trở thành người bán
                </button>
              </Link>
            )}

            {/* Cart Button */}
            <button
              id="header-cart-btn"
              onClick={() => setIsCartOpen(true)}
              className="h-16 w-16 rounded-2xl border-2 flex items-center justify-center relative hover:bg-zinc-100 dark:hover:bg-zinc-900 transition shadow-sm cursor-pointer"
            >
              <ShoppingCart className="h-6 w-6" />
              {isClient && cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-rose-500 text-xs font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-zinc-950">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </button>

            <Separator orientation="vertical" className="h-12" />

            {/* User Dropdown Profile Menu */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  className="flex items-center space-x-3 px-5 h-16 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 border-2 transition shadow-sm"
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center font-bold text-base text-white shadow-sm">
                    {user.username?.charAt(0).toUpperCase() || (
                      <User className="h-5 w-5" />
                    )}
                  </div>
                  <span className="text-base font-bold hidden sm:inline-block pr-1">
                    {user.username}
                  </span>
                </button>

                {isUserDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsUserDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-full min-w-[240px] bg-white dark:bg-zinc-950 border rounded-xl shadow-xl z-20 py-2 divide-y divide-zinc-100 dark:divide-zinc-900 animate-fade-in">
                      <div className="px-4 py-2.5">
                        <p className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">Tài khoản</p>
                        <p className="text-base font-extrabold truncate mt-1 text-foreground">{user.username}</p>
                        <span className="inline-block px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-full mt-1.5 border border-violet-200/55">
                          Role: {user.role}
                        </span>
                      </div>

                      <div className="py-1.5">
                        <button
                          onClick={() => navigateTo("/profile")}
                          className="w-full flex items-center space-x-2.5 px-4 py-3 text-sm md:text-base font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition text-left"
                        >
                          <User className="h-5 w-5 shrink-0" />
                          <span>Trang cá nhân</span>
                        </button>
                        <button
                          onClick={() => navigateTo("/orders")}
                          className="w-full flex items-center space-x-2.5 px-4 py-3 text-sm md:text-base font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition text-left"
                        >
                          <ShoppingBag className="h-5 w-5 shrink-0" />
                          <span>Đơn mua</span>
                        </button>

                        {user.role === "seller" && (
                          <button
                            onClick={() => navigateTo("/seller")}
                            className="w-full flex items-center space-x-2.5 px-4 py-3 text-sm md:text-base font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition text-left"
                          >
                            <Store className="h-5 w-5 shrink-0" />
                            <span>Kênh người bán</span>
                          </button>
                        )}

                        {user.role === "admin" && (
                          <button
                            onClick={() => navigateTo("/admin")}
                            className="w-full flex items-center space-x-2.5 px-4 py-3 text-sm md:text-base font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition text-left"
                          >
                            <LayoutDashboard className="h-5 w-5 shrink-0" />
                            <span>Trang quản trị</span>
                          </button>
                        )}
                      </div>

                      <div className="py-1.5">
                        <button
                          onClick={() => {
                            setIsUserDropdownOpen(false);
                            setIsLogoutConfirmOpen(true);
                          }}
                          className="w-full flex items-center space-x-2.5 px-4 py-3 text-sm md:text-base font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition text-left"
                        >
                          <LogOut className="h-5 w-5 shrink-0" />
                          <span>Đăng xuất</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login">
                  <Button variant="outline" className="text-base font-bold rounded-2xl border-2 h-16 px-6 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    Đăng nhập
                  </Button>
                </Link>
                <Link href="/register">
                  <Button className="text-base font-bold rounded-2xl bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 h-16 px-6 transition-all">
                    Đăng ký
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Slide-down Mobile Search Bar Overlay */}
          {isMobileSearchOpen && (
            <div ref={searchMobileWrapperRef} className="absolute inset-0 bg-white dark:bg-zinc-950 z-50 flex items-center px-4 gap-2 animate-fade-in border-b">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Tìm kiếm sản phẩm..."
                className="flex-1 bg-transparent border-none outline-none text-sm h-full"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  setIsSuggestionsOpen(true);
                }}
                onFocus={() => setIsSuggestionsOpen(true)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <button
                onClick={() => {
                  setIsMobileSearchOpen(false);
                  setIsSuggestionsOpen(false);
                  setActiveIndex(-1);
                }}
                className="text-xs font-bold text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Hủy
              </button>
              {renderSuggestionsList()}
            </div>
          )}
        </div>
      </header>

      {/* MOBILE DRAWER/SHEET SECTION */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="fixed top-0 left-0 bottom-0 w-72 bg-white dark:bg-zinc-950 border-r z-50 flex flex-col p-6 animate-slide-in-left shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Giang Kha
              </span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition border"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Menu Links */}
            <div className="flex-1 space-y-4">
              <button
                onClick={() => navigateTo("/")}
                className="w-full text-left py-2 px-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-lg text-sm font-semibold transition"
              >
                Trang chủ
              </button>
              <button
                onClick={() => navigateTo("/products")}
                className="w-full text-left py-2 px-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-lg text-sm font-semibold transition"
              >
                Sản phẩm
              </button>
              
              <Separator />
              
              <div className="py-2">
                <p className="px-3 text-xs font-bold text-muted-foreground uppercase mb-2">Danh mục</p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pl-2">
                  {rootCategories.length > 0 ? (
                    rootCategories.map((cat: any) => (
                      <button
                        key={cat.id}
                        onClick={() => navigateTo(`/categories/${cat.slug}`)}
                        className="w-full text-left py-1.5 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-md transition"
                      >
                        {cat.name}
                      </button>
                    ))
                  ) : (
                    <span className="px-3 text-xs text-muted-foreground italic block">
                      Không có danh mục
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Bottom (Seller signup or Quick Profile actions) */}
            {!user && (
              <div className="border-t pt-4">
                <button
                  onClick={() => navigateTo("/register-seller")}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-500/20"
                >
                  <Store className="h-4 w-4" />
                  <span>Trở thành người bán</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* MAIN CONTENT WRAPPER */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 md:p-8 space-y-8 animate-fade-in">
        {children}
      </main>

      {/* FOOTER SECTION */}
      <footer className="bg-zinc-50 dark:bg-zinc-950 border-t py-16 px-6 md:px-12 mt-12">
        <div className="max-w-[1600px] mx-auto">
          {/* Main Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10">
            
            {/* Col 1: Brand Info & Socials (4 columns span) */}
            <div className="space-y-6 lg:col-span-4">
              <div className="space-y-4">
                <span className="font-extrabold text-4xl tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent block">
                  Giang Kha
                </span>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Nền tảng thương mại điện tử Multi-Vendor hiện đại, chất lượng và đáng tin cậy. Mua sắm dễ dàng từ hàng ngàn nhà bán hàng chất lượng trên toàn quốc.
                </p>
              </div>

              {/* Contact details with icons */}
              <div className="space-y-3.5 text-base text-muted-foreground font-medium">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
                  <span>Tòa nhà Giang Kha, Đường Cách Mạng Tháng 8, Quận 1, TP. Hồ Chí Minh</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-violet-600 shrink-0" />
                  <span>Hotline: 1900 8198 (8:00 - 22:00)</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-violet-600 shrink-0" />
                  <span>Email: support@giangkha.com</span>
                </div>
              </div>

              {/* Social Media Links */}
              <div className="space-y-2.5">
                <span className="text-sm font-bold uppercase tracking-wider text-foreground block">Kết nối với chúng tôi</span>
                <div className="flex items-center gap-3">
                  <a href="#" className="p-2.5 rounded-full bg-zinc-200 dark:bg-zinc-900 text-muted-foreground hover:bg-violet-600 hover:text-white transition-all duration-300 shadow-sm flex items-center justify-center">
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                  <a href="#" className="p-2.5 rounded-full bg-zinc-200 dark:bg-zinc-900 text-muted-foreground hover:bg-violet-600 hover:text-white transition-all duration-300 shadow-sm flex items-center justify-center">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                    </svg>
                  </a>
                  <a href="#" className="p-2.5 rounded-full bg-zinc-200 dark:bg-zinc-900 text-muted-foreground hover:bg-violet-600 hover:text-white transition-all duration-300 shadow-sm flex items-center justify-center">
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.507a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.507 9.388.507 9.388.507s7.517 0 9.388-.507a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Col 2: Navigation Links (2 columns span) */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-lg font-bold text-foreground uppercase tracking-wider">Mua sắm</h4>
              <ul className="space-y-3.5 text-base text-muted-foreground font-semibold">
                <li>
                  <Link href="/" className="hover:text-violet-600 transition-colors">Trang chủ</Link>
                </li>
                <li>
                  <Link href="/products" className="hover:text-violet-600 transition-colors">Sản phẩm</Link>
                </li>
                <li>
                  <Link href="/categories" className="hover:text-violet-600 transition-colors">Danh mục ngành hàng</Link>
                </li>
                <li>
                  <Link href="/promotions" className="hover:text-violet-600 transition-colors">Chương trình khuyến mãi</Link>
                </li>
              </ul>
            </div>

            {/* Col 3: Support Info (3 columns span) */}
            <div className="lg:col-span-3 space-y-4">
              <h4 className="text-lg font-bold text-foreground uppercase tracking-wider">Hỗ trợ & Chính sách</h4>
              <ul className="space-y-3.5 text-base text-muted-foreground font-semibold">
                <li>
                  <Link href="/faq" className="hover:text-violet-600 transition-colors">Câu hỏi thường gặp (FAQ)</Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-violet-600 transition-colors">Điều khoản sử dụng</Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-violet-600 transition-colors">Chính sách bảo mật</Link>
                </li>
                <li>
                  <Link href="/register-seller" className="hover:text-violet-600 transition-colors">Đăng ký bán hàng cùng chúng tôi</Link>
                </li>
              </ul>
            </div>

            {/* Col 4: Newsletter & Trust (3 columns span) */}
            <div className="lg:col-span-3 space-y-6">
              <div className="space-y-4">
                <h4 className="text-lg font-bold text-foreground uppercase tracking-wider">Bản tin Giang Kha</h4>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Đăng ký nhận thông tin ưu đãi và các sản phẩm nổi bật mới nhất từ chúng tôi.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Email của bạn..."
                    className="flex-1 px-4 py-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 bg-background"
                  />
                  <Button size="default" className="text-base font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 h-12 px-5">
                    Đăng ký
                  </Button>
                </div>
              </div>

              {/* Trust Badge / Security Info */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-emerald-500 shrink-0" />
                <div className="text-sm font-semibold text-muted-foreground">
                  <p className="text-foreground">Mua sắm an toàn 100%</p>
                  <p className="text-xs font-normal">Thông tin bảo mật và mã hóa hoàn toàn</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom copyright & payment methods */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
              © 2026 Giang Kha Multi-Vendor. All rights reserved.
            </p>
            {/* Payment Icons / Badges */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase mr-2 hidden sm:inline">Thanh toán:</span>
              <div className="flex gap-2.5">
                <span className="px-2.5 py-1 text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-foreground rounded border border-zinc-300 dark:border-zinc-700 tracking-wider">VISA</span>
                <span className="px-2.5 py-1 text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-foreground rounded border border-zinc-300 dark:border-zinc-700 tracking-wider">MASTER</span>
                <span className="px-2.5 py-1 text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-foreground rounded border border-zinc-300 dark:border-zinc-700 tracking-wider">MOMO</span>
                <span className="px-2.5 py-1 text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-foreground rounded border border-zinc-300 dark:border-zinc-700 tracking-wider">COD</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
      {/* LOGOUT CONFIRMATION MODAL */}
      <Dialog open={isLogoutConfirmOpen} onOpenChange={setIsLogoutConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold mt-3">
              Xác nhận đăng xuất
            </DialogTitle>
            <DialogDescription className="text-center text-sm">
              Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này không?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              variant="destructive"
              className="w-full font-bold text-xs"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Đang đăng xuất...
                </>
              ) : (
                "Đăng xuất"
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full font-bold text-xs"
              onClick={() => setIsLogoutConfirmOpen(false)}
              disabled={isLoggingOut}
            >
              Hủy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <CartDrawer />
    </div>
  );
}
