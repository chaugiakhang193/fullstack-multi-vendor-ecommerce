import http from "@/lib/http";
import {
  ProductListResponseType,
  SingleProductResponseType,
} from "@/schemaValidations/products.schema";

const productsApiRequest = {
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

  // Khách hàng lấy danh sách sản phẩm (Public)
  getPublicProducts: (params?: {
    page?: number;
    limit?: number;
    q?: string;
    category_id?: string;
    min_price?: number;
    max_price?: number;
    sort?: string;
    order?: "ASC" | "DESC";
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", String(params.page));
    if (params?.limit) queryParams.append("limit", String(params.limit));
    if (params?.q) queryParams.append("q", params.q);
    if (params?.category_id) queryParams.append("category_id", params.category_id);
    if (params?.min_price !== undefined) {
      queryParams.append("min_price", String(params.min_price));
    }
    if (params?.max_price !== undefined) {
      queryParams.append("max_price", String(params.max_price));
    }
    if (params?.sort) queryParams.append("sort", params.sort);
    if (params?.order) queryParams.append("order", params.order);
    const queryString = queryParams.toString();
    const url = queryString ? `/products?${queryString}` : "/products";
    return http.get<ProductListResponseType>(url);
  },

  // Seller lấy chi tiết 1 sản phẩm theo ID để chỉnh sửa
  getProductDetail: (id: string) => {
    return http.get<SingleProductResponseType>(`/seller/products/${id}`);
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
