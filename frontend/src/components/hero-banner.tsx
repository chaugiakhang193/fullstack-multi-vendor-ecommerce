"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Zap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HeroBanner() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 dark:from-zinc-900 dark:via-indigo-950 dark:to-zinc-950 text-white shadow-xl">
      {/* Background Decorative Circles */}
      <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-80 h-80 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

      {/* Main Content Container */}
      <div className="relative px-6 py-16 md:py-24 sm:px-12 max-w-6xl mx-auto text-center flex flex-col items-center justify-center gap-6 animate-fade-in z-10">
        
        {/* Special Tagline Badge */}
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 border border-white/20 text-sm font-extrabold tracking-wide uppercase select-none">
          <Sparkles className="h-4.5 w-4.5 text-amber-300 animate-pulse" />
          <span>Sàn Thương Mại Điện Tử Thế Hệ Mới</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black leading-tight tracking-tight drop-shadow-sm">
          Mua sắm thông minh, <br className="hidden sm:inline" />
          giá cả <span className="text-amber-300">tốt nhất</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-2xl text-indigo-100 max-w-3xl leading-relaxed font-medium">
          Khám phá hàng ngàn sản phẩm chính hãng chất lượng cao, ưu đãi độc quyền 
          từ các gian hàng uy tín trên toàn quốc.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
          <Link href="/products">
            <Button
              size="lg"
              className="font-bold text-lg h-16 px-12 rounded-full bg-white hover:bg-zinc-100 text-indigo-700 hover:text-indigo-800 shadow-lg shadow-black/15 transition-all duration-300"
            >
              <span>Khám phá ngay</span>
              <ArrowRight className="ml-1.5 h-5 w-5" />
            </Button>
          </Link>
          <Link href="/register-seller">
            <Button
              size="lg"
              variant="ghost"
              className="font-bold text-lg h-16 px-12 rounded-full border border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white transition-all duration-300"
            >
              Bán hàng cùng chúng tôi
            </Button>
          </Link>
        </div>

        {/* Service Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 mt-4 border-t border-white/10 w-full max-w-6xl">
          <div className="flex items-center justify-center sm:justify-start gap-3 text-indigo-100">
            <ShieldCheck className="h-7 w-7 shrink-0 text-amber-300" />
            <span className="text-base font-bold">100% Hàng Chính Hãng</span>
          </div>
          <div className="flex items-center justify-center gap-3 text-indigo-100">
            <Zap className="h-7 w-7 shrink-0 text-amber-300" />
            <span className="text-base font-bold">Giao Hàng Siêu Tốc 2H</span>
          </div>
          <div className="flex items-center justify-center sm:justify-end gap-3 text-indigo-100">
            <ShieldCheck className="h-7 w-7 shrink-0 text-amber-300" />
            <span className="text-base font-bold">Thanh Toán Bảo Mật</span>
          </div>
        </div>

      </div>
    </section>
  );
}
