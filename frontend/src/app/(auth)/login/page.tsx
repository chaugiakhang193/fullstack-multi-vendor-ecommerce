import { LoginForm } from '@/app/(auth)/login/login-form';
import { Suspense } from 'react';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
