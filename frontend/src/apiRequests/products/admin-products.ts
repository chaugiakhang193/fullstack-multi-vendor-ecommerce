import http from '@/lib/http';
import { buildQuery } from '@/lib/utils';
import { ProductStatus } from '@/constants/enum.generated';
import {
  AdminProductListSchema,
  AdminProductListEnvelopeType,
  TakeDownProductBodyType,
  SingleProductResponseType,
} from '@/schemaValidations/products/products.schema';

type AdminProductQuery = {
  page?: number;
  limit?: number;
  q?: string;
  status?: ProductStatus;
  shop_id?: string;
};

const adminProductsApiRequest = {
  // List sản phẩm toàn sàn (entity thô: price decimal STRING → .parse coerce number).
  getAdminProducts: (query?: AdminProductQuery) => {
    const queryStr = buildQuery(query);
    const url = `/admin/products${queryStr}`;
    return http.get<AdminProductListEnvelopeType>(url).then((res) => {
      const parsedData = AdminProductListSchema.parse(res.data);
      const parsedRes = {
        message: res.message,
        data: parsedData,
      };
      return parsedRes;
    });
  },

  // Gỡ sản phẩm (moderation) — body reason ≥5.
  takeDownProduct: (productId: string, body: TakeDownProductBodyType) => {
    const url = `/admin/products/${productId}/take-down`;
    return http.patch<SingleProductResponseType>(url, body);
  },

  // Khôi phục sản phẩm bị gỡ.
  restoreProduct: (productId: string) => {
    const url = `/admin/products/${productId}/restore`;
    const emptyBody = {};
    return http.patch<SingleProductResponseType>(url, emptyBody);
  },
};

export default adminProductsApiRequest;
