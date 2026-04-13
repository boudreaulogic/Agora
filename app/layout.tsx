import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { SessionGuard } from '@/components/SessionGuard';
import { ThemeProvider } from '@/components/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Agora - Data Management Platform',
  description: 'Self-hosted data management platform with enterprise-grade security',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className + ' bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100'}>
        <Script id="theme-init" strategy="beforeInteractive">{`try{var t=localStorage.getItem('agora-theme');if(t==='dark')document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark')}catch(e){document.documentElement.classList.remove('dark')}`}</Script>
        <ThemeProvider>
          <SessionGuard />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}