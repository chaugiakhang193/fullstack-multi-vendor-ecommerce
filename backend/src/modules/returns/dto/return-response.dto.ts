import { ApiProperty } from '@nestjs/swagger';
import { ReturnStatus, ReturnReason } from '@/common/enums';

export class ReturnItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() orderItemId: string;
  @ApiProperty() productName: string;
  @ApiProperty() variantName: string | null;
  @ApiProperty() quantity: number;
  @ApiProperty({ description: 'Snapshot tiền hoàn (chuỗi decimal)' })
  refundAmount: string;
}

export class ReturnRequestResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() subOrderId: string;
  @ApiProperty({ enum: ReturnStatus }) status: ReturnStatus;
  @ApiProperty({ enum: ReturnReason }) reason: ReturnReason;
  @ApiProperty() customerNote: string | null;
  @ApiProperty() sellerNote: string | null;
  @ApiProperty() resolvedAt: Date | null;
  @ApiProperty() refundTotal: string;
  @ApiProperty({ type: [ReturnItemResponseDto] })
  items: ReturnItemResponseDto[];
  @ApiProperty() createdAt: Date;
}
