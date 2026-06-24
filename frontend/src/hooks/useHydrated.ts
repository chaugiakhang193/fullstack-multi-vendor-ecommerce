'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook useHydrated giúp tránh các lỗi Hydration Mismatch trong Next.js App Router (SSR).
 *
 * LỖI HYDRATION MISMATCH LÀ GÌ?
 * Lỗi này xảy ra khi cây HTML được sinh ra từ máy chủ (Server-side rendered HTML) không khớp
 * với cây HTML được dựng lại ở lần render đầu tiên tại trình duyệt (Client-side hydrated HTML).
 * Điều này thường xuất hiện khi code React của bạn cố gắng tham chiếu trực tiếp đến các giá trị:
 *  - `window` hoặc `document`
 *  - `localStorage` hoặc `sessionStorage`
 *  - Cấu trúc thời gian hoặc số ngẫu nhiên ngẫu biến
 *
 * CƠ CHẾ HOẠT ĐỘNG:
 * Hook này khởi tạo một state `isHydrated` có giá trị ban đầu là `false`.
 * Do `useEffect` chỉ được chạy DUY NHẤT ở môi trường Client sau khi trình duyệt đã mount DOM,
 * việc cập nhật `isHydrated = true` trong `useEffect` sẽ đảm bảo việc hiển thị các giá trị
 * client-specific chỉ diễn ra từ lần render thứ hai tại trình duyệt, loại bỏ 100% cảnh báo Hydration.
 *
 * CÁCH SỬ DỤNG:
 * ```tsx
 * const isHydrated = useHydrated();
 *
 * if (!isHydrated) {
 *   return <SkeletonComponent />;
 * }
 * return <ClientSideOnlyComponent />;
 * ```
 */
export default function useHydrated(): boolean {
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  useEffect(() => {
    // Chỉ chạy ở phía Client sau khi render ban đầu hoàn tất
    setIsHydrated(true);
  }, []);

  return isHydrated;
}
