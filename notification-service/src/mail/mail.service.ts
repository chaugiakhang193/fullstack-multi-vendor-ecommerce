import { MailerService } from "@nestjs-modules/mailer";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// Move từ backend (Phase 4, P4-6) — chỉ giữ sendPayoutStatusEmail, vì đây là
// email DUY NHẤT gắn với 1 outbox event (payout.status_changed). Các mail
// khác (verify/reset-password/reject-shop) không phải outbox-driven, ở lại
// backend.
@Injectable()
export class MailService {
  constructor(
    private mailerService: MailerService,
    private configService: ConfigService,
  ) {}

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

  // email báo seller sản phẩm bị gỡ (CHỈ gọi khi action=taken_down).
  // Best-effort — tự nuốt lỗi, KHÔNG chặn notif/WS/ack. Deep-link tới trang sản
  // phẩm seller (nếu có FRONTEND_URL) để seller xem/sửa.
  async sendProductModeratedEmail(
    user: { email: string; username: string },
    productName: string,
    productId: string,
    reason: string | null,
  ) {
    try {
      const subject = `[Giang Kha Shop] Sản phẩm "${productName}" đã bị gỡ`;
      const frontendUrl = this.configService.get<string>("FRONTEND_URL") ?? "";
      const productUrl = frontendUrl
        ? `${frontendUrl}/seller/products/${productId}`
        : "";
      const defaultReason = "Vi phạm chính sách nội dung của sàn.";
      const resolvedReason = reason || defaultReason;
      await this.mailerService.sendMail({
        to: user.email,
        subject,
        template: "take-down-product",
        context: {
          name: user.username,
          productName,
          reason: resolvedReason,
          productUrl,
        },
      });
    } catch (error) {
      console.error("[MailService.sendProductModeratedEmail] Error:", error);
    }
  }
}
