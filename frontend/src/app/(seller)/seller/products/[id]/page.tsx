'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Package } from 'lucide-react';
import { toast } from 'sonner';

import sellerProductsApiRequest from '@/apiRequests/products/seller-products';
import { ProductResponseType } from '@/schemaValidations/products/products.schema';
import { getErrorMessage } from '@/lib/http';
import { formatVnd } from '@/lib/format';
import { ProductStatus } from '@/constants/enum.generated';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductStatusBadge } from '@/components/products/product-status-badge';
import { ProductModerationBanner } from '@/components/products/product-moderation-banner';
import { useSocket } from '@/components/providers/socket-provider';

// Tên event WS — khớp backend
const WS_PRODUCT_MODERATED = 'product.moderated';

interface ProductModeratedWsPayload {
  productId: string;
  productName: string;
  action: string;
  message: string;
}

export default function SellerProductDetailPage() {
  const params = useParams();
  const productId = String(params.id);

  const [product, setProduct] = useState<ProductResponseType | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);

  const socket = useSocket();

  const fetchProduct = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const res = await sellerProductsApiRequest.getProductDetail(productId);
        setProduct(res.data ?? null);
        if (!silent) setNotFound(false);
      } catch (error) {
        if (!silent) {
          const msg = getErrorMessage(error);
          toast.error(msg);
          setNotFound(true);
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [productId],
  );

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  useEffect(() => {
    if (!socket) return;
    const onProductModerated = (payload: ProductModeratedWsPayload) => {
      if (payload.productId === productId) {
        fetchProduct(true);
      }
    };
    socket.on(WS_PRODUCT_MODERATED, onProductModerated);
    return () => {
      socket.off(WS_PRODUCT_MODERATED, onProductModerated);
    };
  }, [socket, productId, fetchProduct]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <div className="rounded-2xl border p-6 space-y-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-8 w-1/2 rounded-lg" />
          <Skeleton className="h-5 w-1/3 rounded-lg" />
        </div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 rounded-2xl border bg-card text-center gap-3 animate-fade-in">
        <Package className="h-12 w-12 text-zinc-300 dark:text-zinc-700" />
        <p className="text-base font-semibold text-foreground">
          Không tìm thấy sản phẩm.
        </p>
        <Link href="/seller/products">
          <Button variant="outline" className="rounded-xl">
            Về danh sách sản phẩm
          </Button>
        </Link>
      </div>
    );
  }

  const isSuspended = product.status === ProductStatus.SUSPENDED;
  const mainImage =
    (product.thumbnail_url as string | null) ??
    product.aggregated_gallery?.[0] ??
    null;

  const productStatus = product.status as ProductStatus;
  const moderationReason = product.moderation_reason;
  const productPrice = product.price;
  const formattedPrice = formatVnd.format(productPrice);
  const editLink = `/seller/products/${product.id}/edit`;

  const categoryName = product.category?.name ?? 'Chưa phân danh mục';

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Back */}
      <Link
        href="/seller/products"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" /> Danh sách sản phẩm
      </Link>

      {/* Banner khi bị gỡ */}
      {isSuspended && <ProductModerationBanner reason={moderationReason} />}

      {/* Header: tên + trạng thái + nút Sửa */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              {product.name}
            </h1>
            <ProductStatusBadge status={productStatus} />
          </div>
          <p className="text-sm text-zinc-500">{categoryName}</p>
        </div>

        {isSuspended ? (
          <Button
            disabled
            className="rounded-xl cursor-not-allowed shrink-0"
            title="Sản phẩm đang bị gỡ — không thể chỉnh sửa"
          >
            <Pencil className="h-4 w-4 mr-1.5" /> Chỉnh sửa
          </Button>
        ) : (
          <Link href={editLink}>
            <Button className="rounded-xl bg-violet-600 text-white hover:bg-violet-700 shrink-0">
              <Pencil className="h-4 w-4 mr-1.5" /> Chỉnh sửa
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ảnh */}
        <div className="lg:col-span-1 space-y-3">
          <div className="aspect-square rounded-2xl border bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mainImage}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-12 w-12 text-zinc-400" />
              </div>
            )}
          </div>
          {product.aggregated_gallery &&
            product.aggregated_gallery.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.aggregated_gallery.slice(0, 8).map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    className="aspect-square rounded-lg border overflow-hidden bg-zinc-100 dark:bg-zinc-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${product.name} ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Thông tin */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border bg-card shadow-sm p-6 space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-zinc-500 text-sm">Giá bán</span>
              <span className="text-2xl font-bold text-zinc-950 dark:text-white">
                {formattedPrice}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-4 text-sm">
              <span className="text-zinc-500">Tồn kho</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {product.stock_quantity}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-4 text-sm">
              <span className="text-zinc-500">SKU</span>
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {typeof product.sku === 'string' && product.sku
                  ? product.sku
                  : '—'}
              </span>
            </div>
          </div>

          {/* Mô tả */}
          {typeof product.description === 'string' && product.description && (
            <div className="rounded-2xl border bg-card shadow-sm p-6 space-y-2">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                Mô tả
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}

          {/* Biến thể */}
          {product.has_variants && product.variants.length > 0 && (
            <div className="rounded-2xl border bg-card shadow-sm p-6 space-y-3">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                Biến thể ({product.variants.length})
              </h3>
              <div className="divide-y">
                {product.variants.map((variant) => (
                  <div
                    key={variant.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {variant.name}
                    </span>
                    <span className="text-zinc-500">
                      Kho: {variant.stock_quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
