import http from "@/lib/http";
import type { components } from "@/lib/api/api-schema";
import {
  AddCartItemBodyType,
  UpdateCartItemBodyType,
  MergeCartBodyType,
  CartGenericResponseType,
} from "@/schemaValidations/carts/carts.schema";

const cartApiRequest = {
  // === C: Create / Add / Merge ===
  add: (body: AddCartItemBodyType) => 
    http.post<CartGenericResponseType>("/cart/items", body),

  merge: (body: MergeCartBodyType) => 
    http.post<CartGenericResponseType>("/cart/merge", body),

  // === R: Read ===
  getCart: () => 
    http.get<CartGenericResponseType>("/cart"),

  // === U: Update ===
  updateQuantity: (id: string, body: UpdateCartItemBodyType) => 
    http.patch<CartGenericResponseType>(`/cart/items/${id}`, body),

  // === D: Delete ===
  removeItem: (id: string) => 
    http.delete<CartGenericResponseType>(`/cart/items/${id}`),

  clearCart: () => 
    http.delete<CartGenericResponseType>("/cart"),
};

export default cartApiRequest;
