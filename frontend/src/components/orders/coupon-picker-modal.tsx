'use client';

import React, { useMemo } from 'react';
import {
  Ticket,
  Loader2,
  Gift,
  ShoppingBag,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';
import { useWalletCoupons } from '@/hooks/useCoupons';
import { CouponType, DiscountType } from '@/constants/enum';
import { formatVnd } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface CouponPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CouponType;
  shopId?: string;
  shopName?: string;
  totalAmount: number;
  selectedCouponCode: string;
  onSelect: (code: string) => void;
}

export function CouponPickerModal({
  open,
  onOpenChange,
  type,
  shopId,
  shopName,
  totalAmount,
  selectedCouponCode,
  onSelect,
}: CouponPickerModalProps) {
  // Fetch user claimed coupons from wallet
  const { data: walletEnvelope, isLoading } = useWalletCoupons(
    { limit: 100 },
    open,
  );
  const items = walletEnvelope?.data?.items ?? [];

  // Filter & sort coupons:
  // 1. Unused coupons only (is_used === false)
  // 2. Filter by type (GLOBAL or SHOP matching shopId)
  // 3. Not expired yet
  const couponsData = useMemo(() => {
    const now = new Date();
    const filtered = items.filter((item) => {
      // Must not be used
      if (item.is_used) return false;

      const coupon = item.coupon;
      // Must match type
      if (coupon.type !== type) return false;

      // If SHOP type, must match shopId
      if (type === CouponType.SHOP && coupon.shop?.id !== shopId) return false;

      // Must not be expired
      const endDate = coupon.end_date ? new Date(coupon.end_date) : null;
      if (endDate && now > endDate) return false;

      return true;
    });

    // Check applicability & sort: applicable first, then inapplicable
    return filtered
      .map((item) => {
        const isApplicable = totalAmount >= (item.coupon.min_order_value ?? 0);
        return { item, isApplicable };
      })
      .sort((a, b) => {
        if (a.isApplicable && !b.isApplicable) return -1;
        if (!a.isApplicable && b.isApplicable) return 1;
        return 0;
      });
  }, [items, type, shopId, totalAmount]);

  const handleSelect = (code: string) => {
    onSelect(code);
    onOpenChange(false);
  };

  const titleText =
    type === CouponType.GLOBAL
      ? 'Chọn Voucher Toàn Sàn'
      : `Chọn Voucher từ ${shopName || 'Cửa hàng'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg font-black text-foreground">
            <Ticket className="h-5 w-5 text-violet-500" />
            {titleText}
          </DialogTitle>
          <DialogDescription>
            Đơn hàng hiện tại:{' '}
            <span className="font-extrabold text-violet-600 dark:text-violet-400">
              {formatVnd.format(totalAmount)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[350px] overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-violet-500 animate-spin" />
            </div>
          ) : couponsData.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 space-y-2">
              <Ticket className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <p className="text-sm font-semibold">
                Không tìm thấy voucher nào khả dụng trong ví
              </p>
            </div>
          ) : (
            couponsData.map(({ item, isApplicable }) => {
              const coupon = item.coupon;
              const isPct = coupon.discount_type === DiscountType.PERCENTAGE;
              const discountLabel = isPct
                ? `Giảm ${coupon.discount_value}%`
                : `Giảm ${formatVnd.format(coupon.discount_value)}`;
              const isSelected = selectedCouponCode === coupon.code;
              const minVal = coupon.min_order_value ?? 0;
              const dateFormatted = coupon.end_date
                ? `HSD: ${new Date(coupon.end_date).toLocaleDateString('vi-VN')}`
                : 'HSD: Vô hạn';

              return (
                <div
                  key={item.id}
                  className={`relative bg-card border rounded-lg shadow-xs flex h-24 select-none overflow-hidden transition-all duration-200 border-zinc-200 dark:border-zinc-800 ${
                    !isApplicable ? 'opacity-55 cursor-not-allowed' : ''
                  } ${isSelected ? 'border-violet-500 ring-2 ring-violet-500/10' : ''}`}
                >
                  {/* Left part (Discount Info) */}
                  <div className="flex-1 p-3 flex flex-col justify-between min-w-0 bg-gradient-to-br from-violet-50/20 via-background to-background dark:from-violet-950/5 dark:via-background dark:to-background">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {type === CouponType.GLOBAL ? (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded-md bg-violet-100 text-violet-800 dark:bg-violet-950/30 dark:text-violet-400">
                            <Gift className="h-2 w-2" /> Toàn sàn
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 max-w-[100px] truncate">
                            <ShoppingBag className="h-2 w-2" /> Shop
                          </span>
                        )}
                        <span className="text-[9px] text-zinc-400 font-semibold">
                          {dateFormatted}
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-zinc-800 dark:text-zinc-100 mt-1 truncate">
                        {discountLabel}
                      </h4>
                      <p className="text-[10px] text-muted-foreground font-semibold">
                        Đơn tối thiểu {formatVnd.format(minVal)}
                      </p>
                    </div>
                  </div>

                  {/* Perforated Divider */}
                  <div className="relative flex flex-col items-center justify-center w-3 h-full shrink-0">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800" />
                    <div className="h-full border-r border-dashed border-zinc-200 dark:border-zinc-800" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-4 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800" />
                  </div>

                  {/* Right part (Button/Status) */}
                  <div className="w-24 flex flex-col items-center justify-center p-2 bg-muted/20 shrink-0">
                    {isSelected ? (
                      <div className="flex flex-col items-center gap-0.5 text-violet-600 dark:text-violet-400">
                        <Check className="h-4 w-4" />
                        <span className="text-[10px] font-black">
                          Đang chọn
                        </span>
                      </div>
                    ) : isApplicable ? (
                      <Button
                        size="xs"
                        onClick={() => handleSelect(coupon.code)}
                        className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-[10px]"
                      >
                        Áp dụng
                      </Button>
                    ) : (
                      <div className="flex flex-col items-center text-center text-rose-500 gap-0.5 p-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="text-[8px] font-bold leading-tight">
                          Chưa đủ đk
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t bg-muted/20 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
