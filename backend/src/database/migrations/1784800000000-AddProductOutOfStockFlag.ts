import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cột generated `is_out_of_stock` = (stock_quantity = 0), Postgres tự tính và tự cập nhật.
 *
 * Mục đích: cho phép ORDER BY trên một CỘT ĐÃ MAP thay vì biểu thức thô. TypeORM phân trang
 * (skip/take + join) bằng một subquery distinct, và ở đó nó tra metadata cột cho từng mục
 * ORDER BY — gặp biểu thức thô như `stock_quantity = 0` thì không tra được và ném
 * `Cannot read properties of undefined (reading 'databaseName')`.
 *
 * Kèm index (is_out_of_stock, created_at DESC) để thứ tự mặc định của danh sách công khai
 * không phải sắp xếp lại toàn bảng khi dữ liệu lớn dần.
 */
export class AddProductOutOfStockFlag1784800000000 implements MigrationInterface {
  name = 'AddProductOutOfStockFlag1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD "is_out_of_stock" boolean GENERATED ALWAYS AS ("stock_quantity" = 0) STORED`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_out_of_stock_created" ON "product" ("is_out_of_stock", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_out_of_stock_created"`);
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN "is_out_of_stock"`,
    );
  }
}
