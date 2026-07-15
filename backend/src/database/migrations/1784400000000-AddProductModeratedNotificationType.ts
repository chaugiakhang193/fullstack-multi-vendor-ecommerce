import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductModeratedNotificationType1784400000000 implements MigrationInterface {
  name = 'AddProductModeratedNotificationType1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PG12+ cho phép ADD VALUE trong transaction miễn không dùng value mới cùng tx.
    // Migration chỉ thêm value (không INSERT row type='product.moderated') → an toàn.
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'product.moderated'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres KHÔNG hỗ trợ DROP một enum value — no-op (giống mọi migration ADD VALUE khác).
  }
}
