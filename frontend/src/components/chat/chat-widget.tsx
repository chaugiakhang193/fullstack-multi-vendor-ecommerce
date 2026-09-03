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
  THINKING_LABEL,
  TOOL_LABELS,
  TRUNCATED_NOTICE,
} from '@/constants/chat';
import { useCategories } from '@/hooks/useCategories';
import { matchCategory } from '@/lib/chat/category-match';
import { askBot, ChatNetworkError, ChatRequestError } from '@/lib/chat/stream';
import { fetchChatEnabled } from '@/lib/chat/config';
import { fetchHistory } from '@/lib/chat/history';
import {
  loadShortcutMessages,
  rememberShortcut,
} from '@/lib/chat/shortcut-storage';
import { useChatWidgetStore } from '@/store/useChatWidgetStore';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatPanel } from '@/components/chat/chat-panel';
import type {
  ChatMessage,
  ChatMessageStatus,
  ChatProductsMessage,
  ChatTextMessage,
} from '@/types/chat';

// Ba hàm dưới đây đều kiểm `kind === 'text'` trước khi chạm vào `text` hay `status`.
//
// Id truyền vào luôn thuộc về một tin chữ, nhưng TypeScript không suy ra được điều đó, mà khối
// sản phẩm thì không có hai trường ấy. Phép kiểm giúp trình biên dịch thu hẹp kiểu, đồng thời
// giữ nguyên khối sản phẩm nếu id có trùng.
function appendText(
  messages: ChatMessage[],
  id: string,
  chunk: string,
): ChatMessage[] {
  return messages.map((message) =>
    message.kind === 'text' && message.id === id
      ? { ...message, text: message.text + chunk }
      : message,
  );
}

function markStatus(
  messages: ChatMessage[],
  id: string,
  status: ChatMessageStatus,
): ChatMessage[] {
  return messages.map((message) =>
    message.kind === 'text' && message.id === id
      ? { ...message, status }
      : message,
  );
}

