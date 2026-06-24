'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Eye, Loader2, Package, AlertTriangle } from 'lucide-react';

// API
import { getErrorMessage } from '@/lib/http';

// Hooks
import {
  useSellerOrdersList,
  useUpdateSellerOrderStatus,
} from '@/hooks/useSellerOrders';
import { cn } from '@/lib/utils';
import {
  type OrderStatusType,
  type SellerOrderType,
  ORDER_STATUS_LABELS,
} from '@/schemaValidations/orders/orders.schema';

// Components
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  OrderStatusBadge,
  getTransitions,
} from '@/components/orders/seller-order-status';
import { formatVnd, formatDateTime, shortId } from '@/lib/format';

const LIMIT = 10;

const TABS: { label: string; value: OrderStatusType | 'all' }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Chờ xác nhận', value: 'pending' },
  { label: 'Đang xử lý', value: 'processing' },
  { label: 'Đang giao', value: 'shipping' },
  { label: 'Đã giao', value: 'delivered' },
  { label: 'Đã hủy', value: 'cancelled' },
];

// Số thực thu seller = total_amount snapshot (đã trừ giảm giá). Fallback cho row cũ.
function subOrderAmount(order: SellerOrderType): number {
  return (
    order.total_amount ?? (order.sub_total ?? 0) + (order.shipping_fee ?? 0)
  );
}

