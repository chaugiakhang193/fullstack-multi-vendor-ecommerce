'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FALLBACK_ERROR_MESSAGE,
  FALLBACK_TOOL_LABEL,
  NETWORK_ERROR_MESSAGE,
  QUOTA_MESSAGES,
  REQUEST_ERROR_MESSAGES,
  STREAM_ERROR_MESSAGES,
  TOOL_LABELS,
  TRUNCATED_NOTICE,
} from '@/constants/chat';
import { askBot, ChatNetworkError, ChatRequestError } from '@/lib/chat/stream';
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

  const abortRef = useRef<AbortController | null>(null);

  // Cắt stream khi widget bị gỡ (người dùng rời khỏi route group (customer)).
  //
  // KHÔNG cắt khi chỉ đóng panel: lượt đó đã tính quota rồi, để nó chạy nốt thì mở lại là
  // thấy câu trả lời đầy đủ. ChatWidget vẫn mount cùng layout nên kết nối không đứt.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleSend = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      setNotice('');
      setToolLabel('');
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

  return (
    <>
      <ChatBubble isHidden={isOpen} onClick={toggle} />
      {isOpen ? (
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          toolLabel={toolLabel}
          remaining={remaining}
          notice={notice}
          onSend={handleSend}
          onClose={close}
        />
      ) : null}
    </>
  );
}
