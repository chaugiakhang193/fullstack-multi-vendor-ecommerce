import http from '@/lib/http';
import { buildQuery } from '@/lib/utils';
import type {
  RejectReturnBodyType,
  ReturnEnvelope,
  ReturnListEnvelope,
} from '@/schemaValidations/returns/returns.schema';

const sellerReturnApiRequest = {
  // GET /seller/returns — danh sách yêu cầu trả của shop (phân trang).
  getList: (query?: { page?: number; limit?: number }) =>
    http.get<ReturnListEnvelope>(`/seller/returns${buildQuery(query)}`),

  // GET /seller/returns/:id
  getDetail: (id: string) => http.get<ReturnEnvelope>(`/seller/returns/${id}`),

  // PATCH /seller/returns/:id/approve
  approve: (id: string) =>
    http.patch<ReturnEnvelope>(`/seller/returns/${id}/approve`, {}),

  // PATCH /seller/returns/:id/reject
  reject: (id: string, body: RejectReturnBodyType) =>
    http.patch<ReturnEnvelope>(`/seller/returns/${id}/reject`, body),

  // PATCH /seller/returns/:id/receive
  receive: (id: string) =>
    http.patch<ReturnEnvelope>(`/seller/returns/${id}/receive`, {}),
};

export default sellerReturnApiRequest;
