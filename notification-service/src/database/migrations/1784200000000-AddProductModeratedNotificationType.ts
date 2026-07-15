import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductModeratedNotificationType1784200000000 implements MigrationInterface {
  name = "AddProductModeratedNotificationType1784200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'product.moderated'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres KHÔNG hỗ trợ DROP một enum value — no-op.
  }
}
