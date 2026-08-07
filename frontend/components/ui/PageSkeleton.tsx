"use client";

import Skeleton, { SkeletonText } from './Skeleton';

interface PageSkeletonProps {
  header?: boolean;
  filters?: boolean;
  table?: { columns?: number; rows?: number } | false;
  cards?: number;
  className?: string;
}

export default function PageSkeleton({
  header = true,
  filters = false,
  table = { columns: 6, rows: 8 },
  cards = 0,
  className = '',
}: PageSkeletonProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {header && (
        <div className="flex items-center justify-between">
          <SkeletonText className="h-6 w-48" />
          <div className="flex gap-2">
            <SkeletonText className="h-9 w-20" />
            <SkeletonText className="h-9 w-20" />
          </div>
        </div>
      )}

      {filters && (
        <div className="flex gap-3">
          <SkeletonText className="h-10 w-48" />
          <SkeletonText className="h-10 w-36" />
          <SkeletonText className="h-10 w-36" />
        </div>
      )}

      {cards > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700 h-24" />
          ))}
        </div>
      )}

      {table && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700">
            {Array.from({ length: table.columns || 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded h-4 flex-1 bg-gray-300 dark:bg-gray-600" />
            ))}
          </div>
          {Array.from({ length: table.rows || 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
              {Array.from({ length: table.columns || 6 }).map((_, j) => (
                <div key={j} className="animate-pulse rounded h-3 flex-1 bg-gray-200 dark:bg-gray-700" />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}