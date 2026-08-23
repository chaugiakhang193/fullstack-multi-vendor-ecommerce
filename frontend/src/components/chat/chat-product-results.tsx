'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import productsApiRequest from '@/apiRequests/products/products';
import {
  FALLBACK_RESULT_LIMIT,
  FALLBACK_SEARCH_EMPTY,
  RANKING_POOL_SIZE,
} from '@/constants/chat';
import type { ProductResponseType } from '@/schemaValidations/products/products.schema';

const priceFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

interface ChatProductResultsProps {
  categoryId: string;
  categoryName: string;
}

// Xếp hạng: điểm cao trước, cùng điểm thì nhiều đánh giá trước.
//
// Sắp xếp TỪ ĐIỂN chứ không phải điểm tổng hợp: 5.0 sao vẫn thắng 4.8 sao dù ít đánh giá hơn,
// số đánh giá chỉ dùng để phá thế hoà. Cần thật vì dữ liệu có mười lăm sản phẩm cùng 5.0 sao —
// thiếu tie-break thì thứ tự là "DB trả về sao thì lấy vậy", mỗi lần một khác.
//
// Đúng ra nên phá hoà bằng LƯỢT MUA, nhưng chưa có cột đó. Số đánh giá là thứ gần nhất đang có
// sẵn trong response.
function rankProducts(items: ProductResponseType[]): ProductResponseType[] {
  return [...items].sort((a, b) => {
    const ratingDiff = Number(b.avg_rating ?? 0) - Number(a.avg_rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return Number(b.review_count ?? 0) - Number(a.review_count ?? 0);
  });
}

// Danh sách sản phẩm của một danh mục, hiện ngay trong panel chat.
export function ChatProductResults({
  categoryId,
  categoryName,
}: ChatProductResultsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['chat-category-products', categoryId],
    queryFn: () =>
      productsApiRequest.getPublicProducts({
        category_id: categoryId,
        limit: RANKING_POOL_SIZE,
        sort: 'avg_rating',
        order: 'DESC',
      }),
    enabled: categoryId !== '',
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Đang lấy sản phẩm…
      </p>
    );
  }

  // Lỗi thì im lặng: người dùng vừa bấm một cái chip, chồng thêm câu báo lỗi đỏ không cho họ
  // thêm được gì để làm.
  if (isError) return null;

  const items = data?.data?.items ?? [];
  const total = data?.data?.meta?.totalItems ?? 0;
  const top = rankProducts(items).slice(0, FALLBACK_RESULT_LIMIT);

  if (top.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">{FALLBACK_SEARCH_EMPTY}</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        Vài sản phẩm được đánh giá cao trong {categoryName}:
      </p>

      {top.map((product: ProductResponseType) => (
        <Link
          key={product.id}
          // Khuôn URL phải là {slug}-i.{id}, giống link mà bot tự dựng trong câu trả lời của nó.
          // Thiếu phần "-i.{id}" thì trang chi tiết không tìm ra sản phẩm.
          href={`/products/${product.slug}-i.${product.id}`}
          className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          <Image
            src={product.thumbnail_url || '/placeholder-product.png'}
            alt={product.name}
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded object-cover"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">
              {product.name}
            </span>
            <span className="text-primary block text-xs">
              {priceFormatter.format(Number(product.price))}
            </span>
          </span>
        </Link>
      ))}

      {total > top.length ? (
        <Link
          href={`/products?category_id=${categoryId}`}
          className="text-primary block text-xs hover:underline"
        >
          Xem tất cả {total} sản phẩm
        </Link>
      ) : null}
    </div>
  );
}
