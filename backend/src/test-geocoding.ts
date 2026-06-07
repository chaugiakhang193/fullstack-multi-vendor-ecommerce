// Services
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { NominatimService } from '@/modules/geocoding/nominatim.service';

async function bootstrap() {
  const context = {
    logger: false as const,
  };
  const app = await NestFactory.createApplicationContext(AppModule, context);
  const geocodingService = app.get(NominatimService);

  const testAddress = 'Hà Nội';
  const result = await geocodingService.geocode(testAddress);

  const separator = '------------------------------------------';
  const inputLabel = 'Địa chỉ đầu vào:';
  const outputLabel = 'Tọa độ trả về:';

  console.log(separator);
  console.log(inputLabel, testAddress);
  console.log(outputLabel, result);
  console.log(separator);

  await app.close();
}

bootstrap().catch(console.error);
