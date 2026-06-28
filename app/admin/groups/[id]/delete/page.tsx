import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

export default async function DeleteGroupPage({ params }: { params: { id: string } }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Check if user has permission to delete groups
  const userRoles = await db.userRole.findMany({
    where: { userId: session.user.id },
    include: { 
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    },
  });

  const canDeleteGroups = userRoles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === 'groups.delete')
  );

  if (!canDeleteGroups) {
    redirect('/admin/groups');
  }

  // Get group
  const group = await db.group.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: { user: true },
      },
      permissions: {
        include: { permission: true },
      },
    },
  });

  if (!group) {
    notFound();
  }

  async function deleteGroup() {
    'use server';

    // Delete all group members
    await db.groupMember.deleteMany({
      where: { groupId: params.id },
    });

    // Delete all group permissions
    await db.groupPermission.deleteMany({
      where: { groupId: params.id },
    });

    // Delete the group
    await db.group.delete({
      where: { id: params.id },
    });

    // Log deletion
    await db.auditLog.create({
      data: {
        userId: session!.user!.id,
        action: 'GROUP_DELETED',
        metadata: {
          groupId: params.id,
          groupName: group?.name,
          memberCount: group?.members?.length || 0,
        },
      },
    });

    redirect('/admin/groups');
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-red-600">Delete Group</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Permanently remove this group from the system
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                  Deleting a group will permanently remove all members and permissions.
                </p>
              </div>
            </div>
          </div>

          {/* Group Details */}
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              You are about to delete:
            </h3>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-6">
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Group Name</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-lg">{group.name}</p>
                </div>
                {group.description && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Description</p>
                    <p className="text-gray-900 dark:text-gray-100">{group.description}</p>
                  </div>
                )}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <p><strong>Members:</strong> {group.members.length}</p>
                  <p><strong>Permissions:</strong> {group.permissions.length}</p>
                  <p><strong>Created:</strong> {new Date(group.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Consequences */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-red-800 mb-2">What will be deleted:</p>
              <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                <li>The group "{group.name}"</li>
                <li>All {group.members.length} member associations</li>
                <li>All {group.permissions.length} group permissions</li>
                <li className="font-medium">Users will NOT be deleted (only removed from this group)</li>
              </ul>
            </div>

            {/* Member List */}
            {group.members.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Members who will be removed from this group:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <div className="space-y-2">
                    {group.members.map((member) => (
                      <div key={member.id} className="flex items-center text-sm">
                        <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs mr-2">
                          {member.user.name?.charAt(0) || member.user.email.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-gray-900 dark:text-gray-100">
                          {member.user.name || member.user.email}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({member.role})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <form action={deleteGroup} className="flex items-center justify-end space-x-4">
              <Link
                href={`/admin/groups/${group.id}`}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Yes, Delete This Group
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}