import { useQuery } from "@tanstack/react-query";
import shopsApiRequest from "@/apiRequests/shops/shops";
import sellerShopsApiRequest from "@/apiRequests/shops/seller-shops";
import productsApiRequest from "@/apiRequests/products/products";
import { shopKeys, STALE_TIME } from "@/constants/query-keys";

type ShopCatalogQuery = {
  page: number;
  limit: number;
  q?: string;
  sort?: string;
  order?: "ASC" | "DESC";
};

/** Chi tiết shop công khai. */
export const useShopDetail = (shopId: string) => {
  return useQuery({
    queryKey: shopKeys.detail(shopId),
    queryFn: () => shopsApiRequest.getPublicShopDetail(shopId),
    enabled: !!shopId,
    retry: 1,
    staleTime: STALE_TIME.LONG,
  });
};

/** Catalog sản phẩm trong 1 shop (giữ placeholderData để load-more mượt). */
export const useShopCatalog = (shopId: string, query: ShopCatalogQuery) => {
  return useQuery({
    queryKey: shopKeys.catalog(shopId, query),
    queryFn: () => productsApiRequest.getPublicCatalogByShop(shopId, query),
    enabled: !!shopId,
    retry: 1,
    staleTime: STALE_TIME.MEDIUM,
    placeholderData: (prev) => prev,
  });
};

/** Shop của chính seller đang đăng nhập (để chặn tự mua trên product detail). */
export const useMyShop = (enabled: boolean) => {
  return useQuery({
    queryKey: shopKeys.mine,
    queryFn: () => sellerShopsApiRequest.getMyShop(),
    enabled,
    retry: false,
    staleTime: STALE_TIME.LONG,
  });
};
