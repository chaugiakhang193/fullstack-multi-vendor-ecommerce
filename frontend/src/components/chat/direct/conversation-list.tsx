'use client';

import { MessageSquare, Store, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { DirectConversation, DirectViewer } from '@/types/direct-chat';

interface ConversationListProps {
  conversations: DirectConversation[];
  shopNames: Record<string, string>;
  viewer: DirectViewer;
  activeId: string | null;
  loading: boolean;
  onSelect: (conversationId: string, shopId: string) => void;
}

// Nhãn của một dòng.
//
// Buyer nhìn thấy tên shop; seller nhìn thấy một mã khách rút gọn, vì monolith chưa có endpoint
// tra hồ sơ công khai theo user id. Bốn ký tự đầu đủ để phân biệt các dòng với nhau mà không
// biến một danh sách hội thoại thành một bảng user id.
function rowTitle(
  item: DirectConversation,
  viewer: DirectViewer,
  shopNames: Record<string, string>,
): string {
  if (viewer === 'seller') {
    return `Khách hàng · #${item.buyerUserId.slice(0, 4)}`;
  }
  return shopNames[item.shopId] ?? 'Cửa hàng';
}

// Giờ hiển thị trên mỗi dòng: hôm nay thì hiện giờ, khác ngày thì hiện ngày.
//
// Không dùng "x phút trước": nó đúng lúc vẽ rồi sai dần khi tab mở lâu, và muốn đúng thì phải
// có một bộ đếm chạy nền cho mỗi dòng.
function rowTime(iso?: string): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';

  const now = new Date();
  const sameDay =
    at.getDate() === now.getDate() &&
    at.getMonth() === now.getMonth() &&
    at.getFullYear() === now.getFullYear();

  return sameDay
    ? at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function ConversationList({
  conversations,
  shopNames,
  viewer,
  activeId,
  loading,
  onSelect,
}: ConversationListProps) {
  if (loading && conversations.length === 0) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <MessageSquare className="h-8 w-8 text-violet-600 dark:text-violet-400" />
        <p className="text-sm font-semibold text-foreground">
          Chưa có cuộc trò chuyện nào
        </p>
        <p className="text-xs text-muted-foreground">
          {viewer === 'seller'
            ? 'Tin nhắn của khách sẽ hiện ở đây.'
            : 'Mở một trang sản phẩm và bấm "Chat với shop" để bắt đầu.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {conversations.map((item) => {
        const active = item.conversationId === activeId;
        return (
          <li key={item.conversationId}>
            <button
              type="button"
              onClick={() => onSelect(item.conversationId, item.shopId)}
              className={`flex w-full items-start gap-3 p-3 text-left transition-colors ${
                active
                  ? 'bg-violet-50 dark:bg-violet-950/30'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
              }`}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
                {viewer === 'seller' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Store className="h-4 w-4" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-foreground">
                    {rowTitle(item, viewer, shopNames)}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                    {rowTime(item.lastMessageAt)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {item.preview || 'Chưa có tin nhắn'}
                  </span>
                  {item.unread > 0 && (
                    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      {item.unread > 99 ? '99+' : item.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
