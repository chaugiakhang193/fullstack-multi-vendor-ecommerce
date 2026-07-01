import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import categoriesApiRequest from '@/apiRequests/products/categories';
import { CategoryCatalog } from './CategoryCatalog';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Phẳng hoá cây danh mục + tìm theo slug (hỗ trợ cả cấu trúc cây và danh sách phẳng).
async function resolveCategoryBySlug(slug: string) {
  try {
    const res = await categoriesApiRequest.getAll();
    const list = res.data ?? [];
    const flatten = (nodes: any[]): any[] =>
      nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
    const all = flatten(list);
    return all.find((c) => c.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await resolveCategoryBySlug(slug);
  if (!category) {
    return { title: 'Không tìm thấy danh mục | Giang Kha Multi-Vendor' };
  }
  const title = `${category.name} | Giang Kha Multi-Vendor`;
  const description = `Mua sắm ${category.name} chất lượng, giá tốt tại Giang Kha — đa dạng sản phẩm từ nhiều nhà bán uy tín.`;
  return {
    title,
    description,
    alternates: { canonical: `/categories/${slug}` },
    openGraph: { title: category.name, description },
  };
}

export async function generateStaticParams() {
  try {
    const res = await categoriesApiRequest.getAll();
    const list = res.data ?? [];
    const flatten = (nodes: any[]): any[] =>
      nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
    const all = flatten(list);
    return all.map((c: any) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = await resolveCategoryBySlug(slug);
  if (!category) notFound();

  return (
    <div className="space-y-6">
      {/* Breadcrumb SEO/UX */}
      <nav className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <a href="/" className="hover:text-violet-600 transition-colors">
          Trang chủ
        </a>
        <span>/</span>
        <span className="text-foreground">{category.name}</span>
      </nav>
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
        {category.name}
      </h1>
      <CategoryCatalog categoryId={category.id} />
    </div>
  );
}
