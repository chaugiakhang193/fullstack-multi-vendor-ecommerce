// Tên unique constraint trên cột orders.idempotency_key (sinh bởi migration Sprint2)
// Dùng để phân biệt crash-recovery (trùng idempotency) với trùng order_number thông thường
export const UQ_ORDER_IDEMPOTENCY_KEY = 'UQ_84cba07199e5bb9fbc3261d50d7';

// Số lần retry tối đa khi sinh order_number bị trùng UNIQUE (xác suất cực thấp)
export const ORDER_NUMBER_MAX_RETRIES = 5;
