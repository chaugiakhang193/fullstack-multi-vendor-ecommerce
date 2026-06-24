import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types
import { ProductResponseType } from '@/schemaValidations/products/products.schema';

// Interfaces
interface RecentlyViewedState {
  items: ProductResponseType[];
  addProduct: (product: ProductResponseType) => void;
  clear: () => void;
}

export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      items: [],

      addProduct: (product) => {
        set((state) => {
          // Lọc bỏ sản phẩm trùng lặp trong danh sách hiện tại
          const filteredItems = state.items.filter((item) => {
            const isSame = item.id === product.id;
            return !isSame;
          });

          // Thêm sản phẩm mới lên đầu danh sách
          const combinedItems = [product, ...filteredItems];

          // Giới hạn tối đa 10 sản phẩm vừa xem
          const sliceStart = 0;
          const sliceEnd = 10;
          const updatedItems = combinedItems.slice(sliceStart, sliceEnd);

          const updatedState = { items: updatedItems };
          return updatedState;
        });
      },

      clear: () => {
        const clearedState = { items: [] };
        set(clearedState);
      },
    }),
    {
      name: 'recently-viewed', // Tên key lưu trong localStorage
    },
  ),
);
