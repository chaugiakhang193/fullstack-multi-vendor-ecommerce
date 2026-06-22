import http, { ApiEnvelope } from "@/lib/http";
import { AdminStatsType } from "@/schemaValidations/statistics/admin-stats.schema";

const adminStatsApiRequest = {
  getOverview: () => http.get<ApiEnvelope<AdminStatsType>>("/admin/stats"),
};

export default adminStatsApiRequest;
