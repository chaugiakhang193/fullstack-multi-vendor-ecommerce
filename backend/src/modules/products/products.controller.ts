import { Controller, Get, Param, Res, ParseUUIDPipe } from '@nestjs/common';
import * as express from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

// Services
import { ProductsService } from '@/modules/products/products.service';

// DTOs
import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';

// Decorators
import { Public, ResponseMessage } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

@ApiTags('products')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ResponseMessage('Lấy danh sách sản phẩm thành công')
  @ApiOperation({ summary: 'Khách hàng lấy danh sách sản phẩm (Public)' })
  @ApiGenericResponse(ProductResponseDto, 'Lấy danh sách sản phẩm thành công', {
    isArray: true,
  })
  findAll() {
    // TODO: Implement pagination
    return this.productsService.findAll();
  }

  @Get('shop/:shopId')
  @ResponseMessage('Lấy danh sách sản phẩm của gian hàng thành công')
  @ApiOperation({ summary: 'Khách hàng lấy danh sách sản phẩm của một gian hàng (Public)' })
  @ApiGenericResponse(ProductResponseDto, 'Lấy danh sách sản phẩm của gian hàng thành công', {
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'ID gian hàng không đúng định dạng UUID' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy gian hàng hoặc gian hàng bị khóa' })
  getPublicCatalogByShop(@Param('shopId', ParseUUIDPipe) shopId: string) {
    return this.productsService.getPublicCatalogByShop(shopId);
  }

  @Get(':id')
  @ResponseMessage('Lấy chi tiết sản phẩm thành công')
  @ApiOperation({ summary: 'Khách hàng lấy chi tiết sản phẩm (Public)' })
  @ApiGenericResponse(ProductResponseDto, 'Lấy chi tiết sản phẩm thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm' })
  async findOne(
    @Param('id') idWithSlug: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const product = await this.productsService.findOne(idWithSlug, true);

    // Logic SEO Redirect 301
    // Nếu URL không chứa '-i.' hoặc slug không khớp với slug hiện tại trong DB
    const canonicalPart = `${product.slug}-i.${product.id}`;

    if (idWithSlug !== canonicalPart) {
      return res.redirect(301, `/api/v1/products/${canonicalPart}`);
    }

    return product;
  }
}
