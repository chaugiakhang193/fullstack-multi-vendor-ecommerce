"use client"; // Định nghĩa đây là một Client Component trong Next.js (chạy phía trình duyệt, sử dụng React Hooks)

import React, { useState, useEffect } from "react";
import Link from "next/link";
// Import các biểu tượng từ thư viện lucide-react để dựng giao diện trực quan
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Loader2,
  Package,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner"; // Thư viện dùng để hiển thị thông báo (toast notification) dạng pop-up

import sellerProductsApiRequest from "@/apiRequests/products/seller-products"; // File định nghĩa các hàm gọi API đến backend cho seller
import { ProductResponseType } from "@/schemaValidations/products/products.schema"; // Kiểu dữ liệu TypeScript của sản phẩm từ schema validation
import { getErrorMessage } from "@/lib/http";
import { Button } from "@/components/ui/button"; // Component nút bấm dùng chung từ Shadcn UI
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"; // Component Dialog (Hộp thoại xác nhận) từ Shadcn UI
import { Pagination } from "@/components/shared/pagination"; // Component phân trang dùng chung

/**
 * Hàm hỗ trợ tính tổng lượng tồn kho của một sản phẩm.
 * - Đây là hàm dự phòng lỗi (fallback) để tránh trường hợp Backend gặp lỗi đồng bộ tồn kho giữa sản phẩm cha và các biến thể.
 * - Nếu sản phẩm có phân loại biến thể (has_variants = true) và có danh sách biến thể: cộng dồn `stock_quantity` của tất cả biến thể.
 * - Ngược lại: trả về giá trị `stock_quantity` của sản phẩm gốc.
 */
function getTotalStock(product: ProductResponseType): number {
  if (product.has_variants && product.variants.length > 0) {
    return product.variants.reduce((sum, v) => sum + v.stock_quantity, 0);
  }
  return product.stock_quantity;
}

