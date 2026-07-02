'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';

import { ReturnStatus } from '@/constants/enum';
import { useReturnDetail, useCancelReturn } from '@/hooks/useReturns';
import { ReturnStatusBadge } from '@/components/returns/return-status';
import { ReturnStatusTimeline } from '@/components/returns/return-status-timeline';
import { RETURN_REASON_LABELS } from '@/schemaValidations/returns/returns.schema';
import { Button } from '@/components/ui/button';
import { formatVnd, formatDateTime, shortId } from '@/lib/format';
import { getErrorMessage } from '@/lib/http';

export default function ReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const query = useReturnDetail(id);
  const [confirming, setConfirming] = useState(false);
  const cancelMutation = useCancelReturn({
    onSettled: () => setConfirming(false),
  });

  const back = (
    <Button
      variant="ghost"
      size="sm"
      render={<Link href="/profile/returns" />}
      className="mb-2"
    >
      <ArrowLeft className="h-4 w-4" /> Yêu cầu trả hàng
    </Button>
  );

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-xl border border-rose-200 bg-card p-8 text-sm text-rose-600 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {query.error
            ? getErrorMessage(query.error)
            : 'Không tìm thấy yêu cầu.'}
        </div>
      </div>
    );
  }

  const r = query.data.data;
  const canCancel = r.status === ReturnStatus.REQUESTED;

  return (
    <div className="space-y-6 animate-fade-in">
      {back}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold">Yêu cầu #{shortId(r.id)}</h1>
        <ReturnStatusBadge status={r.status} />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <ReturnStatusTimeline status={r.status} />
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Lý do: </span>
          {RETURN_REASON_LABELS[r.reason]}
        </p>
        {r.customerNote && (
          <p>
            <span className="text-muted-foreground">Ghi chú của bạn: </span>
            {r.customerNote}
          </p>
        )}
        {r.status === ReturnStatus.REJECTED && r.sellerNote && (
          <p className="text-rose-600">
            <span className="text-muted-foreground">Lý do từ chối: </span>
            {r.sellerNote}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Gửi lúc: </span>
          {formatDateTime(r.createdAt)}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="font-black border-b pb-2">Sản phẩm trả</h2>
        {r.items.map((it) => (
          <div
            key={it.id}
            className="flex items-center justify-between text-sm"
          >
            <span className="line-clamp-1">
              {it.productName}
              {it.variantName ? ` · ${it.variantName}` : ''} × {it.quantity}
            </span>
            <span className="font-bold">
              {formatVnd.format(Number(it.refundAmount))}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-3 font-black">
          <span>Tổng hoàn dự kiến</span>
          <span className="text-violet-600">
            {formatVnd.format(Number(r.refundTotal))}
          </span>
        </div>
      </div>

      {canCancel && (
        <div className="flex justify-end">
          {confirming ? (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Không
              </Button>
              <Button
                variant="destructive"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(r.id)}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Xác nhận hủy'
                )}
              </Button>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Hủy yêu cầu
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
