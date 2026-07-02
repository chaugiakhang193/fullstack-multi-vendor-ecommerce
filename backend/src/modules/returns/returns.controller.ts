import {
  Controller,
  Post,
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
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiParam,
} from '@nestjs/swagger';

import { ReturnsService } from '@/modules/returns/returns.service';
import { CreateReturnRequestDto } from '@/modules/returns/dto/create-return.dto';
import { ReturnRequestResponseDto } from '@/modules/returns/dto/return-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('returns')
@ApiBearerAuth('access-token')
@Roles(UserRole.CUSTOMER, UserRole.SELLER)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @ApiOperation({
    summary: 'Khách tạo yêu cầu trả hàng (item-level) cho 1 sub-order đã giao',
  })
  @ResponseMessage('Tạo yêu cầu trả hàng thành công')
  @ApiCreatedResponse({ type: ReturnRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'Đơn chưa giao / quá hạn / số lượng vượt / dữ liệu sai',
  })
  @ApiConflictResponse({
    description: 'Đã có yêu cầu trả đang chờ xử lý cho đơn này',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy đơn hàng con (hoặc không thuộc về bạn)',
  })
  create(@User() user: IUser, @Body() dto: CreateReturnRequestDto) {
    return this.returnsService.createReturn(user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách yêu cầu trả hàng của khách (phân trang)',
  })
  @ResponseMessage('Lấy danh sách yêu cầu trả hàng thành công')
  @ApiOkResponse({ description: 'Danh sách ReturnRequest + items' })
  list(@User() user: IUser, @Query() query: PaginationQueryDto) {
    return this.returnsService.getMyReturns(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết 1 yêu cầu trả hàng của khách' })
  @ApiParam({ name: 'id', description: 'UUID ReturnRequest' })
  @ResponseMessage('Lấy chi tiết yêu cầu trả hàng thành công')
  @ApiOkResponse({ type: ReturnRequestResponseDto })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy (hoặc không thuộc về bạn)',
  })
  detail(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.returnsService.getReturnDetail(user.sub, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Khách tự hủy yêu cầu trả (chỉ khi còn REQUESTED)' })
  @ApiParam({ name: 'id', description: 'UUID ReturnRequest' })
  @ResponseMessage('Hủy yêu cầu trả hàng thành công')
  @ApiOkResponse({ description: 'Đã hủy — trả id + status mới' })
  @ApiBadRequestResponse({
    description: 'Yêu cầu không ở trạng thái REQUESTED',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy (hoặc không thuộc về bạn)',
  })
  cancel(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.returnsService.cancelReturn(user.sub, id);
  }
}
