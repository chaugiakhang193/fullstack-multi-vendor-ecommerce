/**
 * Jest globalSetup cho e2e: dựng một Postgres EPHEMERAL (Testcontainers) cho cả run.
 *
 * Bối cảnh: trước đây e2e đọc thẳng `DB_*` từ `.env` và mỗi suite gọi wipe() xoá sạch
 * bảng — chạy nhầm khi `.env` trỏ DB thật đã gây mất data prod. Từ nay e2e KHÔNG bao giờ
 * chạm DB có sẵn: container mới toanh mỗi run, migrate từ đầu, huỷ khi xong.
 *
 * Cách trỏ AppModule vào container: ghi đè `process.env.DB_*` TẠI ĐÂY. globalSetup chạy ở
 * process cha nên các worker kế thừa; và `ConfigModule` dùng dotenv — dotenv KHÔNG ghi đè
 * biến đã có trong process.env → giá trị container luôn thắng `.env`.
 */
import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

module.exports = async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();

  // Chạy migration bằng DataSource độc lập trước khi bất kỳ suite nào boot AppModule,
  // để mọi worker thấy schema đã sẵn sàng (AppModule dùng synchronize: false).
  const ds = new DataSource({
    type: 'postgres',
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    synchronize: false,
    // Cố tình KHÔNG khai `entities`: runMigrations chỉ cần migration (toàn SQL thuần).
    // Nạp entity ở đây sẽ vỡ vì globalSetup chạy ngoài sandbox Jest nên không có
    // moduleNameMapper cho alias `@/`.
    migrations: [
      path.join(__dirname, '/../src/database/migrations/*{.ts,.js}'),
    ],
  });
  await ds.initialize();
  await ds.runMigrations();
  await ds.destroy();

  process.env.DB_HOST = container.getHost();
  process.env.DB_PORT = String(container.getPort());
  process.env.DB_USERNAME = container.getUsername();
  process.env.DB_PASSWORD = container.getPassword();
  process.env.DB_NAME = container.getDatabase();
  // Cờ để guard (setup-guard.e2e.ts) xác nhận đang chạy trên DB ephemeral.
  process.env.E2E_DB_CONTAINER = '1';
  // Không để e2e nối Redis thật; RedisIoAdapter/RedisConnectionService tự bỏ qua khi thiếu.
  delete process.env.REDIS_URL;

  (globalThis as Record<string, unknown>).__E2E_PG_CONTAINER__ = container;

  console.log(
    `\n[e2e] Postgres ephemeral sẵn sàng tại ${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
  );
};

// Kiểu cho biến chia sẻ giữa globalSetup và globalTeardown (cùng process cha).
export type E2eContainer = StartedPostgreSqlContainer;
