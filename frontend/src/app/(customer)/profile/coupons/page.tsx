'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Ticket,
  Loader2,
  Calendar,
  Gift,
  ShoppingBag,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';

import { useWalletCoupons } from '@/hooks/useCoupons';
import { useAuthStore } from '@/store/useAuthStore';
import { CouponType, DiscountType } from '@/constants/enum';
import { formatVnd } from '@/lib/format';
import { Button } from '@/components/ui/button';

export default function CustomerProfileCouponsPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [activeTab, setActiveTab] = useState<'unused' | 'used' | 'expired'>(
    'unused',
  );

  // Fetch claimed coupons from wallet
  const { data: walletEnvelope, isLoading } = useWalletCoupons(
    { limit: 100 },
    isAuthenticated,
  );
  const items = walletEnvelope?.data?.items ?? [];

  // Group coupons by status
  const groupedCoupons = useMemo(() => {
    const now = new Date();
    const unused: typeof items = [];
    const used: typeof items = [];
    const expired: typeof items = [];

    items.forEach((item) => {
      if (item.is_used) {
        used.push(item);
      } else {
        const endDate = item.coupon.end_date
          ? new Date(item.coupon.end_date)
          : null;
        if (endDate && now > endDate) {
          expired.push(item);
        } else {
          unused.push(item);
        }
      }
    });

    return { unused, used, expired };
  }, [items]);

  const currentList = groupedCoupons[activeTab];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="h-5 w-5 text-violet-500" />
            Ví Voucher của tôi
          </h2>
          <p className="text-sm text-muted-foreground">
            Xem và quản lý tất cả các mã giảm giá bạn đã lưu.
          </p>
        </div>
        <Link href="/coupons">
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white font-semibold"
          >
            Tìm thêm voucher
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6">
        <button
          onClick={() => setActiveTab('unused')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all relative ${
            activeTab === 'unused'
              ? 'border-violet-600 text-violet-600 dark:text-violet-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Chưa sử dụng ({groupedCoupons.unused.length})
        </button>
        <button
          onClick={() => setActiveTab('used')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all relative ${
            activeTab === 'used'
              ? 'border-violet-600 text-violet-600 dark:text-violet-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Đã sử dụng ({groupedCoupons.used.length})
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all relative ${
            activeTab === 'expired'
              ? 'border-violet-600 text-violet-600 dark:text-violet-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Hết hạn ({groupedCoupons.expired.length})
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-violet-500 animate-spin" />
        </div>
      ) : currentList.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl space-y-3">
          <Ticket className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
          <p className="text-sm text-muted-foreground font-semibold">
            Không có mã giảm giá nào ở trạng thái này
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {currentList.map((item) => {
            const coupon = item.coupon;
            const isPct = coupon.discount_type === DiscountType.PERCENTAGE;
            const discountLabel = isPct
              ? `Giảm ${coupon.discount_value}%`
              : `Giảm ${formatVnd.format(coupon.discount_value)}`;
            const isShop = coupon.type === CouponType.SHOP;
            const shopName = coupon.shop?.name ?? 'Mã toàn sàn';
            const dateFormatted = coupon.end_date
              ? `Hạn dùng: ${new Date(coupon.end_date).toLocaleDateString('vi-VN')}`
              : 'Hạn dùng: Vô hạn';

            // Visual style modifications for inactive tabs
            const isInactive = activeTab !== 'unused';

            return (
              <div
                key={item.id}
                className={`relative bg-card border rounded-xl shadow-xs transition-all duration-300 flex h-32 select-none overflow-hidden border-zinc-200 dark:border-zinc-800 ${
                  isInactive ? 'opacity-65 grayscale-30' : ''
                }`}
              >
                {/* Details Section */}
                <div className="flex-1 p-4 flex flex-col justify-between min-w-0 bg-gradient-to-br from-violet-50/20 via-background to-background dark:from-violet-950/5 dark:via-background dark:to-background">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isShop ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 max-w-[100px] truncate">
                          <ShoppingBag className="h-2 w-2 shrink-0" />
                          {shopName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 dark:bg-violet-950/30 dark:text-violet-400">
                          <Gift className="h-2 w-2 shrink-0" />
                          Toàn sàn
                        </span>
                      )}
                      <span className="text-[9px] font-semibold text-zinc-400 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {dateFormatted}
                      </span>
                    </div>

                    <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-100 truncate mt-1">
                      {discountLabel}
                    </h3>
                    <p className="text-[11px] text-muted-foreground font-semibold">
                      Đơn tối thiểu{' '}
                      {formatVnd.format(coupon.min_order_value ?? 0)}
                    </p>
                  </div>

                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest font-mono">
                    Code:{' '}
                    <span className="text-violet-600 dark:text-violet-400 font-extrabold">
                      {coupon.code}
                    </span>
                  </div>
                </div>

                {/* Perforated Divider */}
                <div className="relative flex flex-col items-center justify-center w-4 h-full shrink-0">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800" />
                  <div className="h-full border-r border-dashed border-zinc-200 dark:border-zinc-800" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-5 h-5 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800" />
                </div>

                {/* Status Section */}
                <div className="w-24 flex flex-col items-center justify-center p-3 bg-muted/20 shrink-0 select-none">
                  {activeTab === 'unused' && (
                    <Link href="/checkout" className="w-full">
                      <Button
                        size="xs"
                        className="w-full bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 font-bold text-[10px] py-1.5 rounded-md"
                      >
                        Dùng ngay
                      </Button>
                    </Link>
                  )}
                  {activeTab === 'used' && (
                    <div className="flex flex-col items-center gap-0.5 text-zinc-400">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-[10px] font-bold">Đã dùng</span>
                      {item.used_at && (
                        <span className="text-[8px] text-zinc-400">
                          {new Date(item.used_at).toLocaleDateString('vi-VN')}
                        </span>
                      )}
                    </div>
                  )}
                  {activeTab === 'expired' && (
                    <div className="flex flex-col items-center gap-0.5 text-rose-500">
                      <XCircle className="h-4 w-4" />
                      <span className="text-[10px] font-bold">Hết hạn</span>
                    </div>
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
