import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/toast';
import { ThemeProvider } from '@/components/ThemeProvider';
import Sidebar from '@/components/sidebar';
import ThemeToggle from '@/components/ThemeToggle';
import MobileNav from '@/components/MobileNav';
import CommandPalette from '@/components/CommandPalette';
import ShortcutsHelp from '@/components/ShortcutsHelp';
import ClientLayout from '@/components/ClientLayout';
import Script from 'next/script';
import { headers } from 'next/headers';
import './globals.css';

export const metadata = {
  title: 'Super Apps - IT Management System',
  description: 'IT Management System',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get('x-nonce') || '';
  
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
      </head>
      <body
        className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white antialiased"
        suppressHydrationWarning
      >
        <ThemeProvider nonce={nonce}>
          <ToastProvider>
            <AuthProvider>
              <ClientLayout>{children}</ClientLayout>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
