import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class CreatePayoutDto {
  @ApiProperty({ description: 'Số tiền muốn rút (tối thiểu 50.000đ)', example: 100000 })
  @IsNumber({}, { message: 'Số tiền rút phải là số.' })
  @Min(50000, { message: 'Số tiền rút tối thiểu là 50.000đ.' })
  amount: number;
}
