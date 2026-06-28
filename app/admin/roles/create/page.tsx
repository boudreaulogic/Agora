export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { CreateRoleForm } from './CreateRoleForm';

export default async function CreateRolePage() {
  // Get all permissions grouped by category
  const permissions = await db.permission.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  // Group permissions by category
  const permissionsByCategory = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, typeof permissions>);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create New Role</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Define a new role and assign permissions
          </p>
        </div>

        {/* Form */}
        <CreateRoleForm permissionsByCategory={permissionsByCategory} />
      </div>
    </div>
  );
}

