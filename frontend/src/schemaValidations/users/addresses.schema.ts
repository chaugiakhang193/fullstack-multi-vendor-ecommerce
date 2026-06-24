import z from 'zod';
import type { components } from '@/lib/api/api-schema';
import type { ApiEnvelope } from '@/lib/http';

type CreateAddressDto = components['schemas']['CreateAddressDto'];
type UpdateAddressDto = components['schemas']['UpdateAddressDto'];

// Regex SĐT khớp 1-1 backend (create-address.dto.ts)
const PHONE_REGEX = /^(0\d{9}|\+84\d{9})$/;

// ===== Request bodies =====
// Lưu ý: lat/lng là STRING (TypeORM decimal trap). Form giữ coords number,
// component submit sẽ ép String(...) trước khi gọi API.
export const CreateAddressBody = z
  .object({
    recipient_name: z.string().min(1, 'Tên người nhận không được để trống'),
    phone: z.string().regex(PHONE_REGEX, 'Số điện thoại Việt Nam không hợp lệ'),
    address_line: z.string().min(1, 'Vui lòng chọn địa chỉ từ gợi ý'),
    lat: z.string().optional(),
    lng: z.string().optional(),
    is_default: z.boolean().optional(),
  })
  .strict() satisfies z.ZodType<CreateAddressDto, any, any>;

export const UpdateAddressBody =
  CreateAddressBody.partial() satisfies z.ZodType<UpdateAddressDto, any, any>;

// ===== Form schema (chỉ các field user nhập tay; lat/lng quản lý qua selectedCoords) =====
export const AddressFormBody = z.object({
  recipient_name: z
    .string()
    .trim()
    .min(1, 'Tên người nhận không được để trống'),
  phone: z.string().regex(PHONE_REGEX, 'Số điện thoại Việt Nam không hợp lệ'),
  address_line: z.string().min(1, 'Vui lòng chọn địa chỉ từ gợi ý'),
});

// ===== Response =====
export const AddressResponse = z.object({
  id: z.string(),
  address_line: z.string(),
  lat: z.string().nullable(),
  lng: z.string().nullable(),
  is_default: z.boolean(),
  recipient_name: z.string(),
  phone: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ===== Types =====
export type CreateAddressBodyType = z.TypeOf<typeof CreateAddressBody>;
export type UpdateAddressBodyType = z.TypeOf<typeof UpdateAddressBody>;
export type AddressFormBodyType = z.TypeOf<typeof AddressFormBody>;
export type AddressResponseType = z.TypeOf<typeof AddressResponse>;
export type AddressListResponseType = ApiEnvelope<AddressResponseType[]>;
export type AddressItemResponseType = ApiEnvelope<AddressResponseType>;
