import { create } from 'zustand';

// Chỉ giữ trạng thái đóng/mở, KHÔNG giữ tin nhắn.
//
// Tin nhắn để trong useState của widget: stream nhả chữ vài chục mili giây một lần, đẩy từng
// mảnh vào store là mọi component subscribe đều re-render theo.
//
// Cố ý KHÔNG dùng BroadcastChannel như auth-channel/cart_channel: hai kênh đó đồng bộ state
// của server (phiên đăng nhập, giỏ hàng) nên tab nào cũng phải biết. Còn đóng/mở widget là
// state UI của riêng từng tab — giống CartDrawer, mở ở tab này không có lý do gì bật lên ở
// tab đang đọc trang khác.
interface ChatWidgetState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useChatWidgetStore = create<ChatWidgetState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
