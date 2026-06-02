import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Redirect,
} from '@nestjs/common';
import * as express from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

// Services
import { ProductsService } from '@/modules/products/products.service';

// DTOs
import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';

// Decorators
import { Public, ResponseMessage } from '@/decorator/customize';
import {
  ApiGenericResponse,
  ApiPaginatedResponse,
} from '@/decorator/api-response.decorator';
import { GetProductsQueryDto } from '@/modules/products/dto/get-products-query.dto';

@ApiTags('products')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ResponseMessage('Lấy danh sách sản phẩm thành công')
  @ApiOperation({ summary: 'Khách hàng lấy danh sách sản phẩm (Public)' })
  @ApiPaginatedResponse(ProductResponseDto, 'Lấy danh sách sản phẩm thành công')
  findAll(@Query() query: GetProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('shop/:shopId')
  @ResponseMessage('Lấy danh sách sản phẩm của gian hàng thành công')
  @ApiOperation({
    summary: 'Khách hàng lấy danh sách sản phẩm của một gian hàng (Public)',
  })
  @ApiPaginatedResponse(
    ProductResponseDto,
    'Lấy danh sách sản phẩm của gian hàng thành công',
  )
  @ApiResponse({
    status: 400,
    description: 'ID gian hàng không đúng định dạng UUID',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy gian hàng hoặc gian hàng bị khóa',
  })
  getPublicCatalogByShop(
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Query() query: GetProductsQueryDto,
  ) {
    return this.productsService.getPublicCatalogByShop(shopId, query);
  }

  @Get(':id')
  @ResponseMessage('Lấy chi tiết sản phẩm thành công')
  @ApiOperation({ summary: 'Khách hàng lấy chi tiết sản phẩm (Public)' })
  @ApiGenericResponse(ProductResponseDto, 'Lấy chi tiết sản phẩm thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm' })
  async findOne(@Param('id') idWithSlug: string) {
    return await this.productsService.findOne(idWithSlug, true);
  }
}
