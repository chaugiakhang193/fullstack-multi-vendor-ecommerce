import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleAuthToUser1782606654597 implements MigrationInterface {
  name = 'AddGoogleAuthToUser1782606654597';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "google_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "UQ_7adac5c0b28492eb292d4a93871" UNIQUE ("google_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "password" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "password" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "UQ_7adac5c0b28492eb292d4a93871"`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "google_id"`);
  }
}
