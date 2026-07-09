import { MailerService } from "@nestjs-modules/mailer";
import { Injectable } from "@nestjs/common";

// Move từ backend (Phase 4, P4-6) — chỉ giữ sendPayoutStatusEmail, vì đây là
// email DUY NHẤT gắn với 1 outbox event (payout.status_changed). Các mail
// khác (verify/reset-password/reject-shop) không phải outbox-driven, ở lại
// backend.
@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendPayoutStatusEmail(
    user: { email: string; username: string },
    shopName: string,
    amount: number,
    status: string,
    reason?: string | null,
  ) {
    try {
      const isApproved = status === "completed";
      const locale = "vi-VN";
      const amountNumber = Number(amount);
      const amountText = amountNumber.toLocaleString(locale);

      const subject = isApproved
        ? `[Giang Kha Shop] Yêu cầu rút tiền trị giá ${amountText}đ đã được phê duyệt`
        : `[Giang Kha Shop] Yêu cầu rút tiền trị giá ${amountText}đ bị từ chối`;

      const template = isApproved ? "approve-payout" : "reject-payout";
      const defaultReason =
        "Thông tin tài khoản không chính xác hoặc không đủ điều kiện đối soát.";
      const resolvedReason = reason || defaultReason;

      await this.mailerService.sendMail({
        to: user.email,
        subject,
        template,
        context: {
          name: user.username,
          shopName,
          amount: amountText,
          reason: resolvedReason,
        },
      });
    } catch (error) {
      // Best-effort: lỗi mail không được chặn PROCESSED/notif.
      console.error("[MailService.sendPayoutStatusEmail] Error:", error);
    }
  }
}
