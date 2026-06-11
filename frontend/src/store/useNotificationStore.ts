import { create } from "zustand";

// unreadCount là ephemeral — không persist; re-sync từ GET /notifications mỗi lần Notification Bell mount (W2).
interface NotificationState {
  unreadCount: number;
  increment: () => void;
  reset: () => void;
  setCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  unreadCount: 0,
  increment: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  reset: () => set({ unreadCount: 0 }),
  setCount: (count: number) => set({ unreadCount: Math.max(0, count) }),
}));
