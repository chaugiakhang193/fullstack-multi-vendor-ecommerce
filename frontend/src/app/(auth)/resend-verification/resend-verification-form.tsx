'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import authApiRequest from '@/apiRequests/auth/auth';
import { getErrorMessage } from '@/lib/http';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ResendVerificationBody,
  ResendVerificationBodyType,
} from '@/schemaValidations/auth/auth.schema';
import {
  TurnstileWidget,
  CAPTCHA_ENABLED,
  type TurnstileWidgetHandle,
} from '@/components/shared/turnstile-widget';

export function ResendVerificationForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const [hasSent, setHasSent] = useState<boolean>(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Nút chỉ khoá TRƯỚC lần verify đầu tiên. Sau đó luôn mở — token được refresh
  // ngầm cho mỗi lần submit nên không khoá lại theo token (khỏi nháy/kẹt disabled).
  const [captchaVerifiedOnce, setCaptchaVerifiedOnce] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const router = useRouter();

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [cooldown]);

  const form = useForm<ResendVerificationBodyType>({
    resolver: zodResolver(ResendVerificationBody),
    mode: 'onTouched',
    defaultValues: {
      email: '',
    },
  });

  const handleCaptchaVerify = React.useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaVerifiedOnce(true);
  }, []);

  // Token Turnstile hết hạn sau ~300s → hủy token cũ và lấy token mới ngầm; nút
  // vẫn mở nhờ captchaVerifiedOnce.
  const handleCaptchaExpire = React.useCallback(() => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  }, []);

  async function onSubmit(data: ResendVerificationBodyType) {
    if (CAPTCHA_ENABLED && !captchaToken) {
      toast.error('Vui lòng hoàn tất xác thực CAPTCHA.');
      return;
    }
    try {
      setIsLoading(true);
      const res = await authApiRequest.resendVerification(
        data,
        captchaToken ?? undefined,
      );
      toast.success('Thành công', {
        description:
          res.message ||
          'Một mã xác thực mới đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.',
      });
      setHasSent(true);
      setCooldown(60);
      router.push('/verify-email');
    } catch (error) {
      setCaptchaToken(null);
      // Token vừa bị BE tiêu thụ ở lần submit lỗi này (dùng một lần) → lấy token
      // mới ngầm. captchaVerifiedOnce vẫn true nên nút KHÔNG khoá lại.
      turnstileRef.current?.reset();
      const errMsg = getErrorMessage(error);
      const failTitle = 'Thất bại';
      toast.error(failTitle, {
        description: errMsg,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn('flex flex-col gap-4 w-full', className)} {...props}>
      <Card className="flex flex-col w-full max-h-full shadow-lg max-w-2xl justify-center mx-auto p-6 sm:p-10">
        <CardHeader className="text-center pb-6 sm:pb-8">
          <CardTitle className="text-2xl sm:text-3xl font-bold">
            Xác thực tài khoản
          </CardTitle>
          <CardDescription className="text-base sm:text-lg">
            Nhập email của bạn để nhận lại mã xác thực tài khoản.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="resend-verification-form"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FieldGroup className="gap-6">
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel
                      htmlFor="email"
                      className="text-base sm:text-lg font-medium"
                    >
                      Email
                    </FieldLabel>
                    <Input
                      {...field}
                      id="email"
                      className="h-12 px-4 text-base sm:text-lg md:text-lg placeholder:text-base sm:placeholder:text-lg md:placeholder:text-lg"
                      placeholder="Nhập địa chỉ email của bạn"
                      disabled={isLoading}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <TurnstileWidget
                ref={turnstileRef}
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
              />
              <div className="flex flex-col gap-3 pt-4">
                <Button
                  type="submit"
                  className="w-full h-12 text-base sm:text-lg font-semibold"
                  disabled={
                    isLoading ||
                    cooldown > 0 ||
                    (CAPTCHA_ENABLED && !captchaVerifiedOnce)
                  }
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang xử lý...
                    </>
                  ) : cooldown > 0 ? (
                    `Gửi lại mã xác thực (${cooldown}s)`
                  ) : hasSent ? (
                    'Gửi lại mã xác thực'
                  ) : (
                    'Gửi mã xác thực'
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 text-base sm:text-lg font-semibold"
                  disabled={isLoading}
                  onClick={() => router.push('/login')}
                >
                  Quay lại đăng nhập
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
