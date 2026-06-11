import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

// Services
import {
  NominatimService,
  AutocompleteResult,
} from './nominatim.service';

// Decorators
import { Roles } from '@/decorator/roles.decorator';
import { ResponseMessage } from '@/decorator/customize';

// Enums
import { UserRole } from '@/common/enums';

@ApiTags('geocoding')
@ApiBearerAuth('access-token')
@Roles(UserRole.CUSTOMER, UserRole.SELLER)
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly nominatimService: NominatimService) {}

  // Proxy gợi ý địa chỉ (giấu API key LocationIQ). Throttle chặt hơn global để chặn spam đốt quota.
  @Get('autocomplete')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ResponseMessage('Lấy gợi ý địa chỉ thành công')
  @ApiOperation({ summary: 'Gợi ý địa chỉ (LocationIQ proxy)' })
  @ApiQuery({ name: 'q', required: true, description: 'Chuỗi địa chỉ đang gõ' })
  autocomplete(@Query('q') q: string): Promise<AutocompleteResult[]> {
    const safeQuery = q ?? '';
    return this.nominatimService.autocomplete(safeQuery);
  }
}
