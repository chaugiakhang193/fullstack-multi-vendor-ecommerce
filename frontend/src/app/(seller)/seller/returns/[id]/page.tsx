'use client';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Check,
  X,
  PackageCheck,
} from 'lucide-react';

import { ReturnStatus } from '@/constants/enum';
import {
  useSellerReturnDetail,
  useApproveReturn,
  useReceiveReturn,
} from '@/hooks/useSellerReturns';
import { RejectReturnDialog } from '@/components/returns/reject-return-dialog';
import { ReturnStatusBadge } from '@/components/returns/return-status';
import { ReturnStatusTimeline } from '@/components/returns/return-status-timeline';
import { RETURN_REASON_LABELS } from '@/schemaValidations/returns/returns.schema';
import { Button } from '@/components/ui/button';
import { formatVnd, formatDateTime, shortId } from '@/lib/format';
import { getErrorMessage } from '@/lib/http';

export default function SellerReturnDetailPage() {
  useDocumentTitle('Chi tiết đổi trả · Dashboard');
  const params = useParams<{ id: string }>();
  const id = params.id;
  const query = useSellerReturnDetail(id);
  const [rejectOpen, setRejectOpen] = useState(false);
  const approveMutation = useApproveReturn();
  const receiveMutation = useReceiveReturn();

  const back = (
    <Button
      variant="ghost"
      size="sm"
      render={<Link href="/seller/returns" />}
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
  const canApprove = r.status === ReturnStatus.REQUESTED;
  const canReceive = r.status === ReturnStatus.APPROVED;
  const canReject =
    r.status === ReturnStatus.REQUESTED || r.status === ReturnStatus.APPROVED;
  // Khóa mọi nút hành động khi có mutation đang chạy HOẶC dialog từ chối đang mở
  // (dialog là modal đã chặn click nền, đây là lớp chặn double-submit thứ hai).
  const busy =
    approveMutation.isPending || receiveMutation.isPending || rejectOpen;

  return (
    <div className="space-y-6 animate-fade-in">
      {back}
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Yêu cầu #{shortId(r.id)}
        </h1>
        <ReturnStatusBadge status={r.status} />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <ReturnStatusTimeline status={r.status} />
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-2 text-base">
        <p>
          <span className="text-muted-foreground">Lý do khách trả: </span>
          {RETURN_REASON_LABELS[r.reason]}
        </p>
        {r.customerNote && (
          <p>
            <span className="text-muted-foreground">Ghi chú của khách: </span>
            {r.customerNote}
          </p>
        )}
        {r.sellerNote && (
          <p className="text-rose-600">
            <span className="text-muted-foreground">
              Lý do từ chối của bạn:{' '}
            </span>
            {r.sellerNote}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Gửi lúc: </span>
          {formatDateTime(r.createdAt)}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="font-black border-b pb-2">Sản phẩm khách trả</h2>
        {r.items.map((it) => (
          <div
            key={it.id}
            className="flex items-center justify-between text-base"
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
          <span>Tổng hoàn cho khách</span>
          <span className="text-violet-600">
            {formatVnd.format(Number(r.refundTotal))}
          </span>
        </div>
      </div>

      {(canApprove || canReceive || canReject) && (
        <div className="flex flex-wrap justify-end gap-3">
          {canReject && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
            >
              <X className="h-4 w-4" /> Từ chối
            </Button>
          )}
          {canApprove && (
            <Button
              disabled={busy}
              onClick={() => approveMutation.mutate(r.id)}
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Duyệt yêu cầu
            </Button>
          )}
          {canReceive && (
            <Button
              disabled={busy}
              onClick={() => receiveMutation.mutate(r.id)}
            >
              {receiveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="h-4 w-4" />
              )}
              Đã nhận hàng trả
            </Button>
          )}
        </div>
      )}

      <RejectReturnDialog
        returnId={r.id}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
      />
    </div>
  );
}
