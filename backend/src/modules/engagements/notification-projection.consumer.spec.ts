import { NotificationProjectionConsumer } from './notification-projection.consumer';

type FakeChannel = { ack: jest.Mock; nack: jest.Mock };

function makeMsg(body: unknown, redelivered = false) {
  const content = Buffer.from(
    typeof body === 'string' ? body : JSON.stringify(body),
  );
  return { content, fields: { redelivered } } as any;
}

const validEnvelope = {
  eventId: 'evt-1',
  eventType: 'notification.created',
  occurredAt: new Date().toISOString(),
  payload: { id: 'notif-1', user_id: 'user-1' },
};

function buildConsumer(opts: {
  alreadyProcessed?: boolean;
  txError?: Error | null;
}) {
  const processedEventRepo = {
    findOne: jest
      .fn()
      .mockResolvedValue(opts.alreadyProcessed ? { event_id: 'evt-1' } : null),
  } as any;
  const upsertProjection = jest.fn().mockResolvedValue(undefined);
  const notificationService = { upsertProjection } as any;
  const manager = { insert: jest.fn().mockResolvedValue(undefined) };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: any) => Promise<unknown>) => {
      if (opts.txError) throw opts.txError;
      return cb(manager);
    }),
  } as any;
  const rabbitMq = { consume: jest.fn() } as any;

  const consumer = new NotificationProjectionConsumer(
    rabbitMq,
    dataSource,
    notificationService,
    processedEventRepo,
  );
  return {
    consumer,
    dataSource,
    processedEventRepo,
    upsertProjection,
    manager,
  };
}

const handle = (
  c: NotificationProjectionConsumer,
  msg: any,
  ch: FakeChannel,
): Promise<void> => (c as any).handleMessage(msg, ch);

describe('NotificationProjectionConsumer — dedup', () => {
  let channel: FakeChannel;
  beforeEach(() => {
    channel = { ack: jest.fn(), nack: jest.fn() };
  });

  it('envelope hỏng (JSON lỗi) → ack, không upsert', async () => {
    const { consumer, dataSource } = buildConsumer({});
    await handle(consumer, makeMsg('{not-json'), channel);
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('thiếu eventId/payload.id → ack, không upsert', async () => {
    const { consumer, dataSource } = buildConsumer({});
    await handle(consumer, makeMsg({ eventType: 'x', payload: {} }), channel);
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('event đã xử lý → ack, skip (không mở transaction)', async () => {
    const { consumer, dataSource } = buildConsumer({ alreadyProcessed: true });
    await handle(consumer, makeMsg(validEnvelope), channel);
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('event mới → insert ProcessedEvent + upsertProjection + ack', async () => {
    const { consumer, upsertProjection, manager } = buildConsumer({});
    await handle(consumer, makeMsg(validEnvelope), channel);
    expect(manager.insert).toHaveBeenCalledTimes(1);
    expect(upsertProjection).toHaveBeenCalledWith(
      validEnvelope.payload,
      manager,
    );
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('race dedupe (transaction ném 23505) → ack, coi như đã xử lý', async () => {
    const err = Object.assign(new Error('dup'), { code: '23505' });
    const { consumer } = buildConsumer({ txError: err });
    await handle(consumer, makeMsg(validEnvelope), channel);
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('lỗi tạm, chưa redelivered → nack requeue 1 lần', async () => {
    const { consumer } = buildConsumer({ txError: new Error('db down') });
    await handle(consumer, makeMsg(validEnvelope, false), channel);
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('lỗi sau redelivery → ack (drop, tránh poison loop)', async () => {
    const { consumer } = buildConsumer({ txError: new Error('db down') });
    await handle(consumer, makeMsg(validEnvelope, true), channel);
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.nack).not.toHaveBeenCalled();
  });
});
