import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplyReviewDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reply: string;
}
