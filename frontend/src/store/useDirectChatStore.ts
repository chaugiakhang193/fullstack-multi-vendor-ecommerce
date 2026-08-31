import { create } from 'zustand';
import {
  DIRECT_ERROR_MESSAGES,
  DIRECT_FALLBACK_ERROR,
  MAX_DIRECT_MESSAGE_LENGTH,
} from '@/constants/direct-chat';
import {
  fetchDirectConversations,
  fetchDirectMessages,
  markDirectRead,
} from '@/lib/chat/direct';
import {
  connectDirectChat,
  disconnectDirectChat,
  sendDirectFrame,
} from '@/lib/chat/socket';
import type {
  DirectConversation,
  DirectMessage,
  DirectServerFrame,
  DirectSocketStatus,
  DirectTarget,
  DirectViewer,
} from '@/types/direct-chat';

interface DirectChatState {
  status: DirectSocketStatus;
  viewer: DirectViewer;
  conversations: DirectConversation[];
  loadingConversations: boolean;
  target: DirectTarget | null;
  // Khoá theo conversationId. Hội thoại dạng draft chưa có khoá nào — tin đầu tiên của nó nằm
  // ở draftMessages cho tới khi server trả về conversationId thật.
  messages: Record<string, DirectMessage[]>;
  draftMessages: DirectMessage[];
  loadingMessages: boolean;
  errorMessage: string | null;

  connect: (viewer: DirectViewer) => void;
  disconnect: () => void;
  loadConversations: () => Promise<void>;
  openConversation: (conversationId: string, shopId: string) => Promise<void>;
  openDraft: (shopId: string) => void;
  sendText: (text: string) => void;
  clearError: () => void;
}

// Sinh id tạm cho tin đang gửi. crypto.randomUUID có ở mọi trình duyệt hiện đại trong ngữ cảnh
// bảo mật (https và localhost) — cùng điều kiện mà WebSocket cũng đòi.
function newClientMsgId(): string {
  return crypto.randomUUID();
}

function readableError(reason: string | undefined): string {
  if (!reason) return DIRECT_FALLBACK_ERROR;
  return DIRECT_ERROR_MESSAGES[reason] ?? DIRECT_FALLBACK_ERROR;
}

export const useDirectChatStore = create<DirectChatState>()((set, get) => ({
  status: 'idle',
  viewer: 'buyer',
  conversations: [],
  loadingConversations: false,
  target: null,
  messages: {},
  draftMessages: [],
  loadingMessages: false,
  errorMessage: null,

  connect: (viewer) => {
    set({ viewer });
    connectDirectChat({
      onStatus: (status) => {
        const previous = get().status;
        set({ status });

        // Nối lại xong thì ĐỌC LẠI lịch sử, không tin vào những gì socket kể tiếp: WebSocket
        // không có bộ đệm, nên tin đến trong lúc rớt đã mất hẳn với client này. Nguồn sự thật
        // là DB.
        if (status === 'ready' && previous === 'reconnecting') {
          void get().loadConversations();
          const target = get().target;
          if (target?.kind === 'conversation') {
            void get().openConversation(target.conversationId, target.shopId);
          }
        }
      },
      onFrame: (frame) => applyFrame(set, get, frame),
    });
  },

  disconnect: () => {
    disconnectDirectChat();
    set({ status: 'idle', target: null, draftMessages: [] });
  },

  loadConversations: async () => {
    set({ loadingConversations: true });
    try {
      const conversations = await fetchDirectConversations(get().viewer);
      set({ conversations });
    } catch {
      // Danh sách rỗng còn hơn một màn hình lỗi: người dùng vẫn mở được hội thoại từ nút
      // "Chat với shop" trên trang sản phẩm.
      set({ conversations: [] });
    } finally {
      set({ loadingConversations: false });
    }
  },

  openConversation: async (conversationId, shopId) => {
    set({
      target: { kind: 'conversation', conversationId, shopId },
      draftMessages: [],
      loadingMessages: true,
    });

    try {
      const page = await fetchDirectMessages(conversationId);
      // Server trả mới-nhất-trước; màn hình đọc từ trên xuống theo thứ tự thời gian nên đảo lại.
      const oldestFirst = [...page.messages].reverse();
      set((state) => ({
        messages: { ...state.messages, [conversationId]: oldestFirst },
      }));
    } catch {
      set({ errorMessage: DIRECT_FALLBACK_ERROR });
    } finally {
      set({ loadingMessages: false });
    }

    // Đánh dấu đã đọc SAU khi lịch sử về: đánh dấu trước rồi tải hỏng nghĩa là xoá số chưa đọc
    // của những tin người dùng chưa hề nhìn thấy.
    const marked = await markDirectRead(conversationId);
    if (marked) {
      set((state) => ({
        conversations: state.conversations.map((item) =>
          item.conversationId === conversationId
            ? { ...item, unread: 0 }
            : item,
        ),
      }));
    }
  },

  openDraft: (shopId) => {
    // Hội thoại đã có với shop này thì mở nó, đừng tạo draft: gửi tin trong draft sẽ ra đúng
    // hội thoại cũ (backend dùng ON CONFLICT), nhưng người dùng sẽ thấy một khung trống trong
    // khi lịch sử vẫn còn nguyên ở dòng bên cạnh.
    const existing = get().conversations.find((item) => item.shopId === shopId);
    if (existing) {
      void get().openConversation(existing.conversationId, shopId);
      return;
    }
    set({ target: { kind: 'draft', shopId }, draftMessages: [] });
  },

  sendText: (text) => {
    const trimmed = text.trim();
    const target = get().target;
    if (!trimmed || trimmed.length > MAX_DIRECT_MESSAGE_LENGTH || !target)
      return;

    const clientMsgId = newClientMsgId();
    const pending: DirectMessage = {
      id: clientMsgId,
      senderRole: get().viewer === 'seller' ? 'seller' : 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
      clientMsgId,
      status: 'sending',
    };

    // Vẽ tin ngay, không chờ server: đây là toàn bộ lý do clientMsgId tồn tại. Echo về sẽ tìm
    // đúng tin này để thay bằng bản đã lưu.
    if (target.kind === 'conversation') {
      const id = target.conversationId;
      set((state) => ({
        messages: {
          ...state.messages,
          [id]: [...(state.messages[id] ?? []), pending],
        },
      }));
    } else {
      set((state) => ({ draftMessages: [...state.draftMessages, pending] }));
    }

    const sent = sendDirectFrame({
      type: 'send',
      conversationId:
        target.kind === 'conversation' ? target.conversationId : undefined,
      shopId: target.kind === 'draft' ? target.shopId : undefined,
      text: trimmed,
      clientMsgId,
    });

    if (!sent) markFailed(set, get, clientMsgId);
  },

  clearError: () => set({ errorMessage: null }),
}));

