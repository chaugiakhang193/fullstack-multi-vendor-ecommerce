import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGlobalDiscountAndCouponCodes1782437739891 implements MigrationInterface {
  name = 'AddGlobalDiscountAndCouponCodes1782437739891';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD "global_discount_amount" decimal(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "global_coupon_code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD "shop_coupon_code" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP COLUMN "shop_coupon_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "global_coupon_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "global_discount_amount"`,
    );
  }
}
