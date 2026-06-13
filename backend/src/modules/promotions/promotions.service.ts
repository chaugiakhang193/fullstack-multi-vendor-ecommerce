import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

// DTOs
import { CreatePromotionDto } from '@/modules/promotions/dto/create-promotion.dto';
import { UpdatePromotionDto } from '@/modules/promotions/dto/update-promotion.dto';

// Entities
import { Coupon } from '@/modules/promotions/entities/coupon.entity';

// Enums
import { CouponType } from '@/common/enums';

@Injectable()
export class PromotionsService {
  // === Scaffold mặc định (chưa dùng) ===
  create(createPromotionDto: CreatePromotionDto) {
    return 'This action adds a new promotion';
  }

  findAll() {
    return `This action returns all promotions`;
  }

  findOne(id: number) {
    return `This action returns a #${id} promotion`;
  }

  update(id: number, updatePromotionDto: UpdatePromotionDto) {
    return `This action updates a #${id} promotion`;
  }

  remove(id: number) {
    return `This action removes a #${id} promotion`;
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
    const lockedRow = await manager.findOne(Coupon, {
      where: { code },
      lock: { mode: 'pessimistic_write' as const },
    });

    const isCouponMissing = !lockedRow;
    if (isCouponMissing) {
      const notFoundMsg = `Mã giảm giá "${code}" không tồn tại`;
      throw new BadRequestException(notFoundMsg);
    }

    const coupon = await manager.findOne(Coupon, {
      where: { id: lockedRow.id },
      relations: ['shop'],
    });
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
      const isBeforeStart = now < new Date(coupon.start_date);
      if (isBeforeStart) {
        const notYetActiveMsg = `Mã "${code}" chưa đến thời gian áp dụng`;
        throw new BadRequestException(notYetActiveMsg);
      }
    }
    const hasEndDate = coupon.end_date !== null && coupon.end_date !== undefined;
    if (hasEndDate) {
      const isAfterEnd = now > new Date(coupon.end_date);
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