export default function SellerOrdersPage() {
  const [activeTab, setActiveTab] = useState<OrderStatusType | 'all'>('all');
  const [page, setPage] = useState(1);
  const [actingId, setActingId] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{
    order: SellerOrderType;
    to: OrderStatusType;
  } | null>(null);

  const listQuery = useSellerOrdersList(activeTab, page);

  const updateMutation = useUpdateSellerOrderStatus({
    onSettled: () => {
      setActingId(null);
      setPendingTransition(null);
    },
  });

  // ===== Handlers =====
  // Mọi chuyển trạng thái (kể cả Hủy) đều qua modal xác nhận trước khi mutate.
  const handleAction = (order: SellerOrderType, to: OrderStatusType) => {
    setPendingTransition({ order, to });
  };

  const handleTabChange = (value: OrderStatusType | 'all') => {
    setActiveTab(value);
    setPage(1);
  };

  const handleCloseDialog = () => {
    setPendingTransition(null);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) setPendingTransition(null);
  };

  const handleConfirmTransition = () => {
    if (!pendingTransition) return;
    setActingId(pendingTransition.order.id);
    updateMutation.mutate({
      id: pendingTransition.order.id,
      body: { status: pendingTransition.to },
    });
  };

  const orders = listQuery.data?.data.items ?? [];
  const meta = listQuery.data?.data.meta;
  const isCancelTransition = pendingTransition?.to === 'cancelled';
  const pendingOrderNumber =
    pendingTransition?.order?.order?.order_number ??
    shortId(pendingTransition?.order?.id ?? '');
  const pendingFromLabel = pendingTransition
    ? ORDER_STATUS_LABELS[pendingTransition.order.status]
    : '';
  const pendingToLabel = pendingTransition
    ? ORDER_STATUS_LABELS[pendingTransition.to]
    : '';

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Quản lý Đơn hàng
        </h1>
        <p className="text-muted-foreground text-base mt-2">
          Theo dõi, xác nhận và xử lý đơn đặt hàng từ khách hàng của bạn.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 border-b gap-3 scrollbar-none">
        {TABS.map((tab) => {
          const isActive = tab.value === activeTab;
          const handleClickTab = () => {
            const value = tab.value;
            handleTabChange(value);
          };
          const tabClassName = cn(
            'whitespace-nowrap px-5 py-3 text-base font-bold rounded-t-xl transition border-b-2',
            isActive
              ? 'border-violet-600 text-violet-600 bg-violet-50/40 dark:bg-violet-950/20'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          );
          return (
            <button
              key={tab.value}
              onClick={handleClickTab}
              className={tabClassName}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {listQuery.isLoading ? (
        <div className="rounded-xl border bg-card p-16 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
        </div>
      ) : listQuery.isError ? (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-card p-8 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {getErrorMessage(listQuery.error)}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Package className="w-8 h-8" />}
          title="Chưa có đơn hàng nào"
          description="Khi khách hàng đặt hàng, đơn sẽ xuất hiện ở đây."
        />
      ) : (
        <>
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs font-bold text-muted-foreground uppercase">
                    <th className="p-6">Mã đơn</th>
                    <th className="p-6">Khách hàng</th>
                    <th className="p-6">Ngày đặt</th>
                    <th className="p-6 text-right">Thực thu</th>
                    <th className="p-6 text-center">Trạng thái</th>
                    <th className="p-6 text-center w-[220px]">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-base">
                  {orders.map((order) => {
                    const recipient =
                      order.order?.shipping_address?.recipient_name ?? '—';
                    const orderNumber =
                      order.order?.order_number ?? shortId(order.id);
                    const status = order.status;
                    const transitions = getTransitions(status);
                    const isActing = actingId === order.id;
                    const createdAtLabel = formatDateTime(order.created_at);
                    const amount = subOrderAmount(order);
                    const detailHref = `/seller/orders/${order.id}`;
                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-6 font-bold text-violet-600 dark:text-violet-400">
                          {orderNumber}
                        </td>
                        <td className="p-6 font-bold text-foreground">
                          {recipient}
                        </td>
                        <td className="p-6 text-sm text-muted-foreground">
                          {createdAtLabel}
                        </td>
                        <td className="p-6 text-right font-black text-foreground">
                          {formatVnd.format(amount)}
                        </td>
                        <td className="p-6 text-center">
                          <OrderStatusBadge status={status} />
                        </td>
                        <td className="p-6">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Chi tiết"
                              render={<Link href={detailHref} />}
                            >
                              <Eye className="h-5 w-5" />
                            </Button>
                            {transitions.map((transition) => {
                              const Icon = transition.icon;
                              const targetStatus = transition.to;
                              const buttonVariant =
                                transition.tone === 'danger'
                                  ? 'destructive'
                                  : 'secondary';
                              const handleClickAction = () => {
                                handleAction(order, targetStatus);
                              };
                              return (
                                <Button
                                  key={targetStatus}
                                  variant={buttonVariant}
                                  size="sm"
                                  title={transition.label}
                                  disabled={isActing}
                                  onClick={handleClickAction}
                                >
                                  {isActing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Icon className="h-4 w-4" />
                                  )}
                                  <span className="hidden xl:inline">
                                    {transition.label}
                                  </span>
                                </Button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {meta && (
            <Pagination
              currentPage={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* Confirm status change dialog (mọi transition, kể cả Hủy) */}
      <Dialog open={!!pendingTransition} onOpenChange={handleDialogOpenChange}>
        {pendingTransition && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isCancelTransition
                  ? 'Hủy đơn hàng?'
                  : 'Xác nhận thay đổi trạng thái?'}
              </DialogTitle>
              <DialogDescription>
                {isCancelTransition ? (
                  <>
                    Hành động này sẽ hoàn kho và không thể hoàn tác. Bạn chắc
                    chắn muốn hủy đơn{' '}
                    <span className="font-bold text-foreground">
                      {pendingOrderNumber}
                    </span>
                    ?
                  </>
                ) : (
                  <>
                    Bạn có đồng ý chuyển trạng thái đơn{' '}
                    <span className="font-bold text-foreground">
                      {pendingOrderNumber}
                    </span>{' '}
                    từ{' '}
                    <span className="font-bold text-foreground">
                      {pendingFromLabel}
                    </span>{' '}
                    sang{' '}
                    <span className="font-bold text-foreground">
                      {pendingToLabel}
                    </span>
                    ?
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-2">
              <Button
                variant="outline"
                onClick={handleCloseDialog}
                disabled={updateMutation.isPending}
              >
                Quay lại
              </Button>
              <Button
                variant={isCancelTransition ? 'destructive' : 'default'}
                disabled={updateMutation.isPending}
                onClick={handleConfirmTransition}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />{' '}
                    {isCancelTransition ? 'Đang hủy...' : 'Đang xử lý...'}
                  </>
                ) : isCancelTransition ? (
                  'Xác nhận hủy'
                ) : (
                  'Xác nhận'
                )}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
