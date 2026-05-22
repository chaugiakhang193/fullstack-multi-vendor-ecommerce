import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Trang hiện tại', example: 1 })
  page: number;

  @ApiProperty({ description: 'Số lượng phần tử trên mỗi trang', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Tổng số phần tử', example: 100 })
  totalItems: number;

  @ApiProperty({ description: 'Tổng số trang', example: 10 })
  totalPages: number;
}

export class PaginatedResponseDto<T> {
  items: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
