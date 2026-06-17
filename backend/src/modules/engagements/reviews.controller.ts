import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

// Services
import { EngagementsService } from '@/modules/engagements/engagements.service';

// DTOs
import { CreateReviewDto } from '@/modules/engagements/dto/create-review.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

// Decorators & Enums
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { Public, ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly service: EngagementsService) {}

  // Tạo review cho 1 lần mua
  @Post('reviews')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.CUSTOMER)
  @ResponseMessage('Đánh giá thành công')
  create(@User() user: IUser, @Body() dto: CreateReviewDto) {
    const userId = user.sub;
    const result = this.service.createReview(userId, dto);
    return result;
  }

  // Danh sách các lần mua còn đánh giá được (FE render nút Đánh giá)
  @Get('reviews/reviewable')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.CUSTOMER)
  @ResponseMessage('Lấy danh sách sản phẩm chờ đánh giá thành công')
  reviewable(@User() user: IUser, @Query() query: PaginationQueryDto) {
    const userId = user.sub;
    const result = this.service.getReviewableItems(userId, query);
    return result;
  }

  // Danh sách review công khai của 1 sản phẩm
  @Get('products/:id/reviews')
  @Public()
  @ResponseMessage('Lấy danh sách đánh giá thành công')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    const result = this.service.getProductReviews(id, query);
    return result;
  }
}
