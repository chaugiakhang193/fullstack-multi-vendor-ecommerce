"use client";

import React, { useState, useEffect, use, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ShoppingCart,
  Star,
  Store,
  ChevronRight,
  Plus,
  Minus,
  ShieldCheck,
  Truck,
  RotateCcw,
  Sparkles,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

// Services, Stores & Hooks
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useRecentlyViewedStore } from "@/store/useRecentlyViewedStore";
import { useActiveCart } from "@/hooks/useActiveCart";
import { useProductDetail } from "@/hooks/useProducts";
import { useMyShop } from "@/hooks/useShop";
import { StarRating } from "@/components/shared/star-rating";
import { useProductReviews } from "@/hooks/useReviews";

// Components
import VariantSelector from "@/components/products/VariantSelector";
import dynamic from "next/dynamic";
const RecentlyViewedCarousel = dynamic(() => import("@/components/products/recently-viewed-carousel"), {
  ssr: false,
});
import { Button } from "@/components/ui/button";

// Types
import type { ProductVariantResponseType } from "@/schemaValidations/products/products.schema";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ variant?: string; entry?: string }>;
}

const priceFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

const formatPrice = (val: number) => {
  return priceFormatter.format(val);
};

// Helper to extract UUID from the SEO slug (e.g. "ao-thun-premium-i.uuid")
const extractProductId = (slug: string): string => {
  const match = slug.match(
    /-i\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
  );
  return match ? match[1] : slug;
};

