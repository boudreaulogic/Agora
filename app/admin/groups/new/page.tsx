export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function NewGroupPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Get all users to select as owner
  const users = await db.user.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  async function createGroup(formData: FormData) {
    'use server';

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const ownerId = formData.get('owner') as string;

    // Create slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // Check if group exists
    const existing = await db.group.findUnique({ where: { slug } });
    if (existing) {
      throw new Error('Group with this name already exists');
    }

    // Create group
    const group = await db.group.create({
      data: {
        name,
        slug,
        description: description || null,
      },
    });

    // Add owner as member
    await db.groupMember.create({
      data: {
        groupId: group.id,
        userId: ownerId,
        role: 'owner',
      },
    });

    // Log creation
    await db.auditLog.create({
      data: {
        userId: session!.user!.id,
        action: 'GROUP_CREATED',
        metadata: {
          groupId: group.id,
          groupName: group.name,
          ownerId,
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create New Group</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create a group to organize users into teams
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
          <form action={createGroup} className="space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Group Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
                placeholder="IT Department"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                A descriptive name for the group
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description (optional)
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
                placeholder="Information Technology team members"
              />
            </div>

            {/* Owner */}
            <div>
              <label htmlFor="owner" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Group Owner
              </label>
              <select
                id="owner"
                name="owner"
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select an owner...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email} ({user.email})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The owner can manage members and group settings
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-2">Group Roles:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li><strong>Owner:</strong> Full control - can manage all aspects of the group</li>
                <li><strong>Manager:</strong> Can add/remove members and assign other managers</li>
                <li><strong>Member:</strong> Belongs to the group, inherits group permissions</li>
              </ul>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end space-x-4">
              <Link
                href="/admin/groups"
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Group
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


