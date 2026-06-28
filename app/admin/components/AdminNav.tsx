'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export function AdminNav({ 
  user,
  signOutAction 
}: { 
  user: { name?: string | null; email: string };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);

	const navItems = [
	  { name: 'Users', href: '/admin/users' },
	  { name: 'Roles', href: '/admin/roles' },
	  { name: 'Groups', href: '/admin/groups' },
	  { name: 'Tables', href: '/admin/tables' },
	  { name: 'Email', href: '/admin/smtp' },
	  { name: 'Google Sheets', href: '/admin/google-sheets' },
	  { name: 'SharePoint', href: '/admin/sharepoint' },
	  { name: 'Dashboard', href: '/admin/dashboard' },
	  { name: 'Security', href: '/admin/security' },
	];

  const isActive = (href: string) => {
    return pathname.startsWith(href);
  };

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Exit Admin */}
          <div className="flex items-center space-x-8">
            <Link
              href="/"
              className="flex items-center text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Dashboard
            </Link>

            {/* Divider */}
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>

            {/* Admin Sections */}
            <div className="flex space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Right: User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-3 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium hidden sm:block">
                {user.name || user.email}
              </span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                ></div>

                {/* Menu */}
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-20">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name || 'User'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  </div>

                  <Link
                    href="/"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setShowUserMenu(false)}
                  >
                    🏠 Dashboard
                  </Link>

                  <Link
                    href="/admin/users"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setShowUserMenu(false)}
                  >
                    👥 Admin Panel
                  </Link>

                  <div className="border-t border-gray-100 dark:border-gray-800 mt-2 pt-2">
                    <form action={signOutAction}>
                      <button
                        type="submit"
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        🚪 Sign Out
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
