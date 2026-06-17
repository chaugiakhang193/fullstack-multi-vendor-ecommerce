import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewNotificationTypes1781850000000 implements MigrationInterface {
  name = 'AddReviewNotificationTypes1781850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PG 12+: ADD VALUE chạy trong transaction OK MIỄN không dùng giá trị mới ngay trong cùng tx.
    // Ta chỉ ADD (không dùng) nên an toàn. IF NOT EXISTS để idempotent.
    await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'review.created'`);
    await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'review.replied'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres không hỗ trợ DROP VALUE khỏi enum type - no-op
  }
}
