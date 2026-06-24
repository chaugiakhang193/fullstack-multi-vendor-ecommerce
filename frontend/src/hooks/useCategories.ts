import { useQuery } from '@tanstack/react-query';
import categoriesApiRequest from '@/apiRequests/products/categories';
import { categoryKeys, STALE_TIME } from '@/constants/query-keys';

/**
 * Hook truy vấn tất cả danh mục sản phẩm (Public) của khách hàng.
 */
export const useCategories = () => {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: async () => {
      const response = await categoriesApiRequest.getAll();
      return response; // Trả về dạng CategoryListResponseType
    },
    staleTime: STALE_TIME.STATIC, // Danh mục ít thay đổi, coi data là mới trong 10 phút
  });
};

/**
 * Hook truy vấn chi tiết một danh mục sản phẩm.
 */
export const useCategoryDetail = (id: string) => {
  return useQuery({
    queryKey: categoryKeys.detail(id),
    queryFn: async () => {
      const response = await categoriesApiRequest.getDetail(id);
      return response; // Trả về dạng SingleCategoryResponseType
    },
    enabled: !!id,
    staleTime: STALE_TIME.STATIC,
  });
};
