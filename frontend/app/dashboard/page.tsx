"use client";

import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/auth';

interface DashboardStats {
  total_users: number;
  users_by_subcategory: Record<string, number>;
  disabled_users: number;
  users_by_owner: { owner: string; count: number }[];
  users_by_classification: { classification: string; count: number }[];
}

interface SummaryStats {
  total_by_category: Record<string, number>;
  recent_password_views: number;
  failed_attempts: number;
  active_users: number;
  period: string;
}

interface RecentActivity {
  id: number;
  asset_code: string;
  asset_name: string;
  action_type: string;
  username: string;
  timestamp: string;
}

const SUB_CATEGORY_LABELS: Record<string, string> = {
  'team_member': '👥 Team Member',
  'ftp_user': '📁 FTP User',
  'samba_192': '🖥️ Samba 192',
  'samba_sequis': '🔐 Samba Sequis',
  'sig_member': '📋 SIG Member'
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const [statsData, summaryData, activityData] = await Promise.all([
          apiRequest('/assets/dashboard/stats'),
          apiRequest('/assets/dashboard/summary'),
          apiRequest('/assets/dashboard/recent-activity?limit=5')
        ]);

        setStats(statsData);
        setSummary(summaryData);
        setRecentActivity(activityData.recent_activity || []);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-slate-900 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          📊 Asset Management Dashboard
        </h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Users</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats?.total_users || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">👥 All sub-categories</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active Users</div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {summary?.active_users || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">✅ Status: Active</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Password Views (7d)</div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {summary?.recent_password_views || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">👁️ Last 7 days</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Failed Attempts (7d)</div>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {summary?.failed_attempts || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">❌ Last 7 days</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Users by Sub-Category */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              👥 Users by Sub-Category
            </h2>
            <div className="space-y-3">
              {Object.entries(stats?.users_by_subcategory || {}).map(([subCat, count]) => (
                <div key={subCat} className="flex justify-between items-center">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {SUB_CATEGORY_LABELS[subCat] || subCat}
                  </span>
                  <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Users by Classification */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              🔒 Users by Classification
            </h2>
            <div className="space-y-3">
              {stats?.users_by_classification.map(({ classification, count }) => (
                <div key={classification} className="flex justify-between items-center">
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {classification === 'confidential' ? '🔴 Confidential' :
                     classification === 'internal' ? '🟢 Internal' : '🟢 Public'}
                  </span>
                  <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              🔐 Recent Password Views
            </h2>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No recent password views
                </p>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-700 rounded">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {activity.asset_code}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {activity.asset_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {activity.username}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Users by Owner */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              👤 Users by Owner
            </h2>
            <div className="space-y-3">
              {(stats?.users_by_owner || []).slice(0, 5).map(({ owner, count }) => (
                <div key={owner} className="flex justify-between items-center">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {owner || 'Unassigned'}
                  </span>
                  <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            ⚡ Quick Actions
          </h2>
          <div className="flex gap-4">
            <a
              href="/modules/assets"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              📦 View All Assets
            </a>
            <a
              href="/modules/activity-logs"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              📋 Audit Logs
            </a>
            <a
              href="/modules/assets?category=users"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              👥 User Assets
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
