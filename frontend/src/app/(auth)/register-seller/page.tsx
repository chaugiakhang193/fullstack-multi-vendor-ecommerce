import type { Metadata } from 'next';
import { RegisterSellerForm } from '@/app/(auth)/register-seller/register-seller-form';

export const metadata: Metadata = {
  title: 'Đăng ký bán hàng',
};

export default function RegisterSellerPage() {
  return <RegisterSellerForm />;
}
