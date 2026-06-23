// src/modules/mail/mail.service.ts
import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(
    private mailerService: MailerService,
    private configService: ConfigService,
  ) {}

  //Gửi email token để người dùng xác thực tài khoản sau khi đăng ký hoặc resend email khi người dùng hết hạn mã cũ
  async sendVerifacationEmail(user: any, verificationToken: string) {
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: `Chào mừng ${user.username}! Hãy xác thực tài khoản của bạn`,
        template: 'verifacation-email',
        context: {
          name: user.username,
          verificationToken: verificationToken,
        },
      });
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  async sendResetPasswordEmail(user: any, verificationToken: string) {
    try {
      //  Lấy URL Frontend từ .env và chuyển vào hbs
      const FRONTEND_URL = this.configService.get<string>('FRONTEND_URL');
      const resetLink = `${FRONTEND_URL}/reset-password?token=${verificationToken}`;
      await this.mailerService.sendMail({
        to: user.email,
        subject: `Khôi phục mật khẩu tài khoản Giang Kha Shop`,
        template: 'reset-password',
        context: {
          name: user.username,
          resetLink: resetLink,
        },
      });
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  async sendShopRejectionEmail(user: any, shopName: string, reason: string) {
    try {
      const FRONTEND_URL = this.configService.get<string>('FRONTEND_URL');
      const loginLink = `${FRONTEND_URL}/login`;
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Đơn đăng ký cửa hàng bị từ chối - Giang Kha Shop',
        template: 'reject-shop',
        context: {
          name: user.username,
          shopName: shopName,
          reason: reason,
          loginLink: loginLink,
        },
      });
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  async sendPayoutStatusEmail(
    user: any,
    shopName: string,
    amount: number,
    status: string,
    reason?: string | null,
  ) {
    try {
      const isApproved = status === 'completed';
      const locale = 'vi-VN';
      const amountNumber = Number(amount);
      const amountText = amountNumber.toLocaleString(locale);
      
      const subject = isApproved
        ? `[Giang Kha Shop] Yêu cầu rút tiền trị giá ${amountText}đ đã được phê duyệt`
        : `[Giang Kha Shop] Yêu cầu rút tiền trị giá ${amountText}đ bị từ chối`;

      const template = isApproved ? 'approve-payout' : 'reject-payout';
      const userEmail = user.email;
      const username = user.username;
      const defaultReason = 'Thông tin tài khoản không chính xác hoặc không đủ điều kiện đối soát.';
      const resolvedReason = reason || defaultReason;

      const mailOptions = {
        to: userEmail,
        subject: subject,
        template: template,
        context: {
          name: username,
          shopName: shopName,
          amount: amountText,
          reason: resolvedReason,
        },
      };

      await this.mailerService.sendMail(mailOptions);
    } catch (error) {
      console.error('[MailService.sendPayoutStatusEmail] Error:', error);
    }
  }
}
