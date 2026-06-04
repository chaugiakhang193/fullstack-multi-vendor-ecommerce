"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, ArrowRight, Loader2, Star } from "lucide-react";

// Components
import ProductCard from "@/components/product-card";

// API
import productsApiRequest from "@/apiRequests/products/products";

export default function EmptyCartState() {
  // Query 4 featured products for recommendations
  const recommendQueryConfig = {
    queryKey: ["recommend-products"],
    queryFn: () => {
      const getParamsObj = { limit: 4 };
      return productsApiRequest.getPublicProducts(getParamsObj);
    },
    staleTime: 1000 * 60 * 10, // 10 mins cache
  };
  const { data: productsRes, isLoading } = useQuery(recommendQueryConfig);
  const recommendProducts = productsRes?.data?.items || [];

  return (
    <div className="space-y-16 py-12 animate-fade-in">
      {/* Empty State Banner */}
      <div className="flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-950/50 shadow-inner">
          <ShoppingBag className="h-10 w-10 animate-bounce" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-foreground">
            Giỏ hàng của bạn đang trống
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Có vẻ như bạn chưa chọn được sản phẩm nào. Hãy khám phá hàng ngàn sản phẩm chất lượng cao trên Giang Kha để bắt đầu mua sắm nhé!
          </p>
        </div>

        <Link href="/products" className="w-full">
          <button className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-sm font-extrabold transition flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 hover:scale-[1.02]">
            <span>Tiếp tục mua sắm</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
      </div>

      {/* Recommended Products Section */}
      <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-16 space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-foreground flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500 fill-current" /> Có thể bạn sẽ thích
            </h3>
            <p className="text-xs text-muted-foreground">
              Những sản phẩm đang thịnh hành và được yêu thích nhất
            </p>
          </div>
          <Link
            href="/products"
            className="text-xs font-black text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
          >
            Xem thêm <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
          </div>
        ) : recommendProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {recommendProducts.map((product) => {
              const cardKey = `recommend-${product.id}`;
              return <ProductCard key={cardKey} product={product} />;
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground italic">
            Không tải được gợi ý sản phẩm.
          </div>
        )}
      </div>
    </div>
  );
}
