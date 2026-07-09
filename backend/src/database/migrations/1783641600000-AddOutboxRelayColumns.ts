import { MigrationInterface, QueryRunner } from 'typeorm';

// Phase 3 — Relay: thêm trục relay ĐỘC LẬP cho OutboxRelay, tách khỏi cột `status`
// của OutboxWorker cũ (2 trục trên cùng dòng, không tranh nhau).
//
// ⚠️ Backfill BẮT BUỘC: set published_at = now() cho MỌI row hiện có. Nếu quên,
// lần relay đầu tiên sẽ nhặt toàn bộ lịch sử outbox (published_at IS NULL) và
// publish lại hết → flood Notification Service.
export class AddOutboxRelayColumns1783641600000 implements MigrationInterface {
  name = 'AddOutboxRelayColumns1783641600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "outbox_event" ADD "published_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_event" ADD "publish_attempts" integer NOT NULL DEFAULT 0`,
    );
    // Backfill: coi toàn bộ event cũ như đã relay để relay mới chỉ nhặt event PHÁT SINH sau này.
    await queryRunner.query(
      `UPDATE "outbox_event" SET "published_at" = now() WHERE "published_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "outbox_event" DROP COLUMN "publish_attempts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_event" DROP COLUMN "published_at"`,
    );
  }
}
