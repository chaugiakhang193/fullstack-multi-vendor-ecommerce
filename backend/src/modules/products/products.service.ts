import {
  Inject,
  Injectable,
  forwardRef,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Repository,
  In,
  Brackets,
  SelectQueryBuilder,
} from 'typeorm';
import slugify from 'slugify';

// DTOs
import { CreateProductDto } from '@/modules/products/dto/create-product.dto';
import { UpdateProductDto } from '@/modules/products/dto/update-product.dto';
import {
  GetProductsQueryDto,
  GetSellerProductsQueryDto,
} from '@/modules/products/dto/get-products-query.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';

// Helpers
import { paginate } from '@/common/helpers/pagination.helper';

// Entities
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { MediaAsset } from '@/modules/cloudinary/entities/media-asset.entity';

// Services
import { CloudinaryService } from '@/modules/cloudinary/cloudinary.service';
import { ShopsService } from '@/modules/shops/shops.service';
import { CategoriesService } from '@/modules/products/categories.service';

// Enums & Interfaces
import { AccountStatus, AssetType, ProductStatus } from '@/common/enums';
import {
  UPLOAD_LIMITS,
  CLOUDINARY_FOLDER,
} from '@/common/constants/upload.constant';
import { IUser } from '@/interface/user.interface';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly categoriesService: CategoriesService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => ShopsService))
    private readonly shopsService: ShopsService,
    private readonly dataSource: DataSource,
  ) {}

  // ==========================================
  // I. CREATE SERVICE
  // ==========================================

  async create(
    createProductDto: CreateProductDto,
    files: {
      thumbnail?: Express.Multer.File[];
      general_gallery?: Express.Multer.File[];
      variant_images?: Express.Multer.File[];
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
    if (hasVariants) {
      const hasNoVariants =
        !createProductDto.variants || createProductDto.variants.length === 0;
      if (hasNoVariants) {
        const missingVariantsMsg =
          'Thiếu thông tin chi tiết của các biến thể sản phẩm';
        throw new BadRequestException(missingVariantsMsg);
      }

      const sumImagesFn = (sum: number, v: { imageCount: number }) =>
        sum + v.imageCount;
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

      const productSlug = this.generateSlug(createProductDto.name);
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
          // Lấy các file ảnh thuộc về biến thể này
          const nextOffset = imageOffset + variantDto.imageCount;
          const variantFiles = (files.variant_images || []).slice(
            imageOffset,
            nextOffset,
          );
          imageOffset = nextOffset;

          // Upload ảnh của biến thể
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

          const variantUrls = variantAssets.map(mapAssetUrlFn);

          const variantName = variantDto.name;
          const attributes = variantDto.attributes && Object.keys(variantDto.attributes).length > 0
            ? variantDto.attributes
            : this.parseVariantAttributes(variantName);

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
  // II. READ SERVICES
  // ==========================================

  async findAll(
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    let { min_price, max_price, q, category_id, sort, order = 'DESC' } = query;

    // 1. Chốt chặn bảo mật tự động đảo ngược khoảng giá (Graceful Fallback)
    if (min_price !== undefined && max_price !== undefined) {
      const isMinGreaterThanMax = min_price > max_price;
      if (isMinGreaterThanMax) {
        const temp = min_price;
        min_price = max_price;
        max_price = temp;
      }
    }

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

    // 6. Sắp xếp mặc định hoặc theo trường được yêu cầu an toàn chống SQL Injection
    const allowedSortFields = ['price', 'created_at', 'name'];
    const isSortAllowed = sort && allowedSortFields.includes(sort);
    const sortField = isSortAllowed ? sort : 'created_at';
    const sortPath = `product.${sortField}`;
    queryBuilder.orderBy(sortPath, order);

    // Phân trang ID tốc độ cao (Zero-latency Count)
    const result = await paginate<Product>(queryBuilder, query);

    // Giai đoạn 2 (Hydration): Nạp đầy đủ mảng biến thể, ảnh cho mảng items thu gọn (10-20 sản phẩm)
    const hasItems = result.items.length > 0;
    if (hasItems) {
      const productIds = result.items.map((p) => p.id);

      const findConditions = {
        where: { id: In(productIds) },
        relations: ['shop', 'category', 'variants'],
        select: {
          shop: { id: true, name: true, logo_url: true }, // Ngăn chặn hoàn toàn việc phơi bày cột số dư, email chủ shop...
        },
      };

      const detailedItems = await this.productsRepository.find(findConditions);

      // Ép mảng dữ liệu chi tiết phải xếp đúng theo thứ tự ID gốc mà phân trang (QueryBuilder) đã cắt ra
      result.items = productIds
        .map((id) => detailedItems.find((item) => item.id === id))
        .filter((item): item is Product => !!item);
    }

    return result;
  }

  async getPublicCatalogByShop(
    shopId: string,
    query: GetProductsQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    // Kiểm tra shop có tồn tại và đang hoạt động (ACTIVE) hay không
    const isPublicShop = true;
    const shop = await this.shopsService.findOneByShopId(shopId, isPublicShop);

    let { min_price, max_price, q, category_id, sort, order = 'DESC' } = query;

    // 1. Chốt chặn bảo mật tự động đảo ngược khoảng giá (Graceful Fallback)
    if (min_price !== undefined && max_price !== undefined) {
      const isMinGreaterThanMax = min_price > max_price;
      if (isMinGreaterThanMax) {
        const temp = min_price;
        min_price = max_price;
        max_price = temp;
      }
    }

    // Tối ưu: Dùng innerJoin với shop vì catalog bắt buộc phải thuộc về chính shop này
    const productAlias = 'product';
    const shopAlias = 'shop';
    const shopJoinProperty = 'product.shop';

    const queryBuilder = this.productsRepository
      .createQueryBuilder(productAlias)
      .innerJoin(shopJoinProperty, shopAlias);

    // Lọc theo Shop và các điều kiện hiển thị Public đối với Customer
    queryBuilder.where('product.shop.id = :shopId', { shopId: shop.id });
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

    // Sắp xếp
    const allowedSortFields = ['price', 'created_at', 'name'];
    const isSortAllowed = sort && allowedSortFields.includes(sort);
    const sortField = isSortAllowed ? sort : 'created_at';
    const sortPath = `product.${sortField}`;
    queryBuilder.orderBy(sortPath, order);

    // Thực hiện phân trang an toàn
    const result = await paginate<Product>(queryBuilder, query);

    // Giai đoạn 2 (Hydration): Nạp đầy đủ mảng variants và thông tin UI an toàn của shop
    const hasItems = result.items.length > 0;
    if (hasItems) {
      const productIds = result.items.map((p) => p.id);

      const findConditions = {
        where: { id: In(productIds) },
        relations: ['shop', 'category', 'variants'],
        select: {
          shop: { id: true, name: true, logo_url: true },
        },
      };

      const detailedItems = await this.productsRepository.find(findConditions);

      result.items = productIds
        .map((id) => detailedItems.find((item) => item.id === id))
        .filter((item): item is Product => !!item);
    }

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
    const hasItems = result.items.length > 0;
    if (hasItems) {
      const productIds = result.items.map((p) => p.id);

      const detailedItems = await this.productsRepository.find({
        where: { id: In(productIds) },
        relations: ['category', 'variants'], // Dashboard seller được xem trọn vẹn, không cần che shop relation
      });

      // Ép mảng dữ liệu chi tiết phải sắp xếp chuẩn theo thứ tự ID gốc mà phân trang cắt ra
      result.items = productIds
        .map((id) => detailedItems.find((item) => item.id === id))
        .filter((item): item is Product => !!item);
    }

    return result;
  }

  async findOne(id: string, isPublic?: boolean) {
    const realId = this.extractId(id);
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

    const isProductNull = !product;
    if (isProductNull) {
      const notFoundMsg = 'Không tìm thấy sản phẩm';
      throw new NotFoundException(notFoundMsg);
    }

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
    },
    user: IUser,
  ) {
    const realId = this.extractId(id);

    // Tìm sản phẩm và kiểm tra quyền sở hữu
    const findProductConditions = {
      where: { id: realId },
      relations: ['shop', 'variants'],
    };
    const product = await this.productsRepository.findOne(
      findProductConditions,
    );

    const isProductNull = !product;
    if (isProductNull) {
      const notFoundMsg = 'Không tìm thấy sản phẩm';
      throw new NotFoundException(notFoundMsg);
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
        product.slug = this.generateSlug(updateProductDto.name);
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
          const hasImagesToDelete =
            variantToDelete.images && variantToDelete.images.length > 0;
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

          // Upload ảnh mới (nếu có)
          let newUploadedUrls: string[] = [];
          const hasNewVariantImages =
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

            // Tìm các ảnh bị xóa bởi user
            const isVarImageDeleted = (url: string) =>
              !existingImages.includes(url);
            const imagesDeletedByUser = (oldVariant.images || []).filter(
              isVarImageDeleted,
            );

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

            const isVarImagesEmpty = totalVarImagesCount < 1;
            if (isVarImagesEmpty) {
              const minImagesMsg = `Biến thể "${variantDto.name}" phải có ít nhất 1 ảnh.`;
              throw new BadRequestException(minImagesMsg);
            }

            // Gộp ảnh
            finalUrls = [...existingImages, ...newUploadedUrls];

            // Cập nhật giá trị (chỉ cập nhật những trường được gửi lên)
            if (variantDto.name !== undefined) {
              const variantName = variantDto.name;
              oldVariant.name = variantName;
              oldVariant.attributes = variantDto.attributes && Object.keys(variantDto.attributes).length > 0
                ? variantDto.attributes
                : this.parseVariantAttributes(variantName);
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

            const isNewVarImagesEmpty = newVarImagesCount < 1;
            if (isNewVarImagesEmpty) {
              const minImagesMsg = `Biến thể "${variantDto.name}" phải có ít nhất 1 ảnh.`;
              throw new BadRequestException(minImagesMsg);
            }

            finalUrls = newUploadedUrls;

            const isNewVarInfoMissing =
              !variantDto.name || variantDto.stock_quantity === undefined;
            if (isNewVarInfoMissing) {
              const missingInfoMsg =
                'Biến thể mới yêu cầu đầy đủ thông tin về tên và số lượng tồn kho';
              throw new BadRequestException(missingInfoMsg);
            }

            const variantName = variantDto.name || '';
            const attributes = variantDto.attributes && Object.keys(variantDto.attributes).length > 0
              ? variantDto.attributes
              : this.parseVariantAttributes(variantName);

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
    const realId = this.extractId(id);

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

  private generateSlug(name: string): string {
    const slugifyOptions = { lower: true, locale: 'vi' };
    const result = slugify(name, slugifyOptions);
    return result;
  }

  private parseVariantAttributes(name: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const hasNoName = !name;
    if (hasNoName) {
      return attrs;
    }

    // Tách các thuộc tính bằng các ký tự phân tách phổ biến: '-', ',', '/', '|'
    const separatorPattern = /\s*[\-\,\/\|]\s*/;
    const parts = name.split(separatorPattern).map((p) => p.trim()).filter(Boolean);

    // Danh sách từ điển các màu sắc phổ biến bằng tiếng Việt và tiếng Anh
    const colors = [
      'đen', 'trắng', 'đỏ', 'xanh', 'vàng', 'lục', 'lam', 'chàm', 'tím', 
      'hồng', 'xám', 'cam', 'nâu', 'bạc', 'titan', 'gold', 'silver', 'black', 
      'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'grey', 
      'gray', 'bạch kim', 'be', 'kem', 'rêu', 'rêu nhạt', 'nhám', 'tự nhiên'
    ];

    // Danh sách các chuẩn kích thước size chữ phổ biến
    const sizes = ['s', 'm', 'l', 'xl', 'xxl', 'xxxl', 'xs', 'free size', 'freesize'];

    const parsePart = (part: string) => {
      const lowerPart = part.toLowerCase();

      // 1. Nhận diện RAM
      const ramPattern = /ram/i;
      const hasRam = lowerPart.includes('ram');
      if (hasRam) {
        const emptyStringFallback = '';
        const ramVal = part.replace(ramPattern, emptyStringFallback).trim();
        attrs['ram'] = ramVal;
        return;
      }

      // 2. Nhận diện CPU / Vi xử lý
      const hasCpu = lowerPart.includes('intel') || lowerPart.includes('core') || lowerPart.includes('amd') || lowerPart.includes('ryzen');
      if (hasCpu) {
        attrs['cpu'] = part;
        return;
      }

      // 3. Nhận diện Dung lượng lưu trữ (Storage - GB, TB)
      const storagePattern = /^\d+\s*(gb|tb)$/i;
      const isStorage = storagePattern.test(part);
      if (isStorage) {
        const spacePattern = /\s+/g;
        const emptyStringFallback = '';
        const storageVal = part.toUpperCase().replace(spacePattern, emptyStringFallback);
        attrs['storage'] = storageVal;
        return;
      }

      // 4. Nhận diện Kích thước (Size)
      const isSizePrefix = lowerPart.startsWith('size');
      if (isSizePrefix) {
        const sizePattern = /size/i;
        const emptyStringFallback = '';
        const sizeVal = part.replace(sizePattern, emptyStringFallback).trim();
        attrs['size'] = sizeVal;
        return;
      }
      const isSizeViPrefix = lowerPart.startsWith('kích thước') || lowerPart.startsWith('kích cỡ');
      if (isSizeViPrefix) {
        const sizeViPattern = /kích thước|kích cỡ/i;
        const emptyStringFallback = '';
        const sizeVal = part.replace(sizeViPattern, emptyStringFallback).trim();
        attrs['size'] = sizeVal;
        return;
      }
      const isStandardSizeWord = sizes.includes(lowerPart);
      if (isStandardSizeWord) {
        const normalizedSizeVal = part.toUpperCase();
        attrs['size'] = normalizedSizeVal;
        return;
      }
      // Nhận dạng size số (ví dụ size giày hoặc quần áo chuẩn Việt Nam từ 28 đến 48)
      const numberPattern = /^\d+$/;
      const isNumberOnly = numberPattern.test(part);
      if (isNumberOnly) {
        const radixVal = 10;
        const num = parseInt(part, radixVal);
        const isShoeSize = num >= 28 && num <= 48;
        if (isShoeSize) {
          attrs['size'] = part;
          return;
        }
      }

      // 5. Nhận diện Màu sắc (Color)
      const isColorPrefix = lowerPart.startsWith('màu ');
      if (isColorPrefix) {
        const colorPrefixPattern = /màu /i;
        const emptyStringFallback = '';
        let colorVal = part.replace(colorPrefixPattern, emptyStringFallback).trim();
        
        // Loại bỏ các từ hậu tố mô tả đi kèm
        const descriptive1 = / cá tính/i;
        const descriptive2 = / thanh lịch/i;
        const descriptive3 = / sang trọng/i;
        colorVal = colorVal.replace(descriptive1, emptyStringFallback)
                           .replace(descriptive2, emptyStringFallback)
                           .replace(descriptive3, emptyStringFallback)
                           .trim();
        attrs['color'] = colorVal;
        return;
      }
      
      // Đối chiếu kiểm tra với từ điển màu sắc
      const colorMatchFn = (c: string) => lowerPart.includes(c);
      const matchedColor = colors.find(colorMatchFn);
      if (matchedColor) {
        let colorVal = part;
        const startsWithColorVi = colorVal.toLowerCase().startsWith('màu ');
        if (startsWithColorVi) {
          const colorPrefixPattern = /màu /i;
          const emptyStringFallback = '';
          colorVal = colorVal.replace(colorPrefixPattern, emptyStringFallback).trim();
        }
        attrs['color'] = colorVal;
        return;
      }
    };

    for (const part of parts) {
      parsePart(part);
    }

    return attrs;
  }

  async getProductForCartValidation(id: string): Promise<Product> {
    const realId = this.extractId(id);
    const product = await this.productsRepository.findOne({
      where: { id: realId },
      relations: ['shop', 'shop.seller', 'variants'],
    });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return product;
  }

  private extractId(idOrSlugWithId: string): string {
    const matchRegex =
      /-i\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
    const match = idOrSlugWithId.match(matchRegex);
    if (match) {
      const matchedUuid = match[1];
      return matchedUuid;
    }
    return idOrSlugWithId; // Trả về nguyên bản nếu là ID thuần túy
  }
}
