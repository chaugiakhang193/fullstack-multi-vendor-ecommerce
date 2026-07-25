import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { Session } from '@/auth/entities/session.entity';
import { User } from '@/modules/users/entities/user.entity';
import { UserRole, AccountStatus } from '@/common/enums';
import { RefreshVerdict } from '@/auth/auth.types';
import { hashDataHelper } from '@/common/helpers/utils';
import {
  SessionRotationService,
  REFRESH_ROTATION_GRACE_MS,
} from '@/auth/session-rotation.service';

describe('Refresh rotation & reuse detection (real Postgres via Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  // Service không có dependency thật sự cho 2 hàm dùng trong test này
  // (verifyAndLock/commitRotation chỉ nhận EntityManager) → truyền null cho repo.
  const rotationSvc = new SessionRotationService(null as any);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    ds = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      synchronize: false,
      entities: [path.join(__dirname, '/../src/**/*.entity{.ts,.js}')],
      migrations: [
        path.join(__dirname, '/../src/database/migrations/*{.ts,.js}'),
      ],
    });
    await ds.initialize();
    await ds.runMigrations();
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (container) await container.stop();
  });

  /** Tạo 1 user + 1 session đang giữ hash của `currentToken`. */
  async function createSession(currentToken: string) {
    const userRepo = ds.getRepository(User);
    const sessionRepo = ds.getRepository(Session);
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const user = await userRepo.save(
      userRepo.create({
        username: `rot-${unique}`,
        email: `rot-${unique}@test.local`,
        role: UserRole.CUSTOMER,
        status: AccountStatus.ACTIVE,
      }),
    );

    const session = await sessionRepo.save(
      sessionRepo.create({
        user,
        refresh_token: await hashDataHelper(currentToken),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    return { user, session };
  }

  it('2 refresh song song cùng 1 token cũ → tuần tự hoá, không ai bị revoke, chuỗi token không đứt', async () => {
    const oldToken = 'refresh-token-cu-dung-chung';
    const { user, session } = await createSession(oldToken);

    // Hai request song song, y hệt F5 nhiều tab cùng lúc.
    const attempts = ['moi-A', 'moi-B'].map((newToken) =>
      ds.transaction(async (m) => {
        const verdict = await rotationSvc.verifyAndLock(
          session.id,
          user.id,
          oldToken,
          m,
        );
        if (verdict.status !== RefreshVerdict.OK) {
          return { status: verdict.status, newToken, viaGrace: null };
        }

        await rotationSvc.commitRotation(
          verdict.session,
          await hashDataHelper(newToken),
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          m,
        );
        return {
          status: RefreshVerdict.OK,
          newToken,
          viaGrace: verdict.viaGrace,
        };
      }),
    );

    const results = await Promise.all(attempts);

    // (a) Cả hai đều qua — không ai bị coi là reuse.
    expect(results.map((r) => r.status)).toEqual([
      RefreshVerdict.OK,
      RefreshVerdict.OK,
    ]);

    // (b) ⚠️ ĐÂY MỚI LÀ ASSERTION CHỨNG MINH KHOÁ CÓ TÁC DỤNG.
    //     Có khoá → 2 request bị tuần tự hoá: đúng MỘT cái khớp token hiện hành
    //     (viaGrace=false, kẻ vào trước) và đúng MỘT cái khớp token đời trước
    //     (viaGrace=true, kẻ vào sau).
    //     KHÔNG có khoá → cả hai cùng đọc một snapshot, cả hai đều khớp token
    //     hiện hành ⇒ cả hai viaGrace=false ⇒ assertion này ĐỎ.
    const viaGraceFlags = results.map((r) => r.viaGrace).sort();
    expect(viaGraceFlags).toEqual([false, true]);

    // (c) Chuỗi token không đứt: token do request VÀO TRƯỚC cấp ra phải vẫn dùng
    //     refresh được (nó đang là "đời trước" và còn trong grace).
    //     KHÔNG có khoá → request sau ghi đè, token này thành mồ côi (không phải
    //     current, cũng không phải previous) ⇒ lần refresh kế tiếp của tab đó bị
    //     REUSE_DETECTED ⇒ user thật bị đá ra oan. Đúng bug mà khoá sinh ra để chữa.
    const firstWinner = results.find((r) => r.viaGrace === false);
    expect(firstWinner).toBeDefined();

    const followUp = await ds.transaction((m) =>
      rotationSvc.verifyAndLock(session.id, user.id, firstWinner!.newToken, m),
    );
    expect(followUp.status).toBe(RefreshVerdict.OK);

    // (d) Session của user thật vẫn còn sống.
    const stillThere = await ds
      .getRepository(Session)
      .findOneBy({ id: session.id });
    expect(stillThere).not.toBeNull();
  });

  it('token đời trước nhưng ĐÃ QUÁ grace → REUSE_DETECTED', async () => {
    const oldToken = 'token-doi-truoc';
    const { user, session } = await createSession('token-hien-hanh');

    // Giả lập: session đã rotate từ lâu, token đời trước là `oldToken`.
    await ds.getRepository(Session).update(session.id, {
      previous_refresh_token: await hashDataHelper(oldToken),
      rotated_at: new Date(Date.now() - (REFRESH_ROTATION_GRACE_MS + 5_000)),
    });

    const verdict = await ds.transaction((m) =>
      rotationSvc.verifyAndLock(session.id, user.id, oldToken, m),
    );

    expect(verdict.status).toBe(RefreshVerdict.REUSE_DETECTED);
  });

  it('token đời trước và CÒN trong grace → OK (viaGrace = true)', async () => {
    const oldToken = 'token-doi-truoc-con-han';
    const { user, session } = await createSession('token-hien-hanh');

    await ds.getRepository(Session).update(session.id, {
      previous_refresh_token: await hashDataHelper(oldToken),
      rotated_at: new Date(Date.now() - 1_000), // vừa rotate 1 giây trước
    });

    const verdict = await ds.transaction((m) =>
      rotationSvc.verifyAndLock(session.id, user.id, oldToken, m),
    );

    expect(verdict.status).toBe(RefreshVerdict.OK);
    if (verdict.status === RefreshVerdict.OK) {
      expect(verdict.viaGrace).toBe(true);
    }
  });

  it('token rác (không khớp đời nào) → REUSE_DETECTED', async () => {
    const { user, session } = await createSession('token-hien-hanh');

    const verdict = await ds.transaction((m) =>
      rotationSvc.verifyAndLock(session.id, user.id, 'token-bia-dat', m),
    );

    expect(verdict.status).toBe(RefreshVerdict.REUSE_DETECTED);
  });

  it('commitRotation đẩy token hiện hành xuống đời trước và ghi rotated_at', async () => {
    const currentToken = 'token-truoc-khi-rotate';
    const { user, session } = await createSession(currentToken);
    const beforeHash = session.refresh_token;

    await ds.transaction(async (m) => {
      const verdict = await rotationSvc.verifyAndLock(
        session.id,
        user.id,
        currentToken,
        m,
      );
      if (verdict.status !== RefreshVerdict.OK) throw new Error('kỳ vọng OK');
      await rotationSvc.commitRotation(
        verdict.session,
        await hashDataHelper('token-moi'),
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        m,
      );
    });

    const reloaded = await ds
      .getRepository(Session)
      .findOneByOrFail({ id: session.id });

    expect(reloaded.previous_refresh_token).toBe(beforeHash);
    expect(reloaded.refresh_token).not.toBe(beforeHash);
    expect(reloaded.rotated_at).not.toBeNull();
  });
});
