import { MigrationInterface, QueryRunner } from 'typeorm';

// Phase 4 — Idempotency: bảng dedupe cho NS consumer. `event_id` = outbox event
// id (khớp `eventId` trong envelope OutboxRelay publish). NS insert event_id
// vào đây CÙNG transaction với việc tạo notification — insert thành công mới
// commit, nên retry (at-least-once) không bao giờ bị chặn oan bởi dòng dedupe
// mồ côi.
//
// Migration chạy Ở BACKEND (NS không có migration runner, chỉ đọc/ghi qua
// TypeORM datasource SHARED Supabase, synchronize:false).
export class CreateProcessedEventsTable1783728000000 implements MigrationInterface {
  name = 'CreateProcessedEventsTable1783728000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "processed_events" ("event_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_processed_events_event_id" PRIMARY KEY ("event_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "processed_events"`);
  }
}
