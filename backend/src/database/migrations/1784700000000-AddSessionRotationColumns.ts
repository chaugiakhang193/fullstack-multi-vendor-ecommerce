import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm 2 cột phục vụ refresh-token rotation + reuse detection:
 *   - previous_refresh_token: hash bcrypt của RT ĐỜI TRƯỚC (1 đời duy nhất).
 *     Dùng để phân biệt "race lành tính đa tab" với "reuse do bị đánh cắp".
 *   - rotated_at: mốc lần rotate gần nhất, để tính cửa sổ ân hạn (grace 10s).
 * Cả hai NULL với session cũ/mới tạo — session chưa từng rotate thì không có đời trước.
 */
export class AddSessionRotationColumns1784700000000 implements MigrationInterface {
  name = 'AddSessionRotationColumns1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "session" ADD "previous_refresh_token" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "session" ADD "rotated_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "rotated_at"`);
    await queryRunner.query(
      `ALTER TABLE "session" DROP COLUMN "previous_refresh_token"`,
    );
  }
}
