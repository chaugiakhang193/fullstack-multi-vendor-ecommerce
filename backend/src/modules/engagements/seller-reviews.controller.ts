import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

// Services
import { EngagementsService } from '@/modules/engagements/engagements.service';

// DTOs
import { ReplyReviewDto } from '@/modules/engagements/dto/reply-review.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

// Decorators & Enums
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('seller-reviews')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@Controller('seller/reviews')
export class SellerReviewsController {
  constructor(private readonly service: EngagementsService) {}

  @Get()
  @ResponseMessage('Lấy đánh giá của shop thành công')
  list(@User() user: IUser, @Query() query: PaginationQueryDto) {
    const sellerId = user.sub;
    const result = this.service.getSellerReviews(sellerId, query);
    return result;
  }

  @Patch(':id/reply')
  @ResponseMessage('Phản hồi đánh giá thành công')
  reply(
    @User() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    const sellerId = user.sub;
    const replyText = dto.reply;
    const result = this.service.replyToReview(sellerId, id, replyText);
    return result;
  }
}
