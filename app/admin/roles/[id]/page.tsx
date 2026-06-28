import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

export default async function RoleDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Get role with all related data
  const role = await db.role.findUnique({
    where: { id: params.id },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      users: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!role) {
    notFound();
  }

  // Group permissions by category
  const permissionsByCategory = role.permissions.reduce((acc, rp) => {
    const category = rp.permission.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(rp.permission);
    return acc;
  }, {} as Record<string, typeof role.permissions[0]['permission'][]>);

  // Get all available permissions for comparison
  const allPermissions = await db.permission.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  const allPermissionsByCategory = allPermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, typeof allPermissions>);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{role.name}</h1>
                {role.isSystem && (
                  <span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full">
                    System Role
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{role.description}</p>
            </div>
            {!role.isSystem && (
              <Link
                href={`/admin/roles/${role.id}/edit`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Edit Role
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Permissions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Permissions</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{role.permissions.length}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">out of {allPermissions.length} available</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">Users with Role</p>
                <p className="text-3xl font-bold text-blue-600">{role.users.length}</p>
              </div>
            </div>

            {/* Permissions by Category */}
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Permissions</h2>
              </div>
              <div className="p-6">
                {Object.keys(allPermissionsByCategory).map((category) => {
                  const categoryPerms = allPermissionsByCategory[category];
                  const rolePerms = permissionsByCategory[category] || [];
                  const hasAll = rolePerms.length === categoryPerms.length;
                  const hasNone = rolePerms.length === 0;

                  return (
                    <div key={category} className="mb-6 last:mb-0">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 capitalize">
                          {category}
                        </h3>
                        <span className={`text-sm font-medium ${
                          hasAll ? 'text-green-600' : hasNone ? 'text-gray-400' : 'text-blue-600'
                        }`}>
                          {rolePerms.length} / {categoryPerms.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {categoryPerms.map((perm) => {
                          const hasPermission = rolePerms.some(rp => rp.id === perm.id);
                          return (
                            <div
                              key={perm.id}
                              className={`flex items-start p-3 rounded-lg border-2 ${
                                hasPermission
                                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                              }`}
                            >
                              <span className={`text-lg mr-3 ${
                                hasPermission ? 'text-green-600' : 'text-gray-300'
                              }`}>
                                {hasPermission ? '✓' : '○'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${
                                  hasPermission ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
                                }`}>
                                  {perm.name}
                                </p>
                                {perm.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {perm.description}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                  {perm.slug}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column - Users with this role */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow sticky top-8">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Users with this Role</h2>
              </div>
              <div className="p-6">
                {role.users.length > 0 ? (
                  <div className="space-y-3">
                    {role.users.map((userRole) => (
                      <Link
                        key={userRole.id}
                        href={`/admin/users/${userRole.user.id}`}
                        className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
                      >
                        <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold mr-3">
                          {userRole.user.name?.charAt(0) || userRole.user.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {userRole.user.name || 'No name'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {userRole.user.email}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No users have this role yet</p>
                    <Link
                      href="/admin/users"
                      className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block"
                    >
                      Assign to a user →
                    </Link>
                  </div>
                )}
              </div>

              {/* Role Info */}
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Role Information</h3>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <p><strong>Slug:</strong> {role.slug}</p>
                  <p><strong>Created:</strong> {new Date(role.createdAt).toLocaleDateString()}</p>
                  <p><strong>Updated:</strong> {new Date(role.updatedAt).toLocaleDateString()}</p>
                  {role.isSystem && (
                    <p className="text-blue-600 mt-2">
                      ⚠️ System roles cannot be deleted
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-8">
          <Link
            href="/admin/roles"
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Roles
          </Link>
        </div>
      </div>
    </div>
  );
}