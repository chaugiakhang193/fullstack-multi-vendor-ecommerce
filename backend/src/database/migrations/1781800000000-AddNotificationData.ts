import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationData1781800000000 implements MigrationInterface {
  name = 'AddNotificationData1781800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cột cấu trúc để FE tự render câu hiển thị. Nullable → notification cũ = null,
    // FE fallback về cột `content`. Không cần backfill.
    await queryRunner.query(`ALTER TABLE "notification" ADD "data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN "data"`);
  }
}
