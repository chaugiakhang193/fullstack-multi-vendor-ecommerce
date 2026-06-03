import http from "@/lib/http";
import { ShopResponseResType } from "@/schemaValidations/shops/shops.schema";

const shopsApiRequest = {
  // === R: Read (Public Endpoints) ===
  // (Nơi đặt các API public về Shop như lấy thông tin chi tiết của một Shop cho khách hàng xem)
  getPublicShopDetail: (id: string) => {
    return http.get<ShopResponseResType>(`/shops/${id}`);
  },
};

export default shopsApiRequest;
