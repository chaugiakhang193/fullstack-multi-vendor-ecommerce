'use client';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import Link from 'next/link';
import { useState } from 'react';
import { Loader2, PackageX } from 'lucide-react';
import { useSellerReturns } from '@/hooks/useSellerReturns';
import { ReturnStatusBadge } from '@/components/returns/return-status';
import { Pagination } from '@/components/shared/pagination';
import { formatVnd, formatDateTime, shortId } from '@/lib/format';
import { getErrorMessage } from '@/lib/http';

export default function SellerReturnsPage() {
  useDocumentTitle('Đổi trả · Dashboard');
  const [page, setPage] = useState(1);
  const query = useSellerReturns(page);

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-card p-8 text-sm text-rose-600">
        {getErrorMessage(query.error)}
      </div>
    );
  }

  const items = query.data?.data.items ?? [];
  const meta = query.data?.data.meta;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <PackageX className="h-10 w-10" />
        <p>Chưa có yêu cầu trả hàng nào.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Yêu cầu trả hàng
        </h1>
        <p className="text-muted-foreground text-base mt-2">
          Xem và xử lý yêu cầu trả hàng từ khách hàng của shop.
        </p>
      </div>
      <div className="space-y-3">
        {items.map((r) => (
          <Link
            key={r.id}
            href={`/seller/returns/${r.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border bg-card p-5 shadow-xs hover:border-violet-400 transition"
          >
            <div className="min-w-0">
              <p className="font-bold text-base">#{shortId(r.id)}</p>
              <p className="text-sm text-muted-foreground">
                {r.items.length} sản phẩm · Hoàn{' '}
                {formatVnd.format(Number(r.refundTotal))} ·{' '}
                {formatDateTime(r.createdAt)}
              </p>
            </div>
            <ReturnStatusBadge status={r.status} />
          </Link>
        ))}
      </div>

      {meta && (
        <Pagination
          currentPage={meta.page}
          totalPages={meta.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
