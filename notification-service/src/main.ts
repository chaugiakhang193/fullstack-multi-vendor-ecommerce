import "./tracing";

import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { setDefaultResultOrder } from "node:dns";

// Render không có route IPv6 egress → smtp.gmail.com qua IPv6 báo ENETUNREACH.
// Ép Node ưu tiên IPv4 cho MỌI DNS (payout mail gửi ở NS).
setDefaultResultOrder("ipv4first");

// KHÔNG setGlobalPrefix('api/v1') — Render healthCheckPath + poke gọi thẳng
// /health (khác backend, có prefix api/v1).
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
  new Logger("Bootstrap").log("[NotificationService] consumer online");
}
bootstrap();
