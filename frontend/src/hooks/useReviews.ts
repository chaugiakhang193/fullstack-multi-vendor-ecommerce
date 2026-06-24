import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import reviewApiRequest from '@/apiRequests/engagements/reviews';
import { reviewKeys, STALE_TIME } from '@/constants/query-keys';
import {
  CreateReviewBodyType,
  SellerReplyBodyType,
} from '@/schemaValidations/engagements/reviews.schema';

export const useProductReviews = (
  productId: string,
  query?: { page?: number; limit?: number; rating?: number },
) => {
  return useQuery({
    queryKey: reviewKeys.productReviews(productId, query),
    queryFn: () => reviewApiRequest.getProductReviews(productId, query),
    staleTime: STALE_TIME.SHORT,
    enabled: !!productId,
  });
};

export const useReviewableItems = (query?: {
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: reviewKeys.reviewable(query),
    queryFn: () => reviewApiRequest.getReviewable(query),
    staleTime: STALE_TIME.SHORT,
  });
};

export const useCreateReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReviewBodyType) => reviewApiRequest.create(body),
    onSuccess: () => {
      toast.success('Cảm ơn bạn đã đánh giá sản phẩm!');
      queryClient.invalidateQueries({ queryKey: reviewKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.payload?.message || 'Đánh giá thất bại');
    },
  });
};

export const useSellerReviews = (query?: {
  page?: number;
  limit?: number;
  rating?: number;
}) => {
  return useQuery({
    queryKey: reviewKeys.sellerReviews(query),
    queryFn: () => reviewApiRequest.sellerGetReviews(query),
    staleTime: STALE_TIME.SHORT,
  });
};

export const useSellerReplyReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reviewId,
      body,
    }: {
      reviewId: string;
      body: SellerReplyBodyType;
    }) => reviewApiRequest.sellerReply(reviewId, body),
    onSuccess: () => {
      toast.success('Gửi phản hồi thành công');
      queryClient.invalidateQueries({ queryKey: reviewKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.payload?.message || 'Gửi phản hồi thất bại');
    },
  });
};
