import http from "@/lib/http";
import { ShopResponseResType } from "@/schemaValidations/seller.schema";

const sellerApiRequest = {
  // Seller khởi tạo shop lần đầu (multipart/form-data)
  setupInitialShop: (body: FormData) => {
    return http.post<ShopResponseResType>("/seller/shops/setup", body);
  },
  // Seller lấy thông tin shop của mình
  getMyShop: () => {
    return http.get<ShopResponseResType>("/seller/shops");
  },
  // Seller cập nhật shop (multipart/form-data)
  updateMyShop: (body: FormData) => {
    return http.patch<ShopResponseResType>("/seller/shops", body);
  },
  // Seller nộp lại đơn đăng ký sau khi bị từ chối
  reApplyShop: () => {
    return http.post<ShopResponseResType>("/seller/shops/re-apply", {});
  },
  // Seller xóa 1 ảnh trong gallery
  deleteGalleryImage: (assetId: string) => {
    return http.delete<any>(`/seller/shops/gallery/${assetId}`);
  },
};

export default sellerApiRequest;
