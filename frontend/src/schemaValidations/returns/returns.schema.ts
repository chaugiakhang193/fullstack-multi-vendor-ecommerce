import z from 'zod';
import { paginated } from '../common.schema';
import { RETURN_LIMITS } from '@/constants/limits.generated';
import { ReturnStatus, ReturnReason } from '@/constants/enum';
import type { components } from '@/lib/api/api-schema';
import type { ApiEnvelope } from '@/lib/http';

type CreateReturnRequestDto = components['schemas']['CreateReturnRequestDto'];

// ===== Enums (nguồn: enum.generated.ts — sync từ backend qua npm run gen-enums) =====
export const ReturnStatusEnum = z.nativeEnum(ReturnStatus);
export const ReturnReasonEnum = z.nativeEnum(ReturnReason);

export const RETURN_STATUS_LABELS: Record<
  z.infer<typeof ReturnStatusEnum>,
  string
> = {
  requested: 'Chờ shop duyệt',
  approved: 'Đã duyệt — chờ gửi hàng',
  rejected: 'Bị từ chối',
  received: 'Đã nhận hàng trả',
  cancelled: 'Đã hủy',
};
export const RETURN_REASON_LABELS: Record<
  z.infer<typeof ReturnReasonEnum>,
  string
> = {
  damaged: 'Hàng bị hư hỏng',
  wrong_item: 'Giao sai sản phẩm',
  not_as_described: 'Không đúng mô tả',
  missing_parts: 'Thiếu phụ kiện/bộ phận',
  changed_mind: 'Đổi ý không muốn mua',
  other: 'Lý do khác',
};

// ===== Body: POST /returns =====
export const CreateReturnItemBody = z.object({
  orderItemId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export const CreateReturnBody = z.object({
  subOrderId: z.string().uuid(),
  reason: ReturnReasonEnum,
  customerNote: z
    .string()
    .min(
      RETURN_LIMITS.NOTE_MIN_LENGTH,
      `Ghi chú tối thiểu ${RETURN_LIMITS.NOTE_MIN_LENGTH} ký tự`,
    )
    .max(
      RETURN_LIMITS.NOTE_MAX_LENGTH,
      `Ghi chú tối đa ${RETURN_LIMITS.NOTE_MAX_LENGTH} ký tự`,
    ),
  items: z.array(CreateReturnItemBody).min(RETURN_LIMITS.MIN_ITEMS),
}) satisfies z.ZodType<CreateReturnRequestDto, any, any>;

// ===== Response (viết tay — decimal → string giữ nguyên để hiển thị tiền) =====
export const ReturnItemResponse = z.object({
  id: z.string(),
  orderItemId: z.string(),
  productName: z.string(),
  variantName: z.string().nullable().optional(),
  quantity: z.coerce.number(),
  refundAmount: z.string(),
});

export const ReturnResponse = z.object({
  id: z.string(),
  subOrderId: z.string(),
  status: ReturnStatusEnum,
  reason: ReturnReasonEnum,
  customerNote: z.string().nullable().optional(),
  sellerNote: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  refundTotal: z.string(),
  items: z.array(ReturnItemResponse),
  createdAt: z.string(),
});

export const ReturnList = paginated(ReturnResponse);

export const CancelReturnResult = z.object({
  id: z.string(),
  status: ReturnStatusEnum,
});

// ===== Types =====
export type ReturnStatusType = z.TypeOf<typeof ReturnStatusEnum>;
export type ReturnReasonType = z.TypeOf<typeof ReturnReasonEnum>;
export type CreateReturnBodyType = z.TypeOf<typeof CreateReturnBody>;
export type ReturnResponseType = z.TypeOf<typeof ReturnResponse>;
export type ReturnListType = z.TypeOf<typeof ReturnList>;

export type ReturnEnvelope = ApiEnvelope<ReturnResponseType>;
export type ReturnListEnvelope = ApiEnvelope<ReturnListType>;
export type CancelReturnEnvelope = ApiEnvelope<
  z.TypeOf<typeof CancelReturnResult>
>;
