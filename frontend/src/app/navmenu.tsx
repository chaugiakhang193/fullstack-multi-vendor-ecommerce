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
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { useAuthStore } from "@/store/useAuthStore";
import authApiRequest from "@/apiRequests/auth";
import { tabId } from "@/lib/utils";

export function Navbar() {
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      // Gọi API để Backend xóa Session và xóa Refresh Token Cookie
      await authApiRequest.logout();
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    } finally {
      // Xóa state ở Frontend (Zustand)
      logout();

      // Đồng bộ đăng xuất sang các tab khác
      const channel = new BroadcastChannel("auth-channel");
      channel.postMessage({ type: "logout_success", senderTabId: tabId });
      channel.close();

      toast.success("Đăng xuất thành công");
      router.push("/login");
      router.refresh();
    }
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  return (
    <div suppressHydrationWarning={true}>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between p-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="font-bold text-xl hover:text-primary transition-colors"
            >
              Giang Kha Shop
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
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm font-medium">
                  Chào, <span className="text-primary">{user.username}</span>
                </span>

                <Button variant="outline" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Đăng xuất
                </Button>
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
    </div>
  );
}
