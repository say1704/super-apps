"use client";

import { apiRequest } from "@/lib/auth";


import { useEffect, useState } from 'react';

interface HistoryEntry {
  id: number;
  config_id: number | null;
  parameter: string;
  old_value: string;
  new_value: string;
  change_reason: string;
  changed_by: string;
  changed_at: string;
}

const COLORS = {
  created:    { border: 'border-l-green-500', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: 'NEW', label: 'Created' },
  updated:    { border: 'border-l-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: 'UPD', label: 'Updated' },
  deleted:    { border: 'border-l-red-500', bg: 'bg-red-50 dark:bg-red-900/20', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: 'DEL', label: 'Deleted' },
};

function getOperationType(entry: HistoryEntry): 'created' | 'updated' | 'deleted' {
  const r = entry.change_reason.toLowerCase();
  if (r.includes('created')) return 'created';
  if (r.includes('deleted')) return 'deleted';
  return 'updated';
}

function groupByDate(entries: HistoryEntry[]): Record<string, HistoryEntry[]> {
  const groups: Record<string, HistoryEntry[]> = {};
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  entries.forEach((e) => {
    const d = new Date(e.changed_at);
    const dateStr = d.toISOString().split('T')[0];
    let label: string;
    if (dateStr === todayStr) label = 'Today';
    else if (dateStr === yesterdayStr) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(e);
  });
  return groups;
}

export default function ConfigHistory({ assetId }: { assetId: number }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'created' | 'updated' | 'deleted'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiRequest(`/api/configurations/assets/${assetId}/history`)
      .then((d: any) => { setHistory(d.history || []); })
      .catch((err: any) => { setError(err.message || 'Failed to load history'); })
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return <div className="p-4 text-gray-500 dark:text-gray-400 animate-pulse">Loading change history...</div>;

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
        <button onClick={() => { setLoading(true); setError(null); apiRequest(`/api/configurations/assets/${assetId}/history`).then((d: any) => { setHistory(d.history || []); }).catch(() => {}).finally(() => setLoading(false)); }} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  if (history.length === 0) {
    return <div className="p-6 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg">No change history recorded yet.</div>;
  }

  const filtered = filter === 'all' ? history : history.filter(e => getOperationType(e) === filter);
  const groups = groupByDate(filtered);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Change History</h3>
        <div className="flex items-center gap-1.5 text-xs">
          {(['all', 'created', 'updated', 'deleted'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-2 py-1 rounded-md border transition-all ${
                filter === type
                  ? `${COLORS[type === 'all' ? 'created' : type]?.badge} border-current font-medium`
                  : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {type === 'all' ? 'All' : COLORS[type]?.icon} {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* Timeline vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />

        <div className="space-y-6">
          {Object.entries(groups).map(([dateLabel, entries]) => (
            <div key={dateLabel}>
              <div className="relative flex items-center mb-3">
                <div className="absolute left-4 w-2 h-2 -translate-x-1/2 rounded-full bg-gray-400 dark:bg-gray-600" />
                <div className="ml-7 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{dateLabel}</div>
              </div>

              <div className="ml-7 space-y-2">
                {entries.map(entry => {
                  const op = getOperationType(entry);
                  const c = COLORS[op];
                  const isExpanded = expandedId === entry.id;
                  const shouldTruncate = entry.new_value.length > 80 && !isExpanded;

                  return (
                    <div
                      key={entry.id}
                      className={`relative border-l-4 ${c.border} ${c.bg} rounded-r-lg p-3 transition-all hover:shadow-md`}
                    >
                      {/* Timeline dot */}
                      <div className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full ${
                        op === 'created' ? 'bg-green-500' : op === 'deleted' ? 'bg-red-500' : 'bg-blue-500'
                      }`} />

                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${c.badge}`}>
                            {c.icon} {c.label}
                          </span>
                          <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-200">
                            {entry.parameter || 'N/A'}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {new Date(entry.changed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          {' '}<span className="inline-block w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-1 align-middle" />
                          {' '}<span className="text-gray-500 dark:text-gray-400 font-medium text-[11px]">{entry.changed_by || 'Unknown'}</span>
                        </span>
                      </div>

                      {(entry.old_value || entry.new_value !== 'N/A') && (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          {op !== 'created' && (
                            <div>
                              <div className="text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide mb-1">Previous</div>
                              <div
                                className={`font-mono text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-gray-900/40 p-2 rounded border border-red-200 dark:border-red-800/50 ${shouldTruncate ? 'line-clamp-2' : 'break-all'}`}
                                title={entry.old_value}
                              >
                                {entry.old_value || '—'}
                              </div>
                            </div>
                          )}
                          {op !== 'deleted' && (
                            <div>
                              <div className="text-[10px] font-semibold text-green-500 dark:text-green-400 uppercase tracking-wide mb-1">New</div>
                              <div
                                className={`font-mono text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-gray-900/40 p-2 rounded border border-green-200 dark:border-green-800/50 ${shouldTruncate ? 'line-clamp-2' : 'break-all'}`}
                                title={entry.new_value}
                              >
                                {entry.new_value || '—'}
                              </div>
                            </div>
                          )}
                          {op === 'deleted' && (
                            <div className="col-span-2">
                              <div className="text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide mb-1">Last Value</div>
                              <div
                                className={`font-mono text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-gray-900/40 p-2 rounded border border-red-200 dark:border-red-800/50 ${shouldTruncate ? 'line-clamp-2' : 'break-all'}`}
                                title={entry.old_value}
                              >
                                {entry.old_value}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {entry.change_reason && !['Configuration created', 'Configuration deleted'].includes(entry.change_reason) && (
                        <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 italic">
                          Reason: {entry.change_reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
