import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, In } from 'typeorm';

// Entities
import { ReturnRequest } from '@/modules/returns/entities/return-request.entity';
import { ReturnItem } from '@/modules/returns/entities/return-item.entity';
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';

// Truy cập dữ liệu đơn hàng qua service của Orders, kho qua ProductStockService —
// không inject repo chéo module.
import { OrdersService } from '@/modules/orders/orders.service';
import { ProductStockService } from '@/modules/products/product-stock.service';
import { ShopsService } from '@/modules/shops/shops.service';

// DTOs
import { CreateReturnRequestDto } from '@/modules/returns/dto/create-return.dto';
import { RejectReturnDto } from '@/modules/returns/dto/reject-return.dto';
import {
  ReturnRequestResponseDto,
  ReturnItemResponseDto,
} from '@/modules/returns/dto/return-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

// Helpers & Enums & Limits
import { paginate } from '@/common/helpers/pagination.helper';
import { OrderStatus, OutboxEventStatus, ReturnStatus } from '@/common/enums';
import { ORDER_LIMITS } from '@/common/limits';
import {
  OUTBOX_EVENT_TYPES,
  ReturnRequestedOutboxPayload,
  ReturnStatusChangedOutboxPayload,
} from '@/common/constants/outbox.constants';

// Các trạng thái coi là "đang mở" — chặn tạo request thứ 2 trên cùng sub-order.
const ACTIVE_RETURN_STATUSES = [ReturnStatus.REQUESTED, ReturnStatus.APPROVED];

