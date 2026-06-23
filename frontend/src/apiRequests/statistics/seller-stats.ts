import http, { ApiEnvelope } from "@/lib/http";
import { SellerStatsType } from "@/schemaValidations/statistics/seller-stats.schema";

const sellerStatsApiRequest = {
  getOverview: () => http.get<ApiEnvelope<SellerStatsType>>("/seller/stats"),
};

export default sellerStatsApiRequest;
