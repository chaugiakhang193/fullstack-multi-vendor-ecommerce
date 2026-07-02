import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReturnRequestTables1782800000000 implements MigrationInterface {
  name = 'CreateReturnRequestTables1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Cột mốc giao hàng cho sub-order.
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP`,
    );

    // 2) Enum types (DO block để idempotent nếu retry sau rollback).
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."return_request_status_enum" AS ENUM('requested', 'approved', 'rejected', 'received', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."return_request_reason_enum" AS ENUM('damaged', 'wrong_item', 'not_as_described', 'missing_parts', 'changed_mind', 'other');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    // 3) Bảng return_request.
    await queryRunner.query(`
      CREATE TABLE "return_request" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sub_order_id" uuid NOT NULL,
        "customer_id"  uuid NOT NULL,
        "shop_id"      uuid,
        "status"       "public"."return_request_status_enum" NOT NULL DEFAULT 'requested',
        "reason"       "public"."return_request_reason_enum" NOT NULL,
        "customer_note" text,
        "refund_total" numeric(12,2) NOT NULL DEFAULT '0',
        "seller_note"  text,
        "resolved_at"  TIMESTAMP,
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_return_request" PRIMARY KEY ("id"),
        CONSTRAINT "FK_return_request_sub_order" FOREIGN KEY ("sub_order_id")
          REFERENCES "sub_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_return_request_customer" FOREIGN KEY ("customer_id")
          REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_return_request_shop" FOREIGN KEY ("shop_id")
          REFERENCES "shop"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    // Index seller-query (khớp @Index(['shop','status'])).
    await queryRunner.query(`
      CREATE INDEX "IDX_return_request_shop_status"
      ON "return_request" ("shop_id", "status")
    `);

    // Partial unique: tối đa 1 request "đang mở" / sub-order (QĐ #7).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_return_request_active_per_suborder"
      ON "return_request" ("sub_order_id")
      WHERE "status" IN ('requested', 'approved')
    `);

    // 4) Bảng return_item.
    await queryRunner.query(`
      CREATE TABLE "return_item" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "return_request_id" uuid NOT NULL,
        "order_item_id"     uuid NOT NULL,
        "quantity"          integer NOT NULL,
        "refund_amount"     numeric(12,2) NOT NULL DEFAULT '0',
        CONSTRAINT "PK_return_item" PRIMARY KEY ("id"),
        CONSTRAINT "FK_return_item_request" FOREIGN KEY ("return_request_id")
          REFERENCES "return_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_return_item_order_item" FOREIGN KEY ("order_item_id")
          REFERENCES "order_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Index compute-on-read (khớp @Index(['order_item'])).
    await queryRunner.query(`
      CREATE INDEX "IDX_return_item_order_item"
      ON "return_item" ("order_item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_return_item_order_item"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "return_item"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."UQ_return_request_active_per_suborder"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_return_request_shop_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "return_request"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."return_request_reason_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."return_request_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP COLUMN IF EXISTS "delivered_at"`,
    );
  }
}
