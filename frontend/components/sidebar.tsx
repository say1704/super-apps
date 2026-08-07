"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useAuth, apiRequest } from '@/lib/auth';
import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';
import { ALL_MODULES } from '@/lib/modules';

export default function Sidebar({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['📋 Log Management']);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const data = await apiRequest('/api/notifications/unread-count');
        setUnreadCount(data.unread_count);
      } catch (err) {
        // Silently ignore - backend may be restarting
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleSubmenu = (menuName: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuName) 
        ? prev.filter(m => m !== menuName)
        : [...prev, menuName]
    );
  };

  return (
    <div className={`w-64 shadow-lg overflow-y-auto flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 ${className}`}>
      {/* Header */}
      <div className="p-4 flex-shrink-0 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          🔒 Super Apps
        </h2>
        <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">
          IT Management System
        </p>
      </div>

      {/* Navigation */}
      <nav className="p-4 flex-1 overflow-y-auto">
        {ALL_MODULES
          .filter((m) => {
            // Always show Dashboard
            if (m.href === '/') return true;
            // Admin/Superadmin see all modules
            if (user?.role === 'superadmin') return true;
            // Filter by assigned modules — if none assigned, hide all except Dashboard
            if (!user?.modules || user.modules.length === 0) return false;
            // For parent menus with submenus, show if parent key OR any submenu key matches
            if (m.submenu && m.submenu.length > 0) {
              const parentMatch = m.key && user.modules?.includes(m.key);
              const submenuMatch = m.submenu.some((sub) => sub.key && user.modules?.includes(sub.key));
              return parentMatch || submenuMatch;
            }
            // Otherwise check module key
            return m.key && user.modules.includes(m.key);
          })
          .map((module) => {
          const isActive = pathname === module.href;
          const hasSubmenu = module.submenu && module.submenu.length > 0;
          const isExpanded = hasSubmenu && expandedMenus.includes(module.label);

          return (
            <div key={module.href}>
              {hasSubmenu ? (
                <>
                  {/* Parent menu with toggle */}
                  <div
                    onClick={() => toggleSubmenu(module.label)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-lg">{module.icon}</span>
                    <span className="text-sm font-medium flex-1">{module.label}</span>
                    <span className="text-xs">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>

                  {/* Submenu */}
                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {module.submenu?.map((sub) => {
                        const isSubActive = pathname === sub.href;
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={`block px-3 py-2 rounded-lg text-sm transition-all ${
                              isSubActive
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                          >
                            {sub.icon} {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                /* Regular menu item (no submenu) */
                <Link
                  href={module.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all ${
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="text-lg">{module.icon}</span>
                  <span className="text-sm font-medium flex-1">{module.label}</span>
                  {module.href === '/modules/notifications' && unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white min-w-[20px] text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Info & Theme Toggle */}
      <div className="p-4 flex-shrink-0 space-y-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700">
        {/* User Info */}
        {user && (
          <div className="flex items-center gap-2 px-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-blue-600 text-white">
              {user.full_name?.charAt(0) || user.username?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-slate-900 dark:text-white">
                {user.full_name || user.username}
              </p>
              <p className="text-xs capitalize text-slate-500 dark:text-slate-400">
                {user.role}
              </p>
            </div>
          </div>
        )}

        {/* Theme Toggle Button */}
        <ThemeToggle className="w-full justify-center" />

        {/* Logout Button */}
        {user && (
          <button
            onClick={logout}
            className="w-full px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all hover:opacity-90 bg-red-600 hover:bg-red-700 text-white"
          >
            <span className="text-lg">🚪</span>
            <span className="text-sm font-medium">Logout</span>
          </button>
        )}
      </div>
    </div>
  );
}
