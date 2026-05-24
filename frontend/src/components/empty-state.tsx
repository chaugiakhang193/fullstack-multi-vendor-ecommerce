import React from "react";
import Link from "next/link";
import { ShoppingBag, ShoppingCart, Package } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 sm:p-12 md:p-16 rounded-2xl border border-dashed bg-zinc-50/50 dark:bg-zinc-900/20 max-w-lg mx-auto transition-all",
        className
      )}
    >
      {/* Icon Wrapper */}
      {icon && (
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 mb-5 shadow-xs">
          {icon}
        </div>
      )}

      {/* Title */}
      <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {/* CTA Action Button */}
      {actionLabel && (actionHref || onAction) && (
        <div>
          {actionHref ? (
            <Link
              href={actionHref}
              className={cn(
                buttonVariants({ variant: "default" }),
                "rounded-lg shadow-sm font-semibold text-xs sm:text-sm"
              )}
            >
              {actionLabel}
            </Link>
          ) : (
            <Button
              onClick={onAction}
              className="rounded-lg shadow-sm font-semibold text-xs sm:text-sm"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Preset: EmptyProducts
export function EmptyProducts({
  actionLabel = "Thêm sản phẩm",
  actionHref,
  onAction,
  description = "Hiện tại cửa hàng chưa đăng bán sản phẩm nào trong danh mục này.",
  className,
}: Omit<EmptyStateProps, "icon" | "title">) {
  return (
    <EmptyState
      icon={<ShoppingBag className="w-8 h-8" />}
      title="Chưa có sản phẩm nào"
      description={description}
      actionLabel={actionLabel}
      actionHref={actionHref}
      onAction={onAction}
      className={className}
    />
  );
}

// Preset: EmptyCart
export function EmptyCart({
  actionLabel = "Tiếp tục mua sắm",
  actionHref = "/products",
  onAction,
  description = "Giỏ hàng của bạn đang trống. Hãy tìm kiếm và chọn các sản phẩm ưng ý để mua sắm ngay nhé!",
  className,
}: Omit<EmptyStateProps, "icon" | "title">) {
  return (
    <EmptyState
      icon={<ShoppingCart className="w-8 h-8" />}
      title="Giỏ hàng trống"
      description={description}
      actionLabel={actionLabel}
      actionHref={actionHref}
      onAction={onAction}
      className={className}
    />
  );
}

// Preset: EmptyOrders
export function EmptyOrders({
  actionLabel = "Mua sắm ngay",
  actionHref = "/products",
  onAction,
  description = "Bạn chưa thực hiện bất kỳ giao dịch hoặc đơn hàng nào.",
  className,
}: Omit<EmptyStateProps, "icon" | "title">) {
  return (
    <EmptyState
      icon={<Package className="w-8 h-8" />}
      title="Chưa có đơn hàng nào"
      description={description}
      actionLabel={actionLabel}
      actionHref={actionHref}
      onAction={onAction}
      className={className}
    />
  );
}
