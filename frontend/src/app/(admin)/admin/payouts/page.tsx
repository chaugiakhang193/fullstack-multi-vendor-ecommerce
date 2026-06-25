'use client';

import React, { useState } from 'react';
import {
  Wallet,
  CheckCircle,
  AlertTriangle,
  Info,
  XOctagon,
  Filter,
} from 'lucide-react';
import {
  useAdminPayoutsList,
  useApprovePayout,
  useRejectPayout,
} from '@/hooks/useAdminPayouts';
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
import {
  RejectPayoutBody,
  PAYOUT_STATE_MACHINE,
  type AdminPayoutItemType,
} from '@/schemaValidations/payouts/payouts.schema';
import { PayoutStatus } from '@/constants/enum.generated';

// Bộ lọc trạng thái server-side cho danh sách admin
type PayoutFilter = PayoutStatus | 'all';
const PAYOUT_FILTER_OPTIONS: { value: PayoutFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: PayoutStatus.PENDING, label: 'Chờ duyệt' },
  { value: PayoutStatus.COMPLETED, label: 'Đã duyệt' },
  { value: PayoutStatus.REJECTED, label: 'Từ chối' },
];

export default function AdminPayoutsPage() {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [filterStatus, setFilterStatus] = useState<PayoutFilter>('all');

  // States cho modal duyệt / từ chối
  const [selectedPayout, setSelectedPayout] =
    useState<AdminPayoutItemType | null>(null);
  const [isApproveOpen, setIsApproveOpen] = useState<boolean>(false);
  const [isRejectOpen, setIsRejectOpen] = useState<boolean>(false);

  const [rejectReason, setRejectReason] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // 1. Fetch danh sách payouts phía Admin (lọc trạng thái server-side)
  const statusParam = filterStatus === 'all' ? undefined : filterStatus;
  const { data: payoutsData, isLoading: isListLoading } = useAdminPayoutsList(
    currentPage,
    statusParam,
  );
  const payoutsList = payoutsData?.data;
  const items = payoutsList?.items || [];
  const totalPages = payoutsList?.meta?.totalPages || 1;

  // 2. Hook xử lý phê duyệt
  const { mutate: approvePayout, isPending: isApproving } = useApprovePayout({
    onSuccess: () => {
      setIsApproveOpen(false);
      setSelectedPayout(null);
    },
  });

  // 3. Hook xử lý từ chối
  const { mutate: rejectPayout, isPending: isRejecting } = useRejectPayout({
    onSuccess: () => {
      setIsRejectOpen(false);
      setSelectedPayout(null);
      setRejectReason('');
      setValidationError(null);
    },
  });

  // Xử lý thay đổi số trang
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Đổi bộ lọc trạng thái — reset về trang 1 để tránh lệch phân trang
  const handleFilterChange = (next: PayoutFilter) => {
    setFilterStatus(next);
    setCurrentPage(1);
  };

  // Mở modal duyệt rút tiền
  const handleOpenApprove = (payout: AdminPayoutItemType) => {
    setSelectedPayout(payout);
    setIsApproveOpen(true);
  };

  // Mở modal từ chối rút tiền
  const handleOpenReject = (payout: AdminPayoutItemType) => {
    setSelectedPayout(payout);
    setIsRejectOpen(true);
    setValidationError(null);
  };

  // Submit phê duyệt
  const handleConfirmApprove = () => {
    if (!selectedPayout) return;
    const targetId = selectedPayout.id;
    approvePayout(targetId);
  };

  // Submit từ chối
  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validate dữ liệu bằng Zod schema
    const validationResult = RejectPayoutBody.safeParse({
      reason: rejectReason,
    });

    if (!validationResult.success) {
      const firstError =
        validationResult.error.errors[0]?.message ||
        'Lý do từ chối không hợp lệ.';
      setValidationError(firstError);
      return;
    }

    if (!selectedPayout) return;
    const targetId = selectedPayout.id;
    const payload = {
      payoutId: targetId,
      body: { reason: rejectReason },
    };
    rejectPayout(payload);
  };

  if (isListLoading && items.length === 0) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-5 w-96 rounded-lg" />
        </div>
        <div className="rounded-2xl border p-6 space-y-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">
          Duyệt rút tiền (Admin)
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Xem xét các yêu cầu rút tiền của người bán, đối soát tài khoản và xác
          nhận chuyển khoản.
        </p>
      </div>

      {/* Bộ lọc & Danh sách */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-6 py-5 border-b flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-zinc-50/50 dark:bg-zinc-900/10">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight">
              Danh sách yêu cầu
            </h3>
            <p className="text-xs text-zinc-500">
              Đối soát và duyệt giao dịch tài chính cho đối tác.
            </p>
          </div>

          {/* Lọc trạng thái server-side */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-400 shrink-0" />
            <div className="inline-flex rounded-lg border p-1 bg-zinc-100/50 dark:bg-zinc-900/50 text-xs">
              {PAYOUT_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleFilterChange(option.value)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    filterStatus === option.value
                      ? 'bg-white shadow-xs text-zinc-900 dark:bg-zinc-800 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border-dashed">
            <div className="p-4 rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-950 mb-3">
              <Wallet className="h-8 w-8" />
            </div>
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Không tìm thấy yêu cầu nào
            </h4>
            <p className="text-sm text-zinc-500 max-w-xs mt-1">
              {filterStatus === 'all'
                ? 'Không có yêu cầu rút tiền nào trên hệ thống.'
                : 'Không có yêu cầu nào phù hợp với bộ lọc đã chọn.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse text-left">
              <thead>
                <tr className="border-b bg-zinc-100/40 text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400">
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Cửa hàng
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Số tiền yêu cầu
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Tài khoản thụ hưởng
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Thời gian yêu cầu
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((payout) => {
                  const payoutId = payout.id;
                  const shopName = payout.shop?.name || 'Không rõ tên Shop';
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

                  const allowedTransitions =
                    PAYOUT_STATE_MACHINE[payout.status] || [];
                  const canApprove = allowedTransitions.includes(
                    PayoutStatus.COMPLETED,
                  );
                  const canReject = allowedTransitions.includes(
                    PayoutStatus.REJECTED,
                  );
                  const isPending = canApprove || canReject;

                  return (
                    <tr
                      key={payoutId}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/5 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {shopName}
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
                      <td className="px-6 py-4 text-right">
                        {isPending ? (
                          <div className="flex justify-end items-center gap-2">
                            {/* Nút từ chối */}
                            <Button
                              onClick={() => handleOpenReject(payout)}
                              size="sm"
                              variant="outline"
                              className="rounded-lg text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 dark:text-rose-400 dark:border-rose-950 dark:hover:bg-rose-950/20"
                            >
                              Từ chối
                            </Button>
                            {/* Nút duyệt */}
                            <Button
                              onClick={() => handleOpenApprove(payout)}
                              size="sm"
                              className="rounded-lg text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-xs"
                            >
                              Duyệt chi
                            </Button>
                          </div>
                        ) : payout.status === PayoutStatus.REJECTED &&
                          payout.reject_reason ? (
                          <span className="text-xs text-rose-500 dark:text-rose-400 block text-right font-medium italic truncate max-w-[180px]">
                            Từ chối: {payout.reject_reason}
                          </span>
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

      {/* Confirm Modal Phê duyệt */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <CheckCircle className="h-5.5 w-5.5 text-emerald-600 dark:text-emerald-400" />
              Xác nhận duyệt rút tiền
            </DialogTitle>
            <DialogDescription>
              Hãy chắc chắn rằng bạn đã thực hiện chuyển tiền thủ công cho đối
              tác qua app ngân hàng trước khi xác nhận.
            </DialogDescription>
          </DialogHeader>

          {selectedPayout && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border bg-zinc-50 dark:bg-zinc-900/30 space-y-2.5 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-zinc-500">Cửa hàng yêu cầu:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedPayout.shop?.name}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-zinc-500">Số tiền chuyển:</span>
                  <span className="font-bold text-zinc-950 dark:text-white text-base">
                    {formatVnd.format(selectedPayout.amount)}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    Tài khoản đích nhận tiền
                  </span>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ngân hàng:</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedPayout.bank_info_snapshot?.bank_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Số tài khoản:</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                      {selectedPayout.bank_info_snapshot?.account_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Chủ tài khoản:</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100 uppercase">
                      {selectedPayout.bank_info_snapshot?.account_holder}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-800 text-xs flex items-start gap-2.5 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-950/30">
                <Info className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <span>
                  Hành động này sẽ thay đổi trạng thái lệnh rút tiền thành{' '}
                  <strong>Đã chuyển khoản</strong>. Hệ thống sẽ gửi email và
                  thông báo real-time cho người bán. Không thể hoàn tác.
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsApproveOpen(false)}
              disabled={isApproving}
              className="rounded-xl py-5"
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              onClick={handleConfirmApprove}
              disabled={isApproving}
              className="rounded-xl py-5 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isApproving ? 'Đang duyệt...' : 'Đã chuyển tiền, Duyệt ngay'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal Từ chối */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <XOctagon className="h-5.5 w-5.5 text-rose-600 dark:text-rose-400" />
              Từ chối yêu cầu rút tiền
            </DialogTitle>
            <DialogDescription>
              Hãy cung cấp lý do từ chối rõ ràng để gửi cho người bán. Tiền bị
              treo sẽ được hoàn về ví khả dụng của họ.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmReject} className="space-y-5">
            {selectedPayout && (
              <div className="flex justify-between border-b pb-3 text-sm">
                <span className="text-zinc-500">Yêu cầu từ Shop:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedPayout.shop?.name} (
                  {formatVnd.format(selectedPayout.amount)})
                </span>
              </div>
            )}

            {/* Input lý do từ chối */}
            <div className="space-y-2">
              <Label htmlFor="reason" className="font-medium">
                Lý do từ chối
              </Label>
              <Input
                id="reason"
                placeholder="Nhập lý do từ chối (ví dụ: Thông tin tài khoản thụ hưởng không chính xác...)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={isRejecting}
                className="rounded-xl px-4 py-5"
                required
              />
            </div>

            {/* Lỗi validation */}
            {validationError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-2 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-950/30">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRejectOpen(false)}
                disabled={isRejecting}
                className="rounded-xl py-5"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                disabled={isRejecting || !rejectReason}
                className="rounded-xl py-5 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
              >
                {isRejecting ? 'Đang từ chối...' : 'Từ chối rút tiền'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
