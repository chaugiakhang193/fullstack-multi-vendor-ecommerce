import type { Metadata } from 'next';
import { LoginForm } from '@/app/(auth)/login/login-form';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Đăng nhập',
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
