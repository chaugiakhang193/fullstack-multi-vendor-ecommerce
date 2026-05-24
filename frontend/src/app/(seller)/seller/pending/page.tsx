"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogOut, ArrowLeft, Store, RefreshCw } from "lucide-react";
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

export default function SellerPendingPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
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
      // Gọi API GET /auth/me nhẹ để lấy thông tin user mới nhất từ DB
      const res = await authApiRequest.me();
      if (res.data) {
        const latestUser = res.data;
        const currentStatus = user?.status;
        const newStatus = latestUser.status;

        // Nếu trạng thái của user thay đổi
        if (newStatus !== currentStatus) {
          // Trạng thái đã thay đổi -> gọi silentRefresh để nhận Access Token mới chứa status mới trong payload
          await useAuthStore.getState().silentRefresh();
          
          if (newStatus === "active") {
            const successMsg = "Cửa hàng của bạn đã được phê duyệt!";
            toast.success(successMsg);
            const targetPath = "/seller";
            router.push(targetPath);
            router.refresh();
            return;
          } else if (newStatus === "rejected") {
            const errorMsg = "Yêu cầu đăng ký bán hàng của bạn đã bị từ chối.";
            toast.error(errorMsg);
            const targetPath = "/seller/rejected";
            router.push(targetPath);
            router.refresh();
            return;
          }
        } else {
          // Trạng thái không thay đổi, chuyển hướng nếu trạng thái hiện tại đã hợp lệ
          if (newStatus === "active") {
            const targetPath = "/seller";
            router.push(targetPath);
            router.refresh();
            return;
          } else if (newStatus === "rejected") {
            const targetPath = "/seller/rejected";
            router.push(targetPath);
            router.refresh();
            return;
          }
        }
      }
      const infoMsg = "Tài khoản vẫn đang trong quá trình phê duyệt.";
      toast.info(infoMsg);
    } catch (error) {
      const logTitle = "Lỗi kiểm tra trạng thái:";
      console.error(logTitle, error);
      const errMsg = "Không thể kết nối đến máy chủ.";
      toast.error(errMsg);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-xl border bg-card/60 backdrop-blur-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4 animate-pulse">
            <Clock className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Cửa hàng đang chờ duyệt
          </CardTitle>
          <CardDescription className="text-sm mt-1">
            Chào {user?.username}, yêu cầu đăng ký bán hàng của bạn đang được
            kiểm duyệt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300 flex gap-3">
            <Store className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Thời gian duyệt dự kiến: 1 - 2 ngày làm việc
              </p>
              <p className="mt-1 text-xs opacity-90">
                Hệ thống đang kiểm tra thông tin cửa hàng của bạn. Chúng tôi sẽ
                gửi email thông báo ngay sau khi admin phê duyệt hoặc từ chối.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Button
              onClick={handleCheckStatus}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white"
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>Kiểm tra lại trạng thái</span>
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => router.push("/")}
                className="flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Trang chủ</span>
              </Button>

              <Button
                variant="destructive"
                onClick={() => setIsLogoutConfirmOpen(true)}
                className="flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </Button>
            </div>
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
