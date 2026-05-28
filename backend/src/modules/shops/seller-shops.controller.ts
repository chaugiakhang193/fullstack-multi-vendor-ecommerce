import 'multer';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import {
  FileInterceptor,
  FileFieldsInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

// Services
import { ShopsService } from '@/modules/shops/shops.service';

// DTOs
import { CreateShopDto } from '@/modules/shops/dto/create-shop.dto';
import { UpdateShopDto } from '@/modules/shops/dto/update-shop.dto';
import {
  SetupShopSwaggerDto,
  UpdateShopSwaggerDto,
  UploadSingleFileSwaggerDto,
  UploadMultipleFilesSwaggerDto,
} from '@/modules/shops/dto/shop-swagger.dto';
import { ShopResponseDto } from '@/modules/shops/dto/shop-response.dto';

// Guards & Decorators
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

// Enums & Interfaces
import { UserRole } from '@/common/enums';
import { UPLOAD_LIMITS } from '@/common/constants/upload.constant';
import type { IUser } from '@/interface/user.interface';

@ApiTags('seller-shops')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@ApiUnauthorizedResponse({
  description: 'Chưa đăng nhập hoặc Token hết hạn.',
})
@ApiForbiddenResponse({
  description: 'Chỉ dành cho tài khoản có quyền SELLER.',
})
@Controller('seller/shops')
export class SellerShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post('setup')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: UPLOAD_LIMITS.SHOP.MAX_LOGOS },
      { name: 'banner', maxCount: UPLOAD_LIMITS.SHOP.MAX_BANNERS },
      { name: 'gallery', maxCount: UPLOAD_LIMITS.SHOP.MAX_GALLERY_IMAGES },
    ]),
  )
  @ResponseMessage('Khởi tạo gian hàng thành công, vui lòng chờ Admin duyệt.')
  @ApiOperation({
    summary: 'Seller khởi tạo thông tin gian hàng lần đầu',
    description:
      'Yêu cầu: \n' +
      '- Phải là tài khoản Seller chưa có gian hàng. \n' +
      '- Phải upload đủ logo (1), banner (1) và gallery (1-3 ảnh). \n' +
      '- categoryIds phải là danh mục gốc (không có danh mục cha).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SetupShopSwaggerDto })
  @ApiGenericResponse(ShopResponseDto, 'Khởi tạo thành công, đang chờ duyệt.', {
    status: 201,
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc thiếu file.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người dùng.' })
  setup(
    @User() user: IUser,
    @Body() createShopDto: CreateShopDto,
    @UploadedFiles()
    files: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    const userId = user.sub;
    return this.shopsService.setupInitialShop(userId, createShopDto, files);
  }

  @Get()
  @ResponseMessage('Lấy chi tiết gian hàng thành công.')
  @ApiOperation({ summary: 'Seller lấy chi tiết gian hàng của mình' })
  @ApiGenericResponse(ShopResponseDto, 'Lấy chi tiết gian hàng thành công.')
  getMyShop(@User() user: IUser) {
    const userId = user.sub;
    return this.shopsService.findOneByUserId(userId);
  }

  @Patch()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: UPLOAD_LIMITS.SHOP.MAX_LOGOS },
      { name: 'banner', maxCount: UPLOAD_LIMITS.SHOP.MAX_BANNERS },
      { name: 'gallery', maxCount: UPLOAD_LIMITS.SHOP.MAX_GALLERY_IMAGES },
    ]),
  )
  @ResponseMessage('Cập nhật thông tin gian hàng thành công.')
  @ApiOperation({ summary: 'Seller cập nhật thông tin gian hàng của mình' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateShopSwaggerDto })
  @ApiGenericResponse(ShopResponseDto, 'Cập nhật thông tin thành công.')
  async updateMyShop(
    @User() user: IUser,
    @Body() updateShopDto: UpdateShopDto,
    @UploadedFiles()
    files: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    const userId = user.sub;
    if (updateShopDto && Object.keys(updateShopDto).length > 0) {
      await this.shopsService.updateMyShop(userId, updateShopDto);
    }

    if (files?.logo?.[0]) {
      await this.shopsService.updateLogo(userId, files.logo[0]);
    }

    if (files?.banner?.[0]) {
      await this.shopsService.updateBanner(userId, files.banner[0]);
    }

    if (files?.gallery && files.gallery.length > 0) {
      await this.shopsService.addGalleryImages(userId, files.gallery);
    }
    return await this.shopsService.findOneByUserId(userId);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file'))
  @ResponseMessage('Cập nhật logo thành công.')
  @ApiOperation({ summary: 'Seller cập nhật logo gian hàng' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadSingleFileSwaggerDto })
  @ApiGenericResponse(ShopResponseDto, 'Cập nhật logo thành công.')
  uploadLogo(@User() user: IUser, @UploadedFile() file: Express.Multer.File) {
    const userId = user.sub;
    return this.shopsService.updateLogo(userId, file);
  }

  @Post('banner')
  @UseInterceptors(FileInterceptor('file'))
  @ResponseMessage('Cập nhật banner thành công.')
  @ApiOperation({ summary: 'Seller cập nhật banner gian hàng' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadSingleFileSwaggerDto })
  @ApiGenericResponse(ShopResponseDto, 'Cập nhật banner thành công.')
  uploadBanner(@User() user: IUser, @UploadedFile() file: Express.Multer.File) {
    const userId = user.sub;
    return this.shopsService.updateBanner(userId, file);
  }

  @Post('re-apply')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: UPLOAD_LIMITS.SHOP.MAX_LOGOS },
      { name: 'banner', maxCount: UPLOAD_LIMITS.SHOP.MAX_BANNERS },
      { name: 'gallery', maxCount: UPLOAD_LIMITS.SHOP.MAX_GALLERY_IMAGES },
    ]),
  )
  @ResponseMessage('Đã nộp lại đơn đăng ký gian hàng thành công.')
  @ApiOperation({ summary: 'Seller nộp lại đơn đăng ký sau khi bị từ chối' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateShopSwaggerDto })
  @ApiGenericResponse(ShopResponseDto, 'Nộp lại đơn đăng ký thành công.')
  reApplyShop(
    @User() user: IUser,
    @Body() updateShopDto: UpdateShopDto,
    @UploadedFiles()
    files: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    const userId = user.sub;
    return this.shopsService.reApplyShop(userId, updateShopDto, files);
  }

  @Post('gallery')
  @UseInterceptors(
    FilesInterceptor('files', UPLOAD_LIMITS.SHOP.MAX_GALLERY_IMAGES),
  )
  @ResponseMessage('Thêm ảnh liên quan thành công.')
  @ApiOperation({ summary: 'Seller thêm tối đa 3 ảnh vào gallery' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadMultipleFilesSwaggerDto })
  @ApiGenericResponse(ShopResponseDto, 'Thêm ảnh thành công.')
  addGalleryImages(
    @User() user: IUser,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const userId = user.sub;
    return this.shopsService.addGalleryImages(userId, files);
  }

  @Delete('gallery/:assetId')
  @ResponseMessage('Xóa ảnh liên quan thành công.')
  @ApiOperation({ summary: 'Seller xóa 1 ảnh khỏi gallery' })
  @ApiGenericResponse(ShopResponseDto, 'Xóa ảnh thành công.')
  removeGalleryImage(@User() user: IUser, @Param('assetId') assetId: string) {
    const userId = user.sub;
    return this.shopsService.removeGalleryImage(userId, assetId);
  }
}
