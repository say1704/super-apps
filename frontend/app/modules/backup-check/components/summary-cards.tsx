"use client";

interface SummaryCardsProps {
  summary: {
    total_servers: number;
    ok_count: number;
    warning_count: number;
    critical_count: number;
    total_files: string;
    total_size: string;
  } | null;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  if (!summary) return null;

  const cards = [
    {
      title: 'Backed Up Today',
      value: summary.ok_count,
      icon: '✅',
      color: '#22c55e',
      bgColor: 'rgba(34, 197, 94, 0.1)'
    },
    {
      title: 'Last 7 Days',
      value: summary.warning_count,
      icon: '⚠️',
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.1)'
    },
    {
      title: 'Older than 7 Days',
      value: summary.critical_count,
      icon: '❌',
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.1)'
    },
    {
      title: 'Total Servers',
      value: summary.total_servers,
      icon: '🖥️',
      color: '#3b82f6',
      bgColor: 'rgba(59, 130, 246, 0.1)'
    },
    {
      title: 'Total Files',
      value: summary.total_files,
      icon: '📄',
      color: '#8b5cf6',
      bgColor: 'rgba(139, 92, 246, 0.1)'
    },
    {
      title: 'Total Size',
      value: summary.total_size,
      icon: '💾',
      color: '#06b6d4',
      bgColor: 'rgba(6, 182, 212, 0.1)'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className="p-4 rounded-lg shadow transition-transform hover:scale-105"
          style={{
            backgroundColor: card.bgColor,
            border: `1px solid ${card.color}30`
          }}
        >
          <div className="text-2xl mb-2">{card.icon}</div>
          <div
            className="text-2xl font-bold"
            style={{ color: card.color }}
          >
            {card.value}
          </div>
          <div className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            {card.title}
          </div>
        </div>
      ))}
    </div>
  );
}
