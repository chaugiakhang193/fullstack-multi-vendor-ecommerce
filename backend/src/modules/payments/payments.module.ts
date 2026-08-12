import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Constants
import { VNPAY_EXPIRY_QUEUE } from '@/modules/orders/vnpay-expiry.constants';

// Services & Controllers
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { VnpayService } from './vnpay/vnpay.service';

// Entities
import { Payment } from './entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    BullModule.registerQueue({ name: VNPAY_EXPIRY_QUEUE }),
  ],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, VnpayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
