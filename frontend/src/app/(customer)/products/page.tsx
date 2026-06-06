"use client";

// React & Next
import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

// Icons
import { SlidersHorizontal, RotateCcw } from "lucide-react";

// Hooks & Services
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { CategoryResponseType } from "@/schemaValidations/products/categories.schema";

// Components
import { FilterSidebar } from "@/components/products/filter-sidebar";
import { SortDropdown, SortOption } from "@/components/products/sort-dropdown";
import ProductCard from "@/components/products/product-card";
import SkeletonProductCard from "@/components/products/skeleton-product-card";
import { EmptyProducts } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { cn } from "@/lib/utils";

// Helper to construct category tree from flat list
const buildCategoryTree = (categories: CategoryResponseType[]): any[] => {
  const categoryMap: Record<string, any> = {};
  categories.forEach((cat) => {
    categoryMap[cat.id] = { ...cat, children: [] };
  });

  const roots: any[] = [];
  categories.forEach((cat) => {
    const parentId = cat.parent?.id || cat.parent;
    if (parentId && categoryMap[parentId]) {
      categoryMap[parentId].children.push(categoryMap[cat.id]);
    } else if (!parentId) {
      roots.push(categoryMap[cat.id]);
    }
  });
  return roots;
};

// Mapper between SortDropdown string and API params
const mapSortOptionToParams = (option: SortOption) => {
  const orderAscVal = "ASC" as const;
  const orderDescVal = "DESC" as const;

  switch (option) {
    case "price_asc":
      return { sort: "price", order: orderAscVal };
    case "price_desc":
      return { sort: "price", order: orderDescVal };
    case "popular":
      return { sort: "name", order: orderAscVal }; // Fallback name to popular
    case "newest":
    default:
      return { sort: "created_at", order: orderDescVal };
  }
};

const mapParamsToSortOption = (sort?: string, order?: string): SortOption => {
  if (sort === "price" && order === "ASC") return "price_asc";
  if (sort === "price" && order === "DESC") return "price_desc";
  if (sort === "name") return "popular";
  return "newest";
};

function ProductsListContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read URL Search Params
  const urlPage = Number(searchParams.get("page") || "1");
  const categoryId = searchParams.get("category_id") || undefined;
  const minPrice = searchParams.get("min_price") ? Number(searchParams.get("min_price")) : undefined;
  const maxPrice = searchParams.get("max_price") ? Number(searchParams.get("max_price")) : undefined;
  const rating = searchParams.get("rating") ? Number(searchParams.get("rating")) : undefined;
  const sort = searchParams.get("sort") || "created_at";
  const order = (searchParams.get("order") as "ASC" | "DESC") || "DESC";
  const q = searchParams.get("q") || undefined;

  // Local state for load more expansion
  const [isExpanded, setIsExpanded] = useState(false);

  // Automatically reset isExpanded back to false when page or filters/search/sort change
  useEffect(() => {
    setIsExpanded(false);
  }, [urlPage, categoryId, minPrice, maxPrice, rating, sort, order, q]);

  // Sync category tree for filter sidebar
  const categoriesQuery = useCategories();
  const categoriesList = categoriesQuery.data?.data || [];
  const categoryTree = useMemo(() => buildCategoryTree(categoriesList), [categoriesList]);

  // Map sort / order back to dropdown select value
  const sortOptionVal = mapParamsToSortOption(sort, order);

  // Map logical page and expansion to API params
  const apiPage = isExpanded ? urlPage : 2 * urlPage - 1;
  const apiLimit = isExpanded ? 48 : 24;

  // Fetch products query
  const queryParams = {
    page: apiPage,
    limit: apiLimit,
    category_id: categoryId,
    min_price: minPrice,
    max_price: maxPrice,
    sort,
    order,
    q,
  };
  const productsQuery = useProducts(queryParams, {
    placeholderData: (prev: any) => prev,
  });
  const { data: productsRes, isLoading, isError, refetch } = productsQuery;
  const productsList = productsRes?.data?.items || [];
  const totalItems = productsRes?.data?.meta?.totalItems || 0;

  // Load more conditions
  const showLoadMore = !isExpanded && totalItems > (urlPage - 1) * 48 + 24;
  const isExpanding = isExpanded && productsQuery.isFetching && productsList.length <= 24;
  const isFilterFetching = productsQuery.isFetching && !isExpanding;


  // Helper to update query parameters in URL
  const updateQueryParams = (newParams: Record<string, string | number | undefined | null>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    const targetUrl = `${pathname}?${params.toString()}`;
    router.push(targetUrl);
  };

  // Handle filter changes from sidebar
  const handleFilterChange = (newFilters: { categoryIds: string[]; minPrice?: number; maxPrice?: number; rating?: number }) => {
    const nextCategoryId = newFilters.categoryIds?.[0] || "";
    const nextMinPrice = newFilters.minPrice !== undefined ? String(newFilters.minPrice) : "";
    const nextMaxPrice = newFilters.maxPrice !== undefined ? String(newFilters.maxPrice) : "";
    const nextRating = newFilters.rating !== undefined ? String(newFilters.rating) : "";

    const filterParams = {
      category_id: nextCategoryId,
      min_price: nextMinPrice,
      max_price: nextMaxPrice,
      rating: nextRating,
      page: "", // Reset page to 1
    };
    updateQueryParams(filterParams);
  };

  const handleResetFilters = () => {
    const resetParams = {
      category_id: "",
      min_price: "",
      max_price: "",
      rating: "",
      q: "",
      page: "", // Reset page to 1
    };
    updateQueryParams(resetParams);
  };

  // Handle sort changes from dropdown
  const handleSortChange = (newOption: SortOption) => {
    const params = mapSortOptionToParams(newOption);
    const sortParams = {
      sort: params.sort,
      order: params.order,
      page: "", // Reset page to 1
    };
    updateQueryParams(sortParams);
  };

  const handleLoadMore = () => {
    if (showLoadMore) {
      setIsExpanded(true);
    }
  };

  const handlePageChange = (page: number) => {
    updateQueryParams({ page: String(page) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  const activeFilters = {
    categoryIds: categoryId ? [categoryId] : [],
    minPrice,
    maxPrice,
    rating,
  };

  return (
    <div className="space-y-6">
      {/* Search status header */}
      {q && (
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-xs">
          <span className="text-sm font-semibold">
            Kết quả tìm kiếm cho từ khóa: <strong className="text-violet-600 dark:text-violet-400">"{q}"</strong>
          </span>
        </div>
      )}

      {/* Main layout container */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        
        {/* Left Column: Filter Sidebar */}
        <FilterSidebar
          categories={categoryTree}
          filters={activeFilters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
        />

        {/* Right Column: Listing and sorting */}
        <div className="flex-1 w-full space-y-6">
          
          {/* Header toolbar */}
          <div className="flex flex-row items-center justify-between gap-4 p-4 rounded-xl border bg-card shadow-xs">
            <div className="text-xs sm:text-sm font-bold text-muted-foreground">
              {isLoading ? (
                <span>Đang tìm kiếm sản phẩm...</span>
              ) : (
                <span>Hiển thị {Math.min((urlPage - 1) * 48 + productsList.length, totalItems)} / {totalItems} sản phẩm</span>
              )}
            </div>

            {/* Sort Dropdown */}
            <SortDropdown
              value={sortOptionVal}
              onChange={handleSortChange}
              className="w-48 text-xs font-semibold"
            />
          </div>

          {/* Listing Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, idx) => {
                const keyVal = `skeleton-item-${idx}`;
                return <SkeletonProductCard key={keyVal} />;
              })}
            </div>
          ) : isError ? (
            <div className="p-8 text-center border border-dashed rounded-xl border-rose-200 dark:border-rose-950 bg-rose-50/20 dark:bg-rose-950/5 flex flex-col items-center gap-3">
              <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                Đã xảy ra lỗi khi tải danh sách sản phẩm.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="text-xs font-semibold rounded-lg"
              >
                Tải lại trang
              </Button>
            </div>
          ) : productsList.length > 0 ? (
            <div className="space-y-8">
              <div className={cn(
                "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-[360px]:gap-3 transition-opacity duration-300",
                isFilterFetching && "opacity-50 pointer-events-none"
              )}>
                {productsList.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Load More Trigger Button */}
              {(showLoadMore || isExpanding) && (
                <div className="flex justify-center pt-4">
                  <Button
                    onClick={handleLoadMore}
                    disabled={isExpanding}
                    variant="outline"
                    className="font-bold text-xs px-8 h-10 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 border transition-all duration-300 gap-2"
                  >
                    {isExpanding ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        <span>Đang tải...</span>
                      </>
                    ) : (
                      <span>Xem thêm sản phẩm</span>
                    )}
                  </Button>
                </div>
              )}

              {/* Pagination control */}
              {isExpanded && (
                <Pagination
                  currentPage={urlPage}
                  totalPages={Math.ceil(totalItems / 48)}
                  onPageChange={handlePageChange}
                />
              )}
            </div>

          ) : (
            <div className="py-12">
              <EmptyProducts
                actionLabel="Xóa bộ lọc"
                onAction={handleResetFilters}
                description="Không tìm thấy sản phẩm nào phù hợp với bộ lọc hoặc từ khóa hiện tại."
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <span className="text-sm font-semibold text-muted-foreground animate-pulse">
          Đang tải danh sách sản phẩm...
        </span>
      </div>
    }>
      <ProductsListContent />
    </Suspense>
  );
}
