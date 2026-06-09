import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';

// Services
import { OrdersService } from '@/modules/orders/orders.service';

// DTOs
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';

// Decorators
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';

// Enums & Interfaces
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

// Mẫu UUID v4 (cho phép cả v1-v5) — kiểm tra rẻ ở Controller trước khi chạm DB
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('orders')
@ApiBearerAuth('access-token')
@Roles(UserRole.CUSTOMER, UserRole.SELLER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Đặt hàng (Checkout) với cơ chế chống gửi trùng bằng Idempotency-Key',
    description:
      'Yêu cầu header `Idempotency-Key` là UUID. Nếu key đang PENDING → 409 Conflict. Nếu key đã COMPLETED và thuộc cùng user → replay response gốc.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'UUID do client sinh để chống gửi trùng đơn hàng',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ResponseMessage('Đặt hàng thành công')
  @ApiResponse({ status: 201, description: 'Tạo đơn hàng thành công' })
  @ApiBadRequestResponse({
    description:
      'Dữ liệu không hợp lệ (thiếu/sai Idempotency-Key, sản phẩm hết hàng, coupon không hợp lệ, ...)',
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description:
      'Admin không được phép checkout; hoặc Idempotency-Key thuộc về user khác',
  })
  @ApiConflictResponse({
    description: 'Một request khác cùng Idempotency-Key đang xử lý dở dang',
  })
  checkout(
    @User() user: IUser,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateOrderDto,
  ) {
    // Validate sớm ở Controller để chốt chặn rẻ trước khi chạm transaction
    if (!idempotencyKey) {
      const missingKeyMsg = 'Yêu cầu phải kèm header Idempotency-Key';
      throw new BadRequestException(missingKeyMsg);
    }
    const isValidUuid = UUID_PATTERN.test(idempotencyKey);
    if (!isValidUuid) {
      const invalidKeyMsg = 'Idempotency-Key phải là UUID hợp lệ';
      throw new BadRequestException(invalidKeyMsg);
    }

    const userId = user.sub;
    return this.ordersService.checkout(userId, dto, idempotencyKey);
  }
}
