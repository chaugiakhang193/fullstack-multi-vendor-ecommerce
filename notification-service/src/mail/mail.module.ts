import { MailerModule } from "@nestjs-modules/mailer";
import { HandlebarsAdapter } from "@nestjs-modules/mailer/adapters/handlebars.adapter";
import { Global, Module } from "@nestjs/common";
import { MailService } from "@/mail/mail.service";
import { join } from "path";
import { ConfigService } from "@nestjs/config";

// Move từ backend (Phase 4, P4-6) — chỉ giữ template payout ở NS vì
// handlePayoutStatusChanged là handler outbox DUY NHẤT gửi mail. Backend giữ
// nguyên MailModule đầy đủ cho mode inprocess (xoá ở Phase 7).
@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: async (config: ConfigService) => ({
        transport: {
          host: "smtp.gmail.com",
          secure: false,
          auth: {
            user: config.get("MAIL_USER"),
            pass: config.get("MAIL_PASSWORD"),
          },
        },
        defaults: {
          from: '"No Reply" <noreply@shopee-clone.com>',
        },
        template: {
          dir: join(__dirname, "templates"),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
