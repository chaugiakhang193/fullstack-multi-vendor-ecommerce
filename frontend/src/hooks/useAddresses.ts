import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { QUERY_KEYS } from '@/constants/query-keys';
import { getErrorMessage } from '@/lib/http';
import addressApiRequest from '@/apiRequests/users/addresses';
import { useAuthStore } from '@/store/useAuthStore';
import {
  CreateAddressBodyType,
  UpdateAddressBodyType,
} from '@/schemaValidations/users/addresses.schema';

/**
 * Quản lý server-state cho sổ địa chỉ.
 * Chiến lược: refetch (invalidateQueries) sau mỗi mutation — KHÔNG optimistic,
 * vì backend reshuffle cờ is_default ở nhiều dòng (set-default / xóa mặc định).
 */
export function useAddresses() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const queryKeyArr = [QUERY_KEYS.ADDRESSES];
  const staleTimeMs = 1000 * 60 * 5;

  // Guest KHÔNG gọi /users/me/addresses: 401 cho khách sẽ kích hoạt auto-refresh thất
  // bại trong http.ts → logout() → clearCart() làm bay giỏ guest trước khi kịp merge
  // sau đăng nhập. Chỉ fetch khi đã đăng nhập.
  const listQuery = useQuery({
    queryKey: queryKeyArr,
    queryFn: () => addressApiRequest.getList(),
    staleTime: staleTimeMs,
    enabled: isAuthenticated,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeyArr }),
    [queryClient, queryKeyArr],
  );

  const createAddress = useCallback(
    async (body: CreateAddressBodyType) => {
      try {
        await addressApiRequest.create(body);
        const successMsg = 'Thêm địa chỉ thành công';
        toast.success(successMsg);
        await invalidate();
        return true;
      } catch (error) {
        const errMsg = getErrorMessage(error);
        toast.error(errMsg);
        return false;
      }
    },
    [invalidate],
  );

  const updateAddress = useCallback(
    async (id: string, body: UpdateAddressBodyType) => {
      try {
        await addressApiRequest.update(id, body);
        const successMsg = 'Cập nhật địa chỉ thành công';
        toast.success(successMsg);
        await invalidate();
        return true;
      } catch (error) {
        const errMsg = getErrorMessage(error);
        toast.error(errMsg);
        return false;
      }
    },
    [invalidate],
  );

  const removeAddress = useCallback(
    async (id: string) => {
      try {
        await addressApiRequest.remove(id);
        const successMsg = 'Đã xóa địa chỉ';
        toast.success(successMsg);
        await invalidate();
        return true;
      } catch (error) {
        const errMsg = getErrorMessage(error);
        toast.error(errMsg);
        return false;
      }
    },
    [invalidate],
  );

  const setDefaultAddress = useCallback(
    async (id: string) => {
      try {
        await addressApiRequest.setDefault(id);
        const successMsg = 'Đã đặt làm địa chỉ mặc định';
        toast.success(successMsg);
        await invalidate();
        return true;
      } catch (error) {
        const errMsg = getErrorMessage(error);
        toast.error(errMsg);
        return false;
      }
    },
    [invalidate],
  );

  const addressesData = listQuery.data?.data ?? [];
  const queryLoading = listQuery.isLoading;
  const queryError = listQuery.isError;
  const queryRefetch = listQuery.refetch;

  return {
    addresses: addressesData,
    isLoading: queryLoading,
    isError: queryError,
    refetch: queryRefetch,
    createAddress,
    updateAddress,
    removeAddress,
    setDefaultAddress,
  };
}
