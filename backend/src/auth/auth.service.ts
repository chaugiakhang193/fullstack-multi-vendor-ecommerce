import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
//DTO
import { RegisterDto } from '@/auth/dto/register.dto';
import { UpdateAuthDto } from '@/auth/dto/update-auth.dto';
import { ResendVerificationEmailDto } from '@/auth/dto/resend-verification-email.dto';
import { ChangePasswordDto } from '@/auth/dto/change-password.dto';
import { ForgotPasswordDto } from '@/auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '@/auth/dto/reset-password.dto';

import { UsersService } from '@/modules/users/users.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from '@/modules/mail/mail.service';

//typeorm
import { DataSource, Repository, EntityManager } from 'typeorm';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Session } from '@/auth/entities/session.entity';
import { VerificationToken } from '@/auth/entities/verification-token.entity';
import { User } from '@/modules/users/entities/user.entity';

//helpers
import {
  compareHashedDataHelper,
  hashDataHelper,
} from '@/common/helpers/utils';
import ms from 'ms';
import { v4 as uuidv4 } from 'uuid';
import { VerificationTokenType, AccountStatus, UserRole } from '@/common/enums';

//JWT
import { JwtService } from '@nestjs/jwt';
import { REFRESH_TOKEN_SERVICE } from '@/auth/auth.constants';
import { ACCESS_TOKEN_SERVICE } from '@/auth/auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(VerificationToken)
    private verificationTokenRepository: Repository<VerificationToken>,
    @InjectDataSource() private dataSource: DataSource,
    private usersService: UsersService,
    private mailService: MailService,
    private configService: ConfigService,
    @Inject(ACCESS_TOKEN_SERVICE) private accessTokenService: JwtService,
    @Inject(REFRESH_TOKEN_SERVICE) private refreshTokenService: JwtService,
  ) {}

  //[POST] /auth/register
  async register(RegisterDto: RegisterDto) {
    //tạo mới người dùng role CUSTOMER mặc định
    const newUser = await this.usersService.createCustomer(RegisterDto);

    await this.generateAndSendVerificationEmail(newUser);
  }

  //[POST] /auth/seller/register
  async registerSeller(registerDto: RegisterDto) {
    //tạo mới người dùng với role SELLER
    const newUser = await this.usersService.createSeller(registerDto);

    await this.generateAndSendVerificationEmail(newUser);
  }

  // [POST] auth/resend-verification
  async resendVerificationEmail(resendDto: ResendVerificationEmailDto) {
    const { email } = resendDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Tài khoản không tồn tại trong hệ thống.');
    }

    //kiểm tra xem tài khoản đã kích hoạt từ trước chưa
    if (
      user.status === AccountStatus.ACTIVE ||
      (user.role === UserRole.SELLER &&
        (user.status === AccountStatus.PENDING_APPROVAL ||
          user.status === AccountStatus.NEW_SELLER))
    ) {
      throw new BadRequestException(
        'Tài khoản này đã được kích hoạt từ trước.',
      );
    }

    //Xóa tất cả các token đã hết hạn, và chỉ xóa token dùng để Verify Email
    await this.verificationTokenRepository.delete({
      user: { id: user.id },
      type: VerificationTokenType.VERIFY_EMAIL,
    });

    await this.generateAndSendVerificationEmail(user);
  }

  // [POST] auth/verify-email
  async verifyEmailAndActivateUser(verification_token_from_user: string) {
    //Tạo transaction từ DataSource
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      //dựa trên token user cấp rồi tìm trong database xem có tồn tại token này không
      const verificationToken = await queryRunner.manager.findOne(
        VerificationToken,
        {
          where: { token: verification_token_from_user },
          relations: ['user'],
        },
      );

      // Check sự tồn tại của token
      if (!verificationToken) {
        throw new BadRequestException(
          'Mã xác thực không hợp lệ hoặc đã được sử dụng.',
        );
      }

      if (verificationToken.expires_at < new Date()) {
        throw new BadRequestException('Mã xác thực đã hết hạn.');
      }

      const user = verificationToken.user;

      // Tránh trường hợp bấm double-click hoặc verify lại
      if (
        user.status === AccountStatus.ACTIVE ||
        (user.role === UserRole.SELLER &&
          (user.status === AccountStatus.PENDING_APPROVAL ||
            user.status === AccountStatus.NEW_SELLER))
      ) {
        throw new BadRequestException(
          'Tài khoản này đã được kích hoạt từ trước.',
        );
      }

      // nhật trạng thái User thành 'active' đối với Customer, hoặc 'new_seller' đối với Seller
      if (user.role === UserRole.SELLER) {
        user.status = AccountStatus.NEW_SELLER;
      } else {
        user.status = AccountStatus.ACTIVE;
      }
      await queryRunner.manager.save(User, user); // Lệnh UPDATE

      // Xóa Verification Token đã sử dụng
      await queryRunner.manager.remove(VerificationToken, verificationToken); // Lệnh DELETE

      //xóa tất cả token liên quan đến user này
      await queryRunner.manager.delete(Session, { user: { id: user.id } });
      const sessionData = await this.generateAndSaveSession(
        user,
        queryRunner.manager,
      );
      // commit khi 2 lệnh chạy trong database trên đều thành công
      await queryRunner.commitTransaction();
      return sessionData; // trả về AT, RT, cookie_max_age, userwithoutpassword
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Hệ thống gặp sự cố khi xác thực, vui lòng thử lại.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // được gọi trong LocalStrategy để xác thực tài khoản khi đăng nhập
  async validateUser(username: string, password: string): Promise<any> {
    let isLoginByEmail = false;
    let user = await this.usersService.findByUsername(username);

    // Nếu không tìm thấy bằng username, thử tìm bằng email
    if (!user) {
      user = await this.usersService.findByEmail(username);
      isLoginByEmail = true;
    }

    // Nếu không có tài khoản nào khớp
    if (!user) {
      throw new UnauthorizedException(
        'Tài khoản hoặc mật khẩu của bạn không đúng',
      );
    }

    // Kiểm tra mật khẩu
    const isValidPassword = await compareHashedDataHelper(
      password,
      user.password,
    );

    if (!isValidPassword) {
      return null; // LocalStrategy sẽ tự động ném ra lỗi UnauthorizedException
    }

    // Nếu mật khẩu đúng nhưng tài khoản chưa xác thực email, và người dùng đang cố đăng nhập bằng email -> chặn lại
    if (isLoginByEmail && user.status === AccountStatus.PENDING_VERIFICATION) {
      await this.generateAndSendVerificationEmail(user);
      throw new UnauthorizedException(
        'Tài khoản chưa được xác thực. Vui lòng kiểm tra email của bạn để kích hoạt.',
      );
    }

    // Trả về user (đã loại bỏ password)
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // [POST] auth/login
  async handleLogin(user: any, oldRefreshToken: string) {
    //nếu user có sẵn session ở thiết bị hiện tại thì xóa và cấp session mới, tránh rác database
    if (oldRefreshToken) {
      try {
        //lấy sessionID từ payload trong refreshtoken user gửi lên
        const refreshTokenPayload: any =
          this.refreshTokenService.decode(oldRefreshToken);

        //token hợp lệ thì xóa session cũ trước khi chạy vào hàm tạo session mới
        if (refreshTokenPayload && refreshTokenPayload.sessionId) {
          await this.sessionRepository.delete({
            id: refreshTokenPayload.sessionId,
          });
        }
      } catch (error) {
        this.logger.error(error);
      }
    }

    return await this.generateAndSaveSession(user);
  }

  // [PUT] /auth/change-password
  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { old_password, new_password } = changePasswordDto;
    await this.usersService.changeUserPassword(
      userId,
      old_password,
      new_password,
    );
    // Sau khi đổi mật khẩu thành công mới chạy xuống xóa các session cũ, xóa hết refreshtoken cũ
    await this.sessionRepository
      .createQueryBuilder()
      .delete()
      .where('user_id = :id', { id: userId })
      .execute();
  }

  // [POST] /auth/forgot-password
  async handleForgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return;
    }

    // Xóa các token reset cũ của user này (nếu có) để tránh rác DB
    await this.verificationTokenRepository.delete({ user: { id: user.id } });

    // Tạo token xác thực tài khoản và gửi email cho người dùng
    const resetToken = uuidv4();
    const tokenExpiration = new Date(Date.now() + 15 * 60 * 1000);
    const newVerificationToken = this.verificationTokenRepository.create({
      user: user,
      token: resetToken,
      type: VerificationTokenType.RESET_PASSWORD,
      expires_at: tokenExpiration,
    });
    await this.verificationTokenRepository.save(newVerificationToken);

    await this.mailService.sendResetPasswordEmail(user, resetToken);

    return;
  }

  // [POST] auth/reset-password
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, new_password } = resetPasswordDto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Tìm token và kèm theo thông tin user
      const verificationToken = await queryRunner.manager.findOne(
        VerificationToken,
        {
          where: { token: token },
          relations: ['user'],
        },
      );

      // Kiểm tra token có tồn tại và còn hạn không
      if (!verificationToken) {
        throw new BadRequestException(
          'Đường dẫn khôi phục không hợp lệ hoặc đã được sử dụng.',
        );
      }
      if (verificationToken.expires_at < new Date()) {
        throw new BadRequestException(
          'Đường dẫn khôi phục đã hết hạn. Vui lòng yêu cầu lại.',
        );
      }

      const user = verificationToken.user;

      // Hash mật khẩu mới và cập nhật thời gian
      const hashedNewPassword = await hashDataHelper(new_password);
      user.password = hashedNewPassword;
      user.password_changed_at = new Date();

      // Auto-active cho CUSTOMER đang bị pending xác thực email
      // (Bảo vệ an toàn: KHÔNG áp dụng cho SELLER đang chờ duyệt - PENDING_APPROVAL)
      if (
        user.role === UserRole.CUSTOMER &&
        user.status === AccountStatus.PENDING_VERIFICATION
      ) {
        user.status = AccountStatus.ACTIVE;
      }

      // Lưu User với thông tin mới
      await queryRunner.manager.save(User, user);

      // Xóa token vừa xài xong
      await queryRunner.manager.remove(VerificationToken, verificationToken);

      // Xóa toàn bộ Session cũ của User này
      await queryRunner.manager.delete(Session, { user: { id: user.id } });

      // Hoàn tất giao dịch
      await queryRunner.commitTransaction();

      return;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Lỗi hệ thống khi đặt lại mật khẩu.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // [POST] auth/refresh
  async handleRefreshToken(userPayload: any, originalRefreshToken: string) {
    // Tìm Session trực tiếp dựa vào payload, sub là user id
    const session = await this.sessionRepository.findOne({
      where: { id: userPayload.sessionId, user: { id: userPayload.sub } },
      relations: ['user'],
    });

    // Session không tồn tại → 403 (Bình thường - có thể đã logout hoặc hết hạn)
    if (!session) {
      throw new ForbiddenException(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    // Kiểm tra session đã hết hạn chưa
    if (session.expires_at && new Date() > session.expires_at) {
      // Xóa session hết hạn khỏi DB để dọn dẹp
      await this.sessionRepository.remove(session);
      throw new ForbiddenException(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    // Check Token xem có hợp lệ không
    const isTokenMatch = await compareHashedDataHelper(
      originalRefreshToken,
      session.refresh_token,
    );

    // Token không khớp → 401 (Nguy hiểm - có thể bị đánh cắp)
    if (!isTokenMatch) {
      throw new UnauthorizedException(
        'Refresh Token không hợp lệ. Phiên đăng nhập có thể đã bị xâm phạm!',
      );
    }

    // Tìm kiếm thông tin mới nhất về người dùng thông qua session.user.id
    // để đảm bảo user chưa bị xóa hoặc cập nhật role/status
    const user = await this.usersService.findById(session.user.id);

    // User không tồn tại → 401
    if (!user) {
      throw new UnauthorizedException(
        'Tài khoản người dùng không còn tồn tại!',
      );
    }

    const newPayload = {
      username: user.username,
      id: user.id,
      role: user.role,
      status: user.status,
    };

    const { accessToken, refreshToken } = await this.createTokens(
      newPayload,
      session.id,
    );

    const refreshTokenExpiration = this.configService.get(
      'REFRESH_TOKEN_EXPIRATION',
    );
    const cookie_max_age = ms(refreshTokenExpiration);
    const expiresAt = new Date(Date.now() + cookie_max_age); //tạo thời gian hết hạn refreshtoken mới

    session.refresh_token = await hashDataHelper(refreshToken);
    session.expires_at = expiresAt;

    await this.sessionRepository.save(session);
    const { password, ...userWithoutPassword } = user;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      cookie_max_age: cookie_max_age,
      userWithoutPassword: userWithoutPassword,
    };
  }

  // [POST] auth/logout
  async handleLogout(refreshToken: string) {
    if (!refreshToken) return;
    try {
      const payload = await this.refreshTokenService.verifyAsync(refreshToken);
      const sessionId = payload.sessionId;
      if (sessionId) {
        const result = await this.sessionRepository.delete(sessionId);

        if (result.affected === 0) {
          this.logger.warn(
            `Session ${refreshToken} không tồn tại hoặc đã bị xóa.`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        'Refresh token không hợp lệ hoặc đã hết hạn trong lúc Logout',
      );
    }

    return { message: 'Đăng xuất thành công' };
  }

  // [GET] /auth/me
  async getCurrentUser(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException(
        'Tài khoản người dùng không còn tồn tại!',
      );
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  create(createAuthDto: RegisterDto) {
    return 'This action adds a new auth';
  }

  findAll() {
    return `This action returns all auth`;
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  update(id: number, updateAuthDto: UpdateAuthDto) {
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }

  //Helpers
  // Tạo AccessToken & RefreshToken
  private async createTokens(user: any, sessionId: string) {
    // Access Token: Cần Role để làm Guard phân quyền
    const { id, username, role, status } = user;
    const atPayload = {
      sub: id,
      username: username,
      role: role, // Luôn luôn chứa role
      status: status,
    };

    // Refresh Token: Chỉ cần ID và SessionId (Càng nhỏ càng bảo mật)
    const rtPayload = {
      sub: id,
      sessionId: sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.accessTokenService.signAsync(atPayload),
      this.refreshTokenService.signAsync(rtPayload),
    ]);

    return { accessToken, refreshToken };
  }

  private async generateAndSendVerificationEmail(user: User) {
    //tạo token xác thực tài khoản và gửi email cho người dùng
    const token = uuidv4();
    const tokenExpiration = new Date(Date.now() + 5 * 60 * 1000);
    const newVerificationToken = this.verificationTokenRepository.create({
      user: user,
      token: token,
      type: VerificationTokenType.VERIFY_EMAIL,
      expires_at: tokenExpiration,
    });
    await this.verificationTokenRepository.save(newVerificationToken);

    //gửi email xác thực tài khoản
    await this.mailService.sendVerifacationEmail(user, token);
  }

  private async generateAndSaveSession(user: any, manager?: EntityManager) {
    //chuẩn bị payload và session ID để tạo AccessToken và RefreshToken
    const payload = {
      username: user.username,
      id: user.id,
      role: user.role,
      status: user.status,
    };
    const sessionId = uuidv4();
    const { accessToken, refreshToken } = await this.createTokens(
      payload,
      sessionId,
    );

    // Tính toán thời gian hết hạn của refresh token
    const refreshTokenExpiration = this.configService.get(
      'REFRESH_TOKEN_EXPIRATION',
    );
    const cookie_max_age = ms(refreshTokenExpiration);
    const expiresAt = new Date(Date.now() + cookie_max_age);

    //hash refresh token trước khi lưu vào database
    const hashedRefreshToken = await hashDataHelper(refreshToken);

    const session = new Session();
    session.id = sessionId;
    session.user = user;
    session.refresh_token = hashedRefreshToken;
    session.expires_at = expiresAt;

    if (manager) {
      //Lưu khi sử dụng transaction mà gọi hàm
      await manager.save(Session, session);
    } else {
      await this.sessionRepository.save(session);
    }

    const { password, ...userWithoutPassword } = user;

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      cookie_max_age: cookie_max_age,
      user: userWithoutPassword,
    };
  }
}
