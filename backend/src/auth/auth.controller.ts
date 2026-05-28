import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';

import type { Response } from 'express';

//swagger
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

import { AuthService } from '@/auth/auth.service';

//DTO
import { RegisterDto } from '@/auth/dto/register.dto';
import { LoginDto } from '@/auth/dto/login.dto';
import { VerifyEmailDto } from '@/auth/dto/verify-email.dto';
import { ResendVerificationEmailDto } from '@/auth/dto/resend-verification-email.dto';
import { ChangePasswordDto } from '@/auth/dto/change-password.dto';
import { ForgotPasswordDto } from '@/auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '@/auth/dto/reset-password.dto';
import {
  AuthResponseDto,
  UnverifiedAccountResponseDto,
  UserResponseDto,
} from '@/auth/dto/auth-response.dto';

import { Public, ResponseMessage } from '@/decorator/customize';

// Sinh tài liệu response api chung cho DOCS SWAGGER
// API resonse mặc định của Swagger dùng chuyên để trả lỗi
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

//rate limit
import { Throttle, SkipThrottle } from '@nestjs/throttler';

//Guards
import { AuthGuard } from '@nestjs/passport';
import { LocalAuthGuard } from '@/auth/guard/local-auth.guard';
import { RefreshTokenGuard } from '@/auth/guard/jwt-refresh-auth.guard';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from '@/common/helpers/cookie.helper';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @ResponseMessage('Đăng ký tài khoản thành công')
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiGenericResponse('Đăng ký thành công, vui lòng kiểm tra email.', {
    status: 201,
  })
  @ApiResponse({
    status: 400,
    description:
      'Dữ liệu đầu vào không hợp lệ hoặc tài khoản/email đã tồn tại.',
  })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('seller/register')
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @ResponseMessage('Đăng ký tài khoản người bán thành công')
  @ApiOperation({ summary: 'Đăng ký tài khoản người bán mới' })
  @ApiGenericResponse('Đăng ký thành công, vui lòng kiểm tra email.', {
    status: 201,
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc tài khoản đã tồn tại.',
  })
  registerSeller(@Body() registerDto: RegisterDto) {
    return this.authService.registerSeller(registerDto);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @ResponseMessage(
    'Mã kích hoạt mới đã được gửi. Vui lòng kiểm tra email của bạn.',
  )
  @ApiOperation({ summary: 'Gửi lại email xác thực tài khoản' })
  @ApiGenericResponse('Đã gửi lại email xác thực.')
  @ApiResponse({
    status: 400,
    description: 'Email không tồn tại hoặc tài khoản đã kích hoạt.',
  })
  async resendVerification(@Body() resendDto: ResendVerificationEmailDto) {
    return this.authService.resendVerificationEmail(resendDto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ResponseMessage(
    'Xác thực tài khoản thành công! Bạn có thể đăng nhập ngay bây giờ.',
  )
  @ApiOperation({ summary: 'Xác thực tài khoản bằng mã từ email' })
  @ApiGenericResponse(
    AuthResponseDto,
    'Xác thực thành công và tự động đăng nhập (trả về access_token).',
  )
  @ApiResponse({
    status: 400,
    description: 'Mã xác thực không hợp lệ hoặc đã hết hạn.',
  })
  async verifyEmail(
    @Body() verifyEmailDto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    //gọi hàm để xác thực mã Token trong Email, sau đó trả về 1 cặp AccessToken và RefreshToken để duy trì đăng nhập
    const { access_token, refresh_token, cookie_max_age, user } =
      await this.authService.verifyEmailAndActivateUser(
        verifyEmailDto.verification_token,
      );

    // Set refresh cookie vào cookie với HTTP only
    setRefreshTokenCookie(res, refresh_token, cookie_max_age);

    return {
      access_token,
      user,
    };
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ResponseMessage('Đăng nhập thành công')
  @ApiOperation({ summary: 'Đăng nhập vào hệ thống' })
  @ApiBody({ type: LoginDto })
  @ApiGenericResponse(
    AuthResponseDto,
    'Đăng nhập thành công, trả về access_token và set refresh_token vào cookie.',
    { status: 200 },
  )
  @ApiResponse({
    status: 401,
    description:
      'Lỗi xác thực: \n' +
      '- Sai tài khoản hoặc mật khẩu. \n' +
      '- Tài khoản chưa được xác thực (nếu đăng nhập bằng email): Hệ thống sẽ tự động gửi email chứa token xác thực và yêu cầu frontend redirect người dùng đến trang verify-email.',
    type: UnverifiedAccountResponseDto,
  })
  async login(@Req() req, @Res({ passthrough: true }) res: Response) {
    //nếu đã login sẵn từ trước thì sẽ xóa session hiện tại tạo session mới tránh rác database
    const oldRefreshToken = req.cookies['refresh_token'];
    const { access_token, refresh_token, cookie_max_age, user } =
      await this.authService.handleLogin(req.user, oldRefreshToken);

    // Set refresh cookie vào cookie với HTTP only
    setRefreshTokenCookie(res, refresh_token, cookie_max_age);

    return {
      access_token,
      user,
    };
  }

  @Put('change-password')
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @ResponseMessage(
    'Đã đổi mật khẩu thành công và đã đăng xuất khỏi mọi thiết bị',
  )
  @ApiOperation({ summary: 'Đổi mật khẩu (Cần đăng nhập)' })
  @ApiGenericResponse('Đổi mật khẩu thành công.')
  @ApiResponse({ status: 401, description: 'Không có quyền truy cập.' })
  @ApiResponse({ status: 400, description: 'Mật khẩu cũ không chính xác.' })
  async changePassword(
    @Req() req: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    // req.user được bóc ra từ JWT payload bởi Passport Strategy
    const userId = req.user.sub;
    return await this.authService.changePassword(userId, changePasswordDto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @ResponseMessage(
    'Yêu cầu thành công. Vui lòng kiểm tra hộp thư email của bạn.',
  )
  @ApiOperation({ summary: 'Quên mật khẩu (gửi email khôi phục)' })
  @ApiGenericResponse('Đã gửi email khôi phục.')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return await this.authService.handleForgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Thiết lập mật khẩu mới thành công! Vui lòng đăng nhập lại.')
  @ApiOperation({ summary: 'Đặt lại mật khẩu mới' })
  @ApiGenericResponse('Đặt lại mật khẩu thành công.')
  @ApiResponse({
    status: 400,
    description: 'Token khôi phục không hợp lệ hoặc đã hết hạn.',
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return await this.authService.resetPassword(resetPasswordDto);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ResponseMessage('Lấy thông tin người dùng hiện tại thành công')
  @ApiOperation({
    summary: 'Lấy thông tin người dùng hiện tại từ Access Token',
  })
  @ApiGenericResponse(
    UserResponseDto,
    'Trả về thông tin người dùng không bao gồm mật khẩu.',
    {
      status: 200,
    },
  )
  @ApiResponse({
    status: 401,
    description: 'Không có quyền truy cập hoặc Access Token đã hết hạn.',
  })
  async getMe(@Req() req: any) {
    const userId = req.user.sub;
    return await this.authService.getCurrentUser(userId);
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cấp lại Access Token mới bằng Refresh Token' })
  @ApiGenericResponse(AuthResponseDto, 'Cấp lại token thành công.', {
    status: 200,
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token không hợp lệ hoặc đã hết hạn.',
  })
  async refreshTokens(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userPayload = req.user;

    const refreshToken = req.cookies['refresh_token'];
    const { access_token, refresh_token, cookie_max_age, userWithoutPassword } =
      await this.authService.handleRefreshToken(userPayload, refreshToken);

    setRefreshTokenCookie(res, refresh_token, cookie_max_age);

    return { access_token: access_token, user: userWithoutPassword };
  }

  @Post('logout')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đăng xuất thành công, đã xóa phiên làm việc!')
  @ApiOperation({ summary: 'Đăng xuất khỏi hệ thống' })
  @ApiGenericResponse('Đăng xuất thành công.')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refresh_token'];

    await this.authService.handleLogout(refreshToken);

    clearRefreshTokenCookie(res);
  }
}
