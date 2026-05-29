import { useQuery } from "@tanstack/react-query";
import productsApiRequest from "@/apiRequests/products/products";
import sellerProductsApiRequest from "@/apiRequests/products/seller-products";

/**
 * Hook mẫu truy vấn danh sách sản phẩm của Seller (Inventory) sử dụng TanStack Query.
 */
export const useSellerInventory = () => {
  return useQuery({
    queryKey: ["seller-inventory"],
    queryFn: async () => {
      const response = await sellerProductsApiRequest.getSellerInventory();
      return response; // Trả về dạng ProductListResponseType
    },
    // Các tùy chọn nâng cao cấu hình trực tiếp (hoặc dùng mặc định từ query-client)
    staleTime: 1000 * 60 * 2, // Coi data là mới trong 2 phút
  });
};

/**
 * Hook truy vấn danh sách sản phẩm công khai (Public) của khách hàng.
 */
export const useProducts = (params?: {
  page?: number;
  limit?: number;
  q?: string;
  category_id?: string;
  min_price?: number;
  max_price?: number;
  sort?: string;
  order?: "ASC" | "DESC";
}) => {
  return useQuery({
    queryKey: ["products", params],
    queryFn: async () => {
      const response = await productsApiRequest.getPublicProducts(params);
      return response;
    },
    staleTime: 1000 * 60 * 2, // Coi data là mới trong 2 phút
  });
};
