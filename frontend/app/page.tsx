"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth, apiRequest } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { useThemeDetector } from '@/hooks/useTheme';
import { DASHBOARD_GRID_MODULES, QUICK_ACTIONS, STAT_CARDS, hasModuleAccess, hasAnyModuleAccess } from '@/lib/modules';

interface Stats {
  total_users: number;
  log_maintenance_count: number;
  irmc_checks_count: number;
  monthly_checks_count: number;
  vulnerability_reports_count: number;
  incident_reports_count: number;
  documents_count: number;
  assets_total: number;
  assets_hardware_count: number;
  assets_software_count: number;
  assets_vm_count: number;
  configuration_items_count: number;
  form_uploads_count: number;
  risk_assessments_count: number;
  quality_objectives_count: number;
  open_incidents: number;
  high_vulnerabilities: number;
  active_tasks: number;
}

interface TaskItem {
  id: number;
  title: string;
  description: string | null;
  status: string;
  assignee: string | null;
  priority: string;
  due_date: string | null;
  tags: string;
  created_at: string | null;
  completed_at: string | null;
}

interface EnhancedDashboard {
  today: { tasks: number; worklogs: number; hours: number };
  week: { worklogs: number; hours: number; by_category: { name: string; count: number }[] };
  tasks: { total: number; todo: number; doing: number; done: number; completion_rate: number };
  priority: { urgent: number; normal: number; low: number };
  overdue: number;
  overdue_tasks?: TaskItem[];
  recent_activity?: { date: string; count: number }[];
}

interface ActivityItem {
  id: string;
  module: string;
  icon: string;
  color: string;
  user: string;
  action: string;
  target: string;
  link: string;
  created_at: string | null;
}

interface TodayFocus {
  top_priorities: TaskItem[];
  due_today: TaskItem[];
  in_progress: TaskItem[];
}

