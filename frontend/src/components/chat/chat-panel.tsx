'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CHIP_HEADING_AFTER_REFUSAL,
  CHIP_HEADING_IDLE,
  HISTORY_LOADING_NOTICE,
  MAX_QUESTION_LENGTH,
} from '@/constants/chat';
import { MessageText } from '@/components/chat/message-text';
import { ChatProductResults } from '@/components/chat/chat-product-results';
import { ChatCategoryChips } from '@/components/chat/chat-category-chips';
import type { ChatMessage } from '@/types/chat';

// Câu gợi ý cho màn hình trống. Cả ba đều là câu hỏi sản phẩm vì system prompt bắt bot gọi
// search_products với mọi câu hỏi loại đó — người dùng bấm câu đầu là thấy ngay bot làm được gì.
const SUGGESTIONS = [
  'Có điện thoại nào dưới 5 triệu không?',
  'Gợi ý tai nghe để chạy bộ',
  'Laptop nào hợp cho sinh viên?',
];

// Coi là "đang ở đáy" khi còn cách đáy dưới ngần này pixel. Nới rộng hơn 0 vì cuộn bằng con
// lăn hiếm khi dừng đúng đáy tuyệt đối.
const NEAR_BOTTOM_PX = 80;

// Chỉ hiện bộ đếm khi sắp chạm trần, không hiện suốt: câu hỏi mua sắm thường vài chục ký tự,
// nhắc giới hạn 1000 từ đầu chỉ làm rối.
const COUNTER_THRESHOLD = 100;

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  statusLabel: string;
  remaining: number | null;
  notice: string;
  wasRefused: boolean;
  onSend: (question: string) => void;
  onClose: () => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  isLoadingHistory,
  statusLabel,
  remaining,
  notice,
  wasRefused,
  onSend,
  onClose,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Người đọc có đang bám đáy không. Để trong ref chứ không phải state: nó đổi theo từng sự
  // kiện cuộn, mà không có gì trên màn hình phụ thuộc vào nó nên re-render là phí.
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;

    const distanceFromBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_PX;
  };

  // Trôi theo dòng chữ đang chảy, NHƯNG chỉ khi người đọc vốn đang ở đáy. Họ cuộn lên xem lại
  // câu trước mà mảnh chữ mới kéo màn hình xuống là mất chỗ đang đọc.
  //
  // useLayoutEffect chứ không phải useEffect: cuộn sau khi trình duyệt đã vẽ sẽ thấy một khung
  // hình ở sai vị trí. Widget mount bằng dynamic(ssr: false) nên không có bản render phía
  // server để hook này cảnh báo.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !stickToBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [messages, statusLabel, notice, wasRefused]);

  // Ô nhập cao dần theo số dòng, tới trần max-h-24 thì cuộn bên trong.
  //
  // Phải hạ height về 'auto' TRƯỚC khi đọc scrollHeight: giữ nguyên chiều cao cũ thì
  // scrollHeight không bao giờ nhỏ lại, ô chỉ phình ra mà không co về khi xoá chữ.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    // box-sizing: border-box nên height bao gồm cả viền, còn scrollHeight thì không. Thiếu
    // phần bù này là ô luôn ngắn hơn nội dung đúng bằng độ dày viền và sinh thanh cuộn thừa.
    const borderHeight = input.offsetHeight - input.clientHeight;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight + borderHeight}px`;
  }, [draft]);

  // Gửi câu hỏi và kéo người đọc về đáy. Bấm gửi là chủ động muốn xem câu trả lời, nên lần
  // này bỏ qua việc họ đang cuộn ở đâu.
  const send = (question: string) => {
    stickToBottomRef.current = true;
    onSend(question);
  };

  const submit = () => {
    const question = draft.trim();
    if (!question || isStreaming) return;
    send(question);
    setDraft('');
  };

  const isEmpty = messages.length === 0;
  const remainingChars = MAX_QUESTION_LENGTH - draft.length;
  const showCounter = remainingChars <= COUNTER_THRESHOLD;

  return (
    <div className="fixed right-5 bottom-5 z-40 flex h-[min(36rem,calc(100vh-2.5rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
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

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {isLoadingHistory && isEmpty ? (
          // Không hiện gợi ý câu hỏi trong lúc lịch sử đang bay về: mời người dùng bấm vào một
          // câu sắp bị chính lịch sử đó đẩy đi.
          <p className="text-muted-foreground flex items-center gap-2 pt-2 text-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            {HISTORY_LOADING_NOTICE}
          </p>
        ) : isEmpty ? (
          <div className="space-y-2 pt-2">
            <p className="text-muted-foreground text-sm">
              Mình tìm sản phẩm trên sàn giúp bạn. Thử một câu xem:
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
                disabled={isStreaming}
                className="block w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                {suggestion}
              </button>
            ))}

            {/* Chip có mặt ngay từ màn hình trống chứ không đợi tới lúc hết lượt. Nếu chỉ hiện
                sau khi bị từ chối thì phần lớn người dùng không bao giờ thấy nó, và những lượt
                hỏi mà nó sinh ra để giữ lại thì đã tiêu hết trước đó. */}
            <div className="pt-1">
              <ChatCategoryChips
                heading={CHIP_HEADING_IDLE}
                disabled={isStreaming}
                onPick={send}
              />
            </div>
          </div>
        ) : (
          messages.map((message) =>
            // Khối sản phẩm vẽ tràn chiều ngang chứ không bọc trong bong bóng: nó là kết quả
            // tra cứu, không phải lời ai nói. Vẽ nó thành bong bóng của bot là hứa với người
            // đọc rằng nó sẽ còn đó sau khi tải lại trang.
            message.kind === 'products' ? (
              <ChatProductResults
                key={message.id}
                categoryId={message.categoryId}
                categoryName={message.categoryName}
              />
            ) : (
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
            ),
          )
        )}

        {statusLabel ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {statusLabel}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {notice}
          </p>
        ) : null}

        {/* Hàng chip hiện lần thứ hai ở đây. Hàng ở màn hình trống lúc này đã bị cuộn khuất, mà
            khi bot từ chối thì nó là đường duy nhất còn lại. */}
        {wasRefused ? (
          <ChatCategoryChips
            heading={CHIP_HEADING_AFTER_REFUSAL}
            disabled={isStreaming}
            onPick={send}
          />
        ) : null}
      </div>

      <footer className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
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
            className="focus:border-primary max-h-24 flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-base outline-none dark:border-zinc-800 dark:bg-zinc-900"
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

        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="text-muted-foreground text-[11px]">
            Trợ lý có thể trả lời sai. Giá và tình trạng hàng lấy theo trang sản
            phẩm.
          </p>
          {showCounter ? (
            <span
              className={cn(
                'shrink-0 text-[11px] tabular-nums',
                remainingChars === 0
                  ? 'text-rose-600'
                  : 'text-muted-foreground',
              )}
            >
              {remainingChars === 0
                ? `Tối đa ${MAX_QUESTION_LENGTH} ký tự`
                : `Còn ${remainingChars} ký tự`}
            </span>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
