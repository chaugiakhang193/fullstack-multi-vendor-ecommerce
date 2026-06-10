// NestJS WebSocket
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';

// Socket.io
import { Server, Socket } from 'socket.io';

// NestJS
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';

// External
import { parse } from 'cookie';

// Entities
import { Shop } from '@/modules/shops/entities/shop.entity';

// Không truyền port → Socket.io chia sẻ cùng HTTP port với REST API.
// cors.credentials: true → browser gửi httpOnly cookie trong WebSocket handshake.
@WebSocketGateway({
  cors: {
    origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  // Inject Socket.io Server instance — NestJS tự điền sau khi Gateway khởi tạo.
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    // JwtService từ JwtModule.registerAsync trong EngagementsModule.
    private readonly jwtService: JwtService,

    // Repository<Shop> từ TypeOrmModule.forFeature([Shop]) trong EngagementsModule.
    // Dùng để query shopId của Seller — vì shopId KHÔNG có trong JWT payload.
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
  ) { }

  async handleConnection(client: Socket): Promise<void> {
    try {
      // Parse access_token từ cookie trong HTTP handshake header.
      // Browser tự động gửi cookie trong WebSocket handshake.
      // Hàm parse() chuyển raw cookie string thành object { access_token: "...", ... }
      const rawCookie = client.handshake.headers.cookie ?? '';
      const cookies = parse(rawCookie);
      const token = cookies['access_token'];

      if (!token) {
        this.logger.warn(
          `[Gateway] Từ chối kết nối — không có access_token cookie. socketId=${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Verify JWT — ném JsonWebTokenError hoặc TokenExpiredError nếu không hợp lệ.
      // Payload access token: { sub: string (userId), username, role, status } — không có shopId.
      let jwtPayload: {
        sub: string;
        role: string;
        username: string;
        status: string;
      };
      try {
        jwtPayload = this.jwtService.verify<typeof jwtPayload>(token);
      } catch {
        this.logger.warn(
          `[Gateway] Từ chối kết nối — token không hợp lệ hoặc hết hạn. socketId=${client.id}`,
        );
        client.disconnect();
        return;
      }

      const { sub: userId, role } = jwtPayload;

      // Join room cá nhân TRƯỚC khi query DB.
      // Đảm bảo user vẫn nhận thông báo cá nhân dù DB query bên dưới thất bại.
      const userRoom = `room:${userId}`;
      client.join(userRoom);
      this.logger.log(
        `[Gateway] User ${userId} (${role}) kết nối. socketId=${client.id}`,
      );

      // Seller → query DB lấy shopId để join room shop.
      // shopId không có trong JWT — query 1 lần/session là trade-off chấp nhận được
      // thay vì sửa auth flow ở 3 chỗ (login, refresh, createTokens).
      if (role === 'SELLER') {
        try {
          // Shop entity: cột 'seller_id', relation property 'seller'
          // → where: { seller: { id: userId } } là đúng cú pháp TypeORM relation filter
          const shop = await this.shopRepository.findOne({
            where: { seller: { id: userId } },
            select: { id: true },
          });

          if (shop) {
            const shopRoom = `room:${shop.id}`;
            client.join(shopRoom);
            this.logger.log(
              `[Gateway] Seller ${userId} joined shop room:${shop.id}`,
            );
          } else {
            // Seller token hợp lệ nhưng shop bị xóa sau khi đăng nhập.
            // Không disconnect — vẫn nhận thông báo cá nhân qua userRoom.
            this.logger.warn(
              `[Gateway] SELLER ${userId} không có shop trong DB — chỉ join room cá nhân.`,
            );
          }
        } catch (dbError) {
          // Không disconnect — user đã join userRoom ở bước trên.
          this.logger.warn(
            `[Gateway] Query shopId thất bại cho user ${userId}: ${(dbError as Error).message}`,
          );
        }
      }
    } catch (unexpectedError) {
      // Catch-all cho lỗi không lường trước — disconnect để tránh client treo.
      this.logger.error(
        `[Gateway] Lỗi không lường trước trong handleConnection: ${(unexpectedError as Error).message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    // Socket.io tự động xóa client khỏi tất cả rooms khi disconnect.
    // Không cần gọi client.leave() thủ công.
    this.logger.log(`[Gateway] Socket ${client.id} ngắt kết nối.`);
  }

  // Public API cho OutboxWorker (Commit #3)

  /**
   * Gửi event đến TẤT CẢ socket của 1 user.
   * Hoạt động đúng khi user mở nhiều tab (nhiều socket cùng 1 room).
   */
  sendToUser(userId: string, event: string, payload: unknown): void {
    const userRoom = `room:${userId}`;
    this.server.to(userRoom).emit(event, payload);
  }

  /**
   * Gửi event đến TẤT CẢ socket đang theo dõi 1 shop.
   * Dùng để báo Seller khi có đơn hàng mới.
   */
  sendToShop(shopId: string, event: string, payload: unknown): void {
    const shopRoom = `room:${shopId}`;
    this.server.to(shopRoom).emit(event, payload);
  }
}
