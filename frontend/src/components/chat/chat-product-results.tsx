'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import productsApiRequest from '@/apiRequests/products/products';
import {
  FALLBACK_RESULT_LIMIT,
  FALLBACK_SEARCH_EMPTY,
  FALLBACK_SEARCH_HEADING,
} from '@/constants/chat';
import type { ProductResponseType } from '@/schemaValidations/products/products.schema';

const priceFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

interface ChatProductResultsProps {
  query: string;
}

// Kết quả tìm kiếm hiện ngay trong panel khi bot không trả lời được.
//
// Dùng useQuery riêng chứ không dùng hook useProducts có sẵn: hook đó không nhận tuỳ chọn
// `enabled`, mà ở đây query chỉ được phép chạy khi thực sự có một câu hỏi bị từ chối. Thêm công
// tắc đó vào hook dùng chung là đổi hành vi của cả trang /products.
export function ChatProductResults({ query }: ChatProductResultsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['chat-fallback-products', query],
    queryFn: () =>
      productsApiRequest.getPublicProducts({
        q: query,
        limit: FALLBACK_RESULT_LIMIT,
      }),
    enabled: query.trim() !== '',
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Đang tìm sản phẩm…
      </p>
    );
  }

  // Lỗi khi tìm thay thế thì im lặng: câu báo "trợ lý hết lượt" ở ngay trên đã là tin xấu rồi,
  // chồng thêm một câu báo lỗi thứ hai không cho người đọc thêm được gì để làm.
  if (isError) return null;

  const items = data?.data?.items ?? [];
  const total = data?.data?.meta?.totalItems ?? 0;

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">{FALLBACK_SEARCH_EMPTY}</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{FALLBACK_SEARCH_HEADING}</p>

      {items.map((product: ProductResponseType) => (
        <Link
          key={product.id}
          // Khuôn URL phải là {slug}-i.{id}, giống hệt link mà bot tự dựng trong câu trả lời
          // (tool_search.go:188). Thiếu phần "-i.{id}" là trang chi tiết không tìm ra sản phẩm.
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

      {total > items.length ? (
        <Link
          href={`/products?q=${encodeURIComponent(query)}`}
          className="text-primary block text-xs hover:underline"
        >
          Xem tất cả {total} kết quả
        </Link>
      ) : null}
    </div>
  );
}
