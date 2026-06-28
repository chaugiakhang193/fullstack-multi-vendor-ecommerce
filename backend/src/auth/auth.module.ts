import { Module } from '@nestjs/common';
import { AuthService } from '@/auth/auth.service';
import { AuthController } from '@/auth/auth.controller';
import { UsersModule } from '@/modules/users/users.module';
import { MailModule } from '@/modules/mail/mail.module';

//JWT
import { JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ACCESS_TOKEN_SERVICE,
  REFRESH_TOKEN_SERVICE,
} from '@/auth/auth.constants';

//TypeORM
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '@/auth/entities/session.entity';
import { VerificationToken } from '@/auth/entities/verification-token.entity';

//Paspart strategies
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from '@/auth/strategies/local.strategy';
import { AccessTokenStrategy } from '@/auth/strategies/jwt-access.strategy';
import { RefreshTokenStrategy } from '@/auth/strategies/jwt-refresh.strategy';
import { GoogleStrategy } from '@/auth/strategies/google.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    UsersModule,
    MailModule,
    PassportModule,
    TypeOrmModule.forFeature([Session, VerificationToken]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    AccessTokenStrategy,
    RefreshTokenStrategy,
    GoogleStrategy,
    {
      provide: ACCESS_TOKEN_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new JwtService({
          secret: config.get('JWT_ACCESS_SECRET'),
          signOptions: { expiresIn: config.get('ACCESS_TOKEN_EXPIRATION') },
        });
      },
    },

    {
      provide: REFRESH_TOKEN_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new JwtService({
          secret: config.get('JWT_REFRESH_SECRET'),
          signOptions: { expiresIn: config.get('REFRESH_TOKEN_EXPIRATION') },
        });
      },
    },
  ],
})
export class AuthModule {}
