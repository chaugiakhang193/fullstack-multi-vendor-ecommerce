import { ApiProperty } from '@nestjs/swagger';

export class AdminStatsResponseDto {
  @ApiProperty() total_users: number;
  @ApiProperty() total_customers: number;
  @ApiProperty() total_sellers: number;
  @ApiProperty() total_shops: number;
  @ApiProperty() pending_shops: number;
  @ApiProperty() total_categories: number;
  @ApiProperty() total_orders: number;
  @ApiProperty() total_revenue: number;
}
