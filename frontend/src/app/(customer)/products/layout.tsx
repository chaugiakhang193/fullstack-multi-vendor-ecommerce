import type { Metadata } from 'next';

// Trang /products là client (filter/search React Query) nên không tự set metadata được.
// Layout server co-located gắn title SSR (SEO). Trang con /products/[slug] có generateMetadata
// riêng ở cấp sâu hơn → tự override title này.
export const metadata: Metadata = {
  title: 'Sản phẩm',
};

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
