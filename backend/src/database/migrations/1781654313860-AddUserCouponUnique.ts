import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserCouponUnique1781654313860 implements MigrationInterface {
    name = 'AddUserCouponUnique1781654313860'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification" DROP CONSTRAINT "FK_notification_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notification_user_read_created"`);
        await queryRunner.query(`ALTER TABLE "notification" ALTER COLUMN "user_id" DROP NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_06f372d2d5b1c6e18ceb91cdf7" ON "idempotency_keys" ("user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_00854909abbcebd77dabb4335e" ON "notification" ("user_id", "is_read", "created_at") `);
        await queryRunner.query(`ALTER TABLE "user_coupon" ADD CONSTRAINT "UQ_5e9c3e76a1d975269ceb52f66af" UNIQUE ("user_id", "coupon_id")`);
        await queryRunner.query(`ALTER TABLE "notification" ADD CONSTRAINT "FK_928b7aa1754e08e1ed7052cb9d8" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification" DROP CONSTRAINT "FK_928b7aa1754e08e1ed7052cb9d8"`);
        await queryRunner.query(`ALTER TABLE "user_coupon" DROP CONSTRAINT "UQ_5e9c3e76a1d975269ceb52f66af"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_00854909abbcebd77dabb4335e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_06f372d2d5b1c6e18ceb91cdf7"`);
        await queryRunner.query(`ALTER TABLE "notification" ALTER COLUMN "user_id" SET NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_notification_user_read_created" ON "notification" ("created_at", "is_read", "user_id") `);
        await queryRunner.query(`ALTER TABLE "notification" ADD CONSTRAINT "FK_notification_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
