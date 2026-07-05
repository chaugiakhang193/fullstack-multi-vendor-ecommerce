import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameSubOrderDiscountAmount1782703082147 implements MigrationInterface {
  name = 'RenameSubOrderDiscountAmount1782703082147';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const upQuery = `ALTER TABLE "sub_order" RENAME COLUMN "discount_amount" TO "shop_discount_amount"`;
    await queryRunner.query(upQuery);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const downQuery = `ALTER TABLE "sub_order" RENAME COLUMN "shop_discount_amount" TO "discount_amount"`;
    await queryRunner.query(downQuery);
  }
}
