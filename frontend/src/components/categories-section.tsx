"use client";

// React & Next
import React from "react";
import { useRouter } from "next/navigation";

// Icons
import {
  Package,
  Smartphone,
  Laptop,
  Shirt,
  BookOpen,
  HeartPulse,
  Home,
  Tv,
  Activity,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

// Hooks & Services
import { useCategories } from "@/hooks/useCategories";
import { CategoryResponseType } from "@/schemaValidations/products/categories.schema";

// Components
import { Button } from "@/components/ui/button";

// Bản đồ ánh xạ slug của Category sang Lucide Icon tương ứng
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "dien-thoai-may-tinh-bang": Smartphone,
  "laptop-thiet-bi-it": Laptop,
  "thoi-trang-phu-kien": Shirt,
  "sach-van-phong-pham": BookOpen,
  "suc-khoe-sac-dep": HeartPulse,
  "nha-cua-doi-song": Home,
  "thiet-bi-dien-tu": Tv,
  "the-thao-da-ngoai": Activity,
};

export default function CategoriesSection() {
  const router = useRouter();
  
  // Gọi custom hook để fetch tất cả categories
  const categoriesQuery = useCategories();
  const { data: categoriesRes, isLoading, isError, refetch } = categoriesQuery;

  // Lấy dữ liệu mảng danh mục
  const categoriesData = categoriesRes?.data || [];

  // Lọc chỉ lấy các danh mục gốc (không có parent) để hiển thị trên Homepage
  const filterRootCategories = (cat: CategoryResponseType) => {
    const parentCategory = cat.parent;
    return !parentCategory;
  };
  const rootCategories = categoriesData.filter(filterRootCategories);

  // Xử lý khi nhấn vào một danh mục
  const handleCategoryClick = (catId: string) => {
    const queryParam = `?category_id=${catId}`;
    const targetUrl = `/products${queryParam}`;
    router.push(targetUrl);
  };

  // 1. Trạng thái Đang tải dữ liệu (Loading State) - Hiển thị 8 ô Skeleton
  if (isLoading) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">
            Danh mục nổi bật
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {Array.from({ length: 6 }).map((_, idx) => {
            const keyVal = `skeleton-cat-${idx}`;
            return (
              <div
                key={keyVal}
                className="h-28 rounded-xl border bg-card animate-pulse flex flex-col items-center justify-center p-4 gap-3"
              >
                <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // 2. Trạng thái Lỗi tải dữ liệu (Error State) - Hiển thị thông báo + nút Thử lại
  if (isError) {
    return (
      <section className="space-y-6">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">
          Danh mục nổi bật
        </h2>
        <div className="rounded-xl border border-dashed border-rose-200 dark:border-rose-950/40 bg-rose-50/20 dark:bg-rose-950/5 p-8 flex flex-col items-center justify-center text-center gap-3">
          <AlertCircle className="h-10 w-10 text-rose-500" />
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            Không thể tải danh sách danh mục sản phẩm.
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
          Danh mục nổi bật
        </h2>
      </div>

      {rootCategories.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {rootCategories.map((cat: CategoryResponseType) => {
            // Lấy icon tương ứng từ map, nếu không có thì dùng Package làm fallback
            const IconComponent = CATEGORY_ICON_MAP[cat.slug] || Package;
            const currentCategoryId = cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(currentCategoryId)}
                className="flex flex-col items-center justify-center p-6 rounded-2xl border bg-card text-card-foreground shadow-sm hover:scale-[1.03] hover:shadow-md hover:border-violet-500/50 dark:hover:border-violet-500/30 transition-all duration-300 gap-4 group text-center"
              >
                {/* Wrapper cho Icon */}
                <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-900 group-hover:bg-violet-100 dark:group-hover:bg-violet-950/50 group-hover:text-violet-600 dark:group-hover:text-violet-400 text-muted-foreground transition-all duration-300">
                  <IconComponent className="h-8 w-8 shrink-0" />
                </div>
                {/* Tên danh mục */}
                <span className="text-base font-extrabold leading-snug truncate w-full group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-base text-muted-foreground py-8 italic border rounded-xl border-dashed">
          Chưa có danh mục sản phẩm nào được tạo.
        </div>
      )}
    </section>
  );
}
