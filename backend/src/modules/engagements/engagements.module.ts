// NestJS
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Services, Controllers & Gateway
import { EngagementsService } from './engagements.service';
import { ReviewsController } from './reviews.controller';
import { SellerReviewsController } from './seller-reviews.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { OutboxWorker } from './outbox.worker';

// Entities
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Notification } from '@/modules/engagements/entities/notification.entity';
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';
import { Review } from '@/modules/engagements/entities/review.entity';

// Modules (Rule II.11 — truy cập entity module khác qua service của module đó)
import { ProductsModule } from '@/modules/products/products.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { ShopsModule } from '@/modules/shops/shops.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, Notification, OutboxEvent, Review]),
    ProductsModule,
    OrdersModule,
    ShopsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [
    ReviewsController,
    SellerReviewsController,
    NotificationsController,
  ],
  providers: [
    EngagementsService,
    NotificationGateway,
    NotificationService,
    OutboxWorker,
  ],
  exports: [NotificationService, NotificationGateway],
})
export class EngagementsModule {}
