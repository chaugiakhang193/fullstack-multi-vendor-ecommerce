'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MAX_QUESTION_LENGTH } from '@/constants/chat';
import { MessageText } from '@/components/chat/message-text';
import type { ChatMessage } from '@/types/chat';

// Câu gợi ý cho màn hình trống. Cả ba đều là câu hỏi sản phẩm vì system prompt bắt bot gọi
// search_products với mọi câu hỏi loại đó — người dùng bấm câu đầu là thấy ngay bot làm được gì.
const SUGGESTIONS = [
  'Có điện thoại nào dưới 5 triệu không?',
  'Gợi ý tai nghe để chạy bộ',
  'Laptop nào hợp cho sinh viên?',
];

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  toolLabel: string;
  remaining: number | null;
  notice: string;
  onSend: (question: string) => void;
  onClose: () => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  toolLabel,
  remaining,
  notice,
  onSend,
  onClose,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Cuộn xuống đáy mỗi khi có chữ mới. Phụ thuộc cả toolLabel và notice vì hai dòng đó cũng
  // làm danh sách dài thêm.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, toolLabel, notice]);

  const submit = () => {
    const question = draft.trim();
    if (!question || isStreaming) return;
    onSend(question);
    setDraft('');
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="fixed right-5 bottom-5 z-40 flex h-[min(32rem,calc(100vh-2.5rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-full">
          <Bot className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Trợ lý mua sắm</p>
          <p className="text-muted-foreground text-xs">
            {remaining === null
              ? 'Hỏi mình về sản phẩm nhé'
              : `Còn ${remaining} lượt hôm nay`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Đóng trợ lý"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {isEmpty ? (
          <div className="space-y-2 pt-2">
            <p className="text-muted-foreground text-sm">
              Mình tìm sản phẩm trên sàn giúp bạn. Thử một câu xem:
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSend(suggestion)}
                disabled={isStreaming}
                className="block w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex',
                message.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground bg-zinc-100 dark:bg-zinc-900',
                  message.status === 'error' &&
                    'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
                )}
              >
                <MessageText text={message.text} />
              </div>
            </div>
          ))
        )}

        {toolLabel ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {toolLabel}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {notice}
          </p>
        ) : null}
      </div>

      <footer className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) =>
              setDraft(event.target.value.slice(0, MAX_QUESTION_LENGTH))
            }
            onKeyDown={(event) => {
              // Enter gửi, Shift+Enter xuống dòng. Bỏ qua khi đang gõ tiếng Việt bằng bộ gõ:
              // isComposing nghĩa là phím Enter đó dùng để chốt chữ, không phải để gửi câu.
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Hỏi về sản phẩm..."
            className="focus:border-primary max-h-24 flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900"
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={isStreaming || draft.trim() === ''}
            aria-label="Gửi câu hỏi"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-[11px]">
          Trợ lý có thể trả lời sai. Giá và tình trạng hàng lấy theo trang sản
          phẩm.
        </p>
      </footer>
    </div>
  );
}
