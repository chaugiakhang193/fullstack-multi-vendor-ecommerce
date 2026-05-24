import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SkeletonProductCard() {
  return (
    <div className="relative rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col h-full">
      {/* Thumbnail Image Placeholder */}
      <div className="relative w-full aspect-square bg-zinc-100 dark:bg-zinc-900">
        <Skeleton className="w-full h-full rounded-none" />
      </div>

      {/* Product Details Info */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-2.5">
        <div className="space-y-2.5">
          {/* Shop name skeleton */}
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-3 rounded-full shrink-0" />
            <Skeleton className="h-3 w-16" />
          </div>

          {/* Product Name skeleton - 2 lines */}
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>

        <div className="space-y-2.5">
          {/* Stars / Rating skeleton */}
          <div className="flex items-center">
            <Skeleton className="h-3 w-20" />
          </div>

          {/* Product Price skeleton */}
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}
