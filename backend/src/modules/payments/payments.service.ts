import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

// Entities
import { Payment } from '@/modules/payments/entities/payment.entity';
import { Order } from '@/modules/orders/entities/order.entity';

// Enums
import { PaymentMethod, PaymentStatus } from '@/common/enums';

// Services
import { VnpayService } from '@/modules/payments/vnpay/vnpay.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly vnpayService: VnpayService,
  ) {}

  // ==========================================
  // CHECKOUT SUPPORT (Cross-module Helpers)
  // ==========================================

  /**
   * Tạo bản ghi Payment ở trạng thái PENDING gắn vào Order trong cùng transaction.
   * OrdersService gọi helper này thay vì tự tạo Payment.
   *
   * @param params.orderId — ID đơn hàng đã tạo trong cùng tx
   * @param params.amount  — Tổng tiền thanh toán (đã làm tròn 2 chữ số)
   * @param params.method  — Phương thức (hiện COD)
   * @param params.manager — EntityManager của transaction OrdersService đang chạy
   */
  async createPendingForOrder(params: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    manager: EntityManager;
  }): Promise<Payment> {
    const { orderId, amount, method, manager } = params;
    const paymentData = {
      order: { id: orderId } as Order,
      method,
      amount,
      status: PaymentStatus.PENDING,
    };
    const payment = manager.create(Payment, paymentData);
    const savedPayment = await manager.save(Payment, payment);
    return savedPayment;
  }

  /** Cập nhật lại số tiền phải thu khi tổng đơn Master thay đổi (vd hủy 1 sub-order). */
  async updateAmountForOrder(params: {
    orderId: string;
    amount: number;
    manager: EntityManager;
  }): Promise<void> {
    const { orderId, amount, manager } = params;
    const findOptions = {
      where: { order: { id: orderId } },
    };
    const payment = await manager.findOne(Payment, findOptions);
    if (!payment) return;
    payment.amount = amount;
    await manager.save(Payment, payment);
  }

  // ==========================================
  // VNPAY
  // ==========================================

  /**
   * Tạo URL redirect sang cổng VNPay cho một đơn đã tồn tại.
   * Chỉ cho phép khi: đơn thuộc user, method = VNPAY, payment còn PENDING.
   * Mỗi lần gọi sinh vnp_txn_ref MỚI (hỗ trợ khách trả lại lần 2) và lưu đè lên payment.
   */
  async createVnpayPaymentUrl(params: {
    orderId: string;
    userId: string;
    ipAddr: string;
  }): Promise<{ paymentUrl: string }> {
    const isVnpayAvailable = this.vnpayService.isEnabled();
    if (!isVnpayAvailable) {
      throw new ServiceUnavailableException('VNPAY chưa được cấu hình');
    }

    const findOptions = {
      where: { order: { id: params.orderId } },
      relations: { order: { customer: true } },
    };
    const payment = await this.paymentRepository.findOne(findOptions);
    if (!payment || !payment.order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    if (payment.order.customer?.id !== params.userId) {
      // Không lộ tồn tại đơn của người khác.
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    if (payment.method !== PaymentMethod.VNPAY) {
      throw new BadRequestException('Đơn hàng này không thanh toán bằng VNPAY');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Đơn hàng đã được xử lý thanh toán');
    }

    // Mã giao dịch phải duy nhất theo TmnCode/ngày. Ghép order_number + mốc ms.
    const orderNumber = payment.order.order_number;
    const timestamp = Date.now();
    const txnRef = `${orderNumber}-${timestamp}`;
    payment.vnp_txn_ref = txnRef;
    await this.paymentRepository.save(payment);

    const paymentAmount = Number(payment.amount);
    const orderInfoText = `Thanh toan don hang ${orderNumber}`;
    const ipAddress = params.ipAddr;

    const buildParams = {
      txnRef,
      amount: paymentAmount,
      orderInfo: orderInfoText,
      ipAddr: ipAddress,
    };
    const paymentUrl = this.vnpayService.buildPaymentUrl(buildParams);
    return { paymentUrl };
  }

  /**
   * Xử lý IPN (server→server) — NGUỒN CHÂN LÝ cập nhật trạng thái thanh toán.
   * Trả về mã RspCode theo spec VNPay để cổng biết đã ghi nhận.
   *
   * Idempotent: khoá row payment (pessimistic_write). Nếu status != PENDING nghĩa là
   * IPN này đã xử lý trước đó → trả '02' (đã xác nhận), KHÔNG ghi lần 2.
   *
   * part1 CHỈ đổi payment.status (+ cột VNPay). KHÔNG đụng order.status / kho — part2 lo.
   */
  async handleVnpayIpn(
    query: Record<string, string>,
  ): Promise<{ RspCode: string; Message: string }> {
    const isSignatureValid = this.vnpayService.verifySignature(query);
    if (!isSignatureValid) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const txnRefKey = 'vnp_TxnRef';
    const responseCodeKey = 'vnp_ResponseCode';
    const amountKey = 'vnp_Amount';
    const transactionNoKey = 'vnp_TransactionNo';

    const txnRef = query[txnRefKey];
    const responseCode = query[responseCodeKey];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      // KHÔNG load relations ở đây: lock pessimistic_write + outer join dễ vỡ.
      const lockMode = 'pessimistic_write' as const;
      const findOptions = {
        where: { vnp_txn_ref: txnRef },
        lock: { mode: lockMode },
      };
      const payment = await manager.findOne(Payment, findOptions);
      if (!payment) {
        await queryRunner.rollbackTransaction();
        return { RspCode: '01', Message: 'Order not found' };
      }

      // So khớp số tiền (VNPay gửi đã nhân 100).
      const vnpAmount = Number(query[amountKey]);
      const expectedAmount = Math.round(Number(payment.amount) * 100);
      if (vnpAmount !== expectedAmount) {
        await queryRunner.rollbackTransaction();
        return { RspCode: '04', Message: 'Invalid amount' };
      }

      // Idempotent guard.
      if (payment.status !== PaymentStatus.PENDING) {
        await queryRunner.rollbackTransaction();
        return { RspCode: '02', Message: 'Order already confirmed' };
      }

      if (responseCode === '00') {
        payment.status = PaymentStatus.COMPLETED;
        payment.paid_at = new Date();
      } else {
        payment.status = PaymentStatus.FAILED;
      }
      payment.vnp_transaction_no = query[transactionNoKey] ?? null;
      payment.vnp_response_code = responseCode ?? null;
      payment.raw = query;
      await manager.save(Payment, payment);

      await queryRunner.commitTransaction();
      return { RspCode: '00', Message: 'Confirm Success' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('[PaymentsService.handleVnpayIpn] Error:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Xử lý Return URL (browser). CHỈ verify + trả thông tin hiển thị, KHÔNG ghi DB —
   * trạng thái thật do IPN quyết. FE (plan sau) đọc kết quả này để hiển thị.
   */
  handleVnpayReturn(query: Record<string, string>): {
    code: string;
    message: string;
    txnRef: string | null;
  } {
    const isSignatureValid = this.vnpayService.verifySignature(query);
    if (!isSignatureValid) {
      return { code: '97', message: 'Chữ ký không hợp lệ', txnRef: null };
    }
    const responseCodeKey = 'vnp_ResponseCode';
    const txnRefKey = 'vnp_TxnRef';

    const rc = query[responseCodeKey];
    const returnTxnRef = query[txnRefKey] ?? null;
    const returnMessage =
      rc === '00' ? 'Thanh toán thành công' : 'Thanh toán thất bại hoặc đã huỷ';

    return {
      code: rc,
      message: returnMessage,
      txnRef: returnTxnRef,
    };
  }
}
