import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ShopsService } from './modules/shops/shops.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const shopsService = app.get(ShopsService);

  const userId = '23df0468-81c7-4cd6-a8c8-9e85d99749f8';
  console.log('Testing reApplyShop for user:', userId);

  try {
    const result = await shopsService.reApplyShop(userId);
    console.log('Success result:', result);
  } catch (error) {
    console.error('Error occurred:', error);
  }

  await app.close();
}

bootstrap();
