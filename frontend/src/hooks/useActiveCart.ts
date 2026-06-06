import { useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/constants/query-keys";
import { BROADCAST_CHANNELS, BROADCAST_EVENTS } from "@/constants/broadcast";

// Stores
import { useCartStore, CartItem } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";

// API requests
import cartApiRequest from "@/apiRequests/carts/carts";
import { CartGenericResponseType } from "@/schemaValidations/carts/carts.schema";
import { getErrorMessage } from "@/lib/http";

// Types
import type { components } from "@/lib/api/api-schema";

type CartResponseDto = components["schemas"]["CartResponseDto"];
type CartItemResponseDto = components["schemas"]["CartItemResponseDto"];
type CartShopGroupDto = components["schemas"]["CartShopGroupDto"];

/**
 * Helper to map guest cart items from Zustand to the CartResponseDto structure.
 */
const mapGuestCartToDto = (localItems: CartItem[]): CartResponseDto => {
  const groupsMap: Record<string, { shopName: string; items: CartItemResponseDto[] }> = {};

  let totalItems = 0;
  let totalQuantity = 0;
  let totalAmount = 0;

  localItems.forEach((item) => {
    const shopKey = item.shopId || "default-shop";
    if (!groupsMap[shopKey]) {
      groupsMap[shopKey] = {
        shopName: item.shopName || "Cửa hàng",
        items: [],
      };
    }

    const itemPrice = Number(item.price) || 0;
    const itemQty = Number(item.quantity) || 0;
    const subtotal = itemPrice * itemQty;

    // Identify variant info
    const variantInfo = item.variantId
      ? item.variants.find((v) => v.id === item.variantId)
      : null;

    const stockVal = variantInfo ? variantInfo.stock_quantity : item.baseStock;
    const isAvail = stockVal > 0;
    const mappedReason = isAvail ? undefined : ("out_of_stock" as const);

    const mappedItem: CartItemResponseDto = {
      id: `${item.productId}_${item.variantId || "none"}`,
      product: {
        id: item.productId,
        name: item.name,
        slug: item.productSlug,
        price: item.basePrice,
        thumbnail_url: item.thumbnailUrl as any,
        is_hidden: false,
        status: "active",
      },
      variant: item.variantId
        ? {
            id: item.variantId,
            name: variantInfo?.name || "Mặc định",
            additional_price: Number(variantInfo?.additional_price) || 0,
          }
        : null,
      quantity: item.quantity,
      unit_price: item.price,
      subtotal,
      added_at: new Date().toISOString(),
      available_stock: stockVal,
      is_available: isAvail,
      reason: mappedReason,
    };

    groupsMap[shopKey].items.push(mappedItem);
    totalItems += 1;
    totalQuantity += itemQty;
    totalAmount += subtotal;
  });

  const items_by_shop: CartShopGroupDto[] = Object.entries(groupsMap).map(([shopId, group]) => {
    const shop_subtotal = group.items.reduce((sum, item) => sum + item.subtotal, 0);
    const mappedGroupObj: CartShopGroupDto = {
      shop: {
        id: shopId,
        name: group.shopName,
        logo_url: null,
      },
      items: group.items,
      shop_subtotal,
    };
    return mappedGroupObj;
  });

  const cartResponseObj: CartResponseDto = {
    items_by_shop,
    total_items: totalItems,
    total_quantity: totalQuantity,
    total_amount: totalAmount,
  };

  return cartResponseObj;
};

export function useActiveCart() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  // Zustand guest cart state
  const guestItems = useCartStore((state) => state.items);
  const guestAddItem = useCartStore((state) => state.addItem);

  // Database Cart query - Only query if user is logged in AND is not an admin (admins do not have a cart)
  const isAuthorizedToCart = isAuthenticated && user?.role !== "admin";
  const cartQueryConfig = {
    queryKey: [QUERY_KEYS.CART],
    queryFn: () => cartApiRequest.getCart(),
    enabled: isAuthorizedToCart,
    staleTime: 1000 * 60 * 5, // Cache for 5 mins
  };
  const { data: dbCartPayload, isLoading: isDbLoading, refetch } = useQuery(cartQueryConfig);

  // Synchronize guest cart (Zustand) across tabs via storage event
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "cart") {
        useCartStore.persist.rehydrate();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Synchronize database cart (React Query) across tabs using BroadcastChannel
  useEffect(() => {
    if (typeof window === "undefined" || !isAuthenticated) return;

    const channel = new BroadcastChannel(BROADCAST_CHANNELS.CART);
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data === BROADCAST_EVENTS.CART_UPDATED) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CART] });
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }, [isAuthenticated, queryClient]);

  // Helper to broadcast cart updates to other tabs
  const broadcastCartUpdate = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNELS.CART);
      channel.postMessage(BROADCAST_EVENTS.CART_UPDATED);
      channel.close();
    } catch (error) {
      console.error("Failed to broadcast cart update:", error);
    }
  }, []);

  // Normalized items: unified format representing both guest items and database items
  const items: CartItem[] = useMemo(() => {
    if (!isAuthenticated) {
      return guestItems;
    }

    if (!dbCartPayload?.data) {
      return [];
    }

    return dbCartPayload.data.items_by_shop.flatMap((shopGroup) => {
      return shopGroup.items.map((dbItem) => {
        const rawImages = dbItem.variant && (dbItem.variant as any).images;
        let variantImages: string[] = [];
        if (Array.isArray(rawImages)) {
          variantImages = rawImages;
        } else if (typeof rawImages === "string" && rawImages.trim() !== "") {
          if (rawImages.startsWith("[") && rawImages.endsWith("]")) {
            try {
              variantImages = JSON.parse(rawImages);
            } catch (e) {
              variantImages = rawImages.split(",").map((img: string) => img.trim());
            }
          } else {
            variantImages = rawImages.split(",").map((img: string) => img.trim());
          }
        }

        const finalThumbnailUrl =
          variantImages.length > 0
            ? variantImages[0]
            : ((dbItem.product.thumbnail_url as any) || "/placeholder-product.png");

        const item: CartItem = {
          productId: dbItem.product.id,
          variantId: dbItem.variant?.id || null,
          quantity: dbItem.quantity,
          name: dbItem.product.name,
          price: dbItem.unit_price,
          thumbnailUrl: finalThumbnailUrl,
          shopId: shopGroup.shop.id,
          shopName: shopGroup.shop.name,
          productSlug: `${dbItem.product.slug}-i.${dbItem.product.id}`,
          variants: [], // Empty for DB items, swap handles dynamically
          basePrice: dbItem.product.price,
          hasVariants: dbItem.variant !== null,
          baseStock: dbItem.available_stock,
          variantName: dbItem.variant?.name || undefined,
        };

        // Attach DB specific values as extra properties
        (item as any).id = dbItem.id;
        (item as any).isAvailable = dbItem.is_available;
        (item as any).reason = dbItem.reason;

        return item;
      });
    });
  }, [isAuthenticated, dbCartPayload, guestItems]);

  // Unify cart data structure
  const cart: CartResponseDto = useMemo(() => {
    if (isAuthenticated) {
      if (dbCartPayload?.data) {
        return dbCartPayload.data;
      }
      const emptyDbObj: CartResponseDto = {
        items_by_shop: [],
        total_items: 0,
        total_quantity: 0,
        total_amount: 0,
      };
      return emptyDbObj;
    }
    const guestCartMapped = mapGuestCartToDto(guestItems);
    return guestCartMapped;
  }, [isAuthenticated, dbCartPayload, guestItems]);

  const isLoading = isAuthenticated ? isDbLoading : false;

  // Add Item operation
  const addItem = useCallback(
    async (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      const targetQty = item.quantity ?? 1;

      if (!isAuthenticated) {
        // Guest: save to Zustand
        guestAddItem(item);
        return;
      }

      // Member: save to DB via API
      try {
        const bodyObj = {
          product_id: item.productId,
          variant_id: item.variantId || undefined,
          quantity: targetQty,
        };
        await cartApiRequest.add(bodyObj);
        
        const successMsg = `Đã thêm ${item.name} vào giỏ hàng!`;
        toast.success(successMsg);

        // Invalidate cache
        const queryKeyObj = { queryKey: [QUERY_KEYS.CART] };
        await queryClient.invalidateQueries(queryKeyObj);

        // Broadcast to other tabs
        broadcastCartUpdate();
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        toast.error(errorMsg);
      }
    },
    [isAuthenticated, guestAddItem, queryClient, broadcastCartUpdate]
  );

  // Debounce timers for quantity updates to avoid race conditions
  const pendingUpdatesRef = useRef<Record<string, { timer: NodeJS.Timeout; quantity: number }>>({});

  // Update Item Quantity operation
  const updateQuantity = useCallback(
    async (productId: string, variantId: string | null, newQty: number) => {
      if (newQty <= 0) {
        const removeArgs = { productId, variantId };
        await removeItem(removeArgs.productId, removeArgs.variantId);
        return;
      }

      if (!isAuthenticated) {
        // Guest: Zustand
        useCartStore.getState().updateQuantity(productId, variantId, newQty);
        return;
      }

      // Member: DB (Optimistic Update + Debounce)
      const cartItem = items.find((i) => i.productId === productId && i.variantId === variantId);
      const cartItemId = cartItem ? (cartItem as any).id : null;
      if (!cartItemId) {
        toast.error("Không tìm thấy sản phẩm trong giỏ hàng!");
        return;
      }
      
      // 1. Clear previous timer
      if (pendingUpdatesRef.current[cartItemId]) {
        const prevTimer = pendingUpdatesRef.current[cartItemId].timer;
        clearTimeout(prevTimer);
      }

      // 2. Cancel query and modify cache immediately
      const queryKeyObj = { queryKey: [QUERY_KEYS.CART] };
      await queryClient.cancelQueries(queryKeyObj);
      const previousCart = queryClient.getQueryData<CartGenericResponseType>([QUERY_KEYS.CART]);

      if (previousCart?.data) {
        const oldCart = previousCart.data;
        let totalQtyDiff = 0;
        let totalAmountDiff = 0;

        const updatedGroups = oldCart.items_by_shop.map((shopGroup) => {
          let updatedSubtotal = shopGroup.shop_subtotal;
          const updatedItems = shopGroup.items.map((item) => {
            if (item.id === cartItemId) {
              const currentQty = item.quantity;
              const diffQty = newQty - currentQty;
              const price = item.unit_price;
              totalQtyDiff += diffQty;
              totalAmountDiff += diffQty * price;
              updatedSubtotal += diffQty * price;

              return {
                ...item,
                quantity: newQty,
                subtotal: newQty * price,
              };
            }
            return item;
          });

          const mappedGroupObj: CartShopGroupDto = {
            ...shopGroup,
            items: updatedItems,
            shop_subtotal: updatedSubtotal,
          };
          return mappedGroupObj;
        });

        const newCartPayloadObj: CartGenericResponseType = {
          ...previousCart,
          data: {
            ...oldCart,
            items_by_shop: updatedGroups,
            total_quantity: oldCart.total_quantity + totalQtyDiff,
            total_amount: oldCart.total_amount + totalAmountDiff,
          },
        };

        queryClient.setQueryData<CartGenericResponseType>([QUERY_KEYS.CART], newCartPayloadObj);
      }

      // 3. Debounce execution
      const timer = setTimeout(async () => {
        delete pendingUpdatesRef.current[cartItemId];
        try {
          const bodyObj = { quantity: newQty };
          await cartApiRequest.updateQuantity(cartItemId, bodyObj);
          
          const queryKeyObj = { queryKey: [QUERY_KEYS.CART] };
          await queryClient.invalidateQueries(queryKeyObj);

          // Broadcast to other tabs
          broadcastCartUpdate();
        } catch (error) {
          // Rollback on error
          if (previousCart) {
            queryClient.setQueryData([QUERY_KEYS.CART], previousCart);
          }
          const errorMsg = getErrorMessage(error);
          toast.error(errorMsg);
        }
      }, 500);

      pendingUpdatesRef.current[cartItemId] = { timer, quantity: newQty };
    },
    [isAuthenticated, queryClient, items, broadcastCartUpdate]
  );

  // Remove Item operation
  const removeItem = useCallback(
    async (productId: string, variantId: string | null) => {
      if (!isAuthenticated) {
        // Guest: Zustand
        useCartStore.getState().removeItem(productId, variantId);
        return;
      }

      // Member: DB (Optimistic Update)
      const cartItem = items.find((i) => i.productId === productId && i.variantId === variantId);
      const cartItemId = cartItem ? (cartItem as any).id : null;
      if (!cartItemId) {
        toast.error("Không tìm thấy sản phẩm trong giỏ hàng!");
        return;
      }

      const queryKeyObj = { queryKey: [QUERY_KEYS.CART] };
      await queryClient.cancelQueries(queryKeyObj);
      const previousCart = queryClient.getQueryData<CartGenericResponseType>([QUERY_KEYS.CART]);

      if (previousCart?.data) {
        const oldCart = previousCart.data;
        let removedQty = 0;
        let removedAmount = 0;

        const updatedGroups = oldCart.items_by_shop
          .map((shopGroup) => {
            const currentItem = shopGroup.items.find((item) => item.id === cartItemId);
            if (currentItem) {
              removedQty = currentItem.quantity;
              removedAmount = currentItem.subtotal;
            }

            const remainingItems = shopGroup.items.filter((item) => item.id !== cartItemId);
            const shop_subtotal = shopGroup.shop_subtotal - removedAmount;

            const mappedGroupObj: CartShopGroupDto = {
              ...shopGroup,
              items: remainingItems,
              shop_subtotal,
            };
            return mappedGroupObj;
          })
          .filter((shopGroup) => shopGroup.items.length > 0);

        const newCartPayloadObj: CartGenericResponseType = {
          ...previousCart,
          data: {
            ...oldCart,
            items_by_shop: updatedGroups,
            total_quantity: oldCart.total_quantity - removedQty,
            total_items: oldCart.total_items - 1,
            total_amount: oldCart.total_amount - removedAmount,
          },
        };

        queryClient.setQueryData<CartGenericResponseType>([QUERY_KEYS.CART], newCartPayloadObj);
      }

      try {
        await cartApiRequest.removeItem(cartItemId);
        
        const successMsg = "Đã xóa sản phẩm khỏi giỏ hàng!";
        toast.success(successMsg);

        const queryKeyObj = { queryKey: [QUERY_KEYS.CART] };
        await queryClient.invalidateQueries(queryKeyObj);

        // Broadcast to other tabs
        broadcastCartUpdate();
      } catch (error) {
        // Rollback
        if (previousCart) {
          queryClient.setQueryData([QUERY_KEYS.CART], previousCart);
        }
        const errorMsg = getErrorMessage(error);
        toast.error(errorMsg);
      }
    },
    [isAuthenticated, queryClient, items, broadcastCartUpdate]
  );

  // Clear Cart operation
  const clearCart = useCallback(async () => {
    if (!isAuthenticated) {
      // Guest: Zustand
      useCartStore.getState().clearCart();
      return;
    }

    // Member: DB
    try {
      await cartApiRequest.clearCart();
      
      const successMsg = "Đã làm trống giỏ hàng!";
      toast.success(successMsg);

      const queryKeyObj = { queryKey: [QUERY_KEYS.CART] };
      await queryClient.invalidateQueries(queryKeyObj);

      // Broadcast to other tabs
      broadcastCartUpdate();
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      toast.error(errorMsg);
    }
  }, [isAuthenticated, queryClient, broadcastCartUpdate]);

  // Update Variant operation
  const updateVariant = useCallback(
    async (productId: string, oldVariantId: string | null, newVariantId: string | null) => {
      if (!isAuthenticated) {
        // Guest: Zustand
        useCartStore.getState().updateVariant(productId, oldVariantId, newVariantId);
        return;
      }

      // Member: DB (delete old item, add new item)
      const cartItem = items.find((i) => i.productId === productId && i.variantId === oldVariantId);
      const cartItemId = cartItem ? (cartItem as any).id : null;
      const quantity = cartItem ? cartItem.quantity : 1;
      if (!cartItemId) {
        toast.error("Không tìm thấy sản phẩm trong giỏ hàng!");
        return;
      }

      try {
        await cartApiRequest.removeItem(cartItemId);
        const bodyObj = {
          product_id: productId,
          variant_id: newVariantId || undefined,
          quantity,
        };
        await cartApiRequest.add(bodyObj);

        const queryKeyObj = { queryKey: [QUERY_KEYS.CART] };
        await queryClient.invalidateQueries(queryKeyObj);

        // Broadcast to other tabs
        broadcastCartUpdate();

        const successMsg = "Đã cập nhật phiên bản sản phẩm!";
        toast.success(successMsg);
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        toast.error(errorMsg);
      }
    },
    [isAuthenticated, queryClient, items, broadcastCartUpdate]
  );

  const useActiveCartResult = {
    cart,
    items,
    isLoading,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    updateVariant,
    refetch,
  };

  return useActiveCartResult;
}
