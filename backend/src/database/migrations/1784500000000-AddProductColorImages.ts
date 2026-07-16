import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductColorImages1784500000000 implements MigrationInterface {
  name = 'AddProductColorImages1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ảnh gom theo màu: { "Đỏ": ["url1","url2"], "Xanh": [...] }. Nguồn sự thật duy nhất cho ảnh
    // biến thể (thay per-variant images). Nullable → sp cũ (color_images null) fallback variant.images.
    await queryRunner.query(`ALTER TABLE "product" ADD "color_images" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "color_images"`);
  }
}
