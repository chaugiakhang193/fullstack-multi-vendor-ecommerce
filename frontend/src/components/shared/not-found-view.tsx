'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Home, Search } from 'lucide-react';

// Giao diện 404 dùng chung cho root (URL không khớp route nào) lẫn nhóm (customer).
// fullScreen=true → căn giữa TOÀN màn hình (root, không có header/footer bao quanh);
// false → chiếm ~70vh (nằm giữa header/footer của nhóm customer).
export default function NotFoundView({
  fullScreen = false,
}: {
  fullScreen?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const query = searchQuery.trim();
      const encodedQuery = encodeURIComponent(query);
      router.push(`/products?q=${encodedQuery}`);
    }
  };

  const handleBack = () => {
    // Có trang trước trong cùng phiên duyệt (đi từ trang khác trong app) → quay lại.
    // Vào thẳng 404 (bấm link sai từ Zalo / gõ URL → history chỉ 1 entry) → về trang chủ,
    // tránh router.back() làm văng người dùng RA KHỎI web (về Zalo/tab ngoài).
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <>
      <title>Không tìm thấy trang — Giang Kha</title>
      <div
        className={`${
          fullScreen ? 'min-h-screen' : 'min-h-[70vh]'
        } flex items-center justify-center p-4 selection:bg-violet-500 selection:text-white animate-fade-in`}
      >
        <div className="max-w-2xl w-full text-center space-y-8 p-8 sm:p-12 rounded-3xl border bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-xl relative overflow-hidden">
          {/* Subtle gradient background decoration */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 to-indigo-500" />

          {/* Ambient glows inside the card */}
          <div className="absolute -top-24 -left-20 w-72 h-72 rounded-full bg-violet-500/10 dark:bg-violet-500/5 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-20 w-72 h-72 rounded-full bg-indigo-500/10 dark:bg-indigo-500/5 blur-3xl pointer-events-none" />

          {/* Large illustrated 404 */}
          <div className="space-y-3 relative z-10">
            <h1 className="text-8xl md:text-9xl font-black tracking-tighter bg-gradient-to-b from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent select-none">
              404
            </h1>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-foreground md:whitespace-nowrap">
              Không tìm thấy trang yêu cầu
            </h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
              Trang bạn đang tìm kiếm không tồn tại hoặc đã bị gỡ bỏ, hoặc đường
              dẫn URL đã thay đổi. Vui lòng kiểm tra lại địa chỉ hoặc tìm sản
              phẩm khác dưới đây.
            </p>
          </div>

          {/* Quick Product Search Input */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative w-full max-w-md mx-auto z-10"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm kiếm sản phẩm khác..."
              className="w-full h-12 pl-11 pr-20 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 h-9 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-bold transition active:scale-[0.97]"
            >
              Tìm kiếm
            </button>
          </form>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2 relative z-10">
            <button
              onClick={handleBack}
              className="flex-1 flex items-center justify-center space-x-2 py-3 px-6 border rounded-xl text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-900 active:scale-[0.98] transition cursor-pointer bg-background"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Quay lại</span>
            </button>

            <Link href="/" className="flex-1">
              <button className="w-full flex items-center justify-center space-x-2 py-3 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-violet-500/10 active:scale-[0.98] transition cursor-pointer">
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
