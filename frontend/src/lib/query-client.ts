import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { HttpError, getErrorMessage } from "@/lib/http";
import { HTTP_STATUS } from "@/constants/http-status";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      preventDefaultError?: boolean;
    };
    mutationMeta: {
      preventDefaultError?: boolean;
      showToastOnError?: boolean; // Ép buộc hiện toast kể cả lỗi 400/422 (cho nút bấm không có form)
    };
  }
}

// Hàm xử lý lỗi toàn cục
function handleGlobalError(error: any, isMutation: boolean) {
  const status = error instanceof HttpError ? error.status : null;
  const errorMessage = getErrorMessage(error);

  // Lỗi mạng hoặc không thể kết nối server (fetch ném ra TypeError hoặc Failed to fetch)
  if (error instanceof TypeError || error?.message === "Failed to fetch") {
    toast.error("Không thể kết nối mạng. Vui lòng kiểm tra lại!", {
      id: "network-offline-error", // Trùng ID sẽ ghi đè, tránh spam toast
    });
    return;
  }

  if (status === HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    toast.error("Hệ thống gặp sự cố. Vui lòng thử lại sau!", { id: "server-500-error" });
  } else if (status === HTTP_STATUS.FORBIDDEN) {
    toast.error("Bạn không có quyền thực hiện hành động này.", { id: "forbidden-403-error" });
  } else if (status === HTTP_STATUS.UNAUTHORIZED) {
    // Đã được http.ts xử lý logout/redirect, chỉ hiện cảnh báo nhẹ hoặc bỏ qua
  } else {
    toast.error(errorMessage);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Tắt tự động refetch khi click/focus lại tab trình duyệt
      retry: 1, // Tự động thử lại tối đa 1 lần nếu API bị lỗi
      staleTime: 5 * 60 * 1000, // Dữ liệu được coi là fresh (mới) trong 5 phút
      gcTime: 10 * 60 * 1000, // Cache được giữ lại tối đa 10 phút trong bộ nhớ trước khi bị dọn dẹp
      refetchOnReconnect: true, // Tự động tải lại khi có mạng lại
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Bỏ qua nếu preventDefaultError là true trong query meta
      if (query.meta?.preventDefaultError) {
        return;
      }
      handleGlobalError(error, false);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Bỏ qua nếu preventDefaultError là true trong mutation meta
      if (mutation.meta?.preventDefaultError) {
        return;
      }

      // Kiểm tra xem có phải lỗi validation (400 hoặc 422) hay không
      const status = error instanceof HttpError ? error.status : null;
      const isValidationError = status === HTTP_STATUS.BAD_REQUEST || status === HTTP_STATUS.UNPROCESSABLE_ENTITY;

      // Với lỗi validation form, mặc định không hiện toast để tránh trùng lặp trừ khi showToastOnError = true
      if (isValidationError && !mutation.meta?.showToastOnError) {
        return;
      }

      handleGlobalError(error, true);
    },
  }),
});
