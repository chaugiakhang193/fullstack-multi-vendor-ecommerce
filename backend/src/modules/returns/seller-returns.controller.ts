import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiParam,
} from '@nestjs/swagger';

import { ReturnsService } from '@/modules/returns/returns.service';
import { RejectReturnDto } from '@/modules/returns/dto/reject-return.dto';
import { ReturnRequestResponseDto } from '@/modules/returns/dto/return-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('seller-returns')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@Controller('seller/returns')
export class SellerReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu trả hàng của shop (phân trang)' })
  @ResponseMessage('Lấy danh sách yêu cầu trả hàng của shop thành công')
  @ApiOkResponse({ description: 'Danh sách ReturnRequest thuộc shop của seller' })
  list(@User() user: IUser, @Query() query: PaginationQueryDto) {
    return this.returnsService.getSellerReturns(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết 1 yêu cầu trả hàng của shop' })
  @ApiParam({ name: 'id', description: 'UUID ReturnRequest' })
  @ResponseMessage('Lấy chi tiết yêu cầu trả hàng thành công')
  @ApiOkResponse({ type: ReturnRequestResponseDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy (hoặc không thuộc shop của bạn)' })
  detail(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.returnsService.getSellerReturnDetail(user.sub, id);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Seller duyệt yêu cầu trả (REQUESTED → APPROVED)' })
  @ApiParam({ name: 'id', description: 'UUID ReturnRequest' })
  @ResponseMessage('Duyệt yêu cầu trả hàng thành công')
  @ApiOkResponse({ type: ReturnRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Chuyển trạng thái không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy (hoặc không thuộc shop của bạn)' })
  approve(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.returnsService.approveReturn(user.sub, id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Seller từ chối yêu cầu trả (REQUESTED/APPROVED → REJECTED)' })
  @ApiParam({ name: 'id', description: 'UUID ReturnRequest' })
  @ResponseMessage('Từ chối yêu cầu trả hàng thành công')
  @ApiOkResponse({ type: ReturnRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Chuyển trạng thái không hợp lệ / thiếu lý do' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy (hoặc không thuộc shop của bạn)' })
  reject(
    @User() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectReturnDto,
  ) {
    return this.returnsService.rejectReturn(user.sub, id, dto);
  }

  @Patch(':id/receive')
  @ApiOperation({ summary: 'Seller xác nhận đã nhận hàng trả (APPROVED → RECEIVED) + restock' })
  @ApiParam({ name: 'id', description: 'UUID ReturnRequest' })
  @ResponseMessage('Xác nhận nhận hàng trả thành công')
  @ApiOkResponse({ type: ReturnRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Chuyển trạng thái không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy (hoặc không thuộc shop của bạn)' })
  receive(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.returnsService.receiveReturn(user.sub, id);
  }
}
