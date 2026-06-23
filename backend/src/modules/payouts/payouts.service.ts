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
import { MailService } from '@/modules/mail/mail.service';
import { NotificationService } from '@/modules/engagements/notification.service';
import { NotificationGateway } from '@/modules/engagements/notification.gateway';
import { WS_EVENTS } from '@/modules/engagements/notification.events';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { PayoutStatus, NotificationType } from '@/common/enums';
import { paginate } from '@/common/helpers/pagination.helper';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepo: Repository<Payout>,
    private readonly ordersService: OrdersService,
    private readonly shopsService: ShopsService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
    private readonly dataSource: DataSource,
  ) {}

  /** Lấy số dư khả dụng của Seller */
  async getSellerBalance(sellerId: string): Promise<{
    total_revenue: number;
    total_payouted: number;
    available_balance: number;
    pending_payout: number;
  }> {
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
        const errorMsg = 'Vui lòng cập nhật thông tin tài khoản ngân hàng trước khi rút tiền.';
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
        const errorMsg = 'Bạn đang có một yêu cầu rút tiền đang được xử lý. Vui lòng chờ lệnh cũ hoàn thành.';
        throw new BadRequestException(errorMsg);
      }

      const balance = await this.calculateShopBalance(shopId, queryRunner.manager);
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

  /** Admin xem danh sách tất cả yêu cầu rút tiền */
  async getAdminPayouts(query: PaginationQueryDto) {
    const alias = 'payout';
    const shopRelation = 'payout.shop';
    const shopAlias = 'shop';
    const shopFields = ['shop.id', 'shop.name'];
    const sellerRelation = 'shop.seller';
    const sellerAlias = 'seller';
    const sellerFields = ['seller.id', 'seller.username', 'seller.email', 'seller.full_name'];
    const orderField = 'payout.created_at';
    const orderDir = 'DESC' as const;

    const qb = this.payoutRepo
      .createQueryBuilder(alias)
      .leftJoin(shopRelation, shopAlias)
      .addSelect(shopFields)
      .leftJoin(sellerRelation, sellerAlias)
      .addSelect(sellerFields)
      .orderBy(orderField, orderDir);

    const paginatedResult = paginate(qb, query);
    return paginatedResult;
  }

  /** Admin phê duyệt yêu cầu rút tiền */
  async approvePayout(payoutId: string, adminId: string): Promise<Payout> {
    const findOptions = {
      where: { id: payoutId },
      relations: ['shop', 'shop.seller'],
    };

    const payout = await this.payoutRepo.findOne(findOptions);

    if (!payout) {
      const errorMsg = 'Không tìm thấy yêu cầu rút tiền.';
      throw new NotFoundException(errorMsg);
    }

    const currentStatus = payout.status;
    if (currentStatus !== PayoutStatus.PENDING && currentStatus !== PayoutStatus.PROCESSING) {
      const errorMsg = 'Yêu cầu rút tiền đã được xử lý từ trước.';
      throw new BadRequestException(errorMsg);
    }

    payout.status = PayoutStatus.COMPLETED;
    payout.resolved_by = { id: adminId } as User;
    payout.resolved_at = new Date();

    const updatedPayout = await this.payoutRepo.save(payout);

    const completedStatus = PayoutStatus.COMPLETED;
    await this.notifyPayoutResolved(payout, completedStatus);

    return updatedPayout;
  }

  /** Admin từ chối yêu cầu rút tiền */
  async rejectPayout(payoutId: string, dto: RejectPayoutDto, adminId: string): Promise<Payout> {
    const findOptions = {
      where: { id: payoutId },
      relations: ['shop', 'shop.seller'],
    };

    const payout = await this.payoutRepo.findOne(findOptions);

    if (!payout) {
      const errorMsg = 'Không tìm thấy yêu cầu rút tiền.';
      throw new NotFoundException(errorMsg);
    }

    const currentStatus = payout.status;
    if (currentStatus !== PayoutStatus.PENDING && currentStatus !== PayoutStatus.PROCESSING) {
      const errorMsg = 'Yêu cầu rút tiền đã được xử lý từ trước.';
      throw new BadRequestException(errorMsg);
    }

    const rejectReason = dto.reason;
    payout.status = PayoutStatus.REJECTED;
    payout.reject_reason = rejectReason;
    payout.resolved_by = { id: adminId } as User;
    payout.resolved_at = new Date();

    const updatedPayout = await this.payoutRepo.save(payout);

    const rejectedStatus = PayoutStatus.REJECTED;
    await this.notifyPayoutResolved(payout, rejectedStatus, rejectReason);

    return updatedPayout;
  }

  /** Tính toán số dư của Shop (dùng chung cho cả ngoài và trong transaction để chống lệch nghiệp vụ) */
  private async calculateShopBalance(
    shopId: string,
    manager?: EntityManager,
  ): Promise<{
    total_revenue: number;
    total_payouted: number;
    available_balance: number;
    pending_payout: number;
  }> {
    const repo = manager
      ? manager.getRepository(Payout)
      : this.payoutRepo;

    const total_revenue = await this.ordersService.getShopDeliveredRevenue(shopId, manager);

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

    const balanceResponse = {
      total_revenue,
      total_payouted,
      available_balance,
      pending_payout,
    };

    return balanceResponse;
  }

  /**
   * Gửi mail + lưu notification DB + đẩy socket sau khi payout đã đổi trạng thái.
   * Toàn bộ bọc try/catch: side-effect lỗi KHÔNG được ném ngược ra.
   */
  private async notifyPayoutResolved(
    payout: Payout,
    status: PayoutStatus.COMPLETED | PayoutStatus.REJECTED,
    reason?: string,
  ): Promise<void> {
    try {
      const seller = payout.shop.seller;
      const rawAmount = payout.amount;
      const amountNum = Number(rawAmount);
      const isApproved = status === PayoutStatus.COMPLETED;

      const shopName = payout.shop.name;
      const emailReason = reason ?? null;

      const locale = 'vi-VN';
      const formattedAmount = amountNum.toLocaleString(locale);

      const title = isApproved ? 'Yêu cầu rút tiền thành công' : 'Yêu cầu rút tiền bị từ chối';
      const content = isApproved
        ? `Yêu cầu rút tiền trị giá ${formattedAmount}đ đã được phê duyệt thành công.`
        : `Yêu cầu rút tiền trị giá ${formattedAmount}đ đã bị từ chối. Lý do: ${reason}`;

      await this.mailService.sendPayoutStatusEmail(
        seller,
        shopName,
        amountNum,
        status,
        emailReason,
      );

      const createNotificationDto = {
        userId: seller.id,
        type: NotificationType.PAYOUT_STATUS_CHANGED,
        title,
        content,
        data: {
          kind: 'payout_status_changed' as const,
          payoutId: payout.id,
          amount: amountNum,
          status,
          rejectReason: reason ?? null,
        },
      };

      await this.notificationService.create(createNotificationDto);

      const sellerId = seller.id;
      const eventName = WS_EVENTS.PAYOUT_STATUS_CHANGED;
      const socketPayload = {
        payoutId: payout.id,
        amount: amountNum,
        status,
        message: content,
      };

      this.notificationGateway.sendToUser(sellerId, eventName, socketPayload);
    } catch (error) {
      const logMessage = `[notifyPayoutResolved] payoutId=${payout.id} status=${status} side-effect lỗi`;
      const stackStr = error instanceof Error ? error.stack : String(error);
      this.logger.error(logMessage, stackStr);
    }
  }
}
