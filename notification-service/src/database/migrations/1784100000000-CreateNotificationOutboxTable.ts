import { MigrationInterface, QueryRunner } from "typeorm";

// Phase 6 · part_02 — Bảng symmetric outbox phía NS trên DB#2. Index partial
// (published_at IS NULL) tăng tốc claim của relay khi bảng lớn dần.
export class CreateNotificationOutboxTable1784100000000 implements MigrationInterface {
  name = "CreateNotificationOutboxTable1784100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_outbox" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "event_type" character varying NOT NULL, "payload" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, "publish_attempts" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_notification_outbox_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_outbox_unpublished" ON "notification_outbox" ("created_at") WHERE "published_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_outbox_unpublished"`,
    );
    await queryRunner.query(`DROP TABLE "notification_outbox"`);
  }
}
