import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { CreateCouponDto } from '@/modules/promotions/dto/create-coupon.dto';
import { UpdateCouponDto } from '@/modules/promotions/dto/update-coupon.dto';
import { CouponQueryDto } from '@/modules/promotions/dto/coupon-query.dto';

import { Coupon } from '@/modules/promotions/entities/coupon.entity';
import { UserCoupon } from '@/modules/promotions/entities/user-coupon.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { ShopsService } from '@/modules/shops/shops.service';

import { CouponType, DiscountType } from '@/common/enums';
import { paginate } from '@/common/helpers/pagination.helper';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(UserCoupon)
    private readonly userCouponRepo: Repository<UserCoupon>,
    private readonly shopsService: ShopsService,
  ) {}

  // ===== Validate chung khi tạo/sửa =====
  private validateCouponPayload(dto: CreateCouponDto | UpdateCouponDto) {
    if (dto.discount_type === DiscountType.PERCENTAGE && dto.discount_value != null) {
      if (dto.discount_value <= 0 || dto.discount_value > 100) {
        throw new BadRequestException('Giảm theo % phải trong khoảng 1–100');
      }
    }
    if (dto.start_date && dto.end_date) {
      const parsedStartDate = new Date(dto.start_date);
      const parsedEndDate = new Date(dto.end_date);
      if (parsedStartDate > parsedEndDate) {
        throw new BadRequestException('start_date phải trước end_date');
      }
    }
  }

  // ===== ADMIN: coupon GLOBAL =====
  async createGlobalCoupon(dto: CreateCouponDto): Promise<Coupon> {
    this.validateCouponPayload(dto);
    const findOptions = { where: { code: dto.code } };
    const existed = await this.couponRepo.findOne(findOptions);
    if (existed) throw new ConflictException(`Mã "${dto.code}" đã tồn tại`);
    const couponData = { ...dto, type: CouponType.GLOBAL, shop: null as any };
    const coupon = this.couponRepo.create(couponData);
    return this.couponRepo.save(coupon);
  }

  // ===== SELLER: coupon SHOP (scope theo shop của seller) =====
  private async getShopBySeller(sellerId: string): Promise<Shop> {
    try {
      const shop = await this.shopsService.findOneByUserId(sellerId);
      return shop;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException('Tài khoản chưa có shop');
      }
      throw error;
    }
  }

  async createShopCoupon(sellerId: string, dto: CreateCouponDto): Promise<Coupon> {
    this.validateCouponPayload(dto);
    const shop = await this.getShopBySeller(sellerId);
    const findOptions = { where: { code: dto.code } };
    const existed = await this.couponRepo.findOne(findOptions);
    if (existed) throw new ConflictException(`Mã "${dto.code}" đã tồn tại`);
    const couponData = { ...dto, type: CouponType.SHOP, shop };
    const coupon = this.couponRepo.create(couponData);
    return this.couponRepo.save(coupon);
  }

  // ===== UPDATE/DELETE (dùng chung, check ownership) =====
  private async getOwnedCoupon(couponId: string, opts: { sellerId?: string }): Promise<Coupon> {
    const findOptions = { where: { id: couponId }, relations: ['shop'] };
    const coupon = await this.couponRepo.findOne(findOptions);
    if (!coupon) throw new NotFoundException('Không tìm thấy coupon');
    if (opts.sellerId) {
      const sellerId = opts.sellerId;
      const shop = await this.getShopBySeller(sellerId);
      const couponShopId = coupon.shop?.id;
      if (coupon.type !== CouponType.SHOP || couponShopId !== shop.id) {
        throw new ForbiddenException('Coupon không thuộc shop của bạn');
      }
    }
    return coupon;
  }

  async updateCoupon(couponId: string, dto: UpdateCouponDto, opts: { sellerId?: string }): Promise<Coupon> {
    this.validateCouponPayload(dto);
    const coupon = await this.getOwnedCoupon(couponId, opts);
    const { ...rest } = dto as any;
    delete rest.code;
    Object.assign(coupon, rest);
    return this.couponRepo.save(coupon);
  }

  async deleteCoupon(couponId: string, opts: { sellerId?: string }): Promise<void> {
    const coupon = await this.getOwnedCoupon(couponId, opts);
    await this.couponRepo.remove(coupon);
  }

  // ===== LIST =====
  async listAdmin(query: CouponQueryDto) {
    const alias = 'coupon';
    const qb = this.couponRepo.createQueryBuilder(alias);
    const joinRelation = 'coupon.shop';
    const joinAlias = 'shop';
    qb.leftJoinAndSelect(joinRelation, joinAlias);
    
    if (query.type) {
      const type = query.type;
      const whereClause = 'coupon.type = :type';
      const whereParams = { type };
      qb.where(whereClause, whereParams);
    }
    const orderColumn = 'coupon.start_date';
    const orderDirection = query.order ?? 'DESC';
    qb.orderBy(orderColumn, orderDirection);
    return paginate(qb, query);
  }

  async listSeller(sellerId: string, query: CouponQueryDto) {
    const shop = await this.getShopBySeller(sellerId);
    const alias = 'coupon';
    const qb = this.couponRepo.createQueryBuilder(alias);
    const whereClause = 'coupon.shop_id = :shopId';
    const shopId = shop.id;
    const whereParams = { shopId };
    qb.where(whereClause, whereParams);
    const orderColumn = 'coupon.start_date';
    const orderDirection = query.order ?? 'DESC';
    qb.orderBy(orderColumn, orderDirection);
    return paginate(qb, query);
  }

  // ===== CUSTOMER: browse coupon claim được (còn hạn + còn lượt) =====
  async listClaimable(userId: string, query: CouponQueryDto) {
    const now = new Date();
    const alias = 'coupon';
    const qb = this.couponRepo.createQueryBuilder(alias);
    const joinRelation = 'coupon.shop';
    const joinAlias = 'shop';
    qb.leftJoinAndSelect(joinRelation, joinAlias);
    
    const startDateClause = '(coupon.start_date IS NULL OR coupon.start_date <= :now)';
    const startDateParams = { now };
    qb.where(startDateClause, startDateParams);

    const endDateClause = '(coupon.end_date IS NULL OR coupon.end_date >= :now)';
    const endDateParams = { now };
    qb.andWhere(endDateClause, endDateParams);

    const limitClause = '(coupon.usage_limit IS NULL OR coupon.used_count < coupon.usage_limit)';
    qb.andWhere(limitClause);

    const notClaimedSubquery = (qb2: any) => {
      const selectColumn = 'uc.coupon_id';
      const fromTable = UserCoupon;
      const subAlias = 'uc';
      const subWhereClause = 'uc.user_id = :userId';
      const subWhereParams = { userId };
      
      const sub = qb2
        .subQuery()
        .select(selectColumn)
        .from(fromTable, subAlias)
        .where(subWhereClause, subWhereParams)
        .getQuery();
      return `coupon.id NOT IN ${sub}`;
    };
    qb.andWhere(notClaimedSubquery);

    const orderColumn = 'coupon.end_date';
    const orderDirection = 'ASC';
    qb.orderBy(orderColumn, orderDirection);
    return paginate(qb, query);
  }

  // ===== CUSTOMER: claim =====
  async claimCoupon(userId: string, couponId: string): Promise<UserCoupon> {
    const now = new Date();
    const findOptions = { where: { id: couponId } };
    const coupon = await this.couponRepo.findOne(findOptions);
    if (!coupon) throw new NotFoundException('Không tìm thấy coupon');
    if (coupon.end_date) {
      const parsedEndDate = new Date(coupon.end_date);
      if (now > parsedEndDate) {
        throw new BadRequestException('Coupon đã hết hạn');
      }
    }
    if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
      throw new BadRequestException('Coupon đã hết lượt');
    }
    const dupFindOptions = {
      where: { user: { id: userId }, coupon: { id: couponId } },
    };
    const dup = await this.userCouponRepo.findOne(dupFindOptions);
    if (dup) throw new ConflictException('Bạn đã lưu coupon này rồi');
    const ucData = {
      user: { id: userId } as any,
      coupon: { id: couponId } as any,
      is_used: false,
    };
    const uc = this.userCouponRepo.create(ucData);
    return this.userCouponRepo.save(uc);
  }

  // ===== CUSTOMER: ví =====
  async getWallet(userId: string, query: CouponQueryDto) {
    const alias = 'uc';
    const qb = this.userCouponRepo.createQueryBuilder(alias);
    
    const couponJoinRelation = 'uc.coupon';
    const couponJoinAlias = 'coupon';
    qb.leftJoinAndSelect(couponJoinRelation, couponJoinAlias);

    const shopJoinRelation = 'coupon.shop';
    const shopJoinAlias = 'shop';
    qb.leftJoinAndSelect(shopJoinRelation, shopJoinAlias);

    const whereClause = 'uc.user_id = :userId';
    const whereParams = { userId };
    qb.where(whereClause, whereParams);

    const orderColumn1 = 'uc.is_used';
    const orderDirection1 = 'ASC';
    qb.orderBy(orderColumn1, orderDirection1);

    const orderColumn2 = 'coupon.end_date';
    const orderDirection2 = 'ASC';
    qb.addOrderBy(orderColumn2, orderDirection2);
    return paginate(qb, query);
  }

  // ===== Sync ví khi redeem/hủy (gọi từ orders.service, trong cùng transaction) =====
  async markWalletUsed(userId: string, couponId: string, manager: EntityManager): Promise<void> {
    const qb = manager.createQueryBuilder();
    const entity = UserCoupon;
    const updateValues = { is_used: true, used_at: () => 'NOW()' };
    const whereClause = 'user_id = :userId AND coupon_id = :couponId AND is_used = false';
    const whereParams = { userId, couponId };

    await qb
      .update(entity)
      .set(updateValues)
      .where(whereClause, whereParams)
      .execute();
  }

  async markWalletUnused(userId: string, couponId: string, manager: EntityManager): Promise<void> {
    const qb = manager.createQueryBuilder();
    const entity = UserCoupon;
    const updateValues = { is_used: false, used_at: null };
    const whereClause = 'user_id = :userId AND coupon_id = :couponId';
    const whereParams = { userId, couponId };

    await qb
      .update(entity)
      .set(updateValues)
      .where(whereClause, whereParams)
      .execute();
  }

  // ==========================================
  // CHECKOUT SUPPORT (Cross-module Helpers)
  // ==========================================

  /**
   * Khoá và xác thực một coupon cho luồng Checkout.
   *
   * Áp pessimistic_write trên row Coupon để chặn race condition khi nhiều người
   * dùng cùng tiêu thụ một coupon có usage_limit. Sau đó validate đủ các điều kiện:
   *   - Loại coupon (GLOBAL / SHOP) khớp với vị trí áp dụng.
   *   - Với SHOP: coupon.shop.id phải khớp shopId được truyền vào.
   *   - Cửa sổ thời gian: start_date <= now <= end_date (nullable thì bỏ qua).
   *   - Hạn lượt dùng: used_count < usage_limit (nullable thì bỏ qua).
   *   - Tối thiểu đơn: subtotal >= min_order_value (nullable thì bỏ qua).
   *
   * Nếu code rỗng / undefined → trả null (không có coupon áp dụng).
   */
  async lockAndValidateCoupon(params: {
    code: string | undefined | null;
    expectedType: CouponType;
    shopId?: string | null;
    subtotal: number;
    manager: EntityManager;
  }): Promise<Coupon | null> {
    const { code, expectedType, shopId, subtotal, manager } = params;

    const hasNoCode = !code || code.trim() === '';
    if (hasNoCode) {
      return null;
    }

    // Khoá pessimistic_write theo code (code có unique constraint nên đủ tin cậy).
    // KHÔNG join 'shop' ở câu lock: Postgres cấm FOR UPDATE trên phía nullable của
    // outer join (LEFT JOIN shop) → lỗi 0A000. Lock bare row trước, load 'shop' sau
    // (row đã khóa trong transaction nên đọc lại vẫn nhất quán).
    const findOptions1 = {
      where: { code },
      lock: { mode: 'pessimistic_write' as const },
    };
    const lockedRow = await manager.findOne(Coupon, findOptions1);

    const isCouponMissing = !lockedRow;
    if (isCouponMissing) {
      const notFoundMsg = `Mã giảm giá "${code}" không tồn tại`;
      throw new BadRequestException(notFoundMsg);
    }

    const lockedRowId = lockedRow.id;
    const findOptions2 = {
      where: { id: lockedRowId },
      relations: ['shop'],
    };
    const coupon = await manager.findOne(Coupon, findOptions2);
    if (!coupon) {
      const notFoundMsg = `Mã giảm giá "${code}" không tồn tại`;
      throw new BadRequestException(notFoundMsg);
    }

    // Kiểm tra loại coupon (GLOBAL / SHOP)
    const isWrongType = coupon.type !== expectedType;
    if (isWrongType) {
      const wrongTypeMsg = `Mã "${code}" không thuộc loại được phép áp dụng tại vị trí này`;
      throw new BadRequestException(wrongTypeMsg);
    }

    // Với mã SHOP: phải khớp đúng shop của sub-order
    const isShopCoupon = expectedType === CouponType.SHOP;
    if (isShopCoupon) {
      const couponShopId = coupon.shop?.id;
      const isShopMismatch = !couponShopId || couponShopId !== shopId;
      if (isShopMismatch) {
        const shopMismatchMsg = `Mã "${code}" không thuộc về shop này`;
        throw new BadRequestException(shopMismatchMsg);
      }
    }

    // Cửa sổ thời gian
    const now = new Date();
    const hasStartDate = coupon.start_date !== null && coupon.start_date !== undefined;
    if (hasStartDate) {
      const parsedStartDate = new Date(coupon.start_date);
      const isBeforeStart = now < parsedStartDate;
      if (isBeforeStart) {
        const notYetActiveMsg = `Mã "${code}" chưa đến thời gian áp dụng`;
        throw new BadRequestException(notYetActiveMsg);
      }
    }
    const hasEndDate = coupon.end_date !== null && coupon.end_date !== undefined;
    if (hasEndDate) {
      const parsedEndDate = new Date(coupon.end_date);
      const isAfterEnd = now > parsedEndDate;
      if (isAfterEnd) {
        const expiredMsg = `Mã "${code}" đã hết hạn`;
        throw new BadRequestException(expiredMsg);
      }
    }

    // Hạn lượt dùng — null nghĩa là không giới hạn
    const hasUsageLimit =
      coupon.usage_limit !== null && coupon.usage_limit !== undefined;
    if (hasUsageLimit) {
      const isExhausted = coupon.used_count >= coupon.usage_limit;
      if (isExhausted) {
        const exhaustedMsg = `Mã "${code}" đã hết lượt sử dụng`;
        throw new BadRequestException(exhaustedMsg);
      }
    }

    // Giá trị đơn tối thiểu — null nghĩa là không yêu cầu tối thiểu
    const hasMinOrder =
      coupon.min_order_value !== null && coupon.min_order_value !== undefined;
    if (hasMinOrder) {
      const minValue = Number(coupon.min_order_value);
      const isBelowMin = subtotal < minValue;
      if (isBelowMin) {
        const belowMinMsg = `Đơn chưa đạt giá trị tối thiểu ${minValue} để áp dụng mã "${code}"`;
        throw new BadRequestException(belowMinMsg);
      }
    }

    return coupon;
  }

  /**
   * Tăng used_count của coupon trong cùng transaction sau khi đơn được xác nhận.
   * Cần được gọi sau lockAndValidateCoupon vì row đã được khoá pessimistic_write.
   */
  async consumeCoupon(coupon: Coupon, manager: EntityManager): Promise<void> {
    coupon.used_count = coupon.used_count + 1;
    await manager.save(Coupon, coupon);
  }

  /**
   * Hoàn 1 lượt sử dụng coupon (used_count -= 1) khi hủy đơn — đối xứng với consumeCoupon.
   * Khoá pessimistic_write để tránh race với checkout đang tiêu thụ cùng coupon.
   * Kẹp sàn 0 để không bao giờ âm phòng dữ liệu lệch.
   */
  async releaseCoupon(couponId: string, manager: EntityManager): Promise<void> {
    const findOptions = {
      where: { id: couponId },
      lock: { mode: 'pessimistic_write' as const },
    };
    const coupon = await manager.findOne(Coupon, findOptions);
    if (!coupon) {
      return;
    }
    coupon.used_count = Math.max(0, coupon.used_count - 1);
    await manager.save(Coupon, coupon);
  }
}
