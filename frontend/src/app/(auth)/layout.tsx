// app/(auth)/layout.tsx

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="w-full min-h-dvh flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6"
      suppressHydrationWarning={true}
    >
      {children}
    </div>
  );
}
