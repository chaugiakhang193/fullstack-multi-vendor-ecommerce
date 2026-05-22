import http from "@/lib/http";
import {
  ProductListResponseType,
  SingleProductResponseType,
} from "@/schemaValidations/products.schema";

const productsApiRequest = {
  // Seller lấy danh sách sản phẩm của chính mình
  getSellerInventory: () => {
    return http.get<ProductListResponseType>("/seller/products");
  },

  // Lấy chi tiết 1 sản phẩm theo ID (public endpoint, dùng cho trang edit)
  getProductDetail: (id: string) => {
    return http.get<SingleProductResponseType>(`/products/${id}`);
  },

  // Seller tạo sản phẩm mới (multipart/form-data vì có file upload)
  createProduct: (body: FormData) => {
    return http.post<SingleProductResponseType>("/seller/products", body);
  },

  // Seller cập nhật sản phẩm (multipart/form-data vì có file upload)
  updateProduct: (id: string, body: FormData) => {
    return http.patch<SingleProductResponseType>(
      `/seller/products/${id}`,
      body,
    );
  },

  // Seller xóa sản phẩm (soft delete)
  deleteProduct: (id: string) => {
    return http.delete<any>(`/seller/products/${id}`);
  },
};

export default productsApiRequest;
