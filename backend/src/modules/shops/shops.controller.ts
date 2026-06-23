import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';

// Services
import { ShopsService } from '@/modules/shops/shops.service';

// DTOs
import { ShopResponseDto, PublicShopResponseDto } from '@/modules/shops/dto/shop-response.dto';

// Guards & Decorators
import { ResponseMessage, Public } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

@ApiTags('shops')
@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Public()
  @Get(':id')
  @ResponseMessage('Lấy chi tiết gian hàng thành công.')
  @ApiOperation({
    summary: 'Lấy chi tiết một gian hàng cho khách hàng (Public)',
  })
  @ApiGenericResponse(PublicShopResponseDto, 'Lấy chi tiết gian hàng thành công.')
  @ApiResponse({ status: 404, description: 'Không tìm thấy gian hàng.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopsService.findOneByShopId(id, true);
  }
}
