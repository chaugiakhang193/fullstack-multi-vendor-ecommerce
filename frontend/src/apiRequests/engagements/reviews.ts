import http from '@/lib/http';
import { buildQuery } from '@/lib/utils';
import {
  CreateReviewBodyType,
  SellerReplyBodyType,
  ProductReviewsEnvelope,
  ReviewListEnvelope,
  ReviewableListEnvelope,
  ReviewDetailEnvelope,
} from '@/schemaValidations/engagements/reviews.schema';

const reviewApiRequest = {
  // Customer Endpoints
  create: (body: CreateReviewBodyType) =>
    http.post<ReviewDetailEnvelope>('/reviews', body),

  getReviewable: (query?: { page?: number; limit?: number }) =>
    http.get<ReviewableListEnvelope>(`/reviews/reviewable${buildQuery(query)}`),

  // Public Endpoints (xem đánh giá sản phẩm)
  getProductReviews: (
    productId: string,
    query?: { page?: number; limit?: number; rating?: number },
  ) =>
    http.get<ProductReviewsEnvelope>(
      `/products/${productId}/reviews${buildQuery(query)}`,
    ),

  // Seller Endpoints
  sellerGetReviews: (query?: {
    page?: number;
    limit?: number;
    rating?: number;
  }) => http.get<ReviewListEnvelope>(`/seller/reviews${buildQuery(query)}`),

  sellerReply: (reviewId: string, body: SellerReplyBodyType) =>
    http.patch<ReviewDetailEnvelope>(`/seller/reviews/${reviewId}/reply`, body),
};

export default reviewApiRequest;
