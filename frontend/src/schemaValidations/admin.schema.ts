import z from "zod";
import { components } from "@/lib/api/api-schema";

type RejectShopDto = components["schemas"]["RejectShopDto"];

export const RejectShopBody = z
  .object({
    reason: z.string().min(5, "Lý do từ chối phải có ít nhất 5 ký tự."),
  })
  .strict() satisfies z.ZodType<RejectShopDto, any, any>;

export interface BaseResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

// ==========================================
// Types
// ==========================================
export type ShopType = components["schemas"]["ShopResponseDto"];
export type RejectShopBodyType = z.TypeOf<typeof RejectShopBody>;
export type GetPendingShopsResType = BaseResponse<ShopType[]>;
export type ActionShopResType = BaseResponse<ShopType>;
