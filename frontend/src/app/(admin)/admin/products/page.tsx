'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package, ShieldOff, RotateCcw, AlertTriangle, X } from 'lucide-react';
import {
  useAdminProductsList,
  useTakeDownProduct,
  useRestoreProduct,
} from '@/hooks/useAdminProducts';
import { ProductStatusBadge } from '@/components/products/product-status-badge';
import { Pagination } from '@/components/shared/pagination';
import { formatVnd } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TakeDownProductBody,
  type AdminProductItemType,
} from '@/schemaValidations/products/products.schema';
import { ProductStatus } from '@/constants/enum.generated';

type ProductFilter = ProductStatus | 'all';
const FILTER_OPTIONS: { value: ProductFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: ProductStatus.ACTIVE, label: 'Đang bán' },
  { value: ProductStatus.SUSPENDED, label: 'Đã gỡ' },
];

function AdminProductsInner() {
  const searchParams = useSearchParams();
  const shopIdFromUrl = searchParams.get('shop_id') || undefined;

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [filterStatus, setFilterStatus] = useState<ProductFilter>('all');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Trạng thái Dialog
  const [selected, setSelected] = useState<AdminProductItemType | null>(null);
  const [isTakeDownOpen, setIsTakeDownOpen] = useState<boolean>(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const statusParam = filterStatus === 'all' ? undefined : filterStatus;

  const queryParams = {
    page: currentPage,
    q: searchTerm || undefined,
    status: statusParam,
    shopId: shopIdFromUrl,
  };

  const { data: listData, isLoading } = useAdminProductsList(queryParams);
  const list = listData?.data;
  const items = list?.items || [];
  const totalPages = list?.meta?.totalPages || 1;

  const { mutate: takeDown, isPending: isTakingDown } = useTakeDownProduct({
    onSuccess: () => {
      setIsTakeDownOpen(false);
      setSelected(null);
      setReason('');
      setValidationError(null);
    },
  });

  const { mutate: restore, isPending: isRestoring } = useRestoreProduct({
    onSuccess: () => {
      setIsRestoreOpen(false);
      setSelected(null);
    },
  });

  const handlePageChange = (page: number) => setCurrentPage(page);

  const handleFilterChange = (next: ProductFilter) => {
    setFilterStatus(next);
    setCurrentPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(searchInput.trim());
    setCurrentPage(1);
  };

  const handleOpenTakeDown = (product: AdminProductItemType) => {
    setSelected(product);
    setReason('');
    setValidationError(null);
    setIsTakeDownOpen(true);
  };

  const handleOpenRestore = (product: AdminProductItemType) => {
    setSelected(product);
    setIsRestoreOpen(true);
  };

  const handleConfirmTakeDown = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const parsed = TakeDownProductBody.safeParse({ reason });
    if (!parsed.success) {
      const firstError =
        parsed.error.errors[0]?.message || 'Lý do không hợp lệ.';
      setValidationError(firstError);
      return;
    }
    if (!selected) return;

    takeDown({ productId: selected.id, body: { reason } });
  };

  const handleConfirmRestore = () => {
    if (!selected) return;
    restore(selected.id);
  };

  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-5 w-96 rounded-lg" />
        </div>
        <div className="rounded-2xl border p-6 space-y-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const hasShopId = !!shopIdFromUrl;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Quản lý Sản phẩm
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Giám sát và kiểm duyệt sản phẩm vi phạm chính sách trên toàn sàn.
        </p>
      </div>

      {/* Chip lọc theo shop (từ URL param) */}
      {hasShopId && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Đang lọc theo shop:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-3 py-1 font-medium dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-950">
            {shopIdFromUrl}
            <a href="/admin/products" className="hover:text-violet-900">
              <X className="h-3.5 w-3.5" />
            </a>
          </span>
        </div>
      )}

      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        {/* Toolbar: search + status filter */}
        <div className="px-6 py-5 border-b flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-zinc-50/50 dark:bg-zinc-900/10">
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center gap-2 w-full max-w-sm"
          >
            <Input
              placeholder="Tìm theo tên sản phẩm..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="rounded-lg"
            />
            <Button
              type="submit"
              variant="outline"
              className="rounded-lg shrink-0"
            >
              Tìm
            </Button>
          </form>

          <div className="inline-flex rounded-lg border p-1 bg-zinc-100/50 dark:bg-zinc-900/50 text-xs shrink-0">
            {FILTER_OPTIONS.map((option) => {
              const isSelected = filterStatus === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleFilterChange(option.value)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    isSelected
                      ? 'bg-white shadow-xs text-zinc-900 dark:bg-zinc-800 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="p-4 rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-950 mb-3">
              <Package className="h-8 w-8" />
            </div>
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Không tìm thấy sản phẩm nào
            </h4>
            <p className="text-sm text-zinc-500 max-w-xs mt-1">
              Thử đổi bộ lọc hoặc từ khóa tìm kiếm.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse text-left">
              <thead>
                <tr className="border-b bg-zinc-100/40 text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400">
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Sản phẩm
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Cửa hàng
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Giá
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((product) => {
                  const isSuspended =
                    product.status === ProductStatus.SUSPENDED;
                  const isActive = product.status === ProductStatus.ACTIVE;
                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/5 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {product.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.thumbnail_url}
                              alt={product.name}
                              className="h-10 w-10 rounded-lg object-cover border"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                              <Package className="h-4 w-4 text-zinc-400" />
                            </div>
                          )}
                          <span
                            className="font-medium text-zinc-900 dark:text-zinc-100 max-w-[240px] truncate"
                            title={product.name}
                          >
                            {product.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-zinc-500">
                        {product.shop?.name || '—'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-zinc-950 dark:text-white">
                        {formatVnd.format(product.price)}
                      </td>
                      <td className="px-6 py-4">
                        <ProductStatusBadge status={product.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isActive && (
                          <Button
                            onClick={() => handleOpenTakeDown(product)}
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-sm font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 dark:text-rose-400 dark:border-rose-950 dark:hover:bg-rose-950/20"
                          >
                            <ShieldOff className="h-4 w-4 mr-1.5" />
                            Gỡ
                          </Button>
                        )}
                        {isSuspended && (
                          <Button
                            onClick={() => handleOpenRestore(product)}
                            size="sm"
                            className="rounded-lg text-sm font-semibold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-xs"
                          >
                            <RotateCcw className="h-4 w-4 mr-1.5" />
                            Khôi phục
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 border-t flex justify-end">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>

      {/* Dialog Take-down */}
      <Dialog open={isTakeDownOpen} onOpenChange={setIsTakeDownOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ShieldOff className="h-5.5 w-5.5 text-rose-600 dark:text-rose-400" />
              Gỡ sản phẩm
            </DialogTitle>
            <DialogDescription>
              Sản phẩm sẽ bị ẩn khỏi sàn. Hệ thống gửi thông báo (và email) cho
              người bán kèm lý do.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmTakeDown} className="space-y-5">
            {selected && (
              <div className="flex justify-between border-b pb-3 text-sm">
                <span className="text-zinc-500">Sản phẩm:</span>
                <span
                  className="font-semibold max-w-[240px] truncate"
                  title={selected.name}
                >
                  {selected.name}
                </span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="reason" className="font-medium">
                Lý do gỡ
              </Label>
              <Input
                id="reason"
                placeholder="Ví dụ: Hình ảnh vi phạm chính sách nội dung..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isTakingDown}
                className="rounded-xl px-4 py-5"
                required
              />
            </div>
            {validationError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-2 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-950/30">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTakeDownOpen(false)}
                disabled={isTakingDown}
                className="rounded-xl py-5"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                disabled={isTakingDown || !reason}
                className="rounded-xl py-5 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
              >
                {isTakingDown ? 'Đang gỡ...' : 'Gỡ sản phẩm'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Restore */}
      <Dialog open={isRestoreOpen} onOpenChange={setIsRestoreOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <RotateCcw className="h-5.5 w-5.5 text-emerald-600 dark:text-emerald-400" />
              Khôi phục sản phẩm
            </DialogTitle>
            <DialogDescription>
              Sản phẩm sẽ hiển thị và bán trở lại. Người bán được thông báo khôi
              phục.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="flex justify-between border-b pb-3 text-sm">
              <span className="text-zinc-500">Sản phẩm:</span>
              <span
                className="font-semibold max-w-[240px] truncate"
                title={selected.name}
              >
                {selected.name}
              </span>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRestoreOpen(false)}
              disabled={isRestoring}
              className="rounded-xl py-5"
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              onClick={handleConfirmRestore}
              disabled={isRestoring}
              className="rounded-xl py-5 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isRestoring ? 'Đang khôi phục...' : 'Khôi phục'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminProductsPage() {
  const loadingFallback = (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-5 w-96 rounded-lg" />
      </div>
      <div className="rounded-2xl border p-6 space-y-4">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    </div>
  );

  return (
    <Suspense fallback={loadingFallback}>
      <AdminProductsInner />
    </Suspense>
  );
}
