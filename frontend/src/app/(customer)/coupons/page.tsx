'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Ticket,
  Loader2,
  Gift,
  Check,
  ShoppingBag,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

import { useBrowseCoupons, useClaimCoupon } from '@/hooks/useCoupons';
import { useAuthStore } from '@/store/useAuthStore';
import { CouponTypeObj } from '@/schemaValidations/promotions/coupons.schema';
import { CouponType, DiscountType } from '@/constants/enum';
import { formatVnd } from '@/lib/format';
import { Button } from '@/components/ui/button';

// Guard ở module scope: nhớ các coupon đã auto-claim trong phiên tab này.
// Sống sót qua remount/StrictMode (khác useRef bị reset khi component mount lại),
// nên mỗi claimCouponId chỉ auto-claim đúng MỘT lần → không bị double toast.
const autoClaimedIds = new Set<string>();

function CustomerCouponsContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Fetch claimable coupons. Backend tự gắn cờ is_claimed theo user đang đăng nhập
  // (guest → false), nên không cần tải ví để đối chiếu ở trang này.
  const {
    data: browseEnvelope,
    isLoading: isBrowseLoading,
    isError: isBrowseError,
    refetch,
  } = useBrowseCoupons({ limit: 100 });
  const coupons = browseEnvelope?.data?.items ?? [];

  const claimMutation = useClaimCoupon();

  const handleClaim = (coupon: CouponTypeObj) => {
    if (!isAuthenticated) {
      const redirectUrl = `/coupons?claimCouponId=${coupon.id}`;
      router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
      return;
    }
    claimMutation.mutate(coupon.id);
  };

  // Auto-claim logic after redirect back from login
  const claimCouponId = searchParams.get('claimCouponId');

  useEffect(() => {
    if (!claimCouponId) return;

    // Chưa đăng nhập → đẩy sang login rồi quay lại đúng trang claim sau khi đăng nhập.
    // (Không đánh dấu vào autoClaimedIds vì ta đang rời trang; quay lại vẫn cần claim.)
    if (!isAuthenticated) {
      const redirectUrl = `/coupons?claimCouponId=${claimCouponId}`;
      router.replace(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    // Đã đăng nhập: chỉ auto-claim MỘT lần cho mỗi coupon (guard sống sót qua remount).
    if (autoClaimedIds.has(claimCouponId)) return;
    autoClaimedIds.add(claimCouponId);

    // Dọn URL NGAY (trước khi mutate) để về /coupons sạch query và tránh claim lại khi F5.
    // Toast thành công / "đã nhận rồi" (backend 409) do useClaimCoupon xử lý ở mức hook.
    router.replace('/coupons', { scroll: false });
    claimMutation.mutate(claimCouponId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, claimCouponId]);

  const getDaysLeft = (endDateStr: string | null) => {
    if (!endDateStr) return 'Không giới hạn thời gian';
    const diffTime = new Date(endDateStr).getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Hết hạn';
    return `Còn lại ${diffDays} ngày`;
  };

  const isLoading = isBrowseLoading;

  return (
    <div className="max-w-7xl mx-auto py-10 space-y-8 min-h-[60vh] animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
          <Ticket className="h-8 w-8 text-violet-600 shrink-0" />
          Mã Khuyến Mãi
        </h1>
        <p className="text-sm text-muted-foreground font-semibold">
          Lưu các voucher hot từ sàn và cửa hàng để áp dụng giảm giá khi mua
          hàng.
        </p>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
        </div>
      ) : isBrowseError ? (
        <div className="text-center py-20 border rounded-2xl bg-card space-y-4">
          <AlertTriangle className="h-16 w-16 text-amber-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground">
              Không thể tải mã giảm giá
            </h3>
            <p className="text-sm text-muted-foreground">
              Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Thử lại
          </Button>
        </div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-20 border rounded-2xl bg-card space-y-4">
          <Ticket className="h-16 w-16 text-zinc-300 dark:text-zinc-700 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground">
              Không có mã giảm giá nào
            </h3>
            <p className="text-sm text-muted-foreground">
              Hiện tại chưa có chương trình khuyến mãi nào được phát hành.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {coupons.map((coupon) => {
            const isClaimed = coupon.is_claimed ?? false;
            const isPct = coupon.discount_type === DiscountType.PERCENTAGE;
            const discountLabel = isPct
              ? `Giảm ${coupon.discount_value}%`
              : `Giảm ${formatVnd.format(coupon.discount_value)}`;
            const isShop = coupon.type === CouponType.SHOP;
            const shopName = coupon.shop?.name ?? 'Mã toàn sàn';

            // Limit details
            const isFull = coupon.usage_limit
              ? coupon.used_count >= coupon.usage_limit
              : false;
            const daysLeft = getDaysLeft(coupon.end_date);

            // Chỉ coupon đang được claim mới quay spinner (tránh tất cả nút cùng loading)
            const isClaiming =
              claimMutation.isPending && claimMutation.variables === coupon.id;

            return (
              <div
                key={coupon.id}
                className="relative bg-card border rounded-xl shadow-xs hover:shadow-md transition-all duration-300 flex h-36 select-none overflow-hidden group border-zinc-200 dark:border-zinc-800"
              >
                {/* Left content (Details) */}
                <div className="flex-1 p-4 flex flex-col justify-between min-w-0 bg-gradient-to-br from-violet-50/40 via-background to-background dark:from-violet-950/10 dark:via-background dark:to-background">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isShop ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 max-w-[120px] truncate">
                          <ShoppingBag className="h-2.5 w-2.5 shrink-0" />
                          {shopName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 dark:bg-violet-950/30 dark:text-violet-400">
                          <Gift className="h-2.5 w-2.5 shrink-0" />
                          Toàn sàn
                        </span>
                      )}
                      <span className="text-[10px] font-semibold text-zinc-400">
                        {daysLeft}
                      </span>
                    </div>

                    <h3 className="text-base font-black text-zinc-800 dark:text-zinc-100 truncate mt-1">
                      {discountLabel}
                    </h3>
                    <p className="text-xs text-muted-foreground font-semibold">
                      Đơn tối thiểu{' '}
                      {formatVnd.format(coupon.min_order_value ?? 0)}
                    </p>
                    {isPct && coupon.max_discount_value && (
                      <p className="text-[10px] text-muted-foreground italic">
                        Giảm tối đa{' '}
                        {formatVnd.format(coupon.max_discount_value)}
                      </p>
                    )}
                  </div>

                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">
                    Code:{' '}
                    <span className="text-violet-600 dark:text-violet-400 font-extrabold">
                      {coupon.code}
                    </span>
                  </div>
                </div>

                {/* Perforated Divider & Circle cuts */}
                <div className="relative flex flex-col items-center justify-center w-4 h-full shrink-0">
                  {/* Top Circle Cut */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800" />
                  {/* Dashed Line */}
                  <div className="h-full border-r border-dashed border-zinc-200 dark:border-zinc-800" />
                  {/* Bottom Circle Cut */}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-6 h-6 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800" />
                </div>

                {/* Right content (Claim Action) */}
                <div className="w-28 flex flex-col items-center justify-center p-4 bg-muted/20 shrink-0 select-none group-hover:bg-muted/30 transition-colors">
                  {isClaimed ? (
                    <div className="flex flex-col items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <div className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                        <Check className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-black">Đã lưu</span>
                    </div>
                  ) : isFull ? (
                    <span className="text-xs font-bold text-muted-foreground">
                      Hết lượt
                    </span>
                  ) : (
                    <Button
                      onClick={() => handleClaim(coupon)}
                      disabled={isClaiming}
                      className="bg-violet-600 hover:bg-violet-700 text-white font-bold h-9 w-full rounded-lg text-xs"
                    >
                      {isClaiming ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Lưu mã'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CustomerCouponsBrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
        </div>
      }
    >
      <CustomerCouponsContent />
    </Suspense>
  );
}
