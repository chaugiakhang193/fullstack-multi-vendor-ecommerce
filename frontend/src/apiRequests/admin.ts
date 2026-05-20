import http from "@/lib/http";
import {
  RejectShopBodyType,
  GetPendingShopsResType,
  ActionShopResType,
} from "@/schemaValidations/admin.schema";

const adminApiRequest = {
  getPendingShops: () => {
    return http.get<GetPendingShopsResType>("/admin/shops/pending");
  },
  approveShop: (id: string) => {
    return http.patch<ActionShopResType>(`/admin/shops/${id}/approve`, {});
  },
  rejectShop: (id: string, body: RejectShopBodyType) => {
    return http.patch<ActionShopResType>(`/admin/shops/${id}/reject`, body);
  },
};

export default adminApiRequest;
