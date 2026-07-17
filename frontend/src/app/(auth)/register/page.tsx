import type { Metadata } from 'next';
import { RegisterForm } from '@/app/(auth)/register/register-form';

export const metadata: Metadata = {
  title: 'Đăng ký',
};

export default function RegisterPage() {
  return <RegisterForm />;
}
