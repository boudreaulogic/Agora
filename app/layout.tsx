import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { auth } from '@/lib/auth';
import { SessionGuard } from '@/components/SessionGuard';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Agora - Data Management Platform',
  description: 'Self-hosted data management platform with enterprise-grade security',
  icons: {
    icon: '/favicon.svg',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Theme is account-bound and server-rendered: logged-out visitors (and every
  // public/login page) always get light mode. Only a signed-in user who has set
  // 'dark' in their own profile settings gets the dark class. Rendering it on
  // the server avoids any light→dark flash on load.
  const session = await auth();
  const isDark = (session?.user as any)?.theme === 'dark';

  return (
    <html lang="en" className={isDark ? 'dark' : ''} suppressHydrationWarning>
      <body className={inter.className + ' bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100'}>
        <SessionGuard />
        {children}
      </body>
    </html>
  );
}