/**
 * Chốt an toàn tầng 2 cho e2e (chạy trong MỖI worker, trước khi nạp test).
 *
 * Các suite e2e gọi wipe() xoá sạch bảng. Nếu vì lý do gì đó globalSetup không chạy
 * (ai đó sửa jest-e2e.json, chạy jest với --config khác, IDE tự đoán config...), suite sẽ
 * rơi về `DB_*` trong `.env` — đúng kịch bản đã xoá mất data thật. Guard này bắt buộc
 * e2e chỉ chạy trên DB ephemeral do globalSetup dựng, không có cờ override.
 *
 * Xem thêm chốt tương tự cho seed: src/common/helpers/assert-local-db.ts
 */
const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

const host = (process.env.DB_HOST || '').trim();

if (process.env.E2E_DB_CONTAINER !== '1' || !ALLOWED_HOSTS.includes(host)) {
  throw new Error(
    [
      '',
      '⛔ E2E ĐÃ DỪNG — chốt an toàn.',
      `   DB_HOST="${host}", E2E_DB_CONTAINER="${process.env.E2E_DB_CONTAINER ?? ''}"`,
      '   e2e chỉ được chạy trên Postgres ephemeral do test/global-setup.e2e.ts dựng',
      '   (Testcontainers), vì mỗi suite xoá sạch bảng trong beforeAll/afterAll.',
      '   Chạy đúng cách: `npm run test:e2e` (cần Docker Desktop đang bật).',
      '',
    ].join('\n'),
  );
}
