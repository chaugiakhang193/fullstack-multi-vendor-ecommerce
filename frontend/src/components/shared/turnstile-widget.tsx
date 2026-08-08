'use client';

import { useCallback, useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Bật khi CÓ sitekey. Chưa cấu hình (vd Vercel chưa set env) → form KHÔNG bắt buộc captcha,
// khớp fail-open bên BE; nếu không sẽ khoá nút submit vĩnh viễn vì token không bao giờ có.
export const CAPTCHA_ENABLED = !!SITEKEY;

// Widget Turnstile: nạp script một lần, render explicit để lấy token qua callback.
// onVerify/onExpire nên là hàm ổn định (setState setter hoặc useCallback) tránh render lại.
export function TurnstileWidget({
  onVerify,
  onExpire,
}: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITEKEY,
      callback: (token: string) => onVerify(token),
      'expired-callback': () => onExpire?.(),
      'error-callback': () => onExpire?.(),
    });
  }, [onVerify, onExpire]);

  useEffect(() => {
    if (!SITEKEY) {
      return;
    }
    if (window.turnstile) {
      renderWidget();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', renderWidget);
    } else {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', renderWidget);
      document.head.appendChild(script);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  if (!SITEKEY) {
    return null;
  }
  return <div ref={containerRef} className="my-2" />;
}
