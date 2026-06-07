import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ example: '85f9c46d-c5bb-41cb-8fde-d39281a8b9a1', description: 'ID của địa chỉ' })
  id: string;

  @ApiProperty({ example: '123 Đường ABC, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh', description: 'Địa chỉ chi tiết' })
  address_line: string;

  @ApiPropertyOptional({ example: '10.7769', description: 'Vĩ độ' })
  lat: string | null;

  @ApiPropertyOptional({ example: '106.7009', description: 'Kinh độ' })
  lng: string | null;

  @ApiProperty({ example: false, description: 'Địa chỉ mặc định hay không' })
  is_default: boolean;

  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Tên người nhận hàng' })
  recipient_name: string;

  @ApiProperty({ example: '0901234567', description: 'Số điện thoại người nhận' })
  phone: string;

  @ApiProperty({ example: '2026-06-07T10:00:00Z', description: 'Thời gian tạo' })
  created_at: Date;

  @ApiProperty({ example: '2026-06-07T10:00:00Z', description: 'Thời gian cập nhật' })
  updated_at: Date;
}
