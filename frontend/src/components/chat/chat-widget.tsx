'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FALLBACK_ERROR_MESSAGE,
  FALLBACK_SEARCH_REASONS,
  FALLBACK_TOOL_LABEL,
  NETWORK_ERROR_MESSAGE,
  QUOTA_MESSAGES,
  REQUEST_ERROR_MESSAGES,
  STREAM_ERROR_MESSAGES,
  TOOL_LABELS,
  TRUNCATED_NOTICE,
} from '@/constants/chat';
import { askBot, ChatNetworkError, ChatRequestError } from '@/lib/chat/stream';
import { fetchChatEnabled } from '@/lib/chat/config';
import { fetchHistory } from '@/lib/chat/history';
import { useChatWidgetStore } from '@/store/useChatWidgetStore';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatPanel } from '@/components/chat/chat-panel';
import type { ChatMessage, ChatMessageStatus } from '@/types/chat';

function appendText(
  messages: ChatMessage[],
  id: string,
  chunk: string,
): ChatMessage[] {
  return messages.map((message) =>
    message.id === id ? { ...message, text: message.text + chunk } : message,
  );
}

function markStatus(
  messages: ChatMessage[],
  id: string,
  status: ChatMessageStatus,
): ChatMessage[] {
  return messages.map((message) =>
    message.id === id ? { ...message, status } : message,
  );
}

// Bỏ bong bóng bot rỗng: lỗi ập đến trước khi bot kịp nhả chữ nào thì để lại một ô trắng,
// trông như bot đang treo trong khi câu báo lỗi đã hiện ở dưới rồi.
function dropEmptyBot(messages: ChatMessage[], id: string): ChatMessage[] {
  return messages.filter(
    (message) => !(message.id === id && message.text === ''),
  );
}

function messageForError(error: unknown): string {
  if (error instanceof ChatRequestError) {
    if (error.status === 429) {
      const base = QUOTA_MESSAGES[error.reason] ?? FALLBACK_ERROR_MESSAGE;
      // retryAfter lấy từ body chứ không từ header Retry-After (CORS không expose header đó).
      // Chỉ ghép số giây cho 'burst': mấy lý do còn lại đếm tới nửa đêm, nói "chờ 21600 giây"
      // thì vô nghĩa với người đọc.
      if (error.reason === 'burst' && error.retryAfter > 0) {
        return `${base} (khoảng ${error.retryAfter} giây)`;
      }
      return base;
    }
    return REQUEST_ERROR_MESSAGES[error.reason] ?? FALLBACK_ERROR_MESSAGE;
  }

  if (error instanceof ChatNetworkError) return NETWORK_ERROR_MESSAGE;

  return FALLBACK_ERROR_MESSAGE;
}