// Bỏ bong bóng bot rỗng: lỗi ập đến trước khi bot kịp nhả chữ nào thì để lại một ô trắng,
// trông như bot đang treo trong khi câu báo lỗi đã hiện ở dưới rồi.
function dropEmptyBot(messages: ChatMessage[], id: string): ChatMessage[] {
  return messages.filter(
    (message) =>
      !(message.kind === 'text' && message.id === id && message.text === ''),
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
  const [statusLabel, setStatusLabel] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  // null = chưa biết bot còn sống hay không. Ba trạng thái chứ không phải hai: vẽ bong bóng ngay
  // khi chưa hỏi xong thì nó nhấp nháy rồi biến mất nếu bot đang tắt.
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Bot vừa từ chối vì hết lượt hoặc đang nghỉ — khi đó panel hiện lại hàng chip ngay dưới câu
  // báo lỗi, vì hàng chip ở màn hình trống đã bị cuộn khuất từ lâu.
  const [wasRefused, setWasRefused] = useState(false);

  const { data: categoriesData } = useCategories();

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
        const fromServer: ChatMessage[] = history.map((message) => ({
          kind: 'text' as const,
          id: crypto.randomUUID(),
          role: message.role,
          text: message.text,
          status: 'done' as const,
          // createdAt là chuỗi RFC3339 theo UTC. Đây là chỗ trường đó có việc: nó là khoá để
          // xếp tin của bot (lấy từ DB) xen với khối chip (lấy từ localStorage) đúng thứ tự
          // thời gian. Chuỗi hỏng cho ra NaN, mà NaN lọt vào hàm so sánh của sort sẽ làm thứ
          // tự thành vô định — ép về 0 để tin hỏng dồn lên đầu thay vì phá cả danh sách.
          at: Date.parse(message.createdAt) || 0,
        }));

        // Khối chip không nằm trong DB nên phải ghép vào từ trình duyệt. Hai nguồn về không
        // theo thứ tự nào cả, sắp lại theo mốc thời gian mới ra đúng dòng hội thoại đã diễn ra.
        const merged = [...fromServer, ...loadShortcutMessages()].sort(
          (a, b) => a.at - b.at,
        );

        // Không có gì cũ để chèn thì thôi, khỏi tạo một mảng mới làm React vẽ lại vô ích.
        if (merged.length === 0) return;

        // Lịch sử về sau khi người dùng đã kịp gõ: giữ nguyên những gì họ vừa tạo, chỉ chèn thêm
        // phần THỰC SỰ cũ hơn. Bất cứ thứ gì sinh ra trong phiên này thì `prev` mới là bản thật —
        // bản trong `merged` chỉ là ảnh chụp cùng một sự việc từ DB hoặc localStorage.
        //
        // Lọc theo mốc thời gian chứ không theo id: `loadShortcutMessages` cố ý sinh id mới mỗi
        // lần gọi, nên khối chip vừa bấm mang hai id khác nhau ở hai nguồn và lọc trùng theo id
        // sẽ để lọt đúng hai bản.
        setMessages((prev) => {
          if (prev.length === 0) return merged;

          const earliest = Math.min(...prev.map((message) => message.at));
          const older = merged.filter((message) => message.at < earliest);
          return [...older, ...prev];
        });
      })
      .finally(() => setIsLoadingHistory(false));
  }, [isOpen]);

  const handleSend = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      setNotice('');
      setStatusLabel('');
      setWasRefused(false);

      const now = Date.now();
      const userMessage: ChatTextMessage = {
        kind: 'text',
        id: crypto.randomUUID(),
        role: 'user',
        text: trimmed,
        at: now,
      };

      // Phím tắt danh mục: câu vừa gõ khớp đúng một danh mục thì trả lời ngay tại đây, không gọi
      // bot và không tiêu một lượt quota nào.
      //
      // Khối này đứng trước cả setIsStreaming vì đường này không chạm mạng nên không có gì để
      // chờ. Bật cờ streaming rồi tắt ngay trong cùng một nhịp chỉ làm nút gửi nhấp nháy.
      const matched = matchCategory(trimmed, categoriesData?.data ?? []);
      if (matched) {
        const productsMessage: ChatProductsMessage = {
          kind: 'products',
          id: crypto.randomUUID(),
          categoryId: matched.id,
          categoryName: matched.name,
          // Cộng một mili giây để khối sản phẩm luôn đứng sau câu hỏi khi trộn lại theo thời
          // gian: hai tin sinh trong cùng một mili giây thì sort không có căn cứ nào để xếp.
          at: now + 1,
        };
        setMessages((prev) => [...prev, userMessage, productsMessage]);

        // Ghi xuống localStorage để lượt này còn lại sau khi tải lại trang. Lượt hỏi bot không
        // cần dòng nào tương đương: chat-service đã lưu nó vào DB rồi.
        rememberShortcut(userMessage, productsMessage);
        return;
      }

      setIsStreaming(true);
      // Bật nhãn ngay từ đây chứ không đợi event `tool`: vòng hỏi đầu tiên có thể chạy nhiều
      // giây, và trong quãng đó bong bóng của bot còn rỗng nên không có gì báo là nó đang chạy.
      // Nhánh phím tắt danh mục ở trên đã return trước dòng này nên không dính nhãn.
      setStatusLabel(THINKING_LABEL);

      const botId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        userMessage,
        // Cộng một mili giây để câu trả lời luôn đứng sau câu hỏi khi trộn lại theo thời gian.
        // Hai tin sinh trong cùng một mili giây thì `sort` không có căn cứ nào để xếp.
        {
          kind: 'text',
          id: botId,
          role: 'bot',
          text: '',
          status: 'streaming',
          at: now + 1,
        },
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
                setStatusLabel(TOOL_LABELS[event.name] ?? FALLBACK_TOOL_LABEL);
                break;
              case 'text':
                setStatusLabel('');
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
                  setWasRefused(true);
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

          // ChatNetworkError không mang reason nhưng vẫn nên hiện chip. Chat-service và monolith
          // nằm trên hai host khác nhau, nên chat-service không gọi được không có nghĩa là danh
          // mục cũng không lấy được — và useCategories thường đã cache sẵn từ trước đó.
          const shouldOfferChips =
            error instanceof ChatRequestError
              ? FALLBACK_SEARCH_REASONS.has(error.reason)
              : error instanceof ChatNetworkError;
          if (shouldOfferChips) setWasRefused(true);
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        setStatusLabel('');
        if (failed) setMessages((prev) => dropEmptyBot(prev, botId));
      }
    },
    [isStreaming, categoriesData],
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
          statusLabel={statusLabel}
          remaining={remaining}
          notice={notice}
          wasRefused={wasRefused}
          onSend={handleSend}
          onClose={close}
        />
      ) : null}
    </>
  );
}
