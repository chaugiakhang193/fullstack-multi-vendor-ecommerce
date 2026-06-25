import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Payout } from './entities/payout.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { User } from '@/modules/users/entities/user.entity';
import { OrdersService } from '@/modules/orders/orders.service';
import { ShopsService } from '@/modules/shops/shops.service';
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';
import { OutboxEventStatus, PayoutStatus } from '@/common/enums';
import {
  OUTBOX_EVENT_TYPES,
  PayoutCreatedOutboxPayload,
  PayoutStatusChangedOutboxPayload,
} from '@/common/constants/outbox.constants';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { paginate } from '@/common/helpers/pagination.helper';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { AdminPayoutQueryDto } from './dto/admin-payout-query.dto';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { assertPayoutTransition } from './payouts.state-machine';
import { SYSTEM_CONSTANTS } from '@/common/constants/system.constant';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepo: Repository<Payout>,
    private readonly ordersService: OrdersService,
    private readonly shopsService: ShopsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Lấy số dư khả dụng của Seller */
  async getSellerBalance(sellerId: string): Promise<BalanceResponseDto> {
    const shop = await this.shopsService.findOneByUserId(sellerId);
    const shopId = shop.id;

    const balanceResponse = await this.calculateShopBalance(shopId);
    return balanceResponse;
  }

  /** Seller gửi yêu cầu rút tiền (Pessimistic Lock chống race condition) */
  async requestPayout(sellerId: string, dto: CreatePayoutDto): Promise<Payout> {
    const shopRef = await this.shopsService.findOneByUserId(sellerId);
    const shopId = shopRef.id;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const findOptions = {
        where: { id: shopId },
        lock: { mode: 'pessimistic_write' as const },
      };

      const shop = await queryRunner.manager.findOne(Shop, findOptions);

      if (!shop) {
        const errorMsg = 'Không tìm thấy cửa hàng của bạn.';
        throw new NotFoundException(errorMsg);
      }

      const bankInfo = shop.bank_account_info;
      if (!bankInfo) {
        const errorMsg =
          'Vui lòng cập nhật thông tin tài khoản ngân hàng trước khi rút tiền.';
        throw new BadRequestException(errorMsg);
      }

      const countOptions = {
        where: [
          { shop: { id: shopId }, status: PayoutStatus.PENDING },
          { shop: { id: shopId }, status: PayoutStatus.PROCESSING },
        ],
      };

      const pendingPayoutCount = await queryRunner.manager
        .getRepository(Payout)
        .count(countOptions);

      if (pendingPayoutCount > 0) {
        const errorMsg =
          'Bạn đang có một yêu cầu rút tiền đang được xử lý. Vui lòng chờ lệnh cũ hoàn thành.';
        throw new BadRequestException(errorMsg);
      }

      const balance = await this.calculateShopBalance(
        shopId,
        queryRunner.manager,
      );
      const availableBalance = balance.available_balance;

      const requestAmount = dto.amount;
      if (requestAmount > availableBalance) {
        const balanceText = availableBalance.toLocaleString('vi-VN');
        const errorMsg = `Số dư khả dụng không đủ. Số dư hiện tại của bạn là: ${balanceText}đ`;
        throw new BadRequestException(errorMsg);
      }

      const bankSnapshot = bankInfo;

      const createOptions = {
        shop,
        amount: requestAmount,
        commission_fee: 0,
        status: PayoutStatus.PENDING,
        bank_info_snapshot: bankSnapshot,
      };

      const payout = queryRunner.manager.create(Payout, createOptions);
      const savedPayout = await queryRunner.manager.save(Payout, payout);

      const payoutCreatedPayload: PayoutCreatedOutboxPayload = {
        payoutId: savedPayout.id,
        amount: Number(savedPayout.amount),
        shopId: shop.id,
        shopName: shop.name,
      };
      const payoutCreatedEvent = queryRunner.manager.create(OutboxEvent, {
        event_type: OUTBOX_EVENT_TYPES.PAYOUT_CREATED,
        payload: payoutCreatedPayload,
        status: OutboxEventStatus.PENDING,
      });
      await queryRunner.manager.save(OutboxEvent, payoutCreatedEvent);

      await queryRunner.commitTransaction();

      return savedPayout;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /** Seller xem lịch sử rút tiền */
  async getSellerPayoutHistory(sellerId: string, query: PaginationQueryDto) {
    const shop = await this.shopsService.findOneByUserId(sellerId);
    const shopId = shop.id;

    const alias = 'payout';
    const whereShopIdStr = 'payout.shop_id = :shopId';
    const whereShopIdParam = { shopId };
    const orderField = 'payout.created_at';
    const orderDir = 'DESC' as const;

    const qb = this.payoutRepo
      .createQueryBuilder(alias)
      .where(whereShopIdStr, whereShopIdParam)
      .orderBy(orderField, orderDir);

    const paginatedResult = paginate(qb, query);
    return paginatedResult;
  }

  /** Admin xem danh sách tất cả yêu cầu rút tiền (hỗ trợ lọc theo trạng thái) */
  async getAdminPayouts(query: AdminPayoutQueryDto) {
    const alias = 'payout';
    const shopRelation = 'payout.shop';
    const shopAlias = 'shop';
    const shopFields = ['shop.id', 'shop.name'];
    const sellerRelation = 'shop.seller';
    const sellerAlias = 'seller';
    const sellerFields = [
      'seller.id',
      'seller.username',
      'seller.email',
      'seller.full_name',
    ];
    const orderField = 'payout.created_at';
    const orderDir = 'DESC' as const;

    const qb = this.payoutRepo
      .createQueryBuilder(alias)
      .leftJoin(shopRelation, shopAlias)
      .addSelect(shopFields)
      .leftJoin(sellerRelation, sellerAlias)
      .addSelect(sellerFields)
      .orderBy(orderField, orderDir);

    if (query.status) {
      const statusFilterStr = 'payout.status = :status';
      const statusFilterParam = { status: query.status };
      qb.andWhere(statusFilterStr, statusFilterParam);
    }

    const paginatedResult = paginate(qb, query);
    return paginatedResult;
  }

  /** Admin phê duyệt yêu cầu rút tiền */
  async approvePayout(payoutId: string, adminId: string): Promise<Payout> {
    return this.dataSource.transaction(async (manager) => {
      const payout = await manager.findOne(Payout, {
        where: { id: payoutId },
        relations: ['shop', 'shop.seller'],
      });
      if (!payout) {
        throw new NotFoundException('Không tìm thấy yêu cầu rút tiền.');
      }
      assertPayoutTransition(payout.status, PayoutStatus.COMPLETED);

      payout.status = PayoutStatus.COMPLETED;
      payout.resolved_by = { id: adminId } as User;
      payout.resolved_at = new Date();
      const updated = await manager.save(Payout, payout);

      const seller = payout.shop.seller;
      const payload: PayoutStatusChangedOutboxPayload = {
        payoutId: payout.id,
        sellerId: seller.id,
        sellerEmail: seller.email,
        sellerName: seller.username,
        shopName: payout.shop.name,
        amount: Number(payout.amount),
        status: PayoutStatus.COMPLETED,
        reason: null,
      };
      const ev = manager.create(OutboxEvent, {
        event_type: OUTBOX_EVENT_TYPES.PAYOUT_STATUS_CHANGED,
        payload,
        status: OutboxEventStatus.PENDING,
      });
      await manager.save(OutboxEvent, ev);

      return updated;
    });
  }

  /** Admin từ chối yêu cầu rút tiền */
  async rejectPayout(
    payoutId: string,
    dto: RejectPayoutDto,
    adminId: string,
  ): Promise<Payout> {
    return this.dataSource.transaction(async (manager) => {
      const payout = await manager.findOne(Payout, {
        where: { id: payoutId },
        relations: ['shop', 'shop.seller'],
      });
      if (!payout) {
        throw new NotFoundException('Không tìm thấy yêu cầu rút tiền.');
      }
      assertPayoutTransition(payout.status, PayoutStatus.REJECTED);

      payout.status = PayoutStatus.REJECTED;
      payout.reject_reason = dto.reason;
      payout.resolved_by = { id: adminId } as User;
      payout.resolved_at = new Date();
      const updated = await manager.save(Payout, payout);

      const seller = payout.shop.seller;
      const payload: PayoutStatusChangedOutboxPayload = {
        payoutId: payout.id,
        sellerId: seller.id,
        sellerEmail: seller.email,
        sellerName: seller.username,
        shopName: payout.shop.name,
        amount: Number(payout.amount),
        status: PayoutStatus.REJECTED,
        reason: dto.reason,
      };
      const ev = manager.create(OutboxEvent, {
        event_type: OUTBOX_EVENT_TYPES.PAYOUT_STATUS_CHANGED,
        payload,
        status: OutboxEventStatus.PENDING,
      });
      await manager.save(OutboxEvent, ev);

      return updated;
    });
  }

  /** Tính toán số dư của Shop (dùng chung cho cả ngoài và trong transaction để chống lệch nghiệp vụ) */
  private async calculateShopBalance(
    shopId: string,
    manager?: EntityManager,
  ): Promise<BalanceResponseDto> {
    const repo = manager ? manager.getRepository(Payout) : this.payoutRepo;

    // Doanh thu THÔ (gross) — chưa trừ hoa hồng sàn.
    const gross_revenue = await this.ordersService.getShopDeliveredRevenue(
      shopId,
      manager,
    );

    // Bóc tách hoa hồng toàn sàn (Phương án A) ngay tại đây để hiển thị minh bạch.
    const commissionRate = SYSTEM_CONSTANTS.COMMISSION_RATE;
    const commission_amount = this.round2(gross_revenue * commissionRate);
    const total_revenue = this.round2(gross_revenue - commission_amount);

    const alias = 'payout';
    const whereShopIdStr = 'payout.shop_id = :shopId';
    const whereShopIdParam = { shopId };

    const completedStatusStr = 'payout.status = :status';
    const completedStatusParam = { status: PayoutStatus.COMPLETED };

    const payoutedResult = await repo
      .createQueryBuilder(alias)
      .select('SUM(payout.amount)', 'sum')
      .where(whereShopIdStr, whereShopIdParam)
      .andWhere(completedStatusStr, completedStatusParam)
      .getRawOne();

    const rawPayoutedSum = payoutedResult?.sum;
    const total_payouted = Number(rawPayoutedSum) || 0;

    const pendingStatuses = [PayoutStatus.PENDING, PayoutStatus.PROCESSING];
    const pendingStatusStr = 'payout.status IN (:...statuses)';
    const pendingStatusParam = { statuses: pendingStatuses };

    const pendingResult = await repo
      .createQueryBuilder(alias)
      .select('SUM(payout.amount)', 'sum')
      .where(whereShopIdStr, whereShopIdParam)
      .andWhere(pendingStatusStr, pendingStatusParam)
      .getRawOne();

    const rawPendingSum = pendingResult?.sum;
    const pending_payout = Number(rawPendingSum) || 0;

    const calculatedBalance = total_revenue - total_payouted - pending_payout;
    const available_balance = Math.max(0, calculatedBalance);

    const balanceResponse: BalanceResponseDto = {
      gross_revenue,
      commission_amount,
      total_revenue,
      total_payouted,
      available_balance,
      pending_payout,
    };

    return balanceResponse;
  }

  /** Làm tròn 2 chữ số thập phân để tránh sai số dấu phẩy động khi tính hoa hồng. */
  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
