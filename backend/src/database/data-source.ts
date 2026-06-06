import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config();

/**
 * TypeORM Data Source Configuration
 * Used primarily by the TypeORM CLI to generate, run, and revert migrations.
 *
 * Environment variables required:
 * - DB_HOST: The database host address
 * - DB_PORT: The database port number (default: 5432)
 * - DB_USERNAME: The database connection username
 * - DB_PASSWORD: The database connection password
 * - DB_NAME: The database name
 *
 * Commands:
 * - Generate migration: npm run migration:generate src/database/migrations/<MigrationName>
 * - Run migrations: npm run migration:run
 * - Revert migration: npm run migration:revert
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false, // Must always be false for migrations
  logging: true,
  entities: [path.join(__dirname, '/../**/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, '/migrations/*{.ts,.js}')],
  subscribers: [],
});
