// Modules
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShopsModule } from '@/modules/shops/shops.module';

// Controllers
import { GeocodingController } from './geocoding.controller';

// Services
import { NominatimService } from './nominatim.service';
import { GeocodingRetryCron } from './geocoding-retry.cron';

@Module({
  imports: [ConfigModule, forwardRef(() => ShopsModule)],
  controllers: [GeocodingController],
  providers: [NominatimService, GeocodingRetryCron],
  exports: [NominatimService],
})
export class GeocodingModule {}
