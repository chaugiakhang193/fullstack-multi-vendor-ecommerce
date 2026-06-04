"use client";

import React from "react";
import { AlertCircle, RefreshCw, Trash2 } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const emergencyReset = () => {
    // Chỉ xóa các key thực tế của dự án để tránh ảnh hưởng đến các ứng dụng khác trên localhost
    const keysToReset = ["cart", "recently-viewed", "auth-storage"];
    keysToReset.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.error("Lỗi khi xóa key:", key, e);
      }
    });
    // Load lại trang hoàn toàn để đưa app về trạng thái ban đầu
    window.location.href = "/";
  };

  return (
    <html lang="vi">
      <head>
        <title>Sự cố hệ thống nghiêm trọng | Sàn TMĐT</title>
      </head>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 selection:bg-violet-500 selection:text-white">
        <div className="max-w-md w-full space-y-8 p-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl relative overflow-hidden animate-fade-in">
          {/* Decorative background glow */}
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-violet-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-indigo-600/10 rounded-full blur-3xl" />

          <div className="text-center space-y-4 relative z-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <AlertCircle className="h-8 w-8 animate-pulse" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Đã xảy ra sự cố nghiêm trọng
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Ứng dụng gặp lỗi không thể tự khắc phục. Vui lòng chọn thử tải lại trang hoặc khôi phục cài đặt gốc để giải quyết sự cố.
            </p>
          </div>

          {/* Technical Info */}
          {error.digest && (
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1.5 relative z-10">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Mã định danh lỗi (Digest)</p>
              <code className="text-xs font-mono text-zinc-300 block break-all select-all">
                {error.digest}
              </code>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col gap-3.5 relative z-10">
            <button
              onClick={() => reset()}
              className="w-full flex items-center justify-center space-x-2 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-violet-500/10 active:scale-[0.98] transition"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử tải lại ứng dụng</span>
            </button>

            <button
              onClick={emergencyReset}
              className="w-full flex items-center justify-center space-x-2 py-3 border border-zinc-800 hover:border-rose-500/30 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 rounded-xl text-xs font-semibold active:scale-[0.98] transition"
            >
              <Trash2 className="h-4 w-4" />
              <span>Khôi phục cài đặt gốc & Về trang chủ</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
