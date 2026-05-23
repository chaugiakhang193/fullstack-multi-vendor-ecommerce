import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

// Services
import { ProductsService } from '@/modules/products/products.service';

// DTOs
import { CreateProductDto } from '@/modules/products/dto/create-product.dto';
import { UpdateProductDto } from '@/modules/products/dto/update-product.dto';
import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';
import {
  CreateProductSwaggerDto,
  UpdateProductSwaggerDto,
} from '@/modules/products/dto/product-swagger.dto';

// Guards & Decorators
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';
import { ResponseMessage } from '@/decorator/customize';

// Enums & Interfaces
import { UserRole } from '@/modules/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('seller-products')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'general_gallery', maxCount: 5 },
      { name: 'variant_images', maxCount: 30 },
    ]),
  )
  @ApiOperation({ summary: 'Seller tạo sản phẩm mới' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateProductSwaggerDto })
  @ResponseMessage('Tạo sản phẩm thành công')
  @ApiGenericResponse(ProductResponseDto, 'Tạo sản phẩm thành công', {
    status: 201,
  })
  @ApiResponse({
    status: 400,
    description:
      'Dữ liệu đầu vào không hợp lệ hoặc vượt định lượng ảnh tải lên',
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description:
      'Không có quyền Seller hoặc tài khoản shop chưa được duyệt/kích hoạt',
  })
  create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      general_gallery?: Express.Multer.File[];
      variant_images?: Express.Multer.File[];
    },
    @User() user: IUser,
  ) {
    return this.productsService.create(createProductDto, files, user);
  }

  @Get()
  @ApiOperation({ summary: 'Seller lấy danh sách sản phẩm của chính mình' })
  @ResponseMessage('Lấy danh sách sản phẩm thành công')
  @ApiGenericResponse(ProductResponseDto, 'Lấy danh sách sản phẩm thành công', {
    isArray: true,
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description: 'Không có quyền Seller hoặc chưa kích hoạt shop',
  })
  getSellerInventory(@User() user: IUser) {
    // TODO: Implement pagination
    return this.productsService.getSellerInventory(user.sub);
  }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'general_gallery', maxCount: 5 },
      { name: 'variant_images', maxCount: 30 },
    ]),
  )
  @ApiOperation({ summary: 'Seller cập nhật sản phẩm' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateProductSwaggerDto })
  @ResponseMessage('Cập nhật sản phẩm thành công')
  @ApiGenericResponse(ProductResponseDto, 'Cập nhật sản phẩm thành công')
  @ApiResponse({ status: 400, description: 'Dữ liệu cập nhật không hợp lệ' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy sản phẩm cần cập nhật',
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description:
      'Không có quyền Seller hoặc sản phẩm không thuộc về shop của người dùng',
  })
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      general_gallery?: Express.Multer.File[];
      variant_images?: Express.Multer.File[];
    },
    @User() user: IUser,
  ) {
    return this.productsService.update(id, updateProductDto, files, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Seller lấy chi tiết sản phẩm của chính mình' })
  @ResponseMessage('Lấy chi tiết sản phẩm thành công')
  @ApiGenericResponse(ProductResponseDto, 'Lấy chi tiết sản phẩm thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description: 'Không có quyền Seller hoặc sản phẩm không thuộc về shop',
  })
  findOne(@Param('id') id: string, @User() user: IUser) {
    const userId = user.sub;
    return this.productsService.findOneForSeller(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Seller xóa sản phẩm (Soft delete)' })
  @ResponseMessage('Xóa sản phẩm thành công')
  @ApiGenericResponse('Xóa sản phẩm thành công')
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy sản phẩm hoặc sản phẩm đã bị xóa trước đó',
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description:
      'Không có quyền Seller hoặc sản phẩm không thuộc về shop của người dùng',
  })
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.productsService.remove(id, user);
  }
}
