'use client';

import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  Info,
  Banknote,
} from 'lucide-react';
import Link from 'next/link';
import { useSocket } from '@/components/providers/socket-provider';
import { useMyShop } from '@/hooks/useShop';
import {
  useSellerBalance,
  useSellerPayoutHistory,
  useRequestPayout,
} from '@/hooks/usePayouts';
import { PayoutStatusBadge } from '@/components/payouts/payout-status-badge';
import { Pagination } from '@/components/shared/pagination';
import { formatVnd } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CreatePayoutBody } from '@/schemaValidations/payouts/payouts.schema';
import { useQueryClient } from '@tanstack/react-query';
import { payoutKeys } from '@/constants/query-keys';
import { PayoutStatus } from '@/constants/enum.generated';
import { PAYOUT_LIMITS } from '@/constants/limits.generated';

export default function SellerPayoutsPage() {
  const queryClient = useQueryClient();
  const socket = useSocket();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // 1. Lấy thông tin Shop hiện tại để kiểm tra cấu hình ngân hàng
  const isMyShopQueryEnabled = true;
  const { data: shopData, isLoading: isShopLoading } =
    useMyShop(isMyShopQueryEnabled);
  const shop = shopData?.data;
  const bankInfo = shop?.bank_account_info;

  // Kiểm tra xem shop đã hoàn tất cấu hình ngân hàng chưa
  const hasBankConfigured = !!(
    bankInfo &&
    bankInfo.bank_name &&
    bankInfo.account_number &&
    bankInfo.account_holder
  );

  // 2. Lấy số dư và lịch sử rút tiền
  const { data: balanceData, isLoading: isBalanceLoading } = useSellerBalance();
  const balance = balanceData?.data;

  const { data: historyData, isLoading: isHistoryLoading } =
    useSellerPayoutHistory(currentPage);
  const payoutsList = historyData?.data;
  const payouts = payoutsList?.items || [];
  const totalPages = payoutsList?.meta?.totalPages || 1;

  // 3. Hook gửi yêu cầu rút tiền
  const { mutate: requestPayout, isPending: isSubmitting } = useRequestPayout({
    onSuccess: () => {
      setIsModalOpen(false);
      setWithdrawAmount('');
      setValidationError(null);
    },
  });

  // 4. Lắng nghe sự kiện WebSocket để cập nhật số dư thời gian thực
  useEffect(() => {
    if (!socket) return;

    const payoutEventKey = 'payout.status_changed';
    const handlePayoutStatusChanged = () => {
      // Invalidate cache để update số dư và bảng lịch sử tức thì
      queryClient.invalidateQueries({ queryKey: payoutKeys.all });
    };

    socket.on(payoutEventKey, handlePayoutStatusChanged);

    return () => {
      socket.off(payoutEventKey, handlePayoutStatusChanged);
    };
  }, [socket, queryClient]);

  // Xử lý thay đổi số trang
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Xử lý gửi form yêu cầu rút tiền
  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const amountNum = Number(withdrawAmount);

    // Validate dữ liệu bằng Zod schema
    const validationResult = CreatePayoutBody.safeParse({ amount: amountNum });

    if (!validationResult.success) {
      const firstError =
        validationResult.error.errors[0]?.message || 'Số tiền không hợp lệ.';
      setValidationError(firstError);
      return;
    }

    // Kiểm tra khả dụng số dư
    const availableBalance = balance?.available_balance || 0;
    if (amountNum > availableBalance) {
      const balanceErrorMsg = 'Số tiền rút vượt quá số dư khả dụng hiện tại.';
      setValidationError(balanceErrorMsg);
      return;
    }

    const payload = { amount: amountNum };
    requestPayout(payload);
  };

  // Skeletons cho trạng thái tải dữ liệu
  const isPageLoading = isShopLoading || isBalanceLoading || isHistoryLoading;

  if (isPageLoading && payouts.length === 0) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-5 w-96 rounded-lg" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="rounded-2xl border p-6 space-y-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-[250px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // Formatting values for UI displays
  const availableBalanceVal = balance?.available_balance || 0;
  const pendingPayoutVal = balance?.pending_payout || 0;
  const totalRevenueVal = balance?.total_revenue || 0;
  const totalPayoutedVal = balance?.total_payouted || 0;
  const grossRevenueVal = balance?.gross_revenue || 0;
  const commissionAmountVal = balance?.commission_amount || 0;

  const formattedAvailableBalance = formatVnd.format(availableBalanceVal);
  const formattedPendingPayout = formatVnd.format(pendingPayoutVal);
  const formattedTotalRevenue = formatVnd.format(totalRevenueVal);
  const formattedTotalPayouted = formatVnd.format(totalPayoutedVal);
  const formattedGrossRevenue = formatVnd.format(grossRevenueVal);
  const formattedCommission = formatVnd.format(commissionAmountVal);

  const minAmount = PAYOUT_LIMITS.MIN_AMOUNT;
  const formattedMinAmount = formatVnd.format(minAmount);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Quản lý ví & Rút tiền
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Xem doanh thu, kiểm tra số dư khả dụng và thực hiện yêu cầu rút tiền
            về tài khoản ngân hàng.
          </p>
        </div>

        {hasBankConfigured && (
          <Button
            onClick={() => setIsModalOpen(true)}
            className="rounded-xl px-5 py-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 flex items-center gap-2 font-medium transition-all shadow-sm"
          >
            Yêu cầu rút tiền
            <ArrowUpRight className="h-4.5 w-4.5" />
          </Button>
        )}
      </div>

      {/* Alert cảnh báo nếu chưa thiết lập tài khoản ngân hàng */}
      {!hasBankConfigured && (
        <div className="flex flex-col gap-4 p-5 rounded-2xl border border-rose-200 bg-rose-50/50 dark:border-rose-950/30 dark:bg-rose-950/10 sm:flex-row sm:items-center sm:justify-between animate-shake">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5.5 w-5.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-rose-900 dark:text-rose-300">
                Chưa cấu hình tài khoản ngân hàng
              </h4>
              <p className="text-sm text-rose-700 dark:text-rose-400 mt-0.5">
                Vui lòng cấu hình thông tin tài khoản ngân hàng của shop để hệ
                thống chuyển khoản doanh thu cho bạn khi thực hiện yêu cầu rút
                tiền.
              </p>
            </div>
          </div>
          <Link href="/seller/settings" passHref>
            <Button className="w-full sm:w-auto rounded-xl px-4 py-5 bg-rose-600 hover:bg-rose-700 text-white font-medium shrink-0 shadow-sm transition-all text-sm">
              Thiết lập ngay
            </Button>
          </Link>
        </div>
      )}

      {/* Grid Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Số dư khả dụng */}
        <div className="rounded-2xl border p-6 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex flex-col justify-between shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
              Số dư khả dụng
            </span>
            <div className="p-2.5 rounded-xl bg-zinc-800 text-zinc-200 dark:bg-zinc-200 dark:text-zinc-800">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight block">
              {formattedAvailableBalance}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 block">
              Sẵn sàng rút về tài khoản ngân hàng
            </span>
          </div>
        </div>

        {/* Doanh thu thực nhận (sau hoa hồng sàn) */}
        <div className="rounded-2xl border p-6 bg-card flex flex-col justify-between shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-500">
              Doanh thu thực nhận
            </span>
            <div className="p-2.5 rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <Banknote className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight block">
              {formattedTotalRevenue}
            </span>
            <span className="text-xs text-zinc-500 mt-1 block">
              Doanh thu thô {formattedGrossRevenue} − phí sàn 5% (
              {formattedCommission})
            </span>
          </div>
        </div>

        {/* Số tiền đã rút */}
        <div className="rounded-2xl border p-6 bg-card flex flex-col justify-between shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-500">
              Số tiền đã rút
            </span>
            <div className="p-2.5 rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight block">
              {formattedTotalPayouted}
            </span>
            <span className="text-xs text-zinc-500 mt-1 block">
              Số tiền rút thành công
            </span>
          </div>
        </div>

        {/* Số tiền đang chờ duyệt */}
        <div className="rounded-2xl border p-6 bg-card flex flex-col justify-between shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-500">
              Đang chờ xử lý
            </span>
            <div className="p-2.5 rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight block">
              {formattedPendingPayout}
            </span>
            <span className="text-xs text-zinc-500 mt-1 block">
              Yêu cầu rút tiền chờ Admin duyệt
            </span>
          </div>
        </div>
      </div>

      {/* Lịch sử giao dịch */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/10">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight">
              Lịch sử rút tiền
            </h3>
            <p className="text-xs text-zinc-500">
              Danh sách các yêu cầu rút tiền của gian hàng.
            </p>
          </div>
        </div>

        {payouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border-dashed">
            <div className="p-4 rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-950 mb-3">
              <Wallet className="h-8 w-8" />
            </div>
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Chưa có giao dịch rút tiền
            </h4>
            <p className="text-sm text-zinc-500 max-w-xs mt-1">
              Bạn chưa thực hiện yêu cầu rút tiền nào từ hệ thống. Các yêu cầu
              sau này sẽ xuất hiện tại đây.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse text-left">
              <thead>
                <tr className="border-b bg-zinc-100/40 text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400">
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Mã giao dịch
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Số tiền rút
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Tài khoản nhận
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Thời gian tạo
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Chi tiết / Lý do từ chối
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payouts.map((payout) => {
                  const payoutId = payout.id;
                  const shortId = payoutId.substring(0, 8).toUpperCase();
                  const amountFormatted = formatVnd.format(payout.amount);

                  const bankSnapshot = payout.bank_info_snapshot;
                  const accountNumStr = bankSnapshot?.account_number || 'N/A';
                  const bankNameStr = bankSnapshot?.bank_name || 'N/A';
                  const accountHolderStr =
                    bankSnapshot?.account_holder || 'N/A';
                  const bankSnapshotLabel = `${bankNameStr} - ${accountNumStr} (${accountHolderStr})`;

                  const createdDate = new Date(payout.created_at);
                  const localeStringOpt = 'vi-VN';
                  const formattedDate =
                    createdDate.toLocaleString(localeStringOpt);

                  const isRejected = payout.status === PayoutStatus.REJECTED;

                  return (
                    <tr
                      key={payoutId}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/5 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium font-mono text-zinc-900 dark:text-zinc-100">
                        #{shortId}
                      </td>
                      <td className="px-6 py-4 font-semibold text-zinc-950 dark:text-white">
                        {amountFormatted}
                      </td>
                      <td
                        className="px-6 py-4 text-zinc-500 max-w-[280px] truncate"
                        title={bankSnapshotLabel}
                      >
                        {bankSnapshotLabel}
                      </td>
                      <td className="px-6 py-4 text-zinc-500">
                        {formattedDate}
                      </td>
                      <td className="px-6 py-4">
                        <PayoutStatusBadge status={payout.status} />
                      </td>
                      <td className="px-6 py-4 text-zinc-500">
                        {isRejected && payout.reject_reason ? (
                          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 text-xs border border-rose-100 dark:border-rose-950/30">
                            <Info className="h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2">
                              {payout.reject_reason}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Phân trang */}
        <div className="px-6 py-4 border-t flex justify-end">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>

      {/* Modal Yêu cầu rút tiền */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Tạo yêu cầu rút tiền
            </DialogTitle>
            <DialogDescription>
              Số tiền yêu cầu sẽ được phê duyệt bởi Ban quản trị và chuyển khoản
              trực tiếp.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleWithdrawSubmit} className="space-y-5">
            {/* Cấu hình thông tin ngân hàng nhận */}
            {bankInfo && (
              <div className="p-4 rounded-xl border bg-zinc-50 dark:bg-zinc-900/30 space-y-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Tài khoản thụ hưởng nhận tiền
                </span>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ngân hàng:</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {bankInfo.bank_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Số tài khoản:</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                      {bankInfo.account_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Chủ tài khoản:</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100 uppercase">
                      {bankInfo.account_holder}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-400 block mt-1.5">
                  * Nếu muốn đổi thông tin ngân hàng, vui lòng sửa tại Cài đặt
                  gian hàng.
                </span>
              </div>
            )}

            {/* Input số tiền */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="amount" className="font-medium">
                  Số tiền muốn rút (đ)
                </Label>
                <span className="text-xs text-zinc-500">
                  Khả dụng: {formattedAvailableBalance}
                </span>
              </div>
              <Input
                id="amount"
                type="number"
                placeholder="Nhập số tiền (ví dụ: 100000)"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isSubmitting}
                className="rounded-xl px-4 py-5"
                required
              />
              <span className="text-[11px] text-zinc-400 block">
                * Hạn mức rút tối thiểu là {formattedMinAmount}đ.
              </span>
            </div>

            {/* Hiển thị lỗi validation */}
            {validationError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-2 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-950/30">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Footer buttons */}
            <DialogFooter className="gap-2 sm:gap-0 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="rounded-xl py-5"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !withdrawAmount}
                className="rounded-xl py-5 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isSubmitting ? 'Đang gửi...' : 'Xác nhận gửi'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
