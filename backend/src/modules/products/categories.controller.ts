import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiResponse,
} from '@nestjs/swagger';

// Services
import { CategoriesService } from '@/modules/products/categories.service';

// DTOs
import { CreateCategoryDto } from '@/modules/products/dto/create-category.dto';
import { UpdateCategoryDto } from '@/modules/products/dto/update-category.dto';
import { CategoryResponseDto } from '@/modules/products/dto/category-response.dto';

// Guards & Decorators
import { Roles } from '@/decorator/roles.decorator';
import { ResponseMessage, Public } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

// Enums
import { UserRole } from '@/modules/enums';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Tạo danh mục thành công')
  @ApiOperation({ summary: 'Admin tạo danh mục mới' })
  @ApiGenericResponse(CategoryResponseDto, 'Tạo danh mục thành công', {
    status: 201,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({ description: 'Không có quyền Admin' })
  @ApiResponse({ status: 409, description: 'Danh mục hoặc Slug đã tồn tại' })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @Public()
  @ResponseMessage('Lấy danh mục thành công')
  @ApiOperation({ summary: 'Lấy danh sách tất cả danh mục (Public)' })
  @ApiGenericResponse(
    CategoryResponseDto,
    'Lấy danh sách danh mục thành công',
    {
      isArray: true,
    },
  )
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @Public()
  @ResponseMessage('Lấy chi tiết danh mục thành công')
  @ApiOperation({ summary: 'Lấy chi tiết một danh mục' })
  @ApiGenericResponse(CategoryResponseDto, 'Lấy chi tiết danh mục thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy danh mục' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOneById(id);
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Cập nhật danh mục thành công')
  @ApiOperation({ summary: 'Admin cập nhật danh mục' })
  @ApiGenericResponse(CategoryResponseDto, 'Cập nhật danh mục thành công')
  @ApiResponse({ status: 400, description: 'Dữ liệu cập nhật không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({ description: 'Không có quyền Admin' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy danh mục để cập nhật',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.updateById(id, updateCategoryDto);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Xóa danh mục thành công')
  @ApiOperation({ summary: 'Admin xóa danh mục' })
  @ApiGenericResponse('Xóa danh mục thành công')
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({ description: 'Không có quyền Admin' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy danh mục để xóa' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.removeById(id);
  }
}
