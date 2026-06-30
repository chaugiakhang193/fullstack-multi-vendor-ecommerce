'use client';

import React, { useState } from 'react';
import { useSellerReviews, useSellerReplyReview } from '@/hooks/useReviews';
import { StarRating } from '@/components/shared/star-rating';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageSquare, Reply } from 'lucide-react';

export default function SellerReviewsPage() {
  const [page, setPage] = useState(1);
  const [selectedRating, setSelectedRating] = useState<number | undefined>(
    undefined,
  );
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const { data: reviewsRes, isLoading } = useSellerReviews({
    page,
    limit: 10,
    rating: selectedRating,
  });

  const replyMutation = useSellerReplyReview();
  const reviewsData = reviewsRes?.data;

  const handleReplySubmit = (reviewId: string) => {
    if (!replyText.trim()) return;
    replyMutation.mutate(
      {
        reviewId,
        body: { reply: replyText.trim() },
      },
      {
        onSuccess: () => {
          setReplyingId(null);
          setReplyText('');
        },
      },
    );
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto bg-white dark:bg-zinc-950">
      <div className="flex flex-col gap-1.5 border-b pb-4">
        <h1 className="text-xl font-extrabold text-foreground">
          Quản lý đánh giá
        </h1>
        <p className="text-xs text-muted-foreground font-semibold">
          Xem các đánh giá từ khách hàng mua sản phẩm của cửa hàng và trả lời
          phản hồi của họ.
        </p>
      </div>

      {/* Star Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSelectedRating(undefined);
            setPage(1);
          }}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition-all ${
            selectedRating === undefined
              ? 'bg-violet-600 border-violet-600 text-white'
              : 'bg-white dark:bg-zinc-950 text-muted-foreground border-zinc-200 dark:border-zinc-800 hover:text-foreground hover:border-zinc-400'
          }`}
        >
          Tất cả
        </button>
        {[5, 4, 3, 2, 1].map((stars) => (
          <button
            key={stars}
            type="button"
            onClick={() => {
              setSelectedRating(stars);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-1 ${
              selectedRating === stars
                ? 'bg-violet-600 border-violet-600 text-white'
                : 'bg-white dark:bg-zinc-950 text-muted-foreground border-zinc-200 dark:border-zinc-800 hover:text-foreground hover:border-zinc-400'
            }`}
          >
            {stars} sao
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
        </div>
      ) : !reviewsData || reviewsData.items.length === 0 ? (
        <div className="text-center py-16 border rounded-2xl bg-white dark:bg-zinc-950 p-8 text-muted-foreground text-sm font-semibold italic">
          Không có đánh giá nào cho sản phẩm của shop.
        </div>
      ) : (
        <div className="space-y-4 flex-1">
          <div className="divide-y border rounded-2xl bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
            {reviewsData.items.map((review) => (
              <div key={review.id} className="p-5 space-y-4">
                {/* Header review details */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2.5">
                    {/* User and Stars */}
                    <div className="space-y-1">
                      <div className="text-sm font-extrabold text-foreground">
                        Khách hàng: {review.user?.username || 'Ẩn danh'}
                      </div>
                      <div className="flex items-center gap-2">
                        <StarRating rating={review.rating} size="sm" />
                      </div>
                    </div>

                    {/* Product & Variant */}
                    {review.product && (
                      <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-xl border border-zinc-100 dark:border-zinc-800 max-w-md">
                        {review.product.thumbnail_url && (
                          <img
                            src={review.product.thumbnail_url}
                            alt={review.product.name}
                            className="w-10 h-10 object-cover rounded-lg border border-zinc-200 dark:border-zinc-800 shrink-0"
                          />
                        )}
                        <div className="text-xs">
                          <div className="font-extrabold text-foreground line-clamp-1">
                            {review.product.name}
                          </div>
                          {review.order_item?.variant_name && (
                            <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                              Phân loại: {review.order_item.variant_name}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                    {new Date(review.created_at).toLocaleString('vi-VN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Comment */}
                {review.comment && (
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line pl-1 border-l-2 border-zinc-200 dark:border-zinc-800">
                    {review.comment}
                  </p>
                )}

                {/* Reply display / reply write box */}
                {review.reply_from_seller ? (
                  <div className="p-4 rounded-xl bg-violet-50/50 dark:bg-violet-950/10 border border-violet-100 dark:border-violet-900/30 space-y-1">
                    <div className="text-xs font-black text-violet-600 dark:text-violet-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <MessageSquare className="h-3.5 w-3.5" /> Phản hồi từ bạn
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                      {review.reply_from_seller}
                    </p>
                  </div>
                ) : replyingId === review.id ? (
                  <div className="space-y-3 p-4 border rounded-xl bg-zinc-50/50 dark:bg-zinc-900/10">
                    <div className="text-xs font-bold text-foreground">
                      Viết phản hồi cho đánh giá này:
                    </div>
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Nhập nội dung phản hồi của cửa hàng..."
                      maxLength={2000}
                      className="min-h-[80px] text-sm rounded-xl focus:border-violet-600 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-violet-600"
                    />
                    <div className="flex justify-end gap-2 text-xs">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReplyingId(null);
                          setReplyText('');
                        }}
                        disabled={replyMutation.isPending}
                        className="rounded-xl px-3 py-1.5 font-bold"
                      >
                        Hủy
                      </Button>
                      <Button
                        onClick={() => handleReplySubmit(review.id)}
                        disabled={replyMutation.isPending || !replyText.trim()}
                        className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-4 py-1.5 font-bold"
                      >
                        {replyMutation.isPending ? 'Đang gửi...' : 'Gửi'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setReplyingId(review.id);
                        setReplyText('');
                      }}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 hover:text-violet-600 hover:border-violet-600 dark:hover:text-violet-400 cursor-pointer"
                    >
                      <Reply className="h-3.5 w-3.5" /> Trả lời phản hồi
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {reviewsData.meta.totalPages > 1 && (
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
                Trang {page} / {reviewsData.meta.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= reviewsData.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="text-xs font-bold rounded-xl"
              >
                Trang sau
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
