"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  XCircle,
  LogOut,
  ArrowRight,
  Store,
  RefreshCw,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAuthStore } from "@/store/useAuthStore";
import authApiRequest from "@/apiRequests/auth";
import { tabId } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Loader2 } from "lucide-react";

export default function SellerRejectedPage() {
  const router = useRouter();
  const { user, logout, setAuth } = useAuthStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApiRequest.logout();
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    } finally {
      logout();
      // Đồng bộ đăng xuất sang các tab khác
      const channel = new BroadcastChannel("auth-channel");
      channel.postMessage({ type: "logout_success", senderTabId: tabId });
      channel.close();

      toast.success("Đăng xuất thành công");
      setIsLogoutConfirmOpen(false);
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  const handleCheckStatus = async () => {
    try {
      setIsRefreshing(true);
      // Gọi API refresh token để lấy thông tin trạng thái mới nhất
      const res = await authApiRequest.refreshToken();
      if (res.data) {
        setAuth(res.data.user, res.data.access_token);

        // Kiểm tra xem status đã chuyển thành active chưa hoặc pending_approval
        if (res.data.user.status === "active") {
          toast.success("Cửa hàng của bạn đã được phê duyệt!");
          router.push("/seller");
          router.refresh();
          return;
        } else if (res.data.user.status === "pending_approval") {
          toast.success("Cửa hàng của bạn đang chờ phê duyệt.");
          router.push("/seller/pending");
          router.refresh();
          return;
        }
      }
      toast.info("Yêu cầu đăng ký vẫn bị từ chối.");
    } catch (error) {
      console.error("Lỗi kiểm tra trạng thái:", error);
      toast.error("Không thể kết nối đến máy chủ.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-xl border bg-card/60 backdrop-blur-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto h-16 w-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 mb-4">
            <XCircle className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Yêu cầu bị từ chối
          </CardTitle>
          <CardDescription className="text-sm mt-1">
            Chào {user?.username}, yêu cầu đăng ký bán hàng của bạn đã bị từ
            chối phê duyệt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-4 text-sm text-rose-800 dark:text-rose-300 flex gap-3">
            <Mail className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Vui lòng kiểm tra hộp thư email</p>
              <p className="mt-1 text-xs opacity-90">
                Chi tiết lý do từ chối đã được gửi đến email đăng ký của bạn.
                Hãy kiểm tra hòm thư chính và thư rác.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Button
              onClick={() => router.push("/seller/setup")}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold"
            >
              <span>Chỉnh sửa & gửi lại yêu cầu</span>
              <ArrowRight className="h-4 w-4" />
            </Button>

            <Button
              onClick={handleCheckStatus}
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>Kiểm tra lại trạng thái</span>
            </Button>

            <Button
              variant="destructive"
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="w-full flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Đăng xuất</span>
            </Button>
          </div>
        </CardContent>
      </Card>

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
