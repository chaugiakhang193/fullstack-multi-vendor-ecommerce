import http from '@/lib/http';
import { buildQuery } from '@/lib/utils';
import {
  CouponQueryType,
  CouponListEnvelope,
  UserCouponListEnvelope,
  CreateCouponBodyType,
  UpdateCouponBodyType,
  CouponDetailEnvelope,
  UserCouponDetailEnvelope,
} from '@/schemaValidations/promotions/coupons.schema';

const couponApiRequest = {
  // Admin Endpoints
  adminCreate: (body: CreateCouponBodyType) =>
    http.post<CouponDetailEnvelope>('/admin/coupons', body),
  adminGetList: (query?: CouponQueryType) =>
    http.get<CouponListEnvelope>(`/admin/coupons${buildQuery(query)}`),
  adminUpdate: (id: string, body: UpdateCouponBodyType) =>
    http.patch<CouponDetailEnvelope>(`/admin/coupons/${id}`, body),
  adminDelete: (id: string) => http.delete<void>(`/admin/coupons/${id}`),

  // Seller Endpoints
  sellerCreate: (body: CreateCouponBodyType) =>
    http.post<CouponDetailEnvelope>('/seller/coupons', body),
  sellerGetList: (query?: CouponQueryType) =>
    http.get<CouponListEnvelope>(`/seller/coupons${buildQuery(query)}`),
  sellerUpdate: (id: string, body: UpdateCouponBodyType) =>
    http.patch<CouponDetailEnvelope>(`/seller/coupons/${id}`, body),
  sellerDelete: (id: string) => http.delete<void>(`/seller/coupons/${id}`),

  // Customer Endpoints
  browseClaimable: (query?: CouponQueryType) =>
    http.get<CouponListEnvelope>(`/coupons${buildQuery(query)}`),
  getWallet: (query?: CouponQueryType) =>
    http.get<UserCouponListEnvelope>(`/coupons/me${buildQuery(query)}`),
  claim: (id: string) =>
    http.post<UserCouponDetailEnvelope>(`/coupons/${id}/claim`, {}),
};

export default couponApiRequest;