type SetState = (
  partial:
    | Partial<DirectChatState>
    | ((state: DirectChatState) => Partial<DirectChatState>),
) => void;
type GetState = () => DirectChatState;

// Đánh dấu một tin đang chờ là hỏng, ở cả hai chỗ nó có thể nằm.
function markFailed(set: SetState, get: GetState, clientMsgId: string): void {
  const flip = (message: DirectMessage): DirectMessage =>
    message.clientMsgId === clientMsgId
      ? { ...message, status: 'failed' }
      : message;

  const target = get().target;
  if (target?.kind === 'draft') {
    set((state) => ({ draftMessages: state.draftMessages.map(flip) }));
    return;
  }
  if (target?.kind === 'conversation') {
    const id = target.conversationId;
    set((state) => ({
      messages: {
        ...state.messages,
        [id]: (state.messages[id] ?? []).map(flip),
      },
    }));
  }
}

function applyFrame(
  set: SetState,
  get: GetState,
  frame: DirectServerFrame,
): void {
  if (frame.type === 'error') {
    if (frame.clientMsgId) markFailed(set, get, frame.clientMsgId);
    set({ errorMessage: readableError(frame.reason) });
    return;
  }

  if (frame.type !== 'message') return;
  if (!frame.conversationId || !frame.id) return;

  const conversationId = frame.conversationId;
  const arrived: DirectMessage = {
    id: frame.id,
    senderRole: frame.senderRole ?? 'user',
    text: frame.text ?? '',
    createdAt: frame.createdAt ?? new Date().toISOString(),
  };

  const target = get().target;

  // Tin đầu tiên của một draft vừa được lưu: server trả về conversationId thật, và từ giờ
  // hội thoại này có chỗ đứng trong DB. Chuyển các tin đang giữ tạm sang khoá thật.
  if (
    target?.kind === 'draft' &&
    frame.clientMsgId &&
    get().draftMessages.some((item) => item.clientMsgId === frame.clientMsgId)
  ) {
    const promoted = get().draftMessages.map((item) =>
      item.clientMsgId === frame.clientMsgId ? arrived : item,
    );
    set((state) => ({
      target: { kind: 'conversation', conversationId, shopId: target.shopId },
      draftMessages: [],
      messages: { ...state.messages, [conversationId]: promoted },
    }));
    // Không patch state.conversations tại chỗ được: hội thoại này chưa từng có trong mảng đó
    // (vừa được EnsureDirectConversation tạo lần đầu ở BE), .map() không tìm thấy gì để sửa.
    // Chỉ có cách tải lại nguyên mảng.
    void get().loadConversations();
    return;
  }

  set((state) => {
    const current = state.messages[conversationId] ?? [];

    // Echo của chính mình: thay tin đang chờ thay vì thêm một dòng nữa.
    const replaced = frame.clientMsgId
      ? current.map((item) =>
          item.clientMsgId === frame.clientMsgId ? arrived : item,
        )
      : current;

    // So sánh tham chiếu chỉ đúng nhờ nhánh trên: có clientMsgId thì .map() LUÔN trả mảng mới
    // (dù có tìm thấy để thay hay không), nên replaced !== current tin cậy được; không có
    // clientMsgId thì replaced được gán thẳng = current (không qua map), nên phép so sánh này
    // tự nhiên rơi về false — đúng ý, vì đó là tin của người khác, phải nối thêm chứ không thay.
    const changed = frame.clientMsgId && replaced !== current;
    const merged = changed ? replaced : [...current, arrived];

    return { messages: { ...state.messages, [conversationId]: merged } };
  });

  // Tin của người khác gửi tới một hội thoại KHÔNG mở: cập nhật số chưa đọc ngay, đừng đợi lần
  // tải danh sách sau. Tin của chính mình (có clientMsgId) không bao giờ làm badge sáng lên.
  const isMine = Boolean(frame.clientMsgId);
  const isOpen =
    target?.kind === 'conversation' && target.conversationId === conversationId;

  set((state) => ({
    conversations: state.conversations.map((item) =>
      item.conversationId === conversationId
        ? {
            ...item,
            preview: arrived.text,
            lastMessageAt: arrived.createdAt,
            unread: isMine || isOpen ? item.unread : item.unread + 1,
          }
        : item,
    ),
  }));

  // Đang mở hội thoại mà nhận tin của người kia: đọc luôn, đừng để badge sáng rồi tự tắt.
  if (!isMine && isOpen) void markDirectRead(conversationId);
}
