// KHỞI TẠO TRACING — file này PHẢI được import đầu tiên trong main.ts, trước
// mọi import khác. OpenTelemetry hoạt động bằng cách vá (patch) các module như
// http/pg/amqplib ngay lúc chúng được require; nếu Nest đã require chúng
// trước thì không còn gì để vá và trace sẽ rỗng.
import "dotenv/config";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Tracing chỉ bật khi có cờ — mặc định TẮT để không ảnh hưởng prod/CI.
const enabled = process.env.OTEL_ENABLED === "true";

if (enabled) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ?? "notification-service",
    }),
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        "http://localhost:4318/v1/traces",
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs sinh hàng nghìn span rác, che hết span thật.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Giữ ĐỐI XỨNG với backend/src/tracing.ts. NS cũng chạy platform-express
        // nên cũng đẻ span 'middleware - patched', chỉ ít hơn vì chỉ có 2 route
        // (/health, /health/broker). Nhưng đúng 2 route đó lại bị gõ liên tục:
        // chuỗi poke warm-up (tới 4 lần/đợt), port-scan của Render, cron ping
        // 10 phút/lần → danh sách trace trong Jaeger loãng đi đúng lúc đang tìm
        // trace thật. Span HTTP gốc vẫn còn (từ instrumentation-http), chỉ mất
        // span con của riêng Express.
        "@opentelemetry/instrumentation-express": {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();
  // eslint-disable-next-line no-console
  console.log("[tracing] OpenTelemetry đã bật → gửi trace về OTLP endpoint");

  // Flush span còn trong buffer khi tắt process, nếu không những span cuối cùng bị mất.
  process.on("SIGTERM", () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });
}
