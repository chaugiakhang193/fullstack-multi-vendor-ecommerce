// Vai của người gửi một tin nhắn 1-1. Trùng đúng bảng chữ mà cột participant.role cho phép,
// và trùng với frame WebSocket — nhờ vậy lịch sử tải qua HTTP và tin đến qua socket dùng chung
// một nhánh render.
export type DirectSenderRole = 'user' | 'seller';

// Vai của người ĐANG XEM, quyết định bong bóng nào vẽ bên phải.
//
// Suy từ route chứ không từ dữ liệu: /chat luôn là 'buyer', /seller/messages luôn là 'seller'.
// Một người vừa bán vừa mua vẫn đúng, vì hai vai của họ nằm ở hai trang khác nhau.
export type DirectViewer = 'buyer' | 'seller';

// Một dòng trong danh sách hội thoại.
export interface DirectConversation {
  conversationId: string;
  shopId: string;
  buyerUserId: string;
  preview: string;
  // Vắng mặt khi hội thoại chưa có tin nào. Không phải chuỗi rỗng — server bỏ hẳn trường.
  lastMessageAt?: string;
  unread: number;
}

// Trạng thái của một tin do chính mình vừa gửi, tính từ lúc gõ Enter tới lúc server trả lời.
// Tin tải từ lịch sử không mang trạng thái nào.
export type DirectMessageStatus = 'sending' | 'failed';

// Một tin nhắn trên màn hình, dù đến từ lịch sử hay từ socket, dù đã lưu hay còn đang gửi.
export interface DirectMessage {
  // Trước khi server trả lời, id tạm chính là clientMsgId. Sau đó bị thay bằng id thật từ DB.
  id: string;
  senderRole: DirectSenderRole;
  text: string;
  // Chuỗi RFC3339 theo UTC. Với tin đang gửi thì đây là giờ máy người dùng — chỉ dùng để xếp
  // thứ tự tạm, sẽ bị thay bằng giờ server khi echo về.
  createdAt: string;
  // Chỉ có ở tin của chính mình đang chờ hoặc đã hỏng.
  clientMsgId?: string;
  status?: DirectMessageStatus;
}

// Hội thoại đang mở. Hai dạng, và chúng không đối xứng:
//   - 'conversation': hội thoại đã tồn tại trong DB, có id để đọc lịch sử
//   - 'draft': vừa bấm "Chat với shop" lần đầu, CHƯA có dòng nào trong DB
//
// Dạng draft tồn tại vì backend cố ý không tạo hội thoại ở lệnh đọc: EnsureDirectConversation
// chỉ chạy trên đường ghi. Hội thoại chỉ sinh ra khi tin đầu tiên được gửi.
export type DirectTarget =
  | { kind: 'conversation'; conversationId: string; shopId: string }
  | { kind: 'draft'; shopId: string };

// Trạng thái đường realtime, đủ để UI nói cho người dùng biết chuyện gì đang xảy ra.
export type DirectSocketStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  // Đã rớt, đang đếm ngược để nối lại.
  | 'reconnecting'
  // Refresh token rồi vẫn bị từ chối: dừng hẳn, người dùng phải đăng nhập lại.
  | 'unauthorized';

// Frame server gửi xuống. Một kiểu cho cả ba loại, giống hệt serverFrame bên Go: các trường
// không thuộc loại frame đó thì vắng mặt.
export interface DirectServerFrame {
  type: 'ready' | 'message' | 'error';
  userId?: string;
  shopId?: string;
  conversationId?: string;
  id?: string;
  senderId?: string;
  senderRole?: DirectSenderRole;
  text?: string;
  createdAt?: string;
  clientMsgId?: string;
  reason?: string;
}

// Frame client gửi lên.
export interface DirectClientFrame {
  type: 'auth' | 'send';
  token?: string;
  conversationId?: string;
  shopId?: string;
  text?: string;
  clientMsgId?: string;
}
