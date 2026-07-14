import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductModeration1784300000000 implements MigrationInterface {
  name = 'AddProductModeration1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres 12+ cho phép ADD VALUE trong transaction MIỄN LÀ không dùng giá trị
    // mới trong cùng transaction. Migration này chỉ thêm value + cột (không INSERT
    // row status='suspended') → an toàn chạy trong 1 transaction của TypeORM.
    await queryRunner.query(
      `ALTER TYPE "public"."product_status_enum" ADD VALUE IF NOT EXISTS 'suspended'`,
    );

    await queryRunner.query(
      `ALTER TABLE "product" ADD "moderation_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD "moderated_at" TIMESTAMP`,
    );
    await queryRunner.query(`ALTER TABLE "product" ADD "moderated_by" uuid`);
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_product_moderated_by" ` +
        `FOREIGN KEY ("moderated_by") REFERENCES "user"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP CONSTRAINT "FK_product_moderated_by"`,
    );
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "moderated_by"`);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "moderated_at"`);
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN "moderation_reason"`,
    );
    // KHÔNG revert ADD VALUE: Postgres không hỗ trợ DROP một enum value. Để lại
    // 'suspended' vô hại (down chỉ gỡ cột). Nếu cần sạch tuyệt đối phải recreate type.
  }
}
