'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useProducts } from '@/hooks/useProducts';
import { SortDropdown, SortOption } from '@/components/products/sort-dropdown';
import ProductCard from '@/components/products/product-card';
import SkeletonProductCard from '@/components/products/skeleton-product-card';
import { EmptyProducts } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/shared/pagination';

interface CategoryCatalogProps {
  categoryId: string;
}

const mapParamsToSortOption = (sort?: string, order?: string): SortOption => {
  if (sort === 'price' && order === 'ASC') return 'price_asc';
  if (sort === 'price' && order === 'DESC') return 'price_desc';
  if (sort === 'name') return 'popular';
  return 'newest';
};

const mapSortOptionToParams = (option: SortOption) => {
  if (option === 'price_asc') return { sort: 'price', order: 'ASC' };
  if (option === 'price_desc') return { sort: 'price', order: 'DESC' };
  if (option === 'popular') return { sort: 'name', order: 'ASC' };
  return { sort: 'created_at', order: 'DESC' };
};

function CategoryCatalogContent({ categoryId }: CategoryCatalogProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlPage = Number(searchParams.get('page') || '1');
  const sort = searchParams.get('sort') || 'created_at';
  const order = (searchParams.get('order') as 'ASC' | 'DESC') || 'DESC';

  const limit = 48;

  const queryParams = {
    page: urlPage,
    limit,
    category_id: categoryId,
    sort,
    order,
  };

  const productsQuery = useProducts(queryParams, {
    placeholderData: (prev: any) => prev,
  });

  const { data: productsRes, isLoading, isError, refetch } = productsQuery;
  const productsList = productsRes?.data?.items || [];
  const totalItems = productsRes?.data?.meta?.totalItems || 0;
  const totalPages = Math.ceil(totalItems / limit);

  const sortOptionVal = mapParamsToSortOption(sort, order);

  const updateQueryParams = (
    newParams: Record<string, string | number | undefined | null>,
  ) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    const targetUrl = `${pathname}?${params.toString()}`;
    router.push(targetUrl);
  };

  const handleSortChange = (newOption: SortOption) => {
    const sortParams = mapSortOptionToParams(newOption);
    updateQueryParams({
      sort: sortParams.sort,
      order: sortParams.order,
      page: 1, // Reset to page 1 on sort change
    });
  };

  const handlePageChange = (page: number) => {
    updateQueryParams({ page: String(page) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetFilters = () => {
    updateQueryParams({
      sort: '',
      order: '',
      page: '',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-row items-center justify-between gap-4 p-4 rounded-xl border bg-card shadow-xs">
          <div className="text-xs sm:text-sm font-bold text-muted-foreground animate-pulse">
            Đang tìm kiếm sản phẩm...
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, idx) => (
            <SkeletonProductCard key={`skeleton-item-${idx}`} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center border border-dashed rounded-xl border-rose-200 dark:border-rose-950 bg-rose-50/20 dark:bg-rose-950/5 flex flex-col items-center gap-3">
        <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
          Đã xảy ra lỗi khi tải danh sách sản phẩm.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="text-xs font-semibold rounded-lg"
        >
          Tải lại trang
        </Button>
      </div>
    );
  }

  if (productsList.length === 0) {
    return (
      <div className="py-12">
        <EmptyProducts
          actionLabel="Đặt lại"
          onAction={handleResetFilters}
          description="Danh mục này hiện chưa có sản phẩm nào."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-row items-center justify-between gap-4 p-4 rounded-xl border bg-card shadow-xs">
        <div className="text-xs sm:text-sm font-bold text-muted-foreground">
          <span>
            Hiển thị{' '}
            {Math.min((urlPage - 1) * limit + productsList.length, totalItems)}{' '}
            / {totalItems} sản phẩm
          </span>
        </div>
        <SortDropdown
          value={sortOptionVal}
          onChange={handleSortChange}
          className="w-48 text-xs font-semibold"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-[360px]:gap-3">
        {productsList.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={urlPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}

export function CategoryCatalog({ categoryId }: CategoryCatalogProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <span className="text-sm font-semibold text-muted-foreground animate-pulse">
            Đang tải danh sách sản phẩm...
          </span>
        </div>
      }
    >
      <CategoryCatalogContent categoryId={categoryId} />
    </Suspense>
  );
}
