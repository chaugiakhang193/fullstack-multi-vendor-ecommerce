import z from "zod";
import { components } from "@/lib/api/api-schema";

export const RejectShopBody = z.object({
  reason: z.string().min(1, "Vui lòng nhập lý do từ chối."),
});

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
