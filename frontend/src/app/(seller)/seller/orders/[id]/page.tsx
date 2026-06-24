'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Package,
  ShoppingBag,
  AlertTriangle,
} from 'lucide-react';

// API
import { getErrorMessage } from '@/lib/http';

// Hooks
import {
  useSellerOrderDetail,
  useUpdateSellerOrderStatus,
} from '@/hooks/useSellerOrders';
import {
  type OrderStatusType,
  ORDER_STATUS_LABELS,
} from '@/schemaValidations/orders/orders.schema';

// Components
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OrderStatusTimeline } from '@/components/orders/order-status-timeline';
import {
  OrderStatusBadge,
  getTransitions,
} from '@/components/orders/seller-order-status';
import { formatVnd, formatDateTime, shortId } from '@/lib/format';

export default function SellerOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [pendingTransition, setPendingTransition] = useState<{
    to: OrderStatusType;
    label: string;
  } | null>(null);

  const detailQuery = useSellerOrderDetail(id);

  const updateMutation = useUpdateSellerOrderStatus({
    onSettled: () => setPendingTransition(null),
  });

  // ===== Handlers =====
  const handleAction = (to: OrderStatusType, label: string) => {
    setPendingTransition({ to, label });
  };

  const handleCloseDialog = () => setPendingTransition(null);

  const handleConfirm = () => {
    if (pendingTransition) {
      updateMutation.mutate({ id, body: { status: pendingTransition.to } });
    }
  };

  const backLink = (
    <Button
      variant="ghost"
      size="sm"
      render={<Link href="/seller/orders" />}
      className="mb-2"
    >
      <ArrowLeft className="h-4 w-4" /> Danh sách đơn hàng
    </Button>
  );

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-24 bg-muted rounded-xl" />
        <div className="h-72 bg-muted rounded-xl" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const errorMessage = detailQuery.error
      ? getErrorMessage(detailQuery.error)
      : 'Không tìm thấy đơn hàng.';
    return (
      <div className="space-y-4">
        {backLink}
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-card p-8 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {errorMessage}
        </div>
      </div>
    );
  }

  const order = detailQuery.data.data;
  const status = order.status;
  const address = order.order?.shipping_address;
  const orderNumber = order.order?.order_number ?? shortId(order.id);
  const items = order.items ?? [];
  const subTotal = order.sub_total ?? 0;
  const shippingFee = order.shipping_fee ?? 0;
  const discount = order.discount_amount ?? 0;
  const grandTotal = order.total_amount ?? subTotal - discount + shippingFee;
  const shippingLabel =
    shippingFee > 0 ? formatVnd.format(shippingFee) : 'Miễn phí';
  const transitions = getTransitions(status);
  const createdAtLabel = formatDateTime(order.created_at);
  const itemCount = items.length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        {backLink}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Đơn hàng {orderNumber}
          </h1>
          <OrderStatusBadge status={status} />
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Đặt lúc {createdAtLabel}
        </p>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <OrderStatusTimeline status={status} />
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left: items */}
        <div className="lg:col-span-8 space-y-6">
          <section className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
            <h2 className="text-lg font-black text-foreground flex items-center gap-2 border-b pb-3">
              <Package className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              Sản phẩm ({itemCount})
            </h2>
            <div className="space-y-4">
              {items.map((item) => {
                const unitPrice = item.price_at_purchase ?? 0;
                const quantity = item.quantity ?? 0;
                const lineTotal = unitPrice * quantity;
                const thumbnailUrl = item.product_thumbnail;
                return (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border bg-muted">
                      {thumbnailUrl ? (
                        <Image
                          src={thumbnailUrl}
                          alt={item.product_name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ShoppingBag className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground line-clamp-2">
                        {item.product_name}
                      </p>
                      {item.variant_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.variant_name}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatVnd.format(unitPrice)} × {quantity}
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {formatVnd.format(lineTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Shipping address */}
          {address && (
            <section className="rounded-xl border bg-card p-6 shadow-xs space-y-2">
              <h2 className="text-lg font-black text-foreground flex items-center gap-2 border-b pb-3">
                <MapPin className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                Địa chỉ giao hàng
              </h2>
              <p className="font-bold text-foreground">
                {address.recipient_name}
              </p>
              <p className="text-sm text-muted-foreground">{address.phone}</p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {address.address_line}
              </p>
            </section>
          )}
        </div>

        {/* Right: summary + actions */}
        <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
          <section className="rounded-xl border bg-card p-6 shadow-xs space-y-3">
            <h2 className="text-base font-black text-foreground border-b pb-3">
              Thanh toán
            </h2>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Tạm tính</span>
              <span className="font-medium text-foreground">
                {formatVnd.format(subTotal)}
              </span>
            </div>
            {discount > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Giảm giá</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  −{formatVnd.format(discount)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Phí vận chuyển</span>
              <span className="font-medium text-foreground">
                {shippingLabel}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <span className="font-black text-foreground">Tổng cộng</span>
              <span className="text-lg font-black text-violet-600 dark:text-violet-400">
                {formatVnd.format(grandTotal)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Thanh toán khi nhận hàng (COD)
            </p>
          </section>

          {transitions.length > 0 && (
            <section className="rounded-xl border bg-card p-6 shadow-xs space-y-3">
              <h2 className="text-base font-black text-foreground">
                Cập nhật trạng thái
              </h2>
              <div className="flex flex-col gap-2">
                {transitions.map((transition) => {
                  const Icon = transition.icon;
                  const targetStatus = transition.to;
                  const buttonVariant =
                    transition.tone === 'danger' ? 'destructive' : 'default';
                  const handleClickAction = () => {
                    handleAction(targetStatus, transition.label);
                  };
                  return (
                    <Button
                      key={targetStatus}
                      variant={buttonVariant}
                      className="w-full justify-center"
                      disabled={updateMutation.isPending}
                      onClick={handleClickAction}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                      {transition.label}
                    </Button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Confirm status change dialog */}
      <Dialog
        open={!!pendingTransition}
        onOpenChange={(open) => !open && handleCloseDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận thay đổi trạng thái?</DialogTitle>
            <DialogDescription>
              Bạn có đồng ý chuyển trạng thái đơn{' '}
              <span className="font-bold text-foreground">{orderNumber}</span>{' '}
              từ{' '}
              <span className="font-bold text-foreground">
                {ORDER_STATUS_LABELS[status]}
              </span>{' '}
              sang{' '}
              <span className="font-bold text-foreground">
                {pendingTransition?.to
                  ? ORDER_STATUS_LABELS[pendingTransition.to]
                  : ''}
              </span>
              ?
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
              variant={
                pendingTransition?.to === 'cancelled'
                  ? 'destructive'
                  : 'default'
              }
              disabled={updateMutation.isPending}
              onClick={handleConfirm}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang xử lý...
                </>
              ) : (
                'Xác nhận'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
