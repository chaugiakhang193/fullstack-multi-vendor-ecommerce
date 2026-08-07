import {
  Inject,
  Injectable,
  forwardRef,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  In,
  Brackets,
  SelectQueryBuilder,
  Not,
} from 'typeorm';
import {
  generateSlug,
  extractId,
  normalizePriceRange,
  parseVariantAttributes,
} from '@/modules/products/product.utils';

// DTOs
import { CreateProductDto } from '@/modules/products/dto/create-product.dto';
import { UpdateProductDto } from '@/modules/products/dto/update-product.dto';
import {
  GetProductsQueryDto,
  GetSellerProductsQueryDto,
} from '@/modules/products/dto/get-products-query.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import { AdminProductQueryDto } from '@/modules/products/dto/admin-product-query.dto';

// Helpers
import { paginate } from '@/common/helpers/pagination.helper';

// Entities
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { MediaAsset } from '@/modules/cloudinary/entities/media-asset.entity';
import { User } from '@/modules/users/entities/user.entity';
import { OutboxEvent } from '@/common/entities/outbox-event.entity';

// Services
import { CloudinaryService } from '@/modules/cloudinary/cloudinary.service';
import { ShopsService } from '@/modules/shops/shops.service';
import { CategoriesService } from '@/modules/products/categories.service';

// Enums & Interfaces
import {
  AccountStatus,
  AssetType,
  ProductStatus,
  OutboxEventStatus,
  ProductModerationAction,
} from '@/common/enums';
import {
  UPLOAD_LIMITS,
  CLOUDINARY_FOLDER,
} from '@/common/constants/upload.constant';
import { IUser } from '@/interface/user.interface';

// Constants
import {
  OUTBOX_EVENT_TYPES,
  ProductModeratedOutboxPayload,
  ProductSearchSnapshotPayload,
  ProductDeletedOutboxPayload,
} from '@/common/constants/outbox.constants';
import { PAGINATION_LIMITS } from '@/common/constants/pagination.constant';
import {
  SearchClient,
  SearchCandidate,
} from '@/modules/products/search.client';
import { SearchWarmupService } from '@/modules/products/search-warmup.service';

