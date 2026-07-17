import type { Metadata } from 'next';
import { VerifyEmailForm } from '@/app/(auth)/verify-email/verify-email-form';

export const metadata: Metadata = {
  title: 'Xác thực email',
};

export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}
