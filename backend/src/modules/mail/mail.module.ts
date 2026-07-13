import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { Global, Module } from '@nestjs/common';
import { MailService } from '@/modules/mail/mail.service';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { createBrevoTransport } from '@/modules/mail/brevo-transport';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: async (config: ConfigService) => ({
        transport: createBrevoTransport(
          config.get<string>('BREVO_API_KEY') ?? '',
          {
            email: config.get<string>('MAIL_FROM_EMAIL') ?? '',
            name: config.get<string>('MAIL_FROM_NAME') ?? 'Giang Kha Shop',
          },
        ),
        defaults: {
          from: `${config.get<string>('MAIL_FROM_NAME') ?? 'Giang Kha Shop'} <${
            config.get<string>('MAIL_FROM_EMAIL') ?? 'noreply@example.com'
          }>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
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
