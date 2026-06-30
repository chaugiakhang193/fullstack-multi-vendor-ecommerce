import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomBytes } from 'crypto';

// Entities
import { Order } from '@/modules/orders/entities/order.entity';
import { SubOrder } from '@/modules/orders/entities/sub-order.entity';
import { OrderItem } from '@/modules/orders/entities/order-item.entity';
import { Idempotency } from '@/modules/orders/entities/idempotency.entity';
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';
import { Address } from '@/modules/users/entities/address.entity';
import { Coupon } from '@/modules/promotions/entities/coupon.entity';
import { CartItem } from '@/modules/carts/entities/cart-item.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { User } from '@/modules/users/entities/user.entity';

// DTOs
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import {
  CheckoutResponseDto,
  CheckoutResponseItemDto,
  CheckoutResponseSubOrderDto,
} from '@/modules/orders/dto/checkout-response.dto';
import { CustomerOrderQueryDto } from '@/modules/orders/dto/customer-order-query.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate } from '@/common/helpers/pagination.helper';

// Services
import { CartsService } from '@/modules/carts/carts.service';
import { ProductStockService } from '@/modules/products/product-stock.service';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { UsersService } from '@/modules/users/users.service';
import { PaymentsService } from '@/modules/payments/payments.service';

// Interfaces (chỉ dùng cho type metadata — interface không có runtime)
import type {
  IShippingCalculator,
  ShippingAddressSnapshot,
} from '@/modules/orders/shipping.interface';

// Enums
import {
  CouponType,
  DiscountType,
  IdempotencyStatus,
  OrderStatus,
  OutboxEventStatus,
  PaymentMethod,
} from '@/common/enums';

// Constants
import {
  UQ_ORDER_IDEMPOTENCY_KEY,
  ORDER_NUMBER_MAX_RETRIES,
} from '@/modules/orders/orders.constants';
import {
  OUTBOX_EVENT_TYPES,
  OrderCreatedPayload,
  OrderCancelledPayload,
  OrderStatusUpdatedPayload,
} from '@/common/constants/outbox.constants';
import { SellerOrderQueryDto } from '@/modules/orders/dto/seller-order-query.dto';
import { CheckoutPreviewDto } from '@/modules/orders/dto/checkout-preview.dto';
import { SHIPPING_LIMITS } from '@/common/limits';
import {
  CheckoutPreviewResponseDto,
  PreviewShopDto,
  PreviewItemDto,
} from '@/modules/orders/dto/checkout-preview-response.dto';

// Round helper — giữ 2 chữ số thập phân cho mọi con số tiền
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Ngưỡng freeship per-shop (khớp HaversineShippingCalculator) + cửa sổ gợi ý mua thêm.
const FREE_SHIPPING_THRESHOLD = SHIPPING_LIMITS.FREE_SHIPPING_THRESHOLD;
const FREESHIP_UPSELL_WINDOW = 100000;

// Tồn kho ≤ ngưỡng này thì preview hiện cảnh báo "Chỉ còn X sản phẩm".
const LOW_STOCK_THRESHOLD = 5;

// Trục tiến độ để suy ra status Master từ các sub-order. CANCELLED nằm NGOÀI trục.
const STATUS_PROGRESSION: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPING,
  OrderStatus.DELIVERED,
];

// State Machine cho chuyển trạng thái sub-order do Seller thao tác.
// SHIPPING chỉ → DELIVERED: đã bàn giao vận chuyển nên KHÔNG cho hủy (tránh hoàn
// kho món chưa quay về). Trả hàng (RETURNED) là luồng riêng — hoãn sang post-MVP.
const SUB_ORDER_STATE_MACHINE: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPING, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPING]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [],
};

/**
 * Suy ra status Master từ danh sách status các sub-order theo quy tắc
 * "đơn con kém tiến độ nhất":
 *   - Bỏ hết sub-order CANCELLED → tập active.
 *   - Active rỗng (tất cả đã hủy) → Master CANCELLED.
 *   - Ngược lại → Master = min tiến độ trong tập active
 *     (tự cho ra DELIVERED khi mọi đơn con đều đã giao).
 */
function deriveMasterStatus(subOrderStatuses: OrderStatus[]): OrderStatus {
  const active = subOrderStatuses.filter((s) => s !== OrderStatus.CANCELLED);
  if (active.length === 0) {
    return OrderStatus.CANCELLED;
  }
  let minRank = Number.POSITIVE_INFINITY;
  for (const status of active) {
    const rank = STATUS_PROGRESSION.indexOf(status);
    if (rank !== -1 && rank < minRank) {
      minRank = rank;
    }
  }
  if (minRank === Number.POSITIVE_INFINITY) {
    return active[0];
  }
  return STATUS_PROGRESSION[minRank];
}

// Kiểm tra lỗi unique violation của PostgreSQL (SQLSTATE 23505)
function isPgUniqueViolation(error: any, constraintName?: string): boolean {
  if (!error) return false;
  const code = error.code || error.driverError?.code;
  if (code !== '23505') return false;
  if (!constraintName) return true;
  const constraint = error.constraint || error.driverError?.constraint || '';
  const detail = error.detail || error.driverError?.detail || '';
  return (
    constraint === constraintName ||
    detail.includes(constraintName) ||
    detail.includes('idempotency_key')
  );
}

// Cấu trúc kế hoạch sub-order trong RAM trước khi persist xuống DB
interface SubOrderPlan {
  shop: Shop;
  items: CartItem[];
  shopSubtotal: number;
  shopDiscount: number;
  shopCoupon: Coupon | null;
  shippingFee: number;
  shopTotal: number;
  savedSubOrder?: SubOrder;
}

