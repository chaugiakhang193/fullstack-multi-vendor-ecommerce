import { MigrationInterface, QueryRunner } from "typeorm";

// Phase 6 · part_01 — Dựng schema source-of-truth cho Notification-Service trên
// Supabase #2 (DB riêng). Bản DB#2 KHÁC backend gốc:
//  - notification: flat `user_id uuid NOT NULL`, KHÔNG FK (DB#2 không có bảng
//    "user"), KHÔNG index (NS write-only, không query notification).
//  - processed_events: y hệt backend (dedupe consumer, giữ nguyên timestamptz).
export class CreateNotificationServiceSchema1784000000000 implements MigrationInterface {
  name = "CreateNotificationServiceSchema1784000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type_enum" AS ENUM('order.created', 'order.status_changed', 'review.created', 'review.replied', 'payout.created', 'payout.status_changed', 'shop.registered', 'return.requested', 'return.status_changed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "type" "public"."notification_type_enum" NOT NULL, "title" character varying, "content" text, "data" jsonb, "is_read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notification_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "processed_events" ("event_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_processed_events_event_id" PRIMARY KEY ("event_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "processed_events"`);
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`DROP TYPE "public"."notification_type_enum"`);
  }
}
