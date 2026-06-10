// NestJS
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Services, Controllers & Gateway
import { EngagementsService } from './engagements.service';
import { EngagementsController } from './engagements.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { OutboxWorker } from './outbox.worker';

// Entities
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Notification } from '@/modules/engagements/entities/notification.entity';
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, Notification, OutboxEvent]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [EngagementsController],
  providers: [
    EngagementsService,
    NotificationGateway,
    NotificationService,
    OutboxWorker,
  ],
})
export class EngagementsModule { }
