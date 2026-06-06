"use client";

// Libraries
import React, { useState } from "react";
import { Layers, Eye, Smartphone, Monitor } from "lucide-react";

// Components
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";

export default function TestPaginationPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(12);

  // Tính toán chỉ số bắt đầu và kết thúc của các phần tử trong trang
  const itemsPerPage = 5;
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = currentPage * itemsPerPage;

  // Tạo danh sách sản phẩm giả lập dựa trên trang hiện tại
  const mockProducts = React.useMemo(() => {
    const list = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const mockProduct = {
        id: `prod-${i}`,
        name: `Sản phẩm Premium #${i}`,
        price: `${(i * 15000).toLocaleString("vi-VN")} đ`,
        sku: `SKU-PRM-${1000 + i}`,
      };
      list.push(mockProduct);
    }
    return list;
  }, [startIndex, endIndex]);

  // Handler xử lý chuyển trang
  const handlePageChange = (page: number) => {
    const targetPage = page;
    setCurrentPage(targetPage);
  };

  // Handler thay đổi tổng số trang để test các trường hợp khác nhau
  const changeTotalPages = (total: number) => {
    const targetTotal = total;
    const initialPage = 1;
    setTotalPages(targetTotal);
    setCurrentPage(initialPage);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-4 sm:p-6 md:p-8 animate-fade-in pb-20">
      {/* Tiêu đề trang */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Kiểm thử Component Phân Trang (Pagination)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Trang demo và kiểm tra thiết kế responsive, các trạng thái hoạt động của component Pagination dùng chung.
        </p>
      </div>

      {/* Cấu hình bộ dữ liệu test */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
        <h3 className="font-semibold text-lg leading-none mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5 text-violet-500" />
          <span>Cấu hình tổng số trang</span>
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Nhấp chọn một cấu hình dưới đây để thay đổi số trang tối đa và kiểm tra xem logic hiển thị dấu ba chấm `...` có chạy đúng không:
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={totalPages === 5 ? "default" : "outline"}
            onClick={() => changeTotalPages(5)}
            className="text-xs font-semibold rounded-lg transition"
          >
            Tổng 5 trang (Không có dấu ...)
          </Button>
          <Button
            variant={totalPages === 12 ? "default" : "outline"}
            onClick={() => changeTotalPages(12)}
            className="text-xs font-semibold rounded-lg transition"
          >
            Tổng 12 trang (Dấu ... đơn)
          </Button>
          <Button
            variant={totalPages === 30 ? "default" : "outline"}
            onClick={() => changeTotalPages(30)}
            className="text-xs font-semibold rounded-lg transition"
          >
            Tổng 30 trang (Dấu ... kép ở giữa)
          </Button>
        </div>
      </div>

      {/* Hiển thị dữ liệu giả lập */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/40 flex justify-between items-center">
          <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-violet-500" />
            Danh sách dữ liệu giả lập (Trang {currentPage} / {totalPages})
          </span>
          <span className="text-xs text-zinc-500">
            Hiển thị sản phẩm từ {startIndex} đến {endIndex}
          </span>
        </div>

        <div className="divide-y">
          {mockProducts.map((product) => {
            const productKey = product.id;
            return (
              <div
                key={productKey}
                className="p-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors flex items-center justify-between"
              >
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{product.name}</h4>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">{product.sku}</p>
                </div>
                <div className="text-sm font-bold text-violet-600 dark:text-violet-400">
                  {product.price}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Render Pagination component cần test */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-4 flex flex-col items-center">
        <div className="w-full max-w-md text-center mb-2">
          <span className="text-xs text-muted-foreground">
            Component Pagination:
          </span>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>

      {/* Ghi chú test responsive */}
      <div className="rounded-xl border border-dashed p-6 bg-zinc-50/50 dark:bg-zinc-900/20 space-y-3">
        <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase">
          💡 Hướng dẫn kiểm thử Responsive (Xem trên di động):
        </h4>
        <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
          <li className="flex items-start gap-2">
            <Monitor className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
            <span>
              <strong>Chế độ Desktop:</strong> Kiểm tra xem dấu ba chấm `...` hiển thị chính xác ở trang đầu, giữa và cuối khi chuyển trang.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Smartphone className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
            <span>
              <strong>Chế độ Mobile (nhỏ hơn 640px):</strong> Dùng Chrome DevTools giả lập thiết bị di động. Kiểm tra xem các nút số trang có ẩn đi và thay thế bằng văn bản <em>"Trang X / Y"</em> để giữ giao diện nhỏ gọn, không bị tràn viền không.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
