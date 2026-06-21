// Enum đồng bộ từ backend (backend/src/common/enums.ts) qua `npm run gen-enums`.
// KHÔNG sửa các enum đó ở đây — sửa bên backend rồi chạy lại script.
export * from "./enum.generated";

// ============================================================
// FE-only enums (không có nguồn 1:1 ở backend → giữ tay tại đây)
// ============================================================

// CartConflictReason = các lý do item không khả dụng do server trả về
// (khớp [[CartItemUnavailableReason]] của backend) CỘNG THÊM `price_changed` —
// một khái niệm THUẦN FE (so giá lúc add-to-cart vs lúc checkout, FE tự phát hiện),
// dùng trong CartConflictDialog. Vì backend không có `price_changed` nên enum này
// không sinh từ gen-enums mà giữ tay.
export enum CartConflictReason {
  PRICE_CHANGED = "price_changed",
  OUT_OF_STOCK = "out_of_stock",
  INSUFFICIENT_STOCK = "insufficient_stock",
  PRODUCT_HIDDEN = "product_hidden",
  PRODUCT_DELETED = "product_deleted",
  SHOP_INACTIVE = "shop_inactive",
}
