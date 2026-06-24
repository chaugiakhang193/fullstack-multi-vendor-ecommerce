'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Package,
  ShoppingCart,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

// Requests & Validation
import sellerStatsApiRequest from '@/apiRequests/statistics/seller-stats';
import { SellerStatsType } from '@/schemaValidations/statistics/seller-stats.schema';

// Helpers & Utilities
import { getErrorMessage } from '@/lib/http';
import { formatVnd } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ORDER_STATUS_LABELS,
  type OrderStatusType,
} from '@/schemaValidations/orders/orders.schema';

export default function SellerDashboardPage() {
  const [stats, setStats] = useState<SellerStatsType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await sellerStatsApiRequest.getOverview();
        const statsData = response.data;
        setStats(statsData);
      } catch (error) {
        const errMsg = getErrorMessage(error);
        toast.error(errMsg);
      } finally {
        const isLoadingCompleted = false;
        setLoading(isLoadingCompleted);
      }
    }
    fetchStats();
  }, []);

  // Skeletons for Loading State
  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        {/* Title Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>

        {/* Stats Grid Skeleton */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-2xl border p-6 shadow-sm bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col justify-between h-[150px]"
            >
              <div className="flex items-center justify-between pb-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-10 w-10 rounded-xl" />
              </div>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>
          ))}
        </div>

        {/* Details Grid Skeleton */}
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-7">
          {/* Best Sellers Skeleton */}
          <div className="col-span-4 rounded-2xl border bg-card p-6 space-y-4">
            <div className="pb-5 border-b space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-3 px-3"
                >
                  <div className="flex items-center space-x-4 w-full">
                    <Skeleton className="h-12 w-12 rounded-xl" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-[80%]" />
                      <Skeleton className="h-4 w-[30%]" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          </div>

          {/* Status Breakdown Skeleton */}
          <div className="col-span-3 rounded-2xl border bg-card p-6 space-y-4">
            <div className="pb-5 border-b space-y-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="space-y-5 mt-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-8" />
                  </div>
                  <Skeleton className="h-3.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Safe fallback if stats are null
  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center p-6 border rounded-2xl border-dashed">
        <Package className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-xl font-bold">Không tải được dữ liệu thống kê</h3>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Vui lòng tải lại trang hoặc liên hệ bộ phận hỗ trợ kỹ thuật nếu lỗi
          tiếp tục xảy ra.
        </p>
      </div>
    );
  }

  // Pre-formatting values to strictly follow the "No Inline Arguments" rule
  const totalRevenueVal = stats.total_revenue;
  const formattedRevenue = formatVnd.format(totalRevenueVal);

  const localeCode = 'vi-VN';
  const totalOrdersVal = stats.total_orders;
  const formattedTotalOrders = totalOrdersVal.toLocaleString(localeCode);

  const pendingVal = stats.status_counts.pending;
  const formattedPending = pendingVal.toLocaleString(localeCode);

  const processingVal = stats.status_counts.processing;
  const formattedProcessing = processingVal.toLocaleString(localeCode);

  const statsCards = [
    {
      title: 'Tổng doanh thu',
      value: formattedRevenue,
      change: 'Đơn giao thành công',
      icon: <TrendingUp className="h-5 w-5 text-violet-500" />,
      gradient: 'from-violet-500/10 to-purple-500/10 border-violet-500/20',
    },
    {
      title: 'Tổng đơn hàng',
      value: formattedTotalOrders,
      change: 'Tất cả trạng thái',
      icon: <ShoppingCart className="h-5 w-5 text-emerald-500" />,
      gradient: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20',
    },
    {
      title: 'Chờ xác nhận',
      value: formattedPending,
      change: 'Cần duyệt gấp',
      icon: <Activity className="h-5 w-5 text-amber-500" />,
      gradient: 'from-amber-500/10 to-orange-500/10 border-amber-500/20',
    },
    {
      title: 'Đang xử lý',
      value: formattedProcessing,
      change: 'Đang chuẩn bị hàng',
      icon: <Package className="h-5 w-5 text-blue-500" />,
      gradient: 'from-blue-500/10 to-cyan-500/10 border-blue-500/20',
    },
  ];

  const statusOrder: OrderStatusType[] = [
    'pending',
    'processing',
    'shipping',
    'delivered',
    'cancelled',
    'returned',
  ];

  const statusColors: Record<OrderStatusType, string> = {
    pending: 'bg-amber-500',
    processing: 'bg-blue-500',
    shipping: 'bg-indigo-500',
    delivered: 'bg-emerald-500',
    cancelled: 'bg-rose-500',
    returned: 'bg-zinc-500',
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Tổng quan bán hàng
        </h1>
        <p className="text-muted-foreground text-base mt-1.5">
          Theo dõi tình hình kinh doanh, doanh số và đơn hàng của shop bạn.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, idx) => (
          <div
            key={idx}
            className={`rounded-2xl border bg-gradient-to-br ${stat.gradient} p-6 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md`}
          >
            <div className="flex items-center justify-between space-y-0 pb-3">
              <span className="text-base font-bold text-muted-foreground">
                {stat.title}
              </span>
              <div className="p-3 rounded-xl bg-background/50 backdrop-blur-sm border shadow-sm">
                {React.cloneElement(stat.icon, { className: 'h-7 w-7' })}
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black tracking-tight block text-foreground">
                {stat.value}
              </span>
              <p className="text-sm text-muted-foreground font-medium mt-1.5">
                {stat.change}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Information Grid */}
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-7">
        {/* Top Selling Products Card */}
        <div className="col-span-4 rounded-2xl border bg-card text-card-foreground shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-5 border-b">
              <div>
                <h3 className="font-extrabold text-2xl leading-none">
                  Sản phẩm bán chạy nhất
                </h3>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Top 5 sản phẩm đạt sản lượng bán tốt nhất (đơn đã giao).
                </p>
              </div>
              <Link
                href="/seller/products"
                className="flex items-center text-sm font-bold text-violet-600 hover:text-violet-700 transition"
              >
                Quản lý sản phẩm <ArrowUpRight className="h-5 w-5 ml-1" />
              </Link>
            </div>

            <div className="mt-5 space-y-4">
              {stats.best_sellers.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  Chưa có sản phẩm nào được giao thành công.
                </div>
              ) : (
                stats.best_sellers.map((item) => {
                  const itemThumbnailUrl = item.product_thumbnail as unknown as
                    | string
                    | null;
                  const itemTotalSold = item.total_sold;
                  const formattedItemSold =
                    itemTotalSold.toLocaleString(localeCode);

                  return (
                    <div
                      key={item.product_id}
                      className="flex items-center justify-between py-3 hover:bg-muted/50 rounded-xl px-3 transition-colors"
                    >
                      <div className="flex items-center space-x-4 flex-1 min-w-0">
                        {itemThumbnailUrl ? (
                          <img
                            src={itemThumbnailUrl}
                            alt={item.product_name}
                            className="h-12 w-12 rounded-xl object-cover border"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center text-violet-600 dark:text-violet-400">
                            <Package className="h-6 w-6" />
                          </div>
                        )}
                        <div className="truncate pr-4">
                          <p className="text-base font-bold text-foreground truncate">
                            {item.product_name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Mã sản phẩm: {item.product_id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block px-3.5 py-1.5 rounded-xl bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-extrabold text-sm border border-violet-200/50 dark:border-violet-900/50">
                          Đã bán {formattedItemSold}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Order Status Breakdown Summary Card */}
        <div className="col-span-3 rounded-2xl border bg-card text-card-foreground shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-5 border-b">
              <div>
                <h3 className="font-extrabold text-2xl leading-none">
                  Trạng thái đơn hàng
                </h3>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Phân phối đơn hàng theo các trạng thái.
                </p>
              </div>
              <Link
                href="/seller/orders"
                className="flex items-center text-sm font-bold text-violet-600 hover:text-violet-700 transition"
              >
                Xem tất cả đơn <ArrowUpRight className="h-5 w-5 ml-1" />
              </Link>
            </div>

            <div className="mt-6 space-y-5">
              {statusOrder.map((status) => {
                const count = stats.status_counts[status] || 0;
                const formattedCount = count.toLocaleString(localeCode);
                const label = ORDER_STATUS_LABELS[status];
                const colorClass = statusColors[status];

                const percentage =
                  stats.total_orders > 0
                    ? (count / stats.total_orders) * 100
                    : 0;
                const percentStr = `${percentage}%`;

                return (
                  <div key={status} className="space-y-2">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-foreground">
                        {formattedCount} đơn
                      </span>
                    </div>
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colorClass} rounded-full transition-all duration-500`}
                        style={{ width: percentStr }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 pt-5 border-t text-sm font-semibold text-muted-foreground flex items-center justify-between">
            <span>Đồng bộ thời gian thực</span>
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