export default function ProductDetailClient({ params, searchParams }: PageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const resolvedParams = use(params);
  const resolvedSearchParams = searchParams ? use(searchParams) : {};
  const variantIdFromQuery = resolvedSearchParams.variant;
  const rawSlug = resolvedParams.slug;
  const productId = extractProductId(rawSlug);

  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantResponseType | null>(null);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [activeTab, setActiveTab] = useState<"description" | "reviews">("description");
  const [reviewPage, setReviewPage] = useState(1);
  const [selectedRating, setSelectedRating] = useState<number | undefined>(undefined);

  const mainImageRef = useRef<HTMLImageElement>(null);
  const initialCheckRef = useRef(false);
  const { addItem } = useActiveCart();
  const setIsOpen = useCartStore((state) => state.setIsOpen);
  const user = useAuthStore((state) => state.user);

  // Fetch product detail using React Query hook
  const { data: detailRes, isLoading, error } = useProductDetail(productId);

  const product = detailRes?.data;

  // Fetch product reviews
  const { data: reviewsRes, isLoading: isReviewsLoading } = useProductReviews(product?.id || "", {
    page: reviewPage,
    limit: 10,
    rating: selectedRating,
  });
  const reviewsData = reviewsRes?.data;
  const addProductToRecentlyViewed = useRecentlyViewedStore((state) => state.addProduct);

  // Lưu sản phẩm vào danh sách vừa xem gần đây
  useEffect(() => {
    if (product) {
      addProductToRecentlyViewed(product);
    }
  }, [product, addProductToRecentlyViewed]);

  // Fetch seller's own shop if logged in as seller using hook
  const { data: myShopRes } = useMyShop(user?.role === "seller");
  const myShop = myShopRes?.data;

  const isOwnProduct = product && myShop
    ? product.shop?.id === myShop.id
    : false;

  // Logic scroll ẩn/hiện Sticky Bar trên Mobile
  useEffect(() => {
    const handleScroll = () => {
      const scrollThreshold = 500;
      if (window.scrollY > scrollThreshold) {
        setShowStickyBar(true);
      } else {
        setShowStickyBar(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Set initial main image when product loaded
  useEffect(() => {
    if (product) {
      const initialImage = product.thumbnail_url;
      setActiveImageUrl(initialImage);
    }
  }, [product]);

  // Auto-select variant from URL search query parameter
  useEffect(() => {
    if (product && product.variants && variantIdFromQuery) {
      const match = product.variants.find((v) => v.id === variantIdFromQuery);
      if (match) {
        setSelectedVariant(match);
      }
    }
  }, [product, variantIdFromQuery]);

  // Redirect SEO URL
  useEffect(() => {
    if (product) {
      const canonicalSlug = `${product.slug}-i.${product.id}`;
      if (rawSlug !== canonicalSlug) {
        const redirectUrl = `/products/${canonicalSlug}`;
        router.replace(redirectUrl);
      }
    }
  }, [product, rawSlug, router]);

  // Restore last selected variant from localStorage if not coming from catalog (entry=catalog)
  useEffect(() => {
    if (typeof window !== "undefined" && product && !initialCheckRef.current) {
      initialCheckRef.current = true;

      const comingFromCatalog = resolvedSearchParams.entry === "catalog";

      if (comingFromCatalog) {
        // Strip entry=catalog from URL immediately to keep address bar clean
        const params = new URLSearchParams(window.location.search);
        params.delete("entry");
        const cleanedQuery = params.toString();
        const newUrl = `${pathname}${cleanedQuery ? `?${cleanedQuery}` : ""}`;
        router.replace(newUrl, { scroll: false });
        return;
      }

      // Check if there are any variant / attribute parameters in the current URL
      const params = new URLSearchParams(window.location.search);
      const hasAnyParams =
        params.has("variant") ||
        params.has("color") ||
        params.has("size") ||
        params.has("cpu") ||
        params.has("ram") ||
        params.has("storage");

      // If no query parameters, check localStorage and restore the last selection
      if (!hasAnyParams) {
        const savedQuery = localStorage.getItem(`last_variant_${product.id}`);
        if (savedQuery) {
          router.replace(`${pathname}${savedQuery}`, { scroll: false });
        }
      }
    }
  }, [product, resolvedSearchParams, pathname, router]);

  // Save selected variant to localStorage
  useEffect(() => {
    if (product && selectedVariant && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("entry");
      const queryString = params.toString();
      if (queryString) {
        localStorage.setItem(`last_variant_${product.id}`, `?${queryString}`);
      }
    }
  }, [product, selectedVariant, resolvedSearchParams]);

  // When variant changes, update active main image to variant's first image (if available)
  useEffect(() => {
    if (selectedVariant && selectedVariant.images && selectedVariant.images.length > 0) {
      const variantImage = selectedVariant.images[0];
      setActiveImageUrl(variantImage);
    } else if (product) {
      const fallbackImage = product.thumbnail_url;
      setActiveImageUrl(fallbackImage);
    }
  }, [selectedVariant, product]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-12 animate-fade-in py-8">
        <div className="h-6 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-4">
            <div className="aspect-square bg-zinc-200 dark:bg-zinc-800 rounded-2xl animate-pulse" />
            <div className="flex gap-2.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-20 h-20 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
          <div className="lg:col-span-6 space-y-6">
            <div className="h-10 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
            <div className="h-6 w-1/4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-12 w-1/3 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
            <div className="space-y-2 pt-4">
              <div className="h-8 w-full bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-8 w-2/3 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-7xl mx-auto py-16 text-center space-y-4">
        <h2 className="text-2xl font-extrabold text-rose-600">Lỗi tải sản phẩm</h2>
        <p className="text-muted-foreground text-sm">
          Không tìm thấy sản phẩm hoặc đường dẫn không hợp lệ.
        </p>
        <Link href="/" className="inline-block">
          <Button variant="outline" className="text-xs font-semibold px-4 py-2">
            Quay lại Trang chủ
          </Button>
        </Link>
      </div>
    );
  }

  // Price calculations based on variant
  const finalPrice = selectedVariant
    ? Number(product.price) + Number(selectedVariant.additional_price)
    : Number(product.price);

  // Max stock limit check
  const maxStock = selectedVariant
    ? selectedVariant.stock_quantity
    : product.stock_quantity;

  const isOutOfStock = maxStock === 0;

  // Gallery compilation (Aggregated Gallery from server, but fallback to manually compile if empty)
  const gallery = product.aggregated_gallery || [];

  const handleQtyMinus = () => {
    if (isOwnProduct) return;
    if (quantity > 1) {
      const prevQty = quantity - 1;
      setQuantity(prevQty);
    }
  };

  const handleQtyPlus = () => {
    if (isOwnProduct) return;
    if (quantity < maxStock) {
      const nextQty = quantity + 1;
      setQuantity(nextQty);
    } else {
      const limitMsg = "Số lượng đã đạt giới hạn tồn kho của phiên bản này!";
      toast.warning(limitMsg);
    }
  };

  // Fly-to-cart animation logic
  const triggerFlyToCartAnimation = () => {
    const mainImg = mainImageRef.current;
    const cartEl = document.querySelector('button[id="header-cart-btn"]') || document.querySelector('a[href="/cart"]');
    
    if (mainImg && cartEl) {
      const imgRect = mainImg.getBoundingClientRect();
      const cartRect = cartEl.getBoundingClientRect();

      const clone = document.createElement("img");
      clone.src = mainImg.src;
      clone.style.position = "fixed";
      clone.style.left = `${imgRect.left}px`;
      clone.style.top = `${imgRect.top}px`;
      clone.style.width = `${imgRect.width}px`;
      clone.style.height = `${imgRect.height}px`;
      clone.style.borderRadius = "16px";
      clone.style.zIndex = "9999";
      clone.style.pointerEvents = "none";
      clone.style.transition = "all 0.8s cubic-bezier(0.25, 1, 0.5, 1)";

      document.body.appendChild(clone);

      // Force reflow
      clone.getBoundingClientRect();

      clone.style.left = `${cartRect.left + cartRect.width / 2 - 15}px`;
      clone.style.top = `${cartRect.top + cartRect.height / 2 - 15}px`;
      clone.style.width = "30px";
      clone.style.height = "30px";
      clone.style.opacity = "0.1";
      clone.style.transform = "scale(0.1) rotate(360deg)";

      setTimeout(() => {
        clone.remove();
        // Scale bounce effect on cart button
        const targetBtn = cartEl.querySelector("button") || cartEl;
        targetBtn.classList.add("scale-110", "bg-violet-100", "dark:bg-violet-900/30");
        setTimeout(() => {
          targetBtn.classList.remove("scale-110", "bg-violet-100", "dark:bg-violet-900/30");
          // Open the Cart Drawer after fly animation completes
          setIsOpen(true);
        }, 200);
      }, 800);
    } else {
      // Fallback: Open drawer immediately if animation fails
      setIsOpen(true);
    }
  };
  
  const handleAddToCart = () => {
    if (isOwnProduct) {
      const ownProductMsg = "Bạn không thể mua sản phẩm của chính shop mình!";
      toast.error(ownProductMsg);
      return;
    }

    if (isOutOfStock) {
      const errorMsg = "Sản phẩm hiện đang tạm hết hàng!";
      toast.error(errorMsg);
      return;
    }

    if (product.has_variants && !selectedVariant) {
      const warningMsg = "Vui lòng chọn đầy đủ các phân loại phiên bản!";
      toast.warning(warningMsg);
      return;
    }

    const cartItem = {
      productId: product.id,
      variantId: selectedVariant ? selectedVariant.id : null,
      name: product.name,
      price: Number(finalPrice),
      thumbnailUrl: activeImageUrl || product.thumbnail_url || "/placeholder-product.png",
      shopId: product.shop?.id || "default-shop",
      shopName: product.shop?.name || "Cửa hàng",
      productSlug: rawSlug,
      variants: product.variants || [],
      basePrice: Number(product.price),
      hasVariants: product.has_variants,
      baseStock: product.stock_quantity,
      quantity,
      variantName: selectedVariant ? selectedVariant.name : undefined,
    };
    addItem(cartItem);

    // Trigger Fly Animation
    triggerFlyToCartAnimation();
  };

  const handleStickyAddToCart = () => {
    if (isOwnProduct) return;

    if (product.has_variants && !selectedVariant) {
      const warningMsg = "Vui lòng chọn phiên bản sản phẩm!";
      toast.warning(warningMsg);
      const selectorEl = document.getElementById("variant-selector-section");
      if (selectorEl) {
        const scrollOptions: ScrollIntoViewOptions = {
          behavior: "smooth",
          block: "center",
        };
        selectorEl.scrollIntoView(scrollOptions);
      }
      return;
    }
    handleAddToCart();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 py-6">
      {/* Breadcrumbs Navigation */}
      <nav className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-white dark:bg-zinc-950 p-4 rounded-xl border">
        <Link href="/" className="hover:text-violet-600 transition-colors">
          Trang chủ
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-violet-600 transition-colors">
          {product.category?.name || "Sản phẩm"}
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground truncate max-w-[280px]">
          {product.name}
        </span>
      </nav>

      {/* Main Product Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Image Area */}
        <div className="lg:col-span-6 space-y-4">
          {/* Main Visual Display */}
          <div className="relative aspect-square w-full rounded-2xl border bg-white dark:bg-zinc-950 overflow-hidden shadow-sm flex items-center justify-center">
            {activeImageUrl ? (
              <Image
                ref={mainImageRef}
                src={activeImageUrl}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-all duration-300"
                priority
              />
            ) : (
              <div className="text-muted-foreground text-sm italic">Không có hình ảnh</div>
            )}
            
            {/* Out of Stock Label */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center text-white text-base font-black uppercase tracking-widest">
                Tạm hết hàng
              </div>
            )}
          </div>

          {/* Gallery Thumbnails List */}
          {gallery.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {gallery.map((url, idx) => {
                const isActive = activeImageUrl === url;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageUrl(url)}
                    className={`relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border-2 bg-white dark:bg-zinc-950 transition-all ${
                      isActive ? "border-violet-600 scale-105" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                    }`}
                  >
                    <Image
                      src={url}
                      alt={`${product.name} gallery ${idx + 1}`}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Specifications & Actions */}
        <div className="lg:col-span-6 space-y-6 bg-white dark:bg-zinc-950 p-6 sm:p-8 rounded-2xl border shadow-sm">
          <div className="space-y-3">
            {/* Shop badge and details */}
            <div className="flex items-center justify-between gap-4 border-b pb-4">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
                <Store className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                <span className="truncate">{product.shop?.name || "Cửa hàng"}</span>
              </div>
              <Link
                href={`/shops/${product.shop?.id}`}
                className="text-xs font-black text-violet-600 dark:text-violet-400 hover:underline"
              >
                Xem Shop
              </Link>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-black text-foreground leading-tight">
              {product.name}
            </h1>

            {/* Ratings Summary */}
            <div className="flex items-center gap-1.5 pt-1">
              <StarRating rating={Number(product.avg_rating || 0)} size="sm" />
              <span className="text-xs font-bold text-muted-foreground ml-1">
                {Number(product.avg_rating || 0).toFixed(1)} ({product.review_count || 0} đánh giá)
              </span>
            </div>

            {isOwnProduct && (
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-700 dark:text-amber-400 font-bold flex items-center gap-2 animate-pulse">
                <span>⚠️ Bạn đang xem sản phẩm thuộc sở hữu của shop bạn. Tính năng mua hàng bị vô hiệu hóa.</span>
              </div>
            )}
          </div>

          {/* Pricing Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-900/50 flex flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Giá bán hiện tại:
            </span>
            <div className="text-3xl font-black text-violet-600 dark:text-violet-400">
              {formatPrice(finalPrice)}
            </div>
            {selectedVariant && Number(selectedVariant.additional_price) > 0 && (
              <span className="text-[10px] text-muted-foreground font-semibold">
                (Đã gồm {formatPrice(Number(selectedVariant.additional_price))} phụ phí phiên bản)
              </span>
            )}
          </div>

          {/* Variant Selectors Section */}
          {product.has_variants && product.variants && product.variants.length > 0 && (
            <div id="variant-selector-section" className="border-t border-zinc-100 dark:border-zinc-900/60 pt-5">
              <VariantSelector
                variants={product.variants}
                onVariantSelect={setSelectedVariant}
              />
            </div>
          )}

          {/* Quantity Selector Section */}
          <div className="border-t border-zinc-100 dark:border-zinc-900/60 pt-5 space-y-3">
            <div className="flex items-center justify-between text-sm font-bold text-muted-foreground uppercase tracking-wider">
              <span>Số lượng mua:</span>
              {!isOutOfStock && !isOwnProduct && (
                <span className="text-xs text-muted-foreground font-semibold">
                  Tồn kho khả dụng: <strong className="text-foreground">{maxStock} sản phẩm</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center border-2 border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden h-12 bg-white dark:bg-zinc-950 shrink-0">
                <button
                  type="button"
                  disabled={quantity <= 1 || isOutOfStock || isOwnProduct}
                  onClick={handleQtyMinus}
                  className="w-12 h-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition text-muted-foreground hover:text-foreground border-r dark:border-zinc-800"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-4 text-sm font-black text-foreground min-w-[50px] text-center select-none">
                  {isOutOfStock || isOwnProduct ? 0 : quantity}
                </span>
                <button
                  type="button"
                  disabled={quantity >= maxStock || isOutOfStock || isOwnProduct}
                  onClick={handleQtyPlus}
                  className="w-12 h-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition text-muted-foreground hover:text-foreground border-l dark:border-zinc-800"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Add to Cart CTA Button */}
              <button
                type="button"
                disabled={isOutOfStock || isOwnProduct}
                onClick={handleAddToCart}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-800 dark:disabled:to-zinc-800 disabled:text-zinc-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-violet-500/20 disabled:shadow-none cursor-pointer"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>
                  {isOwnProduct 
                    ? "Sản phẩm của Shop bạn" 
                    : isOutOfStock 
                      ? "Tạm hết hàng" 
                      : "Thêm vào giỏ hàng"}
                </span>
              </button>
            </div>
          </div>

          {/* Trust Guarantees */}
          <div className="border-t border-zinc-100 dark:border-zinc-900/60 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground font-semibold">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Chính hãng 100%</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-violet-500 shrink-0" />
              <span>Giao hàng toàn quốc</span>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Đổi trả 7 ngày</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs description & reviews */}
      <div className="rounded-2xl border bg-white dark:bg-zinc-950 p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="border-b pb-4 flex gap-8">
          <button
            type="button"
            onClick={() => setActiveTab("description")}
            className={`text-base font-extrabold pb-4 -mb-[18px] flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === "description"
                ? "text-violet-600 border-violet-600"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4" /> Chi tiết sản phẩm
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reviews")}
            className={`text-base font-extrabold pb-4 -mb-[18px] flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === "reviews"
                ? "text-violet-600 border-violet-600"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <Star className="h-4 w-4" /> Đánh giá ({product.review_count || 0})
          </button>
        </div>

        {activeTab === "description" ? (
          <div className="space-y-4 pt-2">
            {product.description ? (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Hiện chưa có mô tả chi tiết cho sản phẩm này.
              </p>
            )}

            {/* Technical Specifications */}
            <div className="pt-4 max-w-md">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
                Thông số kỹ thuật:
              </h4>
              <div className="divide-y text-xs border rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/10">
                <div className="flex p-3">
                  <span className="w-1/3 text-muted-foreground font-semibold">Trọng lượng</span>
                  <span className="w-2/3 text-foreground font-bold">{product.weight}g</span>
                </div>
                <div className="flex p-3">
                  <span className="w-1/3 text-muted-foreground font-semibold">Kích thước hộp</span>
                  <span className="w-2/3 text-foreground font-bold">
                    {product.length || 20} x {product.width || 15} x {product.height || 10} cm
                  </span>
                </div>
                <div className="flex p-3">
                  <span className="w-1/3 text-muted-foreground font-semibold">Mã SKU gốc</span>
                  <span className="w-2/3 text-foreground font-mono font-bold">
                    {product.sku || "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Reviews Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/10 border">
              {/* Avg rating score */}
              <div className="md:col-span-4 flex flex-col items-center justify-center border-r md:border-r border-zinc-200 dark:border-zinc-800 pr-6">
                <span className="text-5xl font-black text-foreground">
                  {Number(product.avg_rating || 0).toFixed(1)}
                </span>
                <div className="mt-2">
                  <StarRating rating={Number(product.avg_rating || 0)} size="md" />
                </div>
                <span className="mt-2 text-xs font-bold text-muted-foreground">
                  {product.review_count || 0} đánh giá
                </span>
              </div>

              {/* Distribution bars */}
              <div className="md:col-span-8 flex flex-col gap-2">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const distribution = reviewsData?.distribution || { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
                  const count = distribution[stars.toString() as keyof typeof distribution] || 0;
                  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;
                  const percent = Math.round((count / total) * 100);
                  return (
                    <div key={stars} className="flex items-center gap-3 text-xs">
                      <span className="w-12 font-bold text-muted-foreground text-right shrink-0">{stars} sao</span>
                      <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="w-16 font-bold text-muted-foreground shrink-0">
                        {percent}% ({count})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Star Filters */}
            <div className="flex flex-wrap gap-2 pb-2 border-b">
              <button
                type="button"
                onClick={() => {
                  setSelectedRating(undefined);
                  setReviewPage(1);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all border ${
                  selectedRating === undefined
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white dark:bg-zinc-950 text-muted-foreground border-zinc-200 dark:border-zinc-800 hover:text-foreground hover:border-zinc-400"
                }`}
              >
                Tất cả
              </button>
              {[5, 4, 3, 2, 1].map((stars) => (
                <button
                  key={stars}
                  type="button"
                  onClick={() => {
                    setSelectedRating(stars);
                    setReviewPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all border flex items-center gap-1 ${
                    selectedRating === stars
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white dark:bg-zinc-950 text-muted-foreground border-zinc-200 dark:border-zinc-800 hover:text-foreground hover:border-zinc-400"
                  }`}
                >
                  {stars} sao
                </button>
              ))}
            </div>

            {/* Reviews List */}
            {isReviewsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
              </div>
            ) : !reviewsData || reviewsData.items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm font-semibold italic">
                Chưa có đánh giá nào cho sản phẩm này.
              </div>
            ) : (
              <div className="divide-y space-y-6">
                {reviewsData.items.map((review) => (
                  <div key={review.id} className="pt-6 first:pt-0 space-y-3">
                    {/* User profile & rating */}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-extrabold text-foreground">
                          {review.user?.username || "Người dùng ẩn danh"}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <StarRating rating={review.rating} size="sm" />
                          {review.order_item?.variant_name && (
                            <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-muted-foreground font-semibold px-2 py-0.5 rounded">
                              Phân loại: {review.order_item.variant_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString("vi-VN", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Comment content */}
                    {review.comment && (
                      <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed pl-1">
                        {review.comment}
                      </p>
                    )}

                    {/* Seller Reply Box */}
                    {review.reply_from_seller && (
                      <div className="p-4 rounded-xl bg-violet-50/50 dark:bg-violet-950/10 border border-violet-100 dark:border-violet-900/30 ml-4 space-y-1">
                        <div className="text-xs font-black text-violet-600 dark:text-violet-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <MessageSquare className="h-3.5 w-3.5" /> Phản hồi từ người bán
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                          {review.reply_from_seller}
                        </p>
                      </div>
                    )}
                  </div>
                ))}

                {/* Pagination Controls */}
                {reviewsData.meta.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 pt-6">
                    <button
                      type="button"
                      disabled={reviewPage <= 1}
                      onClick={() => setReviewPage((p) => p - 1)}
                      className="px-4 py-2 rounded-xl text-xs font-extrabold transition-all border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 disabled:opacity-40 hover:text-foreground hover:border-zinc-400 cursor-pointer"
                    >
                      Trang trước
                    </button>
                    <span className="text-xs font-extrabold text-muted-foreground">
                      Trang {reviewPage} / {reviewsData.meta.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={reviewPage >= reviewsData.meta.totalPages}
                      onClick={() => setReviewPage((p) => p + 1)}
                      className="px-4 py-2 rounded-xl text-xs font-extrabold transition-all border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 disabled:opacity-40 hover:text-foreground hover:border-zinc-400 cursor-pointer"
                    >
                      Trang sau
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section sản phẩm đã xem gần đây */}
      <RecentlyViewedCarousel currentProductId={product.id} />

      {/* Sticky Buy Bar on Mobile */}
      {showStickyBar && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t px-4 py-3 flex items-center justify-between gap-4 animate-fade-in shadow-[0_-4px_12px_rgba(0,0,0,0.05)] border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800">
              <Image
                src={activeImageUrl || product.thumbnail_url || "/placeholder-product.png"}
                alt={product.name}
                fill
                sizes="40px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex flex-col">
              <span className="text-xs font-bold text-foreground truncate max-w-[120px] sm:max-w-[200px]">
                {product.name}
              </span>
              <span className="text-xs font-black text-violet-600 dark:text-violet-400">
                {formatPrice(finalPrice)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isOutOfStock || isOwnProduct}
            onClick={handleStickyAddToCart}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-800 dark:disabled:to-zinc-800 disabled:text-zinc-500 text-white font-extrabold text-[10px] sm:text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-500/20 disabled:shadow-none cursor-pointer"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>
              {isOwnProduct 
                ? "Sản phẩm của Shop bạn" 
                : isOutOfStock 
                  ? "Tạm hết hàng" 
                  : "Thêm vào giỏ"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
