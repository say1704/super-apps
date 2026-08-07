"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';

interface MonthData {
  period: string;
  count?: number;
  value?: number;
  status?: string;
  pass_count?: number;
  fail_count?: number;
  target_met?: boolean;
  checklist_result?: Record<string, string>;
}

interface ReportObjective {
  id: number;
  name: string;
  tracking_type: string;
  period: string;
  target_value: number | null;
  target_unit: string | null;
  months: MonthData[];
  summary: Record<string, any>;
}

interface ReportData {
  year: number;
  objectives: ReportObjective[];
}

const TYPE_LABELS: Record<string, string> = {
  counter: 'Counter', boolean: 'Pass/Fail', percentage: 'Percentage',
  multi_checklist: 'Checklist', score: 'Score',
};

const TYPE_COLORS: Record<string, string> = {
  counter: 'bg-blue-500', boolean: 'bg-green-500', percentage: 'bg-purple-500',
  multi_checklist: 'bg-yellow-500', score: 'bg-orange-500',
};

export default function QualityReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const fetchReport = async () => {
    try {
      const r = await apiRequest(`/api/quality-report/summary?year=${year}`);
      setReport(r);
    } catch { setReport(null); } finally { setLoading(false); }
  };

  useEffect(() => { fetchReport(); }, [year]);

  const allPeriods = report?.objectives.reduce((acc, obj) => {
    obj.months.forEach(m => { if (!acc.includes(m.period)) acc.push(m.period); });
    return acc;
  }, [] as string[]).sort() || [];

  const maxBarValue = (obj: ReportObjective): number => {
    if (obj.tracking_type === 'counter') {
      return Math.max(...obj.months.map(m => m.count || 0), 1);
    }
    if (obj.tracking_type === 'percentage' || obj.tracking_type === 'score') {
      return Math.max(...obj.months.map(m => m.value || 0), obj.target_value || 100, 1);
    }
    return 1;
  };

  const renderBar = (obj: ReportObjective, m: MonthData) => {
    const max = maxBarValue(obj);
    if (obj.tracking_type === 'counter') {
      const pct = ((m.count || 0) / max) * 100;
      return (
        <div className="flex flex-col items-center">
          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-t" style={{ height: '80px', position: 'relative' }}>
            <div className={`${TYPE_COLORS[obj.tracking_type]} rounded-t absolute bottom-0 w-full transition-all`}
              style={{ height: `${pct}%` }} />
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">{m.count || 0}</span>
        </div>
      );
    }
    if (obj.tracking_type === 'percentage' || obj.tracking_type === 'score') {
      const pct = ((m.value || 0) / max) * 100;
      const targetPct = obj.target_value ? ((obj.target_value / max) * 100) : 0;
      return (
        <div className="flex flex-col items-center">
          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-t" style={{ height: '80px', position: 'relative' }}>
            <div className={`${m.target_met ? 'bg-green-500' : 'bg-red-400'} rounded-t absolute bottom-0 w-full transition-all`}
              style={{ height: `${pct}%` }} />
            {targetPct > 0 && (
              <div className="absolute w-full border-t-2 border-dashed border-gray-500" style={{ bottom: `${targetPct}%` }} />
            )}
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">{m.value ?? '-'}</span>
        </div>
      );
    }
    if (obj.tracking_type === 'boolean') {
      const color = m.status === 'pass' ? 'bg-green-500' : m.status === 'fail' ? 'bg-red-500' : 'bg-gray-300';
      return (
        <div className="flex flex-col items-center">
          <div className={`w-full rounded-t ${color} transition-all`} style={{ height: '80px' }} />
          <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">{m.status === 'pass' ? 'Pass' : m.status === 'fail' ? 'Fail' : '-'}</span>
        </div>
      );
    }
    if (obj.tracking_type === 'multi_checklist') {
      const color = m.status === 'pass' ? 'bg-green-500' : m.status === 'fail' ? 'bg-red-500' : 'bg-gray-300';
      return (
        <div className="flex flex-col items-center">
          <div className={`w-full rounded-t ${color} transition-all`} style={{ height: '80px' }} />
          <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">{m.status === 'pass' ? 'Pass' : m.status === 'fail' ? 'Fail' : '-'}</span>
        </div>
      );
    }
    return <div className="w-full h-20 bg-gray-200 rounded-t" />;
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading report...</div>;
  }

  return (
    <div className="p-4 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quality Report</h1>
          <a href="/modules/quality" className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to Objectives</a>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white">
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y =>
            <option key={y} value={y}>{y}</option>
          )}
        </select>
      </div>

      {!report || report.objectives.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-8 text-center text-gray-500">
          No active objectives found for {year}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Objectives</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.objectives.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Counter Type</p>
              <p className="text-2xl font-bold text-blue-600">
                {report.objectives.filter(o => o.tracking_type === 'counter').length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Boolean Type</p>
              <p className="text-2xl font-bold text-green-600">
                {report.objectives.filter(o => o.tracking_type === 'boolean').length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Other Types</p>
              <p className="text-2xl font-bold text-purple-600">
                {report.objectives.filter(o => !['counter', 'boolean'].includes(o.tracking_type)).length}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {report.objectives.map(obj => (
              <div key={obj.id} className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
                <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{obj.name}</h3>
                    <div className="flex gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
                        {TYPE_LABELS[obj.tracking_type]}
                      </span>
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
                        {obj.period}
                      </span>
                      {obj.target_value != null && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded text-xs text-blue-700 dark:text-blue-300">
                          Target: {obj.target_value} {obj.target_unit || ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {obj.months.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No data for {year}</p>
                  ) : (
                    <>
                      <div className="flex items-end gap-2 mb-4 overflow-x-auto pb-2">
                        {obj.months.map((m, i) => (
                          <div key={i} className="flex flex-col items-center min-w-[40px]">
                            {renderBar(obj, m)}
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-nowrap">
                              {m.period}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t dark:border-gray-700">
                        {obj.tracking_type === 'counter' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                              <p className="text-lg font-bold text-gray-900 dark:text-white">{obj.summary.total || 0}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Avg/Month</p>
                              <p className="text-lg font-bold text-gray-900 dark:text-white">{obj.summary.avg || 0}</p>
                            </div>
                          </>
                        )}
                        {obj.tracking_type === 'boolean' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Pass</p>
                              <p className="text-lg font-bold text-green-600">{obj.summary.pass || 0}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Fail</p>
                              <p className="text-lg font-bold text-red-600">{obj.summary.fail || 0}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Pass Rate</p>
                              <p className="text-lg font-bold text-gray-900 dark:text-white">{obj.summary.pass_rate || 'N/A'}</p>
                            </div>
                          </>
                        )}
                        {(obj.tracking_type === 'percentage' || obj.tracking_type === 'score') && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Average</p>
                              <p className="text-lg font-bold text-gray-900 dark:text-white">{obj.summary.avg ?? '-'}</p>
                            </div>
                            {obj.target_value != null && (
                              <div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Target Met</p>
                                <p className="text-lg font-bold text-gray-900 dark:text-white">
                                  {obj.summary.target_met_count || 0} / {obj.summary.total_periods || 0}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                        {obj.tracking_type === 'multi_checklist' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Total Checks</p>
                              <p className="text-lg font-bold text-gray-900 dark:text-white">{obj.summary.total || 0}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Pass</p>
                              <p className="text-lg font-bold text-green-600">{obj.summary.pass || 0}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Fail</p>
                              <p className="text-lg font-bold text-red-600">{obj.summary.fail || 0}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