export { CheckoutResponseDto };

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(Idempotency)
    private readonly idempotencyRepository: Repository<Idempotency>,
    private readonly cartsService: CartsService,
    private readonly productStockService: ProductStockService,
    private readonly promotionsService: PromotionsService,
    private readonly usersService: UsersService,
    private readonly paymentsService: PaymentsService,
    @Inject('IShippingCalculator')
    private readonly shippingCalculator: IShippingCalculator,
  ) {}

  // ==========================================
  // CROSS-MODULE HELPERS Dùng bởi EngagementsModule (reviews)
  // ==========================================

  /** Lấy 1 order_item kèm quan hệ cần để validate review (null nếu không có). */
  async findOrderItemForReview(orderItemId: string): Promise<OrderItem | null> {
    return this.dataSource.getRepository(OrderItem).findOne({
      where: { id: orderItemId },
      relations: {
        sub_order: { order: { customer: true } },
        product: { shop: true },
      },
    });
  }

  /** order_item này có thuộc đơn DELIVERED của user không (không xét đã review chưa). */
  async isDeliveredOrderItemOfUser(
    userId: string,
    orderItemId: string,
  ): Promise<boolean> {
    const count = await this.dataSource
      .getRepository(OrderItem)
      .createQueryBuilder('oi')
      .innerJoin('oi.sub_order', 'so')
      .innerJoin('so.order', 'o')
      .where('oi.id = :orderItemId', { orderItemId })
      .andWhere('o.customer_id = :userId', { userId })
      .andWhere('so.status = :delivered', { delivered: OrderStatus.DELIVERED })
      .getCount();
    return count > 0;
  }

  /**
   * Danh sách order_item DELIVERED của user, LOẠI TRỪ các id đã review (caller truyền vào).
   * Trả raw row (kèm order_number + delivered_at) + meta phân trang.
   */
  async getReviewableOrderItems(
    userId: string,
    excludeOrderItemIds: string[],
    query: PaginationQueryDto,
  ) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const baseQb = this.dataSource
      .getRepository(OrderItem)
      .createQueryBuilder('oi')
      .innerJoin('oi.sub_order', 'so')
      .innerJoin('so.order', 'o')
      .where('o.customer_id = :userId', { userId })
      .andWhere('so.status = :delivered', { delivered: OrderStatus.DELIVERED });

    if (excludeOrderItemIds.length > 0) {
      baseQb.andWhere('oi.id NOT IN (:...excludeIds)', {
        excludeIds: excludeOrderItemIds,
      });
    }

    const totalItems = await baseQb.getCount();

    const items = await baseQb
      .clone()
      .select([
        'oi.id AS order_item_id',
        'oi.product_id AS product_id',
        'oi.product_name AS product_name',
        'oi.variant_name AS variant_name',
        'oi.product_thumbnail AS product_thumbnail',
        'oi.variant_attributes AS variant_attributes',
        'oi.quantity AS quantity',
        'o.order_number AS order_number',
        'so.updated_at AS delivered_at',
      ])
      .orderBy('so.updated_at', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const totalPages = Math.ceil(totalItems / limit);
    return { items, meta: { page, limit, totalItems, totalPages } };
  }

  // ==========================================
  // PUBLIC ENTRY
  // ==========================================

  /**
   * Đặt hàng theo cơ chế 2 pha Idempotency:
   *   Phase 1 — Claim: INSERT Idempotency PENDING ở transaction RIÊNG để
   *             commit sớm cho request đồng thời thấy được (Read Committed).
   *             Va unique-violation: PENDING → 409, COMPLETED đúng user → replay
   *             cached response, COMPLETED sai user → 403.
   *   Phase 2 — Business: chạy transaction lớn (snapshot address, recalc, lock,
   *             trừ kho, validate/consume coupons, tạo Order/SubOrder/Items,
   *             tạo Payment, clear cart). Lỗi → xóa PENDING key để cho retry.
   *   Phase 3 — Cache: cập nhật Idempotency thành COMPLETED + response_body
   *             (best-effort, ngoài tx); nếu fail cron sẽ reclaim sau 5 phút và
   *             retry sẽ va unique trên order.idempotency_key → crash recovery.
   */
  async checkout(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<CheckoutResponseDto> {
    // PHASE 1: claim hoặc replay
    const claimResult = await this.claimIdempotencyKey(userId, idempotencyKey);
    if (claimResult.replay) {
      return claimResult.replay;
    }

    // PHASE 2: business transaction
    let response: CheckoutResponseDto;
    try {
      response = await this.runCheckoutTransaction(userId, dto, idempotencyKey);
    } catch (error) {
      // Lỗi nghiệp vụ → cho phép client retry bằng chính key
      await this.deletePendingKeyForRetry(idempotencyKey);
      throw this.normalizeError(error);
    }

    // PHASE 3: mark COMPLETED + cache (best-effort)
    await this.markKeyCompleted(idempotencyKey, 201, response);
    return response;
  }

  // ==========================================
  // CUSTOMER ORDERS — QUERY
  // ==========================================

  /**
   * Danh sách đơn hàng Master của Customer (phân trang + lọc status Master).
   * KHÔNG load quan hệ `customer` để không lộ password hash. IDOR chặn bằng
   * điều kiện customer_id = userId. Join sub_orders + shop để FE hiển thị tóm tắt.
   */
  async getCustomerOrders(
    userId: string,
    query: CustomerOrderQueryDto,
  ): Promise<PaginatedResponseDto<Order>> {
    const qb = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.sub_orders', 'subOrder')
      .leftJoinAndSelect('subOrder.shop', 'shop')
      .leftJoinAndSelect('subOrder.items', 'item')
      .where('order.customer_id = :userId', { userId })
      .orderBy('order.created_at', 'DESC');

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    return paginate(qb, query);
  }

  /**
   * Chi tiết 1 đơn Master của Customer: sub-orders + items (snapshot) + payment.
   * IDOR chặn bằng where { id, customer: { id: userId } } — không khớp → 404.
   * Không load quan hệ `customer` (tránh lộ password hash).
   */
  async getCustomerOrderDetail(
    userId: string,
    orderId: string,
  ): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId, customer: { id: userId } },
      relations: {
        sub_orders: {
          shop: true,
          shop_coupon: true,
          items: true,
        },
        global_coupon: true,
        payment: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    return order;
  }

  // ==========================================
  // CUSTOMER ORDERS — CANCEL SUB-ORDER
  // ==========================================

  /**
   * Khách hủy 1 sub-order độc lập. Toàn bộ chạy trong 1 transaction:
   *   - Khoá row sub-order (chống double-cancel) → kiểm tra IDOR + chỉ PENDING.
   *   - Hoàn kho + hoàn lượt shop_coupon qua restockAndRefundSubOrder.
   *   - Recompute Order.total_amount + Order.status + Payment.amount.
   *   - Ghi outbox 'order.cancelled' trong cùng transaction.
   */
  async cancelSubOrder(
    userId: string,
    subOrderId: string,
  ): Promise<{
    orderId: string;
    subOrderId: string;
    orderStatus: OrderStatus;
    orderTotalAmount: number;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      const lockedRow = await manager.findOne(SubOrder, {
        where: { id: subOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRow) {
        throw new NotFoundException('Không tìm thấy đơn hàng con');
      }

      const subOrder = await manager.findOne(SubOrder, {
        where: { id: subOrderId },
        relations: {
          order: { customer: true, global_coupon: true },
          shop: true,
          shop_coupon: true,
          items: { variant: true, product: true },
        },
      });
      if (!subOrder || !subOrder.order) {
        throw new NotFoundException('Không tìm thấy đơn hàng con');
      }

      if (subOrder.order.customer?.id !== userId) {
        throw new NotFoundException('Không tìm thấy đơn hàng con');
      }
      if (subOrder.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'Đơn hàng đang được shop xử lý, không thể tự hủy',
        );
      }

      await this.restockAndRefundSubOrder(subOrder, manager);

      subOrder.status = OrderStatus.CANCELLED;
      await manager.save(SubOrder, subOrder);

      const order = subOrder.order;
      const { status, total } = await this.recomputeMasterAfterSubOrderChange(
        order.id,
        manager,
      );

      const outboxPayload: OrderCancelledPayload = {
        orderId: order.id,
        orderNumber: order.order_number,
        subOrderId: subOrder.id,
        userId,
        shopId: subOrder.shop?.id ?? '',
      };
      const outboxEvent = manager.create(OutboxEvent, {
        event_type: OUTBOX_EVENT_TYPES.ORDER_CANCELLED,
        payload: outboxPayload,
        status: OutboxEventStatus.PENDING,
      });
      await manager.save(OutboxEvent, outboxEvent);

      await queryRunner.commitTransaction();
      return {
        orderId: order.id,
        subOrderId: subOrder.id,
        orderStatus: status,
        orderTotalAmount: total,
      };
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

  /**
   * Hoàn kho + hoàn lượt shop coupon cho 1 sub-order khi bị hủy. Dùng chung cho
   * customer-cancel & seller-cancel. subOrder phải load relations
   * `items.variant`, `items.product`, `shop_coupon`.
   */
  private async restockAndRefundSubOrder(
    subOrder: SubOrder,
    manager: EntityManager,
  ): Promise<void> {
    const restockTargets = subOrder.items
      .filter((it) => it.product !== null && it.product !== undefined)
      .map((it) => ({
        product_id: it.product.id,
        variant_id: it.variant?.id ?? null,
        quantity: it.quantity,
      }));
    if (restockTargets.length > 0) {
      await this.productStockService.lockAndRestock(restockTargets, manager);
    }
    if (subOrder.shop_coupon) {
      const shopCouponId = subOrder.shop_coupon.id;
      await this.promotionsService.releaseCoupon(shopCouponId, manager);
      const userId = subOrder.order?.customer?.id;
      if (userId) {
        await this.promotionsService.markWalletUnused(
          userId,
          shopCouponId,
          manager,
        );
      }
    }
  }

  /**
   * Tính lại total + status Master sau khi 1 sub-order đổi trạng thái.
   * SINGLE WRITER duy nhất của Order.total_amount/status — KHÓA Master ngay bên
   * trong (pessimistic_write) để tuần tự hóa khi nhiều seller đổi 2 sub-order
   * cùng Master song song (chống lost-update). Thứ tự khóa toàn hệ: SubOrder → Order.
   * Re-evaluate GLOBAL coupon trên subtotal còn hiệu lực: hụt điều kiện (hoặc
   * không còn đơn con nào) → gỡ global + hoàn lượt. Đồng bộ Payment.
   */
  private async recomputeMasterAfterSubOrderChange(
    orderId: string,
    manager: EntityManager,
  ): Promise<{ status: OrderStatus; total: number }> {
    // Lock bare row trước (KHÔNG join global_coupon): Postgres cấm FOR UPDATE trên
    // phía nullable của outer join (LEFT JOIN coupon) → lỗi 0A000. Load global_coupon
    // ở câu sau (row đã khóa trong transaction nên đọc lại vẫn nhất quán).
    const lockedOrder = await manager.findOne(Order, {
      where: { id: orderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lockedOrder) {
      throw new NotFoundException('Không tìm thấy đơn hàng Master');
    }
    const order = await manager.findOne(Order, {
      where: { id: orderId },
      relations: { global_coupon: true, customer: true },
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng Master');
    }

    const siblings = await manager.find(SubOrder, {
      where: { order: { id: order.id } },
      relations: { shop_coupon: true },
    });

    const activeSubs = siblings.filter(
      (s) => s.status !== OrderStatus.CANCELLED,
    );
    let remainingShopSubtotals = 0;
    let sumActiveShopTotals = 0;
    for (const s of activeSubs) {
      const subTotal = Number(s.sub_total ?? 0);
      const shippingFee = Number(s.shipping_fee ?? 0);
      const shopDiscount = s.shop_coupon
        ? this.computeCouponDiscount(s.shop_coupon, subTotal)
        : 0;
      remainingShopSubtotals = round2(remainingShopSubtotals + subTotal);
      sumActiveShopTotals = round2(
        sumActiveShopTotals + (subTotal - shopDiscount + shippingFee),
      );
    }

    let globalDiscount = 0;
    if (order.global_coupon) {
      const minOrderRaw = order.global_coupon.min_order_value;
      const hasMinOrder = minOrderRaw !== null && minOrderRaw !== undefined;
      const belowMin =
        hasMinOrder && remainingShopSubtotals < Number(minOrderRaw);
      if (belowMin || activeSubs.length === 0) {
        const globalCouponId = order.global_coupon.id;
        await this.promotionsService.releaseCoupon(globalCouponId, manager);
        const userId = order.customer?.id;
        if (userId) {
          await this.promotionsService.markWalletUnused(
            userId,
            globalCouponId,
            manager,
          );
        }
        order.global_coupon = null as unknown as Coupon;
      } else {
        globalDiscount = this.computeCouponDiscount(
          order.global_coupon,
          remainingShopSubtotals,
        );
      }
    }

    const newTotal = round2(Math.max(0, sumActiveShopTotals - globalDiscount));
    const newStatus = deriveMasterStatus(siblings.map((s) => s.status));
    order.total_amount = newTotal;
    order.status = newStatus;
    order.global_discount_amount = order.global_coupon ? globalDiscount : null;
    order.global_coupon_code = order.global_coupon
      ? order.global_coupon.code
      : null;
    await manager.save(Order, order);

    await this.paymentsService.updateAmountForOrder({
      orderId: order.id,
      amount: newTotal,
      manager,
    });

    return { status: newStatus, total: newTotal };
  }

  // ==========================================
  // PHASE 1: IDEMPOTENCY CLAIM
  // ==========================================

  private async claimIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<{ replay?: CheckoutResponseDto }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newRecord = queryRunner.manager.create(Idempotency, {
        key: idempotencyKey,
        user_id: userId,
        status: IdempotencyStatus.PENDING,
      });
      await queryRunner.manager.insert(Idempotency, newRecord);
      await queryRunner.commitTransaction();
      return {};
    } catch (insertError) {
      await queryRunner.rollbackTransaction();

      const isCollision = isPgUniqueViolation(insertError);
      if (!isCollision) {
        const claimErrorMsg = '[OrdersService.claimIdempotencyKey] Error:';
        this.logger.error(claimErrorMsg, insertError);
        const serverErrorMsg = 'Không thể khởi tạo Idempotency-Key';
        throw new InternalServerErrorException(serverErrorMsg);
      }

      // Va đụng key — truy ra bản ghi đang tồn tại
      const findCriteria = { where: { key: idempotencyKey } };
      const existing = await this.idempotencyRepository.findOne(findCriteria);

      // Lỗi 409, isCollision = true
      const isExistingMissing = !existing;
      if (isExistingMissing) {
        const transientMsg =
          'Idempotency-Key đang trong trạng thái chuyển tiếp, vui lòng gửi lại yêu cầu';
        throw new ConflictException(transientMsg);
      }

      // Bảo mật: replay chỉ khi key thuộc cùng user
      const isWrongOwner = existing.user_id !== userId;
      if (isWrongOwner) {
        const forbiddenMsg = 'Idempotency-Key không thuộc về tài khoản của bạn';
        throw new ForbiddenException(forbiddenMsg);
      }

      const isPending = existing.status === IdempotencyStatus.PENDING;
      if (isPending) {
        const pendingMsg =
          'Một yêu cầu cùng Idempotency-Key đang được xử lý. Vui lòng thử lại sau ít phút';
        throw new ConflictException(pendingMsg);
      }

      // COMPLETED → replay nguyên vẹn body đã cache
      const cachedBody = existing.response_body;
      const hasCachedBody = !!cachedBody;
      if (!hasCachedBody) {
        const noCacheMsg =
          'Idempotency-Key đã hoàn tất nhưng không tìm thấy response cache. Vui lòng dùng key mới';
        throw new InternalServerErrorException(noCacheMsg);
      }
      return { replay: cachedBody };
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // PHASE 2: MAIN CHECKOUT TRANSACTION
  // ==========================================

  private async runCheckoutTransaction(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<CheckoutResponseDto> {
    // Đọc & check ownership địa chỉ giao hàng (ngoài transaction — read thuần)
    const address = await this.usersService.findOwnedAddressOrFail(
      userId,
      dto.address_id,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Đọc giỏ hàng + check khả dụng tĩnh
      const { validItems, unavailableItems } =
        await this.cartsService.getActiveCartItemsForCheckout(
          userId,
          queryRunner.manager,
        );

      const hasUnavailable = unavailableItems.length > 0;
      if (hasUnavailable) {
        throw new BadRequestException({
          message: 'Một số sản phẩm trong giỏ hàng không còn khả dụng',
          unavailable: unavailableItems,
        });
      }
      const isEmptyCart = validItems.length === 0;
      if (isEmptyCart) {
        const emptyMsg = 'Giỏ hàng trống, không thể đặt hàng';
        throw new BadRequestException(emptyMsg);
      }

      // Cart đã chặn nhưng payload checkout có thể bị bypass từ phía client — không tin frontend.
      // getActiveCartItemsForCheckout không load product.shop.seller để tránh JOIN thừa,
      // nên dùng QueryBuilder check thẳng cột FK seller_id trên bảng shop thay vì truy cập relation.
      const shopIdList = [
        ...new Set(validItems.map((item) => item.product.shop.id)),
      ];
      const shopIdListCondition = 'shop.id IN (:...shopIdList)';
      const sellerOwnershipCondition = 'shop.seller_id = :userId';
      const ownedShopCount = await queryRunner.manager
        .createQueryBuilder(Shop, 'shop')
        .where(shopIdListCondition, { shopIdList })
        .andWhere(sellerOwnershipCondition, { userId })
        .getCount();
      const isSellerBuyingOwnShop = ownedShopCount > 0;
      if (isSellerBuyingOwnShop) {
        const selfPurchaseMsg = 'Bạn không thể mua sản phẩm của shop mình';
        throw new BadRequestException(selfPurchaseMsg);
      }

      // 2. Khoá + trừ kho atomically (Product ASC → Variant ASC)
      const lockTargets = validItems.map((item) => ({
        product_id: item.product.id,
        variant_id: item.variant?.id ?? null,
        quantity: item.quantity,
      }));
      await this.productStockService.lockAndDeductStockForCheckout(
        lockTargets,
        queryRunner.manager,
      );

      // 3. Nhóm theo shop & tính subtotal từng shop (recalc server-side)
      const shopGroupsMap = this.groupItemsByShop(validItems);

      // 4. Bản đồ shop_coupons từ DTO để tra cứu nhanh khi duyệt từng shop
      const shopCouponCodeByShopId = new Map<string, string>();
      const dtoShopCoupons = dto.shop_coupons ?? [];
      for (const sc of dtoShopCoupons) {
        shopCouponCodeByShopId.set(sc.shop_id, sc.coupon_code);
      }

      // 5. Lên kế hoạch từng sub-order: subtotal → coupon shop → shipping → total
      const subOrderPlans: SubOrderPlan[] = [];
      let totalShopSubtotals = 0;

      for (const group of shopGroupsMap.values()) {
        const shopSubtotal = this.computeShopSubtotal(group.items);

        // Coupon riêng của shop (nếu có trong DTO)
        const shopCouponCode = shopCouponCodeByShopId.get(group.shop.id);
        const lockedShopCoupon =
          await this.promotionsService.lockAndValidateCoupon({
            code: shopCouponCode,
            expectedType: CouponType.SHOP,
            shopId: group.shop.id,
            subtotal: shopSubtotal,
            manager: queryRunner.manager,
          });
        const shopDiscount = lockedShopCoupon
          ? this.computeCouponDiscount(lockedShopCoupon, shopSubtotal)
          : 0;

        // Phí ship động qua HaversineShippingCalculator
        const shippingFee = this.shippingCalculator.calculateShippingFee({
          shop: {
            lat: group.shop.lat,
            lng: group.shop.lng,
            is_coordinates_verified: group.shop.is_coordinates_verified,
          },
          destination: { lat: address.lat, lng: address.lng },
          subtotal: shopSubtotal,
        });

        const shopTotal = round2(shopSubtotal - shopDiscount + shippingFee);

        subOrderPlans.push({
          shop: group.shop,
          items: group.items,
          shopSubtotal,
          shopDiscount,
          shopCoupon: lockedShopCoupon,
          shippingFee,
          shopTotal,
        });
        totalShopSubtotals += shopSubtotal;
      }
      totalShopSubtotals = round2(totalShopSubtotals);

      // 6. Coupon GLOBAL (nếu có) áp lên tổng subtotal các shop (chưa gồm phí ship)
      const lockedGlobalCoupon =
        await this.promotionsService.lockAndValidateCoupon({
          code: dto.global_coupon_code,
          expectedType: CouponType.GLOBAL,
          subtotal: totalShopSubtotals,
          manager: queryRunner.manager,
        });
      const globalDiscount = lockedGlobalCoupon
        ? this.computeCouponDiscount(lockedGlobalCoupon, totalShopSubtotals)
        : 0;

      // 7. Tổng tiền cuối cùng
      const sumShopTotals = subOrderPlans.reduce(
        (sum, plan) => sum + plan.shopTotal,
        0,
      );
      const grandTotal = round2(Math.max(0, sumShopTotals - globalDiscount));

      // 8. Snapshot địa chỉ + tạo Order (có retry order_number, bắt crash-recovery)
      const shippingAddressSnapshot = this.snapshotAddress(address);
      let savedOrder: Order;
      try {
        savedOrder = await this.createOrderWithRetry({
          userId,
          idempotencyKey,
          totalAmount: grandTotal,
          globalCoupon: lockedGlobalCoupon,
          globalDiscountAmount: globalDiscount,
          shippingAddress: shippingAddressSnapshot,
          manager: queryRunner.manager,
        });
      } catch (orderInsertError) {
        // Crash-recovery: đơn cũ đã tồn tại với cùng idempotency_key
        const isOrderIdempotencyClash = isPgUniqueViolation(
          orderInsertError,
          UQ_ORDER_IDEMPOTENCY_KEY,
        );
        if (isOrderIdempotencyClash) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
          return this.recoverResponseFromExistingOrder(idempotencyKey);
        }
        throw orderInsertError;
      }

      // 9. Tạo SubOrder + OrderItem cho từng shop
      for (const plan of subOrderPlans) {
        // Dùng conditional spread để bỏ qua quan hệ null (TypeORM DeepPartial
        // không nhận null cho relation, chỉ nhận undefined hoặc bỏ key đi).
        const subOrderPayload: Partial<SubOrder> = {
          order: { id: savedOrder.id } as Order,
          shop: { id: plan.shop.id } as Shop,
          sub_total: plan.shopSubtotal,
          shipping_fee: plan.shippingFee,
          shop_discount_amount: plan.shopDiscount,
          shop_coupon_code: plan.shopCoupon ? plan.shopCoupon.code : null,
          total_amount: plan.shopTotal,
          status: OrderStatus.PENDING,
        };
        if (plan.shopCoupon) {
          subOrderPayload.shop_coupon = { id: plan.shopCoupon.id } as Coupon;
        }
        const subOrderEntity = queryRunner.manager.create(
          SubOrder,
          subOrderPayload,
        );
        const savedSubOrder = await queryRunner.manager.save(
          SubOrder,
          subOrderEntity,
        );
        plan.savedSubOrder = savedSubOrder;

        for (const cartItem of plan.items) {
          const productPrice = Number(cartItem.product.price);
          const variantAddPrice = Number(
            cartItem.variant?.additional_price ?? 0,
          );
          const priceAtPurchase = round2(productPrice + variantAddPrice);

          const orderItemPayload: Partial<OrderItem> = {
            sub_order: { id: savedSubOrder.id } as SubOrder,
            product: { id: cartItem.product.id } as Product,
            quantity: cartItem.quantity,
            price_at_purchase: priceAtPurchase,
            product_name: cartItem.product.name,
            variant_name: cartItem.variant?.name ?? undefined,
            product_thumbnail: cartItem.product.thumbnail_url ?? undefined,
            variant_attributes: cartItem.variant?.attributes ?? null,
          };
          if (cartItem.variant) {
            orderItemPayload.variant = {
              id: cartItem.variant.id,
            } as ProductVariant;
          }
          const orderItemEntity = queryRunner.manager.create(
            OrderItem,
            orderItemPayload,
          );
          await queryRunner.manager.save(OrderItem, orderItemEntity);
        }
      }

      // 10. Tạo Payment qua PaymentsService (Rule II.11 — không sờ entity Payment trực tiếp)
      await this.paymentsService.createPendingForOrder({
        orderId: savedOrder.id,
        amount: grandTotal,
        method: dto.payment_method,
        manager: queryRunner.manager,
      });

      // 11. Tiêu thụ coupon (tăng used_count) trong cùng transaction
      if (lockedGlobalCoupon) {
        const manager = queryRunner.manager;
        await this.promotionsService.consumeCoupon(lockedGlobalCoupon, manager);
        const globalCouponId = lockedGlobalCoupon.id;
        await this.promotionsService.markWalletUsed(
          userId,
          globalCouponId,
          manager,
        );
      }
      for (const plan of subOrderPlans) {
        if (plan.shopCoupon) {
          const shopCoupon = plan.shopCoupon;
          const manager = queryRunner.manager;
          await this.promotionsService.consumeCoupon(shopCoupon, manager);
          const shopCouponId = shopCoupon.id;
          await this.promotionsService.markWalletUsed(
            userId,
            shopCouponId,
            manager,
          );
        }
      }

      // 12. Dọn giỏ hàng (xóa toàn bộ CartItem)
      await this.cartsService.clearActiveCart(userId, queryRunner.manager);

      // Ghi Outbox Event atomically trong cùng transaction — nguyên tử với đơn hàng.
      // Nếu transaction rollback thì event cũng không tồn tại, tránh thông báo ảo.
      // Worker quét bảng outbox_events và phát WebSocket + lưu Notification.
      const shopIdPayload = subOrderPlans.map((plan) => plan.shop.id);
      const outboxPayload: OrderCreatedPayload = {
        orderId: savedOrder.id,
        orderNumber: savedOrder.order_number,
        shopIds: shopIdPayload,
        userId,
        totalAmount: grandTotal,
      };
      const outboxEvent = queryRunner.manager.create(OutboxEvent, {
        event_type: OUTBOX_EVENT_TYPES.ORDER_CREATED,
        payload: outboxPayload,
        status: OutboxEventStatus.PENDING,
      });
      await queryRunner.manager.save(OutboxEvent, outboxEvent);

      await queryRunner.commitTransaction();

      // Build response THỐNG NHẤT giữa luồng thường và luồng recovery
      const response = this.buildCheckoutResponse({
        order: savedOrder,
        subOrderPlans,
        shippingAddressSnapshot,
        paymentMethod: dto.payment_method,
        grandTotal,
      });
      return response;
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
  // PHASE 3: COMPLETED CACHING
  // ==========================================

  private async markKeyCompleted(
    idempotencyKey: string,
    responseCode: number,
    responseBody: CheckoutResponseDto,
  ): Promise<void> {
    try {
      const updateCriteria = { key: idempotencyKey };
      const updateFields = {
        status: IdempotencyStatus.COMPLETED,
        response_code: responseCode,
        response_body: responseBody,
      };
      await this.idempotencyRepository.update(updateCriteria, updateFields);
    } catch (error) {
      const warnMsg = `[OrdersService.markKeyCompleted] Không cache được response cho key ${idempotencyKey}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.warn(warnMsg);
    }
  }

  private async deletePendingKeyForRetry(
    idempotencyKey: string,
  ): Promise<void> {
    try {
      const deleteCriteria = {
        key: idempotencyKey,
        status: IdempotencyStatus.PENDING,
      };
      await this.idempotencyRepository.delete(deleteCriteria);
    } catch (error) {
      const warnMsg = `[OrdersService.deletePendingKeyForRetry] Không xóa được key ${idempotencyKey}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.warn(warnMsg);
    }
  }

  // ==========================================
  // CRASH RECOVERY
  // ==========================================

  /**
   * Khi tạo Order va unique-violation trên cột idempotency_key, nghĩa là đơn
   * tương ứng đã được tạo ở lần chạy trước (commit thành công nhưng phase 3
   * chưa mark COMPLETED và cron đã reclaim PENDING). Tái dựng response từ
   * Order cũ, đồng thời cache lại key COMPLETED để các retry sau dùng được.
   */
  private async recoverResponseFromExistingOrder(
    idempotencyKey: string,
  ): Promise<CheckoutResponseDto> {
    const findCriteria = {
      where: { idempotency_key: idempotencyKey },
      relations: [
        'sub_orders',
        'sub_orders.shop',
        'sub_orders.items',
        'sub_orders.items.product',
        'sub_orders.items.variant',
        'payment',
      ],
    };
    const existingOrder = await this.ordersRepository.findOne(findCriteria);

    const isExistingOrderMissing = !existingOrder;
    if (isExistingOrderMissing) {
      const internalMsg =
        'Phát hiện idempotency_key xung đột nhưng không tìm thấy đơn hàng cũ tương ứng';
      throw new InternalServerErrorException(internalMsg);
    }

    const response = this.buildCheckoutResponseFromOrder(existingOrder);
    return response;
  }

  // ==========================================
  // ORDER NUMBER GENERATION (with retry)
  // ==========================================

  private async createOrderWithRetry(params: {
    userId: string;
    idempotencyKey: string;
    totalAmount: number;
    globalCoupon: Coupon | null;
    globalDiscountAmount: number;
    shippingAddress: ShippingAddressSnapshot;
    manager: EntityManager;
  }): Promise<Order> {
    const {
      userId,
      idempotencyKey,
      totalAmount,
      globalCoupon,
      globalDiscountAmount,
      shippingAddress,
      manager,
    } = params;

    let attempt = 0;
    let lastError: any = null;
    while (attempt < ORDER_NUMBER_MAX_RETRIES) {
      const orderNumber = this.generateOrderNumber();
      const orderPayload: Partial<Order> = {
        customer: { id: userId } as User,
        total_amount: totalAmount,
        shipping_address: shippingAddress,
        status: OrderStatus.PENDING,
        idempotency_key: idempotencyKey,
        order_number: orderNumber,
        global_discount_amount: globalDiscountAmount,
        global_coupon_code: globalCoupon ? globalCoupon.code : null,
      };
      if (globalCoupon) {
        orderPayload.global_coupon = { id: globalCoupon.id } as Coupon;
      }
      const orderEntity = manager.create(Order, orderPayload);
      try {
        const savedOrder = await manager.save(Order, orderEntity);
        return savedOrder;
      } catch (error) {
        // Trùng idempotency_key → bubble lên cho phía caller xử lý crash-recovery
        const isIdempotencyClash = isPgUniqueViolation(
          error,
          UQ_ORDER_IDEMPOTENCY_KEY,
        );
        if (isIdempotencyClash) {
          throw error;
        }
        // Trùng order_number (cực hiếm) → thử lại với mã mới
        const isUniqueViolation = isPgUniqueViolation(error);
        if (isUniqueViolation) {
          attempt += 1;
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    const exhaustedMsg =
      'Không sinh được mã đơn hàng duy nhất sau nhiều lần thử. Vui lòng thử lại';
    this.logger.error(
      `[OrdersService.createOrderWithRetry] Exhausted retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
    throw new InternalServerErrorException(exhaustedMsg);
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const datePart = `${year}${month}${day}`;

    // 6 ký tự chữ-số viết hoa, sinh bằng crypto.randomBytes để chống đụng độ
    const randomChars = randomBytes(4)
      .toString('base64')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 6)
      .padEnd(6, 'X');

    return `#ORD-${datePart}-${randomChars}`;
  }

  // ==========================================
  // PRICING & GROUPING HELPERS
  // ==========================================

  private groupItemsByShop(
    items: CartItem[],
  ): Map<string, { shop: Shop; items: CartItem[] }> {
    const groups = new Map<string, { shop: Shop; items: CartItem[] }>();
    for (const item of items) {
      const shop = item.product.shop;
      const shopId = shop.id;
      if (!groups.has(shopId)) {
        groups.set(shopId, { shop, items: [] });
      }
      groups.get(shopId)!.items.push(item);
    }
    return groups;
  }

  private computeShopSubtotal(items: CartItem[]): number {
    let subtotal = 0;
    for (const item of items) {
      const productPrice = Number(item.product.price);
      const variantAddPrice = Number(item.variant?.additional_price ?? 0);
      const unitPrice = productPrice + variantAddPrice;
      subtotal += unitPrice * item.quantity;
    }
    return round2(subtotal);
  }

  private computeCouponDiscount(coupon: Coupon, baseAmount: number): number {
    const discountValue = Number(coupon.discount_value ?? 0);
    const maxDiscountRaw = coupon.max_discount_value;
    const hasMaxCap = maxDiscountRaw !== null && maxDiscountRaw !== undefined;
    const maxCap = hasMaxCap
      ? Number(maxDiscountRaw)
      : Number.POSITIVE_INFINITY;

    let discount = 0;
    if (coupon.discount_type === DiscountType.PERCENTAGE) {
      discount = (baseAmount * discountValue) / 100;
    } else if (coupon.discount_type === DiscountType.FIXED_AMOUNT) {
      discount = discountValue;
    }

    const cappedDiscount = Math.min(discount, maxCap, baseAmount);
    return round2(Math.max(0, cappedDiscount));
  }

  private snapshotAddress(address: Address): ShippingAddressSnapshot {
    const latNumber = address.lat !== null ? parseFloat(address.lat) : null;
    const lngNumber = address.lng !== null ? parseFloat(address.lng) : null;
    return {
      recipient_name: address.recipient_name,
      phone: address.phone,
      address_line: address.address_line,
      lat: latNumber !== null && !Number.isNaN(latNumber) ? latNumber : null,
      lng: lngNumber !== null && !Number.isNaN(lngNumber) ? lngNumber : null,
    };
  }

  // ==========================================
  // RESPONSE BUILDERS (Single source for normal & recovery paths)
  // ==========================================

  private buildCheckoutResponse(params: {
    order: Order;
    subOrderPlans: SubOrderPlan[];
    shippingAddressSnapshot: ShippingAddressSnapshot;
    paymentMethod: PaymentMethod;
    grandTotal: number;
  }): CheckoutResponseDto {
    const subOrdersResponse: CheckoutResponseSubOrderDto[] = [];
    for (const plan of params.subOrderPlans) {
      const itemsResponse: CheckoutResponseItemDto[] = plan.items.map((ci) => {
        const productPrice = Number(ci.product.price);
        const variantAddPrice = Number(ci.variant?.additional_price ?? 0);
        const priceAtPurchase = round2(productPrice + variantAddPrice);
        return {
          product_id: ci.product.id,
          product_name: ci.product.name,
          variant_id: ci.variant?.id ?? null,
          variant_name: ci.variant?.name ?? null,
          quantity: ci.quantity,
          price_at_purchase: priceAtPurchase,
        };
      });

      subOrdersResponse.push({
        sub_order_id: plan.savedSubOrder!.id,
        shop_id: plan.shop.id,
        shop_name: plan.shop.name,
        sub_total: plan.shopSubtotal,
        shipping_fee: plan.shippingFee,
        shop_discount_amount: plan.shopDiscount,
        shop_coupon_code: plan.shopCoupon ? plan.shopCoupon.code : null,
        total_amount: plan.shopTotal,
        items: itemsResponse,
      });
    }

    return {
      order_id: params.order.id,
      order_number: params.order.order_number,
      total_amount: params.grandTotal,
      global_discount_amount: params.order.global_discount_amount
        ? round2(Number(params.order.global_discount_amount))
        : null,
      global_coupon_code: params.order.global_coupon_code,
      payment_method: params.paymentMethod,
      shipping_address: params.shippingAddressSnapshot,
      sub_orders: subOrdersResponse,
      created_at: params.order.created_at,
    };
  }

  private buildCheckoutResponseFromOrder(order: Order): CheckoutResponseDto {
    const subOrdersResponse: CheckoutResponseSubOrderDto[] = [];
    const orderSubOrders = order.sub_orders ?? [];

    for (const subOrder of orderSubOrders) {
      const itemsResponse: CheckoutResponseItemDto[] = (
        subOrder.items ?? []
      ).map((orderItem) => ({
        product_id: orderItem.product?.id ?? '',
        product_name: orderItem.product_name,
        variant_id: orderItem.variant?.id ?? null,
        variant_name: orderItem.variant_name,
        quantity: orderItem.quantity,
        price_at_purchase: round2(Number(orderItem.price_at_purchase)),
      }));

      const subTotal = round2(Number(subOrder.sub_total ?? 0));
      const shippingFee = round2(Number(subOrder.shipping_fee ?? 0));
      const rawShopDiscount = subOrder.shop_discount_amount ?? 0;
      const shopDiscountNumber = Number(rawShopDiscount);
      const discountAmount = round2(shopDiscountNumber);
      const totalAmount = round2(
        Number(
          subOrder.total_amount ?? subTotal - discountAmount + shippingFee,
        ),
      );

      subOrdersResponse.push({
        sub_order_id: subOrder.id,
        shop_id: subOrder.shop?.id ?? '',
        shop_name: subOrder.shop?.name ?? '',
        sub_total: subTotal,
        shipping_fee: shippingFee,
        shop_discount_amount: discountAmount,
        shop_coupon_code: subOrder.shop_coupon_code,
        total_amount: totalAmount,
        items: itemsResponse,
      });
    }

    const shippingAddress = order.shipping_address;
    return {
      order_id: order.id,
      order_number: order.order_number,
      total_amount: round2(Number(order.total_amount ?? 0)),
      global_discount_amount: order.global_discount_amount
        ? round2(Number(order.global_discount_amount))
        : null,
      global_coupon_code: order.global_coupon_code,
      payment_method: order.payment?.method ?? PaymentMethod.COD,
      shipping_address: {
        recipient_name: shippingAddress?.recipient_name ?? '',
        phone: shippingAddress?.phone ?? '',
        address_line: shippingAddress?.address_line ?? '',
        lat: shippingAddress?.lat ?? null,
        lng: shippingAddress?.lng ?? null,
      },
      sub_orders: subOrdersResponse,
      created_at: order.created_at,
    };
  }

  // ==========================================
  // SELLER ORDERS
  // ==========================================

  /** Danh sách sub-order thuộc shop của seller (phân trang + lọc status). */
  async getSellerSubOrders(
    sellerId: string,
    query: SellerOrderQueryDto,
  ): Promise<PaginatedResponseDto<SubOrder>> {
    const qb = this.dataSource
      .getRepository(SubOrder)
      .createQueryBuilder('subOrder')
      .innerJoinAndSelect('subOrder.shop', 'shop')
      .leftJoinAndSelect('subOrder.order', 'order')
      .leftJoinAndSelect('subOrder.items', 'item')
      .where('shop.seller_id = :sellerId', { sellerId })
      .orderBy('subOrder.created_at', 'DESC');

    if (query.status) {
      qb.andWhere('subOrder.status = :status', { status: query.status });
    }
    return paginate(qb, query);
  }

  /** Chi tiết 1 sub-order của seller (check ownership shop). */
  async getSellerSubOrderDetail(
    sellerId: string,
    subOrderId: string,
  ): Promise<SubOrder> {
    const subOrder = await this.dataSource.getRepository(SubOrder).findOne({
      where: { id: subOrderId, shop: { seller: { id: sellerId } } },
      relations: {
        shop: true,
        order: true,
        items: { variant: true, product: true },
      },
    });
    if (!subOrder) {
      throw new NotFoundException('Không tìm thấy đơn hàng con');
    }
    return subOrder;
  }

  /** Lấy thống kê tổng quan của Shop (doanh thu, đơn hàng, trạng thái, bán chạy). */
  async getShopStats(shopId: string): Promise<{
    total_revenue: number;
    total_orders: number;
    status_counts: Record<OrderStatus, number>;
    best_sellers: Array<{
      product_id: string;
      product_name: string;
      product_thumbnail: string | null;
      total_sold: number;
    }>;
  }> {
    const subOrderRepository = this.dataSource.getRepository(SubOrder);
    const orderItemRepository = this.dataSource.getRepository(OrderItem);

    const queryShopIdStr = 'subOrder.shop_id = :shopId';
    const shopIdParam = { shopId };

    const queryStatusStr = 'subOrder.status = :status';
    const deliveredStatusParam = { status: OrderStatus.DELIVERED };

    // 1. Tính tổng doanh thu (chỉ tính sub-order có status = DELIVERED)
    const revenueResult = await subOrderRepository
      .createQueryBuilder('subOrder')
      .select('SUM(subOrder.total_amount)', 'sum')
      .where(queryShopIdStr, shopIdParam)
      .andWhere(queryStatusStr, deliveredStatusParam)
      .getRawOne();
    const total_revenue = Number(revenueResult?.sum) || 0;

    // 2. Thống kê số lượng đơn hàng theo từng trạng thái
    const statusCountsRaw = await subOrderRepository
      .createQueryBuilder('subOrder')
      .select('subOrder.status', 'status')
      .addSelect('COUNT(subOrder.id)', 'count')
      .where(queryShopIdStr, shopIdParam)
      .groupBy('subOrder.status')
      .getRawMany();

    const status_counts: Record<OrderStatus, number> = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.PROCESSING]: 0,
      [OrderStatus.SHIPPING]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.CANCELLED]: 0,
      [OrderStatus.RETURNED]: 0,
    };

    let total_orders = 0;
    for (const item of statusCountsRaw) {
      const count = Number(item.count) || 0;
      if (item.status in status_counts) {
        status_counts[item.status as OrderStatus] = count;
      }
      total_orders += count;
    }

    // 3. Lấy top 5 sản phẩm bán chạy nhất (cộng dồn quantity từ các OrderItem thuộc sub-order DELIVERED)
    const bestSellersRaw = await orderItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.sub_order', 'subOrder')
      .select([
        'item.product_id AS product_id',
        'item.product_name AS product_name',
        'item.product_thumbnail AS product_thumbnail',
      ])
      .addSelect('SUM(item.quantity)', 'total_sold')
      .where(queryShopIdStr, shopIdParam)
      .andWhere(queryStatusStr, deliveredStatusParam)
      .groupBy('item.product_id')
      .addGroupBy('item.product_name')
      .addGroupBy('item.product_thumbnail')
      .orderBy('total_sold', 'DESC')
      .limit(5)
      .getRawMany();

    const best_sellers = bestSellersRaw.map((item) => {
      const productId = item.product_id;
      const productName = item.product_name;
      const productThumbnail = item.product_thumbnail || null;
      const totalSold = Number(item.total_sold) || 0;
      return {
        product_id: productId,
        product_name: productName,
        product_thumbnail: productThumbnail,
        total_sold: totalSold,
      };
    });

    return {
      total_revenue,
      total_orders,
      status_counts,
      best_sellers,
    };
  }

  /**
   * Seller đổi trạng thái 1 sub-order theo State Machine. Nếu → CANCELLED thì
   * hoàn kho + hoàn coupon + recompute Master. Ghi outbox 'order.status_updated'.
   */
  async updateSubOrderStatus(
    sellerId: string,
    subOrderId: string,
    newStatus: OrderStatus,
  ): Promise<{
    subOrderId: string;
    subOrderStatus: OrderStatus;
    orderStatus: OrderStatus;
    orderTotalAmount: number;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      const lockedRow = await manager.findOne(SubOrder, {
        where: { id: subOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRow) {
        throw new NotFoundException('Không tìm thấy đơn hàng con');
      }

      const subOrder = await manager.findOne(SubOrder, {
        where: { id: subOrderId },
        relations: {
          shop: { seller: true },
          order: { customer: true, global_coupon: true },
          shop_coupon: true,
          items: { variant: true, product: true },
        },
      });
      if (!subOrder || !subOrder.order) {
        throw new NotFoundException('Không tìm thấy đơn hàng con');
      }

      if (subOrder.shop?.seller?.id !== sellerId) {
        throw new NotFoundException('Không tìm thấy đơn hàng con');
      }

      // Idempotent no-op: PATCH bị client retry do timeout mạng → trả snapshot
      // Master hiện tại, KHÔNG restock/recompute (tránh hoàn kho & used_count 2 lần).
      // Đặt TRƯỚC mọi mutation. CANCELLED→CANCELLED cũng rơi vào đây nên an toàn.
      if (subOrder.status === newStatus) {
        const current = await manager.findOne(Order, {
          where: { id: subOrder.order.id },
        });
        await queryRunner.commitTransaction();
        return {
          subOrderId: subOrder.id,
          subOrderStatus: subOrder.status,
          orderStatus: current?.status ?? subOrder.order.status,
          orderTotalAmount: Number(current?.total_amount ?? 0),
        };
      }

      const allowed = SUB_ORDER_STATE_MACHINE[subOrder.status] ?? [];
      if (!allowed.includes(newStatus)) {
        throw new BadRequestException(
          `Không thể chuyển trạng thái từ "${subOrder.status}" sang "${newStatus}"`,
        );
      }

      const isCancelling = newStatus === OrderStatus.CANCELLED;
      if (isCancelling) {
        await this.restockAndRefundSubOrder(subOrder, manager);
      }

      subOrder.status = newStatus;
      await manager.save(SubOrder, subOrder);

      const order = subOrder.order;
      const { status, total } = await this.recomputeMasterAfterSubOrderChange(
        order.id,
        manager,
      );

      const outboxPayload: OrderStatusUpdatedPayload = {
        orderId: order.id,
        orderNumber: order.order_number,
        subOrderId: subOrder.id,
        userId: order.customer.id,
        shopId: subOrder.shop.id,
        newStatus,
      };
      const outboxEvent = manager.create(OutboxEvent, {
        event_type: OUTBOX_EVENT_TYPES.ORDER_STATUS_UPDATED,
        payload: outboxPayload,
        status: OutboxEventStatus.PENDING,
      });
      await manager.save(OutboxEvent, outboxEvent);

      await queryRunner.commitTransaction();
      return {
        subOrderId: subOrder.id,
        subOrderStatus: newStatus,
        orderStatus: status,
        orderTotalAmount: total,
      };
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
  // CHECKOUT PREVIEW (no-write)
  // ==========================================

  // Nhãn cảnh báo tồn kho cho 1 item (variant ưu tiên, fallback product).
  private deriveStockWarning(item: CartItem): string | null {
    const stock = item.variant
      ? item.variant.stock_quantity
      : item.product.stock_quantity;
    if (stock <= 0) {
      return 'Hết hàng';
    }
    if (stock <= LOW_STOCK_THRESHOLD) {
      return `Chỉ còn ${stock} sản phẩm`;
    }
    return null;
  }

  // Số tiền cần mua thêm để đạt freeship (thiếu ≤ 100k) — ngược lại null.
  private computeFreeshipUpsell(shopSubtotal: number): number | null {
    if (shopSubtotal >= FREE_SHIPPING_THRESHOLD) {
      return null;
    }
    const needed = round2(FREE_SHIPPING_THRESHOLD - shopSubtotal);
    return needed <= FREESHIP_UPSELL_WINDOW ? needed : null;
  }

  /**
   * Ước tính hóa đơn checkout (no-write). Bọc trong transaction CHỈ để dùng
   * lockAndValidateCoupon (cần lock) rồi LUÔN rollback — không ghi DB.
   */
  async checkoutPreview(
    userId: string,
    dto: CheckoutPreviewDto,
  ): Promise<CheckoutPreviewResponseDto> {
    const address = await this.usersService.findOwnedAddressOrFail(
      userId,
      dto.address_id,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      const { validItems, unavailableItems } =
        await this.cartsService.getActiveCartItemsForCheckout(userId, manager);
      if (unavailableItems.length > 0) {
        throw new BadRequestException({
          message: 'Một số sản phẩm trong giỏ hàng không còn khả dụng',
          unavailable: unavailableItems,
        });
      }
      if (validItems.length === 0) {
        throw new BadRequestException('Giỏ hàng trống, không thể xem trước');
      }

      const shopGroupsMap = this.groupItemsByShop(validItems);
      const shopCouponCodeByShopId = new Map<string, string>();
      for (const sc of dto.shop_coupons ?? []) {
        shopCouponCodeByShopId.set(sc.shop_id, sc.coupon_code);
      }

      const shops: PreviewShopDto[] = [];
      let totalShippingFee = 0;
      let totalDiscount = 0;
      let totalShopTotals = 0;
      let totalShopSubtotals = 0;

      for (const group of shopGroupsMap.values()) {
        const shopSubtotal = this.computeShopSubtotal(group.items);

        const shopCouponCode = shopCouponCodeByShopId.get(group.shop.id);
        const shopCoupon = await this.promotionsService.lockAndValidateCoupon({
          code: shopCouponCode,
          expectedType: CouponType.SHOP,
          shopId: group.shop.id,
          subtotal: shopSubtotal,
          manager,
        });
        const shopDiscount = shopCoupon
          ? this.computeCouponDiscount(shopCoupon, shopSubtotal)
          : 0;

        const shippingFee = this.shippingCalculator.calculateShippingFee({
          shop: {
            lat: group.shop.lat,
            lng: group.shop.lng,
            is_coordinates_verified: group.shop.is_coordinates_verified,
          },
          destination: { lat: address.lat, lng: address.lng },
          subtotal: shopSubtotal,
        });

        const items: PreviewItemDto[] = group.items.map((ci) => {
          const price = round2(
            Number(ci.product.price) +
              Number(ci.variant?.additional_price ?? 0),
          );
          return {
            productId: ci.product.id,
            variantId: ci.variant?.id ?? null,
            productName: ci.product.name,
            variantName: ci.variant?.name ?? null,
            productThumbnail: ci.product.thumbnail_url ?? null,
            price,
            quantity: ci.quantity,
            stock_warning: this.deriveStockWarning(ci),
          };
        });

        shops.push({
          shopId: group.shop.id,
          shopName: group.shop.name,
          items,
          shippingFee,
          shopSubtotal,
          freeship_upsell_needed: this.computeFreeshipUpsell(shopSubtotal),
        });

        totalShippingFee = round2(totalShippingFee + shippingFee);
        totalDiscount = round2(totalDiscount + shopDiscount);
        totalShopTotals = round2(
          totalShopTotals + (shopSubtotal - shopDiscount + shippingFee),
        );
        totalShopSubtotals = round2(totalShopSubtotals + shopSubtotal);
      }

      const globalCoupon = await this.promotionsService.lockAndValidateCoupon({
        code: dto.global_coupon_code,
        expectedType: CouponType.GLOBAL,
        subtotal: totalShopSubtotals,
        manager,
      });
      const globalDiscount = globalCoupon
        ? this.computeCouponDiscount(globalCoupon, totalShopSubtotals)
        : 0;
      totalDiscount = round2(totalDiscount + globalDiscount);

      const totalAmount = round2(Math.max(0, totalShopTotals - globalDiscount));

      // NO-WRITE: luôn rollback (giải phóng lock coupon, không ghi gì).
      await queryRunner.rollbackTransaction();

      return { shops, totalShippingFee, totalDiscount, totalAmount };
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
  // ERROR NORMALIZATION
  // ==========================================

  private normalizeError(error: any): Error {
    const knownTypes = [
      BadRequestException,
      ConflictException,
      ForbiddenException,
      NotFoundException,
      InternalServerErrorException,
    ];
    const isKnown = knownTypes.some((cls) => error instanceof cls);
    if (isKnown) {
      return error;
    }
    const classNameMethod = '[OrdersService.checkout] Unknown Error:';
    this.logger.error(classNameMethod, error);
    const fallbackMsg = 'Đã xảy ra lỗi trong quá trình đặt hàng';
    return new InternalServerErrorException(fallbackMsg);
  }

  async countAll(): Promise<number> {
    return this.ordersRepository.count();
  }

  async getDeliveredRevenue(): Promise<number> {
    const raw = await this.ordersRepository
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total_amount), 0)', 'sum')
      .where('o.status = :st', { st: OrderStatus.DELIVERED })
      .getRawOne<{ sum: string }>();

    return Number(raw?.sum ?? 0);
  }

  /**
   * Tính tổng doanh thu THÔ (gross) của Shop trên các SubOrder đã giao (DELIVERED).
   * KHÔNG trừ hoa hồng tại đây — việc bóc tách gross/commission/net được thực hiện ở
   * nơi tính số dư (PayoutsService.calculateShopBalance) để hiển thị minh bạch cho seller.
   */
  async getShopDeliveredRevenue(
    shopId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(SubOrder)
      : this.dataSource.getRepository(SubOrder);

    const alias = 'subOrder';
    const selectSql = 'SUM(subOrder.sub_total - subOrder.shop_discount_amount)';
    const selectAlias = 'revenue';
    const whereShopIdStr = 'subOrder.shop_id = :shopId';
    const whereShopIdParam = { shopId };
    const whereStatusStr = 'subOrder.status = :status';
    const whereStatusParam = { status: OrderStatus.DELIVERED };

    const result = await repo
      .createQueryBuilder(alias)
      .select(selectSql, selectAlias)
      .where(whereShopIdStr, whereShopIdParam)
      .andWhere(whereStatusStr, whereStatusParam)
      .getRawOne();

    const rawRevenue = Number(result?.revenue) || 0;

    // round2 là helper module-scope có sẵn trong chính file orders.service.ts
    return round2(rawRevenue);
  }
}
