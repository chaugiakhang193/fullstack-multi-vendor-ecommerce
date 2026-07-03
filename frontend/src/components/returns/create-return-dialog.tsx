'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ReturnReason } from '@/constants/enum';
import { useCreateReturn } from '@/hooks/useReturns';
import {
  CreateReturnBody,
  type CreateReturnBodyType,
  RETURN_REASON_LABELS,
} from '@/schemaValidations/returns/returns.schema';
import { type CustomerOrderSubOrderType } from '@/schemaValidations/orders/orders.schema';
import { formatVnd } from '@/lib/format';

const REASON_ITEMS = Object.values(ReturnReason).map((value) => ({
  value,
  label: RETURN_REASON_LABELS[value],
}));

export function CreateReturnDialog({
  subOrder,
  orderId,
  open,
  onOpenChange,
}: {
  subOrder: CustomerOrderSubOrderType;
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const items = subOrder.items ?? [];
  // Số lượng chọn trả theo từng order_item (mặc định 0 = không trả dòng này).
  const [qtyById, setQtyById] = useState<Record<string, number>>({});

  const form = useForm<CreateReturnBodyType>({
    resolver: zodResolver(CreateReturnBody),
    defaultValues: {
      subOrderId: subOrder.id,
      reason: ReturnReason.DAMAGED,
      customerNote: '',
      items: [],
    },
  });

  const createMutation = useCreateReturn(orderId, {
    onSuccess: () => {
      onOpenChange(false);
      form.reset();
      setQtyById({});
    },
  });

  const setQty = (orderItemId: string, max: number, next: number) => {
    const clamped = Math.max(0, Math.min(max, next));
    setQtyById((prev) => {
      const updated = { ...prev, [orderItemId]: clamped };
      // Đồng bộ vào form để zod validate đúng lựa chọn thật (không còn rỗng).
      const chosen = Object.entries(updated)
        .filter(([, q]) => q > 0)
        .map(([id, quantity]) => ({ orderItemId: id, quantity }));
      form.setValue('items', chosen, {
        shouldValidate: form.formState.isSubmitted,
      });
      return updated;
    });
  };

  const onSubmit = form.handleSubmit((values) => {
    createMutation.mutate(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Yêu cầu trả hàng</DialogTitle>
          <DialogDescription>
            Chọn sản phẩm + số lượng muốn trả. Yêu cầu sẽ gửi tới shop để duyệt.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Item picker */}
          <div className="space-y-3 max-h-64 overflow-auto pr-1">
            {items.map((item) => {
              const max = item.quantity ?? 0;
              const qty = qtyById[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold line-clamp-1">
                      {item.product_name}
                    </p>
                    {item.variant_name && (
                      <p className="text-xs text-muted-foreground">
                        {item.variant_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Đã mua {max} ·{' '}
                      {formatVnd.format(item.price_at_purchase ?? 0)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQty(item.id, max, qty - 1)}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center text-sm font-bold">
                      {qty}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQty(item.id, max, qty + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {form.formState.errors.items && (
            <FieldError>{form.formState.errors.items.message}</FieldError>
          )}

          {/* Lý do */}
          <Field>
            <FieldLabel>Lý do trả hàng</FieldLabel>
            <Select
              items={REASON_ITEMS}
              value={form.watch('reason')}
              onValueChange={(value) => {
                if (value) form.setValue('reason', value as ReturnReason);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn lý do" />
              </SelectTrigger>
              <SelectContent>
                {REASON_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Ghi chú */}
          <Field>
            <FieldLabel>Ghi chú (tối thiểu 10 ký tự)</FieldLabel>
            <Textarea
              rows={3}
              placeholder="Mô tả tình trạng sản phẩm..."
              {...form.register('customerNote')}
            />
            {form.formState.errors.customerNote && (
              <FieldError>
                {form.formState.errors.customerNote.message}
              </FieldError>
            )}
          </Field>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Quay lại
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang gửi...
                </>
              ) : (
                'Gửi yêu cầu'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
