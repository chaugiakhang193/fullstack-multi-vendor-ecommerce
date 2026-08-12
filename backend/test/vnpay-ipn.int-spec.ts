import 'reflect-metadata';
import * as path from 'path';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

// Entities
import { Payment } from '@/modules/payments/entities/payment.entity';
import { PaymentAttempt } from '@/modules/payments/entities/payment-attempt.entity';
import { Order } from '@/modules/orders/entities/order.entity';
import { User } from '@/modules/users/entities/user.entity';

// Enums
import {
  PaymentMethod,
  PaymentStatus,
  OrderStatus,
  UserRole,
} from '@/common/enums';

// Services
import { PaymentsService } from '@/modules/payments/payments.service';
import { VnpayService } from '@/modules/payments/vnpay/vnpay.service';

describe('VNPay IPN Integration Test (real Postgres via Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  let paymentsService: PaymentsService;
  let vnpayService: VnpayService;

  const testHashSecret = 'TESTSECRET1234567890';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const host = container.getHost();
    const port = container.getPort();
    const username = container.getUsername();
    const password = container.getPassword();
    const database = container.getDatabase();

    const entitiesPath = path.join(__dirname, '/../src/**/*.entity{.ts,.js}');
    const migrationsPath = path.join(
      __dirname,
      '/../src/database/migrations/*{.ts,.js}',
    );

    ds = new DataSource({
      type: 'postgres',
      host,
      port,
      username,
      password,
      database,
      synchronize: false,
      entities: [entitiesPath],
      migrations: [migrationsPath],
    });

    await ds.initialize();
    await ds.runMigrations();

    const mockConfig: Record<string, string> = {
      VNP_TMN_CODE: 'TESTTMN',
      VNP_HASH_SECRET: testHashSecret,
      VNP_PAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      VNP_RETURN_URL: 'http://localhost:8080/api/v1/payments/vnpay/return',
    };

    const configService = {
      get: (key: string) => mockConfig[key],
    } as unknown as ConfigService;

    vnpayService = new VnpayService(configService);
    const paymentRepository = ds.getRepository(Payment);

    paymentsService = new PaymentsService(paymentRepository, ds, vnpayService);
  }, 60000);

  afterAll(async () => {
    if (ds && ds.isInitialized) {
      await ds.destroy();
    }
    if (container) {
      await container.stop();
    }
  });

  const signParams = (
    params: Record<string, string>,
  ): Record<string, string> => {
    const encodedKeys = Object.keys(params).map((k) => encodeURIComponent(k));
    encodedKeys.sort();
    const sorted: Record<string, string> = {};
    for (const ek of encodedKeys) {
      const rawKey = decodeURIComponent(ek);
      sorted[ek] = encodeURIComponent(params[rawKey]).replace(/%20/g, '+');
    }
    const signData = Object.keys(sorted)
      .map((k) => `${k}=${sorted[k]}`)
      .join('&');

    const secureHash = crypto
      .createHmac('sha512', testHashSecret)
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    return { ...params, vnp_SecureHash: secureHash };
  };

  // Seed 1 customer tối giản (username/email unique) để test nhánh ownership.
  const seedCustomer = async (suffix: string): Promise<User> => {
    const userRepo = ds.getRepository(User);
    const userData = {
      username: `cust-vnpay-${suffix}`,
      email: `cust-vnpay-${suffix}@test.local`,
      role: UserRole.CUSTOMER,
    };
    const created = userRepo.create(userData);
    return userRepo.save(created);
  };

  // Từ commit #413, IPN tra theo payment_attempt.vnp_txn_ref chứ không còn theo
  // payment.vnp_txn_ref — mọi test IPN phải seed kèm row lần thử tương ứng.
  const seedAttempt = async (params: {
    paymentId: string;
    txnRef: string;
    amount: number;
  }): Promise<PaymentAttempt> => {
    const attemptRepo = ds.getRepository(PaymentAttempt);
    const attemptData = {
      payment_id: params.paymentId,
      vnp_txn_ref: params.txnRef,
      amount: params.amount,
      status: PaymentStatus.PENDING,
    };
    const created = attemptRepo.create(attemptData);
    return attemptRepo.save(created);
  };

  it('1. IPN hợp lệ (ResponseCode 00) → chuyển payment sang COMPLETED và lưu paid_at', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const orderNumber = 'ORD-INT-001';
    const orderData = {
      order_number: orderNumber,
      total_amount: 150000,
      status: OrderStatus.PENDING,
    };
    const savedOrder = await orderRepo.save(orderRepo.create(orderData));

    const txnRef = 'ORD-INT-001-1000';
    const paymentData = {
      order: savedOrder,
      method: PaymentMethod.VNPAY,
      status: PaymentStatus.PENDING,
      amount: 150000,
      vnp_txn_ref: txnRef,
    };
    const savedPayment = await paymentRepo.save(
      paymentRepo.create(paymentData),
    );
    const attemptParams = {
      paymentId: savedPayment.id,
      txnRef,
      amount: 150000,
    };
    await seedAttempt(attemptParams);

    const ipnRawParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '15000000',
      vnp_BankCode: 'NCB',
      vnp_CardType: 'ATM',
      vnp_OrderInfo: 'Thanh toan don hang ORD-INT-001',
      vnp_PayDate: '20260810120000',
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '14000001',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: txnRef,
    };
    const validIpnQuery = signParams(ipnRawParams);

    const ipnResult = await paymentsService.handleVnpayIpn(validIpnQuery);
    expect(ipnResult.RspCode).toBe('00');
    expect(ipnResult.Message).toBe('Confirm Success');

    const updatedPayment = await paymentRepo.findOneBy({ vnp_txn_ref: txnRef });
    expect(updatedPayment).toBeDefined();
    expect(updatedPayment?.status).toBe(PaymentStatus.COMPLETED);
    expect(updatedPayment?.paid_at).not.toBeNull();
    expect(updatedPayment?.vnp_transaction_no).toBe('14000001');

    // 2. IPN gửi LẠI cùng query → trả về RspCode 02 (Already confirmed) và không làm thay đổi paid_at (Idempotency check)
    const paidAtTimestamp = updatedPayment?.paid_at?.getTime();

    const repeatIpnResult = await paymentsService.handleVnpayIpn(validIpnQuery);
    expect(repeatIpnResult.RspCode).toBe('02');
    expect(repeatIpnResult.Message).toBe('Order already confirmed');

    const reCheckedPayment = await paymentRepo.findOneBy({
      vnp_txn_ref: txnRef,
    });
    expect(reCheckedPayment?.status).toBe(PaymentStatus.COMPLETED);
    expect(reCheckedPayment?.paid_at?.getTime()).toBe(paidAtTimestamp);
  });

  it('3. IPN sai chữ ký → trả về RspCode 97 và không thay đổi DB', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const orderNumber = 'ORD-INT-002';
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: orderNumber,
        total_amount: 200000,
        status: OrderStatus.PENDING,
      }),
    );

    const txnRef = 'ORD-INT-002-2000';
    const savedPayment = await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        amount: 200000,
        vnp_txn_ref: txnRef,
      }),
    );
    const attemptParams = {
      paymentId: savedPayment.id,
      txnRef,
      amount: 200000,
    };
    await seedAttempt(attemptParams);

    const invalidSignatureQuery: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '20000000',
      vnp_ResponseCode: '00',
      vnp_TxnRef: txnRef,
      vnp_SecureHash: 'INVALIDHASH1234567890',
    };

    const ipnResult = await paymentsService.handleVnpayIpn(
      invalidSignatureQuery,
    );
    expect(ipnResult.RspCode).toBe('97');
    expect(ipnResult.Message).toBe('Invalid signature');

    const paymentAfterInvalid = await paymentRepo.findOneBy({
      vnp_txn_ref: txnRef,
    });
    expect(paymentAfterInvalid?.status).toBe(PaymentStatus.PENDING);
  });

  it('4. IPN đúng chữ ký nhưng sai số tiền → trả về RspCode 04', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const orderNumber = 'ORD-INT-003';
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: orderNumber,
        total_amount: 300000,
        status: OrderStatus.PENDING,
      }),
    );

    const txnRef = 'ORD-INT-003-3000';
    const savedPayment = await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        amount: 300000,
        vnp_txn_ref: txnRef,
      }),
    );
    const attemptParams = {
      paymentId: savedPayment.id,
      txnRef,
      amount: 300000,
    };
    await seedAttempt(attemptParams);

    const wrongAmountParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '10000000', // Mong đợi 30000000 (300,000 VND)
      vnp_ResponseCode: '00',
      vnp_TxnRef: txnRef,
    };
    const signedWrongAmountQuery = signParams(wrongAmountParams);

    const ipnResult = await paymentsService.handleVnpayIpn(
      signedWrongAmountQuery,
    );
    expect(ipnResult.RspCode).toBe('04');
    expect(ipnResult.Message).toBe('Invalid amount');

    const paymentAfterWrongAmount = await paymentRepo.findOneBy({
      vnp_txn_ref: txnRef,
    });
    expect(paymentAfterWrongAmount?.status).toBe(PaymentStatus.PENDING);
  });

  it('5. IPN ResponseCode != 00 (khách huỷ) → payment FAILED, paid_at null', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-004',
        total_amount: 250000,
        status: OrderStatus.PENDING,
      }),
    );

    const txnRef = 'ORD-INT-004-4000';
    const savedPayment = await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        amount: 250000,
        vnp_txn_ref: txnRef,
      }),
    );
    const attemptParams = {
      paymentId: savedPayment.id,
      txnRef,
      amount: 250000,
    };
    await seedAttempt(attemptParams);

    const cancelledParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '25000000',
      vnp_ResponseCode: '24', // khách huỷ giao dịch tại cổng
      vnp_TransactionNo: '0',
      vnp_TxnRef: txnRef,
    };
    const signedCancelledQuery = signParams(cancelledParams);

    const ipnResult =
      await paymentsService.handleVnpayIpn(signedCancelledQuery);
    // Vẫn trả 00: IPN đã ghi nhận THÀNH CÔNG (giao dịch thất bại khác với xử lý thất bại).
    expect(ipnResult.RspCode).toBe('00');

    const failedPayment = await paymentRepo.findOneBy({ vnp_txn_ref: txnRef });
    expect(failedPayment?.status).toBe(PaymentStatus.FAILED);
    expect(failedPayment?.paid_at).toBeNull();
    expect(failedPayment?.vnp_response_code).toBe('24');
  });

  it('6. createVnpayPaymentUrl (đơn hợp lệ) → trả URL có chữ ký + lưu vnp_txn_ref', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const customer = await seedCustomer('happy');
    const orderNumber = 'ORD-INT-005';
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: orderNumber,
        total_amount: 150000,
        status: OrderStatus.PENDING,
        customer,
      }),
    );
    await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        amount: 150000,
      }),
    );

    const buildParams = {
      orderId: savedOrder.id,
      userId: customer.id,
      ipAddr: '127.0.0.1',
    };
    const result = await paymentsService.createVnpayPaymentUrl(buildParams);
    expect(result.paymentUrl).toContain('vnp_SecureHash=');
    expect(result.paymentUrl).toContain(
      'sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    );

    const savedPayment = await paymentRepo.findOne({
      where: { order: { id: savedOrder.id } },
    });
    expect(savedPayment?.vnp_txn_ref).toContain(orderNumber);

    const attemptRepo = ds.getRepository(PaymentAttempt);
    const attempts = await attemptRepo.find({
      where: { payment_id: savedPayment!.id },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].vnp_txn_ref).toBe(savedPayment?.vnp_txn_ref);
    expect(attempts[0].status).toBe(PaymentStatus.PENDING);
  });

  it('7. createVnpayPaymentUrl (đơn của người khác) → NotFound', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const customer = await seedCustomer('owner');
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-006',
        total_amount: 150000,
        status: OrderStatus.PENDING,
        customer,
      }),
    );
    await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        amount: 150000,
      }),
    );

    const strangerId = crypto.randomUUID();
    const buildParams = {
      orderId: savedOrder.id,
      userId: strangerId,
      ipAddr: '127.0.0.1',
    };
    await expect(
      paymentsService.createVnpayPaymentUrl(buildParams),
    ).rejects.toThrow(NotFoundException);
  });

  it('8. createVnpayPaymentUrl (đơn COD) → BadRequest', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const customer = await seedCustomer('cod');
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-007',
        total_amount: 150000,
        status: OrderStatus.PENDING,
        customer,
      }),
    );
    await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.COD,
        status: PaymentStatus.PENDING,
        amount: 150000,
      }),
    );

    const buildParams = {
      orderId: savedOrder.id,
      userId: customer.id,
      ipAddr: '127.0.0.1',
    };
    await expect(
      paymentsService.createVnpayPaymentUrl(buildParams),
    ).rejects.toThrow(BadRequestException);
  });

  it('9. createVnpayPaymentUrl (payment đã COMPLETED) → BadRequest', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const customer = await seedCustomer('done');
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-008',
        total_amount: 150000,
        status: OrderStatus.PENDING,
        customer,
      }),
    );
    await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.COMPLETED,
        amount: 150000,
      }),
    );

    const buildParams = {
      orderId: savedOrder.id,
      userId: customer.id,
      ipAddr: '127.0.0.1',
    };
    await expect(
      paymentsService.createVnpayPaymentUrl(buildParams),
    ).rejects.toThrow(BadRequestException);
  });

  it('10. createVnpayPaymentUrl khi payment FAILED → reset về PENDING và sinh lần thử thứ 2', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);
    const attemptRepo = ds.getRepository(PaymentAttempt);

    const customer = await seedCustomer('retry');
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-009',
        total_amount: 180000,
        status: OrderStatus.PENDING,
        customer,
      }),
    );

    const firstTxnRef = 'ORD-INT-009-9000';
    const savedPayment = await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.FAILED,
        amount: 180000,
        vnp_txn_ref: firstTxnRef,
        vnp_response_code: '24',
      }),
    );
    const firstAttemptParams = {
      paymentId: savedPayment.id,
      txnRef: firstTxnRef,
      amount: 180000,
    };
    const firstAttempt = await seedAttempt(firstAttemptParams);
    firstAttempt.status = PaymentStatus.FAILED;
    firstAttempt.vnp_response_code = '24';
    await attemptRepo.save(firstAttempt);

    const buildParams = {
      orderId: savedOrder.id,
      userId: customer.id,
      ipAddr: '127.0.0.1',
    };
    const result = await paymentsService.createVnpayPaymentUrl(buildParams);
    expect(result.paymentUrl).toContain('vnp_SecureHash=');

    // Không reset về PENDING thì IPN của lần thử mới sẽ bị guard hiểu nhầm là 02.
    const retriedPayment = await paymentRepo.findOneBy({ id: savedPayment.id });
    expect(retriedPayment?.status).toBe(PaymentStatus.PENDING);
    expect(retriedPayment?.vnp_response_code).toBeNull();
    expect(retriedPayment?.vnp_txn_ref).not.toBe(firstTxnRef);

    const attempts = await attemptRepo.find({
      where: { payment_id: savedPayment.id },
    });
    expect(attempts).toHaveLength(2);
  });

  it('11. IPN của lần thử MỚI sau retry → payment COMPLETED', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const customer = await seedCustomer('retry-paid');
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-010',
        total_amount: 120000,
        status: OrderStatus.PENDING,
        customer,
      }),
    );
    const savedPayment = await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.FAILED,
        amount: 120000,
        vnp_txn_ref: 'ORD-INT-010-1',
      }),
    );
    const staleAttemptParams = {
      paymentId: savedPayment.id,
      txnRef: 'ORD-INT-010-1',
      amount: 120000,
    };
    await seedAttempt(staleAttemptParams);

    const buildParams = {
      orderId: savedOrder.id,
      userId: customer.id,
      ipAddr: '127.0.0.1',
    };
    await paymentsService.createVnpayPaymentUrl(buildParams);

    const retriedPayment = await paymentRepo.findOneBy({ id: savedPayment.id });
    const newTxnRef = retriedPayment!.vnp_txn_ref!;

    const ipnRawParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '12000000',
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '14000002',
      vnp_TxnRef: newTxnRef,
    };
    const signedQuery = signParams(ipnRawParams);

    const ipnResult = await paymentsService.handleVnpayIpn(signedQuery);
    expect(ipnResult.RspCode).toBe('00');

    const paidPayment = await paymentRepo.findOneBy({ id: savedPayment.id });
    expect(paidPayment?.status).toBe(PaymentStatus.COMPLETED);
    expect(paidPayment?.paid_at).not.toBeNull();
    expect(paidPayment?.vnp_transaction_no).toBe('14000002');
  });

  it('12. IPN của lần thử CŨ đến muộn báo thành công, payment chưa completed → vẫn COMPLETED', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-011',
        total_amount: 90000,
        status: OrderStatus.PENDING,
      }),
    );
    const oldTxnRef = 'ORD-INT-011-1';
    const newTxnRef = 'ORD-INT-011-2';
    const savedPayment = await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        amount: 90000,
        vnp_txn_ref: newTxnRef,
      }),
    );
    const oldAttemptParams = {
      paymentId: savedPayment.id,
      txnRef: oldTxnRef,
      amount: 90000,
    };
    await seedAttempt(oldAttemptParams);
    const newAttemptParams = {
      paymentId: savedPayment.id,
      txnRef: newTxnRef,
      amount: 90000,
    };
    await seedAttempt(newAttemptParams);

    const lateSuccessParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '9000000',
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '14000003',
      vnp_TxnRef: oldTxnRef,
    };
    const signedQuery = signParams(lateSuccessParams);

    const ipnResult = await paymentsService.handleVnpayIpn(signedQuery);
    expect(ipnResult.RspCode).toBe('00');

    // Tiền về thật thì đơn phải được đánh dấu đã trả, dù đó là URL của lần thử cũ.
    const paidPayment = await paymentRepo.findOneBy({ id: savedPayment.id });
    expect(paidPayment?.status).toBe(PaymentStatus.COMPLETED);
    expect(paidPayment?.vnp_txn_ref).toBe(oldTxnRef);
  });

  it('13. IPN lần thử CŨ báo thành công nhưng payment ĐÃ completed → RspCode 02, giữ nguyên payment', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);
    const attemptRepo = ds.getRepository(PaymentAttempt);

    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-012',
        total_amount: 70000,
        status: OrderStatus.PENDING,
      }),
    );
    const oldTxnRef = 'ORD-INT-012-1';
    const newTxnRef = 'ORD-INT-012-2';
    const savedPayment = await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        amount: 70000,
        vnp_txn_ref: newTxnRef,
      }),
    );
    const oldAttemptParams = {
      paymentId: savedPayment.id,
      txnRef: oldTxnRef,
      amount: 70000,
    };
    await seedAttempt(oldAttemptParams);
    const newAttemptParams = {
      paymentId: savedPayment.id,
      txnRef: newTxnRef,
      amount: 70000,
    };
    await seedAttempt(newAttemptParams);

    const newSuccessParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '7000000',
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '14000004',
      vnp_TxnRef: newTxnRef,
    };
    await paymentsService.handleVnpayIpn(signParams(newSuccessParams));

    const paidPayment = await paymentRepo.findOneBy({ id: savedPayment.id });
    const firstPaidAt = paidPayment?.paid_at?.getTime();

    // Khách quay lại tab cũ và trả thêm lần nữa → thu 2 lần.
    const lateSuccessParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '7000000',
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '14000005',
      vnp_TxnRef: oldTxnRef,
    };
    const lateResult = await paymentsService.handleVnpayIpn(
      signParams(lateSuccessParams),
    );
    expect(lateResult.RspCode).toBe('02');

    const finalPayment = await paymentRepo.findOneBy({ id: savedPayment.id });
    expect(finalPayment?.paid_at?.getTime()).toBe(firstPaidAt);
    expect(finalPayment?.vnp_transaction_no).toBe('14000004');

    // Row attempt cũ vẫn phải được ghi lại — đây là bằng chứng để hoàn tiền.
    const oldAttempt = await attemptRepo.findOneBy({ vnp_txn_ref: oldTxnRef });
    expect(oldAttempt?.status).toBe(PaymentStatus.COMPLETED);
    expect(oldAttempt?.vnp_transaction_no).toBe('14000005');
  });

  it('14. IPN thất bại của lần thử CŨ đến muộn → KHÔNG hạ payment xuống FAILED', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);
    const attemptRepo = ds.getRepository(PaymentAttempt);

    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-013',
        total_amount: 60000,
        status: OrderStatus.PENDING,
      }),
    );
    const oldTxnRef = 'ORD-INT-013-1';
    const newTxnRef = 'ORD-INT-013-2';
    const savedPayment = await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        amount: 60000,
        vnp_txn_ref: newTxnRef,
      }),
    );
    const oldAttemptParams = {
      paymentId: savedPayment.id,
      txnRef: oldTxnRef,
      amount: 60000,
    };
    await seedAttempt(oldAttemptParams);
    const newAttemptParams = {
      paymentId: savedPayment.id,
      txnRef: newTxnRef,
      amount: 60000,
    };
    await seedAttempt(newAttemptParams);

    const lateFailParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '6000000',
      vnp_ResponseCode: '24',
      vnp_TransactionNo: '0',
      vnp_TxnRef: oldTxnRef,
    };
    const ipnResult = await paymentsService.handleVnpayIpn(
      signParams(lateFailParams),
    );
    expect(ipnResult.RspCode).toBe('00');

    // Khách đang trả trên URL mới — báo FAILED lúc này là sai trạng thái.
    const stillPending = await paymentRepo.findOneBy({ id: savedPayment.id });
    expect(stillPending?.status).toBe(PaymentStatus.PENDING);

    const oldAttempt = await attemptRepo.findOneBy({ vnp_txn_ref: oldTxnRef });
    expect(oldAttempt?.status).toBe(PaymentStatus.FAILED);
  });

  it('15. createVnpayPaymentUrl khi đơn đã CANCELLED → BadRequest', async () => {
    const orderRepo = ds.getRepository(Order);
    const paymentRepo = ds.getRepository(Payment);

    const customer = await seedCustomer('cancelled');
    const savedOrder = await orderRepo.save(
      orderRepo.create({
        order_number: 'ORD-INT-014',
        total_amount: 0,
        status: OrderStatus.CANCELLED,
        customer,
      }),
    );
    await paymentRepo.save(
      paymentRepo.create({
        order: savedOrder,
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.FAILED,
        amount: 0,
      }),
    );

    const buildParams = {
      orderId: savedOrder.id,
      userId: customer.id,
      ipAddr: '127.0.0.1',
    };
    await expect(
      paymentsService.createVnpayPaymentUrl(buildParams),
    ).rejects.toThrow(BadRequestException);
  });
});
