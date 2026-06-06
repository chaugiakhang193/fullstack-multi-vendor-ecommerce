"use client";

import React, { use, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Store,
  Calendar,
  ShoppingBag,
  Share2,
  Settings,
  Search,
  ArrowLeft,
  Tag,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

// Services & Components
import shopsApiRequest from "@/apiRequests/shops/shops";
import productsApiRequest from "@/apiRequests/products/products";
import ProductCard from "@/components/products/product-card";
import SortDropdown, { SortOption } from "@/components/products/sort-dropdown";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    sort?: string;
    order?: string;
    q?: string;
  }>;
}

// Format date helper (Join date)
const formatDate = (dateString?: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

// Sort options mapper
const mapSortOptionToParams = (option: SortOption) => {
  const orderAscVal = "ASC";
  const orderDescVal = "DESC";
  switch (option) {
    case "price_asc":
      return { sort: "price", order: orderAscVal };
    case "price_desc":
      return { sort: "price", order: orderDescVal };
    case "popular":
      return { sort: "name", order: orderAscVal };
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

export default function ShopDetailClient({ params, searchParams }: PageProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const resolvedParams = use(params);
  const resolvedSearchParams = use(searchParams);

  const shopId = resolvedParams.id;
  const urlPage = Number(resolvedSearchParams.page || "1");
  const urlSort = resolvedSearchParams.sort || "created_at";
  const urlOrder = resolvedSearchParams.order || "DESC";
  const urlQ = resolvedSearchParams.q || "";

  // Local state for debounced search and expansion
  const [searchInput, setSearchInput] = useState(urlQ);
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync search input with URL search query
  useEffect(() => {
    setSearchInput(urlQ);
  }, [urlQ]);

  // Reset expansion state whenever page or filters/search/sort change
  useEffect(() => {
    setIsExpanded(false);
  }, [urlPage, urlQ, urlSort, urlOrder]);


  // Fetch shop detail using React Query (staleTime 5 minutes)
  const { data: shopRes, isLoading: isShopLoading, error: shopError } = useQuery({
    queryKey: ["public-shop-detail", shopId],
    queryFn: () => shopsApiRequest.getPublicShopDetail(shopId),
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });
  const shop = shopRes?.data;

  // Map logical page and expansion to API params
  const apiPage = isExpanded ? urlPage : 2 * urlPage - 1;
  const apiLimit = isExpanded ? 48 : 24;

  // Build products query object
  const productsQuery = {
    page: apiPage,
    limit: apiLimit,
    q: urlQ,
    sort: urlSort,
    order: urlOrder as "ASC" | "DESC",
  };

  // Fetch shop catalog using React Query
  const productsQueryResult = useQuery({
    queryKey: ["public-shop-catalog", shopId, productsQuery],
    queryFn: () => productsApiRequest.getPublicCatalogByShop(shopId, productsQuery),
    retry: 1,
    staleTime: 1000 * 60 * 2,
    placeholderData: (prev) => prev,
  });
  const isProductsLoading = productsQueryResult.isLoading;
  const products = productsQueryResult.data?.data?.items || [];
  const meta = productsQueryResult.data?.data?.meta;
  const totalProducts = meta?.totalItems || 0;

  // Load more conditions
  const showLoadMore = !isExpanded && totalProducts > (urlPage - 1) * 48 + 24;
  const isExpanding = isExpanded && productsQueryResult.isFetching && products.length <= 24;
  const isFilterFetching = productsQueryResult.isFetching && !isExpanding;

  // Debounced search trigger after 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== urlQ) {
        updateQueryParams({ q: searchInput, page: "" }); // Reset page to 1
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, urlQ]);

  // Helper to update URL search params
  const updateQueryParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    });
    router.replace(`/shops/${shopId}?${params.toString()}`, { scroll: false });
  };

  const handleSortChange = (newOption: SortOption) => {
    const params = mapSortOptionToParams(newOption);
    updateQueryParams({
      sort: params.sort,
      order: params.order,
      page: "", // Reset page to 1
    });
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


  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      const shareUrl = window.location.href;
      navigator.clipboard.writeText(shareUrl)
        .then(() => {
          toast.success("Đã sao chép liên kết gian hàng!");
        })
        .catch(() => {
          toast.error("Không thể sao chép liên kết!");
        });
    }
  };

  const isOwner = user?.role === "seller" && shop?.seller?.id === user?.id;
  const sortOptionVal = mapParamsToSortOption(urlSort, urlOrder);

  // Shop Not Found or Inactive State (Error 404 handler)
  if (shopError || (!isShopLoading && !shop)) {
    return (
      <div className="max-w-7xl mx-auto py-24 text-center px-4 space-y-6">
        <div className="w-20 h-20 rounded-full bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto">
          <AlertCircle className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-foreground">Gian hàng chưa hoạt động</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Gian hàng này không tồn tại, đang chờ duyệt hoặc đã bị tạm khóa để bảo trì. Vui lòng quay lại sau!
          </p>
        </div>
        <Link href="/" className="inline-block">
          <Button className="text-xs font-bold px-6 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition shadow-md shadow-violet-500/20">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Quay lại trang chủ
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* 1. Banner area */}
      <div className="relative w-full h-48 sm:h-64 md:h-80 bg-zinc-100 dark:bg-zinc-900 border-b overflow-hidden">
        {shop?.banner_url ? (
          <Image
            src={shop.banner_url}
            alt={shop?.name || "Banner"}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-500 opacity-80" />
        )}
      </div>

      {/* 2. Shop profile box (Overlapping Banner) */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 -mt-16 sm:-mt-20">
        {isShopLoading ? (
          /* Loading Skeleton for header profile */
          <div className="bg-white dark:bg-zinc-950 p-6 rounded-2xl border shadow-sm space-y-4 animate-pulse">
            <div className="flex gap-4 items-end">
              <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-zinc-200 dark:bg-zinc-800 border-4 border-white" />
              <div className="space-y-2">
                <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-950 p-6 rounded-2xl border shadow-sm flex flex-col md:flex-row md:items-end justify-between gap-6">
            {/* Left Column: Logo & Shop Meta Info */}
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              {/* Logo */}
              <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white bg-white dark:bg-zinc-900 shadow-md relative overflow-hidden shrink-0">
                <Image
                  src={shop?.logo_url || "/placeholder-logo.png"}
                  alt={shop?.name || "Logo"}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>

              {/* Text metadata */}
              <div className="space-y-3.5 min-w-0">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-none">
                      {shop?.name}
                    </h1>
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Đối tác chính hãng
                    </span>
                  </div>
                  {shop?.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 max-w-2xl leading-relaxed">
                      {shop.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                    <span>Tham gia: {formatDate(shop?.created_at)}</span>
                  </div>
                  <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />
                  <div className="flex items-center gap-1.5">
                    <ShoppingBag className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                    <span>Sản phẩm: {totalProducts}</span>
                  </div>
                </div>

                {/* Registered Categories Badges */}
                {shop?.categories && shop.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {shop.categories.map((cat) => (
                      <span
                        key={cat.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-900/50 uppercase tracking-wider"
                      >
                        <Tag className="h-2.5 w-2.5 shrink-0" />
                        {cat.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Actions */}
            <div className="shrink-0">
              {isOwner ? (
                /* Manage shop shortcut for owner */
                <Link href="/seller/settings">
                  <Button className="w-full sm:w-auto h-11 px-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-500/20">
                    <Settings className="h-4 w-4" />
                    <span>Quản lý gian hàng ⚙️</span>
                  </Button>
                </Link>
              ) : (
                /* Copy link sharing button */
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="w-full sm:w-auto h-11 px-5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border border-zinc-200 dark:border-zinc-800 bg-background hover:bg-zinc-50 dark:hover:bg-zinc-900 transition shadow-sm"
                >
                  <Share2 className="h-4 w-4" />
                  <span>Chia sẻ cửa hàng</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Catalog Products & Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Search, Sort and Layout toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-950 p-4 rounded-xl border shadow-sm">
          {/* Internal search */}
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm kiếm sản phẩm trong cửa hàng này..."
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
            />
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-3 self-end md:self-auto">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
              Sắp xếp:
            </span>
            <SortDropdown
              value={sortOptionVal}
              onChange={handleSortChange}
              className="w-48"
            />
          </div>
        </div>

        {/* Products lists grid section */}
        {isProductsLoading && products.length === 0 ? (
          /* Loading skeletons */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="aspect-[4/5] rounded-xl border bg-white dark:bg-zinc-950 p-4 space-y-4 animate-pulse"
              >
                <div className="w-full aspect-square bg-zinc-100 dark:bg-zinc-900 rounded-lg" />
                <div className="h-4 w-3/4 bg-zinc-100 dark:bg-zinc-900 rounded" />
                <div className="h-4 w-1/2 bg-zinc-100 dark:bg-zinc-900 rounded" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          /* Empty state catalog */
          <div className="rounded-xl border bg-white dark:bg-zinc-950 p-12 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-muted-foreground/50 mx-auto">
              <Store className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-foreground">Không tìm thấy sản phẩm</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {urlQ
                  ? `Cửa hàng không có sản phẩm nào khớp với từ khóa "${urlQ}". Thử tìm kiếm từ khóa khác.`
                  : "Cửa hàng này hiện chưa đăng bán sản phẩm nào. Hãy quay lại sau nhé!"}
              </p>
            </div>
            {urlQ && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="text-xs font-bold px-4 py-2 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition shadow-sm bg-background"
              >
                Xóa tìm kiếm
              </button>
            )}
          </div>
        ) : (
          /* Products catalog grid list */
          <div className="space-y-8">
            <div className={cn(
              "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 transition-opacity duration-300",
              isFilterFetching && "opacity-50 pointer-events-none"
            )}>
              {products.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>

            {/* Load more accumulative pagination */}
            {(showLoadMore || isExpanding) && (
              <div className="text-center pt-4">
                <Button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isExpanding}
                  variant="outline"
                  className="font-semibold px-8 h-10 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 border transition-all duration-300 gap-2 text-xs"
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

            {/* Pagination Component */}
            {isExpanded && (
              <Pagination
                currentPage={urlPage}
                totalPages={Math.ceil(totalProducts / 48)}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        )}

      </div>
    </div>
  );
}
