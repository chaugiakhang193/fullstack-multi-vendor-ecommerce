"use client";

// React & Next
import React from "react";
import Link from "next/link";

// Icons
import { AlertCircle, RefreshCw, ChevronRight } from "lucide-react";

// Hooks & Services
import { useProducts } from "@/hooks/useProducts";

// Components
import ProductCard from "@/components/products/product-card";
import SkeletonProductCard from "@/components/products/skeleton-product-card";
import { EmptyProducts } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

// Gán tham số truy vấn vào biến tường minh bên ngoài component (Tránh định nghĩa lại mỗi lần render)
const productsQueryParams = {
  sort: "created_at",
  order: "DESC" as const,
  limit: 8,
};

export default function ProductsSection() {
  // Gọi hook lấy danh sách sản phẩm mới nhất
  const productsQuery = useProducts(productsQueryParams);
  const { data: productsRes, isLoading, isError, refetch } = productsQuery;

  // Lấy dữ liệu danh sách sản phẩm
  const productsList = productsRes?.data?.items || [];

  // 1. Trạng thái Đang tải dữ liệu (Loading State) - Hiển thị 8 thẻ SkeletonProductCard
  if (isLoading) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-4xl font-extrabold tracking-tight text-foreground">
            Sản phẩm mới nhất
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, idx) => {
            const keyVal = `skeleton-prod-${idx}`;
            return <SkeletonProductCard key={keyVal} />;
          })}
        </div>
      </section>
    );
  }

  // 2. Trạng thái Lỗi tải dữ liệu (Error State) - Hiển thị thông báo + nút Thử lại
  if (isError) {
    return (
      <section className="space-y-6">
        <h2 className="text-4xl font-extrabold tracking-tight text-foreground">
          Sản phẩm mới nhất
        </h2>
        <div className="rounded-xl border border-dashed border-rose-200 dark:border-rose-950/40 bg-rose-50/20 dark:bg-rose-950/5 p-8 flex flex-col items-center justify-center text-center gap-3">
          <AlertCircle className="h-10 w-10 text-rose-500" />
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            Không thể tải danh sách sản phẩm mới nhất.
          </p>
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            className="text-xs font-semibold rounded-lg h-9 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Thử lại</span>
          </Button>
        </div>
      </section>
    );
  }

  // 3. Trạng thái tải dữ liệu thành công
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-4xl font-extrabold tracking-tight text-foreground">
          Sản phẩm mới nhất
        </h2>
        <Link
          href="/products"
          className="text-base font-bold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 flex items-center gap-0.5 transition-colors"
        >
          <span>Xem tất cả</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Hiển thị danh sách sản phẩm dạng Grid hoặc Empty State */}
      {productsList.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-[360px]:gap-3">
          {productsList.map((product) => {
            const productKey = product.id;
            return <ProductCard key={productKey} product={product} />;
          })}
        </div>
      ) : (
        <div className="py-6">
          <EmptyProducts actionHref="/products" actionLabel="Xem tất cả sản phẩm" />
        </div>
      )}
    </section>
  );
}
