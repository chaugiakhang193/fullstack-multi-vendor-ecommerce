// KHỞI TẠO TRACING — file này PHẢI được import đầu tiên trong main.ts, trước cả
// './instrument' (Sentry) và trước mọi import khác. OpenTelemetry hoạt động bằng
// cách vá (patch) các module như http/pg/amqplib ngay lúc chúng được require;
// nếu Nest đã require chúng trước thì không còn gì để vá và trace sẽ rỗng.
import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Tracing chỉ bật khi có cờ — mặc định TẮT để không ảnh hưởng prod/CI.
const enabled = process.env.OTEL_ENABLED === 'true';

if (enabled) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'monolith-backend',
    }),
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        'http://localhost:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs sinh hàng nghìn span rác, che hết span thật.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Mỗi request Express sinh ~25 span 'middleware - patched' (cors,
        // jsonParser, ...) che mất waterfall thật (outbox/RabbitMQ/NS).
        // ignoreLayersType KHÔNG lọc hết vì Express 5 định tuyến qua package
        // `router` riêng — span 'middleware -/'request handler -' thực ra
        // đến từ @opentelemetry/instrumentation-router, KHÔNG phải
        // instrumentation-express. Phải tắt cả hai; span HTTP gốc vẫn có
        // (từ instrumentation-http), chỉ mất span con của riêng Express.
        '@opentelemetry/instrumentation-express': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-router': {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();
  // eslint-disable-next-line no-console
  console.log('[tracing] OpenTelemetry đã bật → gửi trace về OTLP endpoint');

  // Flush span còn trong buffer khi tắt process, nếu không những span cuối cùng bị mất.
  process.on('SIGTERM', () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });
}
