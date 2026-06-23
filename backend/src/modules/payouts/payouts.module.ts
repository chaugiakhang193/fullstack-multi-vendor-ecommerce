import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayoutsService } from './payouts.service';
import { SellerPayoutsController } from './seller-payouts.controller';
import { AdminPayoutsController } from './admin-payouts.controller';
import { Payout } from './entities/payout.entity';

import { ShopsModule } from '@/modules/shops/shops.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { MailModule } from '@/modules/mail/mail.module';
import { EngagementsModule } from '@/modules/engagements/engagements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout]),
    ShopsModule,
    OrdersModule,
    MailModule,
    EngagementsModule,
  ],
  controllers: [SellerPayoutsController, AdminPayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
