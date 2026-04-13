export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminTablesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  // Get ALL tables in the system with owner info and counts
  const tables = await db.agoraTable.findMany({
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: {
          rows: true,
          columns: true,
          shares: true,
          views: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const totalTables = tables.length;
  const totalRows = tables.reduce((sum, t) => sum + t._count.rows, 0);
  const totalShares = tables.reduce((sum, t) => sum + t._count.shares, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">All Tables</h1>
        <p className="text-sm text-gray-600 mt-1">
          System-wide overview of all tables. As a sys admin, you can access any table.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Total Tables</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalTables}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Total Rows</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalRows.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Active Shares</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalShares}</div>
        </div>
      </div>

      {/* Tables List */}
      {tables.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-900">No tables yet</h3>
          <p className="text-sm text-gray-500 mt-1">Tables created by users will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Table</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rows</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Columns</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Views</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shares</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Security</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Updated</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tables.map((table) => (
                <tr key={table.id} className="hover:bg-gray-50 transition-colors">
                  {/* Table Name */}
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">{table.icon || '📊'}</span>
                      <div>
                        <div className="font-medium text-gray-900">{table.name}</div>
                        {table.description && (
                          <div className="text-xs text-gray-500 truncate max-w-xs">{table.description}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Owner */}
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                        {table.createdBy.name?.charAt(0) || table.createdBy.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm text-gray-900">{table.createdBy.name || 'Unnamed'}</div>
                        <div className="text-xs text-gray-500">{table.createdBy.email}</div>
                      </div>
                    </div>
                  </td>

                  {/* Counts */}
                  <td className="px-6 py-4 text-center text-sm text-gray-700">{table._count.rows}</td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">{table._count.columns}</td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">{table._count.views}</td>
                  <td className="px-6 py-4 text-center">
                    {table._count.shares > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {table._count.shares}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>

                  {/* Row-Level Security indicator */}
                  <td className="px-6 py-4 text-center">
                    {table.rowLevelSecurity ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        🔒 RLS
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>

                  {/* Updated */}
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(table.updatedAt).toLocaleDateString()}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/tables/${table.id}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Open Table
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

