import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, type Profile } from 'passport-google-oauth20';
import { AuthService } from '@/auth/auth.service';
import { UserWithoutPassword } from '@/auth/auth.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') as string,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') as string,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') as string,
      scope: ['email', 'profile'],
    });
  }

  // Passport gọi sau khi đổi authorization code lấy profile Google thành công.
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<UserWithoutPassword> {
    const email = profile.emails?.[0]?.value;
    const emailVerified = Boolean(profile.emails?.[0]?.verified ?? false);
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    const fullName = profile.displayName ?? null;

    if (!email) {
      // Không có email → không thể tạo/định danh account.
      throw new Error('Google profile không có email');
    }

    return this.authService.validateGoogleUser({
      googleId: profile.id,
      email,
      emailVerified,
      fullName,
      avatarUrl,
    });
  }
}
