// app/connectors/college-scorecard/page.tsx
// Setup page for the College Scorecard connector. Fetches workspaces the user
// has access to (created or member of) and renders the setup form.

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { CollegeScorecardSetup } from './CollegeScorecardSetup';

export const dynamic = 'force-dynamic';

export default async function CollegeScorecardPage() {
  var session = await auth();
  if (!session || !session.user || !session.user.id) {
    redirect('/login');
  }

  var userId = session.user.id;

  var workspaces = await db.workspace.findMany({
    where: {
      OR: [
        { createdById: userId },
        { members: { some: { userId: userId } } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">College Scorecard Connector</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Sync school data from the U.S. Department of Education College Scorecard into an Agora table.
        </p>
      </div>
      <CollegeScorecardSetup workspaces={workspaces} />
    </div>
  );
}