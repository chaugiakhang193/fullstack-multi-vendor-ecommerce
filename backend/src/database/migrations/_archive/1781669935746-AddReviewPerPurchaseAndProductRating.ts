import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewPerPurchaseAndProductRating1781669935746 implements MigrationInterface {
  name = 'AddReviewPerPurchaseAndProductRating1781669935746';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`TRUNCATE TABLE "review" CASCADE;`);
    await queryRunner.query(
      `ALTER TABLE "product" ADD "avg_rating" numeric(2,1) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD "review_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" ADD "order_item_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" ADD CONSTRAINT "UQ_6fb5caf1d99ffc8dab2dcbbcf62" UNIQUE ("order_item_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" ADD CONSTRAINT "FK_6fb5caf1d99ffc8dab2dcbbcf62" FOREIGN KEY ("order_item_id") REFERENCES "order_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "review" DROP CONSTRAINT "FK_6fb5caf1d99ffc8dab2dcbbcf62"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" DROP CONSTRAINT "UQ_6fb5caf1d99ffc8dab2dcbbcf62"`,
    );
    await queryRunner.query(`ALTER TABLE "review" DROP COLUMN "order_item_id"`);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "review_count"`);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "avg_rating"`);
  }
}
