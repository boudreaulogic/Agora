import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

export default async function DeleteUserPage({ params }: { params: { id: string } }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Get the user to delete
  const user = await db.user.findUnique({
    where: { id: params.id },
  });

  if (!user) {
    notFound();
  }

  // Prevent deleting yourself
  const isSelf = user.id === session.user.id;

  async function deleteUser() {
    'use server';

    // Double-check you're not deleting yourself
    if (params.id === session!.user!.id) {
      throw new Error('Cannot delete your own account');
    }

    // Log the deletion BEFORE deleting (so we still have the user data)
    await db.auditLog.create({
      data: {
        userId: session!.user!.id,
        action: 'USER_DELETED',
        metadata: {
          deletedUserId: params.id,
          deletedEmail: user?.email,
          deletedName: user?.name,
          deletedBy: session!.user!.email,
        },
      },
    });

    // Delete the user
    await db.user.delete({
      where: { id: params.id },
    });

    redirect('/admin/users');
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-red-600">Delete User</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Permanently remove this user from the system
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isSelf ? (
          // Can't delete yourself
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <span className="text-4xl">⛔</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-red-800 mb-2">
                  Cannot Delete Your Own Account
                </h3>
                <p className="text-sm text-red-700 mb-4">
                  You cannot delete your own user account. This is a security measure to prevent accidental lockouts.
                </p>
                <p className="text-sm text-red-700">
                  If you need to delete this account, please ask another administrator to do it.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <Link
                href="/admin/users"
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 inline-block"
              >
                ← Back to Users
              </Link>
            </div>
          </div>
        ) : (
          // Delete confirmation
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow">
            {/* Warning */}
            <div className="bg-yellow-50 border-b border-yellow-200 p-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-4xl">⚠️</span>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-yellow-800 mb-2">
                    Warning: This action cannot be undone
                  </h3>
                  <p className="text-sm text-yellow-700">
                    Deleting a user will permanently remove all their data from the system.
                  </p>
                </div>
              </div>
            </div>

            {/* User Details */}
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                You are about to delete:
              </h3>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-full bg-red-600 flex items-center justify-center text-white font-semibold text-lg">
                    {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{user.name || 'No name'}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <p><strong>User ID:</strong> {user.id}</p>
                  <p><strong>Created:</strong> {new Date(user.createdAt).toLocaleString()}</p>
                  <p><strong>Last Login:</strong> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</p>
                  <p><strong>Status:</strong> {user.isActive ? '🟢 Active' : '🔴 Inactive'}</p>
                </div>
              </div>

              {/* Consequences */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-red-800 mb-2">What will be deleted:</p>
                <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                  <li>User account and authentication credentials</li>
                  <li>All sessions (user will be logged out immediately)</li>
                  <li>Associated audit logs will remain for compliance</li>
                </ul>
              </div>

              {/* Buttons */}
              <form action={deleteUser} className="flex items-center justify-end space-x-4">
                <Link
                  href="/admin/users"
                  className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Yes, Delete This User
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}