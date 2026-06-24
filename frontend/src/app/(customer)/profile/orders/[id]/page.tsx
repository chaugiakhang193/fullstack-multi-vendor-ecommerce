'use client';

import { useState } from 'react';
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
  CreditCard,
  Store,
  X,
} from 'lucide-react';

import { getErrorMessage } from '@/lib/http';
import {
  useCustomerOrderDetail,
  useCancelSubOrder,
} from '@/hooks/useCustomerOrders';
import { type CustomerOrderSubOrderType } from '@/schemaValidations/orders/orders.schema';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OrderStatusTimeline } from '@/components/orders/order-status-timeline';
import { LiveTrackingMap } from '@/components/orders/live-tracking-map';
import { OrderStatusBadge } from '@/components/orders/seller-order-status';
import { formatVnd, formatDateTime, shortId } from '@/lib/format';

export default function CustomerOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [cancelTarget, setCancelTarget] =
    useState<CustomerOrderSubOrderType | null>(null);

  const detailQuery = useCustomerOrderDetail(id);

  const cancelMutation = useCancelSubOrder(id, {
    onSettled: () => setCancelTarget(null),
  });

  const handleConfirmCancel = () => {
    if (!cancelTarget) return;
    cancelMutation.mutate(cancelTarget.id);
  };

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      render={<Link href="/profile/orders" />}
      className="mb-2"
    >
      <ArrowLeft className="h-4 w-4" /> Đơn hàng của tôi
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
    return (
      <div className="space-y-4">
        {backButton}
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-card p-8 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {detailQuery.error
            ? getErrorMessage(detailQuery.error)
            : 'Không tìm thấy đơn hàng.'}
        </div>
      </div>
    );
  }

  const order = detailQuery.data.data;
  const orderNumber = order.order_number ?? shortId(order.id);
  const address = order.shipping_address;
  const subOrders = order.sub_orders ?? [];
  const grandTotal = order.total_amount ?? 0;
  const paymentLabel =
    order.payment_method === 'cod' || !order.payment_method
      ? 'Thanh toán khi nhận hàng (COD)'
      : order.payment_method;

  const cancelTargetName = cancelTarget
    ? (cancelTarget.shop?.name ?? shortId(cancelTarget.id))
    : '';

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        {backButton}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Đơn hàng {orderNumber}
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Đặt lúc {formatDateTime(order.created_at)}
        </p>
      </div>

      {/* Địa chỉ + thanh toán */}
      <div className="grid sm:grid-cols-2 gap-4">
        {address && (
          <section className="rounded-xl border bg-card p-6 shadow-xs space-y-2">
            <h2 className="text-base font-black text-foreground flex items-center gap-2 border-b pb-3">
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

        <section className="rounded-xl border bg-card p-6 shadow-xs space-y-3">
          <h2 className="text-base font-black text-foreground flex items-center gap-2 border-b pb-3">
            <CreditCard className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            Thanh toán
          </h2>
          <p className="text-sm text-foreground/80">{paymentLabel}</p>
          <div className="flex items-center justify-between border-t pt-3">
            <span className="font-black text-foreground">Tổng cộng</span>
            <span className="text-lg font-black text-violet-600 dark:text-violet-400">
              {formatVnd.format(grandTotal)}
            </span>
          </div>
        </section>
      </div>

      {/* Danh sách sub-order */}
      <div className="space-y-6">
        {subOrders.map((subOrder) => {
          const items = subOrder.items ?? [];
          const subTotal = subOrder.sub_total ?? 0;
          const shippingFee = subOrder.shipping_fee ?? 0;
          const discount = subOrder.discount_amount ?? 0;
          const subGrandTotal =
            subOrder.total_amount ?? subTotal + shippingFee - discount;
          const shopName = subOrder.shop?.name ?? 'Cửa hàng';
          const canCancel = subOrder.status === 'pending';
          const isCancelling =
            cancelMutation.isPending && cancelTarget?.id === subOrder.id;

          return (
            <section
              key={subOrder.id}
              className="rounded-xl border bg-card shadow-xs overflow-hidden"
            >
              {/* Header sub-order */}
              <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span className="font-bold text-foreground truncate">
                    {shopName}
                  </span>
                </div>
                <OrderStatusBadge status={subOrder.status} />
              </div>

              {/* Timeline */}
              <div className="px-6 pt-5">
                <OrderStatusTimeline status={subOrder.status} />
              </div>

              {/* Live-Tracking Map — chỉ khi sub-order đang giao */}
              {subOrder.status === 'shipping' && (
                <div className="px-6 pt-4">
                  <LiveTrackingMap
                    id={subOrder.id}
                    originLabel={shopName}
                    destinationLabel={address?.recipient_name}
                    shopLat={subOrder.shop?.lat}
                    shopLng={subOrder.shop?.lng}
                    userLat={address?.lat}
                    userLng={address?.lng}
                  />
                </div>
              )}

              {/* Items */}
              <div className="px-6 py-5 space-y-4">
                {items.map((item) => {
                  const unitPrice = item.price_at_purchase ?? 0;
                  const quantity = item.quantity ?? 0;
                  return (
                    <div key={item.id} className="flex gap-3">
                      <div className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border bg-muted">
                        {item.product_thumbnail ? (
                          <Image
                            src={item.product_thumbnail}
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
                            {formatVnd.format(unitPrice * quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer: tổng tiền + nút hủy */}
              <div className="border-t bg-muted/20 px-6 py-4 space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Tạm tính</span>
                  <span className="text-foreground">
                    {formatVnd.format(subTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Phí vận chuyển</span>
                  <span className="text-foreground">
                    {shippingFee > 0
                      ? formatVnd.format(shippingFee)
                      : 'Miễn phí'}
                  </span>
                </div>
                {discount > 0 && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Giảm giá</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      - {formatVnd.format(discount)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-black text-foreground">Thành tiền</span>
                  <span className="font-black text-violet-600 dark:text-violet-400">
                    {formatVnd.format(subGrandTotal)}
                  </span>
                </div>

                <div className="flex justify-end pt-2">
                  {canCancel ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={cancelMutation.isPending}
                      onClick={() => setCancelTarget(subOrder)}
                    >
                      {isCancelling ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      Hủy đơn
                    </Button>
                  ) : subOrder.status === 'processing' ||
                    subOrder.status === 'shipping' ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          title="Đơn hàng đang được shop xử lý, không thể tự hủy"
                        >
                          Không thể hủy
                        </Button>
                        {subOrder.shop?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            render={
                              <Link href={`/shops/${subOrder.shop.id}`} />
                            }
                          >
                            <Store className="h-4 w-4" /> Liên hệ Shop
                          </Button>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Đơn đang được shop xử lý — vui lòng liên hệ shop để hủy.
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Confirm cancel dialog */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy đơn hàng?</DialogTitle>
            <DialogDescription>
              Bạn chắc chắn muốn hủy đơn của shop{' '}
              <span className="font-bold text-foreground">
                {cancelTargetName}
              </span>
              ? Tồn kho sẽ được hoàn lại và hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelMutation.isPending}
            >
              Quay lại
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={handleConfirmCancel}
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang hủy...
                </>
              ) : (
                'Xác nhận hủy'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
