'use client';

import React, { useState } from 'react';
import { useCreateReview } from '@/hooks/useReviews';
import { StarRating } from '@/components/shared/star-rating';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ReviewFormProps {
  isOpen: boolean;
  onClose: () => void;
  orderItemId: string;
  productName: string;
  variantName?: string | null;
}

export function ReviewForm({
  isOpen,
  onClose,
  orderItemId,
  productName,
  variantName,
}: ReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const createReviewMutation = useCreateReview();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createReviewMutation.mutate(
      {
        order_item_id: orderItemId,
        rating,
        comment: comment.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          setComment('');
          setRating(5);
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-foreground">
            Đánh giá sản phẩm
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Chia sẻ trải nghiệm của bạn về sản phẩm để giúp người mua khác.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Product info details */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border text-xs space-y-1">
            <div className="font-extrabold text-foreground">{productName}</div>
            {variantName && (
              <div className="text-muted-foreground font-semibold">
                Phân loại: {variantName}
              </div>
            )}
          </div>

          {/* Rating Selection */}
          <div className="space-y-2 flex flex-col items-center">
            <span className="text-sm font-bold text-foreground">
              Chọn mức độ đánh giá:
            </span>
            <StarRating
              rating={rating}
              onChange={setRating}
              interactive
              size="lg"
            />
            <span className="text-xs font-semibold text-amber-500 mt-1">
              {
                {
                  1: 'Rất tệ 😡',
                  2: 'Không hài lòng ☹️',
                  3: 'Bình thường 😐',
                  4: 'Hài lòng 🙂',
                  5: 'Tuyệt vời 😍',
                }[rating as 1 | 2 | 3 | 4 | 5]
              }
            </span>
          </div>

          {/* Comment description */}
          <div className="space-y-2">
            <label
              htmlFor="comment"
              className="text-xs font-bold text-foreground uppercase tracking-wider"
            >
              Nội dung nhận xét (tối đa 2000 ký tự):
            </label>
            <Textarea
              id="comment"
              placeholder="Nhập đánh giá chi tiết về sản phẩm này (chất lượng, đóng gói, giao hàng...)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              className="min-h-[100px] text-sm rounded-xl focus:border-violet-600 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-violet-600 focus-visible:ring-violet-600"
            />
            <div className="text-[10px] text-muted-foreground font-semibold text-right">
              {comment.length}/2000 ký tự
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={createReviewMutation.isPending}
              onClick={onClose}
              className="text-xs font-bold px-4 py-2 rounded-xl"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={createReviewMutation.isPending}
              className="text-xs font-bold px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
            >
              {createReviewMutation.isPending ? 'Đang gửi...' : 'Gửi đánh giá'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
