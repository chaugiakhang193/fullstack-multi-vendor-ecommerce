import { create } from "zustand";
import { persist } from "zustand/middleware";

// Định nghĩa kiểu cho một sản phẩm trong giỏ hàng lưu local
export interface LocalCartItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  // Lưu thêm thông tin tĩnh để hiển thị nhanh không cần fetch lại
  name: string;
  price: number;
  thumbnail: string;
  shop_name: string;
  shop_id: string;
}

interface CartState {
  items: LocalCartItem[];
  isOpenDrawer: boolean;
}

interface CartActions {
  addItem: (item: Omit<LocalCartItem, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (product_id: string, variant_id: string | null, quantity: number) => void;
  removeItem: (product_id: string, variant_id: string | null) => void;
  clearCart: () => void;
  setOpenDrawer: (isOpen: boolean) => void;
}

export const useCartStore = create<CartState & CartActions>()(
  persist(
    (set) => ({
      // State mặc định
      items: [],
      isOpenDrawer: false,

      // Actions
      addItem: (newItem) =>
        set((state) => {
          const quantityToAdd = newItem.quantity ?? 1;
          const existingItemIndex = state.items.findIndex(
            (item) =>
              item.product_id === newItem.product_id &&
              item.variant_id === newItem.variant_id
          );

          if (existingItemIndex > -1) {
            const updatedItems = [...state.items];
            updatedItems[existingItemIndex].quantity += quantityToAdd;
            return { items: updatedItems, isOpenDrawer: true };
          }

          return {
            items: [
              ...state.items,
              { ...newItem, quantity: quantityToAdd },
            ],
            isOpenDrawer: true,
          };
        }),

      updateQuantity: (product_id, variant_id, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.product_id === product_id && item.variant_id === variant_id
              ? { ...item, quantity }
              : item
          ),
        })),

      removeItem: (product_id, variant_id) =>
        set((state) => ({
          items: state.items.filter(
            (item) =>
              !(item.product_id === product_id && item.variant_id === variant_id)
          ),
        })),

      clearCart: () => set({ items: [] }),
      setOpenDrawer: (isOpen) => set({ isOpenDrawer: isOpen }),
    }),
    {
      name: "guest-cart-storage", // Khóa lưu trong localStorage
      partialize: (state) => ({ items: state.items }), // Chỉ lưu danh sách items
    }
  )
);
