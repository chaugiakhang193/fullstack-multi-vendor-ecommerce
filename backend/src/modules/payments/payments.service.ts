import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

// DTOs
import { CreatePaymentDto } from '@/modules/payments/dto/create-payment.dto';
import { UpdatePaymentDto } from '@/modules/payments/dto/update-payment.dto';

// Entities
import { Payment } from '@/modules/payments/entities/payment.entity';
import { Order } from '@/modules/orders/entities/order.entity';

// Enums
import { PaymentMethod, PaymentStatus } from '@/common/enums';

@Injectable()
export class PaymentsService {
  // === Scaffold mặc định (chưa dùng) ===
  create(createPaymentDto: CreatePaymentDto) {
    return 'This action adds a new payment';
  }

  findAll() {
    return `This action returns all payments`;
  }

  findOne(id: number) {
    return `This action returns a #${id} payment`;
  }

  update(id: number, updatePaymentDto: UpdatePaymentDto) {
    return `This action updates a #${id} payment`;
  }

  remove(id: number) {
    return `This action removes a #${id} payment`;
  }

  // ==========================================
  // CHECKOUT SUPPORT (Cross-module Helpers)
  // ==========================================

  /**
   * Tạo bản ghi Payment ở trạng thái PENDING gắn vào Order trong cùng transaction.
   *
   * Theo Rule II.11 (không tiêm chéo Repository), OrdersService không tự tạo
   * Payment qua manager mà gọi helper này — toàn bộ nghiệp vụ Payment đóng gói
   * trong PaymentsService.
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

  /**
   * Cập nhật lại số tiền phải thu của Payment khi tổng đơn Master thay đổi
   * (vd hủy 1 sub-order). Tìm theo quan hệ order (OneToOne) trong cùng transaction.
   */
  async updateAmountForOrder(params: {
    orderId: string;
    amount: number;
    manager: EntityManager;
  }): Promise<void> {
    const { orderId, amount, manager } = params;
    const payment = await manager.findOne(Payment, {
      where: { order: { id: orderId } },
    });
    if (!payment) {
      return;
    }
    payment.amount = amount;
    await manager.save(Payment, payment);
  }
}
