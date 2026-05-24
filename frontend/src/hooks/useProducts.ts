import { useQuery } from "@tanstack/react-query";
import productsApiRequest from "@/apiRequests/products";

/**
 * Hook mẫu truy vấn danh sách sản phẩm của Seller (Inventory) sử dụng TanStack Query.
 */
export const useSellerInventory = () => {
  return useQuery({
    queryKey: ["seller-inventory"],
    queryFn: async () => {
      const response = await productsApiRequest.getSellerInventory();
      return response; // Trả về dạng ProductListResponseType
    },
    // Các tùy chọn nâng cao cấu hình trực tiếp (hoặc dùng mặc định từ query-client)
    staleTime: 1000 * 60 * 2, // Coi data là mới trong 2 phút
  });
};
