'use client';

import React, { ErrorInfo } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class LocalErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[LocalErrorBoundary] Error caught in component ${
        this.props.componentName || 'Unknown'
      }:`,
      error,
      errorInfo,
    );
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      // Default minimal fallback error UI for widgets
      return (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5 shadow-sm">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Khối nội dung bị lỗi</p>
            <p className="opacity-90 leading-relaxed">
              Không thể tải phần này của trang. Vui lòng thử tải lại trang hoặc
              liên hệ bộ phận kỹ thuật nếu lỗi tiếp tục diễn ra.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
