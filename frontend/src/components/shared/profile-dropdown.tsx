'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { User, LogOut } from 'lucide-react';

interface ProfileMenuLink {
  href: string;
  label: string;
  icon: ReactNode;
}

interface ProfileDropdownProps {
  user?: {
    username?: string;
    role?: string;
    avatar_url?: string | null;
  } | null;
  usernameFallback: string;
  menuLinks?: ProfileMenuLink[];
  onLogout: () => void;
}

export function ProfileDropdown({
  user,
  usernameFallback,
  menuLinks = [],
  onLogout,
}: ProfileDropdownProps) {
  const [open, setOpen] = useState(false);

  const toggleOpen = () => {
    const nextState = !open;
    setOpen(nextState);
  };

  const closeDropdown = () => {
    const nextState = false;
    setOpen(nextState);
  };

  const handleLogoutClick = () => {
    const nextState = false;
    setOpen(nextState);
    onLogout();
  };

  const renderLink = (link: ProfileMenuLink) => {
    const linkHref = link.href;
    return (
      <Link
        key={linkHref}
        href={linkHref}
        onClick={closeDropdown}
        className="flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
      >
        {link.icon}
        <span>{link.label}</span>
      </Link>
    );
  };

  const avatarUrl = user?.avatar_url;
  const username = user?.username;
  const roleName = user?.role;
  const initialCharIndex = 0;
  const fallbackChar = username?.charAt(initialCharIndex);
  const uppercaseFallbackChar = fallbackChar?.toUpperCase();

  const userAvatarImage = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={username || ''}
      className="h-full w-full object-cover"
    />
  ) : (
    uppercaseFallbackChar || <User className="h-5 w-5" />
  );

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        className="flex items-center space-x-3 px-5 h-16 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 border-2 transition shadow-sm"
      >
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center font-black text-base text-white shadow-sm overflow-hidden">
          {userAvatarImage}
        </div>
        <span className="text-base font-bold hidden sm:inline-block pr-1.5">
          {username || usernameFallback}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={closeDropdown} />
          <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-zinc-950 border rounded-xl shadow-xl z-20 py-2 divide-y divide-zinc-100 dark:divide-zinc-900 animate-fade-in">
            <div className="px-4 py-2">
              <p className="text-xs font-medium text-muted-foreground">
                Tài khoản
              </p>
              <p className="text-sm font-bold truncate mt-0.5">{username}</p>
              {roleName && (
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-extrabold bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-full mt-1.5">
                  Role: {roleName}
                </span>
              )}
            </div>

            {menuLinks.length > 0 && (
              <div className="py-1">{menuLinks.map(renderLink)}</div>
            )}

            <div className="py-1">
              <button
                onClick={handleLogoutClick}
                className="w-full flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition"
              >
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
