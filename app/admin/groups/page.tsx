export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function GroupsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Get all groups with member counts
  const groups = await db.group.findMany({
    include: {
      _count: {
        select: {
          members: true,
          permissions: true,
        },
      },
      members: {
        where: { role: 'owner' },
        include: { user: true },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Groups</h1>
              <p className="mt-1 text-sm text-gray-500">
                Organize users into teams and departments
              </p>
            </div>
            <Link
              href="/admin/groups/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Create Group
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Total Groups</p>
            <p className="text-3xl font-bold text-gray-900">{groups.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Total Members</p>
            <p className="text-3xl font-bold text-blue-600">
              {groups.reduce((sum, g) => sum + g._count.members, 0)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Avg Members/Group</p>
            <p className="text-3xl font-bold text-purple-600">
              {groups.length > 0 
                ? Math.round(groups.reduce((sum, g) => sum + g._count.members, 0) / groups.length)
                : 0
              }
            </p>
          </div>
        </div>

        {/* Groups Grid */}
        {groups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <Link
                key={group.id}
                href={`/admin/groups/${group.id}`}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
              >
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {group.name}
                  </h3>
                  {group.description && (
                    <p className="text-sm text-gray-600">{group.description}</p>
                  )}
                </div>

                {/* Stats */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-gray-600">Members:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {group._count.members}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Permissions:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {group._count.permissions}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Owner */}
                <div className="p-6">
                  {group.members.length > 0 ? (
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold mr-3">
                        {group.members[0].user.name?.charAt(0) || group.members[0].user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Owner</p>
                        <p className="text-sm font-medium text-gray-900">
                          {group.members[0].user.name || group.members[0].user.email}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No owner assigned</p>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 text-right">
                  <span className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                    View Details →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Groups Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Get started by creating your first group to organize users.
            </p>
            <Link
              href="/admin/groups/new"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Your First Group
            </Link>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <Link
            href="/admin/users"
            className="text-blue-600 hover:text-blue-800"
          >
            ← Users
          </Link>
          <Link
            href="/admin/roles"
            className="text-blue-600 hover:text-blue-800"
          >
            Roles →
          </Link>
        </div>
      </div>
    </div>
  );
}

