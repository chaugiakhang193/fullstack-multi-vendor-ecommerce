import type { Metadata } from 'next';
import { ResendVerificationForm } from '@/app/(auth)/resend-verification/resend-verification-form';

export const metadata: Metadata = {
  title: 'Gửi lại email xác thực',
};

export default function ResendVerificationPage() {
  return <ResendVerificationForm />;
}
