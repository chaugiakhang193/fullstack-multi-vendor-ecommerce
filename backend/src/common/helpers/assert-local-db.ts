/**
 * Chốt an toàn: chặn các script ghi dữ liệu (seed...) chạy nhầm lên DB remote/prod.
 *
 * Bối cảnh: sự cố — chạy test/seed khi `.env` trỏ Supabase prod đã xoá sạch data.
 * Từ nay mọi script seed PHẢI gọi hàm này đầu tiên. Mặc định chỉ cho chạy khi DB_HOST là
 * localhost. Nếu CỐ Ý seed một DB remote (vd khôi phục prod), phải bật cờ môi trường
 * `ALLOW_REMOTE_SEED=YES_I_AM_SURE` — một thao tác có chủ đích, không thể lỡ tay.
 */
import * as dotenv from 'dotenv';

export function assertLocalDbOrExplicitOverride(scriptName: string): void {
  // Guard chạy TRƯỚC khi AppModule/ConfigModule nạp .env, nên phải tự nạp để đọc
  // đúng DB_HOST thật. dotenv KHÔNG ghi đè biến đã có sẵn trong process.env → nếu
  // override qua shell (ALLOW_REMOTE_SEED) thì các biến đó vẫn được tôn trọng.
  dotenv.config();

  const dbHost = (process.env.DB_HOST || 'localhost').trim();
  const isLocal =
    dbHost === '' ||
    dbHost === 'localhost' ||
    dbHost === '127.0.0.1' ||
    dbHost === '::1' ||
    dbHost === 'host.docker.internal';
  const override = process.env.ALLOW_REMOTE_SEED === 'YES_I_AM_SURE';

  if (!isLocal && !override) {
    console.error(
      [
        '',
        `⛔ ${scriptName} ĐÃ DỪNG — chốt an toàn.`,
        `   DB_HOST="${dbHost}" KHÔNG phải localhost.`,
        '   Đây là hàng rào chống chạy seed nhầm lên DB thật (prod).',
        '   Nếu bạn CỐ Ý seed DB remote này, chạy lại với cờ môi trường:',
        `   ALLOW_REMOTE_SEED=YES_I_AM_SURE npm run <script>`,
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (!isLocal && override) {
    console.warn(
      `⚠️  ${scriptName}: đang seed DB REMOTE (DB_HOST="${dbHost}") — override bật. Chắc chắn đây là chủ đích!`,
    );
  }
}