interface InfrastructureStatus {
  last_backup_date: string | null;
  days_since_backup: number | null;
  total_servers: number;
  ok_count: number;
  warning_count: number;
  critical_count: number;
}

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [enhancedData, setEnhancedData] = useState<EnhancedDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const isDark = useThemeDetector();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [flashCards, setFlashCards] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [todayFocus, setTodayFocus] = useState<TodayFocus | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [infraStatus, setInfraStatus] = useState<InfrastructureStatus | null>(null);
  const [anomalySummary, setAnomalySummary] = useState<{ open_total: number; by_severity: Record<string, number> } | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const statsRef = useRef<Stats | null>(null);
  const enhancedRef = useRef<EnhancedDashboard | null>(null);

  const fetchDashboard = useCallback(async (flash = false) => {
    try {
      const [newStats, newEnhanced] = await Promise.all([
        apiRequest('/dashboard/stats'),
        apiRequest('/api/dashboard/enhanced'),
      ]);
      if (newStats) {
        if (flash && statsRef.current) {
          const changedKeys = Object.keys(newStats).filter(
            k => newStats[k] !== (statsRef.current as any)[k]
          );
          if (changedKeys.length > 0) {
            setFlashCards(new Set(changedKeys));
            setTimeout(() => setFlashCards(new Set()), 1000);
          }
        }
        statsRef.current = newStats;
        setStats(newStats);
      }
      if (newEnhanced) {
        if (flash && enhancedRef.current) {
          const prev = enhancedRef.current;
          const changedKeys = new Set<string>();
          if (newEnhanced.today?.tasks !== prev.today?.tasks) changedKeys.add('today_tasks');
          if (newEnhanced.today?.worklogs !== prev.today?.worklogs) changedKeys.add('today_worklogs');
          if (newEnhanced.today?.hours !== prev.today?.hours) changedKeys.add('today_hours');
          if (newEnhanced.week?.hours !== prev.week?.hours) changedKeys.add('week_hours');
          if (newEnhanced.tasks?.completion_rate !== prev.tasks?.completion_rate) changedKeys.add('completion_rate');
          if (newEnhanced.overdue !== prev.overdue) changedKeys.add('overdue');
          if (newEnhanced.priority?.urgent !== prev.priority?.urgent) changedKeys.add('urgent_tasks');
          if (changedKeys.size > 0) {
            setFlashCards(changedKeys);
            setTimeout(() => setFlashCards(new Set()), 1000);
          }
        }
        enhancedRef.current = newEnhanced;
        setEnhancedData(newEnhanced);
      }
      setLastUpdated(new Date());
    } catch (err) {
      // Silently ignore - backend may be restarting
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard(true);
    fetchEnhancements();
  }, [fetchDashboard]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await apiRequest('/api/notifications/unread-count');
      if (data) setUnreadCount(data.unread_count || 0);
    } catch {
      // Ignore
    }
  }, []);

  const fetchEnhancements = useCallback(async () => {
    try {
      const [focus, activity, infra, anomaly] = await Promise.all([
        apiRequest('/tasks/today-focus'),
        apiRequest('/api/dashboard/recent-activity'),
        apiRequest('/api/dashboard/infrastructure-status'),
        apiRequest('/api/anomaly/summary').catch(() => null),
      ]);
      if (focus) setTodayFocus(focus);
      if (activity) setActivityFeed(activity);
      if (infra) setInfraStatus(infra);
      if (anomaly) setAnomalySummary(anomaly);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    enhancedRef.current = enhancedData;
  }, [enhancedData]);

  useEffect(() => {
    // Wait for the auth bootstrap (/users/me) before deciding: only redirect once we
    // know there is truly no user. Redirecting while isLoading bounces authenticated
    // users to /login on a hard page load (race in AuthProvider).
    if (isLoading) return;
    if (!isLoading && !user) {
      router.push('/login');
      return;
    }
    fetchDashboard();
    fetchUnreadCount();
    fetchEnhancements();
    const interval = setInterval(() => {
      fetchDashboard();
      fetchUnreadCount();
      fetchEnhancements();
    }, 60000);
    return () => clearInterval(interval);
  }, [isLoading, user, router, fetchDashboard, fetchUnreadCount, fetchEnhancements]);

  const handleSSEEvent = useCallback((data: any) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchDashboard(true);
    }, 2000);
  }, [fetchDashboard]);

  const { isConnected, onlineUsers } = useRealtimeEvents({
    task_created: handleSSEEvent,
    task_updated: handleSSEEvent,
    worklog_created: handleSSEEvent,
    incident_created: handleSSEEvent,
  });

  // Update "last updated" text every 5 seconds
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const timeAgo = (date: Date | null) => {
    if (!date) return '';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 5) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  if (isLoading || !user || loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xl text-gray-900 dark:text-gray-100">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            IT Management Dashboard
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {isConnected && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Live
              </span>
            )}
            {lastUpdated && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Updated {timeAgo(lastUpdated)}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
              title="Refresh dashboard"
            >
              <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {onlineUsers.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                · {onlineUsers.length} online
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/modules/notifications" className="relative text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          <span className="text-gray-600 dark:text-gray-300">
            Welcome, {user?.full_name}
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      {QUICK_ACTIONS.filter((a) => hasModuleAccess(user, a.moduleKey)).length > 0 && (
        <div className="mb-6 p-3 rounded-lg bg-white dark:bg-gray-800 shadow">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quick Actions</div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.filter((a) => hasModuleAccess(user, a.moduleKey)).map((a) => (
              <Link key={a.href} href={a.href} className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors">{a.icon}</Link>
            ))}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.filter((c) => hasModuleAccess(user, c.moduleKey)).map((card) => {
          const valueMap: Record<string, number | undefined> = {
            'irmc_checks': stats?.irmc_checks_count,
            'log_maintenance': stats?.log_maintenance_count,
            'vulnerabilities': stats?.vulnerability_reports_count,
            'incidents': stats?.incident_reports_count,
            'documents_count': stats?.documents_count,
            'assets_hardware_count': stats?.assets_hardware_count,
            'active_tasks': stats?.active_tasks,
            'worklogs': enhancedData?.week.worklogs,
            'risk_items': stats?.risk_assessments_count,
          };
          return (
            <StatCard key={card.label} title={card.label} value={valueMap[card.statKey] || 0} color={card.color} isDark={isDark} flash={flashCards.has(card.statKey)} href={card.href} />
          );
        })}
      </div>

      {/* Asset Stats */}
      {stats && stats.assets_total > 0 && hasModuleAccess(user, 'assets') && (
        <div className="mb-8 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">📦 Asset Inventory</h2>
            <Link href="/modules/assets" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View All →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 rounded bg-gray-50 dark:bg-gray-700">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.assets_total}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
            </div>
            <div className="text-center p-3 rounded bg-blue-50 dark:bg-blue-900/20">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.assets_hardware_count}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Hardware</div>
            </div>
            <div className="text-center p-3 rounded bg-green-50 dark:bg-green-900/20">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.assets_software_count}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Software</div>
            </div>
            <div className="text-center p-3 rounded bg-purple-50 dark:bg-purple-900/20">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.assets_vm_count}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Virtual</div>
            </div>
            <div className="text-center p-3 rounded bg-orange-50 dark:bg-orange-900/20">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.configuration_items_count}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Config Items</div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Dashboard */}
      {enhancedData && hasAnyModuleAccess(user, ['tasks', 'worklog']) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
            📊 Today's Overview
          </h2>
          
          {/* Today Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
            <StatCard title="Today's Tasks" value={enhancedData.today.tasks} color="blue" isDark={isDark} flash={flashCards.has('today_tasks')} href="/modules/tasks" />
            <StatCard title="Today's Worklogs" value={enhancedData.today.worklogs} color="green" isDark={isDark} flash={flashCards.has('today_worklogs')} href="/modules/worklog" />
            <StatCard title="Hours Today" value={enhancedData.today.hours} color="purple" isDark={isDark} flash={flashCards.has('today_hours')} href="/modules/worklog" />
            <StatCard title="Week Hours" value={enhancedData.week.hours} color="indigo" isDark={isDark} flash={flashCards.has('week_hours')} href="/modules/worklog" />
            <StatCard title="Completion Rate" value={`${enhancedData.tasks.completion_rate}%`} color="green" isDark={isDark} flash={flashCards.has('completion_rate')} href="/modules/tasks" />
            <StatCard title="Overdue" value={enhancedData.overdue} color="red" isDark={isDark} flash={flashCards.has('overdue')} href="/modules/tasks" />
            <StatCard title="Urgent Tasks" value={enhancedData.priority.urgent} color="orange" isDark={isDark} flash={flashCards.has('urgent_tasks')} href="/modules/tasks" />
          </div>

          {/* Today's Focus */}
          {todayFocus && (todayFocus.top_priorities.length > 0 || todayFocus.due_today.length > 0 || todayFocus.in_progress.length > 0) && (
            <div className="p-4 rounded-lg shadow mb-6 bg-white dark:bg-gray-800">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-900 dark:text-white">🎯 Today's Focus</h3>
                <Link href="/modules/tasks" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View All →</Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {todayFocus.top_priorities.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">Top Priorities</div>
                    <div className="space-y-1.5">
                      {todayFocus.top_priorities.map((task) => (
                        <Link key={task.id} href={`/modules/tasks?id=${task.id}`} className="block p-2 rounded bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</div>
                          {task.assignee && <div className="text-xs text-gray-500 dark:text-gray-400">{task.assignee}</div>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {todayFocus.due_today.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide mb-2">Due Today</div>
                    <div className="space-y-1.5">
                      {todayFocus.due_today.map((task) => (
                        <Link key={task.id} href={`/modules/tasks?id=${task.id}`} className="block p-2 rounded bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</div>
                          {task.assignee && <div className="text-xs text-gray-500 dark:text-gray-400">{task.assignee}</div>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {todayFocus.in_progress.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">In Progress</div>
                    <div className="space-y-1.5">
                      {todayFocus.in_progress.slice(0, 3).map((task) => (
                        <Link key={task.id} href={`/modules/tasks?id=${task.id}`} className="block p-2 rounded bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</div>
                          {task.assignee && <div className="text-xs text-gray-500 dark:text-gray-400">{task.assignee}</div>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Task Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-lg shadow bg-white dark:bg-gray-800">
              <h3 className="font-bold mb-3 text-gray-900 dark:text-white">
                📋 Task Status
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-sm text-gray-600 dark:text-gray-400">To Do</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{enhancedData.tasks.todo}</div>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Doing</div>
                  <div className="text-2xl font-bold text-blue-500">{enhancedData.tasks.doing}</div>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Done</div>
                  <div className="text-2xl font-bold text-green-500">{enhancedData.tasks.done}</div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg shadow bg-white dark:bg-gray-800">
              <h3 className="font-bold mb-3 text-gray-900 dark:text-white">
                ⏱️ This Week by Category
              </h3>
              <div className="space-y-2">
                {enhancedData.week.by_category.slice(0, 5).map((cat, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{cat.name}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{cat.count}</span>
                  </div>
                ))}
                {enhancedData.week.by_category.length === 0 && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">No worklogs this week</div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="p-4 rounded-lg shadow mb-6 bg-white dark:bg-gray-800">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-900 dark:text-white">📋 Recent Activity</h3>
              <Link href="/modules/activity" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View All →</Link>
            </div>
            {activityFeed.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activityFeed.slice(0, 10).map((item) => (
                  <Link
                    key={item.id}
                    href={item.link}
                    className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <span className="text-lg mt-0.5">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">{item.user}</span>
                        <span className="text-gray-500 dark:text-gray-400"> {item.action} </span>
                        <span className="font-medium truncate inline-block max-w-[200px]">{item.target}</span>
                      </div>
                      {item.created_at && (
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-400 text-center py-8">No recent activity</div>
            )}
          </div>

          {/* Overdue Tasks */}
          {enhancedData.overdue > 0 && (
            <div className="p-4 rounded-lg shadow bg-red-50 dark:bg-red-900/20">
              <h3 className="font-bold mb-3 text-red-700 dark:text-red-400">
                ⚠️ Overdue Tasks ({enhancedData.overdue})
              </h3>
              <div className="space-y-2">
                {(enhancedData.overdue_tasks || []).slice(0, 5).map((task) => (
                  <Link
                    key={task.id}
                    href={`/modules/tasks?id=${task.id}`}
                    className="flex items-center justify-between p-2 rounded bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {task.title}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Due: {task.due_date ? new Date(task.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'}
                        {task.assignee ? ` · ${task.assignee}` : ''}
                      </div>
                    </div>
                    <span className={`ml-3 px-2 py-0.5 text-xs rounded-full font-medium ${
                      task.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                      task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                      'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                    }`}>
                      {task.priority}
                    </span>
                  </Link>
                ))}
                {enhancedData.overdue > 5 && (
                  <Link
                    href="/modules/tasks"
                    className="text-sm text-red-600 dark:text-red-400 hover:underline block text-center mt-2"
                  >
                    View all {enhancedData.overdue} overdue tasks →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Insights — anomaly summary */}
      {anomalySummary && anomalySummary.open_total > 0 && hasModuleAccess(user, 'anomaly-insights') && (
        <div className="mb-8 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">🤖 AI Insights — Anomali Terbuka ({anomalySummary.open_total})</h2>
            <Link href="/modules/anomaly-insights" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Lihat Semua →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
              <Link key={s} href="/modules/anomaly-insights" className={`p-3 rounded-lg text-center transition-colors ${
                s === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                s === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                s === 'medium' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                <div className="text-2xl font-bold">{anomalySummary.by_severity[s] || 0}</div>
                <div className="text-xs capitalize">{s}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Infrastructure Status */}
      {infraStatus && infraStatus.total_servers > 0 && hasModuleAccess(user, 'backup-check') && (
        <div className="mb-8 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">🖥️ Infrastructure Status</h2>
            <Link href="/modules/backup-analytics" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View Details →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded bg-gray-50 dark:bg-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Backup Status</div>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  infraStatus.days_since_backup === 0 ? 'bg-green-500' :
                  infraStatus.days_since_backup && infraStatus.days_since_backup <= 1 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}></div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {infraStatus.days_since_backup === 0 ? 'Last backup: Today' :
                     infraStatus.days_since_backup === 1 ? 'Last backup: Yesterday' :
                     infraStatus.days_since_backup ? `Last backup: ${infraStatus.days_since_backup} days ago` :
                     'No backup data'}
                  </div>
                  {infraStatus.last_backup_date && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(infraStatus.last_backup_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-3 rounded bg-gray-50 dark:bg-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Server Health</div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{infraStatus.ok_count}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">OK</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{infraStatus.warning_count}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Warning</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{infraStatus.critical_count}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Critical</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {DASHBOARD_GRID_MODULES
          .filter((m) => hasModuleAccess(user, m.key))
          .map((module) => {
            const countMap: Record<string, number | undefined> = {
              'log-deletion': stats?.log_maintenance_count,
              'log-compression': stats?.log_maintenance_count,
              'monthly-server-check': stats?.monthly_checks_count,
              'vulnerability': stats?.vulnerability_reports_count,
              'incident': stats?.incident_reports_count,
              'documentation': stats?.documents_count,
              'assets': stats?.assets_total,
              'risk': stats?.risk_assessments_count,
              'quality': stats?.quality_objectives_count,
              'forms': stats?.form_uploads_count,
              'worklog': enhancedData?.week.worklogs,
              'tasks': stats?.active_tasks,
              'irmc': stats?.irmc_checks_count,
            };
            const count = countMap[module.key];
            return (
              <Link
                key={module.href}
                href={module.href}
                className="relative p-4 rounded-lg shadow transition-shadow hover:shadow-lg hover:scale-105 bg-white dark:bg-gray-800"
              >
                {count !== undefined && count > 0 && (
                  <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
                <div className="text-3xl mb-2">{module.icon}</div>
                <div className="font-medium text-sm text-gray-900 dark:text-white">
                  {module.label}
                </div>
              </Link>
            );
          })}
      </div>
    </div>
  );
}

function StatCard({ title, value, color, isDark, flash, href }: { title: string; value: number | string; color: string; isDark: boolean; flash?: boolean; href?: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300',
    orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300',
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300',
    green: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300',
    purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300',
    teal: 'bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300',
    cyan: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-300',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300',
    amber: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300',
  };

  const selectedColor = colors[color] || colors.blue;

  const content = (
    <div className={`p-4 rounded-lg ${selectedColor} transition-all duration-300 ${flash ? 'scale-105 ring-2 ring-blue-400' : ''} ${href ? 'cursor-pointer hover:shadow-md' : ''}`}>
      <div className="text-sm opacity-80">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
