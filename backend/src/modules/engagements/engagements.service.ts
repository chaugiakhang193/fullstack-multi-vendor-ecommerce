import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

// Entities
import { Review } from '@/modules/engagements/entities/review.entity';
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';

// DTOs
import { CreateReviewDto } from '@/modules/engagements/dto/create-review.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { ProductsService } from '@/modules/products/products.service';
import { OrdersService } from '@/modules/orders/orders.service';

// Helpers & Constants
import { paginate } from '@/common/helpers/pagination.helper';
import { OrderStatus, OutboxEventStatus } from '@/common/enums';
import {
  OUTBOX_EVENT_TYPES,
  ReviewCreatedPayload,
  ReviewRepliedPayload,
} from '@/common/constants/outbox.constants';

@Injectable()
export class EngagementsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================
  // CUSTOMER: danh sách các lần mua còn đánh giá được
  // ============================================================
  async getReviewableItems(userId: string, query: PaginationQueryDto) {
    // Lấy order_item_id user đã review (Review là entity của chính module này).
    const reviewedRows = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.order_item', 'oi')
      .leftJoin('r.user', 'u')
      .select('oi.id', 'order_item_id')
      .where('u.id = :userId', { userId })
      .getRawMany<{ order_item_id: string }>();
    const excludeIds = reviewedRows.map((row) => row.order_item_id);

    // OrdersService sở hữu order_item → trả về danh sách delivered, loại các id đã review.
    return this.ordersService.getReviewableOrderItems(userId, excludeIds, query);
  }

  // ============================================================
  // CUSTOMER: kiểm tra một order_item cụ thể có đánh giá được không
  // ============================================================
  async canReviewOrderItem(
    userId: string,
    orderItemId: string,
  ): Promise<boolean> {
    const deliveredOwned = await this.ordersService.isDeliveredOrderItemOfUser(
      userId,
      orderItemId,
    );
    if (!deliveredOwned) {
      return false;
    }
    const existing = await this.reviewRepo.findOne({
      where: { order_item: { id: orderItemId } },
    });
    return !existing;
  }

  // ============================================================
  // CUSTOMER: tạo đánh giá mới cho một lần mua
  // ============================================================
  async createReview(userId: string, dto: CreateReviewDto): Promise<Review> {
    const orderItemId = dto.order_item_id;
    // OrdersService sở hữu order_item → lấy kèm quan hệ để validate.
    const orderItem = await this.ordersService.findOrderItemForReview(orderItemId);
    if (!orderItem) {
      const errorMsg = 'Không tìm thấy mục đơn hàng';
      throw new NotFoundException(errorMsg);
    }

    const buyerId = orderItem.sub_order?.order?.customer?.id;
    if (buyerId !== userId) {
      const errorMsg = 'Bạn chỉ đánh giá được sản phẩm trong đơn của mình';
      throw new ForbiddenException(errorMsg);
    }

    const subOrderStatus = orderItem.sub_order?.status;
    const deliveredStatus = OrderStatus.DELIVERED;
    if (subOrderStatus !== deliveredStatus) {
      const errorMsg = 'Chỉ đánh giá được sau khi đã nhận hàng';
      throw new ForbiddenException(errorMsg);
    }

    if (!orderItem.product) {
      const errorMsg = 'Sản phẩm không còn tồn tại để đánh giá';
      throw new BadRequestException(errorMsg);
    }

    const dupFindOptions = {
      where: { order_item: { id: orderItemId } },
    };
    const dup = await this.reviewRepo.findOne(dupFindOptions);
    if (dup) {
      const errorMsg = 'Bạn đã đánh giá lần mua này rồi';
      throw new ConflictException(errorMsg);
    }

    const product = orderItem.product;

    const savedReview = await this.dataSource.transaction(async (manager) => {
      const reviewPayload = {
        user: { id: userId } as any,
        product: { id: product.id } as any,
        order_item: { id: orderItemId } as any,
        rating: dto.rating,
        comment: dto.comment,
      };
      const review = manager.create(Review, reviewPayload);
      const saved = await manager.save(Review, review);

      // Khoá dòng product TRƯỚC khi đọc AVG/COUNT (ProductsService sở hữu Product).
      await this.productsService.lockProductRow(product.id, manager);

      // Tính lại toàn bộ avg_rating/review_count từ bảng review (entity của module này).
      const agg = await manager
        .createQueryBuilder()
        .select('AVG(r.rating)', 'avg')
        .addSelect('COUNT(r.id)', 'cnt')
        .from(Review, 'r')
        .where('r.product_id = :id', { id: product.id })
        .getRawOne<{ avg: string; cnt: string }>();
      const avgVal = agg?.avg ? Number(Number(agg.avg).toFixed(1)) : 0;
      const cntVal = agg?.cnt ? parseInt(agg.cnt, 10) : 0;

      // Ghi rating qua ProductsService (Product là entity của module products).
      await this.productsService.applyRatingStats(
        product.id,
        avgVal,
        cntVal,
        manager,
      );

      // Ghi Outbox event review.created (outbox là hạ tầng dùng chung).
      const outboxPayload: ReviewCreatedPayload = {
        reviewId: saved.id,
        productId: product.id,
        productName: product.name,
        shopId: product.shop.id,
        rating: dto.rating,
      };
      const outboxEventObj = {
        event_type: OUTBOX_EVENT_TYPES.REVIEW_CREATED,
        payload: outboxPayload,
        status: OutboxEventStatus.PENDING,
      };
      await manager.save(OutboxEvent, outboxEventObj);

      return saved;
    });

    return savedReview;
  }

  // ============================================================
  // PUBLIC: lấy danh sách đánh giá của sản phẩm và phân phối sao
  // ============================================================
  async getProductReviews(productId: string, query: PaginationQueryDto) {
    // Endpoint public scoped theo product → 404 nếu product không tồn tại
    // (đồng bộ GET /products/:id; tránh trả rỗng cho UUID ảo che lỗi phía client).
    await this.productsService.ensureExists(productId);

    const productCondition = 'r.product_id = :productId';
    const productParams = { productId };

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoin('r.user', 'u')
      .addSelect(['u.id', 'u.username'])
      .leftJoin('r.order_item', 'oi')
      .addSelect(['oi.variant_name'])
      .where(productCondition, productParams)
      .orderBy('r.created_at', 'DESC');

    const page = await paginate(qb, query);

    const distRaw = await this.reviewRepo
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(r.id)', 'count')
      .where(productCondition, productParams)
      .groupBy('r.rating')
      .getRawMany<{ rating: number; count: string }>();

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<
      number,
      number
    >;
    for (const row of distRaw) {
      const ratingKey = row.rating;
      const countVal = parseInt(row.count, 10);
      distribution[ratingKey] = countVal;
    }

    const response = {
      ...page,
      distribution,
    };
    return response;
  }

  // ============================================================
  // SELLER: phản hồi đánh giá (chỉ được phản hồi 1 lần)
  // ============================================================
  async replyToReview(
    sellerId: string,
    reviewId: string,
    reply: string,
  ): Promise<Review> {
    const findOptions = {
      where: { id: reviewId },
      relations: ['product', 'product.shop', 'product.shop.seller', 'user'],
    };
    const review = await this.reviewRepo.findOne(findOptions);
    if (!review) {
      const errorMsg = 'Không tìm thấy đánh giá';
      throw new NotFoundException(errorMsg);
    }

    const shopSellerId = review.product?.shop?.seller?.id;
    if (shopSellerId !== sellerId) {
      const errorMsg = 'Đánh giá không thuộc shop của bạn';
      throw new ForbiddenException(errorMsg);
    }

    if (review.reply_from_seller) {
      const errorMsg = 'Đánh giá này đã được phản hồi';
      throw new ConflictException(errorMsg);
    }

    review.reply_from_seller = reply;
    const saved = await this.reviewRepo.save(review);

    // Ghi Outbox event cho review.replied
    const customerId = review.user?.id;
    const outboxPayload: ReviewRepliedPayload = {
      reviewId: review.id,
      productId: review.product?.id,
      productName: review.product?.name,
      customerId: customerId,
    };
    const outboxEventObj = {
      event_type: OUTBOX_EVENT_TYPES.REVIEW_REPLIED,
      payload: outboxPayload,
      status: OutboxEventStatus.PENDING,
    };
    await this.dataSource.getRepository(OutboxEvent).save(outboxEventObj);

    return saved;
  }

  // ============================================================
  // SELLER: lấy danh sách đánh giá của shop
  // ============================================================
  async getSellerReviews(sellerId: string, query: PaginationQueryDto) {
    const sellerCondition = 's.seller_id = :sellerId';
    const sellerParams = { sellerId };

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.product', 'p')
      .addSelect(['p.id', 'p.name', 'p.thumbnail_url'])
      .innerJoin('p.shop', 's')
      .leftJoin('r.user', 'u')
      .addSelect(['u.id', 'u.username'])
      .where(sellerCondition, sellerParams)
      .orderBy('r.created_at', 'DESC');

    const result = await paginate(qb, query);
    return result;
  }
}
