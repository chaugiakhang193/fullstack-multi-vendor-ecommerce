'use client';

import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatBubbleProps {
  isHidden: boolean;
  onClick: () => void;
}

// z-40 chứ không phải z-50: CartDrawer và Dialog đang ở z-50, bong bóng chat phải nằm dưới
// để mở giỏ hàng hay hộp xác nhận đăng xuất là che được nó.
export function ChatBubble({ isHidden, onClick }: ChatBubbleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Mở trợ lý mua sắm"
      className={cn(
        'fixed right-5 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg transition hover:scale-105',
        isHidden && 'hidden',
      )}
    >
      <MessageCircle className="h-6 w-6" />
    </button>
  );
}
