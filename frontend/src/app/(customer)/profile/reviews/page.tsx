'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useReviewableItems } from '@/hooks/useReviews';
import { ReviewForm } from '@/components/reviews/review-form';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, Gift } from 'lucide-react';
import Link from 'next/link';

export default function CustomerReviewsPage() {
  const [page, setPage] = useState(1);
  const { data: reviewableRes, isLoading } = useReviewableItems({
    page,
    limit: 10,
  });

  const [selectedItem, setSelectedItem] = useState<{
    orderItemId: string;
    productName: string;
    variantName?: string | null;
  } | null>(null);

  const reviewableData = reviewableRes?.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5 border-b pb-4">
        <h1 className="text-xl font-black text-foreground">
          Đánh giá sản phẩm
        </h1>
        <p className="text-xs text-muted-foreground font-semibold">
          Danh sách sản phẩm bạn đã mua thành công và có thể viết nhận xét, đánh
          giá.
        </p>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
        </div>
      ) : !reviewableData || reviewableData.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 border bg-white dark:bg-zinc-950 rounded-2xl p-8 space-y-4">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border rounded-full text-muted-foreground">
            <Gift className="h-8 w-8 text-violet-600" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h3 className="font-extrabold text-foreground text-sm">
              Không có sản phẩm chờ đánh giá
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed font-semibold">
              Các sản phẩm bạn mua sau khi giao hàng thành công sẽ xuất hiện ở
              đây để bạn đánh giá.
            </p>
          </div>
          <Link href="/" className="inline-block pt-1">
            <Button className="text-xs font-bold px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl">
              Tiếp tục mua sắm
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="divide-y border rounded-2xl bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
            {reviewableData.items.map((item) => (
              <div
                key={item.order_item_id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 first:pt-5 last:pb-5"
              >
                {/* Product details */}
                <div className="flex gap-4 min-w-0 flex-1">
                  <div className="relative w-16 h-16 rounded-xl border bg-zinc-50 dark:bg-zinc-900 overflow-hidden shrink-0">
                    <Image
                      src={item.product_thumbnail || '/placeholder-product.png'}
                      alt={item.product_name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-extrabold text-foreground truncate max-w-md hover:text-violet-600 transition-colors">
                      {item.product_name}
                    </h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground font-semibold">
                      {item.variant_name && (
                        <span>
                          Phân loại:{' '}
                          <strong className="text-foreground">
                            {item.variant_name}
                          </strong>
                        </span>
                      )}
                      <span>
                        Số lượng:{' '}
                        <strong className="text-foreground">
                          {item.quantity}
                        </strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground font-semibold">
                      <span className="flex items-center gap-1">
                        Mã đơn:{' '}
                        <strong className="text-foreground font-mono">
                          {item.order_number}
                        </strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Giao ngày:{' '}
                        <strong className="text-foreground">
                          {new Date(item.delivered_at).toLocaleDateString(
                            'vi-VN',
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions button */}
                <Button
                  onClick={() =>
                    setSelectedItem({
                      orderItemId: item.order_item_id,
                      productName: item.product_name,
                      variantName: item.variant_name,
                    })
                  }
                  className="text-xs font-bold px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl w-full sm:w-auto shrink-0"
                >
                  Đánh giá ngay
                </Button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {reviewableData.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="text-xs font-bold rounded-xl"
              >
                Trang trước
              </Button>
              <span className="text-xs font-extrabold text-muted-foreground">
                Trang {page} / {reviewableData.meta.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= reviewableData.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="text-xs font-bold rounded-xl"
              >
                Trang sau
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Review submission modal dialog */}
      {selectedItem && (
        <ReviewForm
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          orderItemId={selectedItem.orderItemId}
          productName={selectedItem.productName}
          variantName={selectedItem.variantName}
        />
      )}
    </div>
  );
}
