export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { EmojiPicker } from './EmojiPicker';
import { WorkspaceSelector } from './WorkspaceSelector';

export default async function NewTablePage({
  searchParams,
}: {
  searchParams: { workspace?: string };
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Fetch workspaces for the selector
  const userId = session.user.id;
  const userRoles = await db.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  const userGroups = await db.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const roleIds = userRoles.map(r => r.roleId);
  const groupIds = userGroups.map(g => g.groupId);

  const isSysAdmin = await db.userRole.findFirst({
    where: {
      userId,
      role: { permissions: { some: { permission: { slug: 'admin.access' } } } },
    },
  });

  let workspaces;
  if (isSysAdmin) {
    workspaces = await db.workspace.findMany({
      select: { id: true, name: true, icon: true },
      orderBy: { createdAt: 'asc' },
    });
  } else {
    workspaces = await db.workspace.findMany({
      where: {
        OR: [
          { createdById: userId },
          { members: { some: { userId, permission: { in: ['editor', 'admin', 'owner'] } } } },
          { members: { some: { roleId: { in: roleIds }, permission: { in: ['editor', 'admin', 'owner'] } } } },
          { members: { some: { groupId: { in: groupIds }, permission: { in: ['editor', 'admin', 'owner'] } } } },
        ],
      },
      select: { id: true, name: true, icon: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function createTable(formData: FormData) {
    'use server';

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const icon = formData.get('icon') as string;
    const workspaceId = formData.get('workspaceId') as string;

    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
    let slug = baseSlug;
    let counter = 1;
    while (await db.agoraTable.findUnique({ where: { slug } })) {
      slug = `${baseSlug}_${counter++}`;
    }

    const table = await db.agoraTable.create({
      data: {
        name,
        slug,
        description: description || null,
        icon: icon || '📊',
        createdById: session!.user.id,
        workspaceId: workspaceId || null,
      },
    });

    const defaultColumns = [
      { name: 'Name', type: 'text', position: 0 },
      { name: 'Status', type: 'select', position: 1, settings: {
        options: [
          { value: 'not_started', label: 'Not Started', color: '#EF4444' },
          { value: 'in_progress', label: 'In Progress', color: '#F59E0B' },
          { value: 'complete', label: 'Complete', color: '#10B981' },
        ]
      }},
      { name: 'Created', type: 'date', position: 2 },
      { name: 'Attachments', type: 'attachment', position: 3, settings: { isSystem: true } },
    ];

    for (const col of defaultColumns) {
      await db.agoraColumn.create({
        data: {
          tableId: table.id,
          name: col.name,
          type: col.type,
          position: col.position,
          settings: col.settings || {},
        },
      });
    }

    await db.auditLog.create({
      data: {
        userId: session!.user.id,
        action: 'TABLE_CREATED',
        metadata: {
          tableId: table.id,
          tableName: table.name,
          workspaceId: workspaceId || null,
        },
      },
    });

    redirect(`/tables/${table.id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create New Table</h1>
              <p className="mt-1 text-sm text-gray-500">
                Build a custom database for your data
              </p>
            </div>
            <Link href="/" className="text-gray-600 hover:text-gray-900">
              ← Back
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form action={createTable} className="bg-white rounded-lg shadow-lg p-8 space-y-8">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Table Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              placeholder="e.g., Inventory, Projects, Contacts"
            />
            <p className="mt-2 text-xs text-gray-500">
              Give your table a clear, descriptive name
            </p>
          </div>

          <EmojiPicker />

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="What will you use this table for?"
            />
          </div>

          <WorkspaceSelector
            workspaces={workspaces}
            defaultWorkspaceId={searchParams.workspace || ''}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">📚 What happens next?</h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Your table will be created with 3 default columns (Name, Status, Created)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>You can add, edit, or remove columns anytime</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Start adding rows immediately after creation</span>
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-200">
            <Link
              href="/"
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Create Table
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
