import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';
import { Public } from '@/decorator/customize';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Health-check công khai (cron không gửi token → @Public). Chạy 1 query nhẹ để:
  //  1. Giữ Supabase free không pause (tính là database activity khi cron ping).
  //  2. Xác nhận kết nối DB còn sống — nếu DB chết, SELECT 1 ném lỗi → trả non-200
  //     để cron/uptime monitor báo động.
  @Public()
  @Get('health')
  async health() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', db: 'up' };
  }
}
