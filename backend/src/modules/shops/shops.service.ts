import 'multer';
import {
  Inject,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

// DTOs
import { CreateShopDto } from '@/modules/shops/dto/create-shop.dto';
import { UpdateShopDto } from '@/modules/shops/dto/update-shop.dto';

// Entities
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { User } from '@/modules/users/entities/user.entity';

// Services
import { CloudinaryService } from '@/modules/cloudinary/cloudinary.service';
import { UsersService } from '@/modules/users/users.service';
import { CategoriesService } from '@/modules/products/categories.service';
import { MailService } from '@/modules/mail/mail.service';
import { GeocodingService } from '@/modules/geocoding/geocoding.service';

// Enums
import { AccountStatus, AssetType } from '@/common/enums';
import {
  UPLOAD_LIMITS,
  CLOUDINARY_FOLDER,
} from '@/common/constants/upload.constant';

@Injectable()
export class ShopsService {
  private readonly logger = new Logger(ShopsService.name);
  constructor(
    @InjectRepository(Shop)
    private readonly shopsRepository: Repository<Shop>,
    @Inject(forwardRef(() => CategoriesService))
    private readonly categoriesService: CategoriesService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly userService: UsersService,
    @InjectDataSource() private dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly geocodingService: GeocodingService,
  ) {}

  async setupInitialShop(
    userId: string,
    createShopDto: CreateShopDto,
    files?: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    const sellCreateShop = await this.userService.findById(userId);
    if (!sellCreateShop) {
      throw new NotFoundException('Người dùng không tồn tại');
    }
    // Tách lat/lng ra để không truyền thẳng vào entity — resolved coords được set riêng sau geocoding
    const { categoryIds, lat, lng, ...shopInfo } = createShopDto;

    // Kiểm tra xem seller này đã có Shop chưa
    // Vì mỗi tài khoản seller chỉ được phép tạo 1 Shop trên hệ thống
    const existingShop = await this.shopsRepository.findOne({
      where: { seller: { id: userId } },
    });

    if (existingShop) {
      throw new BadRequestException('Bạn đã có gian hàng trên hệ thống rồi');
    }

    // Kiểm tra danh mục có tồn tại không
    let categories: Category[] = [];
    const parsedCategoryIds = this.parseCategoryIds(categoryIds);
    if (parsedCategoryIds.length > 0) {
      categories =
        await this.categoriesService.validateRootCategories(parsedCategoryIds);
    }

    // Geocoding resolution: ưu tiên tọa độ frontend → fallback backend → graceful null
    // Chạy trước upload ảnh để tránh giữ kết nối HTTP upload trong khi chờ geocoding
    let resolvedLat: string | null = null;
    let resolvedLng: string | null = null;
    let isCoordinatesVerified = false;

    const frontendLat = createShopDto.lat != null ? Number(createShopDto.lat) : NaN;
    const frontendLng = createShopDto.lng != null ? Number(createShopDto.lng) : NaN;

    if (!isNaN(frontendLat) && !isNaN(frontendLng)) {
      // Frontend đã lấy tọa độ từ autocomplete — dùng trực tiếp (Trap #9)
      resolvedLat = String(frontendLat);
      resolvedLng = String(frontendLng);
      isCoordinatesVerified = true;
    } else {
      // Frontend không gửi coords — backend tự geocode làm fallback
      const pickupAddress = createShopDto.pickup_address;
      const geocodeResult = await this.geocodingService.geocode(pickupAddress);

      if (geocodeResult.success && geocodeResult.lat !== null && geocodeResult.lng !== null) {
        resolvedLat = String(geocodeResult.lat);
        resolvedLng = String(geocodeResult.lng);
        isCoordinatesVerified = true;
      } else {
        // API sập hoặc không tìm thấy địa chỉ → graceful degradation (Trap #6)
        // Trap #12: đặt false tường minh, không dựa vào default entity
        isCoordinatesVerified = false;
        this.logger.warn(
          `[setupInitialShop] Geocoding không thành công cho "${pickupAddress}". Shop sẽ tạo với tọa độ null, cron retry sẽ cập nhật sau.`,
        );
      }
    }

    // Kiểm tra logo và banner
    if (!files?.logo?.[0] || !files?.banner?.[0]) {
      throw new BadRequestException('Bắt buộc phải upload logo và banner');
    }

    if (!files?.gallery || files.gallery.length === 0) {
      throw new BadRequestException(
        'Vui lòng upload ít nhất 1 ảnh liên quan cho gian hàng',
      );
    }

    if (files.gallery.length > UPLOAD_LIMITS.SHOP.MAX_GALLERY_IMAGES) {
      throw new BadRequestException(
        `Chỉ được upload tối đa ${UPLOAD_LIMITS.SHOP.MAX_GALLERY_IMAGES} ảnh liên quan`,
      );
    }

    // Danh sách cái Assest ID đã upload thành công
    const uploadedAssets: { id: string; public_id: string }[] = [];
    let savedShopId: string | null = null;

    try {
      // Upload logo
      const logoResult = await this.cloudinaryService.uploadFile(
        files.logo[0],
        CLOUDINARY_FOLDER.SHOP_LOGOS,
        userId,
        AssetType.SHOP_LOGO,
      );
      uploadedAssets.push({
        id: logoResult.id,
        public_id: logoResult.public_id,
      });

      // Upload banner
      const bannerResult = await this.cloudinaryService.uploadFile(
        files.banner[0],
        CLOUDINARY_FOLDER.SHOP_BANNERS,
        userId,
        AssetType.SHOP_BANNER,
      );
      uploadedAssets.push({
        id: bannerResult.id,
        public_id: bannerResult.public_id,
      });

      // Tạo mới Shop (chưa gán gallery)
      const newShop = this.shopsRepository.create({
        ...shopInfo,
        lat: resolvedLat,
        lng: resolvedLng,
        is_coordinates_verified: isCoordinatesVerified, // Trap #12: luôn set tường minh
        logo_url: logoResult.url,
        banner_url: bannerResult.url,
        seller: sellCreateShop,
        categories: categories,
      });

      const savedShop = await this.shopsRepository.save(newShop);
      savedShopId = savedShop.id;

      // Cập nhật trạng thái User (Seller) sang PENDING_APPROVAL
      await this.dataSource.manager.update(User, userId, {
        status: AccountStatus.PENDING_APPROVAL,
      });

      // Gán asset shop_id cho logo và banner
      await this.cloudinaryService.updateAssetShopId(
        logoResult.id,
        savedShop.id,
      );
      await this.cloudinaryService.updateAssetShopId(
        bannerResult.id,
        savedShop.id,
      );

      // Upload gallery theo kiểu song song để tối ưu tốc độ, KHÔNG ĐƯỢC UPLOAD
      // TỪ TỪ vì nếu có 1 tấm bị lỗi thì sẽ không kịp lưu ID của những tấm đã
      // Upload thành công trước đó vào biến uploadedAssetIds để phục vụ cho việc dọn rác sau này nếu cần thiết
      if (files?.gallery && files.gallery.length > 0) {
        // Tạo ra một mảng các tiến trình upload (chưa chạy)
        const uploadPromises = files.gallery.map(async (file) => {
          const galleryResult = await this.cloudinaryService.uploadFile(
            file,
            CLOUDINARY_FOLDER.SHOP_GALLERIES,
            userId,
            AssetType.SHOP_GALLERY,
            savedShop.id,
          );

          // QUAN TRỌNG: Ảnh nào upload thành công là GHI NỢ NGAY LẬP TỨC
          uploadedAssets.push({
            id: galleryResult.id,
            public_id: galleryResult.public_id,
          });

          // Cập nhật DB
          await this.cloudinaryService.updateAssetShopId(
            galleryResult.id,
            savedShop.id,
          );
        });

        // KÍCH HOẠT CHẠY SONG SONG TẤT CẢ CÁC ẢNH
        // Dùng allSettled để BẮT BUỘC CHỜ tất cả các file (dù thành công hay thất bại)
        const results = await Promise.allSettled(uploadPromises);

        // Kiểm tra xem trong lúc upload song song, có tấm nào bị xịt không?
        const hasError = results.some((result) => result.status === 'rejected');
        if (hasError) {
          // Chỉ cần 1 tấm xịt, ta chủ động ném lỗi.
          // Lúc này code sẽ nhảy xuống cục catch.
          // Biến uploadedAssetIds đã lưu ID của tất cả những tấm thành công!
          throw new Error('Có lỗi xảy ra trong quá trình upload ảnh Gallery');
        }
      }
      return await this.findOneByShopId(savedShop.id);
    } catch (error) {
      // NẾU CÓ LỖI THÌ BẮT ĐẦU DỌN RÁC
      if (uploadedAssets.length > 0) {
        // Xóa toàn bộ file rác vật lý trên Cloudinary
        Promise.allSettled(
          uploadedAssets.map((asset) =>
            this.cloudinaryService.deleteFile(asset.public_id),
          ),
        ).catch((cleanupError) => {
          console.error('Lỗi khi dọn rác Cloudinary:', cleanupError);
        });

        // Xóa toàn bộ bản ghi MediaAsset rác trong Database
        const assetIdsToDelete = uploadedAssets.map((asset) => asset.id);
        this.dataSource.manager
          .delete('MediaAsset', { id: In(assetIdsToDelete) })
          .catch((dbCleanupError) => {
            console.error(
              'Lỗi khi dọn rác bản ghi MediaAsset:',
              dbCleanupError,
            );
          });
      }
      if (savedShopId) {
        //Nếu lỗi xảy ra sau khi đã tạo được shop thì xóa shop đó đi để tránh dữ liệu rác trong database
        await this.shopsRepository.delete(savedShopId).catch((dbError) => {
          console.error(
            `Không thể xóa shop rác (ID: ${savedShopId}):`,
            dbError,
          );
        });
      }

      console.error('[setupInitialShop] Lỗi Khởi Tạo Gian Hàng:', error);

      throw new InternalServerErrorException(
        'Hệ thống gặp sự cố khi tạo gian hàng. Vui lòng thử lại sau!',
      );
    }
  }

  findAll() {
    return this.shopsRepository.find({ relations: ['seller', 'categories'] });
  }

  async findOneByShopId(id: string, isPublic?: boolean) {
    const whereCondition: any = { id };

    if (isPublic) {
      whereCondition.status = AccountStatus.ACTIVE;
    }

    const shop = await this.shopsRepository.findOne({
      where: whereCondition,
      relations: ['seller', 'categories', 'gallery'],
    });
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng');

    this.filterShopGallery(shop);

    if (isPublic) {
      shop.bank_account_info = null;
    }

    return shop;
  }

  async findOneByUserId(userId: string) {
    const shop = await this.shopsRepository.findOne({
      where: { seller: { id: userId } },
      relations: ['categories', 'gallery'],
    });
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng của bạn');

    this.filterShopGallery(shop);
    return shop;
  }

  async updateMyShop(userId: string, updateShopDto: UpdateShopDto) {
    const shop = await this.findOneByUserId(userId);
    if (!updateShopDto || Object.keys(updateShopDto).length === 0) {
      throw new BadRequestException('Dữ liệu cập nhật không được để trống');
    }

    // Tách lat/lng ra để xử lý geocoding riêng, không truyền thẳng qua Object.assign
    const { categoryIds, lat, lng, ...shopInfo } = updateShopDto;

    // Xác định xem địa chỉ hay tọa độ có thay đổi không
    const isAddressChanging = shopInfo.pickup_address !== undefined;
    const isCoordsProvided = lat != null || lng != null;

    // Ghi các trường text vào entity trước
    Object.assign(shop, shopInfo);

    // Geocoding chỉ chạy khi địa chỉ hoặc tọa độ thực sự thay đổi — tránh gọi API thừa
    if (isAddressChanging || isCoordsProvided) {
      const frontendLat = lat != null ? Number(lat) : NaN;
      const frontendLng = lng != null ? Number(lng) : NaN;

      if (!isNaN(frontendLat) && !isNaN(frontendLng)) {
        // Frontend gửi tọa độ hợp lệ từ autocomplete (Trap #9)
        shop.lat = String(frontendLat);
        shop.lng = String(frontendLng);
        shop.is_coordinates_verified = true;
      } else if (isAddressChanging) {
        // Địa chỉ thay đổi nhưng không có coords → fallback geocode từ backend
        // shop.pickup_address đã được cập nhật bởi Object.assign phía trên
        const targetAddress = shop.pickup_address;
        const geocodeResult = await this.geocodingService.geocode(targetAddress);

        if (geocodeResult.success && geocodeResult.lat !== null && geocodeResult.lng !== null) {
          shop.lat = String(geocodeResult.lat);
          shop.lng = String(geocodeResult.lng);
          shop.is_coordinates_verified = true;
        } else {
          // Graceful degradation — cron retry sẽ nhặt và cập nhật sau (Trap #6, #12)
          shop.lat = null;
          shop.lng = null;
          shop.is_coordinates_verified = false;
          this.logger.warn(
            `[updateMyShop] Geocoding không thành công cho "${targetAddress}". Cron retry sẽ cập nhật.`,
          );
        }
      }
    }

    if (categoryIds) {
      const parsedCategoryIds = this.parseCategoryIds(categoryIds);
      if (parsedCategoryIds.length > 0) {
        const validatedCategories =
          await this.categoriesService.validateRootCategories(parsedCategoryIds);
        shop.categories = validatedCategories;
      }
    }

    return await this.shopsRepository.save(shop);
  }

  async updateLogo(userId: string, file: Express.Multer.File) {
    return this.replaceShopAsset({
      userId,
      file,
      folder: CLOUDINARY_FOLDER.SHOP_LOGOS,
      assetType: AssetType.SHOP_LOGO,
      urlField: 'logo_url',
      errorMsg: 'Có lỗi xảy ra khi cập nhật logo',
    });
  }

  async updateBanner(userId: string, file: Express.Multer.File) {
    return this.replaceShopAsset({
      userId,
      file,
      folder: CLOUDINARY_FOLDER.SHOP_BANNERS,
      assetType: AssetType.SHOP_BANNER,
      urlField: 'banner_url',
      errorMsg: 'Có lỗi xảy ra khi cập nhật banner',
    });
  }

  async addGalleryImages(userId: string, files: Express.Multer.File[]) {
    const shop = await this.shopsRepository.findOne({
      where: { seller: { id: userId } },
      relations: ['gallery'],
    });
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng của bạn');

    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng tải lên ít nhất 1 ảnh');
    }

    const shopGallery = (shop.gallery || []).filter(
      (asset) => asset.type === AssetType.SHOP_GALLERY,
    );

    if (
      shopGallery.length + files.length >
      UPLOAD_LIMITS.SHOP.MAX_GALLERY_IMAGES
    ) {
      throw new BadRequestException(
        `Bạn chỉ được upload tối đa ${UPLOAD_LIMITS.SHOP.MAX_GALLERY_IMAGES} ảnh liên quan. Hiện tại bạn đã có ${shopGallery.length} ảnh, không thể upload thêm ${files.length} ảnh.`,
      );
    }

    const uploadedAssets: { id: string; public_id: string }[] = [];

    try {
      const uploadPromises = files.map(async (file) => {
        const galleryResult = await this.cloudinaryService.uploadFile(
          file,
          CLOUDINARY_FOLDER.SHOP_GALLERIES,
          userId,
          AssetType.SHOP_GALLERY,
          shop.id,
        );

        uploadedAssets.push({
          id: galleryResult.id,
          public_id: galleryResult.public_id,
        });
      });

      const results = await Promise.allSettled(uploadPromises);
      const hasError = results.some((result) => result.status === 'rejected');

      if (hasError) {
        throw new Error('Có lỗi xảy ra trong quá trình upload ảnh Gallery');
      }

      return await this.findOneByUserId(userId);
    } catch (error) {
      if (uploadedAssets.length > 0) {
        // 1. Xóa file Cloudinary
        Promise.allSettled(
          uploadedAssets.map((asset) =>
            this.cloudinaryService.deleteFile(asset.public_id),
          ),
        ).catch((e) => console.error(e));

        // 2. Xóa bản ghi DB
        const assetIdsToDelete = uploadedAssets.map((asset) => asset.id);
        this.dataSource.manager
          .delete('MediaAsset', { id: In(assetIdsToDelete) })
          .catch((e) => console.error(e));
      }

      throw new InternalServerErrorException(
        'Hệ thống gặp sự cố khi upload ảnh. Vui lòng thử lại!',
      );
    }
  }

  async removeGalleryImage(userId: string, assetId: string) {
    const shop = await this.findOneByUserId(userId);

    // Kiểm tra ảnh có tồn tại và thuộc về shop/user này không
    const asset = await this.cloudinaryService.findAssetById(assetId);

    if (!asset || asset.owner?.id !== userId) {
      throw new BadRequestException(
        'Không tìm thấy hình ảnh hoặc bạn không có quyền xóa',
      );
    }

    // Kiểm tra type có phải là GALLERY không
    if (asset.type !== AssetType.SHOP_GALLERY) {
      throw new BadRequestException(
        'Bạn chỉ có quyền xóa hình ảnh trong bộ sưu tập (gallery)',
      );
    }

    await this.cloudinaryService.deleteAsset(assetId, userId);

    return await this.findOneByUserId(userId);
  }

  async approveShop(id: string) {
    // Lấy data trước khi vào transaction để giảm thời gian khóa (lock) Database
    const shop = await this.findOneByShopId(id);

    // Mở Transaction
    return await this.dataSource.transaction(async (manager) => {
      // Cập nhật trạng thái Shop
      shop.status = AccountStatus.ACTIVE;
      const updatedShop = await manager.save(Shop, shop);

      // Cập nhật trạng thái User (Seller) sang ACTIVE
      if (shop.seller) {
        await manager.update(User, shop.seller.id, {
          status: AccountStatus.ACTIVE,
        });
      }

      // TODO: Gửi email cho seller báo tin vui (Nên dùng Event Emitter bắn sự kiện ra ngoài)

      return updatedShop;
    });
  }

  async rejectShop(id: string, reason: string) {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException(
        'Vui lòng cung cấp lý do từ chối gian hàng để báo cho Seller.',
      );
    }

    const shop = await this.findOneByShopId(id);

    // Mở Transaction
    const updatedShop = await this.dataSource.transaction(async (manager) => {
      // Cập nhật trạng thái Shop
      shop.status = AccountStatus.REJECTED;

      // Lưu lý do từ chối vào database
      shop.reject_reason = reason;

      const savedShop = await manager.save(Shop, shop);

      // Cập nhật trạng thái User
      if (shop.seller) {
        await manager.update(User, shop.seller.id, {
          status: AccountStatus.REJECTED,
        });
      }

      return savedShop;
    });

    // Gửi email cho seller báo lý do (reason) để họ biết đường sửa
    if (shop.seller) {
      await this.mailService
        .sendShopRejectionEmail(shop.seller, shop.name, reason)
        .catch((err) => {
          this.logger.error('Lỗi khi gửi email reject shop:', err);
        });
    }

    return updatedShop;
  }

  async reApplyShop(
    userId: string,
    updateShopDto?: UpdateShopDto,
    files?: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    const shop = await this.findOneByUserId(userId);

    if (shop.status !== AccountStatus.REJECTED) {
      throw new BadRequestException(
        'Gian hàng của bạn không ở trạng thái bị từ chối',
      );
    }

    // 1. Tái sử dụng các hàm update có sẵn
    if (updateShopDto && Object.keys(updateShopDto).length > 0) {
      await this.updateMyShop(userId, updateShopDto);
    }

    if (files?.logo?.[0]) {
      await this.updateLogo(userId, files.logo[0]);
    }

    if (files?.banner?.[0]) {
      await this.updateBanner(userId, files.banner[0]);
    }

    if (files?.gallery && files.gallery.length > 0) {
      await this.addGalleryImages(userId, files.gallery);
    }

    // 2. Chạy transaction đổi trạng thái duyệt
    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        // Cập nhật trạng thái Shop sang PENDING_APPROVAL và xóa lý do từ chối cũ
        await transactionalEntityManager.update(Shop, shop.id, {
          status: AccountStatus.PENDING_APPROVAL,
          reject_reason: null,
        });

        // Cập nhật trạng thái User (Seller) sang PENDING_APPROVAL
        await transactionalEntityManager.update(User, userId, {
          status: AccountStatus.PENDING_APPROVAL,
        });

        return await this.findOneByUserId(userId);
      },
    );
  }

  async getPendingShops() {
    const shops = await this.shopsRepository.find({
      where: { status: AccountStatus.PENDING_APPROVAL },
      relations: ['seller', 'categories', 'gallery'],
    });
    shops.forEach((shop) => this.filterShopGallery(shop));
    return shops;
  }

  async getShopWithSeller(shopId: string): Promise<Shop | null> {
    return this.shopsRepository.findOne({
      where: { id: shopId },
      relations: ['seller'],
      select: { id: true, seller: { id: true } },
    });
  }

  async findUnverifiedShops(limit = 20): Promise<Shop[]> {
    const findOptions = {
      where: { is_coordinates_verified: false },
      take: limit,
      order: { created_at: 'ASC' as const }, // Ưu tiên shop cũ hơn để retry theo thứ tự tạo
    };
    const shops = await this.shopsRepository.find(findOptions);
    return shops;
  }

  async updateShopCoordinates(
    shopId: string,
    lat: string,
    lng: string,
  ): Promise<void> {
    const targetId = shopId;
    const updatePayload = {
      lat: lat,
      lng: lng,
      is_coordinates_verified: true,
    };
    await this.shopsRepository.update(targetId, updatePayload);
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private filterShopGallery(shop: Shop): void {
    if (shop.gallery) {
      shop.gallery = shop.gallery.filter(
        (asset) => asset.type === AssetType.SHOP_GALLERY,
      );
    }
  }

  private parseCategoryIds(raw: any): string[] {
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        parsed = [raw];
      }
    }
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }
    return parsed as string[];
  }

  private async replaceShopAsset(params: {
    userId: string;
    file: Express.Multer.File;
    folder: string;
    assetType: AssetType;
    urlField: 'logo_url' | 'banner_url';
    errorMsg: string;
  }): Promise<Shop> {
    const { userId, file, folder, assetType, urlField, errorMsg } = params;
    const shop = await this.findOneByUserId(userId);
    let newAssetResult: any = null;

    try {
      newAssetResult = await this.cloudinaryService.uploadFile(
        file,
        folder,
        userId,
        assetType,
        shop.id,
      );

      await this.shopsRepository.update(
        shop.id,
        { [urlField]: newAssetResult.url } as any,
      );

      const oldUrl = shop[urlField];
      if (oldUrl) {
        const oldAsset = await this.cloudinaryService.findAssetByUrl(oldUrl);
        if (oldAsset) {
          await this.cloudinaryService
            .deleteAsset(oldAsset.id, userId)
            .catch((e) => console.error(e));
        }
      }

      return await this.findOneByUserId(userId);
    } catch (error) {
      if (newAssetResult) {
        await this.cloudinaryService
          .deleteAsset(newAssetResult.id, userId)
          .catch((e) => console.error(e));
      }
      throw new InternalServerErrorException(errorMsg);
    }
  }

  async countAll(): Promise<number> {
    return this.shopsRepository.count();
  }

  async countByStatus(status: AccountStatus): Promise<number> {
    return this.shopsRepository.count({ where: { status } });
  }
}

