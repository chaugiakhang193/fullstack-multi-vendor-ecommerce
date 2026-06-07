// Services
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShopsService } from '@/modules/shops/shops.service';
import { NominatimService } from './nominatim.service';

@Injectable()
export class GeocodingRetryCron {
  private readonly logger = new Logger(GeocodingRetryCron.name);

  constructor(
    @Inject(forwardRef(() => ShopsService))
    private readonly shopsService: ShopsService,
    private readonly geocodingService: NominatimService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    const startLogMsg =
      'Đang chạy tác vụ nền cập nhật lại tọa độ geocoding lỗi...';
    this.logger.log(startLogMsg);

    const shopsToRetry = await this.shopsService.findUnverifiedShops();
    const shopsCount = shopsToRetry.length;

    if (shopsCount === 0) {
      const noShopsLogMsg =
        'Không tìm thấy cửa hàng nào chưa được xác định tọa độ.';
      this.logger.log(noShopsLogMsg);
      return;
    }

    const foundShopsLogMsg = `Tìm thấy ${shopsCount} cửa hàng chưa xác thực tọa độ.`;
    this.logger.log(foundShopsLogMsg);

    for (const shop of shopsToRetry) {
      const address = shop.pickup_address;
      if (!address) {
        continue;
      }

      const shopName = shop.name;
      const retryLogMsg = `Thử cập nhật lại tọa độ cho shop: ${shopName} (${address})`;
      this.logger.log(retryLogMsg);

      const result = await this.geocodingService.geocode(address);
      const isSuccess = result.success;
      const lat = result.lat;
      const lng = result.lng;

      if (isSuccess && lat !== null && lng !== null) {
        const shopId = shop.id;
        const latStr = lat.toString();
        const lngStr = lng.toString();
        await this.shopsService.updateShopCoordinates(shopId, latStr, lngStr);

        const successLogMsg = `Cập nhật thành công tọa độ cho shop: ${shopName}`;
        this.logger.log(successLogMsg);
      } else {
        const failLogMsg = `Thử lại vẫn thất bại cho shop: ${shopName}`;
        this.logger.warn(failLogMsg);
      }
    }
  }
}
