// Modules
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShopsModule } from '@/modules/shops/shops.module';

// Services
import { NominatimService } from './nominatim.service';
import { GeocodingRetryCron } from './geocoding-retry.cron';

@Module({
  imports: [ConfigModule, forwardRef(() => ShopsModule)],
  providers: [NominatimService, GeocodingRetryCron],
  exports: [NominatimService],
})
export class GeocodingModule {}
