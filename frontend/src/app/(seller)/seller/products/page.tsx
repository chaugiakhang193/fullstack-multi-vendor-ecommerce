"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
import { toast } from "sonner";

import productsApiRequest from "@/apiRequests/products";
import { ProductResponseType } from "@/schemaValidations/products.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Tính tổng tồn kho: nếu có biến thể thì cộng tồn kho từng biến thể, ngược lại dùng stock_quantity gốc
function getTotalStock(product: ProductResponseType): number {
  if (product.has_variants && product.variants.length > 0) {
    return product.variants.reduce((sum, v) => sum + v.stock_quantity, 0);
  }
  return product.stock_quantity;
}

// Format giá tiền VND
function formatPrice(price: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price);
}

export default function SellerProductsPage() {
  const [products, setProducts] = useState<ProductResponseType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "out_of_stock">("all");

  // State cho toggle is_hidden đang xử lý (lưu id sản phẩm đang toggle)
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // State cho confirm dialog xóa
  const [deletingProduct, setDeletingProduct] = useState<ProductResponseType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch danh sách sản phẩm
  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const res = await productsApiRequest.getSellerInventory();
      setProducts(res.data ?? []);
    } catch (error: any) {
      const msg = error?.payload?.message || error?.message || "Không thể tải danh sách sản phẩm.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Filter client-side theo tên/SKU và trạng thái tồn kho
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const query = searchQuery.toLowerCase().trim();
      const productSku = typeof product.sku === "string" ? product.sku.toLowerCase() : "";
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        productSku.includes(query);

      const totalStock = getTotalStock(product);
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in_stock" && totalStock > 0) ||
        (stockFilter === "out_of_stock" && totalStock === 0);

      return matchesSearch && matchesStock;
    });
  }, [products, searchQuery, stockFilter]);

  // Toggle is_hidden — gửi qua FormData vì endpoint nhận multipart/form-data
  const handleToggleHidden = async (product: ProductResponseType) => {
    const productId = product.id;
    setTogglingId(productId);
    try {
      const formData = new FormData();
      const newIsHidden = !product.is_hidden;
      formData.append("is_hidden", String(newIsHidden));

      await productsApiRequest.updateProduct(productId, formData);

      // Cập nhật state local ngay lập tức để UI phản hồi nhanh
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, is_hidden: newIsHidden } : p
        )
      );
      toast.success(newIsHidden ? "Đã ẩn sản phẩm." : "Đã hiện sản phẩm.");
    } catch (error: any) {
      const msg = error?.payload?.message || error?.message || "Không thể cập nhật trạng thái ẩn/hiện.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setTogglingId(null);
    }
  };

  // Xóa sản phẩm (soft delete)
  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setIsDeleting(true);
    try {
      await productsApiRequest.deleteProduct(deletingProduct.id);
      toast.success(`Đã xóa sản phẩm "${deletingProduct.name}".`);
      setDeletingProduct(null);
      fetchProducts();
    } catch (error: any) {
      const msg = error?.payload?.message || error?.message || "Không thể xóa sản phẩm.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-9 w-64 bg-muted rounded-lg animate-pulse" />
            <div className="h-4 w-80 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-9 w-36 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="h-14 bg-muted rounded-xl animate-pulse" />
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Quản lý Sản phẩm
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Thêm, chỉnh sửa và quản lý danh sách sản phẩm trong cửa hàng của bạn.
          </p>
        </div>
        <Link href="/seller/products/create">
          <button className="flex items-center text-xs font-semibold px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition shadow-md shadow-violet-500/20">
            <Plus className="h-4 w-4 mr-1.5" /> Thêm sản phẩm
          </button>
        </Link>
      </div>

      {/* Filter và Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên hoặc SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
            className="text-xs font-semibold px-3 py-2 border rounded-lg hover:bg-muted transition bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="in_stock">Còn hàng</option>
            <option value="out_of_stock">Hết hàng</option>
          </select>
        </div>
      </div>

      {/* Empty State */}
      {filteredProducts.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border bg-card text-center gap-3">
          <Package className="h-12 w-12 text-zinc-300 dark:text-zinc-700" />
          <p className="text-base font-semibold text-foreground">
            {searchQuery || stockFilter !== "all"
              ? "Không tìm thấy sản phẩm phù hợp."
              : "Chưa có sản phẩm nào. Thêm sản phẩm đầu tiên!"}
          </p>
          {!searchQuery && stockFilter === "all" && (
            <Link href="/seller/products/create">
              <button className="flex items-center text-xs font-semibold px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition shadow-md shadow-violet-500/20 mt-1">
                <Plus className="h-4 w-4 mr-1.5" /> Thêm sản phẩm đầu tiên
              </button>
            </Link>
          )}
        </div>
      )}

      {/* Bảng sản phẩm */}
      {filteredProducts.length > 0 && (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-bold text-muted-foreground uppercase">
                  <th className="p-4 w-[60px]">Ảnh</th>
                  <th className="p-4">Tên sản phẩm</th>
                  <th className="p-4">SKU</th>
                  <th className="p-4">Danh mục</th>
                  <th className="p-4 text-right">Giá bán</th>
                  <th className="p-4 text-center">Tồn kho</th>
                  <th className="p-4 text-center">Trạng thái</th>
                  <th className="p-4 text-center">Ẩn/Hiện</th>
                  <th className="p-4 text-center w-[100px]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {filteredProducts.map((product) => {
                  const totalStock = getTotalStock(product);
                  const isOutOfStock = totalStock === 0;
                  const isToggling = togglingId === product.id;

                  return (
                    <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                      {/* Ảnh thumbnail */}
                      <td className="p-4">
                        <div className="h-12 w-12 rounded-lg border bg-zinc-100 dark:bg-zinc-900 overflow-hidden shrink-0">
                          {product.thumbnail_url ? (
                            <img
                              src={product.thumbnail_url as string}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-5 w-5 text-zinc-400" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Tên sản phẩm */}
                      <td className="p-4">
                        <p className="font-semibold text-foreground line-clamp-2 max-w-[200px]">
                          {product.name}
                        </p>
                        {product.has_variants && (
                          <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950 px-1.5 py-0.5 rounded-full mt-1 inline-block">
                            {product.variants.length} biến thể
                          </span>
                        )}
                      </td>

                      {/* SKU */}
                      <td className="p-4 font-mono text-xs text-muted-foreground">
                        {typeof product.sku === "string" && product.sku ? product.sku : "—"}
                      </td>

                      {/* Danh mục */}
                      <td className="p-4 text-xs text-muted-foreground">
                        {product.category?.name ?? "—"}
                      </td>

                      {/* Giá bán */}
                      <td className="p-4 text-right font-semibold text-foreground">
                        {formatPrice(product.price)}
                      </td>

                      {/* Tồn kho */}
                      <td className="p-4 text-center">
                        <span
                          className={`font-bold ${
                            isOutOfStock
                              ? "text-rose-600 dark:text-rose-400"
                              : totalStock <= 5
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-foreground"
                          }`}
                        >
                          {totalStock}
                        </span>
                      </td>

                      {/* Trạng thái tồn kho */}
                      <td className="p-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isOutOfStock
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          }`}
                        >
                          {isOutOfStock ? "Hết hàng" : "Còn hàng"}
                        </span>
                      </td>

                      {/* Toggle Ẩn/Hiện */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleToggleHidden(product)}
                          disabled={isToggling}
                          title={product.is_hidden ? "Đang ẩn — Nhấn để hiện" : "Đang hiện — Nhấn để ẩn"}
                          className={`p-1.5 rounded-md transition ${
                            product.is_hidden
                              ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950"
                              : "text-emerald-600 hover:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : product.is_hidden ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* Thao tác */}
                      <td className="p-4">
                        <div className="flex items-center justify-center space-x-1">
                          <Link href={`/seller/products/${product.id}/edit`}>
                            <button
                              className="p-1.5 rounded-md hover:bg-violet-100 dark:hover:bg-violet-950 text-violet-600 dark:text-violet-400 transition"
                              title="Chỉnh sửa sản phẩm"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          </Link>
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

          {/* Footer tổng số */}
          <div className="px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
            Hiển thị <span className="font-bold text-foreground">{filteredProducts.length}</span> / {products.length} sản phẩm
          </div>
        </div>
      )}

      {/* Confirm Dialog xóa sản phẩm */}
      <Dialog
        open={!!deletingProduct}
        onOpenChange={(open) => {
          if (!open) setDeletingProduct(null);
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
