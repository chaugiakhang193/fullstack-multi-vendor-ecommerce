// Libraries
import { Repository, SelectQueryBuilder, FindManyOptions, ObjectLiteral } from 'typeorm';

// DTOs
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginatedResponseDto } from '../dto/paginated-response.dto';

/**
 * Helper toàn cục hỗ trợ tự động tính toán phân trang
 * và truy vấn cơ sở dữ liệu sử dụng TypeORM Repository hoặc SelectQueryBuilder.
 */
export async function paginate<T extends ObjectLiteral>(
  repositoryOrQueryBuilder: Repository<T> | SelectQueryBuilder<T>,
  queryDto: PaginationQueryDto,
  options?: FindManyOptions<T>,
): Promise<PaginatedResponseDto<T>> {
  const page = queryDto.page || 1;
  const limit = queryDto.limit || 10;

  // Tính toán skip (offset)
  const skip = (page - 1) * limit;

  // Gán các đối số vào biến có tên rõ ràng trước khi truyền vào hàm TypeORM
  const offset = skip;
  const size = limit;

  if (repositoryOrQueryBuilder instanceof Repository) {
    // Trường hợp 1: Phân trang bằng Repository
    const findOptions = {
      ...options,
      skip: offset,
      take: size,
    };

    const [items, totalItems] = await repositoryOrQueryBuilder.findAndCount(findOptions);

    // Tính tổng số trang
    const ratio = totalItems / limit;
    const totalPages = Math.ceil(ratio);

    const result: PaginatedResponseDto<T> = {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
    return result;
  } else {
    // Trường hợp 2: Phân trang bằng SelectQueryBuilder
    const queryBuilder = repositoryOrQueryBuilder;

    // Thiết lập phân trang trên QueryBuilder sử dụng các biến tường minh
    queryBuilder.skip(offset);
    queryBuilder.take(size);

    const [items, totalItems] = await queryBuilder.getManyAndCount();

    // Tính tổng số trang
    const ratio = totalItems / limit;
    const totalPages = Math.ceil(ratio);

    const result: PaginatedResponseDto<T> = {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
    return result;
  }
}
