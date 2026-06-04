"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, LifeBuoy, RefreshCw } from "lucide-react";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SellerError({ error, reset }: ErrorProps) {
  const { reset: resetQueries } = useQueryErrorResetBoundary();

  useEffect(() => {
    console.error("Seller dashboard error:", error);
  }, [error]);

  const handleTryAgain = () => {
    resetQueries();
    reset();
  };

  return (
    <>
      <title>Lỗi hệ thống | Kênh Người Bán</title>
      <div className="min-h-[70vh] flex items-center justify-center p-6 selection:bg-violet-500 selection:text-white animate-fade-in">
        <div className="max-w-md w-full space-y-6 p-8 rounded-xl border bg-card text-card-foreground border-zinc-200 dark:border-zinc-800 shadow-sm relative">
          {/* Brand/Accent Color top bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-violet-600" />

          <div className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Kênh Người Bán gặp sự cố
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Trang quản trị bán hàng của bạn tạm thời không thể hiển thị nội dung này do lỗi xử lý dữ liệu.
            </p>
          </div>

          {/* Technical Info (Digest) */}
          {error.digest && (
            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Mã chẩn đoán lỗi (Digest)</span>
              <code className="text-xs font-mono text-zinc-600 dark:text-zinc-400 block break-all select-all">
                {error.digest}
              </code>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleTryAgain}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold shadow-sm transition active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử lại</span>
            </button>

            <Link href="https://support.giangkha.com" target="_blank" className="flex-1">
              <button className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 border rounded-lg text-xs font-semibold hover:bg-muted transition active:scale-[0.98] cursor-pointer bg-background">
                <LifeBuoy className="h-4 w-4" />
                <span>Liên hệ hỗ trợ</span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
