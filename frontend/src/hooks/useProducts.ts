import { useQuery } from '@tanstack/react-query';
import productsApiRequest from '@/apiRequests/products/products';
import sellerProductsApiRequest from '@/apiRequests/products/seller-products';
import { productKeys, STALE_TIME } from '@/constants/query-keys';

type PublicProductsParams = {
  page?: number;
  limit?: number;
  q?: string;
  category_id?: string;
  min_price?: number;
  max_price?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
};

/** Danh sách sản phẩm của Seller (Inventory). */
export const useSellerInventory = () => {
  return useQuery({
    queryKey: productKeys.sellerInventory(),
    queryFn: () => sellerProductsApiRequest.getSellerInventory(),
    staleTime: STALE_TIME.MEDIUM,
  });
};

/** Danh sách sản phẩm công khai (Public). */
export const useProducts = (
  params?: PublicProductsParams,
  options?: { placeholderData?: (previousData: any) => any },
) => {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => productsApiRequest.getPublicProducts(params),
    staleTime: STALE_TIME.MEDIUM,
    placeholderData: options?.placeholderData,
  });
};

/** Chi tiết một sản phẩm công khai theo id/slug. */
export const useProductDetail = (productId: string) => {
  return useQuery({
    queryKey: productKeys.detail(productId),
    queryFn: () => productsApiRequest.getProductDetail(productId),
    enabled: !!productId,
    staleTime: STALE_TIME.LONG,
  });
};

/** Sản phẩm gợi ý (giỏ hàng trống). */
export const useRecommendProducts = (limit: number = 4) => {
  return useQuery({
    queryKey: productKeys.recommend(limit),
    queryFn: () => productsApiRequest.getPublicProducts({ limit }),
    staleTime: STALE_TIME.STATIC,
  });
};
