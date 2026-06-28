import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

export default async function GroupDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Check if user has permissions to view and edit groups
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

  const canViewGroups = userRoles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === 'groups.view')
  );

  const canEditGroups = userRoles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === 'groups.edit')
  );

  const canDeleteGroups = userRoles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === 'groups.delete')
  );

  if (!canViewGroups) {
    redirect('/admin/groups');
  }

  // Get group with members
  const group = await db.group.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: {
          user: true,
        },
        orderBy: [
          { role: 'asc' },
          { joinedAt: 'asc' },
        ],
      },
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  if (!group) {
    notFound();
  }

  // Check if current user is owner or manager
  const currentUserMembership = group.members.find(m => m.userId === session.user?.id);
  const isOwner = currentUserMembership?.role === 'owner';
  const isManager = currentUserMembership?.role === 'manager';
  const canManage = isOwner || isManager || canEditGroups;

  // Get all users for adding new members
  const allUsers = await db.user.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  // Filter out users already in the group
  const availableUsers = allUsers.filter(
    u => !group.members.some(m => m.userId === u.id)
  );

  async function addMember(formData: FormData) {
    'use server';

    const userId = formData.get('userId') as string;

    await db.groupMember.create({
      data: {
        groupId: params.id,
        userId,
        role: 'member',
      },
    });

    await db.auditLog.create({
      data: {
        userId: session!.user!.id,
        action: 'GROUP_MEMBER_ADDED',
        metadata: {
          groupId: params.id,
          addedUserId: userId,
        },
      },
    });

    redirect(`/admin/groups/${params.id}`);
  }

  async function removeMember(formData: FormData) {
    'use server';

    const membershipId = formData.get('membershipId') as string;

    await db.groupMember.delete({
      where: { id: membershipId },
    });

    await db.auditLog.create({
      data: {
        userId: session!.user!.id,
        action: 'GROUP_MEMBER_REMOVED',
        metadata: {
          groupId: params.id,
          membershipId,
        },
      },
    });

    redirect(`/admin/groups/${params.id}`);
  }

  async function updateMemberRole(formData: FormData) {
    'use server';

    const membershipId = formData.get('membershipId') as string;
    const newRole = formData.get('role') as string;

    await db.groupMember.update({
      where: { id: membershipId },
      data: { role: newRole },
    });

    await db.auditLog.create({
      data: {
        userId: session!.user!.id,
        action: 'GROUP_MEMBER_ROLE_UPDATED',
        metadata: {
          groupId: params.id,
          membershipId,
          newRole,
        },
      },
    });

    redirect(`/admin/groups/${params.id}`);
  }

  const ownerCount = group.members.filter(m => m.role === 'owner').length;
  const managerCount = group.members.filter(m => m.role === 'manager').length;
  const memberCount = group.members.filter(m => m.role === 'member').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{group.name}</h1>
              {group.description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{group.description}</p>
              )}
            </div>
            {canDeleteGroups && (
              <Link
                href={`/admin/groups/${group.id}/delete`}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete Group
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{group.members.length}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400">Owners</p>
                <p className="text-2xl font-bold text-purple-600">{ownerCount}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400">Managers</p>
                <p className="text-2xl font-bold text-blue-600">{managerCount}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400">Members</p>
                <p className="text-2xl font-bold text-green-600">{memberCount}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Members</h2>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {group.members.map((membership) => {
                  const isLastOwner = membership.role === 'owner' && ownerCount === 1;
                  const canEditThisMember = canManage && !(isLastOwner && !canEditGroups);
                  
                  return (
                    <div key={membership.id} className="p-6 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                          {membership.user.name?.charAt(0) || membership.user.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {membership.user.name || 'No name'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{membership.user.email}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Joined {new Date(membership.joinedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        {canEditThisMember ? (
                          <form action={updateMemberRole} className="inline flex items-center gap-2">
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <select
                              name="role"
                              defaultValue={membership.role}
                              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-gray-100"
                            >
                              <option value="member">Member</option>
                              <option value="manager">Manager</option>
                              {(isOwner || canEditGroups) && <option value="owner">Owner</option>}
                            </select>
                            <button type="submit" className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                              Update
                            </button>
                          </form>
                        ) : (
                          <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                            membership.role === 'owner'
                              ? 'bg-purple-100 text-purple-800'
                              : membership.role === 'manager'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                          }`}>
                            {membership.role.charAt(0).toUpperCase() + membership.role.slice(1)}
                            {isLastOwner && <span className="ml-1 text-xs">(Last)</span>}
                          </span>
                        )}

                        {canEditThisMember && (
                          <form action={removeMember} className="inline">
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <button
                              type="submit"
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Remove
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow sticky top-8">
              {canManage && availableUsers.length > 0 ? (
                <>
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Add Member</h2>
                  </div>
                  <div className="p-6">
                    <form action={addMember} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Select User
                        </label>
                        <select
                          name="userId"
                          required
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="">Choose a user...</option>
                          {availableUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name || user.email}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Add to Group
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {canManage
                      ? 'All active users are already in this group'
                      : 'Only owners and managers can add members'
                    }
                  </p>
                </div>
              )}

              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Group Info</h3>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <p><strong>Slug:</strong> {group.slug}</p>
                  <p><strong>Created:</strong> {new Date(group.createdAt).toLocaleDateString()}</p>
                  <p><strong>Permissions:</strong> {group.permissions.length}</p>
                  {currentUserMembership && (
                    <p className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <strong>Your Role:</strong> {currentUserMembership.role}
                    </p>
                  )}
                  {canEditGroups && (
                    <p className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-purple-600">
                      <strong>⚡ Admin Override Active</strong>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <Link href="/admin/groups" className="text-blue-600 hover:text-blue-800">
            ← Back to Groups
          </Link>
        </div>
      </div>
    </div>
  );
}