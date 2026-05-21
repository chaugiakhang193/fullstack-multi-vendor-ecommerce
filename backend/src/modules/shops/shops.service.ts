import 'multer';
import {
  Inject,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
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

// Enums
import { AccountStatus, AssetType, CloudinaryFolder } from '@/modules/enums';

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopsRepository: Repository<Shop>,
    @Inject(forwardRef(() => CategoriesService))
    private readonly categoriesService: CategoriesService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly userService: UsersService,
    @InjectDataSource() private dataSource: DataSource,
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
    const { categoryIds, ...shopInfo } = createShopDto;

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
    // Convert categoryIds to array if it's sent as a string (from multipart/form-data)
    let parsedCategoryIds = categoryIds;
    if (typeof categoryIds === 'string') {
      try {
        parsedCategoryIds = JSON.parse(categoryIds);
      } catch (e) {
        parsedCategoryIds = [categoryIds];
      }
    }

    //Ép kiểu an toàn phòng trường họp frontend gửi CategoryIds là một chuỗi số
    //Không xử lý là sập server do lỗi kiểu dữ liệu, ép thành mảng 1 phần tử để xử lý tiếp
    if (!Array.isArray(parsedCategoryIds)) {
      parsedCategoryIds = [parsedCategoryIds];
    }

    if (parsedCategoryIds && parsedCategoryIds.length > 0) {
      categories =
        await this.categoriesService.validateRootCategories(parsedCategoryIds);
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

    if (files.gallery.length > 3) {
      throw new BadRequestException('Chỉ được upload tối đa 3 ảnh liên quan');
    }

    // Danh sách cái Assest ID đã upload thành công
    const uploadedAssets: { id: string; public_id: string }[] = [];
    let savedShopId: string | null = null;

    try {
      // Upload logo
      const logoResult = await this.cloudinaryService.uploadFile(
        files.logo[0],
        CloudinaryFolder.SHOP_LOGOS,
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
        CloudinaryFolder.SHOP_BANNERS,
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
            CloudinaryFolder.SHOP_GALLERIES,
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
    return shop;
  }

  async findOneByUserId(userId: string) {
    const shop = await this.shopsRepository.findOne({
      where: { seller: { id: userId } },
      relations: ['categories', 'gallery'],
    });
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng của bạn');
    return shop;
  }

  async updateMyShop(userId: string, updateShopDto: UpdateShopDto) {
    const shop = await this.findOneByUserId(userId);
    if (!updateShopDto || Object.keys(updateShopDto).length === 0) {
      throw new BadRequestException('Dữ liệu cập nhật không được để trống');
    }
    const { categoryIds, ...shopInfo } = updateShopDto;

    Object.assign(shop, shopInfo);

    if (categoryIds) {
      let parsedCategoryIds = categoryIds;
      if (typeof categoryIds === 'string') {
        try {
          parsedCategoryIds = JSON.parse(categoryIds);
        } catch (e) {
          parsedCategoryIds = [categoryIds];
        }
      }

      if (parsedCategoryIds && parsedCategoryIds.length > 0) {
        shop.categories =
          await this.categoriesService.validateRootCategories(
            parsedCategoryIds,
          );
      }
    }

    return await this.shopsRepository.save(shop);
  }

  async updateLogo(userId: string, file: Express.Multer.File) {
    const shop = await this.findOneByUserId(userId);
    let newAssetResult: any = null;

    try {
      newAssetResult = await this.cloudinaryService.uploadFile(
        file,
        CloudinaryFolder.SHOP_LOGOS,
        userId,
        AssetType.SHOP_LOGO,
        shop.id,
      );

      await this.shopsRepository.update(shop.id, {
        logo_url: newAssetResult.url,
      });

      if (shop.logo_url) {
        const oldAsset = await this.cloudinaryService.findAssetByUrl(
          shop.logo_url,
        );
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
      throw new InternalServerErrorException('Có lỗi xảy ra khi cập nhật logo');
    }
  }

  async updateBanner(userId: string, file: Express.Multer.File) {
    const shop = await this.findOneByUserId(userId);
    let newAssetResult: any = null;

    try {
      newAssetResult = await this.cloudinaryService.uploadFile(
        file,
        CloudinaryFolder.SHOP_BANNERS,
        userId,
        AssetType.SHOP_BANNER,
        shop.id,
      );

      await this.shopsRepository.update(shop.id, {
        banner_url: newAssetResult.url,
      });

      if (shop.banner_url) {
        const oldAsset = await this.cloudinaryService.findAssetByUrl(
          shop.banner_url,
        );
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
      throw new InternalServerErrorException(
        'Có lỗi xảy ra khi cập nhật banner',
      );
    }
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

    if (shop.gallery.length + files.length > 3) {
      throw new BadRequestException(
        `Bạn chỉ được upload tối đa 3 ảnh liên quan. Hiện tại bạn đã có ${shop.gallery.length} ảnh, không thể upload thêm ${files.length} ảnh.`,
      );
    }

    const uploadedAssets: { id: string; public_id: string }[] = [];

    try {
      const uploadPromises = files.map(async (file) => {
        const galleryResult = await this.cloudinaryService.uploadFile(
          file,
          CloudinaryFolder.SHOP_GALLERIES,
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

      return await this.shopsRepository.findOne({
        where: { id: shop.id },
        relations: ['gallery'],
      });
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

    return await this.shopsRepository.findOne({
      where: { id: shop.id },
      relations: ['gallery'],
    });
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
    return await this.dataSource.transaction(async (manager) => {
      // Cập nhật trạng thái Shop
      shop.status = AccountStatus.REJECTED;

      // Nếu trong Entity Shop bạn có làm thêm cột reject_reason thì gán luôn ở đây:
      // shop.reject_reason = reason;

      const updatedShop = await manager.save(Shop, shop);

      // Cập nhật trạng thái User
      if (shop.seller) {
        await manager.update(User, shop.seller.id, {
          status: AccountStatus.REJECTED,
        });
      }

      // TODO: Gửi email cho seller báo lý do (reason) để họ biết đường sửa

      return updatedShop;
    });
  }

  async reApplyShop(userId: string) {
    const shop = await this.findOneByUserId(userId);

    if (shop.status !== AccountStatus.REJECTED) {
      throw new BadRequestException(
        'Gian hàng của bạn không ở trạng thái bị từ chối',
      );
    }

    // Bắt đầu Transaction
    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        // Cập nhật trạng thái Shop sang PENDING_APPROVAL
        shop.status = AccountStatus.PENDING_APPROVAL;
        const updatedShop = await transactionalEntityManager.save(shop);

        //cập nhật trạng thái User (Seller) sang PENDING_APPROVAL
        await transactionalEntityManager.update(User, userId, {
          status: AccountStatus.PENDING_APPROVAL,
        });

        return updatedShop;
      },
    );
  }

  async getPendingShops() {
    return this.shopsRepository.find({
      where: { status: AccountStatus.PENDING_APPROVAL },
      relations: ['seller', 'categories', 'gallery'],
    });
  }
}
