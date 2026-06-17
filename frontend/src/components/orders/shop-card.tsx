import { type ChangeEvent } from "react";
import Image from "next/image";
import { ShoppingBag, AlertTriangle, Tag, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatVnd } from "@/lib/format";
import type { PreviewShopType } from "@/schemaValidations/orders/orders.schema";

interface ShopCardProps {
  shop: PreviewShopType;
  couponInput: string;
  appliedCoupon: string;
  onCouponInputChange: (value: string) => void;
  onApplyCoupon: () => void;
  onClearCoupon: () => void;
  onSelectFromWallet?: () => void;
  couponError?: string;
}

export function ShopCard({
  shop,
  couponInput,
  appliedCoupon,
  onCouponInputChange,
  onApplyCoupon,
  onClearCoupon,
  onSelectFromWallet,
  couponError,
}: ShopCardProps) {
  const shopSubtotal = shop.shopSubtotal;
  const shippingFee = shop.shippingFee;
  const freeshipNeeded = shop.freeship_upsell_needed;
  const hasFreeshipUpsell =
    typeof freeshipNeeded === "number" && freeshipNeeded > 0;
  const shippingLabel = shippingFee > 0 ? formatVnd.format(shippingFee) : "Miễn phí";
  const isCouponInputEmpty = !couponInput.trim();

  const handleCouponInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onCouponInputChange(value);
  };

  return (
    <section className="bg-card border rounded-xl p-6 shadow-xs space-y-4">
      <div className="flex items-center gap-2 border-b pb-3">
        <ShoppingBag className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        <h3 className="font-bold text-foreground">{shop.shopName}</h3>
      </div>

      {/* Items */}
      <div className="space-y-4">
        {shop.items.map((item) => {
          const itemKey = `${item.productId}_${item.variantId ?? "none"}`;
          const unitPrice = item.price;
          const quantity = item.quantity;
          const lineTotal = unitPrice * quantity;
          const thumbnailUrl = item.productThumbnail;
          return (
            <div key={itemKey} className="flex gap-3">
              <div className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border bg-muted">
                {thumbnailUrl ? (
                  <Image
                    src={thumbnailUrl}
                    alt={item.productName}
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
                  {item.productName}
                </p>
                {item.variantName && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.variantName}
                  </p>
                )}
                {item.stock_warning && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {item.stock_warning}
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

      {/* Shop coupon */}
      <div className="space-y-1.5 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground uppercase">Mã giảm giá cửa hàng</span>
          {onSelectFromWallet && (
            <button
              type="button"
              onClick={onSelectFromWallet}
              className="text-xs font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400"
            >
              Chọn từ ví
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={couponInput}
              onChange={handleCouponInputChange}
              placeholder="Mã giảm giá của shop"
              className="w-full h-9 pl-9 pr-3 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            />
          </div>
          {appliedCoupon ? (
            <Button variant="outline" size="sm" onClick={onClearCoupon}>
              Bỏ mã
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onApplyCoupon}
              disabled={isCouponInputEmpty}
            >
              Áp dụng
            </Button>
          )}
        </div>
        {couponError && (
          <p className="text-xs font-semibold text-rose-500 mt-1">
            {couponError}
          </p>
        )}
      </div>
      {appliedCoupon && (
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Đã áp dụng mã &quot;{appliedCoupon}&quot;
        </p>
      )}

      {/* Shop footer */}
      <div className="border-t pt-3 space-y-1 text-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Tạm tính</span>
          <span className="font-medium text-foreground">
            {formatVnd.format(shopSubtotal)}
          </span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Truck className="h-4 w-4" /> Phí vận chuyển
          </span>
          <span className="font-medium text-foreground">{shippingLabel}</span>
        </div>
        {hasFreeshipUpsell && (
          <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">
            Mua thêm {formatVnd.format(freeshipNeeded)} để được miễn phí vận chuyển!
          </p>
        )}
      </div>
    </section>
  );
}
