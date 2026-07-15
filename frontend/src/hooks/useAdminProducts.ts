import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import adminProductsApiRequest from '@/apiRequests/products/admin-products';
import { adminProductKeys, STALE_TIME } from '@/constants/query-keys';
import { ProductStatus } from '@/constants/enum.generated';
import { TakeDownProductBodyType } from '@/schemaValidations/products/products.schema';

const LIMIT = 10;

type AdminProductsListArgs = {
  page: number;
  q?: string;
  status?: ProductStatus;
  shopId?: string;
};

// Danh sách sản phẩm toàn sàn cho admin (lọc server-side).
export const useAdminProductsList = (args: AdminProductsListArgs) => {
  const { page, q, status, shopId } = args;
  return useQuery({
    queryKey: adminProductKeys.list(page, q, status, shopId),
    // apiRequest nhận key `shop_id`; buildQuery tự loại bỏ các field undefined.
    queryFn: () =>
      adminProductsApiRequest.getAdminProducts({
        page,
        limit: LIMIT,
        q,
        status,
        shop_id: shopId,
      }),
    staleTime: STALE_TIME.SHORT,
    placeholderData: (prev) => prev,
  });
};

type MutationCallbacks = { onSuccess?: () => void };

// Gỡ sản phẩm.
export const useTakeDownProduct = (callbacks?: MutationCallbacks) => {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { showToastOnError: true },
    mutationFn: (variables: {
      productId: string;
      body: TakeDownProductBodyType;
    }) =>
      adminProductsApiRequest.takeDownProduct(
        variables.productId,
        variables.body,
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success(res.message || 'Đã gỡ sản phẩm.');
      callbacks?.onSuccess?.();
    },
  });
};

// Khôi phục sản phẩm.
export const useRestoreProduct = (callbacks?: MutationCallbacks) => {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { showToastOnError: true },
    mutationFn: (productId: string) =>
      adminProductsApiRequest.restoreProduct(productId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success(res.message || 'Đã khôi phục sản phẩm.');
      callbacks?.onSuccess?.();
    },
  });
};
