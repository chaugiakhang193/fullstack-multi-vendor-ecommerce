'use client';

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
import { useRejectReturn } from '@/hooks/useSellerReturns';
import {
  RejectReturnBody,
  type RejectReturnBodyType,
} from '@/schemaValidations/returns/returns.schema';

export function RejectReturnDialog({
  returnId,
  open,
  onOpenChange,
}: {
  returnId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<RejectReturnBodyType>({
    resolver: zodResolver(RejectReturnBody),
    defaultValues: { sellerNote: '' },
  });

  const rejectMutation = useRejectReturn({
    onSuccess: () => {
      onOpenChange(false);
      form.reset();
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    rejectMutation.mutate({ id: returnId, body: values });
  });

  // Đóng dialog (ESC / backdrop / "Quay lại") thì reset để lần mở sau không
  // còn text + lỗi cũ. Chặn đóng khi đang gửi để tránh mất trạng thái pending.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (rejectMutation.isPending) return;
      form.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Từ chối yêu cầu trả hàng</DialogTitle>
          <DialogDescription>
            Nhập lý do từ chối để khách hiểu. Hành động này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field>
            <FieldLabel>Lý do từ chối (tối thiểu 5 ký tự)</FieldLabel>
            <Textarea
              rows={3}
              placeholder="Ví dụ: Sản phẩm đã qua sử dụng, không đủ điều kiện đổi trả..."
              {...form.register('sellerNote')}
            />
            {form.formState.errors.sellerNote && (
              <FieldError>
                {form.formState.errors.sellerNote.message}
              </FieldError>
            )}
          </Field>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={rejectMutation.isPending}
            >
              Quay lại
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang gửi...
                </>
              ) : (
                'Xác nhận từ chối'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
