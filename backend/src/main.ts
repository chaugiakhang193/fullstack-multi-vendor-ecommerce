import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL');

  app.setGlobalPrefix('api/v1');
  // [Tech Debt F] Bảo mật HTTP headers. Tắt CSP để không chặn Swagger UI ở dev.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: frontendUrl,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, // Thêm dòng này để kích hoạt auto-transform
    }),
  );

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fullstack Web API')
    .setDescription('Tài liệu API cho dự án Fullstack Web')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Nhập Access Token (không cần thêm "Bearer " phía trước)',
      },
      'access-token', // tên security scheme — dùng trong @ApiBearerAuth('access-token')
    )
    .addTag('Auth', 'Đăng ký, đăng nhập, xác thực tài khoản')
    .addTag('users', 'Quản lý thông tin tài khoản người dùng')
    .addTag(
      'products',
      'Khách hàng xem danh sách và chi tiết sản phẩm (Public)',
    )
    .addTag('seller-products', 'Seller quản lý kho hàng và đăng sản phẩm')
    .addTag('categories', 'Khách hàng xem danh mục sản phẩm (Public)')
    .addTag('shops', 'Khách hàng xem thông tin gian hàng (Public)')
    .addTag('seller-shops', 'Seller đăng ký và thiết lập gian hàng')
    .addTag('admin-shops', 'Admin phê duyệt gian hàng và quản trị hệ thống')
    .addTag('orders', 'Quản lý đơn hàng mua sắm')
    .addTag('carts', 'Quản lý giỏ hàng của khách hàng')
    .addTag('payments', 'Thao tác thanh toán')
    .addTag('promotions', 'Quản lý chương trình khuyến mãi')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // giữ token sau khi reload trang
    },
  });

  if (process.env.NODE_ENV === 'production') {
    // Đứng sau proxy HTTPS của Render → tin X-Forwarded-* để cookie `secure` hoạt động.
    const trustProxyKey = 'trust proxy';
    const trustProxyValue = 1;
    app.set(trustProxyKey, trustProxyValue);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