export default function ChatWidget() {
  const isOpen = useChatWidgetStore((state) => state.isOpen);
  const toggle = useChatWidgetStore((state) => state.toggle);
  const close = useChatWidgetStore((state) => state.close);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolLabel, setToolLabel] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  // null = chưa biết bot còn sống hay không. Ba trạng thái chứ không phải hai: vẽ bong bóng ngay
  // khi chưa hỏi xong thì nó nhấp nháy rồi biến mất nếu bot đang tắt.
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Câu hỏi vừa bị từ chối, giữ lại để tìm sản phẩm thay thế. Chuỗi rỗng = không có gì để gợi ý.
  const [fallbackQuery, setFallbackQuery] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedHistoryRef = useRef(false);

  // Cắt stream khi widget bị gỡ (người dùng rời khỏi route group (customer)).
  //
  // KHÔNG cắt khi chỉ đóng panel: lượt đó đã tính quota rồi, để nó chạy nốt thì mở lại là
  // thấy câu trả lời đầy đủ. ChatWidget vẫn mount cùng layout nên kết nối không đứt.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Hỏi kill switch một lần lúc mount. Kết quả được cache trong sessionStorage nên chuyển trang
  // không gọi lại.
  useEffect(() => {
    let alive = true;
    fetchChatEnabled().then((enabled) => {
      if (alive) setIsEnabled(enabled);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Nạp lịch sử ở lần MỞ PANEL đầu tiên, không phải lúc mount: mount xảy ra ở mọi trang khách,
  // còn mở panel thì hiếm hơn nhiều. Đặt ở mount là bắt Neon đọc cho cả những người không bao
  // giờ bấm vào bong bóng.
  useEffect(() => {
    // Cắm cờ TRƯỚC khi gọi, không phải trong .then: đóng rồi mở lại panel lúc request đang bay
    // sẽ bắn thêm một request nữa, và cái về sau ghi đè lên tin nhắn người dùng vừa gõ.
    if (!isOpen || hasLoadedHistoryRef.current) return;
    hasLoadedHistoryRef.current = true;

    setIsLoadingHistory(true);
    fetchHistory()
      .then((history) => {
        // Chỉ ghi đè khi thật sự có lịch sử. Người dùng mở panel rồi hỏi luôn trong lúc request
        // chưa về: một setMessages với mảng rỗng sẽ xoá mất câu họ vừa gõ.
        if (history.length === 0) return;
        setMessages(
          history.map((message) => ({
            id: crypto.randomUUID(),
            role: message.role,
            text: message.text,
            status: 'done' as const,
          })),
        );
      })
      .finally(() => setIsLoadingHistory(false));
  }, [isOpen]);

  const handleSend = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      setNotice('');
      setToolLabel('');
      setFallbackQuery('');
      setIsStreaming(true);

      const botId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', text: trimmed },
        { id: botId, role: 'bot', text: '', status: 'streaming' },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      // Cờ cục bộ chứ không đọc lại state: setState là bất đồng bộ nên trong cùng lượt chạy
      // này, đọc messages ra vẫn là bản cũ.
      let failed = false;

      try {
        await askBot(
          trimmed,
          (event) => {
            switch (event.type) {
              case 'meta':
                // Nhánh cache hit không gửi remaining — giữ nguyên số cũ thay vì xoá về null.
                if (typeof event.remaining === 'number') {
                  setRemaining(event.remaining);
                }
                break;
              case 'tool':
                setToolLabel(TOOL_LABELS[event.name] ?? FALLBACK_TOOL_LABEL);
                break;
              case 'text':
                setToolLabel('');
                setMessages((prev) => appendText(prev, botId, event.v));
                break;
              case 'done':
                setMessages((prev) => markStatus(prev, botId, 'done'));
                if (event.truncated) setNotice(TRUNCATED_NOTICE);
                break;
              case 'error':
                failed = true;
                setMessages((prev) => markStatus(prev, botId, 'error'));
                setNotice(
                  STREAM_ERROR_MESSAGES[event.reason] ?? FALLBACK_ERROR_MESSAGE,
                );
                if (FALLBACK_SEARCH_REASONS.has(event.reason)) {
                  setFallbackQuery(trimmed);
                }
                break;
            }
          },
          controller.signal,
        );
      } catch (error) {
        // Widget bị gỡ giữa chừng thì không phải lỗi của ai, không báo gì cả.
        if (!controller.signal.aborted) {
          failed = true;
          setMessages((prev) => markStatus(prev, botId, 'error'));
          setNotice(messageForError(error));

          // Lý do chỉ có ở ChatRequestError. ChatNetworkError thì không gợi ý gì cả — gọi API
          // tìm kiếm trong lúc mạng đang hỏng cũng chỉ hỏng nốt.
          if (
            error instanceof ChatRequestError &&
            FALLBACK_SEARCH_REASONS.has(error.reason)
          ) {
            setFallbackQuery(trimmed);
          }
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        setToolLabel('');
        if (failed) setMessages((prev) => dropEmptyBot(prev, botId));
      }
    },
    [isStreaming],
  );

  // Biết chắc là tắt thì không vẽ gì. Widget vẫn mount để hai effect ở trên chạy, chỉ là không
  // chiếm chỗ nào trên màn hình.
  if (isEnabled === false) return null;

  return (
    <>
      {/* isEnabled === null: chưa hỏi xong kill switch, giữ bong bóng ẩn thêm một nhịp. */}
      <ChatBubble isHidden={isOpen || isEnabled === null} onClick={toggle} />
      {isOpen ? (
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          isLoadingHistory={isLoadingHistory}
          toolLabel={toolLabel}
          remaining={remaining}
          notice={notice}
          fallbackQuery={fallbackQuery}
          onSend={handleSend}
          onClose={close}
        />
      ) : null}
    </>
  );
}
