import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAvatarUrlToUser1782005060372 implements MigrationInterface {
    name = 'AddAvatarUrlToUser1782005060372'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD "avatar_url" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "avatar_url"`);
    }

}
