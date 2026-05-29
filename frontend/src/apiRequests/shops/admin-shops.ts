import http from "@/lib/http";
import {
  RejectShopBodyType,
  GetPendingShopsResType,
  ActionShopResType,
} from "@/schemaValidations/admin.schema";

const adminShopsApiRequest = {
  // === R: Read ===
  getPendingShops: () => {
    return http.get<GetPendingShopsResType>("/admin/shops/pending");
  },

  // === U: Update (Approve / Reject) ===
  approveShop: (id: string) => {
    return http.patch<ActionShopResType>(`/admin/shops/${id}/approve`, {});
  },

  rejectShop: (id: string, body: RejectShopBodyType) => {
    return http.patch<ActionShopResType>(`/admin/shops/${id}/reject`, body);
  },
};

export default adminShopsApiRequest;
