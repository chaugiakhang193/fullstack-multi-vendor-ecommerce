// Payload outbox hỏng (thiếu field bắt buộc, status không hợp lệ...) — lỗi
// KHÔNG retry được (sẽ fail mãi). Consumer bắt loại này để route thẳng
// notifications.dlq thay vì notifications.retry.
export class PoisonPayloadError extends Error {}
