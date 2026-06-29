'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { tabId } from '@/lib/utils';
import { BROADCAST_CHANNELS, BROADCAST_EVENTS } from '@/constants/broadcast';
import { UserRole } from '@/constants/enum';

export default function GoogleCallbackPage() {
  const router = useRouter();
  const silentRefresh = useAuthStore((s) => s.silentRefresh);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // chống chạy 2 lần (StrictMode)
    ran.current = true;

    (async () => {
      // Refresh cookie đã được BE set ở callback → đổi lấy access token vào store.
      const ok = await silentRefresh(router);
      if (!ok) {
        router.replace('/login?error=oauth');
        return;
      }

      // Báo các tab khác đã đăng nhập.
      const channel = new BroadcastChannel(BROADCAST_CHANNELS.AUTH);
      channel.postMessage({
        type: BROADCAST_EVENTS.AUTH_LOGIN_SUCCESS,
        senderTabId: tabId,
      });
      channel.close();

      // Redirect theo role (đọc user mới nhất vừa setAuth).
      const user = useAuthStore.getState().user;
      const dest =
        user?.role === UserRole.ADMIN
          ? '/admin'
          : user?.role === UserRole.SELLER
            ? '/seller'
            : '/';
      router.replace(dest);
    })();
  }, [router, silentRefresh]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-base text-muted-foreground">
        Đang hoàn tất đăng nhập Google...
      </p>
    </div>
  );
}
