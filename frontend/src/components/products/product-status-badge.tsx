import { Badge } from '@/components/ui/badge';
import { ProductStatus } from '@/constants/enum.generated';

const STATUS_META: Record<ProductStatus, { label: string; className: string }> =
  {
    [ProductStatus.ACTIVE]: {
      label: 'Đang bán',
      className:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-950',
    },
    [ProductStatus.SUSPENDED]: {
      label: 'Đã gỡ',
      className:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-950',
    },
    [ProductStatus.DELETED]: {
      label: 'Đã xóa',
      className:
        'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800',
    },
  };

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META[ProductStatus.ACTIVE];
  return (
    <Badge variant="outline" className={`font-medium ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}