@Injectable()
export class ProductsService {
  // Guard chống chạy chồng reindex trong cùng process (admin bấm 2 lần liên tiếp).
  // Mỗi lần reindex nạp N OutboxEvent với event_id mới, consumer KHÔNG dedup giữa 2
  // lần chạy nên chạy chồng = phí công gấp đôi. Singleton nên field instance là đủ.
  private reindexInProgress = false;

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly categoriesService: CategoriesService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => ShopsService))
    private readonly shopsService: ShopsService,
    private readonly dataSource: DataSource,
    private readonly searchClient: SearchClient,
    private readonly searchWarmup: SearchWarmupService,
  ) {}

  // ==========================================
  // CROSS-MODULE HELPERS Dùng bởi EngagementsModule (reviews)
  // ==========================================

  /** Đảm bảo product tồn tại, không thì 404 (cho module khác validate mà không inject repo). */
  async ensureExists(id: string): Promise<void> {
    const realId = extractId(id);
    const found = await this.productsRepository.findOne({
      where: { id: realId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
  }

  /**
   * Khoá pessimistic_write dòng product để tuần tự hoá recompute rating.
   * Phải gọi TRƯỚC khi đọc AVG/COUNT trong cùng transaction (chống lost-update).
   */
  async lockProductRow(
    productId: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .setLock('pessimistic_write')
      .select('p.id')
      .from(Product, 'p')
      .where('p.id = :id', { id: productId })
      .getOne();
  }

  /** Ghi đè rating tổng hợp đã tính sẵn (caller giữ lock + tính từ bảng review). */
  async applyRatingStats(
    productId: string,
    avgRating: number,
    reviewCount: number,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(Product, productId, {
      avg_rating: avgRating,
      review_count: reviewCount,
    });
  }

  // ==========================================
  // I. CREATE SERVICE
  // ==========================================

  async create(
    createProductDto: CreateProductDto,
    files: {
      thumbnail?: Express.Multer.File[];
      general_gallery?: Express.Multer.File[];
      variant_images?: Express.Multer.File[];
      color_images?: Express.Multer.File[];
    },
    user: IUser,
  ) {
    // Kiểm tra trạng thái Seller
    const isSellerInactive = user.status !== AccountStatus.ACTIVE;
    if (isSellerInactive) {
      const inactiveMsg =
        'Tài khoản chưa được kích hoạt để thực hiện chức năng này';
      throw new BadRequestException(inactiveMsg);
    }

    // Tìm Shop của Seller
    const shop = await this.shopsService.findOneByUserId(user.sub);
    const isShopInactive = shop.status !== AccountStatus.ACTIVE;
    if (isShopInactive) {
      const shopInactiveMsg =
        'Cửa hàng hiện đang trong trạng thái bị khóa hoặc chưa được kích hoạt';
      throw new BadRequestException(shopInactiveMsg);
    }

    // Kiểm tra và lấy danh mục con cấp cuối cùng
    const categoryId = createProductDto.category_id;
    const category =
      await this.categoriesService.validateLeafCategory(categoryId);

    // Kiểm tra tính hợp lệ của ảnh
    const thumbnailFile = files.thumbnail?.[0];
    const isThumbnailMissing = !thumbnailFile;
    if (isThumbnailMissing) {
      const missingThumbMsg = 'Ảnh đại diện (thumbnail) là bắt buộc';
      throw new BadRequestException(missingThumbMsg);
    }

    const hasNoGeneralGallery =
      !files.general_gallery || files.general_gallery.length === 0;
    if (hasNoGeneralGallery) {
      const missingGalleryMsg =
        'Yêu cầu tối thiểu 1 ảnh trong bộ sưu tập chung';
      throw new BadRequestException(missingGalleryMsg);
    }

    const hasVariants = createProductDto.has_variants;
    // Model màu: ảnh gom theo màu qua colorImages. Fallback protocol cũ
    // (per-variant imageCount + variant_images) khi colorImages vắng mặt (back-compat).
    const usingColorModel =
      Array.isArray(createProductDto.colorImages) &&
      createProductDto.colorImages.length > 0;
    if (hasVariants) {
      const hasNoVariants =
        !createProductDto.variants || createProductDto.variants.length === 0;
      if (hasNoVariants) {
        const missingVariantsMsg =
          'Thiếu thông tin chi tiết của các biến thể sản phẩm';
        throw new BadRequestException(missingVariantsMsg);
      }

      if (usingColorModel) {
        const totalColorImages = createProductDto.colorImages!.reduce(
          (sum, g) => sum + g.imageCount,
          0,
        );
        const actualColorImages = files.color_images?.length || 0;
        const isColorMismatch = totalColorImages !== actualColorImages;
        if (isColorMismatch) {
          const mismatchMsg = `Số ảnh màu không khớp (Khai báo: ${totalColorImages}, Thực tế: ${actualColorImages})`;
          throw new BadRequestException(mismatchMsg);
        }
      } else {
        const sumImagesFn = (sum: number, v: { imageCount?: number }) =>
          sum + (v.imageCount || 0);
        const totalExpectedImages = createProductDto.variants!.reduce(
          sumImagesFn,
          0,
        );
        const actualImages = files.variant_images?.length || 0;

        const isImagesCountMismatch = totalExpectedImages !== actualImages;
        if (isImagesCountMismatch) {
          const mismatchMsg = `Số lượng ảnh biến thể không khớp (Khai báo: ${totalExpectedImages}, Thực tế: ${actualImages})`;
          throw new BadRequestException(mismatchMsg);
        }
      }
    }

    // Bắt đầu Transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const uploadedAssets: { id: string; public_id: string }[] = [];

    try {
      // Upload Thumbnail
      const thumbnailFolder = CLOUDINARY_FOLDER.PRODUCT_THUMBNAILS;
      const userSub = user.sub;
      const assetTypeThumbnail = AssetType.PRODUCT_THUMBNAIL;
      const shopId = shop.id;

      const thumbnailResult = await this.cloudinaryService.uploadFile(
        thumbnailFile,
        thumbnailFolder,
        userSub,
        assetTypeThumbnail,
        shopId,
        uploadedAssets,
      );

      // Upload General Gallery
      const generalGalleryFiles = files.general_gallery;
      const galleryFolder = CLOUDINARY_FOLDER.PRODUCT_GALLERY;
      const assetTypeGallery = AssetType.PRODUCT_GALLERY;

      const galleryAssets = await this.cloudinaryService.uploadMultipleFiles(
        generalGalleryFiles,
        galleryFolder,
        userSub,
        assetTypeGallery,
        shopId,
        uploadedAssets,
      );

      const mapAssetUrlFn = (asset: { url: string }) => asset.url;
      const galleryUrls = galleryAssets.map(mapAssetUrlFn);

      // Upload ảnh theo MÀU → color_groups map { màu: { hex, images } }. Nguồn sự thật màu.
      const colorGroupsMap: Record<
        string,
        { hex: string | null; images: string[] }
      > = {};
      if (usingColorModel) {
        let colorOffset = 0;
        for (const group of createProductDto.colorImages!) {
          const nextOffset = colorOffset + group.imageCount;
          const groupFiles = (files.color_images || []).slice(
            colorOffset,
            nextOffset,
          );
          colorOffset = nextOffset;
          const groupAssets = await this.cloudinaryService.uploadMultipleFiles(
            groupFiles,
            CLOUDINARY_FOLDER.PRODUCT_VARIANTS,
            userSub,
            AssetType.PRODUCT_VARIANT_IMAGE,
            shopId,
            uploadedAssets,
          );
          colorGroupsMap[group.color] = {
            hex: group.hex ?? null,
            images: groupAssets.map(mapAssetUrlFn),
          };
        }
      }

      const productSlug = generateSlug(createProductDto.name);
      const initialStock = createProductDto.stock_quantity || 0;

      // Tạo Product
      const product = queryRunner.manager.create(Product, {
        name: createProductDto.name,
        description: createProductDto.description,
        price: createProductDto.price,
        category,
        shop,
        thumbnail_url: thumbnailResult.url,
        gallery: galleryUrls,
        color_groups: usingColorModel ? colorGroupsMap : null,
        slug: productSlug,
        sku: createProductDto.sku,
        weight: createProductDto.weight,
        length: createProductDto.length,
        width: createProductDto.width,
        height: createProductDto.height,
        status: ProductStatus.ACTIVE,
        has_variants: createProductDto.has_variants,
        stock_quantity: initialStock,
      });

      // Xử lý Biến thể (Variants)
      const isProductWithVariants =
        createProductDto.has_variants && createProductDto.variants;
      if (isProductWithVariants) {
        let imageOffset = 0;
        const variantsToSave: ProductVariant[] = [];

        for (const variantDto of createProductDto.variants!) {
          // Model màu: KHÔNG ghi ảnh per-variant (ảnh nằm ở color_groups → resolver bơm khi đọc).
          // Model cũ (back-compat): slice + upload variant_images theo imageCount.
          let variantUrls: string[] = [];
          if (!usingColorModel) {
            const nextOffset = imageOffset + (variantDto.imageCount || 0);
            const variantFiles = (files.variant_images || []).slice(
              imageOffset,
              nextOffset,
            );
            imageOffset = nextOffset;

            const variantFolder = CLOUDINARY_FOLDER.PRODUCT_VARIANTS;
            const assetTypeVariant = AssetType.PRODUCT_VARIANT_IMAGE;

            const variantAssets =
              await this.cloudinaryService.uploadMultipleFiles(
                variantFiles,
                variantFolder,
                userSub,
                assetTypeVariant,
                shopId,
                uploadedAssets,
              );

            variantUrls = variantAssets.map(mapAssetUrlFn);
          }

          const variantName = variantDto.name;
          const attributes =
            variantDto.attributes &&
            Object.keys(variantDto.attributes).length > 0
              ? variantDto.attributes
              : parseVariantAttributes(variantName);

          const variant = queryRunner.manager.create(ProductVariant, {
            name: variantName,
            attributes: attributes,
            sku: variantDto.sku,
            additional_price: variantDto.additional_price || 0,
            stock_quantity: variantDto.stock_quantity,
            images: variantUrls,
          });
          variantsToSave.push(variant);
        }

        product.variants = variantsToSave;

        // Tính tổng tồn kho từ biến thể
        const sumStockFn = (sum: number, variant: ProductVariant) =>
          sum + variant.stock_quantity;
        product.stock_quantity = variantsToSave.reduce(sumStockFn, 0);
      }

      const savedProduct = await queryRunner.manager.save(Product, product);

      // Cập nhật product_id cho tất cả MediaAsset đã upload
      const hasUploadedAssets = uploadedAssets.length > 0;
      if (hasUploadedAssets) {
        const mapAssetIdFn = (asset: { id: string }) => asset.id;
        const assetIds = uploadedAssets.map(mapAssetIdFn);

        const updateAssetIdCondition = { id: In(assetIds) };
        const updateAssetIdPayload = { product_id: savedProduct.id };
        await queryRunner.manager.update(
          MediaAsset,
          updateAssetIdCondition,
          updateAssetIdPayload,
        );
      }

      await this.emitProductSnapshot(
        queryRunner.manager,
        savedProduct,
        OUTBOX_EVENT_TYPES.PRODUCT_CREATED,
      );

      await queryRunner.commitTransaction();
      return savedProduct;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Dọn rác Cloudinary và Database nếu có lỗi
      const hasUploadedAssets = uploadedAssets.length > 0;
      if (hasUploadedAssets) {
        const deleteAssetFn = (asset: { id: string }) => {
          const userSub = user.sub;
          return this.cloudinaryService.deleteAsset(asset.id, userSub);
        };
        const deletePromises = uploadedAssets.map(deleteAssetFn);

        Promise.allSettled(deletePromises).catch((e) =>
          console.error('Lỗi khi dọn rác ảnh và DB:', e),
        );
      }

      const classNameMethod = '[ProductsService.create] Error:';
      console.error(classNameMethod, error);

      const isBadRequest = error instanceof BadRequestException;
      if (isBadRequest) {
        throw error;
      }

      const serverErrorMsg = 'Đã xảy ra lỗi trong quá trình khởi tạo sản phẩm';
      throw new InternalServerErrorException(serverErrorMsg);
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // ADMIN MODERATION SERVICES
  // ==========================================

  async findAllForAdmin(
    query: AdminProductQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    const productAlias = 'product';
    const shopAlias = 'shop';
    const qb = this.productsRepository
      .createQueryBuilder(productAlias)
      .leftJoinAndSelect('product.shop', shopAlias)
      .orderBy('product.created_at', 'DESC');

    const statusParam = query.status;
    const isStatusDefined = statusParam !== undefined;
    if (isStatusDefined) {
      const statusCondition = 'product.status = :status';
      const statusParams = { status: statusParam };
      qb.andWhere(statusCondition, statusParams);
    } else {
      // Mặc định KHÔNG hiện hàng đã xóa mềm (giống seller list).
      const deletedStatus = ProductStatus.DELETED;
      const notDeletedCondition = 'product.status != :deleted';
      const notDeletedParams = { deleted: deletedStatus };
      qb.andWhere(notDeletedCondition, notDeletedParams);
    }

    const shopIdParam = query.shop_id;
    const isShopIdDefined = !!shopIdParam;
    if (isShopIdDefined) {
      const shopCondition = 'shop.id = :shopId';
      const shopParams = { shopId: shopIdParam };
      qb.andWhere(shopCondition, shopParams);
    }

    const qParam = query.q;
    const isQDefined = !!qParam;
    if (isQDefined) {
      const nameCondition = 'product.name ILIKE :q';
      const nameParams = { q: `%${qParam}%` };
      qb.andWhere(nameCondition, nameParams);
    }

    const result = await paginate(qb, query);
    return result;
  }

  // part_02 sẽ nhét emit outbox 'product.moderated' (action=taken_down) SAU khi
  // save, trong cùng transaction.
  async takeDown(
    adminId: string,
    productId: string,
    reason: string,
  ): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const findConditions = {
        where: { id: productId },
        relations: ['shop', 'category'],
      };
      const manager = queryRunner.manager;
      const product = await manager.findOne(Product, findConditions);
      if (!product) {
        const notFoundMsg = 'Không tìm thấy sản phẩm';
        throw new NotFoundException(notFoundMsg);
      }

      const isDeleted = product.status === ProductStatus.DELETED;
      if (isDeleted) {
        const badRequestMsg = 'Sản phẩm đã bị xóa, không thể gỡ.';
        throw new BadRequestException(badRequestMsg);
      }

      const isSuspended = product.status === ProductStatus.SUSPENDED;
      if (isSuspended) {
        const badRequestMsg = 'Sản phẩm đã bị gỡ trước đó.';
        throw new BadRequestException(badRequestMsg);
      }

      product.status = ProductStatus.SUSPENDED;
      product.moderation_reason = reason;
      const now = new Date();
      product.moderated_at = now;
      const adminUser = { id: adminId } as User;
      product.moderated_by = adminUser;

      const savedProduct = await manager.save(Product, product);

      // Transactional outbox: ghi event 'product.moderated' cùng tx với đổi status.
      const takenDownAction = ProductModerationAction.TAKEN_DOWN;
      await this.emitProductModerated(
        manager,
        savedProduct,
        takenDownAction,
        reason,
      );

      await this.emitProductSnapshot(
        manager,
        savedProduct,
        OUTBOX_EVENT_TYPES.PRODUCT_UPDATED,
      );

      await queryRunner.commitTransaction();
      return savedProduct;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const isKnown =
        error instanceof BadRequestException ||
        error instanceof NotFoundException;
      if (isKnown) {
        throw error;
      }
      const errorPrefix = '[ProductsService.takeDown] Error:';
      console.error(errorPrefix, error);
      const serverErrorMsg = 'Đã xảy ra lỗi khi gỡ sản phẩm';
      throw new InternalServerErrorException(serverErrorMsg);
    } finally {
      await queryRunner.release();
    }
  }

  async restore(adminId: string, productId: string): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const findConditions = {
        where: { id: productId },
        relations: ['shop', 'category'],
      };
      const manager = queryRunner.manager;
      const product = await manager.findOne(Product, findConditions);
      if (!product) {
        const notFoundMsg = 'Không tìm thấy sản phẩm';
        throw new NotFoundException(notFoundMsg);
      }

      const isNotSuspended = product.status !== ProductStatus.SUSPENDED;
      if (isNotSuspended) {
        const badRequestMsg = 'Chỉ khôi phục được sản phẩm đang bị gỡ.';
        throw new BadRequestException(badRequestMsg);
      }

      product.status = ProductStatus.ACTIVE;
      product.moderation_reason = null;
      const now = new Date();
      product.moderated_at = now;
      const adminUser = { id: adminId } as User;
      product.moderated_by = adminUser;

      const savedProduct = await manager.save(Product, product);

      // Transactional outbox: báo seller sản phẩm được khôi phục (reason=null).
      const restoredAction = ProductModerationAction.RESTORED;
      const noReason = null;
      await this.emitProductModerated(
        manager,
        savedProduct,
        restoredAction,
        noReason,
      );

      await this.emitProductSnapshot(
        manager,
        savedProduct,
        OUTBOX_EVENT_TYPES.PRODUCT_UPDATED,
      );

      await queryRunner.commitTransaction();
      return savedProduct;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const isKnown =
        error instanceof BadRequestException ||
        error instanceof NotFoundException;
      if (isKnown) {
        throw error;
      }
      const errorPrefix = '[ProductsService.restore] Error:';
      console.error(errorPrefix, error);
      const serverErrorMsg = 'Đã xảy ra lỗi khi khôi phục sản phẩm';
      throw new InternalServerErrorException(serverErrorMsg);
    } finally {
      await queryRunner.release();
    }
  }

  // Ghi outbox 'product.moderated' trong cùng transaction moderation (transactional
  // outbox). Enrich sellerId để NS (DB#2, không có bảng shop) đọc thẳng từ payload —
  // mirror return.requested. Relay poll 8s sẽ publish; NS tạo notif + WS toShop cho seller.
  private async emitProductModerated(
    manager: EntityManager,
    product: Product,
    action: ProductModerationAction,
    reason: string | null,
  ): Promise<void> {
    const shopId = product.shop?.id ?? '';
    // Enrich contact seller (id + email + name) để consumer tạo notif + gửi email
    // take-down mà không tra shop/user ở DB#2. Helper chuyên trách — không nới
    // relations của query moderation. shopId rỗng (product mất shop) → contact null.
    const sellerContact = shopId
      ? await this.shopsService.getSellerContactByShopId(shopId)
      : null;

    const payload: ProductModeratedOutboxPayload = {
      productId: product.id,
      productName: product.name,
      shopId,
      sellerId: sellerContact?.id ?? null,
      sellerEmail: sellerContact?.email ?? null,
      sellerName: sellerContact?.name ?? null,
      action,
      reason,
    };
    const eventData = {
      event_type: OUTBOX_EVENT_TYPES.PRODUCT_MODERATED,
      payload,
      status: OutboxEventStatus.PENDING,
    };
    const outboxEvent = manager.create(OutboxEvent, eventData);
    await manager.save(OutboxEvent, outboxEvent);
  }

  // Ghi outbox product.created / product.updated cho search-service (Go, tuần 3+).
  // Gọi TRƯỚC commitTransaction và dùng CHÍNH manager của transaction đang mở —
  // transactional outbox: product và event cùng sống hoặc cùng chết. Ghi ngoài
  // transaction là mở đường cho index lệch DB khi commit fail.
  private async emitProductSnapshot(
    manager: EntityManager,
    product: Product,
    eventType:
      | typeof OUTBOX_EVENT_TYPES.PRODUCT_CREATED
      | typeof OUTBOX_EVENT_TYPES.PRODUCT_UPDATED,
  ): Promise<void> {
    const payload: ProductSearchSnapshotPayload = {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description ?? null,
      // Chuẩn hoá 2 chữ số thập phân: cột numeric(12,2) trả string khi load từ DB
      // ('150000.00') nhưng lúc tạo mới giá đến từ DTO là number (150000). Không
      // chuẩn hoá thì created và updated của cùng sản phẩm khác định dạng.
      price: Number(product.price).toFixed(2),
      shopId: product.shop?.id ?? '',
      categoryId: product.category?.id ?? null,
      thumbnailUrl: product.thumbnail_url ?? null,
      status: product.status,
      isHidden: product.is_hidden,
      // Guard undefined có chủ ý: @UpdateDateColumn được TypeORM gán sau save() nên
      // bình thường luôn có. Nhưng hàm này nằm TRONG transaction tạo/sửa sản phẩm —
      // ném lỗi ở đây là rollback cả sản phẩm. Thà lệch dưới một giây (dùng thời điểm
      // emit) còn hơn làm hỏng nghiệp vụ chính vì một field phục vụ quan sát.
      updatedAt: (product.updated_at ?? new Date()).toISOString(),
    };
    const eventData = {
      event_type: eventType,
      payload,
      status: OutboxEventStatus.PENDING,
    };
    const outboxEvent = manager.create(OutboxEvent, eventData);
    await manager.save(OutboxEvent, outboxEvent);
  }

  // Ghi outbox product.deleted. Chỉ mang id vì consumer chỉ cần xoá document.
  private async emitProductDeleted(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
    const payload: ProductDeletedOutboxPayload = { productId };
    const eventData = {
      event_type: OUTBOX_EVENT_TYPES.PRODUCT_DELETED,
      payload,
      status: OutboxEventStatus.PENDING,
    };
    const outboxEvent = manager.create(OutboxEvent, eventData);
    await manager.save(OutboxEvent, outboxEvent);
  }

  // Backfill toàn bộ search index: re-emit product.updated cho MỌI product chưa xoá.
  //
  // Vì sao re-emit qua outbox thay vì để search-service tự đọc DB#1: giữ nguyên
  // database-per-service và tái dùng consumer idempotent (dedup processed_events +
  // guard updated_at). Mỗi OutboxEvent mới có id (uuid) riêng → relay map thành eventId
  // mới → consumer KHÔNG skip. Product chưa có trong index đi nhánh INSERT nên guard
  // updated_at không cản. Việc index diễn ra BẤT ĐỒNG BỘ qua relay+consumer; hàm này
  // chỉ nạp event vào outbox rồi trả về số đã nạp (queued), không chờ index xong.
  async reindexSearchIndex(): Promise<{ queued: number }> {
    if (this.reindexInProgress) {
      throw new ConflictException('Reindex đang chạy, thử lại sau.');
    }
    this.reindexInProgress = true;
    try {
      const pageSize = 200;
      let skip = 0;
      let queued = 0;

      for (;;) {
        // PHẢI load kèm shop + category: emitProductSnapshot đọc product.shop?.id và
        // product.category?.id — thiếu relations thì payload mất shopId/categoryId.
        const products = await this.productsRepository.find({
          where: { status: Not(ProductStatus.DELETED) },
          relations: ['shop', 'category'],
          order: { id: 'ASC' },
          skip,
          take: pageSize,
        });
        if (products.length === 0) {
          break;
        }

        // Mỗi trang là 1 transaction: các OutboxEvent của trang cùng sống hoặc cùng
        // chết. Không gộp tất cả vào 1 transaction để tránh giữ tx quá lâu khi số
        // product lớn dần.
        await this.dataSource.transaction(async (manager) => {
          for (const product of products) {
            await this.emitProductSnapshot(
              manager,
              product,
              OUTBOX_EVENT_TYPES.PRODUCT_UPDATED,
            );
          }
        });

        queued += products.length;
        skip += pageSize;
      }

      return { queued };
    } finally {
      this.reindexInProgress = false;
    }
  }

  // ==========================================
  // II. READ SERVICES
  // ==========================================

  // Dispatcher: dùng search-service (two-stage) khi flag ON + có từ khoá q; còn lại giữ path DB cũ.
  // Khi browse (không q) mà flag ON → poke proactive để đánh thức search-service trước lúc khách gõ.
  async findAll(
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    const hasKeyword = !!query.q && query.q.trim().length > 0;
    if (this.searchClient.isEnabled()) {
      if (hasKeyword) {
        const viaSearch = await this.findAllViaSearchService(query);
        // null = search-service không dùng được → fallback đường DB cũ.
        if (viaSearch) {
          return viaSearch;
        }
      } else {
        // Browse toàn sàn → đánh thức trước (throttle 10' lo phần gọi quá dày).
        this.searchWarmup.warm();
      }
    }
    return this.findAllViaDatabase(query);
  }

  /**
   * Two-stage retrieval:
   *   Stage 1 — index trả top-K product ID đã xếp hạng relevance.
   *   Stage 2 — DB#1 là source-of-truth: lọc volatile (shop.status/rating) + sort + phân trang.
   *   Stage 3 — hydrate đầy đủ cho đúng 1 trang.
   * Trả null nếu search-service lỗi/timeout → caller fallback ILIKE.
   */
  private async findAllViaSearchService(
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product> | null> {
    let { min_price, max_price } = query;
    [min_price, max_price] = normalizePriceRange(min_price, max_price);

    // Bung subtree category ở monolith (index chỉ khớp id chính xác) rồi truyền CSV.
    let categoryIds: string[] | undefined;
    if (query.category_id) {
      categoryIds = await this.resolveCategoryIds(query.category_id);
    }

    // Stage 1: lấy candidate đã xếp hạng.
    const candidates = await this.searchClient.fetchCandidates({
      q: (query.q as string).trim(),
      minPrice: min_price,
      maxPrice: max_price,
      categoryIds,
    });
    if (candidates === null) {
      // Reactive: search-service lỗi/ngủ → đánh thức cho cú search sau ấm. Rồi báo caller fallback.
      this.searchWarmup.warm();
      return null;
    }
    if (candidates.length === 0) {
      return this.emptyPage(query); // rỗng hợp lệ → KHÔNG fallback
    }

    // Stage 2a: lọc AUTHORITATIVE toàn sàn trên DB#1. Chỉ lấy cột phục vụ lọc/sort.
    const candidateIds = candidates.map((c) => c.productId);
    const filterQb = this.productsRepository
      .createQueryBuilder('product')
      .innerJoin('product.shop', 'shop')
      .select([
        'product.id',
        'product.price',
        'product.name',
        'product.created_at',
        'product.avg_rating',
        'product.is_featured',
        'product.is_out_of_stock',
      ])
      .where('product.id IN (:...candidateIds)', { candidateIds })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere('product.is_hidden = :isHidden', { isHidden: false })
      .andWhere('shop.status = :shopStatus', {
        shopStatus: AccountStatus.ACTIVE,
      });

    if (query.rating) {
      filterQb.andWhere('product.avg_rating >= :rating', {
        rating: query.rating,
      });
    }

    // Stage 2b/2c/3: đuôi chung.
    return this.rankSortPaginateHydrate(filterQb, candidates, query);
  }

  /**
   * Đuôi chung của two-stage cho cả tìm toàn sàn lẫn tìm trong 1 shop: nhận filterQb đã lọc
   * AUTHORITATIVE (stage 2a) + candidate đã xếp hạng, rồi xếp thứ tự (2b) + phân trang thật (2c)
   * + hydrate đầy đủ 1 trang (stage 3). Tách để 2 lối vào khỏi lặp; phần dựng filterQb (khác nhau
   * giữa toàn-sàn và scope-shop) mỗi hàm tự lo.
   */
  private async rankSortPaginateHydrate(
    filterQb: SelectQueryBuilder<Product>,
    candidates: SearchCandidate[],
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    // Map id → vị trí rank để giữ thứ tự relevance khi sort mặc định.
    const rankPosition = new Map<string, number>();
    candidates.forEach((c, idx) => rankPosition.set(c.productId, idx));

    // Stage 2b: xếp thứ tự. Hàng hết luôn xuống cuối (khớp findAll cũ).
    const allowedSortFields = [
      'price',
      'created_at',
      'name',
      'avg_rating',
      'is_featured',
    ];
    const useCustomSort =
      !!query.sort && allowedSortFields.includes(query.sort);

    let ordered: Product[];
    if (useCustomSort) {
      // Sort tuỳ chọn trong SQL: Postgres biết kiểu cột (decimal/date) nên so sánh đúng;
      // làm ở JS thì price/avg_rating là string → sort chuỗi sai.
      filterQb.orderBy('product.is_out_of_stock', 'ASC');
      filterQb.addOrderBy(
        `product.${query.sort as string}`,
        query.order === 'ASC' ? 'ASC' : 'DESC',
      );
      ordered = await filterQb.getMany();
    } else {
      // Sort mặc định = giữ thứ tự rank relevance từ index. Làm ở JS bằng rankPosition
      // (số nguyên, không dính lỗi kiểu). KHÔNG dùng skip/take → không kích hoạt
      // subquery-distinct của TypeORM (cái kẹt với biểu thức thô trong ORDER BY).
      const rows = await filterQb.getMany();
      ordered = rows.sort((a, b) => {
        if (a.is_out_of_stock !== b.is_out_of_stock) {
          return a.is_out_of_stock ? 1 : -1;
        }
        const ra = rankPosition.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rankPosition.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
    }

    // Stage 2c: phân trang THẬT ở monolith → total chính xác trong cửa sổ candidate.
    const page = query.page || PAGINATION_LIMITS.DEFAULT_PAGE;
    const limit = query.limit || PAGINATION_LIMITS.DEFAULT_LIMIT;
    const totalItems = ordered.length;
    const start = (page - 1) * limit;
    const pageItems = ordered.slice(start, start + limit);

    const result: PaginatedResponseDto<Product> = {
      items: pageItems,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };

    // Stage 3: hydrate đầy đủ (shop/category/variants) cho đúng 1 trang — tái dùng hàm cũ,
    // nó cũng xếp lại items theo đúng thứ tự id đã phân trang.
    await this.hydrateProductPage(result, ['shop', 'category', 'variants'], {
      shop: { id: true, name: true, logo_url: true },
    });

    return result;
  }

  /**
   * Two-stage cho catalog 1 shop (`/products/shop/:id?q=`). Như findAllViaSearchService nhưng
   * scope theo shopId: truyền vào index (stage 1) VÀ lọc lại `shop.id` ở stage 2a (authoritative,
   * phòng thủ). Trả null nếu search-service lỗi/timeout → caller fallback ILIKE.
   */
  private async findShopCatalogViaSearchService(
    shopId: string,
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product> | null> {
    let { min_price, max_price } = query;
    [min_price, max_price] = normalizePriceRange(min_price, max_price);

    let categoryIds: string[] | undefined;
    if (query.category_id) {
      categoryIds = await this.resolveCategoryIds(query.category_id);
    }

    // Stage 1: candidate đã xếp hạng, scope theo shop ngay ở index.
    const candidates = await this.searchClient.fetchCandidates({
      q: (query.q as string).trim(),
      minPrice: min_price,
      maxPrice: max_price,
      shopId,
      categoryIds,
    });
    if (candidates === null) {
      this.searchWarmup.warm();
      return null;
    }
    if (candidates.length === 0) {
      return this.emptyPage(query);
    }

    // Stage 2a: lọc AUTHORITATIVE + ràng buộc shop.id (phòng thủ, index đã scope nhưng DB#1 là nguồn).
    const candidateIds = candidates.map((c) => c.productId);
    const filterQb = this.productsRepository
      .createQueryBuilder('product')
      .innerJoin('product.shop', 'shop')
      .select([
        'product.id',
        'product.price',
        'product.name',
        'product.created_at',
        'product.avg_rating',
        'product.is_featured',
        'product.is_out_of_stock',
      ])
      .where('product.id IN (:...candidateIds)', { candidateIds })
      .andWhere('shop.id = :shopId', { shopId })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere('product.is_hidden = :isHidden', { isHidden: false })
      .andWhere('shop.status = :shopStatus', {
        shopStatus: AccountStatus.ACTIVE,
      });

    if (query.rating) {
      filterQb.andWhere('product.avg_rating >= :rating', {
        rating: query.rating,
      });
    }

    return this.rankSortPaginateHydrate(filterQb, candidates, query);
  }

  // Trang rỗng đúng envelope (kết quả search rỗng hợp lệ, không phải lỗi).
  private emptyPage(query: GetProductsQueryDto): PaginatedResponseDto<Product> {
    const page = query.page || PAGINATION_LIMITS.DEFAULT_PAGE;
    const limit = query.limit || PAGINATION_LIMITS.DEFAULT_LIMIT;
    return {
      items: [],
      meta: { page, limit, totalItems: 0, totalPages: 0 },
    };
  }

  // Đường DB gốc (ILIKE) — dùng khi flag OFF, không có q, hoặc search-service lỗi (fallback).
  private async findAllViaDatabase(
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    let { min_price, max_price, q, category_id, sort, order = 'DESC' } = query;

    // 1. Chốt chặn bảo mật tự động đảo ngược khoảng giá (Graceful Fallback)
    [min_price, max_price] = normalizePriceRange(min_price, max_price);

    // Tối ưu: Dùng innerJoin với shop vì product bắt buộc phải thuộc về một shop cố định
    const productAlias = 'product';
    const shopAlias = 'shop';
    const shopJoinProperty = 'product.shop';

    const queryBuilder = this.productsRepository
      .createQueryBuilder(productAlias)
      .innerJoin(shopJoinProperty, shopAlias);

    // 2. Chốt chặn bảo mật đa tầng: Chỉ lấy sản phẩm ACTIVE và shop đang ACTIVE
    queryBuilder.andWhere('product.status = :productStatus', {
      productStatus: ProductStatus.ACTIVE,
    });
    queryBuilder.andWhere('product.is_hidden = :isHidden', { isHidden: false });
    queryBuilder.andWhere('shop.status = :shopStatus', {
      shopStatus: AccountStatus.ACTIVE,
    });

    // 3. Phân giải danh mục thông minh (Tối ưu: Chỉ leftJoin khi thực sự cần lọc danh mục)
    if (category_id) {
      const categoryJoinProperty = 'product.category';
      const categoryAlias = 'category';
      queryBuilder.leftJoin(categoryJoinProperty, categoryAlias);

      const categoryIds = await this.resolveCategoryIds(category_id);
      const isCategoryIdsValid = categoryIds && categoryIds.length > 0;
      if (isCategoryIdsValid) {
        queryBuilder.andWhere('category.id IN (:...categoryIds)', {
          categoryIds,
        });
      } else {
        queryBuilder.andWhere('1 = 0'); // Chốt chặn an toàn tuyệt đối chống sập SQL IN () rỗng
      }
    }

    // 4. Tìm kiếm từ khóa q không sợ rớt dấu tiếng Việt (VÁ LỖI GHI ĐÈ THAM SỐ)
    if (q) {
      // Đăng ký tham số an toàn trực tiếp vào scope queryBuilder tối cao
      queryBuilder.setParameter('searchQuery', `%${q}%`);

      const searchBrackets = new Brackets((qb) => {
        qb.where('product.name ILIKE :searchQuery').orWhere(
          'product.description ILIKE :searchQuery',
        );
      });
      queryBuilder.andWhere(searchBrackets);
    }

    // 5. Áp dụng logic lọc khoảng giá thông qua helper toàn cục (Tự động ghim parameter cực an toàn)
    this.applyPriceFilter(queryBuilder, min_price, max_price);

    // Lọc theo điểm đánh giá trung bình (từ X sao trở lên).
    if (query.rating) {
      queryBuilder.andWhere('product.avg_rating >= :rating', {
        rating: query.rating,
      });
    }

    // 6. Sắp xếp mặc định hoặc theo trường được yêu cầu an toàn chống SQL Injection
    const allowedSortFields = [
      'price',
      'created_at',
      'name',
      'avg_rating',
      'is_featured',
    ];
    const isSortAllowed = sort && allowedSortFields.includes(sort);
    const sortField = isSortAllowed ? sort : 'created_at';
    const sortPath = `product.${sortField}`;

    // Hàng hết luôn xuống CUỐI, bất kể người dùng chọn sắp xếp gì. Không ẩn hẳn vì
    // ẩn sẽ mất SEO của trang sản phẩm đã được index, và khách đang tìm đúng món đó
    // sẽ tưởng shop không bán (Shopee cũng đánh dấu + hạ ưu tiên chứ không ẩn).
    // Postgres xếp false < true nên `is_out_of_stock = false` (còn hàng) lên trước.
    // Dùng cột generated đã map, KHÔNG dùng biểu thức thô: TypeORM phân trang bằng subquery
    // distinct và tra metadata cột cho từng mục ORDER BY, gặp biểu thức thô sẽ ném lỗi.
    queryBuilder.orderBy('product.is_out_of_stock', 'ASC');
    queryBuilder.addOrderBy(sortPath, order);

    // Phân trang ID tốc độ cao (Zero-latency Count)
    const result = await paginate<Product>(queryBuilder, query);

    // Giai đoạn 2 (Hydration): Nạp đầy đủ mảng biến thể, ảnh cho mảng items thu gọn (10-20 sản phẩm)
    await this.hydrateProductPage(result, ['shop', 'category', 'variants'], {
      shop: { id: true, name: true, logo_url: true },
    });

    return result;
  }

  // Dispatcher catalog 1 shop: check shop trước; flag ON + có q → two-stage scope shop, null → ILIKE.
  // Browse trong shop (không q) + flag ON → poke proactive.
  async getPublicCatalogByShop(
    shopId: string,
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    // Kiểm tra shop có tồn tại và đang hoạt động (ACTIVE) hay không
    const isPublicShop = true;
    const shop = await this.shopsService.findOneByShopId(shopId, isPublicShop);

    const hasKeyword = !!query.q && query.q.trim().length > 0;
    if (this.searchClient.isEnabled()) {
      if (hasKeyword) {
        const viaSearch = await this.findShopCatalogViaSearchService(
          shop.id,
          query,
        );
        if (viaSearch) {
          return viaSearch;
        }
      } else {
        this.searchWarmup.warm();
      }
    }
    return this.getShopCatalogViaDatabase(shop.id, query);
  }

  // Đường DB gốc (ILIKE) cho catalog 1 shop — fallback khi flag OFF / không q / search-service lỗi.
  // Nhận shop.id đã resolve ở dispatcher (thân cũ chỉ dùng shop.id nên khỏi truyền cả entity Shop).
  private async getShopCatalogViaDatabase(
    shopId: string,
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    let { min_price, max_price, q, category_id, sort, order = 'DESC' } = query;

    // 1. Chốt chặn bảo mật tự động đảo ngược khoảng giá (Graceful Fallback)
    [min_price, max_price] = normalizePriceRange(min_price, max_price);

    // Tối ưu: Dùng innerJoin với shop vì catalog bắt buộc phải thuộc về chính shop này
    const productAlias = 'product';
    const shopAlias = 'shop';
    const shopJoinProperty = 'product.shop';

    const queryBuilder = this.productsRepository
      .createQueryBuilder(productAlias)
      .innerJoin(shopJoinProperty, shopAlias);

    // Lọc theo Shop và các điều kiện hiển thị Public đối với Customer
    queryBuilder.where('product.shop.id = :shopId', { shopId });
    queryBuilder.andWhere('product.status = :productStatus', {
      productStatus: ProductStatus.ACTIVE,
    });
    queryBuilder.andWhere('product.is_hidden = :isHidden', { isHidden: false });
    queryBuilder.andWhere('shop.status = :shopStatus', {
      shopStatus: AccountStatus.ACTIVE,
    });

    // Tối ưu: Chỉ Join khi thực sự cần lọc danh mục
    if (category_id) {
      const categoryJoinProperty = 'product.category';
      const categoryAlias = 'category';
      queryBuilder.leftJoin(categoryJoinProperty, categoryAlias);

      const categoryIds = await this.resolveCategoryIds(category_id);
      const isCategoryIdsValid = categoryIds && categoryIds.length > 0;
      if (isCategoryIdsValid) {
        queryBuilder.andWhere('category.id IN (:...categoryIds)', {
          categoryIds,
        });
      } else {
        queryBuilder.andWhere('1 = 0');
      }
    }

    // Tìm kiếm từ khóa q trong catalog (VÁ LỖI GHI ĐÈ THAM SỐ)
    if (q) {
      // Ghim tham số tập trung tại scope chính chống rơi rụng parameters
      queryBuilder.setParameter('searchQuery', `%${q}%`);

      const searchBrackets = new Brackets((qb) => {
        qb.where('product.name ILIKE :searchQuery').orWhere(
          'product.description ILIKE :searchQuery',
        );
      });
      queryBuilder.andWhere(searchBrackets);
    }

    // Lọc khoảng giá qua helper toàn cục
    this.applyPriceFilter(queryBuilder, min_price, max_price);

    // Lọc theo điểm đánh giá trung bình (từ X sao trở lên).
    if (query.rating) {
      queryBuilder.andWhere('product.avg_rating >= :rating', {
        rating: query.rating,
      });
    }

    // Sắp xếp
    const allowedSortFields = [
      'price',
      'created_at',
      'name',
      'avg_rating',
      'is_featured',
    ];
    const isSortAllowed = sort && allowedSortFields.includes(sort);
    const sortField = isSortAllowed ? sort : 'created_at';
    const sortPath = `product.${sortField}`;
    queryBuilder.orderBy(sortPath, order);

    // Thực hiện phân trang an toàn
    const result = await paginate<Product>(queryBuilder, query);

    // Giai đoạn 2 (Hydration): Nạp đầy đủ mảng variants và thông tin UI an toàn của shop
    await this.hydrateProductPage(result, ['shop', 'category', 'variants'], {
      shop: { id: true, name: true, logo_url: true },
    });

    return result;
  }

  async getSellerInventory(
    userId: string,
    query: GetSellerProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    const shop = await this.shopsService.findOneByUserId(userId);
    const { q, is_hidden, stock_status, sort, order = 'DESC' } = query;

    const productAlias = 'product';
    const shopAlias = 'shop';
    const shopJoinProperty = 'product.shop';

    const queryBuilder = this.productsRepository
      .createQueryBuilder(productAlias)
      .innerJoin(shopJoinProperty, shopAlias) // Tối ưu: Dùng innerJoin vì sản phẩm luôn thuộc về 1 shop cố định
      .where('product.shop.id = :shopId', { shopId: shop.id })
      .andWhere('product.status != :deletedStatus', {
        deletedStatus: ProductStatus.DELETED, // Loại bỏ hoàn toàn hàng đã xóa mềm
      });

    // Lọc theo trạng thái ẩn/hiện (is_hidden)
    if (is_hidden !== undefined) {
      queryBuilder.andWhere('product.is_hidden = :isHidden', {
        isHidden: is_hidden,
      });
    }

    // Lọc theo trạng thái tồn kho (stock_status)
    if (stock_status === 'in_stock') {
      queryBuilder.andWhere('product.stock_quantity > 0');
    } else if (stock_status === 'out_of_stock') {
      queryBuilder.andWhere('product.stock_quantity = 0');
    }

    // Bộ lọc Tìm kiếm thông minh bằng EXISTS Sub-query
    if (q) {
      // VÁ LỖI: Dùng setParameter riêng lẻ để không ghi đè mất shopId và deletedStatus
      queryBuilder.setParameter('searchName', `%${q}%`);
      queryBuilder.setParameter('searchSku', `%${q}%`);
      queryBuilder.setParameter('searchVariantSku', `%${q}%`);

      const searchBrackets = new Brackets((qb) => {
        qb.where('product.name ILIKE :searchName');
        qb.orWhere('product.sku ILIKE :searchSku');

        const existsCallback = (subQb: any) => {
          const subQuery = subQb
            .subQuery()
            .select('1')
            .from(ProductVariant, 'v')
            .where('v.product_id = product.id')
            .andWhere('v.sku ILIKE :searchVariantSku');

          return `EXISTS (${subQuery.getQuery()})`;
        };
        qb.orWhere(existsCallback);
      });
      queryBuilder.andWhere(searchBrackets);
    }

    // Sắp xếp dữ liệu đầu ra an toàn chống SQL Injection
    const allowedSortFields = ['price', 'created_at', 'name', 'stock_quantity'];
    const isSortAllowed = sort && allowedSortFields.includes(sort);
    const sortField = isSortAllowed ? sort : 'created_at';
    const sortPath = `product.${sortField}`;
    queryBuilder.orderBy(sortPath, order);

    // Tiến hành phân trang tốc độ cao dựa trên tập ID thô công khai
    const result = await paginate<Product>(queryBuilder, query);

    // Giai đoạn 2 (Hydration): Nạp đầy đủ mảng variants và category cho tập kết quả rút gọn (10 - 20 items)
    await this.hydrateProductPage(result, ['category', 'variants']);

    return result;
  }

  // Bơm ảnh biến thể từ color_groups[color].images theo attributes.color (giữ contract
  // variant.images). Legacy (color_groups null / màu thiếu) → giữ variant.images cũ.
  // Áp ở MỌI read site serialize variant.images (findOne detail + hydrateProductPage list).
  private resolveVariantImages(product: Product): void {
    const groups = product.color_groups || {};
    if (!product.variants) return;
    for (const v of product.variants) {
      const color = v.attributes?.color;
      const imgs = color ? groups[color]?.images : null;
      const fromColor = imgs?.length ? imgs : null;
      v.images = fromColor ?? v.images ?? [];
    }
  }

  async findOne(id: string, isPublic?: boolean) {
    const realId = extractId(id);
    const whereCondition: any = { id: realId };

    if (isPublic) {
      whereCondition.status = ProductStatus.ACTIVE;
      whereCondition.is_hidden = false; // Khách hàng không được xem sản phẩm ẩn

      const activeShopStatus = { status: AccountStatus.ACTIVE };
      whereCondition.shop = activeShopStatus;
    }

    const relationsList = ['shop', 'category', 'variants'];
    const findConditions = {
      where: whereCondition,
      relations: relationsList,
    };

    const product = await this.productsRepository.findOne(findConditions);

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    // Bơm variant.images từ color_groups TRƯỚC khi gộp aggregated_gallery.
    this.resolveVariantImages(product);

    // Tạo Aggregated Gallery (Bộ sưu tập ảnh tổng hợp)
    const galleryUrls = product.gallery || [];
    const aggregated_gallery = [product.thumbnail_url, ...galleryUrls];

    // Gộp thêm toàn bộ ảnh của các biến thể vào gallery chung
    const hasVariantsList = product.variants && product.variants.length > 0;
    if (hasVariantsList) {
      const mergeImagesFn = (v: ProductVariant) => {
        const hasImages = v.images && v.images.length > 0;
        if (hasImages) {
          aggregated_gallery.push(...v.images);
        }
      };
      product.variants.forEach(mergeImagesFn);
    }

    const filterTruthy = Boolean;
    const filteredGallery = aggregated_gallery.filter(filterTruthy);
    const uniqueGallery = new Set(filteredGallery);
    const finalGallery = [...uniqueGallery];

    const result = {
      ...product,
      // Loại bỏ ảnh trùng và lọc các giá trị null/undefined
      aggregated_gallery: finalGallery,
    };

    return result;
  }

  async findOneForSeller(id: string, userId: string) {
    const shop = await this.shopsService.findOneByUserId(userId);

    const isPublicQuery = false;
    const product = await this.findOne(id, isPublicQuery); // Lấy chi tiết sản phẩm (bao gồm cả sản phẩm ẩn)

    const isNotOwner = product.shop.id !== shop.id;
    if (isNotOwner) {
      const accessDeniedMsg =
        'Yêu cầu bị từ chối do bạn không có quyền sở hữu sản phẩm này';
      throw new BadRequestException(accessDeniedMsg);
    }
    return product;
  }

  // ==========================================
  // III. UPDATE SERVICE
  // ==========================================

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    files: {
      thumbnail?: Express.Multer.File[];
      general_gallery?: Express.Multer.File[];
      variant_images?: Express.Multer.File[];
      color_images?: Express.Multer.File[];
    },
    user: IUser,
  ) {
    const realId = extractId(id);

    // Tìm sản phẩm và kiểm tra quyền sở hữu
    const product = await this.findProductEntityOrFail(realId, [
      'shop',
      'category',
      'variants',
    ]);

    // Seller KHÔNG được đụng sản phẩm đang bị admin gỡ.
    const isSuspended = product.status === ProductStatus.SUSPENDED;
    if (isSuspended) {
      const errorMsg =
        'Sản phẩm đang bị gỡ do vi phạm — liên hệ quản trị viên để khôi phục.';
      throw new ForbiddenException(errorMsg);
    }

    // Seller KHÔNG được tự đặt trạng thái "bị gỡ" (chỉ admin qua moderation).
    const isDtoStatusSuspended =
      updateProductDto.status === ProductStatus.SUSPENDED;
    if (isDtoStatusSuspended) {
      const selfSuspendMsg = 'Không thể tự đặt trạng thái "bị gỡ".';
      throw new ForbiddenException(selfSuspendMsg);
    }

    // Kiểm tra shop của user yêu cầu cập nhật sản phẩm còn đang ở trạng thái ACTIVE không
    const shop = await this.shopsService.findOneByUserId(user.sub);
    const isShopInactive = shop.status !== AccountStatus.ACTIVE;
    if (isShopInactive) {
      const shopInactiveMsg =
        'Cửa hàng hiện đang trong trạng thái bị khóa hoặc chưa được kích hoạt';
      throw new BadRequestException(shopInactiveMsg);
    }

    const isNotOwner = product.shop.id !== shop.id;
    if (isNotOwner) {
      const accessDeniedMsg =
        'Yêu cầu bị từ chối do bạn không có quyền sở hữu sản phẩm này';
      throw new BadRequestException(accessDeniedMsg);
    }

    // Bắt đầu Transaction để cập nhật
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const oldPublicIdsToDelete: string[] = [];
    const uploadedAssets: { id: string; public_id: string }[] = [];

    try {
      // Xử lý Ảnh Thumbnail mới
      const thumbnailFile = files.thumbnail?.[0];
      if (thumbnailFile) {
        // Tìm MediaAsset cũ của thumbnail bằng chính URL hiện tại của nó để đảm bảo chính xác 100%
        let oldThumbnailAsset: MediaAsset | null = null;
        const currentThumbnailUrl = product.thumbnail_url;
        if (currentThumbnailUrl) {
          const findOldThumbConditions = {
            where: { url: currentThumbnailUrl },
          };
          oldThumbnailAsset = await queryRunner.manager.findOne(
            MediaAsset,
            findOldThumbConditions,
          );
        }

        const thumbnailFolder = CLOUDINARY_FOLDER.PRODUCT_THUMBNAILS;
        const userSub = user.sub;
        const assetTypeThumbnail = AssetType.PRODUCT_THUMBNAIL;
        const shopId = shop.id;

        const uploadResult = await this.cloudinaryService.uploadFile(
          thumbnailFile,
          thumbnailFolder,
          userSub,
          assetTypeThumbnail,
          shopId,
          uploadedAssets,
        );
        product.thumbnail_url = uploadResult.url;

        if (oldThumbnailAsset) {
          oldPublicIdsToDelete.push(oldThumbnailAsset.public_id);
          // Xóa bản ghi cũ trong DB vì uploadFile đã tạo bản ghi mới rồi
          await queryRunner.manager.remove(MediaAsset, oldThumbnailAsset);
        }
      }

      // Xử lý General Gallery (Sync Mechanism)
      const hasGalleryUpdate =
        updateProductDto.existingGalleryImages !== undefined ||
        (files.general_gallery && files.general_gallery.length > 0);

      if (hasGalleryUpdate) {
        const productGallery = product.gallery || [];
        const existingImages =
          updateProductDto.existingGalleryImages ?? productGallery;

        // Tìm các ảnh bị xóa bởi user và đưa vào thùng rác
        const isImageDeleted = (url: string) => !existingImages.includes(url);
        const imagesDeletedByUser = productGallery.filter(isImageDeleted);

        for (const url of imagesDeletedByUser) {
          const asset = await this.cloudinaryService.findAssetByUrl(url);
          if (asset) {
            oldPublicIdsToDelete.push(asset.public_id);
            await queryRunner.manager.remove(MediaAsset, asset);
          }
        }

        // Xử lý ảnh mới
        const generalGalleryFiles = files.general_gallery;
        const galleryFolder = CLOUDINARY_FOLDER.PRODUCT_GALLERY;
        const userSub = user.sub;
        const assetTypeGallery = AssetType.PRODUCT_GALLERY;
        const shopId = shop.id;

        const newUploadedAssets =
          await this.cloudinaryService.uploadMultipleFiles(
            generalGalleryFiles,
            galleryFolder,
            userSub,
            assetTypeGallery,
            shopId,
            uploadedAssets,
          );
        const mapUrlFn = (asset: { url: string }) => asset.url;
        const newUploadedUrls = newUploadedAssets.map(mapUrlFn);

        // Kiểm tra giới hạn ảnh
        const totalImagesCount = existingImages.length + newUploadedUrls.length;
        const isLimitExceeded =
          totalImagesCount > UPLOAD_LIMITS.PRODUCT.MAX_GALLERY_IMAGES;
        if (isLimitExceeded) {
          const limitMsg = `Số lượng ảnh trong bộ sưu tập vượt quá giới hạn (tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_GALLERY_IMAGES} ảnh). Hiện có ${existingImages.length} ảnh cũ và ${newUploadedUrls.length} ảnh mới được tải lên.`;
          throw new BadRequestException(limitMsg);
        }

        // Gộp ảnh
        product.gallery = [...existingImages, ...newUploadedUrls];
      }

      // Cập nhật các trường cơ bản
      if (updateProductDto.name) {
        product.name = updateProductDto.name;
        product.slug = generateSlug(updateProductDto.name);
      }
      if (updateProductDto.description !== undefined) {
        product.description = updateProductDto.description;
      }
      if (updateProductDto.price) {
        product.price = updateProductDto.price;
      }
      if (updateProductDto.sku !== undefined) {
        product.sku = updateProductDto.sku;
      }
      if (updateProductDto.weight !== undefined) {
        product.weight = updateProductDto.weight;
      }
      if (updateProductDto.length !== undefined) {
        product.length = updateProductDto.length;
      }
      if (updateProductDto.width !== undefined) {
        product.width = updateProductDto.width;
      }
      if (updateProductDto.height !== undefined) {
        product.height = updateProductDto.height;
      }
      if (updateProductDto.status !== undefined) {
        product.status = updateProductDto.status;
      }
      if (updateProductDto.is_hidden !== undefined) {
        product.is_hidden = updateProductDto.is_hidden;
      }

      const isHasVariantsDtoDefined =
        updateProductDto.has_variants !== undefined;
      if (isHasVariantsDtoDefined) {
        // Nếu user muốn hủy trạng thái có biến thể (true -> false)
        const isTransitionToNoVariants =
          updateProductDto.has_variants === false &&
          product.has_variants === true;

        if (isTransitionToNoVariants) {
          // Bắt buộc nhập price và stock_quantity
          const isPriceOrStockMissing =
            updateProductDto.price === undefined ||
            updateProductDto.stock_quantity === undefined;

          if (isPriceOrStockMissing) {
            const missingFieldsMsg =
              'Khi chuyển từ sản phẩm có biến thể sang không có biến thể, bạn bắt buộc phải nhập giá (price) và số lượng tồn kho (stock_quantity) cho sản phẩm gốc.';
            throw new BadRequestException(missingFieldsMsg);
          }

          // Dọn dẹp tất cả biến thể cũ
          const findOldVariantsConditions = {
            where: { product: { id: product.id } },
          };
          const oldVariants = await queryRunner.manager.find(
            ProductVariant,
            findOldVariantsConditions,
          );

          for (const variant of oldVariants) {
            const hasVariantImages =
              variant.images && variant.images.length > 0;
            if (hasVariantImages) {
              for (const url of variant.images) {
                const asset = await this.cloudinaryService.findAssetByUrl(url);
                if (asset) {
                  oldPublicIdsToDelete.push(asset.public_id);
                  await queryRunner.manager.remove(MediaAsset, asset);
                }
              }
            }
            await queryRunner.manager.remove(ProductVariant, variant);
          }
          product.variants = [];

          // Dọn ảnh gom theo màu (color_groups) khi bỏ biến thể → tránh rác asset.
          const colorUrlsToDelete = Object.values(
            product.color_groups || {},
          ).flatMap((g) => g.images);
          for (const url of colorUrlsToDelete) {
            const asset = await this.cloudinaryService.findAssetByUrl(url);
            if (asset) {
              oldPublicIdsToDelete.push(asset.public_id);
              await queryRunner.manager.remove(MediaAsset, asset);
            }
          }
          product.color_groups = null;
        }
        product.has_variants = updateProductDto.has_variants!;
      }

      const isStockQuantityDtoDefined =
        updateProductDto.stock_quantity !== undefined;
      if (isStockQuantityDtoDefined) {
        if (product.has_variants) {
          const variantStockMsg =
            'Không được phép cập nhật tồn kho của sản phẩm gốc khi sản phẩm có biến thể. Vui lòng cập nhật tồn kho ở từng biến thể.';
          throw new BadRequestException(variantStockMsg);
        }
        product.stock_quantity = updateProductDto.stock_quantity!;
      }

      if (updateProductDto.category_id) {
        const leafCategoryId = updateProductDto.category_id;
        product.category =
          await this.categoriesService.validateLeafCategory(leafCategoryId);
      }

      // Model màu: dựng color_groups mới (hex + existing giữ lại + upload mới),
      // xóa asset của URL cũ không còn được giữ. usingColorModel = FE gửi mảng colorImages.
      const usingColorModel = Array.isArray(updateProductDto.colorImages);
      let newColorGroupsMap: Record<
        string,
        { hex: string | null; images: string[] }
      > | null = null;
      if (usingColorModel) {
        newColorGroupsMap = {};
        const oldColorGroups = product.color_groups || {};
        // URL cũ còn được giữ (union existingImages mọi màu) để tính ảnh bị xóa.
        const keptUrls = new Set<string>();
        updateProductDto.colorImages!.forEach((g) =>
          (g.existingImages || []).forEach((u) => keptUrls.add(u)),
        );
        // Xóa asset của URL cũ không còn giữ.
        const allOldUrls = Object.values(oldColorGroups).flatMap(
          (g) => g.images,
        );
        for (const url of allOldUrls) {
          if (!keptUrls.has(url)) {
            const asset = await this.cloudinaryService.findAssetByUrl(url);
            if (asset) {
              oldPublicIdsToDelete.push(asset.public_id);
              await queryRunner.manager.remove(MediaAsset, asset);
            }
          }
        }
        // Upload ảnh mới theo màu (thứ tự khớp file color_images) + gộp existing.
        let colorOffset = 0;
        for (const group of updateProductDto.colorImages!) {
          const cnt = group.imageCount || 0;
          let newUrls: string[] = [];
          if (cnt > 0 && files.color_images) {
            const groupFiles = files.color_images.slice(
              colorOffset,
              colorOffset + cnt,
            );
            colorOffset += cnt;
            const groupAssets =
              await this.cloudinaryService.uploadMultipleFiles(
                groupFiles,
                CLOUDINARY_FOLDER.PRODUCT_VARIANTS,
                user.sub,
                AssetType.PRODUCT_VARIANT_IMAGE,
                shop.id,
                uploadedAssets,
              );
            newUrls = groupAssets.map((a) => a.url);
          }
          newColorGroupsMap[group.color] = {
            hex: group.hex ?? null,
            images: [...(group.existingImages || []), ...newUrls],
          };
        }
      }

      // Xử lý Biến thể (Variants) - Chỉ thực hiện nếu sản phẩm có trạng thái có biến thể
      const isVariantsListUpdate =
        updateProductDto.variants && product.has_variants;
      if (isVariantsListUpdate) {
        const findOldVariantsConditions = {
          where: { product: { id: product.id } },
        };
        const oldVariants = await queryRunner.manager.find(
          ProductVariant,
          findOldVariantsConditions,
        );

        const mapIncomingIdFn = (variant: { id?: string }) => variant.id;
        const incomingIds = updateProductDto
          .variants!.map(mapIncomingIdFn)
          .filter(Boolean);

        // Tìm và xóa các biến thể cũ không còn tồn tại trong request
        const isOldVariantDeleted = (variant: ProductVariant) =>
          !incomingIds.includes(variant.id);
        const variantsToDelete = oldVariants.filter(isOldVariantDeleted);

        for (const variantToDelete of variantsToDelete) {
          // Model màu: variant.images KHÔNG còn authoritative (ảnh ở color_groups) →
          // KHÔNG xóa asset theo variant.images. Với sp legacy các URL này đã được
          // migrate vào color_groups.existingImages; xóa ở đây sẽ phá ảnh vừa giữ.
          const hasImagesToDelete =
            !usingColorModel &&
            variantToDelete.images &&
            variantToDelete.images.length > 0;
          if (hasImagesToDelete) {
            for (const url of variantToDelete.images) {
              const asset = await this.cloudinaryService.findAssetByUrl(url);
              if (asset) {
                oldPublicIdsToDelete.push(asset.public_id);
                await queryRunner.manager.remove(MediaAsset, asset);
              }
            }
          }
          await queryRunner.manager.remove(ProductVariant, variantToDelete);
        }

        let imageOffset = 0;
        const variantsToSave: ProductVariant[] = [];

        // Xử lý Tạo mới hoặc Cập nhật cộng dồn
        for (const variantDto of updateProductDto.variants!) {
          let finalUrls: string[] = [];
          const existingImages = variantDto.existingImages || [];

          // Upload ảnh mới (nếu có). Model màu KHÔNG upload ảnh per-variant
          // (ảnh nằm ở color_groups) → newUploadedUrls giữ rỗng, images cuối = [].
          let newUploadedUrls: string[] = [];
          const hasNewVariantImages =
            !usingColorModel &&
            files.variant_images &&
            variantDto.imageCount &&
            variantDto.imageCount > 0;

          if (hasNewVariantImages) {
            const nextOffset = imageOffset + variantDto.imageCount!;
            const variantFiles = files.variant_images!.slice(
              imageOffset,
              nextOffset,
            );
            imageOffset = nextOffset;

            const variantFolder = CLOUDINARY_FOLDER.PRODUCT_VARIANTS;
            const userSub = user.sub;
            const assetTypeVariant = AssetType.PRODUCT_VARIANT_IMAGE;
            const shopId = shop.id;

            const variantAssets =
              await this.cloudinaryService.uploadMultipleFiles(
                variantFiles,
                variantFolder,
                userSub,
                assetTypeVariant,
                shopId,
                uploadedAssets,
              );
            const mapAssetUrlFn = (asset: { url: string }) => asset.url;
            newUploadedUrls = variantAssets.map(mapAssetUrlFn);
          }

          const isVariantUpdate = !!variantDto.id;
          if (isVariantUpdate) {
            // Trường hợp UPDATE biến thể cũ
            const findOldVariantFn = (oldVar: ProductVariant) =>
              oldVar.id === variantDto.id;
            const oldVariant = oldVariants.find(findOldVariantFn);
            if (!oldVariant) {
              const notFoundVarMsg = `Biến thể với ID ${variantDto.id} không tồn tại`;
              throw new BadRequestException(notFoundVarMsg);
            }

            // Tìm các ảnh bị xóa bởi user.
            // Model màu: variant.images KHÔNG authoritative (ảnh ở color_groups) →
            // KHÔNG xóa asset theo nó (tránh phá ảnh legacy vừa migrate vào color_images).
            const isVarImageDeleted = (url: string) =>
              !existingImages.includes(url);
            const imagesDeletedByUser = usingColorModel
              ? []
              : (oldVariant.images || []).filter(isVarImageDeleted);

            // Đưa vào thùng rác
            for (const url of imagesDeletedByUser) {
              const asset = await this.cloudinaryService.findAssetByUrl(url);
              if (asset) {
                oldPublicIdsToDelete.push(asset.public_id);
                await queryRunner.manager.remove(MediaAsset, asset);
              }
            }

            // Kiểm tra giới hạn ảnh
            const totalVarImagesCount =
              existingImages.length + newUploadedUrls.length;
            const isVarLimitExceeded =
              totalVarImagesCount > UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES;
            if (isVarLimitExceeded) {
              const limitMsg = `Biến thể "${variantDto.name}" vượt quá số lượng ảnh cho phép (tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES} ảnh). Hiện có ${existingImages.length} ảnh cũ và ${newUploadedUrls.length} ảnh mới được tải lên.`;
              throw new BadRequestException(limitMsg);
            }

            // Model màu: ảnh biến thể lấy từ color_groups khi đọc → KHÔNG ép ≥1 ảnh per-variant.

            // Gộp ảnh (model màu: existingImages/newUploadedUrls rỗng → finalUrls = []).
            finalUrls = [...existingImages, ...newUploadedUrls];

            // Cập nhật giá trị (chỉ cập nhật những trường được gửi lên)
            if (variantDto.name !== undefined) {
              const variantName = variantDto.name;
              oldVariant.name = variantName;
              oldVariant.attributes =
                variantDto.attributes &&
                Object.keys(variantDto.attributes).length > 0
                  ? variantDto.attributes
                  : parseVariantAttributes(variantName);
            } else if (variantDto.attributes !== undefined) {
              oldVariant.attributes = variantDto.attributes;
            }
            if (variantDto.sku !== undefined) {
              oldVariant.sku = variantDto.sku;
            }
            if (variantDto.additional_price !== undefined) {
              oldVariant.additional_price = variantDto.additional_price;
            }
            if (variantDto.stock_quantity !== undefined) {
              oldVariant.stock_quantity = variantDto.stock_quantity;
            }
            oldVariant.images = finalUrls;

            variantsToSave.push(oldVariant);
          } else {
            // Trường hợp TẠO MỚI biến thể
            // Kiểm tra giới hạn ảnh
            const newVarImagesCount = newUploadedUrls.length;
            const isNewVarLimitExceeded =
              newVarImagesCount > UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES;
            if (isNewVarLimitExceeded) {
              const limitMsg = `Biến thể "${variantDto.name}" chỉ được phép có tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES} ảnh.`;
              throw new BadRequestException(limitMsg);
            }

            // Model màu: KHÔNG ép ≥1 ảnh per-variant (ảnh nằm ở color_groups).

            finalUrls = newUploadedUrls;

            const isNewVarInfoMissing =
              !variantDto.name || variantDto.stock_quantity === undefined;
            if (isNewVarInfoMissing) {
              const missingInfoMsg =
                'Biến thể mới yêu cầu đầy đủ thông tin về tên và số lượng tồn kho';
              throw new BadRequestException(missingInfoMsg);
            }

            const variantName = variantDto.name || '';
            const attributes =
              variantDto.attributes &&
              Object.keys(variantDto.attributes).length > 0
                ? variantDto.attributes
                : parseVariantAttributes(variantName);

            const newVariant = queryRunner.manager.create(ProductVariant, {
              name: variantName,
              attributes: attributes,
              sku: variantDto.sku,
              additional_price: variantDto.additional_price || 0,
              stock_quantity: variantDto.stock_quantity,
              images: finalUrls,
            });
            variantsToSave.push(newVariant);
          }
        }

        product.variants = variantsToSave;

        const sumStockFn = (sum: number, variant: ProductVariant) =>
          sum + variant.stock_quantity;
        product.stock_quantity = variantsToSave.reduce(sumStockFn, 0);
      }

      // Model màu: cập nhật nguồn sự thật ảnh biến thể (chạy cả khi không đổi list biến thể).
      if (usingColorModel) {
        product.color_groups = newColorGroupsMap;
      }

      // Kiểm tra tính nhất quán của has_variants
      const isVariantsMissingOnVariantsProduct =
        product.has_variants &&
        (!product.variants || product.variants.length === 0);

      if (isVariantsMissingOnVariantsProduct) {
        const missingVariantsMsg =
          'Sản phẩm được đánh dấu có biến thể nhưng không có dữ liệu biến thể nào.';
        throw new BadRequestException(missingVariantsMsg);
      }

      const savedProduct = await queryRunner.manager.save(Product, product);

      // Cập nhật product_id cho tất cả MediaAsset mới đã upload
      const hasUploadedAssets = uploadedAssets.length > 0;
      if (hasUploadedAssets) {
        const mapAssetIdFn = (asset: { id: string }) => asset.id;
        const assetIds = uploadedAssets.map(mapAssetIdFn);

        const updateAssetIdCondition = { id: In(assetIds) };
        const updateAssetIdPayload = { product_id: savedProduct.id };
        await queryRunner.manager.update(
          MediaAsset,
          updateAssetIdCondition,
          updateAssetIdPayload,
        );
      }

      await this.emitProductSnapshot(
        queryRunner.manager,
        savedProduct,
        OUTBOX_EVENT_TYPES.PRODUCT_UPDATED,
      );

      await queryRunner.commitTransaction();

      // Dọn dẹp ảnh cũ trên Cloudinary sau khi thành công
      const hasOldPublicIds = oldPublicIdsToDelete.length > 0;
      if (hasOldPublicIds) {
        const deleteFileFn = (publicId: string) =>
          this.cloudinaryService.deleteFile(publicId);
        const deletePromises = oldPublicIdsToDelete.map(deleteFileFn);

        await Promise.allSettled(deletePromises).catch((e) =>
          console.error('Lỗi khi xóa ảnh cũ:', e),
        );
      }

      const isPublicQuery = false;
      return this.findOne(savedProduct.id, isPublicQuery); // Trả về kèm Aggregated Gallery
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Xóa ảnh mới đã upload nếu rollback
      const hasUploadedAssets = uploadedAssets.length > 0;
      if (hasUploadedAssets) {
        const deleteAssetFn = (asset: { id: string }) => {
          const userSub = user.sub;
          return this.cloudinaryService.deleteAsset(asset.id, userSub);
        };
        const deletePromises = uploadedAssets.map(deleteAssetFn);

        Promise.allSettled(deletePromises).catch((e) =>
          console.error('Lỗi dọn rác ảnh và DB sau rollback:', e),
        );
      }

      const classNameMethod = '[ProductsService.update] Error:';
      console.error(classNameMethod, error);

      const isBadRequest = error instanceof BadRequestException;
      const isNotFound = error instanceof NotFoundException;
      if (isBadRequest || isNotFound) {
        throw error;
      }

      const serverErrorMsg =
        'Đã xảy ra lỗi trong quá trình cập nhật thông tin sản phẩm';
      throw new InternalServerErrorException(serverErrorMsg);
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // IV. DELETE SERVICE
  // ==========================================

  async remove(id: string, user: IUser) {
    const realId = extractId(id);

    // Lấy thông tin sản phẩm (bao gồm aggregated_gallery và variants)
    const productData = await this.findOne(realId);
    const shop = await this.shopsService.findOneByUserId(user.sub);

    const isShopInactive = shop.status !== AccountStatus.ACTIVE;
    if (isShopInactive) {
      const shopInactiveMsg =
        'Cửa hàng hiện đang trong trạng thái bị khóa hoặc chưa được kích hoạt';
      throw new BadRequestException(shopInactiveMsg);
    }

    const isNotOwner = productData.shop.id !== shop.id;
    if (isNotOwner) {
      const deleteDeniedMsg =
        'Bạn không có quyền thực hiện thao tác xóa trên sản phẩm này';
      throw new BadRequestException(deleteDeniedMsg);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const publicIdsToDelete: string[] = [];

    try {
      // Tìm và gom public_id của tất cả ảnh (thumbnail + gallery + variant)
      const hasAggregatedGallery =
        productData.aggregated_gallery &&
        productData.aggregated_gallery.length > 0;
      if (hasAggregatedGallery) {
        for (const url of productData.aggregated_gallery) {
          if (!url) continue;
          const asset = await this.cloudinaryService.findAssetByUrl(url);
          if (asset) {
            publicIdsToDelete.push(asset.public_id);
            // Xóa bản ghi trong DB
            await queryRunner.manager.remove(MediaAsset, asset);
          }
        }
      }

      // Xóa cứng toàn bộ biến thể
      const hasVariants =
        productData.variants && productData.variants.length > 0;
      if (hasVariants) {
        for (const variant of productData.variants) {
          const deleteVarCondition = { id: variant.id };
          await queryRunner.manager.delete(ProductVariant, deleteVarCondition);
        }
      }

      // Xóa mềm sản phẩm và làm sạch dữ liệu cũ
      const updateProductPayload = {
        status: ProductStatus.DELETED,
        has_variants: false,
        thumbnail_url: null, // Xóa URL ảnh đại diện
        gallery: [], // Làm rỗng bộ sưu tập ảnh
        stock_quantity: 0, // Đưa tồn kho về 0 (tuỳ chọn)
      };
      await queryRunner.manager.update(Product, realId, updateProductPayload);

      await this.emitProductDeleted(queryRunner.manager, realId);

      await queryRunner.commitTransaction();

      // Xóa ảnh trên Cloudinary (chạy ngầm)
      const hasPublicIds = publicIdsToDelete.length > 0;
      if (hasPublicIds) {
        const deleteFileFn = (publicId: string) =>
          this.cloudinaryService.deleteFile(publicId);
        const deletePromises = publicIdsToDelete.map(deleteFileFn);

        Promise.allSettled(deletePromises).catch((e) =>
          console.error('Lỗi khi xóa ảnh Cloudinary lúc xóa sản phẩm:', e),
        );
      }

      const successMsg = {
        message: 'Xóa sản phẩm và dọn dẹp dữ liệu thành công',
      };
      return successMsg;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const classNameMethod = '[ProductsService.remove] Error:';
      console.error(classNameMethod, error);

      const serverErrorMsg = 'Đã xảy ra lỗi trong quá trình xóa sản phẩm';
      throw new InternalServerErrorException(serverErrorMsg);
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // V. PRIVATE HELPER METHODS
  // ==========================================

  // Hàm helper nội bộ hỗ trợ truy vấn sản phẩm của Shop
  // private async loadShopProducts(shopId: string, filterHidden: boolean) {
  //   const whereCondition: any = {
  //     shop: { id: shopId },
  //     status: ProductStatus.ACTIVE,
  //   };

  //   if (filterHidden) {
  //     whereCondition.is_hidden = false;
  //   }

  //   const relationsList = ['category', 'variants'];
  //   const findConditions = {
  //     where: whereCondition,
  //     relations: relationsList,
  //     order: { created_at: 'DESC' as const },
  //   };

  //   const result = this.productsRepository.find(findConditions);
  //   return result;
  // }

  // Helper hỗ trợ lọc khoảng giá thông minh cho cả sản phẩm thường và sản phẩm có biến thể.
  private applyPriceFilter(
    queryBuilder: SelectQueryBuilder<Product>,
    minPrice?: number,
    maxPrice?: number,
  ): void {
    if (minPrice === undefined && maxPrice === undefined) return;

    // 1. Ghim tham số toàn cục để dùng chung
    if (minPrice !== undefined) {
      queryBuilder.setParameter('minPrice', minPrice);
      queryBuilder.setParameter('minPriceVariant', minPrice);
    }
    if (maxPrice !== undefined) {
      queryBuilder.setParameter('maxPrice', maxPrice);
      queryBuilder.setParameter('maxPriceVariant', maxPrice);
    }
    queryBuilder.setParameter('hasNoVariants', false);
    queryBuilder.setParameter('hasVariants', true);

    // 2. Định nghĩa điều kiện lọc
    queryBuilder.andWhere(
      new Brackets((qb) => {
        // Nhánh A: Sản phẩm thường
        qb.where(
          new Brackets((qb1) => {
            qb1.where('product.has_variants = :hasNoVariants');
            if (minPrice !== undefined)
              qb1.andWhere('product.price >= :minPrice');
            if (maxPrice !== undefined)
              qb1.andWhere('product.price <= :maxPrice');
          }),
        );

        // Nhánh B: Sản phẩm có biến thể
        qb.orWhere(
          new Brackets((qb2) => {
            qb2.where('product.has_variants = :hasVariants');

            const subQuery = this.productsRepository
              .createQueryBuilder('v')
              .subQuery()
              .select('1')
              .from(ProductVariant, 'v')
              .where('v.product_id = product.id');

            if (minPrice !== undefined) {
              subQuery.andWhere(
                '(product.price + v.additional_price) >= :minPriceVariant',
              );
            }
            if (maxPrice !== undefined) {
              subQuery.andWhere(
                '(product.price + v.additional_price) <= :maxPriceVariant',
              );
            }

            qb2.andWhere(`EXISTS (${subQuery.getQuery()})`);
          }),
        );
      }),
    );
  }

  private async resolveCategoryIds(categoryId: string): Promise<string[]> {
    try {
      const category = await this.categoriesService.findOneById(categoryId);
      const categoryIds = [category.id];
      const hasChildren = category.children && category.children.length > 0;
      if (hasChildren) {
        const mapChildIdFn = (c: Category) => c.id;
        const childrenIds = category.children.map(mapChildIdFn);
        categoryIds.push(...childrenIds);
      }
      return categoryIds;
    } catch (error) {
      // Graceful Fallback: Nếu không tìm thấy hoặc lỗi, trả về mảng chứa chính ID truyền vào để tránh lỗi SQL IN ()
      const resultFallback = [categoryId];
      return resultFallback;
    }
  }

  // Giai đoạn 2 Hydration: Nạp chi tiết cho tập kết quả phân trang và giữ đúng thứ tự gốc.
  private async hydrateProductPage(
    result: PaginatedResponseDto<Product>,
    relations: string[],
    select?: Record<string, any>,
  ): Promise<void> {
    if (result.items.length === 0) return;

    const productIds = result.items.map((p) => p.id);
    const detailedItems = await this.productsRepository.find({
      where: { id: In(productIds) },
      relations,
      ...(select && { select }),
    });

    // Bơm variant.images từ color_groups cho các item có nạp variants (list seller/public).
    if (relations.includes('variants')) {
      detailedItems.forEach((item) => this.resolveVariantImages(item));
    }

    // Ép mảng kết quả phải xếp đúng thứ tự ID gốc mà phân trang đã cắt ra
    result.items = productIds
      .map((id) => detailedItems.find((item) => item.id === id))
      .filter((item): item is Product => !!item);
  }

  async getProductForCartValidation(id: string): Promise<Product> {
    const realId = extractId(id);
    return this.findProductEntityOrFail(realId, [
      'shop',
      'shop.seller',
      'variants',
    ]);
  }

  private async findProductEntityOrFail(
    id: string,
    relations: string[],
  ): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations,
    });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return product;
  }
}
