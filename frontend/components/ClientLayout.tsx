"use client";

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useInactivityTimer } from '@/hooks/useInactivityTimer';
import Sidebar from '@/components/sidebar';
import ThemeToggle from '@/components/ThemeToggle';
import MobileNav from '@/components/MobileNav';
import CommandPalette from '@/components/CommandPalette';
import ShortcutsHelp from '@/components/ShortcutsHelp';
import SessionTimeoutModal from '@/components/SessionTimeoutModal';
import AiChat from '@/components/AiChat';
import { apiRequest } from '@/lib/auth';

const SESSION_TIMEOUT = 15 * 60;
const WARNING_TIME = 2 * 60;

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === '/login' || pathname === '/reset-password' || pathname === '/register';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);

  const handleWarning = useCallback(() => {
    setShowTimeoutModal(true);
  }, []);

  const handleTimeout = useCallback(() => {
    setShowTimeoutModal(false);
    apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  }, [router]);

  const { remaining, reset } = useInactivityTimer({
    timeout: SESSION_TIMEOUT,
    warningTime: WARNING_TIME,
    onWarning: handleWarning,
    onTimeout: handleTimeout,
    enabled: !isAuthPage,
  });

  const handleStay = useCallback(async () => {
    try {
      const data = await apiRequest('/token/refresh', { method: 'POST' });
      if (data.access_token) {
        try { sessionStorage.setItem('sa_auth_token', data.access_token); } catch {}
      }
    } catch (err) {
      console.error('Failed to refresh session:', err);
      router.push('/login');
      return;
    }
    setShowTimeoutModal(false);
    reset();
  }, [reset, router]);

  const handleLogout = useCallback(() => {
    setShowTimeoutModal(false);
    apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  }, [router]);

  useKeyboardShortcuts({
    'ctrl+k': () => setCommandPaletteOpen(true),
    'meta+k': () => setCommandPaletteOpen(true),
    '?': () => setShortcutsHelpOpen((prev) => !prev),
  });

  useEffect(() => {
    const handleGlobal = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === 'Escape' && !isEditing) {
        setCommandPaletteOpen(false);
        setShortcutsHelpOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobal);
    return () => window.removeEventListener('keydown', handleGlobal);
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transitions');
      document.documentElement.classList.add('theme-transition');
    });
  }, []);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar className="hidden md:flex" />
      <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <ShortcutsHelp isOpen={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
      {showTimeoutModal && (
        <SessionTimeoutModal
          remaining={remaining}
          warningTime={WARNING_TIME}
          onStay={handleStay}
          onLogout={handleLogout}
        />
      )}
      <AiChat />
    </div>
  );
}

function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const [pageTitle, setPageTitle] = useState('Dashboard');

  useEffect(() => {
    const paths: Record<string, string> = {
      '/': 'Dashboard',
      '/dashboard': 'Dashboard',
      '/profile': 'Profile',
      '/modules/infrastructure': 'Infrastructure',
      '/modules/security-compliance': 'Security & Compliance',
      '/modules/operations': 'Operations',
      '/modules/backup-management': 'Backup Management',
      '/modules/log-management': 'Log Management',
      '/modules/log-deletion': 'Log Deletion',
      '/modules/log-compression': 'Log Compression',
      '/modules/monthly-server-check': 'Server Capacity',
      '/modules/irmc': 'IRMC Checks',
      '/modules/vulnerability': 'Vulnerability Report',
      '/modules/incident': 'Incident Report',
      '/modules/risk': 'Risk Assessment',
      '/modules/quality': 'Quality Objectives',
      '/modules/assets': 'Asset Management',
      '/modules/worklog': 'Worklog',
      '/modules/tasks': 'Project Tasks',
      '/modules/documentation': 'Document Library',
      '/modules/forms': 'Form Uploads',
      '/modules/backup-check': 'Backup Check',
      '/modules/backup-analytics': 'Backup Analytics',
      '/modules/activity': 'Activity Logs',
      '/modules/activity-logs': 'Activity Logs',
      '/modules/notifications': 'Notifications',
      '/modules/settings': 'Settings',
    };
    setPageTitle(paths[pathname] || 'Dashboard');
  }, [pathname]);

  return (
    <header className="h-14 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle variant="icon" />
        <button
          onClick={() => {
            const event = new KeyboardEvent('keydown', { key: '?', shiftKey: true });
            window.dispatchEvent(event);
          }}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-mono"
          title="Keyboard shortcuts (?)"
          aria-label="Show keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </header>
  );
}
