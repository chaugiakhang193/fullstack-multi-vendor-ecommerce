import { MigrationInterface, QueryRunner } from 'typeorm';

// Phase 6 · part_03 — Đổi vai bảng notification (monolith) thành read model
// notification_read (CQRS). Chỉ RENAME bảng: PK/FK/index tên hash (không chứa
// tên bảng) nên KHÔNG cần đổi tên constraint. Behavior-preserving ở inprocess
// (bell + worker dùng bảng qua entity đã trỏ tên mới).
export class RenameNotificationToNotificationRead1784200000000 implements MigrationInterface {
  name = 'RenameNotificationToNotificationRead1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification" RENAME TO "notification_read"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_read" RENAME TO "notification"`,
    );
  }
}
