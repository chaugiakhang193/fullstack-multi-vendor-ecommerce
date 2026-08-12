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
import { PaymentAttempt } from '@/modules/payments/entities/payment-attempt.entity';
import { Order } from '@/modules/orders/entities/order.entity';

// Enums
import { PaymentMethod, PaymentStatus, OrderStatus } from '@/common/enums';

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
   * Cho phép khi: đơn thuộc user, method = VNPAY, đơn chưa hủy, payment đang
   * PENDING hoặc FAILED (FAILED = khách trả lại lần nữa trên cùng đơn).
   *
   * Mỗi lần gọi sinh một row PaymentAttempt với vnp_txn_ref riêng và đưa payment
   * về PENDING — hai việc này phải nằm trong CÙNG transaction có khoá row.
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
    // Hủy hết sub-order thì recomputeMasterAfterSubOrderChange hạ total_amount về 0
    // và chuyển đơn sang CANCELLED — không chặn ở đây sẽ dựng URL VNPay số tiền 0.
    if (payment.order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Đơn hàng đã bị hủy, không thể thanh toán');
    }

    const orderNumber = payment.order.order_number;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let createdTxnRef: string;
    let createdAmount: number;
    try {
      const manager = queryRunner.manager;

      // Khoá theo khoá chính, KHÔNG kèm relations (outer join + FOR UPDATE vỡ).
      // Trạng thái đọc ở trên chỉ là ảnh chụp: IPN của lần thử trước có thể vừa
      // ghi xong xen vào giữa, nên mọi kiểm tra theo status phải làm LẠI ở đây.
      const lockMode = 'pessimistic_write' as const;
      const lockOptions = {
        where: { id: payment.id },
        lock: { mode: lockMode },
      };
      const lockedPayment = await manager.findOne(Payment, lockOptions);
      if (!lockedPayment) {
        throw new NotFoundException('Không tìm thấy đơn hàng');
      }
      if (lockedPayment.status === PaymentStatus.COMPLETED) {
        throw new BadRequestException('Đơn hàng đã được thanh toán thành công');
      }
      if (lockedPayment.status === PaymentStatus.REFUNDED) {
        throw new BadRequestException('Đơn hàng đã được hoàn tiền');
      }

      const amount = Number(lockedPayment.amount);
      const isAmountPayable = amount > 0;
      if (!isAmountPayable) {
        throw new BadRequestException('Số tiền thanh toán không hợp lệ');
      }

      // Mã giao dịch phải duy nhất theo TmnCode/ngày. Ghép order_number + mốc ms.
      const timestamp = Date.now();
      const txnRef = `${orderNumber}-${timestamp}`;

      const attemptData = {
        payment_id: lockedPayment.id,
        vnp_txn_ref: txnRef,
        amount,
        status: PaymentStatus.PENDING,
      };
      const attempt = manager.create(PaymentAttempt, attemptData);
      await manager.save(PaymentAttempt, attempt);

      // Reset về PENDING là BẮT BUỘC khi mở guard cho FAILED: handleVnpayIpn chặn
      // mọi status != PENDING (RspCode 02). Không reset thì IPN THẬT của lần thử
      // này bị hiểu là "đã xử lý rồi" và payment không bao giờ sang COMPLETED.
      // Xóa luôn các cột kết quả cũ — chúng là bản sao của lần thử MỚI NHẤT, giữ
      // lại sẽ có payment PENDING mà vnp_response_code='24' (đọc rất khó hiểu).
      // Lịch sử không mất: row attempt cũ giữ nguyên đầy đủ.
      lockedPayment.status = PaymentStatus.PENDING;
      lockedPayment.vnp_txn_ref = txnRef;
      lockedPayment.vnp_transaction_no = null;
      lockedPayment.vnp_response_code = null;
      lockedPayment.raw = null;
      await manager.save(Payment, lockedPayment);

      await queryRunner.commitTransaction();
      createdTxnRef = txnRef;
      createdAmount = amount;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const orderInfoText = `Thanh toan don hang ${orderNumber}`;
    const ipAddress = params.ipAddr;
    const buildParams = {
      txnRef: createdTxnRef,
      amount: createdAmount,
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
   * Tra cứu theo PaymentAttempt chứ không theo Payment: mỗi lần khách bấm thanh
   * toán sinh một vnp_txn_ref riêng, nên IPN đến muộn của lần thử CŨ vẫn tìm được
   * đúng row của nó thay vì trả 01 (trước đây Payment chỉ giữ mã mới nhất).
   *
   * Idempotent ở mức LẦN THỬ: khoá row attempt (pessimistic_write), status != PENDING
   * nghĩa là IPN này đã xử lý rồi → '02', không ghi lần hai.
   *
   * Vẫn CHỈ đổi trạng thái thanh toán. KHÔNG đụng order.status / kho — part2 lo.
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

      // Thứ tự khoá: attempt TRƯỚC rồi mới tới payment (xem syncPaymentFromAttempt).
      // createVnpayPaymentUrl khoá payment rồi INSERT attempt MỚI — insert không
      // chạm row attempt cũ nào nên hai luồng không tạo được vòng chờ (deadlock).
      const lockMode = 'pessimistic_write' as const;
      const attemptOptions = {
        where: { vnp_txn_ref: txnRef },
        lock: { mode: lockMode },
      };
      const attempt = await manager.findOne(PaymentAttempt, attemptOptions);
      if (!attempt) {
        await queryRunner.rollbackTransaction();
        return { RspCode: '01', Message: 'Order not found' };
      }

      // So khớp số tiền theo CHÍNH lần thử này (VNPay gửi đã nhân 100), không theo
      // payment.amount hiện tại — đơn có thể bị hủy bớt sub-order sau khi dựng URL.
      const vnpAmount = Number(query[amountKey]);
      const expectedAmount = Math.round(Number(attempt.amount) * 100);
      if (vnpAmount !== expectedAmount) {
        await queryRunner.rollbackTransaction();
        return { RspCode: '04', Message: 'Invalid amount' };
      }

      // Idempotent guard ở mức lần thử.
      if (attempt.status !== PaymentStatus.PENDING) {
        await queryRunner.rollbackTransaction();
        return { RspCode: '02', Message: 'Order already confirmed' };
      }

      const isTransactionSuccess = responseCode === '00';
      attempt.status = isTransactionSuccess
        ? PaymentStatus.COMPLETED
        : PaymentStatus.FAILED;
      attempt.vnp_transaction_no = query[transactionNoKey] ?? null;
      attempt.vnp_response_code = responseCode ?? null;
      attempt.ipn_received_at = new Date();
      attempt.raw = query;
      await manager.save(PaymentAttempt, attempt);

      const syncResult = await this.syncPaymentFromAttempt(attempt, manager);

      // Commit TRƯỚC khi xét nhánh trả 02: row attempt vừa ghi là bằng chứng đã
      // thu tiền lần hai, rollback ở đây là mất luôn dấu vết cần để hoàn tiền.
      await queryRunner.commitTransaction();

      if (syncResult.isDuplicatePaid) {
        return { RspCode: '02', Message: 'Order already confirmed' };
      }
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
   * Đồng bộ trạng thái Payment theo kết quả một lần thử. Tách riêng vì phần này có
   * ba nhánh nghiệp vụ khác hẳn nhau, để chung làm handleVnpayIpn dài quá ngưỡng đọc.
   *
   * Trả về isDuplicatePaid = true khi lần thử này báo thành công NHƯNG payment đã
   * COMPLETED bởi một lần thử khác — nghĩa là khách bị thu tiền hai lần, phải hoàn tay.
   */
  private async syncPaymentFromAttempt(
    attempt: PaymentAttempt,
    manager: EntityManager,
  ): Promise<{ isDuplicatePaid: boolean }> {
    const lockMode = 'pessimistic_write' as const;
    const lockOptions = {
      where: { id: attempt.payment_id },
      lock: { mode: lockMode },
    };
    const payment = await manager.findOne(Payment, lockOptions);
    if (!payment) {
      return { isDuplicatePaid: false };
    }

    const isAttemptSuccess = attempt.status === PaymentStatus.COMPLETED;
    const isLatestAttempt = payment.vnp_txn_ref === attempt.vnp_txn_ref;
    const isPaymentAlreadyCompleted =
      payment.status === PaymentStatus.COMPLETED;

    if (!isAttemptSuccess) {
      // IPN thất bại của lần thử CŨ đến muộn: khách đã bấm thử lại và đang trả trên
      // URL mới, hạ payment xuống FAILED là báo sai trong khi giao dịch mới còn sống.
      const canMarkFailed =
        isLatestAttempt && payment.status === PaymentStatus.PENDING;
      if (canMarkFailed) {
        payment.status = PaymentStatus.FAILED;
        payment.vnp_transaction_no = attempt.vnp_transaction_no;
        payment.vnp_response_code = attempt.vnp_response_code;
        payment.raw = attempt.raw;
        await manager.save(Payment, payment);
      }
      return { isDuplicatePaid: false };
    }

    if (isPaymentAlreadyCompleted) {
      const duplicateMessage =
        `[PaymentsService.syncPaymentFromAttempt] Payment ${payment.id} đã COMPLETED, ` +
        `lần thử ${attempt.vnp_txn_ref} cũng báo thành công — nghi thu tiền 2 lần, cần hoàn tay`;
      this.logger.error(duplicateMessage);
      return { isDuplicatePaid: true };
    }

    // Số tiền đơn có thể đã đổi sau khi dựng URL (khách hủy bớt sub-order). Vẫn ghi
    // nhận đã trả — tiền về thật — nhưng để lại dấu vết cho khâu đối soát.
    const currentAmount = Number(payment.amount);
    const paidAmount = Number(attempt.amount);
    const isAmountMatched = currentAmount === paidAmount;
    if (!isAmountMatched) {
      const amountMessage =
        `[PaymentsService.syncPaymentFromAttempt] Payment ${payment.id} thu ${paidAmount} ` +
        `nhưng số tiền hiện tại của đơn là ${currentAmount} — cần đối soát`;
      this.logger.warn(amountMessage);
    }

    // Tiền đã về thì đánh dấu đã trả kể cả khi đây là lần thử CŨ (khách quay lại
    // tab VNPay trước đó rồi trả). Bản sao trên payment trỏ về đúng lần thử đã thu
    // được tiền — an toàn vì một khi COMPLETED thì nhánh hạ FAILED không chạy nữa.
    payment.status = PaymentStatus.COMPLETED;
    payment.paid_at = attempt.ipn_received_at ?? new Date();
    payment.vnp_txn_ref = attempt.vnp_txn_ref;
    payment.vnp_transaction_no = attempt.vnp_transaction_no;
    payment.vnp_response_code = attempt.vnp_response_code;
    payment.raw = attempt.raw;
    await manager.save(Payment, payment);
    return { isDuplicatePaid: false };
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

  // ==========================================
  // COD — HOÀN TẤT KHI GIAO XONG
  // ==========================================

  /**
   * Đánh dấu payment COD hoàn tất khi Order (Master) đạt DELIVERED — nghĩa là
   * MỌI sub-order (mọi shop) đều đã giao. Payment là OneToOne với Order (không
   * phải SubOrder) nên phải chờ TRỌN đơn giao xong mới khớp đúng payment.amount;
   * đánh dấu sớm khi mới 1 shop giao sẽ báo sai "đã thu đủ tiền".
   *
   * Idempotent (chỉ set khi còn PENDING) và chỉ áp dụng COD — VNPAY do IPN sở
   * hữu hoàn toàn trạng thái thanh toán, method này không đụng tới.
   */
  async markCodCompleted(params: {
    orderId: string;
    paidAt: Date;
    manager: EntityManager;
  }): Promise<void> {
    const { orderId, paidAt, manager } = params;
    const payment = await manager.findOne(Payment, {
      where: { order: { id: orderId } },
    });
    if (!payment || payment.method !== PaymentMethod.COD) {
      return;
    }
    if (payment.status !== PaymentStatus.PENDING) {
      return;
    }
    payment.status = PaymentStatus.COMPLETED;
    payment.paid_at = paidAt;
    await manager.save(Payment, payment);
  }

  /**
   * Backfill 1 lần: đơn COD đã DELIVERED TRƯỚC khi markCodCompleted() tồn tại
   * kẹt payment.status=PENDING vĩnh viễn (DELIVERED là trạng thái cuối, không
   * còn transition nào chạm lại chúng nữa). Chạy tay qua endpoint admin.
   *
   * paid_at lấy MAX(delivered_at) của các sub-order thuộc đơn — đơn nhiều shop
   * có nhiều mốc giao khác nhau, lấy mốc SAU CÙNG làm mốc "toàn đơn đã giao".
   * Đơn nào toàn bộ sub-order đều delivered_at=null (giao TRƯỚC khi có cột này)
   * thì bỏ qua — thà để PENDING còn hơn bịa 1 mốc giờ không có căn cứ.
   */
  async backfillCodCompletedPayments(): Promise<{ updated: number }> {
    const candidates = await this.paymentRepository.find({
      where: {
        method: PaymentMethod.COD,
        status: PaymentStatus.PENDING,
        order: { status: OrderStatus.DELIVERED },
      },
      relations: { order: { sub_orders: true } },
    });

    let updated = 0;
    for (const payment of candidates) {
      const deliveredDates = payment.order.sub_orders
        .map((subOrder) => subOrder.delivered_at)
        .filter((date): date is Date => date !== null);
      if (deliveredDates.length === 0) {
        continue;
      }
      const latestDeliveredMs = Math.max(
        ...deliveredDates.map((date) => date.getTime()),
      );
      payment.status = PaymentStatus.COMPLETED;
      payment.paid_at = new Date(latestDeliveredMs);
      await this.paymentRepository.save(payment);
      updated += 1;
    }

    return { updated };
  }
}
