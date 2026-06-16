"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Package, AlertTriangle, ChevronRight, ShoppingBag } from "lucide-react";

import { getErrorMessage } from "@/lib/http";
import { useCustomerOrdersList } from "@/hooks/useCustomerOrders";
import { cn } from "@/lib/utils";
import {
  type OrderStatusType,
  type CustomerOrderType,
} from "@/schemaValidations/orders/orders.schema";
import useHydrated from "@/hooks/useHydrated";
import { useAuthStore } from "@/store/useAuthStore";
import { Pagination } from "@/components/shared/pagination";
import { EmptyOrders } from "@/components/shared/empty-state";
import { OrderStatusBadge } from "@/components/orders/seller-order-status";
import { formatVnd, formatDateTime, shortId } from "@/lib/format";

const LIMIT = 10;

const TABS: { label: string; value: OrderStatusType | "all" }[] = [
  { label: "Tất cả", value: "all" },
  { label: "Chờ xác nhận", value: "pending" },
  { label: "Đang xử lý", value: "processing" },
  { label: "Đang giao", value: "shipping" },
  { label: "Đã giao", value: "delivered" },
  { label: "Đã hủy", value: "cancelled" },
];

export default function CustomerOrdersPage() {
  const router = useRouter();
  const isHydrated = useHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [activeTab, setActiveTab] = useState<OrderStatusType | "all">("all");
  const [page, setPage] = useState(1);

  // Guard client-side (mirror /checkout) — redirect sau hydrate để tránh nhấp nháy.
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/login?redirect=%2Fprofile%2Forders");
    }
  }, [isHydrated, isAuthenticated, router]);

  const listQuery = useCustomerOrdersList(activeTab, page, isHydrated && isAuthenticated);

  const handleTabChange = (value: OrderStatusType | "all") => {
    setActiveTab(value);
    setPage(1);
  };

  const orders = listQuery.data?.data.items ?? [];
  const meta = listQuery.data?.data.meta;

  // Skeleton trước hydrate / chưa xác thực — tránh chớp nội dung.
  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-9 w-56 bg-muted rounded-xl mb-8" />
        <div className="space-y-4">
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Đơn hàng của tôi
        </h1>
        <p className="text-muted-foreground text-base mt-2">
          Theo dõi trạng thái và lịch sử mua sắm của bạn.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 border-b gap-3 scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={cn(
              "whitespace-nowrap px-5 py-3 text-base font-bold rounded-t-xl transition border-b-2",
              tab.value === activeTab
                ? "border-violet-600 text-violet-600 bg-violet-50/40 dark:bg-violet-950/20"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
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
        <EmptyOrders
          description="Bạn chưa có đơn hàng nào ở mục này. Khám phá sản phẩm và đặt hàng ngay nhé!"
          actionLabel="Khám phá sản phẩm ngay →"
          actionHref="/products"
        />
      ) : (
        <>
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>

          {meta && meta.totalPages > 1 && (
            <Pagination
              currentPage={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: CustomerOrderType }) {
  const orderNumber = order.order_number ?? shortId(order.id);
  const total = order.total_amount ?? 0;
  const subOrders = order.sub_orders ?? [];
  const allItems = subOrders.flatMap((s) => s.items ?? []);
  const previewItems = allItems.slice(0, 3);
  const remaining = allItems.length - previewItems.length;
  const shopNames = subOrders
    .map((s) => s.shop?.name)
    .filter((name): name is string => !!name);

  return (
    <Link
      href={`/profile/orders/${order.id}`}
      className="block rounded-xl border bg-card p-5 shadow-xs hover:shadow-md hover:border-violet-300 dark:hover:border-violet-800 transition group"
    >
      {/* Top: mã đơn + trạng thái */}
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <p className="font-bold text-violet-600 dark:text-violet-400 truncate">
            {orderNumber}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDateTime(order.created_at)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* Middle: ảnh sản phẩm + tên shop */}
      <div className="flex items-center gap-3 py-3">
        <div className="flex -space-x-2 shrink-0">
          {previewItems.map((item) => (
            <div
              key={item.id}
              className="relative h-12 w-12 rounded-lg overflow-hidden border-2 border-card bg-muted"
            >
              {item.product_thumbnail ? (
                <Image
                  src={item.product_thumbnail}
                  alt={item.product_name}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ShoppingBag className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {remaining > 0 && (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-card bg-muted text-xs font-bold text-muted-foreground">
              +{remaining}
            </div>
          )}
        </div>
        <div className="min-w-0 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Package className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {shopNames.length > 0 ? shopNames.join(" · ") : "—"}
          </span>
        </div>
      </div>

      {/* Bottom: tổng tiền + CTA */}
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">
          Tổng cộng:{" "}
          <span className="font-black text-foreground">{formatVnd.format(total)}</span>
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold text-violet-600 dark:text-violet-400 group-hover:gap-2 transition-all">
          Xem chi tiết <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
