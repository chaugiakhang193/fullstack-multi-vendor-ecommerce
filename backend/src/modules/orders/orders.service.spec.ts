import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { IdempotencyStatus } from '@/common/enums';
import type { CheckoutResponseDto } from '@/modules/orders/dto/checkout-response.dto';

// Lỗi Postgres unique_violation giả — isPgUniqueViolation() chỉ nhìn .code === '23505'.
const pgUnique = (): Error =>
  Object.assign(new Error('duplicate key'), { code: '23505' });

// queryRunner giả cho claimIdempotencyKey (insert PENDING trong tx riêng).
function makeQueryRunner(insertBehavior: 'ok' | 'collision') {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      create: jest.fn((_entity: unknown, data: unknown) => data),
      insert: jest.fn(() => {
        if (insertBehavior === 'collision') throw pgUnique();
        return Promise.resolve(undefined);
      }),
    },
  };
}

type ExistingKey = Partial<{
  key: string;
  user_id: string;
  status: IdempotencyStatus;
  response_body: CheckoutResponseDto | null;
}> | null;

// Dựng service chỉ với 2 deps cần cho idempotency; phần còn lại {} as any.
function buildService(opts: {
  insertBehavior: 'ok' | 'collision';
  existing?: ExistingKey;
}) {
  const queryRunner = makeQueryRunner(opts.insertBehavior);
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) } as any;
  const idempotencyRepository = {
    findOne: jest.fn().mockResolvedValue(opts.existing ?? null),
  } as any;

  const service = new OrdersService(
    dataSource, // dataSource
    {} as any, // ordersRepository
    idempotencyRepository, // idempotencyRepository
    {} as any, // cartsService
    {} as any, // productStockService
    {} as any, // promotionsService
    {} as any, // usersService
    {} as any, // shopsService
    {} as any, // paymentsService
    {} as any, // shippingCalculator
  );
  return { service, queryRunner, dataSource, idempotencyRepository };
}

const USER = '11111111-1111-1111-1111-111111111111';
const KEY = 'idem-key-abc';
const cachedResponse = {
  order_number: 'ORD-1',
} as unknown as CheckoutResponseDto;

describe('OrdersService — idempotency', () => {
  describe('claimIdempotencyKey (qua checkout Phase 1)', () => {
    it('key mới: insert PENDING thành công → không replay, chạy tiếp transaction', async () => {
      const { service, queryRunner } = buildService({ insertBehavior: 'ok' });
      // Chặn Phase 2/3 để chỉ xét Phase 1.
      jest
        .spyOn(service as any, 'runCheckoutTransaction')
        .mockResolvedValue(cachedResponse);
      jest
        .spyOn(service as any, 'markKeyCompleted')
        .mockResolvedValue(undefined);

      const res = await service.checkout(USER, {} as any, KEY);

      expect(res).toBe(cachedResponse);
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.release).toHaveBeenCalledTimes(1);
      expect((service as any).runCheckoutTransaction).toHaveBeenCalledTimes(1);
    });

    it('COMPLETED cùng user có cache → REPLAY, KHÔNG chạy lại transaction', async () => {
      const { service } = buildService({
        insertBehavior: 'collision',
        existing: {
          key: KEY,
          user_id: USER,
          status: IdempotencyStatus.COMPLETED,
          response_body: cachedResponse,
        },
      });
      const runSpy = jest
        .spyOn(service as any, 'runCheckoutTransaction')
        .mockResolvedValue(cachedResponse);

      const res = await service.checkout(USER, {} as any, KEY);

      expect(res).toBe(cachedResponse);
      expect(runSpy).not.toHaveBeenCalled(); // đây là bằng chứng idempotency
    });

    it('PENDING trùng → 409 Conflict', async () => {
      const { service } = buildService({
        insertBehavior: 'collision',
        existing: {
          key: KEY,
          user_id: USER,
          status: IdempotencyStatus.PENDING,
        },
      });
      await expect(
        service.checkout(USER, {} as any, KEY),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('key thuộc user khác → 403 Forbidden', async () => {
      const { service } = buildService({
        insertBehavior: 'collision',
        existing: {
          key: KEY,
          user_id: 'other-user',
          status: IdempotencyStatus.COMPLETED,
          response_body: cachedResponse,
        },
      });
      await expect(
        service.checkout(USER, {} as any, KEY),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('va unique nhưng không tìm thấy bản ghi (transient) → 409 Conflict', async () => {
      const { service } = buildService({
        insertBehavior: 'collision',
        existing: null,
      });
      await expect(
        service.checkout(USER, {} as any, KEY),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('COMPLETED nhưng thiếu response cache → 500', async () => {
      const { service } = buildService({
        insertBehavior: 'collision',
        existing: {
          key: KEY,
          user_id: USER,
          status: IdempotencyStatus.COMPLETED,
          response_body: null,
        },
      });
      await expect(
        service.checkout(USER, {} as any, KEY),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('checkout orchestration (Phase 2/3)', () => {
    it('lỗi nghiệp vụ ở Phase 2 → xoá PENDING key cho retry rồi ném lỗi', async () => {
      const { service } = buildService({ insertBehavior: 'ok' });
      const bizError = new Error('insufficient stock');
      jest
        .spyOn(service as any, 'runCheckoutTransaction')
        .mockRejectedValue(bizError);
      const delSpy = jest
        .spyOn(service as any, 'deletePendingKeyForRetry')
        .mockResolvedValue(undefined);

      await expect(
        service.checkout(USER, {} as any, KEY),
      ).rejects.toBeDefined();
      expect(delSpy).toHaveBeenCalledWith(KEY);
    });

    it('happy path → mark COMPLETED + trả response', async () => {
      const { service } = buildService({ insertBehavior: 'ok' });
      jest
        .spyOn(service as any, 'runCheckoutTransaction')
        .mockResolvedValue(cachedResponse);
      const markSpy = jest
        .spyOn(service as any, 'markKeyCompleted')
        .mockResolvedValue(undefined);

      const res = await service.checkout(USER, {} as any, KEY);

      expect(res).toBe(cachedResponse);
      expect(markSpy).toHaveBeenCalledWith(KEY, 201, cachedResponse);
    });
  });
});
