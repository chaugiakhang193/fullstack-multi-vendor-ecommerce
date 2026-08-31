'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatWorkspace from '@/components/chat/direct/chat-workspace';
import { useAuthStore } from '@/store/useAuthStore';

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shopId = searchParams.get('shop') ?? undefined;
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Chat 1-1 đòi tài khoản thật: schema bắt hội thoại direct phải có owner_user_id, và WebSocket
  // đóng ngay bằng 4401 nếu không có token. Đẩy sang trang đăng nhập kèm đường về, để sau khi
  // đăng nhập người dùng quay lại đúng hội thoại họ định mở.
  useEffect(() => {
    if (isAuthenticated) return;
    const back = shopId ? `/chat?shop=${shopId}` : '/chat';
    router.replace(`/login?redirect=${encodeURIComponent(back)}`);
  }, [isAuthenticated, router, shopId]);

  if (!isAuthenticated) return null;

  return <ChatWorkspace viewer="buyer" initialShopId={shopId} />;
}
