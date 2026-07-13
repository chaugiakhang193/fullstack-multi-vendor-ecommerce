// Transport nodemailer tuỳ biến: giữ pipeline render template hbs của
// @nestjs-modules/mailer (bước 'compile' đổ context vào mail.data.html), rồi
// POST sang Brevo transactional email API (443) thay SMTP — Render chặn SMTP.
interface BrevoSender {
  email: string;
  name?: string;
}

export function createBrevoTransport(apiKey: string, sender: BrevoSender) {
  return {
    name: 'brevo',
    version: '1.0.0',
    send(
      mail: { data: Record<string, any> },
      callback: (err: Error | null, info?: unknown) => void,
    ): void {
      const { to, subject, html, text } = mail.data;
      const rawList = Array.isArray(to) ? to : [to];
      const toList = rawList.map((addr: any) => ({
        email: typeof addr === 'string' ? addr : addr.address,
      }));
      const body: Record<string, unknown> = {
        sender,
        to: toList,
        subject: subject ?? '',
      };
      if (html) body.htmlContent = html;
      if (text) body.textContent = text;
      fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          if (!res.ok) {
            const errText = await res.text().catch(() => res.statusText);
            callback(new Error(`Brevo ${res.status}: ${errText}`));
            return;
          }
          const data = (await res.json().catch(() => ({}))) as {
            messageId?: string;
          };
          callback(null, { messageId: data?.messageId });
        })
        .catch((err) =>
          callback(err instanceof Error ? err : new Error(String(err))),
        );
    },
  };
}
