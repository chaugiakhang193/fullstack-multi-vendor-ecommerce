import http from "@/lib/http";
import {
  ProductListResponseType,
  SingleProductResponseType,
} from "@/schemaValidations/products.schema";

const sellerProductsApiRequest = {
  // === C: Create ===
  // Seller tạo sản phẩm mới (multipart/form-data)
  createProduct: (body: FormData) => {
    return http.post<SingleProductResponseType>("/seller/products", body);
  },

  // === R: Read ===
  // Seller lấy danh sách sản phẩm của chính mình
  getSellerInventory: (params?: {
    page?: number;
    limit?: number;
    q?: string;
    is_hidden?: boolean;
    stock_status?: "all" | "in_stock" | "out_of_stock";
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", String(params.page));
    if (params?.limit) queryParams.append("limit", String(params.limit));
    if (params?.q) queryParams.append("q", params.q);
    if (params?.is_hidden !== undefined) {
      queryParams.append("is_hidden", String(params.is_hidden));
    }
    if (params?.stock_status && params.stock_status !== "all") {
      queryParams.append("stock_status", params.stock_status);
    }
    const queryString = queryParams.toString();
    const url = queryString ? `/seller/products?${queryString}` : "/seller/products";
    return http.get<ProductListResponseType>(url);
  },

  // Seller lấy chi tiết 1 sản phẩm theo ID để chỉnh sửa
  getProductDetail: (id: string) => {
    return http.get<SingleProductResponseType>(`/seller/products/${id}`);
  },

  // === U: Update ===
  // Seller cập nhật sản phẩm (multipart/form-data)
  updateProduct: (id: string, body: FormData) => {
    return http.patch<SingleProductResponseType>(
      `/seller/products/${id}`,
      body,
    );
  },

  // === D: Delete ===
  // Seller xóa sản phẩm (soft delete)
  deleteProduct: (id: string) => {
    return http.delete<any>(`/seller/products/${id}`);
  },
};

export default sellerProductsApiRequest;
