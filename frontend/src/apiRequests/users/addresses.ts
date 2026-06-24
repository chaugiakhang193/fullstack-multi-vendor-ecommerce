import http from '@/lib/http';
import {
  CreateAddressBodyType,
  UpdateAddressBodyType,
  AddressListResponseType,
  AddressItemResponseType,
} from '@/schemaValidations/users/addresses.schema';

// Generic envelope cho các response chỉ có message (delete)
type MessageResponseType = { message?: string; data?: unknown };

const addressApiRequest = {
  // R: danh sách địa chỉ của tôi
  getList: () => http.get<AddressListResponseType>('/users/me/addresses'),

  // C: thêm mới
  create: (body: CreateAddressBodyType) =>
    http.post<AddressItemResponseType>('/users/me/addresses', body),

  // U: cập nhật
  update: (id: string, body: UpdateAddressBodyType) =>
    http.patch<AddressItemResponseType>(`/users/me/addresses/${id}`, body),

  // D: xóa
  remove: (id: string) =>
    http.delete<MessageResponseType>(`/users/me/addresses/${id}`),

  // Đặt mặc định
  setDefault: (id: string) =>
    http.patch<AddressItemResponseType>(
      `/users/me/addresses/${id}/set-default`,
      {},
    ),
};

export default addressApiRequest;
