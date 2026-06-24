'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Terminal } from 'lucide-react';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  const { reset: resetQueries } = useQueryErrorResetBoundary();

  useEffect(() => {
    console.error('Admin dashboard error:', error);
  }, [error]);

  const handleTryAgain = () => {
    resetQueries();
    reset();
  };

  return (
    <>
      <title>Lỗi hệ thống | Trang Quản Trị</title>
      <div className="min-h-[70vh] flex items-center justify-center p-6 selection:bg-violet-500 selection:text-white animate-fade-in">
        <div className="max-w-2xl w-full space-y-6 p-8 rounded-xl border bg-card text-card-foreground border-zinc-200 dark:border-zinc-800 shadow-sm relative">
          {/* Accent border */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-violet-600" />

          <div className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Hệ thống Quản trị gặp sự cố
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Trang quản trị (Admin panel) phát hiện lỗi runtime trong tiến
              trình xử lý giao diện. Lỗi này có thể do dữ liệu trả về từ API
              không khớp cấu trúc mong đợi.
            </p>
          </div>

          {/* Technical Diagnostic Details */}
          <div className="p-5 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 space-y-3.5">
            <div className="flex items-center space-x-2 border-b border-zinc-800 pb-2">
              <Terminal className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
                Diagnostic Logs
              </span>
            </div>
            <div className="space-y-2 font-mono text-xs">
              {error.digest && (
                <div className="flex items-start">
                  <span className="w-24 shrink-0 text-zinc-500 font-bold">
                    Digest:
                  </span>
                  <span className="break-all text-zinc-100 select-all">
                    {error.digest}
                  </span>
                </div>
              )}
              <div className="flex items-start">
                <span className="w-24 shrink-0 text-zinc-500 font-bold">
                  Message:
                </span>
                <span className="break-all text-rose-400">
                  {error.message || 'Unknown error'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleTryAgain}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold shadow-sm transition active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử lại (Reset Boundary)</span>
            </button>

            <Link href="/" className="flex-1">
              <button className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 border rounded-lg text-xs font-semibold hover:bg-muted transition active:scale-[0.98] cursor-pointer bg-background">
                <span>Về trang chủ</span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
