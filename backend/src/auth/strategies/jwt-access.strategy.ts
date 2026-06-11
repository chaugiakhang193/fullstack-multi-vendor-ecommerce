import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IUser } from '@/interface/user.interface';
import { UsersService } from '@/modules/users/users.service';
import { AccountStatus } from '@/common/enums';

// [Tech Debt B] Các trạng thái tài khoản bị thu hồi quyền truy cập tức thì.
// Chỉ gồm các trạng thái khóa cứng ở cấp tài khoản — KHÔNG bao gồm NEW_SELLER /
// PENDING_* / REJECTED (những user này vẫn có thể là customer hợp lệ).
const REVOKED_STATUSES: AccountStatus[] = [
  AccountStatus.SUSPENDED,
  AccountStatus.BANNED,
];

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  // [Tech Debt B] Đọc lại status/role TƯƠI từ DB mỗi request thay vì tin token (TTL 15m).
  // → Admin ban/đổi role của user có hiệu lực ngay ở request kế tiếp, không phải chờ
  //   access token hết hạn. Trade-off: thêm 1 query/request — chấp nhận được ở quy mô này.
  async validate(payload: IUser): Promise<IUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || REVOKED_STATUSES.includes(user.status)) {
      throw new UnauthorizedException(
        'Tài khoản không còn quyền truy cập. Vui lòng đăng nhập lại.',
      );
    }
    return {
      sub: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
