// React & Next
import React from "react";

// Components
import HeroBanner from "@/components/home/hero-banner";
import CategoriesSection from "@/components/home/categories-section";
import ProductsSection from "@/components/home/products-section";

// Định nghĩa SEO Metadata cho Trang chủ (Next.js Server Component Metadata)
export const metadata = {
  title: "Trang chủ | Giang Kha Multi-Vendor",
  description: "Chào mừng bạn đến với Giang Kha - Sàn thương mại điện tử Multi-Vendor thế hệ mới. Mua sắm thông minh, giá cả tốt nhất, giao hàng siêu tốc và thanh toán bảo mật.",
};

export default function Home() {
  return (
    <div className="space-y-16 animate-fade-in pb-12">
      {/* 1. Hero Banner giới thiệu */}
      <HeroBanner />

      {/* 2. Danh mục nổi bật */}
      <CategoriesSection />

      {/* 3. Sản phẩm mới nhất */}
      <ProductsSection />
    </div>
  );
}
