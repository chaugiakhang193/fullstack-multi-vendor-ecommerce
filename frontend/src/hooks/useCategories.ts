import { useQuery } from "@tanstack/react-query";
import categoriesApiRequest from "@/apiRequests/products/categories";
import { QUERY_KEYS } from "@/constants/query-keys";

/**
 * Hook truy vấn tất cả danh mục sản phẩm (Public) của khách hàng.
 */
export const useCategories = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES],
    queryFn: async () => {
      const response = await categoriesApiRequest.getAll();
      return response; // Trả về dạng CategoryListResponseType
    },
    staleTime: 1000 * 60 * 10, // Danh mục ít thay đổi, coi data là mới trong 10 phút
  });
};

/**
 * Hook truy vấn chi tiết một danh mục sản phẩm.
 */
export const useCategoryDetail = (id: string) => {
  return useQuery({
    queryKey: ["category", id],
    queryFn: async () => {
      const response = await categoriesApiRequest.getDetail(id);
      return response; // Trả về dạng SingleCategoryResponseType
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 10,
  });
};
