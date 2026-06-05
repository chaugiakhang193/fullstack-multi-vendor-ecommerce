import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import shopsApiRequest from "@/apiRequests/shops/shops";
import ShopDetailClient from "./ShopDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    sort?: string;
    order?: string;
    q?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const shopId = resolvedParams.id;

  try {
    const response = await shopsApiRequest.getPublicShopDetail(shopId);
    const shop = response.data;
    const titleVal = `${shop.name} | Gian Hàng Giang Kha`;
    const descriptionVal = shop.description || `Khám phá các sản phẩm nổi bật của cửa hàng ${shop.name} tại Giang Kha Multi-Vendor.`;
    const imageUrl = shop.logo_url || "/placeholder-logo.png";

    return {
      title: titleVal,
      description: descriptionVal,
      openGraph: {
        title: shop.name,
        description: descriptionVal,
        images: [
          {
            url: imageUrl,
            alt: shop.name,
          },
        ],
      },
    };
  } catch (err) {
    const fallbackTitle = "Không tìm thấy cửa hàng | Giang Kha Multi-Vendor";
    return {
      title: fallbackTitle,
    };
  }
}

export default async function ShopDetailPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const shopId = resolvedParams.id;

  let shop;
  try {
    const response = await shopsApiRequest.getPublicShopDetail(shopId);
    shop = response.data;
  } catch (err) {
    notFound();
  }

  if (!shop) {
    notFound();
  }

  return <ShopDetailClient params={params} searchParams={searchParams} />;
}
