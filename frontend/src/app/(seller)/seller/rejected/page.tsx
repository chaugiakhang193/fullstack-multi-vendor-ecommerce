'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  XCircle,
  LogOut,
  ArrowRight,
  Store,
  RefreshCw,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useAuthStore } from '@/store/useAuthStore';
import authApiRequest from '@/apiRequests/auth/auth';
import sellerShopsApiRequest from '@/apiRequests/shops/seller-shops';
import { tabId } from '@/lib/utils';
import { toast } from 'sonner';
import { AccountStatus } from '@/constants/enum';
import { BROADCAST_CHANNELS, BROADCAST_EVENTS } from '@/constants/broadcast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function SellerRejectedPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [isLoadingReason, setIsLoadingReason] = useState(false);

  React.useEffect(() => {
    const fetchShopInfo = async () => {
      setIsLoadingReason(true);
      try {
        const res = await sellerShopsApiRequest.getMyShop();
        if (res.data && res.data.reject_reason) {
          setRejectReason(res.data.reject_reason);
        }
      } catch (error) {
        console.error('Lỗi lấy thông tin cửa hàng bị từ chối:', error);
      } finally {
        setIsLoadingReason(false);
      }
    };
    fetchShopInfo();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApiRequest.logout();
    } catch (error) {
      console.error('Lỗi đăng xuất:', error);
    } finally {
      logout();
      // Đồng bộ đăng xuất sang các tab khác
      const channel = new BroadcastChannel(BROADCAST_CHANNELS.AUTH);
      channel.postMessage({
        type: BROADCAST_EVENTS.AUTH_LOGOUT_SUCCESS,
        senderTabId: tabId,
      });
      channel.close();

      toast.success('Đăng xuất thành công');
      setIsLogoutConfirmOpen(false);
      router.push('/login');
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  const handleCheckStatus = async () => {
    try {
      setIsRefreshing(true);
      // Gọi API GET /auth/me nhẹ để lấy thông tin trạng thái mới nhất từ DB
      const res = await authApiRequest.me();
      if (res.data) {
        const latestUser = res.data;
        const currentStatus = user?.status;
        const newStatus = latestUser.status;

        // Nếu trạng thái của user thay đổi
        if (newStatus !== currentStatus) {
          // Trạng thái thay đổi -> gọi silentRefresh để nhận Access Token mới chứa status mới trong payload
          await useAuthStore.getState().silentRefresh();

          if (newStatus === AccountStatus.ACTIVE) {
            const successMsg = 'Cửa hàng của bạn đã được phê duyệt!';
            toast.success(successMsg);
            const targetPath = '/seller';
            router.push(targetPath);
            router.refresh();
            return;
          } else if (newStatus === AccountStatus.PENDING_APPROVAL) {
            const pendingMsg = 'Cửa hàng của bạn đang chờ phê duyệt.';
            toast.success(pendingMsg);
            const targetPath = '/seller/pending';
            router.push(targetPath);
            router.refresh();
            return;
          }
        } else {
          // Trạng thái không thay đổi, chuyển hướng nếu trạng thái hiện tại đã hợp lệ
          if (newStatus === AccountStatus.ACTIVE) {
            const targetPath = '/seller';
            router.push(targetPath);
            router.refresh();
            return;
          } else if (newStatus === AccountStatus.PENDING_APPROVAL) {
            const targetPath = '/seller/pending';
            router.push(targetPath);
            router.refresh();
            return;
          }
        }
      }
      const infoMsg = 'Yêu cầu đăng ký vẫn bị từ chối.';
      toast.info(infoMsg);
    } catch (error) {
      const logTitle = 'Lỗi kiểm tra trạng thái:';
      console.error(logTitle, error);
      const errMsg = 'Không thể kết nối đến máy chủ.';
      toast.error(errMsg);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl shadow-2xl border bg-card/60 backdrop-blur-md p-6 md:p-10">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto h-20 w-20 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 mb-6">
            <XCircle className="h-10 w-10" />
          </div>
          <CardTitle className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Yêu cầu bị từ chối
          </CardTitle>
          <CardDescription className="text-base md:text-lg mt-3">
            Chào {user?.username}, yêu cầu đăng ký bán hàng của bạn đã bị từ
            chối phê duyệt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 pt-2">
          {isLoadingReason ? (
            <div className="flex justify-center items-center py-8 text-base text-muted-foreground gap-2 border rounded-2xl bg-zinc-50/30 dark:bg-zinc-950/10">
              <Loader2 className="h-5 w-5 animate-spin text-rose-500" />
              Đang tải lý do từ chối...
            </div>
          ) : rejectReason ? (
            <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-6 text-base text-rose-800 dark:text-rose-300 flex gap-4">
              <AlertCircle className="h-7 w-7 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="text-lg font-bold">Lý do từ chối cụ thể:</p>
                <p className="mt-2 text-sm opacity-90 whitespace-pre-wrap font-medium leading-relaxed">
                  {rejectReason}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-6 text-base text-rose-800 dark:text-rose-300 flex gap-4">
              <Mail className="h-7 w-7 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="text-lg font-bold">
                  Vui lòng kiểm tra hộp thư email
                </p>
                <p className="mt-2 text-sm opacity-90 leading-relaxed">
                  Chi tiết lý do từ chối đã được gửi đến email đăng ký của bạn.
                  Hãy kiểm tra hòm thư chính và thư rác.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Button
              onClick={() => router.push('/seller/setup')}
              className="w-full h-14 flex items-center justify-center gap-2.5 bg-violet-600 hover:bg-violet-700 text-white text-base md:text-lg font-bold rounded-xl shadow-md transition"
            >
              <span>Chỉnh sửa & gửi lại yêu cầu</span>
              <ArrowRight className="h-5 w-5" />
            </Button>

            <Button
              onClick={handleCheckStatus}
              variant="outline"
              className="w-full h-14 flex items-center justify-center gap-2.5 text-base font-bold rounded-xl"
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              <span>Kiểm tra lại trạng thái</span>
            </Button>

            <Button
              variant="destructive"
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="w-full h-14 flex items-center justify-center gap-2.5 text-base font-bold rounded-xl"
            >
              <LogOut className="h-5 w-5" />
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
                'Đăng xuất'
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
