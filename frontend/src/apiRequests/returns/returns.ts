import http from '@/lib/http';
import { buildQuery } from '@/lib/utils';
import type {
  CreateReturnBodyType,
  ReturnEnvelope,
  ReturnListEnvelope,
  CancelReturnEnvelope,
} from '@/schemaValidations/returns/returns.schema';

const returnApiRequest = {
  // POST /returns — khách tạo yêu cầu trả (item-level).
  create: (body: CreateReturnBodyType) =>
    http.post<ReturnEnvelope>('/returns', body),

  // GET /returns — danh sách yêu cầu trả của khách (phân trang).
  getMine: (query?: { page?: number; limit?: number }) =>
    http.get<ReturnListEnvelope>(`/returns${buildQuery(query)}`),

  // GET /returns/:id
  getDetail: (id: string) => http.get<ReturnEnvelope>(`/returns/${id}`),

  // PATCH /returns/:id/cancel
  cancel: (id: string) =>
    http.patch<CancelReturnEnvelope>(`/returns/${id}/cancel`, {}),
};

export default returnApiRequest;
