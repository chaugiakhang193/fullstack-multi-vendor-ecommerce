import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

// Import types
import type { ProductVariantResponseType } from "@/schemaValidations/products/products.schema";

export interface CartItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  name: string;
  price: number; // final price (basePrice + additional_price)
  thumbnailUrl: string;
  shopId: string;
  shopName: string;
  productSlug: string;
  variants: ProductVariantResponseType[];
  basePrice: number;
  hasVariants: boolean;
  productStock: number;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateVariant: (productId: string, oldVariantId: string | null, newVariantId: string | null) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      setIsOpen: (isOpen: boolean) => {
        set({ isOpen });
      },

      addItem: (newItem) => {
        const { items } = get();
        const quantity = newItem.quantity ?? 1;

        const findItemFn = (item: CartItem) => {
          const isSameProduct = item.productId === newItem.productId;
          const isSameVariant = item.variantId === newItem.variantId;
          return isSameProduct && isSameVariant;
        };

        const existingItem = items.find(findItemFn);

        if (existingItem) {
          const targetVariant = existingItem.variantId
            ? existingItem.variants.find((v) => v.id === existingItem.variantId)
            : null;
          const maxStock = targetVariant ? targetVariant.stock_quantity : existingItem.productStock;

          const updatedQuantity = existingItem.quantity + quantity;

          if (updatedQuantity > maxStock) {
            const limitMsg = "Số lượng trong giỏ hàng đã đạt giới hạn tồn kho!";
            toast.error(limitMsg);
            return;
          }

          const updatedItems = items.map((item) => {
            const isTarget = item.productId === newItem.productId && item.variantId === newItem.variantId;
            return isTarget ? { ...item, quantity: updatedQuantity } : item;
          });

          set({ items: updatedItems });
        } else {
          const itemToAdd: CartItem = {
            ...newItem,
            quantity,
          };
          const updatedItems = [...items, itemToAdd];
          set({ items: updatedItems });
        }

        const successMsg = `Đã thêm ${newItem.name} vào giỏ hàng!`;
        toast.success(successMsg);

        // Dispatch event for compatibility with non-Zustand components
        if (typeof window !== "undefined") {
          const cartUpdateEventName = "cart-updated";
          const customEvent = new CustomEvent(cartUpdateEventName);
          window.dispatchEvent(customEvent);
        }
      },

      updateQuantity: (productId, variantId, quantity) => {
        const { items } = get();
        const findItemFn = (item: CartItem) => {
          const isSameProduct = item.productId === productId;
          const isSameVariant = item.variantId === variantId;
          return isSameProduct && isSameVariant;
        };
        const targetItem = items.find(findItemFn);
        if (!targetItem) return;

        const targetVariant = variantId
          ? targetItem.variants.find((v) => v.id === variantId)
          : null;
        const maxStock = targetVariant ? targetVariant.stock_quantity : targetItem.productStock;

        if (quantity > maxStock) {
          const limitMsg = `Rất tiếc, sản phẩm này chỉ còn ${maxStock} sản phẩm trong kho!`;
          toast.error(limitMsg);
          return;
        }

        if (quantity <= 0) {
          const updatedItems = items.filter((item) => {
            const isTarget = item.productId === productId && item.variantId === variantId;
            return !isTarget;
          });
          set({ items: updatedItems });
        } else {
          const updatedItems = items.map((item) => {
            const isTarget = item.productId === productId && item.variantId === variantId;
            return isTarget ? { ...item, quantity } : item;
          });
          set({ items: updatedItems });
        }

        if (typeof window !== "undefined") {
          const cartUpdateEventName = "cart-updated";
          const customEvent = new CustomEvent(cartUpdateEventName);
          window.dispatchEvent(customEvent);
        }
      },

      removeItem: (productId, variantId) => {
        const { items } = get();
        const updatedItems = items.filter((item) => {
          const isTarget = item.productId === productId && item.variantId === variantId;
          return !isTarget;
        });

        set({ items: updatedItems });

        const removeMsg = "Đã xóa sản phẩm khỏi giỏ hàng!";
        toast.success(removeMsg);

        if (typeof window !== "undefined") {
          const cartUpdateEventName = "cart-updated";
          const customEvent = new CustomEvent(cartUpdateEventName);
          window.dispatchEvent(customEvent);
        }
      },

      updateVariant: (productId, oldVariantId, newVariantId) => {
        const { items } = get();

        // 1. Tìm item cũ cần sửa
        const findOldItemFn = (item: CartItem) => {
          const isSameProduct = item.productId === productId;
          const isSameVariant = item.variantId === oldVariantId;
          return isSameProduct && isSameVariant;
        };
        const oldItem = items.find(findOldItemFn);
        if (!oldItem) return;

        // 2. Tìm thông tin variant mới
        const newVariant = oldItem.variants.find((v) => v.id === newVariantId);
        if (!newVariant) return;

        // 3. Tính toán giá mới và thumbnail mới
        const finalPrice = oldItem.basePrice + newVariant.additional_price;
        const finalThumbnailUrl =
          newVariant.images && newVariant.images.length > 0
            ? newVariant.images[0]
            : oldItem.thumbnailUrl;

        // 4. Kiểm tra xem variant mới này đã tồn tại trong giỏ hàng chưa (để gộp)
        const findNewItemFn = (item: CartItem) => {
          const isSameProduct = item.productId === productId;
          const isSameVariant = item.variantId === newVariantId;
          return isSameProduct && isSameVariant;
        };
        const existingNewItem = items.find(findNewItemFn);

        let updatedItems: CartItem[] = [];

        if (existingNewItem) {
          // Nếu đã tồn tại variant mới trong giỏ hàng -> gộp số lượng
          const combinedQuantity = existingNewItem.quantity + oldItem.quantity;
          const maxStock = newVariant.stock_quantity;

          if (combinedQuantity > maxStock) {
            // Nếu gộp lại vượt quá kho, ta giữ số lượng tối đa trong kho cho item mới và xóa item cũ
            existingNewItem.quantity = maxStock;
            const limitMsg = `Tổng số lượng sau khi gộp vượt quá tồn kho. Đã tự động điều chỉnh về tối đa ${maxStock} sản phẩm.`;
            toast.warning(limitMsg);
          } else {
            existingNewItem.quantity = combinedQuantity;
          }

          // Xóa item cũ và giữ item mới đã gộp
          updatedItems = items.filter((item) => {
            const isOldTarget = item.productId === productId && item.variantId === oldVariantId;
            return !isOldTarget;
          });
        } else {
          // Nếu chưa tồn tại -> cập nhật item cũ sang variant mới
          updatedItems = items.map((item) => {
            const isOldTarget = item.productId === productId && item.variantId === oldVariantId;
            if (isOldTarget) {
              return {
                ...item,
                variantId: newVariantId,
                price: finalPrice,
                thumbnailUrl: finalThumbnailUrl,
              };
            }
            return item;
          });
        }

        set({ items: updatedItems });

        const successMsg = "Đã cập nhật phiên bản sản phẩm!";
        toast.success(successMsg);

        if (typeof window !== "undefined") {
          const cartUpdateEventName = "cart-updated";
          const customEvent = new CustomEvent(cartUpdateEventName);
          window.dispatchEvent(customEvent);
        }
      },

      clearCart: () => {
        set({ items: [] });

        if (typeof window !== "undefined") {
          const cartUpdateEventName = "cart-updated";
          const customEvent = new CustomEvent(cartUpdateEventName);
          window.dispatchEvent(customEvent);
        }
      },
    }),
    {
      name: "cart", // Lưu vào localStorage với key "cart"
    }
  )
);
