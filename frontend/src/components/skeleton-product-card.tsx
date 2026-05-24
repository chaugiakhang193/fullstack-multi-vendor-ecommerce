import React from "react";
import { Store, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SkeletonProductCard() {
  return (
    <div className="relative rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col h-full animate-pulse">
      {/* Thumbnail Image Placeholder */}
      <div className="relative w-full aspect-square bg-zinc-100 dark:bg-zinc-900">
        <Skeleton className="w-full h-full rounded-none" />
      </div>

      {/* Product Details Info */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-2.5">
        <div className="space-y-2">
          {/* Shop name skeleton */}
          <div className="flex items-center gap-1">
            <Store className="h-3 w-3 shrink-0 text-zinc-300 dark:text-zinc-700" />
            <Skeleton className="h-3 w-16" />
          </div>

          {/* Product Name skeleton - 2 lines */}
          <div className="space-y-1">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>

        <div className="space-y-2">
          {/* Stars / Rating skeleton */}
          <div className="flex items-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-zinc-200 text-zinc-200 dark:fill-zinc-800 dark:text-zinc-800" />
            ))}
            <Skeleton className="h-3 w-8 ml-1" />
          </div>

          {/* Product Price skeleton */}
          <Skeleton className="h-4 w-24 bg-violet-100 dark:bg-violet-950/30" />
        </div>
      </div>
    </div>
  );
}
