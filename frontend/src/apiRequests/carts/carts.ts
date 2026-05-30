import http from "@/lib/http";
import type { components } from "@/lib/api/api-schema";
import {
  AddCartItemBodyType,
  UpdateCartItemBodyType,
  MergeCartBodyType,
} from "@/schemaValidations/carts/carts.schema";

type CartResponseDto = components["schemas"]["CartResponseDto"];

const cartApiRequest = {
  // === C: Create / Add / Merge ===
  add: (body: AddCartItemBodyType) => 
    http.post<CartResponseDto>("/cart/items", body),

  merge: (body: MergeCartBodyType) => 
    http.post<CartResponseDto>("/cart/merge", body),

  // === R: Read ===
  getCart: () => 
    http.get<CartResponseDto>("/cart"),

  // === U: Update ===
  updateQuantity: (id: string, body: UpdateCartItemBodyType) => 
    http.patch<CartResponseDto>(`/cart/items/${id}`, body),

  // === D: Delete ===
  removeItem: (id: string) => 
    http.delete<CartResponseDto>(`/cart/items/${id}`),

  clearCart: () => 
    http.delete<CartResponseDto>("/cart"),
};

export default cartApiRequest;
