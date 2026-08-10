import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

// Services
import { PaymentsService } from './payments.service';

// Decorators & Enums
import { Roles } from '@/decorator/roles.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';

@ApiTags('admin-payments')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('backfill-cod-completed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin backfill payment COD đã DELIVERED trước khi có cơ chế tự động đánh dấu COMPLETED',
  })
  @ResponseMessage('Đã backfill payment COD hoàn tất')
  backfillCodCompleted() {
    return this.paymentsService.backfillCodCompletedPayments();
  }
}
