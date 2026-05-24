import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { ShopsService } from '@/modules/shops/shops.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const shopsService = app.get(ShopsService);

  const shopId = '8bc3f405-9264-4f55-bce7-d897606cd6d2';
  console.log('Testing rejectShop for shop:', shopId);

  try {
    const result = await shopsService.rejectShop(shopId, 'Lý do từ chối thử nghiệm');
    console.log('Success result:', result);
  } catch (error) {
    console.error('Error occurred:', error);
  }

  await app.close();
}

bootstrap();
