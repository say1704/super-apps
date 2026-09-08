"use client";

interface SummaryCardProps {
  title: string;
  value: string | number;
  color: string;
  icon?: string;
  subtitle?: string;
  // Perbandingan vs periode sebelumnya. `deltaGood` menentukan arah warna:
  // untuk backup rate naik = baik (hijau); untuk insiden/vuln naik = buruk (merah).
  delta?: number;
  deltaGood?: 'up' | 'down';
}

const colorClasses: Record<string, string> = {
  blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
  orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
  amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  teal: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400',
  gray: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
};

export default function SummaryCard({ title, value, color, icon, subtitle, delta, deltaGood = 'up' }: SummaryCardProps) {
  const hasDelta = typeof delta === 'number' && delta !== 0;
  const goodDirection = delta! > 0 ? 'up' : 'down';
  const isGood = goodDirection === deltaGood;
  const deltaCls = isGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const arrow = delta! > 0 ? '▲' : '▼';

  return (
    <div className={`p-4 rounded-lg ${colorClasses[color] || colorClasses.gray}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {hasDelta && (
        <div className={`text-xs mt-1 font-medium ${deltaCls}`}>
          {arrow} {Math.abs(delta!)} vs sebelumnya
        </div>
      )}
      {subtitle && <div className="text-xs mt-1 opacity-75">{subtitle}</div>}
    </div>
  );
}
