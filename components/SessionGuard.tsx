'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
export function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (pathname?.startsWith('/forms/') || pathname?.startsWith('/approvals/') || pathname?.startsWith('/api/public/') || pathname === '/login' || pathname === '/register' || pathname === '/setup') {
      return;
    }

    const isAlive = sessionStorage.getItem('agora_session_alive');
    
    if (!isAlive) {
      sessionStorage.setItem('agora_session_alive', 'true');
      
      fetch('/api/auth/signout', { method: 'POST' })
        .finally(() => {
          router.push('/login');
          router.refresh();
        });
    }
  }, [pathname]);
  return null;
}