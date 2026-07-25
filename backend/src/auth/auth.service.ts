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

//Auth types
import {
  UserWithoutPassword,
  SessionUser,
  RefreshTokenPayload,
  RefreshVerdict,
} from '@/auth/auth.types';
import { SessionRotationService } from '@/auth/session-rotation.service';

// [Tech Debt D] Sinh 1 hash bcrypt giả lúc load module bằng CÙNG hàm hash với mật khẩu
// thật → tự khớp cost (đổi saltRounds cũng không lệch timing), không còn chuỗi magic.
// Dùng để cân bằng thời gian phản hồi khi đăng nhập với user không tồn tại — chống dò
// tài khoản qua timing attack. uuidv4() đã import sẵn ở file này nên tái dùng.
const DUMMY_PASSWORD_HASH_PROMISE = hashDataHelper(uuidv4());

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
    private sessionRotationService: SessionRotationService,
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
      // Lọc kèm type: bảng verification_token dùng chung nhiều loại token — không lọc
      // thì token RESET_PASSWORD lọt qua được cửa verify-email (token type confusion).
      const verificationToken = await queryRunner.manager.findOne(
        VerificationToken,
        {
          where: {
            token: verification_token_from_user,
            type: VerificationTokenType.VERIFY_EMAIL,
          },
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
  async validateUser(
    username: string,
    password: string,
  ): Promise<UserWithoutPassword | null> {
    let user = await this.usersService.findByUsername(username);

    // Nếu không tìm thấy bằng username, thử tìm bằng email
    if (!user) {
      user = await this.usersService.findByEmail(username);
    }

    // Nếu không có tài khoản nào khớp:
    // [Tech Debt D] vẫn chạy 1 phép so sánh bcrypt với hash giả để cân bằng thời gian
    // phản hồi với nhánh "sai mật khẩu", tránh lộ email/username có tồn tại hay không.
    if (!user) {
      await compareHashedDataHelper(
        password,
        await DUMMY_PASSWORD_HASH_PROMISE,
      );
      throw new UnauthorizedException(
        'Tài khoản hoặc mật khẩu của bạn không đúng',
      );
    }

    // [OAuth] Account chỉ-Google (chưa đặt password): vẫn chạy dummy compare để KHÔNG lộ
    // qua timing rằng account này không có mật khẩu, rồi báo sai như nhánh sai mật khẩu.
    if (!user.password) {
      await compareHashedDataHelper(
        password,
        await DUMMY_PASSWORD_HASH_PROMISE,
      );
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

    // Mật khẩu đúng nhưng tài khoản chưa xác thực email -> chặn, BẤT KỂ đăng nhập
    // bằng username hay email (trước đây username lách được gate này — bug prod).
    if (user.status === AccountStatus.PENDING_VERIFICATION) {
      // Gửi lại mã (fire-and-forget bên trong helper) — không chặn response login.
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
  async handleLogin(user: UserWithoutPassword, oldRefreshToken: string) {
    //nếu user có sẵn session ở thiết bị hiện tại thì xóa và cấp session mới, tránh rác database
    if (oldRefreshToken) {
      try {
        //lấy sessionID từ payload trong refreshtoken user gửi lên
        const refreshTokenPayload = this.refreshTokenService.decode(
          oldRefreshToken,
        ) as RefreshTokenPayload | null;

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

  /**
   * Phân giải danh tính Google → user nội bộ (find-or-create + link).
   * 3 nhánh: (1) đã link google_id → returning; (2) email trùng → link (kèm
   * takeover nếu pending); (3) email mới → tạo user Google mới.
   * KHÔNG cấp token ở đây. Account bị khoá vẫn trả về (controller sẽ chặn + redirect).
   */
  async validateGoogleUser(params: {
    googleId: string;
    email: string;
    emailVerified: boolean;
    fullName?: string | null;
    avatarUrl?: string | null;
  }): Promise<UserWithoutPassword> {
    const { googleId, email, emailVerified, fullName, avatarUrl } = params;

    // Google gần như luôn trả email đã verify; nếu không → từ chối link (an toàn).
    if (!emailVerified) {
      throw new UnauthorizedException(
        'Email Google của bạn chưa được xác thực. Không thể đăng nhập.',
      );
    }

    // (1) Đã từng link Google → returning user.
    const byGoogleId = await this.usersService.findByGoogleId(googleId);
    if (byGoogleId) {
      const { password, ...userWithoutPassword } = byGoogleId as User;
      return userWithoutPassword;
    }

    // (2) Email đã tồn tại trong hệ thống.
    const byEmail = await this.usersService.findByEmail(email);
    if (byEmail) {
      // Account bị khoá → KHÔNG link, trả nguyên trạng (controller chặn + redirect).
      const lockedStatuses = [
        AccountStatus.BANNED,
        AccountStatus.SUSPENDED,
        AccountStatus.REJECTED,
      ];
      if (lockedStatuses.includes(byEmail.status)) {
        const { password, ...userWithoutPassword } = byEmail;
        return userWithoutPassword;
      }

      const takeoverPending =
        byEmail.status === AccountStatus.PENDING_VERIFICATION;
      const linked = await this.usersService.linkGoogleAccount(byEmail, {
        googleId,
        fullName,
        avatarUrl,
        takeoverPending,
      });
      const { password, ...userWithoutPassword } = linked;
      return userWithoutPassword;
    }

    // (3) Email mới tinh → tạo user Google mới (ACTIVE).
    const created = await this.usersService.createGoogleUser({
      email,
      googleId,
      fullName,
      avatarUrl,
    });
    const { password, ...userWithoutPassword } = created;
    return userWithoutPassword;
  }

  /** [POST] /auth/set-password — tạo mật khẩu lần đầu cho account Google-only. */
  async setPassword(userId: string, newPassword: string) {
    await this.usersService.setUserPassword(userId, newPassword);
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

    // Xóa các token reset cũ của user này (nếu có) để tránh rác DB.
    // Lọc kèm type: không lọc thì xoá nhầm cả token VERIFY_EMAIL đang chờ của user
    // (user pending verification bấm quên mật khẩu → mất oan token kích hoạt).
    await this.verificationTokenRepository.delete({
      user: { id: user.id },
      type: VerificationTokenType.RESET_PASSWORD,
    });

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
      // Lọc kèm type: không lọc thì token VERIFY_EMAIL dùng được để reset mật khẩu
      // (token type confusion — cùng bảng, khác mục đích).
      const verificationToken = await queryRunner.manager.findOne(
        VerificationToken,
        {
          where: { token: token, type: VerificationTokenType.RESET_PASSWORD },
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
  //
  // Rotation + reuse detection. 3 điểm thiết kế quan trọng:
  //  (1) Toàn bộ "đọc → so sánh → ghi" nằm trong 1 transaction có khoá pessimistic
  //      trên đúng row session ⇒ 2 request song song bị tuần tự hoá, không ghi đè nhau.
  //  (2) Token đời trước còn trong grace 10s được chấp nhận ⇒ F5 nhiều tab không bị
  //      đá ra oan (race lành tính), thay vì bị coi là bị đánh cắp.
  //  (3) Việc XOÁ session khi phát hiện reuse làm SAU khi transaction commit — vì
  //      throw bên trong transaction sẽ rollback và undo luôn lệnh xoá.
  async handleRefreshToken(
    userPayload: RefreshTokenPayload,
    originalRefreshToken: string,
  ) {
    const refreshTokenExpiration = this.configService.get(
      'REFRESH_TOKEN_EXPIRATION',
    );
    const cookie_max_age = ms(refreshTokenExpiration);

    // Transaction KHÔNG throw — chỉ trả phán quyết ra ngoài để xử lý sau khi commit.
    const outcome = await this.dataSource.transaction(async (manager) => {
      const verdict = await this.sessionRotationService.verifyAndLock(
        userPayload.sessionId,
        userPayload.sub,
        originalRefreshToken,
        manager,
      );

      if (verdict.status !== RefreshVerdict.OK) {
        const failureStatus = verdict.status;
        return { failure: failureStatus } as const;
      }

      // Đọc lại user để chắc chắn chưa bị xoá / đổi role / bị ban.
      const user = await this.usersService.findById(userPayload.sub);
      if (!user) {
        return { failure: RefreshVerdict.USER_GONE } as const;
      }

      const newPayload = {
        username: user.username,
        id: user.id,
        role: user.role,
        status: user.status,
      };

      const { accessToken, refreshToken } = await this.createTokens(
        newPayload,
        verdict.session.id,
      );

      const expiresAt = new Date(Date.now() + cookie_max_age);
      const newRefreshTokenHash = await hashDataHelper(refreshToken);

      await this.sessionRotationService.commitRotation(
        verdict.session,
        newRefreshTokenHash,
        expiresAt,
        manager,
      );

      const { password, ...userWithoutPassword } = user;
      return {
        failure: null,
        data: {
          access_token: accessToken,
          refresh_token: refreshToken,
          cookie_max_age: cookie_max_age,
          userWithoutPassword: userWithoutPassword,
        },
      } as const;
    });

    // --- Xử lý phán quyết SAU khi transaction đã commit (khoá đã nhả) ---

    // Tách discriminant ra biến để nhánh `default` còn tham chiếu được nó khi mọi
    // case đã xử lý hết (lúc đó `outcome` đã bị thu hẹp xuống `never`).
    const failure = outcome.failure;
    if (failure) {
      switch (failure) {
        case RefreshVerdict.REUSE_DETECTED:
          // Token không thuộc đời nào còn hiệu lực ⇒ nghi bị đánh cắp ⇒ revoke đúng session này.
          await this.sessionRotationService.revokeSession(
            userPayload.sessionId,
            'reuse detected',
          );
          throw new UnauthorizedException(
            'Refresh Token không hợp lệ. Phiên đăng nhập có thể đã bị xâm phạm!',
          );

        case RefreshVerdict.EXPIRED:
          // Session hết hạn tự nhiên — dọn dẹp, không phải sự cố bảo mật.
          await this.sessionRotationService.revokeSession(
            userPayload.sessionId,
            'session expired',
          );
          throw new ForbiddenException(
            'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          );

        case RefreshVerdict.NOT_FOUND:
          throw new ForbiddenException(
            'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          );

        case RefreshVerdict.USER_GONE:
          throw new UnauthorizedException(
            'Tài khoản người dùng không còn tồn tại!',
          );

        default: {
          // Thêm verdict mới mà quên xử lý ở đây ⇒ TypeScript ĐỎ ngay tại dòng này
          // (không gán được vào `never`), thay vì lọt xuống runtime rồi trả 401 sai ngữ cảnh.
          const unhandled: never = failure;
          throw new InternalServerErrorException(
            `Trạng thái refresh chưa được xử lý: ${String(unhandled)}`,
          );
        }
      }
    }

    return outcome.data;
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
          // Log sessionId, KHÔNG log raw refresh token (token còn hạn nằm trong log = rò rỉ).
          this.logger.warn(
            `Session ${sessionId} không tồn tại hoặc đã bị xóa.`,
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

    const hasPassword = await this.usersService.userHasPassword(userId);
    const { password, ...userWithoutPassword } = user;
    return { ...userWithoutPassword, has_password: hasPassword };
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
  private async createTokens(user: SessionUser, sessionId: string) {
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
    // Token PHẢI lưu đồng bộ (await) để user còn verify được.
    await this.verificationTokenRepository.save(newVerificationToken);

    // Gửi mail best-effort, FIRE-AND-FORGET: không await → register/login trả lời ngay,
    // KHÔNG treo ~15s khi SMTP chậm. Lỗi chỉ log; user vẫn bấm "Gửi lại mã" được.
    void this.mailService.sendVerifacationEmail(user, token).catch((error) => {
      this.logger.error(
        `[verify-email] Gửi mail xác thực thất bại (user ${user.id}): ${error?.message ?? error}`,
      );
    });
  }

  private async generateAndSaveSession(
    user: UserWithoutPassword,
    manager?: EntityManager,
  ) {
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
    // user là UserWithoutPassword; Session.user yêu cầu User — cast giữ nguyên object,
    // TypeORM chỉ cần user.id cho FK khi save (hành vi không đổi).
    session.user = user as User;
    session.refresh_token = hashedRefreshToken;
    session.expires_at = expiresAt;

    if (manager) {
      //Lưu khi sử dụng transaction mà gọi hàm
      await manager.save(Session, session);
    } else {
      await this.sessionRepository.save(session);
    }

    // Strip phòng thủ: caller verify-email truyền full User (có password) → phải loại
    // trước khi trả về; caller login truyền sẵn UserWithoutPassword (password đã rỗng).
    const { password, ...userWithoutPassword } = user as User;

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      cookie_max_age: cookie_max_age,
      user: userWithoutPassword,
    };
  }
}
