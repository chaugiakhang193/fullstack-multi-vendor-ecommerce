"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Store,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
  Menu,
  X,
  LogOut,
  Bell,
  ChevronRight,
  User,
  ExternalLink,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import authApiRequest from "@/apiRequests/auth/auth";
import sellerShopsApiRequest from "@/apiRequests/shops/seller-shops";
import { tabId } from "@/lib/utils";
import { UserRole, AccountStatus } from "@/constants/enum";
import { BROADCAST_CHANNELS, BROADCAST_EVENTS } from "@/constants/broadcast";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Loader2 } from "lucide-react";

export default function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isCheckingShop, setIsCheckingShop] = useState(true);
  const [hasRedirected, setHasRedirected] = useState(false); // Flag để ngăn check lại sau redirect
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleCustomBreadcrumb = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; label: string }>;
      if (customEvent?.detail) {
        setCustomLabels((prev) => ({
          ...prev,
          [customEvent.detail.key]: customEvent.detail.label,
        }));
      }
    };
    window.addEventListener("update-breadcrumb", handleCustomBreadcrumb);
    return () => {
      window.removeEventListener("update-breadcrumb", handleCustomBreadcrumb);
    };
  }, []);

  // Check shop status và redirect logic
  useEffect(() => {
    const checkShopStatus = async () => {
      // Bỏ qua check nếu đang ở trang settings, setup hoặc rejected
      if (
        pathname === "/seller/settings" ||
        pathname === "/seller/setup" ||
        pathname === "/seller/rejected"
      ) {
        setIsCheckingShop(false);
        return;
      }

      // Bỏ qua nếu đã redirect rồi
      if (hasRedirected) {
        setIsCheckingShop(false);
        return;
      }

      // Check shop status cho tất cả seller (bao gồm cả /seller/pending)
      if (user) {
        try {
          const res = await sellerShopsApiRequest.getMyShop();
          const shop = res.data;

          //  Nếu user pending_approval VÀ đã có shop → redirect /seller/pending
          if (
            user.status === AccountStatus.PENDING_APPROVAL &&
            shop &&
            pathname !== "/seller/pending"
          ) {
            setHasRedirected(true);
            router.push("/seller/pending");
            return;
          }

          // User active + shop active → OK, không redirect
        } catch (error: any) {
          //  Nếu 404 (không có shop) → redirect /seller/setup NGAY
          if (error?.status === 404) {
            // Nếu đang ở /seller/pending mà không có shop → redirect setup với toast
            if (pathname === "/seller/pending") {
              toast.info("Vui lòng tạo cửa hàng trước khi tiếp tục");
            }
            setHasRedirected(true);
            router.push("/seller/setup");
            return;
          }
          console.error("Error checking shop status:", error);
        }
      }

      setIsCheckingShop(false);
    };

    if (isMounted && user) {
      checkShopStatus();
    }
  }, [pathname, user, router, isMounted, hasRedirected]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const isSetupOrPendingPage =
      pathname === "/seller/setup" ||
      pathname === "/seller/pending" ||
      pathname === "/seller/rejected";

    if (!isSetupOrPendingPage) {
      // Vô hiệu hóa thanh scroll của toàn trang (window) khi ở Seller Dashboard
      document.documentElement.classList.add("overflow-hidden", "h-screen");
      document.body.classList.add("overflow-hidden", "h-screen");
    } else {
      document.documentElement.classList.remove("overflow-hidden", "h-screen");
      document.body.classList.remove("overflow-hidden", "h-screen");
    }

    return () => {
      document.documentElement.classList.remove("overflow-hidden", "h-screen");
      document.body.classList.remove("overflow-hidden", "h-screen");
    };
  }, [pathname]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApiRequest.logout();
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    } finally {
      logout();
      // Đồng bộ đăng xuất sang các tab khác
      const channel = new BroadcastChannel(BROADCAST_CHANNELS.AUTH);
      channel.postMessage({ type: BROADCAST_EVENTS.AUTH_LOGOUT_SUCCESS, senderTabId: tabId });
      channel.close();

      toast.success("Đăng xuất thành công");
      setIsLogoutConfirmOpen(false);
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  const menuItems = [
    {
      label: "Tổng quan",
      href: "/seller",
      icon: <LayoutDashboard className="h-5 w-5" />,
      exact: true,
    },
    {
      label: "Sản phẩm",
      href: "/seller/products",
      icon: <Package className="h-5 w-5" />,
    },
    {
      label: "Đơn hàng",
      href: "/seller/orders",
      icon: <ShoppingCart className="h-5 w-5" />,
    },
    {
      label: "Cài đặt",
      href: "/seller/settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  // Helper to check if a route is active
  const isActive = (href: string, exact = false) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  // Helper to render dynamic breadcrumbs
  const getBreadcrumbs = () => {
    const paths = pathname.split("/").filter(Boolean);
    const breadcrumbs = [];

    // Map route keys to Vietnamese titles
    const routeMap: Record<string, string> = {
      seller: "Kênh Người Bán",
      products: "Sản phẩm",
      orders: "Đơn hàng",
      settings: "Cài đặt",
      create: "Tạo sản phẩm mới",
      edit: "Sửa thông tin",
    };

    let currentHref = "";
    const isUUID = (str: string) =>
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        str,
      );

    for (let i = 0; i < paths.length; i++) {
      currentHref += `/${paths[i]}`;

      const segment = paths[i];
      let label = routeMap[segment] || segment;
      let isClickable = true;

      if (isUUID(segment)) {
        isClickable = false; // UUID không có trang riêng để click vào
        label = customLabels[segment] || "Chi tiết";
      }

      breadcrumbs.push({
        label,
        href: currentHref,
        isClickable,
        isLast: false,
      });
    }

    // Thiết lập lại thuộc tính isLast cho breadcrumb hiển thị cuối cùng
    if (breadcrumbs.length > 0) {
      breadcrumbs[breadcrumbs.length - 1].isLast = true;
    }

    return breadcrumbs;
  };

  if (!isMounted) return null;

  // Show loading state while checking shop status
  if (isCheckingShop) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="text-sm text-muted-foreground">
            Đang kiểm tra trạng thái...
          </p>
        </div>
      </div>
    );
  }

  if (
    pathname === "/seller/pending" ||
    pathname === "/seller/setup" ||
    pathname === "/seller/rejected"
  ) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-900 flex text-foreground">
      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden md:flex flex-col w-72 bg-zinc-950 text-zinc-100 border-r border-zinc-800 shadow-xl shrink-0 overflow-y-auto">
        {/* Brand/Logo */}
        <div className="h-20 flex items-center px-8 border-b border-zinc-800 gap-3">
          <Store className="h-8 w-8 text-violet-400" />
          <div className="flex flex-col">
            <span className="font-extrabold text-base tracking-tight text-white leading-none">
              Giang Kha Shop
            </span>
            <span className="text-xs text-violet-400 font-black uppercase mt-1 tracking-wider">
              Seller Portal
            </span>
          </div>
        </div>

        {/* Menu Navigation */}
        <nav className="flex-1 px-5 py-8 space-y-2">
          {menuItems.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-5 py-4 rounded-xl text-base font-bold transition-all duration-200 relative group ${
                  active
                    ? "bg-violet-600/10 text-violet-400"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-violet-500 rounded-r-full" />
                )}
                <span
                  className={`mr-3.5 transition-transform duration-200 group-hover:scale-110 ${active ? "text-violet-400" : "text-zinc-400"}`}
                >
                  {React.cloneElement(item.icon, { className: "h-6 w-6" })}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Card */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center space-x-3.5 mb-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center font-extrabold text-lg text-white shadow-md">
              {user?.username?.charAt(0).toUpperCase() || (
                <User className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-extrabold text-white truncate leading-none mb-1.5">
                {user?.username || "Người bán"}
              </p>
              <span className="inline-block px-2 py-0.5 text-xs font-black tracking-wide uppercase bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                {user?.status === AccountStatus.ACTIVE ? "Đã duyệt" : "Chờ duyệt"}
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsLogoutConfirmOpen(true)}
            className="w-full flex items-center justify-center space-x-2 py-3 border border-zinc-700 hover:border-rose-500/30 hover:bg-rose-500/10 rounded-xl text-sm font-bold text-zinc-400 hover:text-rose-400 transition duration-200"
          >
            <LogOut className="h-5 w-5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* --- MOBILE SIDEBAR DRAWER --- */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fade-in">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />

          {/* Drawer Content */}
          <aside className="relative flex flex-col w-72 max-w-xs bg-zinc-950 text-zinc-100 h-full shadow-2xl animate-slide-in-left">
            <div className="absolute top-4 right-4">
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 transition text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Logo */}
            <div className="h-16 flex items-center px-6 border-b border-zinc-800 gap-2">
              <Store className="h-6 w-6 text-violet-400" />
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight text-white leading-none">
                  Giang Kha Shop
                </span>
                <span className="text-[10px] text-violet-400 font-extrabold uppercase mt-0.5 tracking-wider">
                  Seller Portal
                </span>
              </div>
            </div>

            {/* Menu */}
            <nav className="flex-1 px-4 py-6 space-y-1">
              {menuItems.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex items-center px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                      active
                        ? "bg-violet-600/10 text-violet-400"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                    }`}
                  >
                    <span
                      className={`mr-3 ${active ? "text-violet-400" : "text-zinc-400"}`}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* User */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center space-x-3 mb-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center font-bold text-sm text-white shadow">
                  {user?.username?.charAt(0).toUpperCase() || (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white leading-none mb-1">
                    {user?.username || "Người bán"}
                  </p>
                  <span className="inline-block px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                    {user?.status === AccountStatus.ACTIVE ? "Đã duyệt" : "Chờ duyệt"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMobileOpen(false);
                  setIsLogoutConfirmOpen(true);
                }}
                className="w-full flex items-center justify-center space-x-2 py-2 border border-zinc-700 hover:bg-rose-500/10 rounded-lg text-xs font-semibold text-zinc-400 hover:text-rose-400 transition"
              >
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* --- MAIN PAGE AREA --- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* HEADER BAR */}
        <header className="h-20 sticky top-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b flex items-center justify-between px-6 sm:px-8 shadow-sm">
          {/* Left: Mobile Toggle & Breadcrumbs */}
          <div className="flex items-center space-x-5">
            <button
              onClick={() => setIsMobileOpen(true)}
              className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 border md:hidden transition"
            >
              <Menu className="h-6 w-6" />
            </button>

            {/* Breadcrumbs */}
            <nav className="hidden sm:flex items-center space-x-1.5 text-base font-bold text-muted-foreground">
              <Link
                href="/"
                className="hover:text-foreground flex items-center gap-1.5"
              >
                <span>Trang chủ</span>
              </Link>
              {getBreadcrumbs().map((crumb, idx) => (
                <React.Fragment key={crumb.href}>
                  <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
                  {crumb.isLast || !crumb.isClickable ? (
                    <span
                      className={
                        crumb.isLast
                          ? "text-foreground font-black"
                          : "text-muted-foreground"
                      }
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="hover:text-foreground">
                      {crumb.label}
                    </Link>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          {/* Right: Notifications & User profile dropdown */}
          <div className="flex items-center space-x-4">
            {/* View Shop Link */}
            <Link
              href="/"
              className="hidden lg:flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl border hover:bg-muted transition-all duration-200"
            >
              <span>Xem trang shop</span>
              <ExternalLink className="h-4 w-4" />
            </Link>

            {/* Notifications */}
            <button className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 border relative transition">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-950" />
            </button>

            <Separator orientation="vertical" className="h-8" />

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 border transition"
              >
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center font-black text-base text-white shadow-sm">
                  {user?.username?.charAt(0).toUpperCase() || (
                    <User className="h-5 w-5" />
                  )}
                </div>
                <span className="text-sm font-black hidden sm:inline-block pr-1.5">
                  {user?.username || "Người bán"}
                </span>
              </button>

              {isProfileDropdownOpen && (
                <>
                  {/* Dropdown Overlay Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsProfileDropdownOpen(false)}
                  />
                  {/* Dropdown Card */}
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-zinc-950 border rounded-xl shadow-xl z-20 py-2 divide-y divide-zinc-100 dark:divide-zinc-900 animate-fade-in">
                    <div className="px-4 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Tài khoản
                      </p>
                      <p className="text-sm font-bold truncate mt-0.5">
                        {user?.username}
                      </p>
                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-extrabold bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-full mt-1.5">
                        Role: {user?.role}
                      </span>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/seller/settings"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                      >
                        <Settings className="h-4 w-4" />
                        <span>Cài đặt cửa hàng</span>
                      </Link>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          setIsLogoutConfirmOpen(true);
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Đăng xuất</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6">
          <div className="w-full">{children}</div>
        </main>
      </div>

      {/* Modal xác nhận đăng xuất */}
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
              Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này không? Mọi
              phiên làm việc hiện tại sẽ bị xóa.
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
    </div>
  );
}