/**
 * Hàm định dạng số thành chuỗi tiền tệ Việt Nam Đồng (VND).
 * Ví dụ: 100000 -> 100.000 ₫
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price);
}

export default function SellerProductsPage() {
  // --- ĐỊNH NGHĨA CÁC STATE (TRẠNG THÁI) ---

  // Lưu trữ danh sách sản phẩm của gian hàng được tải về từ API
  const [products, setProducts] = useState<ProductResponseType[]>([]);

  // Lưu trữ metadata phân trang từ API
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  } | null>(null);

  // Số trang hiện tại
  const [page, setPage] = useState(1);
  const limit = 10;

  // Trạng thái hiển thị màn hình đang tải (loading) ban đầu
  const [isLoading, setIsLoading] = useState(true);

  // Từ khóa tìm kiếm nhập bởi người dùng (để tìm theo tên hoặc SKU)
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Bộ lọc tồn kho: 'all' (Tất cả), 'in_stock' (Còn hàng), 'out_of_stock' (Hết hàng)
  const [stockFilter, setStockFilter] = useState<
    "all" | "in_stock" | "out_of_stock"
  >("all");

  // Lưu ID của sản phẩm đang được thay đổi trạng thái Ẩn/Hiện (để hiển thị vòng quay loading tương ứng)
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Lưu thông tin sản phẩm mà người dùng nhấn nút "Xóa" và chuẩn bị xác nhận xóa
  const [deletingProduct, setDeletingProduct] =
    useState<ProductResponseType | null>(null);

  // Trạng thái đang gửi yêu cầu xóa sản phẩm lên API (để hiển thị loading trên nút xóa)
  const [isDeleting, setIsDeleting] = useState(false);

  // --- HIỆU ỨNG DEBOUNCE TÌM KIẾM ---
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Reset về trang 1 khi thay đổi từ khóa tìm kiếm hoặc bộ lọc tồn kho
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery, stockFilter]);

  // --- HÀM GỌI API LẤY DANH SÁCH SẢN PHẨM ---
  const fetchProducts = async (currentPage: number, search: string, stock: typeof stockFilter) => {
    setIsLoading(true);
    try {
      // Gọi API lấy kho hàng của Seller hiện tại kèm các tham số phân trang & lọc
      const res = await sellerProductsApiRequest.getSellerInventory({
        page: currentPage,
        limit,
        q: search ? search.trim() : undefined,
        stock_status: stock,
      });

      // Nếu API trả về thành công, lưu dữ liệu sản phẩm và phân trang
      setProducts(res.data?.items ?? []);
      setMeta(res.data?.meta ?? null);
    } catch (error: any) {
      // Xử lý lỗi: lấy thông báo lỗi từ payload hoặc từ message hệ thống
      const msg = getErrorMessage(error);
      toast.error(msg);
    } finally {
      // Kết thúc trạng thái tải
      setIsLoading(false);
    }
  };

  // Gọi fetchProducts khi trang hiện tại, từ khóa đã debounce hoặc bộ lọc thay đổi
  useEffect(() => {
    fetchProducts(page, debouncedSearchQuery, stockFilter);
  }, [page, debouncedSearchQuery, stockFilter]);

  // --- XỬ LÝ ẨN / HIỆN SẢN PHẨM ---
  // Gọi API cập nhật thông tin sản phẩm. Dùng FormData do backend quy định sử dụng multipart/form-data
  const handleToggleHidden = async (product: ProductResponseType) => {
    const productId = product.id;
    setTogglingId(productId); // Đánh dấu sản phẩm này đang xử lý
    try {
      const formData = new FormData();
      const newIsHidden = !product.is_hidden; // Đảo trạng thái ẩn/hiện hiện tại
      formData.append("is_hidden", String(newIsHidden));

      // Gọi API cập nhật
      await sellerProductsApiRequest.updateProduct(productId, formData);

      // Cập nhật ngay lập tức trạng thái ẩn/hiện trong state cục bộ để UI thay đổi mượt mà mà không cần fetch lại toàn bộ danh sách
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, is_hidden: newIsHidden } : p,
        ),
      );
      // Hiển thị thông báo thành công tương ứng
      toast.success(newIsHidden ? "Đã ẩn sản phẩm." : "Đã hiện sản phẩm.");
    } catch (error: any) {
      const msg = getErrorMessage(error);
      toast.error(msg);
    } finally {
      setTogglingId(null); // // Giải phóng trạng thái xử lý ẩn/hiện
    }
  };

  // --- XỬ LÝ XÓA SẢN PHẨM ---
  // Thực hiện soft delete sản phẩm sau khi người dùng xác nhận ở hộp thoại Dialog
  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setIsDeleting(true);
    try {
      // Gọi API xóa sản phẩm theo ID
      await sellerProductsApiRequest.deleteProduct(deletingProduct.id);
      toast.success(`Đã xóa sản phẩm "${deletingProduct.name}".`);
      setDeletingProduct(null); // Đóng Dialog xác nhận xóa
      fetchProducts(page, debouncedSearchQuery, stockFilter); // Tải lại danh sách sản phẩm mới từ server để cập nhật bảng
    } catch (error: any) {
      const msg = getErrorMessage(error);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // --- GIAO DIỆN KHI ĐANG TẢI DỮ LIỆU (LOADING SKELETON) ---
  // Tạo hiệu ứng khung xương màu xám chuyển động nhấp nháy (skeleton animation) thay cho loading xoay truyền thống
  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Skeleton cho phần Tiêu đề và Nút thêm sản phẩm */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-9 w-64 bg-muted rounded-lg animate-pulse" />
            <div className="h-4 w-80 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-9 w-36 bg-muted rounded-lg animate-pulse" />
        </div>
        {/* Skeleton cho thanh tìm kiếm và bộ lọc */}
        <div className="h-14 bg-muted rounded-xl animate-pulse" />
        {/* Skeleton cho Bảng danh sách sản phẩm (mô phỏng 5 dòng) */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 border-b last:border-0"
            >
              <div className="h-12 w-12 bg-muted rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                <div className="h-3 w-24 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
              <div className="h-4 w-16 bg-muted rounded animate-pulse" />
              <div className="h-6 w-20 bg-muted rounded-full animate-pulse" />
              <div className="h-8 w-20 bg-muted rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- GIAO DIỆN CHÍNH CỦA TRANG QUẢN LÝ ---
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Tiêu đề trang & Nút thêm sản phẩm */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Quản lý Sản phẩm
          </h1>
          <p className="text-muted-foreground text-base mt-2">
            Thêm, chỉnh sửa và quản lý danh sách sản phẩm trong cửa hàng của bạn.
          </p>
        </div>
        {/* Đường dẫn chuyển hướng đến trang tạo sản phẩm mới */}
        <Link href="/seller/products/create">
          <button className="flex items-center text-sm font-bold px-6 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition shadow-md shadow-violet-500/20">
            <Plus className="h-5 w-5 mr-2" /> Thêm sản phẩm
          </button>
        </Link>
      </div>

      {/* Thanh tìm kiếm và bộ lọc trạng thái tồn kho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 bg-card p-6 rounded-2xl border">
        {/* Ô nhập tìm kiếm */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên hoặc SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-6 py-3.5 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
          />
        </div>
        {/* Menu thả xuống (Dropdown) để lọc tồn kho */}
        <div className="flex items-center space-x-3">
          <Filter className="h-5 w-5 text-muted-foreground shrink-0" />
          <select
            value={stockFilter}
            onChange={(e) =>
              setStockFilter(e.target.value as typeof stockFilter)
            }
            className="text-sm font-bold px-4 py-3 border rounded-xl hover:bg-muted transition bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="in_stock">Còn hàng</option>
            <option value="out_of_stock">Hết hàng</option>
          </select>
        </div>
      </div>

      {/* Trường hợp danh sách sản phẩm trống (Không tìm thấy kết quả hoặc Chưa có sản phẩm) */}
      {products.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border bg-card text-center gap-3">
          <Package className="h-12 w-12 text-zinc-300 dark:text-zinc-700" />
          <p className="text-base font-semibold text-foreground">
            {searchQuery || stockFilter !== "all"
              ? "Không tìm thấy sản phẩm phù hợp."
              : "Chưa có sản phẩm nào. Thêm sản phẩm đầu tiên!"}
          </p>
          {/* Chỉ hiện nút tạo nếu cửa hàng chưa có bất kỳ sản phẩm nào (không phải do bộ lọc tìm kiếm) */}
          {!searchQuery && stockFilter === "all" && (
            <Link href="/seller/products/create">
              <button className="flex items-center text-xs font-semibold px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition shadow-md shadow-violet-500/20 mt-1">
                <Plus className="h-4 w-4 mr-1.5" /> Thêm sản phẩm đầu tiên
              </button>
            </Link>
          )}
        </div>
      )}

      {/* Bảng danh sách sản phẩm */}
      {products.length > 0 && (
        <div className="rounded-2xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-sm font-extrabold text-muted-foreground uppercase">
                  <th className="p-6 w-[100px]">Ảnh</th>
                  <th className="p-6">Tên sản phẩm</th>
                  <th className="p-6">SKU</th>
                  <th className="p-6">Danh mục</th>
                  <th className="p-6 text-right">Giá bán</th>
                  <th className="p-6 text-center">Tồn kho</th>
                  <th className="p-6 text-center">Trạng thái</th>
                  <th className="p-6 text-center">Ẩn/Hiện</th>
                  <th className="p-6 text-center w-[120px]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y text-base">
                {products.map((product) => {
                  const totalStock = getTotalStock(product);
                  const isOutOfStock = totalStock === 0;
                  const isToggling = togglingId === product.id; // Kiểm tra xem sản phẩm cụ thể này có đang chạy hành động ẩn/hiện không

                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {/* Cột 1: Ảnh thumbnail của sản phẩm */}
                      <td className="p-6">
                        <div className="h-16 w-16 rounded-xl border bg-zinc-100 dark:bg-zinc-900 overflow-hidden shrink-0">
                          {product.thumbnail_url ? (
                            <img
                              src={product.thumbnail_url as string}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            // Hiển thị icon hộp quà mặc định nếu sản phẩm không có ảnh
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-7 w-7 text-zinc-400" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Cột 2: Tên sản phẩm & nhãn thông tin phân loại (biến thể) nếu có */}
                      <td className="p-6">
                        <p className="font-bold text-foreground line-clamp-2 max-w-[320px] text-base leading-snug">
                          {product.name}
                        </p>
                        {product.has_variants && (
                          <span className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950 px-2 py-0.5 rounded-full mt-1.5 inline-block">
                            {product.variants.length} biến thể
                          </span>
                        )}
                      </td>

                      {/* Cột 3: Mã định danh sản phẩm (SKU) */}
                      <td className="p-6 font-mono text-sm text-muted-foreground">
                        {typeof product.sku === "string" && product.sku
                          ? product.sku
                          : "—"}
                      </td>

                      {/* Cột 4: Tên danh mục của sản phẩm */}
                      <td className="p-6 text-sm text-muted-foreground">
                        {product.category?.name ?? "—"}
                      </td>

                      {/* Cột 5: Giá bán lẻ (Được định dạng sang tiền VND) */}
                      <td className="p-6 text-right font-bold text-foreground">
                        {formatPrice(product.price)}
                      </td>

                      {/* Cột 6: Số lượng tồn kho (Đổi màu sắc tùy theo mức độ tồn kho) */}
                      <td className="p-6 text-center">
                        <span
                          className={`font-bold text-base ${
                            isOutOfStock
                              ? "text-rose-600 dark:text-rose-400" // Đỏ khi hết hàng
                              : totalStock <= 5
                                ? "text-amber-600 dark:text-amber-400" // Cam khi sắp hết hàng (<= 5)
                                : "text-foreground" // Bình thường
                          }`}
                        >
                          {totalStock}
                        </span>
                      </td>

                      {/* Cột 7: Nhãn trạng thái tồn kho (Hết hàng / Còn hàng) */}
                      <td className="p-6 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                            isOutOfStock
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          }`}
                        >
                          {isOutOfStock ? "Hết hàng" : "Còn hàng"}
                        </span>
                      </td>

                      {/* Cột 8: Nút bật/tắt (Toggle) trạng thái ẩn hoặc hiện sản phẩm ngoài trang chủ cửa hàng */}
                      <td className="p-6 text-center">
                        <button
                          onClick={() => handleToggleHidden(product)}
                          disabled={isToggling}
                          title={
                            product.is_hidden
                              ? "Đang ẩn — Nhấn để hiện"
                              : "Đang hiện — Nhấn để ẩn"
                          }
                          className={`p-2 rounded-lg transition ${
                            product.is_hidden
                              ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950"
                              : "text-emerald-600 hover:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 className="h-5 w-5 animate-spin" /> // Spinner quay khi đang gọi API
                          ) : product.is_hidden ? (
                            <EyeOff className="h-5 w-5" /> // Biểu tượng mắt gạch chéo (đang ẩn)
                          ) : (
                            <Eye className="h-5 w-5" /> // Biểu tượng con mắt mở (đang hiện)
                          )}
                        </button>
                      </td>

                      {/* Cột 9: Các thao tác sửa và xóa sản phẩm */}
                      <td className="p-6">
                        <div className="flex items-center justify-center space-x-2">
                          {/* Nút sửa dẫn đến trang sửa chi tiết sản phẩm qua ID */}
                          <Link href={`/seller/products/${product.id}/edit`}>
                            <button
                              className="p-2 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-950 text-violet-600 dark:text-violet-400 transition"
                              title="Chỉnh sửa sản phẩm"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                          </Link>
                          {/* Nút xóa sản phẩm, nhấn vào sẽ kích hoạt state deletingProduct để mở Dialog xác nhận */}
                          <button
                            onClick={() => setDeletingProduct(product)}
                            className="p-1.5 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600 dark:text-rose-400 transition"
                            title="Xóa sản phẩm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Dưới bảng: Hiển thị tóm tắt số lượng sản phẩm được lọc thành công */}
          <div className="px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              Hiển thị{" "}
              <span className="font-bold text-foreground">
                {products.length}
              </span>{" "}
              / {meta?.totalItems ?? 0} sản phẩm
            </div>
          </div>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={meta.totalPages}
          onPageChange={(p) => setPage(p)}
        />
      )}

      {/* --- DIALOG HỘP THOẠI XÁC NHẬN XÓA SẢN PHẨM --- */}
      <Dialog
        open={!!deletingProduct} // Mở khi deletingProduct khác null
        onOpenChange={(open) => {
          if (!open) setDeletingProduct(null); // Nếu đóng Dialog thì reset deletingProduct về null
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold mt-3">
              Xác nhận xóa sản phẩm
            </DialogTitle>
            <DialogDescription className="text-center text-sm">
              Bạn có chắc chắn muốn xóa sản phẩm{" "}
              <span className="font-semibold text-foreground">
                &ldquo;{deletingProduct?.name}&rdquo;
              </span>
              ? Thao tác này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            {/* Nút bấm thực hiện hành động xóa */}
            <Button
              variant="destructive"
              className="w-full font-bold text-xs"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Đang xóa...
                </>
              ) : (
                "Xóa sản phẩm"
              )}
            </Button>
            {/* Nút hủy để tắt hộp thoại */}
            <Button
              variant="outline"
              className="w-full font-bold text-xs"
              onClick={() => setDeletingProduct(null)}
              disabled={isDeleting}
            >
              Hủy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
