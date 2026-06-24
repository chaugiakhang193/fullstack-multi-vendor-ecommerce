import http from '@/lib/http';
import {
  ProductListResponseType,
  SingleProductResponseType,
} from '@/schemaValidations/products/products.schema';

const productsApiRequest = {
  // === R: Read (Public Endpoints) ===

  // Khách hàng lấy danh sách tất cả sản phẩm (Public)
  getPublicProducts: (params?: {
    page?: number;
    limit?: number;
    q?: string;
    category_id?: string;
    min_price?: number;
    max_price?: number;
    sort?: string;
    order?: 'ASC' | 'DESC';
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.q) queryParams.append('q', params.q);
    if (params?.category_id)
      queryParams.append('category_id', params.category_id);
    if (params?.min_price !== undefined) {
      queryParams.append('min_price', String(params.min_price));
    }
    if (params?.max_price !== undefined) {
      queryParams.append('max_price', String(params.max_price));
    }
    if (params?.sort) queryParams.append('sort', params.sort);
    if (params?.order) queryParams.append('order', params.order);
    const queryString = queryParams.toString();
    const url = queryString ? `/products?${queryString}` : '/products';
    return http.get<ProductListResponseType>(url);
  },

  // Khách hàng lấy danh sách sản phẩm của một shop cụ thể (Public)
  getPublicCatalogByShop: (
    shopId: string,
    params?: {
      page?: number;
      limit?: number;
      q?: string;
      category_id?: string;
      min_price?: number;
      max_price?: number;
      sort?: string;
      order?: 'ASC' | 'DESC';
    },
  ) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.q) queryParams.append('q', params.q);
    if (params?.category_id)
      queryParams.append('category_id', params.category_id);
    if (params?.min_price !== undefined) {
      queryParams.append('min_price', String(params.min_price));
    }
    if (params?.max_price !== undefined) {
      queryParams.append('max_price', String(params.max_price));
    }
    if (params?.sort) queryParams.append('sort', params.sort);
    if (params?.order) queryParams.append('order', params.order);
    const queryString = queryParams.toString();
    const url = queryString
      ? `/products/shop/${shopId}?${queryString}`
      : `/products/shop/${shopId}`;
    return http.get<ProductListResponseType>(url);
  },

  // Khách hàng lấy chi tiết 1 sản phẩm theo ID hoặc slug (Public)
  getProductDetail: (idOrSlugWithId: string) => {
    return http.get<SingleProductResponseType>(`/products/${idOrSlugWithId}`);
  },
};

export default productsApiRequest;
