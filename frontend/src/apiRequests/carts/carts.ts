import http from "@/lib/http";
import type { components } from "@/lib/api/api-schema";

// Trích xuất các DTO chính xác từ backend schema
type AddCartItemDto = components["schemas"]["AddCartItemDto"];
type UpdateCartItemDto = components["schemas"]["UpdateCartItemDto"];
type MergeCartDto = components["schemas"]["MergeCartDto"];
type CartResponseDto = components["schemas"]["CartResponseDto"];

const cartApiRequest = {
  // === C: Create / Add / Merge ===
  add: (body: AddCartItemDto) => 
    http.post<CartResponseDto>("/cart/items", body),

  merge: (body: MergeCartDto) => 
    http.post<CartResponseDto>("/cart/merge", body),

  // === R: Read ===
  getCart: () => 
    http.get<CartResponseDto>("/cart"),

  // === U: Update ===
  updateQuantity: (id: string, body: UpdateCartItemDto) => 
    http.patch<CartResponseDto>(`/cart/items/${id}`, body),

  // === D: Delete ===
  removeItem: (id: string) => 
    http.delete<CartResponseDto>(`/cart/items/${id}`),

  clearCart: () => 
    http.delete<CartResponseDto>("/cart"),
};

export default cartApiRequest;
