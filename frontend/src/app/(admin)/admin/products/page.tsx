import React from "react";
import { Package } from "lucide-react";

export default function AdminProductsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Quản lý Sản phẩm
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kiểm soát tất cả sản phẩm đang đăng bán trên toàn hệ thống sàn.
        </p>
      </div>

      {/* Placeholder content card */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="p-4 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 mb-4">
          <Package className="h-8 w-8" />
        </div>
        <h3 className="font-semibold text-lg">Giám sát sản phẩm toàn sàn</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Giao diện tìm kiếm, khóa/mở khóa sản phẩm vi phạm chính sách đang được
          phát triển.
        </p>
      </div>
    </div>
  );
}
