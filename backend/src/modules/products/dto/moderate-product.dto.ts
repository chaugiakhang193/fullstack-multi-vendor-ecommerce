import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ModerateProductDto {
  @ApiProperty({
    description: 'Lý do gỡ sản phẩm (hiển thị cho seller).',
    example: 'Hình ảnh vi phạm chính sách nội dung.',
  })
  @IsString()
  @MinLength(5, { message: 'Lý do phải có ít nhất 5 ký tự.' })
  @MaxLength(500)
  reason: string;
}
