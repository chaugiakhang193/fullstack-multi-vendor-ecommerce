"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, Search, ShoppingBag } from "lucide-react";

export default function CustomerNotFound() {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const query = searchQuery.trim();
      const encodedQuery = encodeURIComponent(query);
      router.push(`/products?q=${encodedQuery}`);
    }
  };

  return (
    <>
      <title>Không tìm thấy trang | Giang Kha Multi-Vendor</title>
      <div className="min-h-[65vh] flex items-center justify-center p-4 selection:bg-violet-500 selection:text-white animate-fade-in">
        <div className="max-w-md w-full text-center space-y-8 p-8 rounded-2xl border bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-xl relative overflow-hidden">
          {/* Subtle gradient background decoration */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 to-indigo-500" />

          {/* Large illustrated 404 */}
          <div className="space-y-3">
            <h1 className="text-8xl font-black tracking-widest text-zinc-200 dark:text-zinc-800 select-none animate-pulse">
              404
            </h1>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Không tìm thấy trang yêu cầu
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Trang bạn đang tìm kiếm không tồn tại hoặc đã bị gỡ bỏ, hoặc đường dẫn URL đã thay đổi.
            </p>
          </div>

          {/* Quick Product Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative w-full max-w-sm mx-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm kiếm sản phẩm khác..."
              className="w-full h-11 pl-10 pr-4 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 h-8 px-3 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-[10px] font-bold hover:bg-zinc-800 transition"
            >
              Tìm
            </button>
          </form>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => router.back()}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-4 border rounded-lg text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 active:scale-[0.98] transition cursor-pointer bg-background"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Quay lại</span>
            </button>

            <Link href="/" className="flex-1">
              <button className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold shadow-md shadow-violet-500/10 active:scale-[0.98] transition cursor-pointer">
                <Home className="h-4 w-4" />
                <span>Trang chủ</span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
