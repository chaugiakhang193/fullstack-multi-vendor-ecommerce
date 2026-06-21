import http, { ApiEnvelope } from "@/lib/http";
import {
  AdminUserListDataType,
  AdminUserItemType,
  UpdateUserStatusBodyType,
} from "@/schemaValidations/users/admin-users.schema";

export interface AdminUserQueryParams {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
}

const adminUsersApiRequest = {
  // GET /admin/users (lọc role/status/search + phân trang)
  getUsers: (params: AdminUserQueryParams) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.role) qs.set("role", params.role);
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search.trim());
    const query = qs.toString();
    return http.get<ApiEnvelope<AdminUserListDataType>>(
      `/admin/users${query ? `?${query}` : ""}`,
    );
  },

  // PATCH /admin/users/:id/status (active | suspended | banned)
  updateUserStatus: (id: string, body: UpdateUserStatusBodyType) => {
    return http.patch<ApiEnvelope<AdminUserItemType>>(`/admin/users/${id}/status`, body);
  },
};

export default adminUsersApiRequest;
