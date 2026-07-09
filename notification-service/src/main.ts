import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

// KHÔNG setGlobalPrefix('api/v1') — Render healthCheckPath + poke gọi thẳng
// /health (khác backend, có prefix api/v1).
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
  new Logger("Bootstrap").log("[NotificationService] consumer online");
}
bootstrap();
