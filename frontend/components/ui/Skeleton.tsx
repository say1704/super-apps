"use client";

type SkeletonVariant = 'text' | 'card' | 'table-row' | 'table';

interface SkeletonProps {
  variant?: SkeletonVariant;
  rows?: number;
  columns?: number;
  count?: number;
  className?: string;
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-300 dark:bg-gray-600 ${className}`} />;
}

export function SkeletonText({ className = '' }: { className?: string }) {
  return <SkeletonBlock className={`h-4 w-full ${className}`} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700 ${className}`}>
      <div className="p-4 space-y-3">
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-3 w-1/2" />
        <SkeletonBlock className="h-3 w-5/6" />
      </div>
    </div>
  );
}

export function SkeletonTableRow({ columns = 6, className = '' }: { columns?: number; className?: string }) {
  return (
    <div className={`flex gap-4 px-4 py-3 ${className}`}>
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonBlock key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}

export default function Skeleton({
  variant = 'text',
  rows = 5,
  columns = 6,
  count = 3,
  className = '',
}: SkeletonProps) {
  if (variant === 'card') {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(count, 4)} gap-4 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={`space-y-0 ${className}`}>
        <div className="flex gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg">
          {Array.from({ length: columns }).map((_, i) => (
            <SkeletonBlock key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonText key={i} className={i === 0 ? 'w-3/4' : i === rows - 1 ? 'w-1/2' : 'w-full'} />
      ))}
    </div>
  );
}