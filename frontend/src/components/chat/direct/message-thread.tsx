'use client';

import { useEffect, useRef } from 'react';
import { RotateCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { DirectMessage, DirectViewer } from '@/types/direct-chat';

interface MessageThreadProps {
  messages: DirectMessage[];
  viewer: DirectViewer;
  loading: boolean;
  onRetry: (clientMsgId: string) => void;
}

function messageTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageThread({
  messages,
  viewer,
  loading,
  onRetry,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Cuộn xuống đáy mỗi khi số tin đổi. Phụ thuộc theo ĐỘ DÀI chứ không theo cả mảng: mọi lần
  // store cập nhật đều tạo mảng mới, nên phụ thuộc vào mảng sẽ cuộn cả khi chỉ có một tin đổi
  // trạng thái từ 'sending' sang đã gửi — giật màn hình trong lúc người dùng đang đọc lên trên.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        <Skeleton className="ml-auto h-10 w-1/2 rounded-xl" />
        <Skeleton className="h-10 w-3/5 rounded-xl" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-center text-xs text-muted-foreground">
          Chưa có tin nhắn nào. Gửi câu đầu tiên nhé.
        </p>
      </div>
    );
  }

  // Vai của CHÍNH MÌNH suy từ trang đang đứng, không suy từ dữ liệu: senderId là id của một dòng
  // participant, và service không bao giờ cho trình duyệt biết dòng nào là của mình.
  const myRole = viewer === 'seller' ? 'seller' : 'user';

  return (
    <div className="flex flex-col gap-2 p-4">
      {messages.map((message) => {
        const mine = message.senderRole === myRole;
        const failed = message.status === 'failed';
        const sending = message.status === 'sending';

        return (
          <div
            key={message.id}
            className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words ${
                failed
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                  : mine
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white'
                    : 'bg-zinc-100 text-foreground dark:bg-zinc-800'
              } ${sending ? 'opacity-60' : ''}`}
            >
              {message.text}
            </div>

            <div className="mt-0.5 flex items-center gap-2 px-1">
              <span className="text-[10px] font-semibold text-muted-foreground">
                {sending ? 'Đang gửi…' : messageTime(message.createdAt)}
              </span>
              {failed && message.clientMsgId && (
                <button
                  type="button"
                  onClick={() => onRetry(message.clientMsgId as string)}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:underline dark:text-rose-400"
                >
                  <RotateCw className="h-3 w-3" />
                  Gửi lại
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
