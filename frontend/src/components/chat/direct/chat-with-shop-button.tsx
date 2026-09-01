'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';

interface ChatWithShopButtonProps {
  // Bỏ trống hoặc không phải UUID thì nút tự ẩn. KHÔNG có giá trị mặc định — xem ghi chú dưới.
  shopId?: string;
  // True khi người đang xem chính là chủ shop này.
  ownShop?: boolean;
  className?: string;
}

export default function ChatWithShopButton({
  shopId,
  ownShop = false,
  className = '',
}: ChatWithShopButtonProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Không có shop thật thì không có gì để nhắn.
  //
  // KHÔNG bịa một giá trị mặc định kiểu 'default-shop' như giỏ hàng đang làm: chuỗi đó không
  // phải UUID, backend từ chối ở bước đổi kiểu cột, và người dùng nhận một lỗi "gửi không thành
  // công" không hiểu vì sao.
  if (!shopId || ownShop) return null;

  const open = () => {
    const target = `/chat?shop=${shopId}`;
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(target)}`);
      return;
    }
    router.push(target);
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={open}
      className={`h-8 shrink-0 rounded-lg border-violet-200 text-xs font-semibold text-violet-600 hover:bg-violet-50 dark:border-violet-900/50 dark:text-violet-400 dark:hover:bg-violet-950/30 ${className}`}
    >
      <MessageSquare className="h-4 w-4" />
      <span className="ml-1.5">Chat với shop</span>
    </Button>
  );
}