// Chuyển trạng thái do SELLER thao tác. CANCELLED (REQUESTED→) là của khách (cancelReturn).
const RETURN_STATE_MACHINE: Record<ReturnStatus, ReturnStatus[]> = {
  [ReturnStatus.REQUESTED]: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
  [ReturnStatus.APPROVED]: [ReturnStatus.RECEIVED, ReturnStatus.REJECTED],
  [ReturnStatus.REJECTED]: [],
  [ReturnStatus.RECEIVED]: [],
  [ReturnStatus.CANCELLED]: [],
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class ReturnsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ReturnRequest)
    private readonly returnRepo: Repository<ReturnRequest>,
    private readonly ordersService: OrdersService,
    private readonly productStockService: ProductStockService,
    private readonly shopsService: ShopsService,
  ) {}

  // ==========================================
  // CUSTOMER — TẠO YÊU CẦU TRẢ (item-level)
  // ==========================================
  async createReturn(
    userId: string,
    dto: CreateReturnRequestDto,
  ): Promise<ReturnRequestResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const manager = queryRunner.manager;
      const { subOrderId } = dto;

      // Khóa + load sub-order qua OrdersService, chạy trong transaction này qua manager.
      const subOrder = await this.ordersService.lockAndLoadSubOrderForReturn(
        subOrderId,
        manager,
      );
      if (!subOrder || !subOrder.order) {
        throw new NotFoundException('Không tìm thấy đơn hàng con');
      }

      // Chỉ chủ đơn được trả (chống IDOR).
      if (subOrder.order.customer?.id !== userId) {
        throw new NotFoundException('Không tìm thấy đơn hàng con');
      }

      // Chỉ sub-order đã giao mới được trả.
      if (subOrder.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException(
          'Chỉ có thể trả hàng cho đơn đã giao thành công',
        );
      }

      // Trong cửa sổ RETURN_WINDOW_DAYS kể từ lúc giao.
      if (!subOrder.delivered_at) {
        throw new BadRequestException(
          'Không xác định được ngày giao — không đủ điều kiện trả hàng',
        );
      }
      const windowMs = ORDER_LIMITS.RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const deadline = new Date(subOrder.delivered_at).getTime() + windowMs;
      if (Date.now() > deadline) {
        throw new BadRequestException(
          `Đã quá hạn trả hàng (${ORDER_LIMITS.RETURN_WINDOW_DAYS} ngày kể từ khi giao)`,
        );
      }

      // Mỗi sub-order chỉ có 1 yêu cầu đang mở tại một thời điểm.
      const activeCount = await manager.count(ReturnRequest, {
        where: {
          sub_order: { id: subOrderId },
          status: In(ACTIVE_RETURN_STATUSES),
        },
      });
      if (activeCount > 0) {
        throw new ConflictException(
          'Đơn này đang có một yêu cầu trả hàng chờ xử lý',
        );
      }

      // Tiền hàng sub-order sau giảm giá shop (chưa trừ global, chưa gồm ship).
      const subTotal = parseFloat(String(subOrder.sub_total ?? '0'));
      if (subTotal <= 0) {
        throw new BadRequestException(
          'Đơn hàng không hợp lệ để tính hoàn tiền',
        );
      }
      const shopDiscount = parseFloat(
        String(subOrder.shop_discount_amount ?? '0'),
      );
      const subOrderGoods = Math.max(subTotal - shopDiscount, 0);

      // Phân bổ global discount (cấp master) cho sub-order này theo tỷ lệ tiền hàng
      // cả đơn. Bất biến theo thời điểm mua — KHÔNG xét lại điều kiện coupon khi trả.
      const globalDiscount = parseFloat(
        String(subOrder.order.global_discount_amount ?? '0'),
      );
      const orderGoods = (subOrder.order.sub_orders ?? []).reduce((sum, so) => {
        const soSubTotal = parseFloat(String(so.sub_total ?? '0'));
        const soShopDiscount = parseFloat(
          String(so.shop_discount_amount ?? '0'),
        );
        return sum + Math.max(soSubTotal - soShopDiscount, 0);
      }, 0);
      const globalShare =
        orderGoods > 0 ? globalDiscount * (subOrderGoods / orderGoods) : 0;

      // Cơ sở hoàn = tiền hàng sau giảm giá shop VÀ phần global phân bổ (không gồm ship).
      const refundableBase = Math.max(subOrderGoods - globalShare, 0);

      // Validate từng dòng: thuộc sub-order, không trùng, không vượt số chưa trả.
      const itemMap = new Map(subOrder.items.map((it) => [it.id, it]));
      const seen = new Set<string>();
      const returnItems: ReturnItem[] = [];
      let refundTotal = 0;

      for (const line of dto.items) {
        if (seen.has(line.orderItemId)) {
          throw new BadRequestException('Sản phẩm bị lặp trong yêu cầu trả');
        }
        seen.add(line.orderItemId);

        const orderItem = itemMap.get(line.orderItemId);
        if (!orderItem) {
          throw new BadRequestException(
            'Sản phẩm không thuộc đơn hàng con này',
          );
        }

        // Số đã trả thành công (RECEIVED) của order_item này — tính trực tiếp từ DB.
        const returned = await manager
          .createQueryBuilder(ReturnItem, 'ri')
          .innerJoin('ri.return_request', 'rr')
          .where('ri.order_item_id = :oid', { oid: orderItem.id })
          .andWhere('rr.status = :st', { st: ReturnStatus.RECEIVED })
          .select('COALESCE(SUM(ri.quantity), 0)', 'sum')
          .getRawOne<{ sum: string }>();
        const available =
          (orderItem.quantity ?? 0) - parseInt(returned?.sum ?? '0', 10);
        if (line.quantity > available) {
          throw new BadRequestException(
            `Vượt số lượng có thể trả cho "${orderItem.product_name}" (còn ${available})`,
          );
        }

        const unitPrice = parseFloat(
          String(orderItem.price_at_purchase ?? '0'),
        );
        const refundAmount = round2(
          ((unitPrice * line.quantity) / subTotal) * refundableBase,
        );
        refundTotal += refundAmount;

        const returnItem = manager.create(ReturnItem, {
          order_item: { id: orderItem.id } as any,
          quantity: line.quantity,
          refund_amount: refundAmount,
        });
        returnItems.push(returnItem);
      }

      const request = manager.create(ReturnRequest, {
        sub_order: { id: subOrderId } as any,
        customer: { id: userId } as any,
        shop: subOrder.shop ? ({ id: subOrder.shop.id } as any) : null,
        status: ReturnStatus.REQUESTED,
        reason: dto.reason,
        customer_note: dto.customerNote,
        refund_total: round2(refundTotal),
        items: returnItems,
      });
      const saved = await manager.save(ReturnRequest, request);

      const returnShopId = subOrder.shop?.id ?? '';
      const returnSellerMap = await this.shopsService.getSellerIdsByShopIds(
        returnShopId ? [returnShopId] : [],
      );
      const requestedPayload: ReturnRequestedOutboxPayload = {
        returnId: saved.id,
        subOrderId: subOrder.id,
        orderNumber: subOrder.order.order_number,
        shopId: returnShopId,
        sellerId: returnSellerMap[returnShopId] ?? null,
        customerId: userId,
      };
      await manager.save(
        manager.create(OutboxEvent, {
          event_type: OUTBOX_EVENT_TYPES.RETURN_REQUESTED,
          payload: requestedPayload,
          status: OutboxEventStatus.PENDING,
        }),
      );

      await queryRunner.commitTransaction();

      // Load lại kèm items + order_item để trả response đầy đủ.
      return this.getReturnDetail(userId, saved.id);
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  // ==========================================
  // CUSTOMER — HỦY YÊU CẦU (chỉ khi REQUESTED)
  // ==========================================
  async cancelReturn(
    userId: string,
    returnId: string,
  ): Promise<{ id: string; status: ReturnStatus }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const manager = queryRunner.manager;

      const locked = await manager.findOne(ReturnRequest, {
        where: { id: returnId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Không tìm thấy yêu cầu trả hàng');
      }

      const request = await manager.findOne(ReturnRequest, {
        where: { id: returnId },
        relations: { customer: true },
      });
      if (!request || request.customer?.id !== userId) {
        throw new NotFoundException('Không tìm thấy yêu cầu trả hàng');
      }
      if (request.status !== ReturnStatus.REQUESTED) {
        throw new BadRequestException(
          'Chỉ có thể hủy yêu cầu khi đang chờ shop duyệt',
        );
      }

      request.status = ReturnStatus.CANCELLED;
      request.resolved_at = new Date();
      await manager.save(ReturnRequest, request);

      await queryRunner.commitTransaction();
      return { id: request.id, status: request.status };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  // ==========================================
  // CUSTOMER — DANH SÁCH & CHI TIẾT
  // ==========================================
  async getMyReturns(userId: string, query: PaginationQueryDto) {
    const qb = this.returnRepo
      .createQueryBuilder('rr')
      .leftJoinAndSelect('rr.items', 'items')
      .leftJoinAndSelect('items.order_item', 'oi')
      .leftJoinAndSelect('rr.sub_order', 'so')
      .leftJoin('rr.customer', 'c')
      .where('c.id = :userId', { userId })
      .orderBy('rr.created_at', 'DESC');

    const { items, meta } = await paginate(qb, query);
    return { items: items.map((r) => this.toResponse(r)), meta };
  }

  async getReturnDetail(
    userId: string,
    returnId: string,
  ): Promise<ReturnRequestResponseDto> {
    const request = await this.returnRepo.findOne({
      where: { id: returnId, customer: { id: userId } },
      relations: { sub_order: true, items: { order_item: true } },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu trả hàng');
    }
    return this.toResponse(request);
  }

  // ==========================================
  // SELLER — DUYỆT / TỪ CHỐI
  // ==========================================
  async approveReturn(
    sellerId: string,
    returnId: string,
  ): Promise<ReturnRequestResponseDto> {
    return this.sellerResolve(sellerId, returnId, ReturnStatus.APPROVED, null);
  }

  async rejectReturn(
    sellerId: string,
    returnId: string,
    dto: RejectReturnDto,
  ): Promise<ReturnRequestResponseDto> {
    return this.sellerResolve(
      sellerId,
      returnId,
      ReturnStatus.REJECTED,
      dto.sellerNote,
    );
  }

  // Dùng chung cho APPROVE + REJECT (đổi trạng thái + outbox, KHÔNG restock).
  private async sellerResolve(
    sellerId: string,
    returnId: string,
    newStatus: ReturnStatus,
    sellerNote: string | null,
  ): Promise<ReturnRequestResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const manager = queryRunner.manager;

      const locked = await manager.findOne(ReturnRequest, {
        where: { id: returnId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Không tìm thấy yêu cầu trả hàng');
      }

      const request = await manager.findOne(ReturnRequest, {
        where: { id: returnId },
        relations: {
          shop: { seller: true },
          customer: true,
          sub_order: { order: true },
        },
      });
      if (!request || request.shop?.seller?.id !== sellerId) {
        throw new NotFoundException('Không tìm thấy yêu cầu trả hàng');
      }

      this.assertTransition(request.status, newStatus);

      request.status = newStatus;
      if (newStatus === ReturnStatus.REJECTED) {
        request.seller_note = sellerNote;
        request.resolved_at = new Date();
      }
      await manager.save(ReturnRequest, request);

      await this.emitReturnStatusChanged(
        request,
        newStatus,
        sellerNote,
        manager,
      );

      await queryRunner.commitTransaction();
      return this.getSellerReturnDetail(sellerId, returnId);
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  // ==========================================
  // SELLER — XÁC NHẬN NHẬN HÀNG (RECEIVED) + RESTOCK
  // ==========================================
  async receiveReturn(
    sellerId: string,
    returnId: string,
  ): Promise<ReturnRequestResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const manager = queryRunner.manager;

      const locked = await manager.findOne(ReturnRequest, {
        where: { id: returnId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Không tìm thấy yêu cầu trả hàng');
      }

      const request = await manager.findOne(ReturnRequest, {
        where: { id: returnId },
        relations: {
          shop: { seller: true },
          customer: true,
          sub_order: { order: true },
          items: { order_item: { variant: true, product: true } },
        },
      });
      if (!request || request.shop?.seller?.id !== sellerId) {
        throw new NotFoundException('Không tìm thấy yêu cầu trả hàng');
      }

      this.assertTransition(request.status, ReturnStatus.RECEIVED);

      // Restock đúng số lượng từng item (KHÔNG hoàn coupon). lockAndRestock tự sort ID.
      const restockTargets = request.items
        .filter((ri) => ri.order_item && ri.order_item.product)
        .map((ri) => ({
          product_id: ri.order_item.product.id,
          variant_id: ri.order_item.variant?.id ?? null,
          quantity: ri.quantity,
        }));
      if (restockTargets.length > 0) {
        await this.productStockService.lockAndRestock(restockTargets, manager);
      }

      request.status = ReturnStatus.RECEIVED;
      request.resolved_at = new Date();
      await manager.save(ReturnRequest, request);

      // Nếu mọi order_item của sub-order đã trả hết → sub_order RETURNED.
      const receivedByItem = await this.sumReceivedByOrderItem(
        request.sub_order.id,
        manager,
      );
      await this.ordersService.markSubOrderReturnedIfComplete(
        request.sub_order.id,
        receivedByItem,
        manager,
      );

      await this.emitReturnStatusChanged(
        request,
        ReturnStatus.RECEIVED,
        null,
        manager,
      );

      await queryRunner.commitTransaction();
      return this.getSellerReturnDetail(sellerId, returnId);
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  // ==========================================
  // SELLER — DANH SÁCH & CHI TIẾT (theo shop)
  // ==========================================
  async getSellerReturns(sellerId: string, query: PaginationQueryDto) {
    const qb = this.returnRepo
      .createQueryBuilder('rr')
      .leftJoinAndSelect('rr.items', 'items')
      .leftJoinAndSelect('items.order_item', 'oi')
      .leftJoinAndSelect('rr.sub_order', 'so')
      .leftJoin('rr.shop', 'shop')
      .leftJoin('shop.seller', 'seller')
      .where('seller.id = :sellerId', { sellerId })
      .orderBy('rr.created_at', 'DESC');

    const { items, meta } = await paginate(qb, query);
    return { items: items.map((r) => this.toResponse(r)), meta };
  }

  async getSellerReturnDetail(
    sellerId: string,
    returnId: string,
  ): Promise<ReturnRequestResponseDto> {
    const request = await this.returnRepo.findOne({
      where: { id: returnId, shop: { seller: { id: sellerId } } },
      relations: { sub_order: true, items: { order_item: true } },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu trả hàng');
    }
    return this.toResponse(request);
  }

  // ---------- private helpers ----------
  private assertTransition(from: ReturnStatus, to: ReturnStatus): void {
    const allowed = RETURN_STATE_MACHINE[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Không thể chuyển yêu cầu trả từ "${from}" sang "${to}"`,
      );
    }
  }

  // Tổng số lượng đã RECEIVED theo từng order_item của 1 sub-order (gồm cả request vừa lưu).
  private async sumReceivedByOrderItem(
    subOrderId: string,
    manager: EntityManager,
  ): Promise<Map<string, number>> {
    const rows = await manager
      .createQueryBuilder(ReturnItem, 'ri')
      .innerJoin('ri.return_request', 'rr')
      .where('rr.sub_order_id = :sid', { sid: subOrderId })
      .andWhere('rr.status = :st', { st: ReturnStatus.RECEIVED })
      .select('ri.order_item_id', 'oid')
      .addSelect('SUM(ri.quantity)', 'sum')
      .groupBy('ri.order_item_id')
      .getRawMany<{ oid: string; sum: string }>();
    return new Map(rows.map((r) => [r.oid, parseInt(r.sum, 10)]));
  }

  // Ghi outbox return.status_changed (báo customer). Gọi trong transaction của caller.
  private async emitReturnStatusChanged(
    request: ReturnRequest,
    newStatus: ReturnStatus,
    sellerNote: string | null,
    manager: EntityManager,
  ): Promise<void> {
    const payload: ReturnStatusChangedOutboxPayload = {
      returnId: request.id,
      subOrderId: request.sub_order.id,
      orderNumber: request.sub_order.order.order_number,
      customerId: request.customer.id,
      status: newStatus,
      sellerNote,
    };
    await manager.save(
      manager.create(OutboxEvent, {
        event_type: OUTBOX_EVENT_TYPES.RETURN_STATUS_CHANGED,
        payload,
        status: OutboxEventStatus.PENDING,
      }),
    );
  }

  private toResponse(request: ReturnRequest): ReturnRequestResponseDto {
    const items: ReturnItemResponseDto[] = (request.items ?? []).map((ri) => ({
      id: ri.id,
      orderItemId: ri.order_item?.id ?? '',
      productName: ri.order_item?.product_name ?? '',
      variantName: ri.order_item?.variant_name ?? null,
      quantity: ri.quantity,
      refundAmount: String(ri.refund_amount ?? '0'),
    }));
    return {
      id: request.id,
      subOrderId: request.sub_order?.id ?? '',
      status: request.status,
      reason: request.reason,
      customerNote: request.customer_note,
      sellerNote: request.seller_note,
      resolvedAt: request.resolved_at,
      refundTotal: String(request.refund_total ?? '0'),
      items,
      createdAt: request.created_at,
    };
  }
}
