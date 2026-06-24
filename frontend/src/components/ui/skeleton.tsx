import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
