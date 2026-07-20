import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 và DB còn sống (route @Public)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    const body = res.body as { data: { status: string; db: string } };

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ status: 'ok', db: 'up' });
  });

  it('GET / không token → 401 (AccessTokenGuard đăng ký global)', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.status).toBe(401);
  });
});
