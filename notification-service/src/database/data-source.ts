import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env cho TypeORM CLI (migration:generate/run/revert). App runtime dùng
// ConfigModule; file này CHỈ phục vụ CLI nên tự load .env qua dotenv.
dotenv.config();

/**
 * TypeORM DataSource cho Notification-Service — trỏ Supabase #2 (DB riêng, Phase 6).
 * Chạy qua tsconfig.migrations.json (commonjs) để tránh vướng nodenext, xem package.json.
 *
 * Env cần: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME (+ NODE_ENV cho SSL).
 * Lệnh:
 *  - Sinh migration:  npm run migration:generate src/database/migrations/<Name>
 *  - Chạy migration:  npm run migration:run
 *  - Revert:          npm run migration:revert
 */
export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false, // luôn false — schema quản bằng migration
  logging: true,
  // Supabase/Render bắt buộc SSL ở prod; self-signed nên tắt verify.
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  entities: [
    path.join(__dirname, "/../**/*.entity{.ts,.js}"),
    path.join(__dirname, "/../contracts/*.generated{.ts,.js}"),
  ],
  migrations: [path.join(__dirname, "/migrations/*{.ts,.js}")],
  subscribers: [],
});
