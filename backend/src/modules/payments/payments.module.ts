import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Services & Controllers
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { VnpayService } from './vnpay/vnpay.service';

// Entities
import { Payment } from './entities/payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [PaymentsController],
  providers: [PaymentsService, VnpayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
