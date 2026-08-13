import { ApiProperty } from '@nestjs/swagger';

export class BestSellerItemDto {
  @ApiProperty({ description: 'ID sản phẩm' })
  product_id: string;

  @ApiProperty({ description: 'Tên sản phẩm' })
  product_name: string;

  @ApiProperty({ description: 'Ảnh đại diện sản phẩm', nullable: true })
  product_thumbnail: string | null;

  @ApiProperty({ description: 'Tổng số lượng đã bán' })
  total_sold: number;
}

export class StatusCountsDto {
  @ApiProperty({ description: 'Số đơn chờ xác nhận' })
  pending: number;

  @ApiProperty({ description: 'Số đơn đang xử lý' })
  processing: number;

  @ApiProperty({ description: 'Số đơn đang giao' })
  shipping: number;

  @ApiProperty({ description: 'Số đơn đã giao' })
  delivered: number;

  @ApiProperty({ description: 'Số đơn đã hủy' })
  cancelled: number;

  @ApiProperty({ description: 'Số đơn đã trả' })
  returned: number;
}

export class SellerStatsResponseDto {
  @ApiProperty({
    description:
      'Doanh thu thô từ đơn đã giao (sub_total - giảm giá shop), chưa trừ hoa hồng sàn. Không gồm phí ship — khớp với gross_revenue ở trang rút tiền',
  })
  total_revenue: number;

  @ApiProperty({ description: 'Tổng số đơn hàng của shop' })
  total_orders: number;

  @ApiProperty({
    type: StatusCountsDto,
    description: 'Thống kê đơn hàng theo trạng thái',
  })
  status_counts: StatusCountsDto;

  @ApiProperty({
    type: [BestSellerItemDto],
    description: 'Top 5 sản phẩm bán chạy của shop',
  })
  best_sellers: BestSellerItemDto[];
}
