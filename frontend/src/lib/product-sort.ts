import type { SortOption } from '@/components/products/sort-dropdown';

export function mapParamsToSortOption(
  sort?: string,
  order?: string,
): SortOption {
  if (sort === 'price' && order === 'ASC') return 'price_asc';
  if (sort === 'price' && order === 'DESC') return 'price_desc';
  if (sort === 'avg_rating') return 'top_rated';
  if (sort === 'is_featured') return 'popular';
  return 'newest';
}

export function mapSortOptionToParams(option: SortOption): {
  sort: string;
  order: 'ASC' | 'DESC';
} {
  if (option === 'price_asc') return { sort: 'price', order: 'ASC' };
  if (option === 'price_desc') return { sort: 'price', order: 'DESC' };
  if (option === 'top_rated') return { sort: 'avg_rating', order: 'DESC' };
  if (option === 'popular') return { sort: 'is_featured', order: 'DESC' };
  return { sort: 'created_at', order: 'DESC' };
}
