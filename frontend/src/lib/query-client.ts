import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Tắt tự động refetch khi click/focus lại tab trình duyệt
      retry: 1, // Tự động thử lại tối đa 1 lần nếu API bị lỗi
      staleTime: 5 * 60 * 1000, // Dữ liệu được coi là fresh (mới) trong 5 phút
      gcTime: 10 * 60 * 1000, // Cache được giữ lại tối đa 10 phút trong bộ nhớ trước khi bị dọn dẹp (garbage collected)
    },
  },
});
