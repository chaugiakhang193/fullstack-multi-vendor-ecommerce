"use client";

import * as React from "react";
import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import useHydrated from "@/hooks/useHydrated";
import { toast } from "sonner";
import { useRouter, usePathname } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPin,
  Settings,
  Store,
  User,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";

import { useAuthStore } from "@/store/useAuthStore";
import authApiRequest from "@/apiRequests/auth/auth";
import { tabId } from "@/lib/utils";
import { UserRole } from "@/constants/enum";
import { BROADCAST_CHANNELS, BROADCAST_EVENTS } from "@/constants/broadcast";

export function Navbar() {
  const isClient = useHydrated();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Gọi API để Backend xóa Session và xóa Refresh Token Cookie
      await authApiRequest.logout();
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    } finally {
      // Xóa state ở Frontend (Zustand)
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

  // Ẩn Navbar toàn cục khi đang ở các trang Seller hoặc Admin Panel
  // (các panel này có header/sidebar riêng)
  if (!isClient) return null;
  if (pathname.startsWith("/seller") || pathname.startsWith("/admin"))
    return null;

  return (
    <div suppressHydrationWarning={true}>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="font-bold text-xl hover:text-primary transition-colors"
            >
              Giang Kha
            </Link>

            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <Link href="/" legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      Trang chủ
                    </NavigationMenuLink>
                  </Link>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <Link href="/products" legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      Sản phẩm
                    </NavigationMenuLink>
                  </Link>
                </NavigationMenuItem>

                {user?.role !== UserRole.SELLER && user?.role !== UserRole.ADMIN && (
                  <NavigationMenuItem>
                    <Link href="/register-seller" legacyBehavior passHref>
                      <NavigationMenuLink
                        className={navigationMenuTriggerStyle()}
                      >
                        Trở thành người bán
                      </NavigationMenuLink>
                    </Link>
                  </NavigationMenuItem>
                )}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* Notifications Bell */}
                <button className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 border relative transition">
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-950" />
                </button>

                <Separator orientation="vertical" className="h-6" />

                <div className="relative">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 border transition"
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center font-bold text-sm text-white shadow-sm">
                      {user.username?.charAt(0).toUpperCase() || (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-xs font-bold hidden sm:inline-block pr-1">
                      {user.username}
                    </span>
                  </button>

                  {isDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsDropdownOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-full min-w-[240px] bg-white dark:bg-zinc-950 border rounded-xl shadow-xl z-20 py-2 divide-y divide-zinc-100 dark:divide-zinc-900 animate-fade-in">
                        <div className="px-4 py-2.5">
                          <p className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
                            Tài khoản
                          </p>
                          <p className="text-base font-extrabold truncate mt-1 text-foreground">
                            {user.username}
                          </p>
                          <span className="inline-block px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-full mt-1.5 border border-violet-200/55">
                            Role: {user.role}
                          </span>
                        </div>

                        {/* Link tới Seller Portal (chỉ hiện nếu là Seller) */}
                        {user.role === UserRole.SELLER && (
                          <div className="py-1.5">
                            <Link
                              href="/seller"
                              onClick={() => setIsDropdownOpen(false)}
                              className="flex items-center space-x-2.5 px-4 py-3 text-sm md:text-base font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                            >
                              <Store className="h-5 w-5 shrink-0" />
                              <span>Kênh người bán</span>
                            </Link>
                          </div>
                        )}

                        {/* Link tới Admin Portal (chỉ hiện nếu là Admin) */}
                        {user.role === UserRole.ADMIN && (
                          <div className="py-1.5">
                            <Link
                              href="/admin"
                              onClick={() => setIsDropdownOpen(false)}
                              className="flex items-center space-x-2.5 px-4 py-3 text-sm md:text-base font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                            >
                              <LayoutDashboard className="h-5 w-5 shrink-0" />
                              <span>Trang quản trị</span>
                            </Link>
                          </div>
                        )}

                        {/* Link Sổ địa chỉ — hiện cho mọi user trừ Admin */}
                        {user.role !== UserRole.ADMIN && (
                          <div className="py-1.5">
                            <Link
                              href="/profile/addresses"
                              onClick={() => setIsDropdownOpen(false)}
                              className="flex items-center space-x-2.5 px-4 py-3 text-sm md:text-base font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                            >
                              <MapPin className="h-5 w-5 shrink-0" />
                              <span>Sổ địa chỉ</span>
                            </Link>
                          </div>
                        )}

                        <div className="py-1.5">
                          <button
                            onClick={() => {
                              setIsDropdownOpen(false);
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
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="outline">Đăng nhập</Button>
                </Link>
                <Link href="/register">
                  <Button>Đăng ký</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

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
    </div>
  );
}
