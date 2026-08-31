'use client';

import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import ConversationList from '@/components/chat/direct/conversation-list';
import MessageComposer from '@/components/chat/direct/message-composer';
import MessageThread from '@/components/chat/direct/message-thread';
import { DIRECT_STATUS_MESSAGES } from '@/constants/direct-chat';
import { useDirectChatStore } from '@/store/useDirectChatStore';
import type { DirectViewer } from '@/types/direct-chat';

interface ChatWorkspaceProps {
  viewer: DirectViewer;
  // shopId đến từ ?shop= trên URL: người dùng vừa bấm "Chat với shop". Chỉ có ở phía buyer.
  initialShopId?: string;
}

export default function ChatWorkspace({
  viewer,
  initialShopId,
}: ChatWorkspaceProps) {
  const status = useDirectChatStore((state) => state.status);
  const conversations = useDirectChatStore((state) => state.conversations);
  const shopNames = useDirectChatStore((state) => state.shopNames);
  const loadingConversations = useDirectChatStore(
    (state) => state.loadingConversations,
  );
  const loadingMessages = useDirectChatStore((state) => state.loadingMessages);
  const target = useDirectChatStore((state) => state.target);
  const messages = useDirectChatStore((state) => state.messages);
  const draftMessages = useDirectChatStore((state) => state.draftMessages);
  const errorMessage = useDirectChatStore((state) => state.errorMessage);

  const connect = useDirectChatStore((state) => state.connect);
  const disconnect = useDirectChatStore((state) => state.disconnect);
  const loadConversations = useDirectChatStore(
    (state) => state.loadConversations,
  );
  const loadShopNames = useDirectChatStore((state) => state.loadShopNames);
  const openConversation = useDirectChatStore(
    (state) => state.openConversation,
  );
  const openDraft = useDirectChatStore((state) => state.openDraft);
  const sendText = useDirectChatStore((state) => state.sendText);
  const retryFailed = useDirectChatStore((state) => state.retryFailed);
  const clearError = useDirectChatStore((state) => state.clearError);

  // Mở kết nối khi vào trang, đóng khi rời đi.
  //
  // disconnect ở cleanup là có chủ ý dù kết nối là singleton: rời khỏi khu vực chat thì không
  // còn ai vẽ tin nhắn nữa, và giữ một socket mở suốt phiên chỉ để không ai nghe là tốn pin của
  // người dùng và tốn một kết nối của service.
  useEffect(() => {
    connect(viewer);
    return () => disconnect();
  }, [connect, disconnect, viewer]);

  // Tải danh sách một lần khi vào trang, rồi hỏi tên shop cho những dòng vừa nhận.
  useEffect(() => {
    void loadConversations().then(() => loadShopNames());
  }, [loadConversations, loadShopNames]);

  // Vào trang kèm ?shop=<id>: mở sẵn hội thoại với shop đó. openDraft tự nhận ra hội thoại đã
  // tồn tại và mở hội thoại cũ thay vì tạo một khung trống bên cạnh lịch sử.
  //
  // Chờ danh sách tải xong mới gọi — gọi sớm thì openDraft chưa thấy hội thoại cũ nào để mở.
  useEffect(() => {
    if (!initialShopId || loadingConversations) return;
    openDraft(initialShopId);
  }, [initialShopId, loadingConversations, openDraft]);

  const activeId =
    target?.kind === 'conversation' ? target.conversationId : null;
  const visibleMessages =
    target?.kind === 'conversation'
      ? (messages[target.conversationId] ?? [])
      : draftMessages;
  const statusNote = DIRECT_STATUS_MESSAGES[status];

  return (
    <div className="mx-auto w-full max-w-6xl animate-fade-in p-3 sm:p-4">
      <h1 className="mb-3 bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-2xl font-black text-transparent">
        {viewer === 'seller' ? 'Tin nhắn khách hàng' : 'Tin nhắn'}
      </h1>

      {statusNote && (
        <div
          className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            status === 'unauthorized'
              ? 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950 dark:text-rose-300'
              : 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950 dark:text-amber-300'
          }`}
        >
          {statusNote}
        </div>
      )}

      {errorMessage && (
        <button
          type="button"
          onClick={clearError}
          className="mb-3 block w-full rounded-xl border border-rose-200 bg-rose-100 px-3 py-2 text-left text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950 dark:text-rose-300"
        >
          {errorMessage} — bấm để ẩn
        </button>
      )}

      <div className="grid h-[70vh] grid-cols-1 overflow-hidden rounded-xl border shadow-sm md:grid-cols-[320px_1fr]">
        {/* Cột trái. Trên mobile: ẩn đi khi đã mở một hội thoại. */}
        <div
          className={`min-h-0 overflow-y-auto border-r bg-white dark:bg-zinc-950 ${
            target ? 'hidden md:block' : 'block'
          }`}
        >
          <ConversationList
            conversations={conversations}
            shopNames={shopNames}
            viewer={viewer}
            activeId={activeId}
            loading={loadingConversations}
            onSelect={(conversationId, shopId) =>
              void openConversation(conversationId, shopId)
            }
          />
        </div>

        {/* Cột phải. Trên mobile: chỉ hiện khi đã chọn một hội thoại. */}
        <div
          className={`min-h-0 flex-col bg-white dark:bg-zinc-950 ${
            target ? 'flex' : 'hidden md:flex'
          }`}
        >
          {target ? (
            <>
              <div className="flex items-center gap-2 border-b p-3">
                <button
                  type="button"
                  onClick={() => useDirectChatStore.setState({ target: null })}
                  className="rounded-lg p-1 hover:bg-zinc-100 md:hidden dark:hover:bg-zinc-800"
                  aria-label="Quay lại danh sách"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="truncate text-sm font-bold text-foreground">
                  {viewer === 'seller'
                    ? 'Khách hàng'
                    : (shopNames[target.shopId] ?? 'Cửa hàng')}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <MessageThread
                  messages={visibleMessages}
                  viewer={viewer}
                  loading={loadingMessages}
                  onRetry={retryFailed}
                />
              </div>

              <MessageComposer
                disabled={status !== 'ready'}
                onSend={sendText}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-xs text-muted-foreground">
                Chọn một cuộc trò chuyện để bắt đầu.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
