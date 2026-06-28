export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function RolesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Get all roles with their permissions
  const roles = await db.role.findMany({
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      _count: {
        select: {
          users: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Roles & Permissions</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage roles and what they can do
              </p>
            </div>
            <Link
              href="/admin/roles/create"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Create Role
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Roles</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{roles.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">System Roles</p>
            <p className="text-3xl font-bold text-blue-600">
              {roles.filter(r => r.isSystem).length}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Custom Roles</p>
            <p className="text-3xl font-bold text-purple-600">
              {roles.filter(r => !r.isSystem).length}
            </p>
          </div>
        </div>

        {/* Roles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roles.map((role) => (
            <div key={role.id} className="bg-white dark:bg-gray-900 rounded-lg shadow hover:shadow-lg transition-shadow">
              {/* Role Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{role.name}</h3>
                  {role.isSystem && (
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      System
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{role.description}</p>
              </div>

              {/* Stats */}
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Permissions:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">
                      {role.permissions.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Users:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">
                      {role._count.users}
                    </span>
                  </div>
                </div>
              </div>

              {/* Permissions Preview */}
              <div className="p-6">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  Permissions
                </p>
                {role.permissions.length > 0 ? (
                  <div className="space-y-1">
                    {role.permissions.slice(0, 5).map((rp) => (
                      <div key={rp.id} className="flex items-center text-sm">
                        <span className="text-green-600 mr-2">✓</span>
                        <span className="text-gray-700 dark:text-gray-300">{rp.permission.name}</span>
                      </div>
                    ))}
                    {role.permissions.length > 5 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        + {role.permissions.length - 5} more...
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No permissions assigned</p>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                <Link
                  href={`/admin/roles/${role.id}`}
                  className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                >
                  View Details →
                </Link>
                {!role.isSystem && (
                  <Link
                    href={`/admin/roles/${role.id}/delete`}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <Link
            href="/admin/users"
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Users
          </Link>
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800"
          >
            Dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}

