export const dynamic = 'force-dynamic';
import { auth, signOut } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { AdminNav } from './components/AdminNav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Check if user has "Access Admin Panel" permission
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

  // Check if ANY of the user's roles have the "Access Admin Panel" permission
  const isAdmin = userRoles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === 'admin.access')
  );

  // DEBUG LOGGING
  console.log('=== ADMIN CHECK DEBUG ===');
  console.log('User ID:', session.user.id);
  console.log('User Roles Count:', userRoles.length);
  console.log('User Roles:', JSON.stringify(userRoles, null, 2));
  console.log('Is Admin:', isAdmin);
  console.log('========================');

  // If not admin, kick them out!
  if (!isAdmin) {
    redirect('/');
  }

  // Get full user data for nav
  const user = await db.user.findUnique({
    where: { id: session.user.id },
  });

  // Server action for sign out
  async function handleSignOut() {
    'use server';
    await signOut();
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AdminNav 
        user={{ name: user?.name, email: user?.email || session.user.email || '' }}
        signOutAction={handleSignOut}
      />
      <main>{children}</main>
    </div>
  );
}

