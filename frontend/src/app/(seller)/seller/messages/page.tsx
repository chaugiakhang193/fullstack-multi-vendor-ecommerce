'use client';

import ChatWorkspace from '@/components/chat/direct/chat-workspace';

// Không kiểm quyền ở đây: layout của khu (seller) đã đẩy người chưa có shop sang /seller/setup và
// shop chờ duyệt sang /seller/pending. Viết lại phép kiểm đó ở đây là hai bộ luật cho một câu
// hỏi, và chúng sẽ lệch nhau vào ngày một trong hai được sửa.
export default function SellerMessagesPage() {
  return <ChatWorkspace viewer="seller" />;
}
