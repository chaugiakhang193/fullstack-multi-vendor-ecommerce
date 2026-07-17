'use client';

import { useEffect } from 'react';

const BRAND = 'Giang Kha';

/**
 * Set document.title cho client page (dashboard sau login) — nơi metadata SSR của Next
 * không dùng được. Ghép theo cùng template với root layout: "<title> — Giang Kha".
 * Truyền rỗng/undefined → chỉ hiện brand. SEO không cần (các trang này login-gated).
 */
export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} — ${BRAND}` : BRAND;
  }, [title]);
}
