"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/auth';
import { useToast } from '@/components/toast';

interface ModuleStats {
  total: number;
  thisMonth: number;
}

interface ActivityLog {
  id: number;
  module: string;
  action: string;
  description: string;
  created_at: string;
}

export default function LogManagementDashboard() {
  const router = useRouter();
  const toast = useToast();

  const [deletionStats, setDeletionStats] = useState<ModuleStats>({ total: 0, thisMonth: 0 });
  const [compressionStats, setCompressionStats] = useState<ModuleStats>({ total: 0, thisMonth: 0 });
  const [recentActivities, setRecentActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch deletion stats
      const deletions = await apiRequest('/api/log-maintenance');
      const now = new Date();
      const thisMonth = deletions.filter((d: any) => {
        const dDate = new Date(d.execution_date);
        return dDate.getMonth() === now.getMonth() && dDate.getFullYear() === now.getFullYear();
      }).length;

      setDeletionStats({ total: deletions.length, thisMonth });

      // Fetch compression stats (will be 0 initially)
      try {
        const compressions = await apiRequest('/api/log-compression');
        const compThisMonth = compressions.filter((c: any) => {
          const cDate = new Date(c.execution_date);
          return cDate.getMonth() === now.getMonth() && cDate.getFullYear() === now.getFullYear();
        }).length;
        setCompressionStats({ total: compressions.length, thisMonth: compThisMonth });
      } catch (e) {
        // Compression module might not exist yet
        setCompressionStats({ total: 0, thisMonth: 0 });
      }

      // Fetch recent activities
      try {
        const activities = await apiRequest('/api/activity-logs');
        const logActivities = activities
          .filter((a: any) => a.module.includes('Log'))
          .slice(0, 5);
        setRecentActivities(logActivities);
      } catch (e) {
        setRecentActivities([]);
      }
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const ModuleCard = ({ title, icon, stats, color, path }: { 
    title: string; 
    icon: string; 
    stats: ModuleStats; 
    color: string;
    path: string;
  }) => (
    <div
      className="p-6 rounded-lg shadow-lg cursor-pointer hover:shadow-xl transition-shadow bg-white dark:bg-gray-800"
      onClick={() => router.push(path)}
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{icon}</span>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Total Records:</span>
          <span className="font-bold" style={{ color }}>{stats.total}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">This Month:</span>
          <span className="font-bold" style={{ color }}>{stats.thisMonth}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          className="w-full py-2 rounded-lg font-medium text-white"
          style={{ backgroundColor: color }}
          onClick={(e) => {
            e.stopPropagation();
            router.push(path);
          }}
        >
          Go to Module →
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Log Management
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Centralized log operations management - Deletion & Compression
        </p>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <ModuleCard
          title="Log Deletion"
          icon=""
          stats={deletionStats}
          color="rgb(239, 68, 68)"
          path="/modules/log-deletion"
        />
        <ModuleCard
          title="Log Compression"
          icon=""
          stats={compressionStats}
          color="rgb(124, 58, 237)"
          path="/modules/log-compression"
        />
      </div>

      {/* Recent Activities */}
      <div
        className="p-6 rounded-lg shadow bg-white dark:bg-gray-800"
      >
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          Recent Activity
        </h2>
        
        {recentActivities.length > 0 ? (
          <div className="space-y-3">
            {recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="p-3 rounded border-l-4 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white"
                style={{ 
                  borderColor: activity.module.includes('Deletion') ? 'rgb(239, 68, 68)' : 'rgb(124, 58, 237)',
                }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold">{activity.action}</span>
                    <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                      {activity.description}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(activity.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
        )}
      </div>

      {/* Quick Info */}
      <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
        <h3 className="font-bold mb-2 text-gray-900 dark:text-white">Quick Guide</h3>
        <ul className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
          <li>• <strong>Log Deletion:</strong> Record log deletion activities (rm, cleanup)</li>
          <li>• <strong>Log Compression:</strong> Record log compression/archiving activities (tar, gzip)</li>
          <li>• Both modules maintain separate audit trails for compliance</li>
        </ul>
      </div>
    </div>
  );
}
