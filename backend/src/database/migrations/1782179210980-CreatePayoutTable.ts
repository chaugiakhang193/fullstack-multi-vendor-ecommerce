import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePayoutTable1782179210980 implements MigrationInterface {
    name = 'CreatePayoutTable1782179210980'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "period_start"`);
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "period_end"`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "reject_reason" text`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "bank_info_snapshot" jsonb NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "resolved_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "resolved_by" uuid`);
        await queryRunner.query(`ALTER TABLE "payout" ALTER COLUMN "amount" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payout" ALTER COLUMN "commission_fee" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payout" ALTER COLUMN "commission_fee" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."payout_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "status" "public"."payout_status_enum" NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."notification_type_enum" AS ENUM('order.created', 'order.status_changed', 'review.created', 'review.replied', 'payout.created', 'payout.status_changed')`);
        await queryRunner.query(`ALTER TABLE "notification" ALTER COLUMN "type" TYPE "public"."notification_type_enum" USING "type"::"text"::"public"."notification_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notification_type_enum_old"`);
        await queryRunner.query(`ALTER TABLE "payout" ADD CONSTRAINT "FK_794b416aaed2908059357923e11" FOREIGN KEY ("resolved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payout" DROP CONSTRAINT "FK_794b416aaed2908059357923e11"`);
        await queryRunner.query(`CREATE TYPE "public"."notification_type_enum_old" AS ENUM('order.created', 'order.status_changed', 'review.created', 'review.replied')`);
        await queryRunner.query(`ALTER TABLE "notification" ALTER COLUMN "type" TYPE "public"."notification_type_enum_old" USING "type"::"text"::"public"."notification_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."notification_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."notification_type_enum_old" RENAME TO "notification_type_enum"`);
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."payout_status_enum"`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "status" character varying NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE "payout" ALTER COLUMN "commission_fee" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payout" ALTER COLUMN "commission_fee" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payout" ALTER COLUMN "amount" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "resolved_by"`);
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "resolved_at"`);
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "bank_info_snapshot"`);
        await queryRunner.query(`ALTER TABLE "payout" DROP COLUMN "reject_reason"`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "period_end" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "payout" ADD "period_start" TIMESTAMP`);
    }

}
