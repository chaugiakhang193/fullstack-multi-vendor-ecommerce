"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CustomerError({ error, reset }: ErrorProps) {
  const { reset: resetQueries } = useQueryErrorResetBoundary();

  useEffect(() => {
    // Log lỗi để hỗ trợ debug trong quá trình phát triển
    console.error("Customer route error:", error);
  }, [error]);

  const handleTryAgain = () => {
    // Đồng bộ reset cache React Query và reset component state của Next.js
    resetQueries();
    reset();
  };

  return (
    <>
      <title>Đã xảy ra sự cố | Giang Kha Multi-Vendor</title>
      <div className="min-h-[60vh] flex items-center justify-center p-4 selection:bg-violet-500 selection:text-white animate-fade-in">
        <div className="max-w-md w-full space-y-8 p-8 rounded-2xl border bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-xl relative overflow-hidden">
          {/* Subtle gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 to-indigo-500" />
          
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/50">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Đã xảy ra sự cố hệ thống
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Trang web gặp sự cố khi tải dữ liệu. Đừng lo lắng, chúng tôi đã ghi nhận lỗi này và đang tiến hành khắc phục.
            </p>
          </div>

          {/* Digest for debugging */}
          {error.digest && (
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border dark:border-zinc-800/80 space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mã sự cố</p>
              <code className="text-xs font-mono text-zinc-600 dark:text-zinc-400 block break-all select-all">
                {error.digest}
              </code>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleTryAgain}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold shadow-md shadow-violet-500/10 active:scale-[0.98] transition cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử tải lại</span>
            </button>

            <Link href="/" className="flex-1">
              <button className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 border rounded-lg text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 active:scale-[0.98] transition cursor-pointer">
                <Home className="h-4 w-4" />
                <span>Về trang chủ</span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
