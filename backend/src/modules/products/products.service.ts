import {
  Inject,
  Injectable,
  forwardRef,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import slugify from 'slugify';

// DTOs
import { CreateProductDto } from '@/modules/products/dto/create-product.dto';
import { UpdateProductDto } from '@/modules/products/dto/update-product.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';

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
import {
  AccountStatus,
  AssetType,
  ProductStatus,
  CloudinaryFolder,
} from '@/modules/enums';
import { IUser } from '@/interface/user.interface';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
    private readonly categoriesService: CategoriesService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => ShopsService))
    private readonly shopsService: ShopsService,
    private readonly dataSource: DataSource,
  ) {}

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
    if (user.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(
        'Tài khoản chưa được kích hoạt để thực hiện chức năng này',
      );
    }

    // Tìm Shop của Seller
    const shop = await this.shopsService.findOneByUserId(user.sub);
    if (shop.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(
        'Cửa hàng hiện đang trong trạng thái bị khóa hoặc chưa được kích hoạt',
      );
    }

    // Kiểm tra và lấy danh mục con cấp cuối cùng
    const category = await this.categoriesService.validateLeafCategory(
      createProductDto.category_id,
    );

    // Kiểm tra tính hợp lệ của ảnh
    if (!files.thumbnail?.[0]) {
      throw new BadRequestException('Ảnh đại diện (thumbnail) là bắt buộc');
    }
    if (!files.general_gallery || files.general_gallery.length === 0) {
      throw new BadRequestException(
        'Yêu cầu tối thiểu 1 ảnh trong bộ sưu tập chung',
      );
    }

    if (createProductDto.has_variants) {
      if (
        !createProductDto.variants ||
        createProductDto.variants.length === 0
      ) {
        throw new BadRequestException(
          'Thiếu thông tin chi tiết của các biến thể sản phẩm',
        );
      }

      const totalExpectedImages = createProductDto.variants.reduce(
        (sum, v) => sum + v.imageCount,
        0,
      );
      const actualImages = files.variant_images?.length || 0;

      if (totalExpectedImages !== actualImages) {
        throw new BadRequestException(
          `Số lượng ảnh biến thể không khớp (Khai báo: ${totalExpectedImages}, Thực tế: ${actualImages})`,
        );
      }
    }

    // Bắt đầu Transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const uploadedAssets: { id: string; public_id: string }[] = [];

    try {
      // Upload Thumbnail
      const thumbnailResult = await this.cloudinaryService.uploadFile(
        files.thumbnail[0],
        CloudinaryFolder.PRODUCT_THUMBNAILS,
        user.sub,
        AssetType.PRODUCT_THUMBNAIL,
        shop.id,
        uploadedAssets,
      );

      // Upload General Gallery
      const galleryAssets = await this.cloudinaryService.uploadMultipleFiles(
        files.general_gallery,
        CloudinaryFolder.PRODUCT_GALLERY,
        user.sub,
        AssetType.PRODUCT_GALLERY,
        shop.id,
        uploadedAssets,
      );
      const galleryUrls = galleryAssets.map((asset) => asset.url);

      // Tạo Product
      const product = queryRunner.manager.create(Product, {
        name: createProductDto.name,
        description: createProductDto.description,
        price: createProductDto.price,
        category,
        shop,
        thumbnail_url: thumbnailResult.url,
        gallery: galleryUrls,
        slug: this.generateSlug(createProductDto.name),
        sku: createProductDto.sku,
        weight: createProductDto.weight,
        length: createProductDto.length,
        width: createProductDto.width,
        height: createProductDto.height,
        status: ProductStatus.ACTIVE,
        has_variants: createProductDto.has_variants,
        stock_quantity: createProductDto.stock_quantity || 0,
      });

      // Xử lý Biến thể (Variants)
      if (createProductDto.has_variants && createProductDto.variants) {
        let imageOffset = 0;
        const variantsToSave: ProductVariant[] = [];

        for (const variantDto of createProductDto.variants) {
          // Lấy các file ảnh thuộc về biến thể này
          const variantFiles = (files.variant_images || []).slice(
            imageOffset,
            imageOffset + variantDto.imageCount,
          );
          imageOffset += variantDto.imageCount;

          // Upload ảnh của biến thể
          const variantAssets =
            await this.cloudinaryService.uploadMultipleFiles(
              variantFiles,
              CloudinaryFolder.PRODUCT_VARIANTS,
              user.sub,
              AssetType.PRODUCT_VARIANT_IMAGE,
              shop.id,
              uploadedAssets,
            );
          const variantUrls = variantAssets.map((asset) => asset.url);

          const variant = queryRunner.manager.create(ProductVariant, {
            name: variantDto.name,
            sku: variantDto.sku,
            additional_price: variantDto.additional_price || 0,
            stock_quantity: variantDto.stock_quantity,
            images: variantUrls,
          });
          variantsToSave.push(variant);
        }

        product.variants = variantsToSave;
        // Tính tổng tồn kho từ biến thể
        product.stock_quantity = variantsToSave.reduce(
          (sum, variant) => sum + variant.stock_quantity,
          0,
        );
      }

      const savedProduct = await queryRunner.manager.save(Product, product);

      // Cập nhật product_id cho tất cả MediaAsset đã upload
      if (uploadedAssets.length > 0) {
        const assetIds = uploadedAssets.map((asset) => asset.id);
        await queryRunner.manager.update(
          MediaAsset,
          { id: In(assetIds) },
          { product_id: savedProduct.id },
        );
      }

      await queryRunner.commitTransaction();
      return savedProduct;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Dọn rác Cloudinary và Database nếu có lỗi
      if (uploadedAssets.length > 0) {
        Promise.allSettled(
          uploadedAssets.map((asset) =>
            this.cloudinaryService.deleteAsset(asset.id, user.sub),
          ),
        ).catch((e) => console.error('Lỗi khi dọn rác ảnh và DB:', e));
      }

      console.error('[ProductsService.create] Error:', error);
      throw error instanceof BadRequestException
        ? error
        : new InternalServerErrorException(
            'Đã xảy ra lỗi trong quá trình khởi tạo sản phẩm',
          );
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<Product>> {
    const { page = 1, limit = 10, sort, order = 'DESC' } = query;
    const skip = (page - 1) * limit;

    const orderCondition: any = {};
    if (sort) {
      const allowedSortFields = ['price', 'created_at', 'name'];
      if (allowedSortFields.includes(sort)) {
        orderCondition[sort] = order;
      } else {
        orderCondition['created_at'] = 'DESC';
      }
    } else {
      orderCondition['created_at'] = 'DESC';
    }

    const [items, totalItems] = await this.productsRepository.findAndCount({
      where: {
        status: ProductStatus.ACTIVE,
        is_hidden: false,
        shop: { status: AccountStatus.ACTIVE },
      },
      relations: ['shop', 'category', 'variants'],
      order: orderCondition,
      take: limit,
      skip: skip,
    });

    const totalPages = Math.ceil(totalItems / limit);

    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  async findOne(id: string, isPublic?: boolean) {
    const realId = this.extractId(id);
    const whereCondition: any = { id: realId };

    if (isPublic) {
      whereCondition.status = ProductStatus.ACTIVE;
      whereCondition.is_hidden = false; // Khách hàng không được xem sản phẩm ẩn
      whereCondition.shop = { status: AccountStatus.ACTIVE };
    }

    const product = await this.productsRepository.findOne({
      where: whereCondition,
      relations: ['shop', 'category', 'variants'],
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    // Tạo Aggregated Gallery (Bộ sưu tập ảnh tổng hợp)
    const aggregated_gallery = [
      product.thumbnail_url,
      ...(product.gallery || []),
    ];

    // Gộp thêm toàn bộ ảnh của các biến thể vào gallery chung
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((v) => {
        if (v.images && v.images.length > 0) {
          aggregated_gallery.push(...v.images);
        }
      });
    }

    return {
      ...product,
      // Loại bỏ ảnh trùng và lọc các giá trị null/undefined
      aggregated_gallery: [...new Set(aggregated_gallery.filter(Boolean))],
    };
  }

  // Hàm helper nội bộ hỗ trợ truy vấn sản phẩm của Shop
  private async loadShopProducts(shopId: string, filterHidden: boolean) {
    const whereCondition: any = {
      shop: { id: shopId },
      status: ProductStatus.ACTIVE,
    };

    if (filterHidden) {
      whereCondition.is_hidden = false;
    }

    return this.productsRepository.find({
      where: whereCondition,
      relations: ['category', 'variants'],
      order: { created_at: 'DESC' },
    });
  }

  // Xem danh sách hàng hóa trong một shop dành cho seller (Inventory)
  // Seller vẫn xem được hàng hóa bị is_hidden=true
  async getSellerInventory(userId: string) {
    const shop = await this.shopsService.findOneByUserId(userId);
    return this.loadShopProducts(shop.id, false); // Không lọc ẩn
  }

  // Khách hàng xem danh mục hàng hóa của Shop (Catalog)
  async getPublicCatalogByShop(shopId: string) {
    // Kiểm tra shop có tồn tại và đang hoạt động (ACTIVE) hay không
    const shop = await this.shopsService.findOneByShopId(shopId, true);

    // Chỉ lấy sản phẩm ACTIVE và KHÔNG BỊ ẨN (is_hidden = false)
    return this.loadShopProducts(shop.id, true); // Có lọc ẩn
  }

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
    const product = await this.productsRepository.findOne({
      where: { id: realId },
      relations: ['shop', 'variants'],
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    // Kiểm tra shop của user yêu cầu cập nhật sản phẩm còn đang ở trạng thái ACTIVE không
    const shop = await this.shopsService.findOneByUserId(user.sub);
    if (shop.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(
        'Cửa hàng hiện đang trong trạng thái bị khóa hoặc chưa được kích hoạt',
      );
    }

    if (product.shop.id !== shop.id) {
      throw new BadRequestException(
        'Yêu cầu bị từ chối do bạn không có quyền sở hữu sản phẩm này',
      );
    }

    // Bắt đầu Transaction để cập nhật
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const oldPublicIdsToDelete: string[] = [];
    const uploadedAssets: { id: string; public_id: string }[] = [];

    try {
      // Xử lý Ảnh Thumbnail mới
      if (files.thumbnail?.[0]) {
        // Tìm MediaAsset cũ của thumbnail bằng chính URL hiện tại của nó để đảm bảo chính xác 100%
        const oldThumbnailAsset = product.thumbnail_url
          ? await queryRunner.manager.findOne(MediaAsset, {
              where: { url: product.thumbnail_url },
            })
          : null;

        const uploadResult = await this.cloudinaryService.uploadFile(
          files.thumbnail[0],
          CloudinaryFolder.PRODUCT_THUMBNAILS,
          user.sub,
          AssetType.PRODUCT_THUMBNAIL,
          shop.id,
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
      if (
        updateProductDto.existingGalleryImages !== undefined ||
        (files.general_gallery && files.general_gallery.length > 0)
      ) {
        const existingImages =
          updateProductDto.existingGalleryImages ?? (product.gallery || []);

        // Tìm các ảnh bị xóa bởi user và đưa vào thùng rác
        const imagesDeletedByUser = (product.gallery || []).filter(
          (url) => !existingImages.includes(url),
        );

        for (const url of imagesDeletedByUser) {
          const asset = await this.cloudinaryService.findAssetByUrl(url);
          if (asset) {
            oldPublicIdsToDelete.push(asset.public_id);
            await queryRunner.manager.remove(MediaAsset, asset);
          }
        }

        // Xử lý ảnh mới
        const newUploadedAssets =
          await this.cloudinaryService.uploadMultipleFiles(
            files.general_gallery,
            CloudinaryFolder.PRODUCT_GALLERY,
            user.sub,
            AssetType.PRODUCT_GALLERY,
            shop.id,
            uploadedAssets,
          );
        const newUploadedUrls = newUploadedAssets.map((asset) => asset.url);

        // Kiểm tra giới hạn 5 ảnh
        if (existingImages.length + newUploadedUrls.length > 5) {
          throw new BadRequestException(
            `Số lượng ảnh trong bộ sưu tập vượt quá giới hạn (tối đa 5 ảnh). Hiện có ${existingImages.length} ảnh cũ và ${newUploadedUrls.length} ảnh mới được tải lên.`,
          );
        }

        // Gộp ảnh
        product.gallery = [...existingImages, ...newUploadedUrls];
      }

      // Cập nhật các trường cơ bản
      if (updateProductDto.name) {
        product.name = updateProductDto.name;
        product.slug = this.generateSlug(updateProductDto.name);
      }
      if (updateProductDto.description !== undefined)
        product.description = updateProductDto.description;
      if (updateProductDto.price) product.price = updateProductDto.price;
      if (updateProductDto.sku !== undefined)
        product.sku = updateProductDto.sku;
      if (updateProductDto.weight !== undefined)
        product.weight = updateProductDto.weight;
      if (updateProductDto.length !== undefined)
        product.length = updateProductDto.length;
      if (updateProductDto.width !== undefined)
        product.width = updateProductDto.width;
      if (updateProductDto.height !== undefined)
        product.height = updateProductDto.height;
      if (updateProductDto.status !== undefined)
        product.status = updateProductDto.status;
      if (updateProductDto.is_hidden !== undefined)
        product.is_hidden = updateProductDto.is_hidden;

      if (updateProductDto.has_variants !== undefined) {
        // Nếu user muốn hủy trạng thái có biến thể (true -> false)
        if (
          updateProductDto.has_variants === false &&
          product.has_variants === true
        ) {
          // Bắt buộc nhập price và stock_quantity
          if (
            updateProductDto.price === undefined ||
            updateProductDto.stock_quantity === undefined
          ) {
            throw new BadRequestException(
              'Khi chuyển từ sản phẩm có biến thể sang không có biến thể, bạn bắt buộc phải nhập giá (price) và số lượng tồn kho (stock_quantity) cho sản phẩm gốc.',
            );
          }

          // Dọn dẹp tất cả biến thể cũ
          const oldVariants = await queryRunner.manager.find(ProductVariant, {
            where: { product: { id: product.id } },
          });

          for (const variant of oldVariants) {
            if (variant.images && variant.images.length > 0) {
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
        product.has_variants = updateProductDto.has_variants;
      }

      if (updateProductDto.stock_quantity !== undefined) {
        if (product.has_variants) {
          throw new BadRequestException(
            'Không được phép cập nhật tồn kho của sản phẩm gốc khi sản phẩm có biến thể. Vui lòng cập nhật tồn kho ở từng biến thể.',
          );
        }
        product.stock_quantity = updateProductDto.stock_quantity;
      }
      if (updateProductDto.category_id) {
        product.category = await this.categoriesService.validateLeafCategory(
          updateProductDto.category_id,
        );
      }

      // Xử lý Biến thể (Variants) - Chỉ thực hiện nếu sản phẩm có trạng thái có biến thể
      if (updateProductDto.variants && product.has_variants) {
        const oldVariants = await queryRunner.manager.find(ProductVariant, {
          where: { product: { id: product.id } },
        });

        const incomingIds = updateProductDto.variants
          .map((variant) => variant.id)
          .filter(Boolean);

        // Tìm và xóa các biến thể cũ không còn tồn tại trong request
        const variantsToDelete = oldVariants.filter(
          (variant) => !incomingIds.includes(variant.id),
        );
        for (const variantToDelete of variantsToDelete) {
          if (variantToDelete.images && variantToDelete.images.length > 0) {
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
        for (const variantDto of updateProductDto.variants) {
          let finalUrls: string[] = [];
          const existingImages = variantDto.existingImages || [];

          // Upload ảnh mới (nếu có)
          let newUploadedUrls: string[] = [];
          if (
            files.variant_images &&
            variantDto.imageCount &&
            variantDto.imageCount > 0
          ) {
            const variantFiles = files.variant_images.slice(
              imageOffset,
              imageOffset + variantDto.imageCount,
            );
            imageOffset += variantDto.imageCount;

            const variantAssets =
              await this.cloudinaryService.uploadMultipleFiles(
                variantFiles,
                CloudinaryFolder.PRODUCT_VARIANTS,
                user.sub,
                AssetType.PRODUCT_VARIANT_IMAGE,
                shop.id,
                uploadedAssets,
              );
            newUploadedUrls = variantAssets.map((asset) => asset.url);
          }

          if (variantDto.id) {
            // Trường hợp UPDATE biến thể cũ
            const oldVariant = oldVariants.find(
              (oldVar) => oldVar.id === variantDto.id,
            );
            if (!oldVariant) {
              throw new BadRequestException(
                `Biến thể với ID ${variantDto.id} không tồn tại`,
              );
            }

            // Tìm các ảnh bị xóa bởi user
            const imagesDeletedByUser = (oldVariant.images || []).filter(
              (url) => !existingImages.includes(url),
            );
            // Đưa vào thùng rác
            for (const url of imagesDeletedByUser) {
              const asset = await this.cloudinaryService.findAssetByUrl(url);
              if (asset) {
                oldPublicIdsToDelete.push(asset.public_id);
                await queryRunner.manager.remove(MediaAsset, asset);
              }
            }

            // Kiểm tra giới hạn 3 ảnh
            if (existingImages.length + newUploadedUrls.length > 3) {
              throw new BadRequestException(
                `Biến thể "${variantDto.name}" vượt quá số lượng ảnh cho phép (tối đa 3 ảnh). Hiện có ${existingImages.length} ảnh cũ và ${newUploadedUrls.length} ảnh mới được tải lên.`,
              );
            }
            if (existingImages.length + newUploadedUrls.length < 1) {
              throw new BadRequestException(
                `Biến thể "${variantDto.name}" phải có ít nhất 1 ảnh.`,
              );
            }

            // Gộp ảnh
            finalUrls = [...existingImages, ...newUploadedUrls];

            // Cập nhật giá trị (chỉ cập nhật những trường được gửi lên)
            if (variantDto.name !== undefined)
              oldVariant.name = variantDto.name;
            if (variantDto.sku !== undefined) oldVariant.sku = variantDto.sku;
            if (variantDto.additional_price !== undefined)
              oldVariant.additional_price = variantDto.additional_price;
            if (variantDto.stock_quantity !== undefined)
              oldVariant.stock_quantity = variantDto.stock_quantity;
            oldVariant.images = finalUrls;

            variantsToSave.push(oldVariant);
          } else {
            // Trường hợp TẠO MỚI biến thể
            // Kiểm tra giới hạn 3 ảnh
            if (newUploadedUrls.length > 3) {
              throw new BadRequestException(
                `Biến thể "${variantDto.name}" chỉ được phép có tối đa 3 ảnh.`,
              );
            }
            if (newUploadedUrls.length < 1) {
              throw new BadRequestException(
                `Biến thể "${variantDto.name}" phải có ít nhất 1 ảnh.`,
              );
            }

            finalUrls = newUploadedUrls;

            if (!variantDto.name || variantDto.stock_quantity === undefined) {
              throw new BadRequestException(
                'Biến thể mới yêu cầu đầy đủ thông tin về tên và số lượng tồn kho',
              );
            }

            const newVariant = queryRunner.manager.create(ProductVariant, {
              name: variantDto.name,
              sku: variantDto.sku,
              additional_price: variantDto.additional_price || 0,
              stock_quantity: variantDto.stock_quantity,
              images: finalUrls,
            });
            variantsToSave.push(newVariant);
          }
        }

        product.variants = variantsToSave;
        product.stock_quantity = variantsToSave.reduce(
          (sum, variant) => sum + variant.stock_quantity,
          0,
        );
      }

      // Kiểm tra tính nhất quán của has_variants
      if (
        product.has_variants &&
        (!product.variants || product.variants.length === 0)
      ) {
        throw new BadRequestException(
          'Sản phẩm được đánh dấu có biến thể nhưng không có dữ liệu biến thể nào.',
        );
      }

      const savedProduct = await queryRunner.manager.save(Product, product);

      // Cập nhật product_id cho tất cả MediaAsset mới đã upload
      if (uploadedAssets.length > 0) {
        const assetIds = uploadedAssets.map((asset) => asset.id);
        await queryRunner.manager.update(
          MediaAsset,
          { id: In(assetIds) },
          { product_id: savedProduct.id },
        );
      }

      await queryRunner.commitTransaction();

      // Dọn dẹp ảnh cũ trên Cloudinary sau khi thành công
      if (oldPublicIdsToDelete.length > 0) {
        await Promise.allSettled(
          oldPublicIdsToDelete.map((publicId) =>
            this.cloudinaryService.deleteFile(publicId),
          ),
        ).catch((e) => console.error('Lỗi khi xóa ảnh cũ:', e));
      }

      return this.findOne(savedProduct.id); // Trả về kèm Aggregated Gallery
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Xóa ảnh mới đã upload nếu rollback
      if (uploadedAssets.length > 0) {
        Promise.allSettled(
          uploadedAssets.map((asset) =>
            this.cloudinaryService.deleteAsset(asset.id, user.sub),
          ),
        ).catch((e) => console.error('Lỗi dọn rác ảnh và DB sau rollback:', e));
      }

      console.error('[ProductsService.update] Error:', error);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Đã xảy ra lỗi trong quá trình cập nhật thông tin sản phẩm',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string, user: IUser) {
    const realId = this.extractId(id);
    // Lấy thông tin sản phẩm (bao gồm aggregated_gallery và variants)
    const productData = await this.findOne(realId);
    const shop = await this.shopsService.findOneByUserId(user.sub);

    if (shop.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(
        'Cửa hàng hiện đang trong trạng thái bị khóa hoặc chưa được kích hoạt',
      );
    }

    if (productData.shop.id !== shop.id) {
      throw new BadRequestException(
        'Bạn không có quyền thực hiện thao tác xóa trên sản phẩm này',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const publicIdsToDelete: string[] = [];

    try {
      // Tìm và gom public_id của tất cả ảnh (thumbnail + gallery + variant)
      if (
        productData.aggregated_gallery &&
        productData.aggregated_gallery.length > 0
      ) {
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
      if (productData.variants && productData.variants.length > 0) {
        for (const variant of productData.variants) {
          await queryRunner.manager.delete(ProductVariant, { id: variant.id });
        }
      }

      // Xóa mềm sản phẩm và làm sạch dữ liệu cũ
      await queryRunner.manager.update(Product, realId, {
        status: ProductStatus.DELETED,
        has_variants: false,
        thumbnail_url: null, // Xóa URL ảnh đại diện
        gallery: [], // Làm rỗng bộ sưu tập ảnh
        stock_quantity: 0, // Đưa tồn kho về 0 (tuỳ chọn)
      });

      await queryRunner.commitTransaction();

      // Xóa ảnh trên Cloudinary (chạy ngầm)
      if (publicIdsToDelete.length > 0) {
        Promise.allSettled(
          publicIdsToDelete.map((publicId) =>
            this.cloudinaryService.deleteFile(publicId),
          ),
        ).catch((e) =>
          console.error('Lỗi khi xóa ảnh Cloudinary lúc xóa sản phẩm:', e),
        );
      }

      return { message: 'Xóa sản phẩm và dọn dẹp dữ liệu thành công' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[ProductsService.remove] Error:', error);
      throw new InternalServerErrorException(
        'Đã xảy ra lỗi trong quá trình xóa sản phẩm',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async findOneForSeller(id: string, userId: string) {
    const shop = await this.shopsService.findOneByUserId(userId);
    const product = await this.findOne(id, false); // Lấy chi tiết sản phẩm (bao gồm cả sản phẩm ẩn)

    if (product.shop.id !== shop.id) {
      throw new BadRequestException(
        'Yêu cầu bị từ chối do bạn không có quyền sở hữu sản phẩm này',
      );
    }
    return product;
  }

  private generateSlug(name: string): string {
    return slugify(name, { lower: true, locale: 'vi' });
  }

  private extractId(idOrSlugWithId: string): string {
    const match = idOrSlugWithId.match(
      /-i\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
    );
    if (match) {
      return match[1];
    }
    return idOrSlugWithId; // Trả về nguyên bản nếu là ID thuần túy
  }
}
