import type { Metadata } from 'next';
import { Geist, Geist_Mono, Inter } from 'next/font/google';
import '@/app/globals.css';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import AppProvider from '@/app/app-provider';
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://fullstack-multi-vendor-ecommerce.vercel.app';

export const metadata: Metadata = {
  // Chuẩn hoá URL gốc để mọi OG image / link tương đối resolve thành tuyệt đối.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Giang Kha',
    template: '%s — Giang Kha',
  },
  description:
    'Giang Kha — Sàn thương mại điện tử Multi-Vendor: mua sắm đa dạng từ nhiều nhà bán uy tín, giao hàng nhanh, thanh toán an toàn.',
  // Ảnh OG TĨNH (/og-image.png, 1200×630 trong public/) — đuôi .png + không query
  // → Zalo/crawler VN fetch ăn chắc. Route động next/og trước đó bị Zalo "chớp rồi mất ảnh".
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName: 'Giang Kha',
    title: 'Giang Kha — Sàn thương mại điện tử Multi-Vendor',
    description:
      'Mua sắm thông minh, giá cả tốt nhất — hàng chính hãng từ nhiều gian hàng uy tín, giao hàng nhanh, thanh toán an toàn.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Giang Kha — Sàn thương mại điện tử Multi-Vendor',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Giang Kha — Sàn thương mại điện tử Multi-Vendor',
    description:
      'Mua sắm thông minh, giá cả tốt nhất — hàng chính hãng từ nhiều gian hàng uy tín.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning={true}
      className={cn('font-sans', inter.variable)}
    >
      <body
        suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProvider>{children}</AppProvider>
        <Toaster />
      </body>
    </html>
  );
}
