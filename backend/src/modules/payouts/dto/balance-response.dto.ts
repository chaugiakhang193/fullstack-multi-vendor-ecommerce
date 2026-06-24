import { ApiProperty } from '@nestjs/swagger';

export class BalanceResponseDto {
  @ApiProperty({ description: 'Doanh thu thô đã giao (chưa trừ hoa hồng sàn)' })
  gross_revenue: number;

  @ApiProperty({ description: 'Hoa hồng sàn (5%) tính trên doanh thu thô' })
  commission_amount: number;

  @ApiProperty({ description: 'Doanh thu thực nhận sau khi trừ hoa hồng' })
  total_revenue: number;

  @ApiProperty({ description: 'Tổng số tiền đã rút thành công' })
  total_payouted: number;

  @ApiProperty({ description: 'Số dư khả dụng có thể yêu cầu rút' })
  available_balance: number;

  @ApiProperty({
    description: 'Số tiền đang chờ duyệt rút (PENDING/PROCESSING)',
  })
  pending_payout: number;
}
