import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { hashPassword } from '@/lib/auth/password';

export default async function EditUserPage({ params }: { params: { id: string } }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Get the user to edit
  const user = await db.user.findUnique({
    where: { id: params.id },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  // Get all available roles
  const allRoles = await db.role.findMany({
    orderBy: { name: 'asc' },
  });

  async function updateUser(formData: FormData) {
    'use server';

    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const isActive = formData.get('isActive') === 'on';
    const selectedRoles = formData.getAll('roles') as string[];

    // Prepare update data
    const updateData: any = {
      name,
      email,
      isActive,
    };

    // Only update password if provided
    if (password && password.length > 0) {
      updateData.passwordHash = await hashPassword(password);
    }

    // Update user
    await db.user.update({
      where: { id: params.id },
      data: updateData,
    });

    // Update roles - delete all existing, then add new ones
    await db.userRole.deleteMany({
      where: { userId: params.id },
    });

    // Add selected roles
    for (const roleId of selectedRoles) {
      await db.userRole.create({
        data: {
          userId: params.id,
          roleId: roleId,
        },
      });
    }

    // Log the update
    await db.auditLog.create({
      data: {
        userId: session!.user!.id,
        action: 'USER_UPDATED',
        metadata: {
          updatedUserId: params.id,
          updatedEmail: email,
          roles: selectedRoles,
          updatedBy: session!.user!.email,
        },
      },
    });

    redirect('/admin/users');
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Edit User</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Update user information and settings
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
          <form action={updateUser} className="space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                defaultValue={user.name || ''}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                defaultValue={user.email}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Password (optional)
              </label>
              <input
                type="password"
                id="password"
                name="password"
                minLength={12}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
                placeholder="Leave blank to keep current password"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Only fill this in if you want to change the password
              </p>
            </div>

            {/* Roles */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Roles
              </label>
              <div className="space-y-3 border border-gray-300 dark:border-gray-600 rounded-lg p-4">
                {allRoles.map((role) => {
                  const hasRole = user.roles.some(ur => ur.roleId === role.id);
                  return (
                    <div key={role.id} className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          type="checkbox"
                          id={`role-${role.id}`}
                          name="roles"
                          value={role.id}
                          defaultChecked={hasRole}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </div>
                      <div className="ml-3">
                        <label htmlFor={`role-${role.id}`} className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
                          {role.name}
                          {role.isSystem && (
                            <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                              System
                            </span>
                          )}
                        </label>
                        {role.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{role.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Users can have multiple roles. Permissions are cumulative.
              </p>
            </div>

            {/* Active Status */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                name="isActive"
                defaultChecked={user.isActive}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900 dark:text-gray-100">
                Account is active (user can login)
              </label>
            </div>

            {/* User Info */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Account Information</h3>
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <p><strong>User ID:</strong> {user.id}</p>
                <p><strong>Created:</strong> {new Date(user.createdAt).toLocaleString()}</p>
                <p><strong>Last Login:</strong> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</p>
                <p><strong>Failed Login Attempts:</strong> {user.failedLoginAttempts}</p>
                {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                  <p className="text-red-600">
                    <strong>⚠️ Account Locked Until:</strong> {new Date(user.lockedUntil).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end space-x-4">
              <Link
                href="/admin/users"
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}