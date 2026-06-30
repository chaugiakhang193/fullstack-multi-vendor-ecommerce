'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  /** class cho VÒNG TRÒN ngoài: kích thước + cỡ chữ initials, vd "h-10 w-10 text-base" */
  className?: string;
}

// Avatar an toàn: referrerPolicy no-referrer để ảnh Google (lh3.googleusercontent.com)
// không bị 429 khi hotlink; onError → rơi về chữ cái đầu thay vì icon ảnh vỡ.
export function UserAvatar({ src, name, className }: UserAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImg = !!src && !errored;
  const initial = name?.charAt(0)?.toUpperCase() || '?';

  return (
    <div
      className={cn(
        'rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center font-bold text-white overflow-hidden shrink-0',
        className,
      )}
    >
      {showImg ? (
        <img
          src={src as string}
          alt={name ?? ''}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
