import React from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import productsApiRequest from "@/apiRequests/products/products";
import ProductDetailClient from "./ProductDetailClient";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Helper to extract UUID from the SEO slug (e.g. "ao-thun-premium-i.uuid")
const extractProductId = (slug: string): string => {
  const match = slug.match(
    /-i\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
  );
  return match ? match[1] : slug;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const rawSlug = resolvedParams.slug;
  const productId = extractProductId(rawSlug);

  try {
    const response = await productsApiRequest.getProductDetail(productId);
    const product = response.data;
    const titleVal = `${product.name} | Giang Kha Multi-Vendor`;
    const descriptionVal = product.description || `Mua ngay ${product.name} chất lượng cao, giá tốt tại Giang Kha Store.`;
    const imageUrl = product.thumbnail_url || "/placeholder-product.png";

    return {
      title: titleVal,
      description: descriptionVal,
      openGraph: {
        title: product.name,
        description: descriptionVal,
        images: [
          {
            url: imageUrl,
            alt: product.name,
          },
        ],
      },
    };
  } catch (err) {
    const fallbackTitle = "Không tìm thấy sản phẩm | Giang Kha Multi-Vendor";
    return {
      title: fallbackTitle,
    };
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const rawSlug = resolvedParams.slug;
  const productId = extractProductId(rawSlug);

  let product;
  try {
    const response = await productsApiRequest.getProductDetail(productId);
    product = response.data;
  } catch (err) {
    notFound();
  }

  if (!product) {
    notFound();
  }

  // Redirect SEO URL
  const canonicalSlug = `${product.slug}-i.${product.id}`;
  if (rawSlug !== canonicalSlug) {
    const redirectUrl = `/products/${canonicalSlug}`;
    redirect(redirectUrl);
  }

  return <ProductDetailClient params={params} />;
}
