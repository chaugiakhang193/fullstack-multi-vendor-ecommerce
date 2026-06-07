import { MigrationInterface, QueryRunner } from "typeorm";

export class Sprint2PrepConsolidated1780836761131 implements MigrationInterface {
    name = 'Sprint2PrepConsolidated1780836761131'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."outbox_event_status_enum" AS ENUM('pending', 'processed', 'failed')`);
        await queryRunner.query(`CREATE TABLE "outbox_event" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_type" character varying NOT NULL, "payload" jsonb NOT NULL, "status" "public"."outbox_event_status_enum" NOT NULL DEFAULT 'pending', "error_message" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "processed_at" TIMESTAMP, CONSTRAINT "PK_cc0c9e40998e45ecfc5e313429d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "address" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "address" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "coupon" ADD "used_count" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "shop" ALTER COLUMN "is_coordinates_verified" SET DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "product" ADD CONSTRAINT "CHK_1149738dc84b1cadb48a928eaa" CHECK (stock_quantity >= 0)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT "CHK_1149738dc84b1cadb48a928eaa"`);
        await queryRunner.query(`ALTER TABLE "shop" ALTER COLUMN "is_coordinates_verified" SET DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "coupon" DROP COLUMN "used_count"`);
        await queryRunner.query(`ALTER TABLE "address" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "address" DROP COLUMN "created_at"`);
        await queryRunner.query(`DROP TABLE "outbox_event"`);
        await queryRunner.query(`DROP TYPE "public"."outbox_event_status_enum"`);
    }

}
