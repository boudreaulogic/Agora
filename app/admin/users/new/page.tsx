export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { hashPassword } from '@/lib/auth/password';

export default async function NewUserPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const allRoles = await db.role.findMany({
    orderBy: { name: 'asc' },
  });

  async function createUser(formData: FormData) {
    'use server';
    const email = formData.get('email') as string;
    const name = formData.get('name') as string;
    const password = formData.get('password') as string;
    const isActive = formData.get('isActive') === 'on';
    const selectedRoles = formData.getAll('roles') as string[];

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new Error('User exists');

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { email, name, passwordHash, isActive, isEmailVerified: true },
    });

    for (const roleId of selectedRoles) {
      await db.userRole.create({ data: { userId: user.id, roleId } });
    }

    await db.auditLog.create({
      data: {
        userId: session!.user!.id,
        action: 'USER_CREATED',
        metadata: { createdEmail: email, roles: selectedRoles },
      },
    });

    redirect('/admin/users');
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create New User</h1>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <form action={createUser} className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
            <input type="text" name="name" required className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
            <input type="email" name="email" required className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password</label>
            <input type="password" name="password" required minLength={12} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Roles</label>
            <div className="space-y-2 border border-gray-300 dark:border-gray-600 rounded-lg p-4">
              {allRoles.map(role => (
                <label key={role.id} className="flex items-center text-gray-900 dark:text-gray-100">
                  <input type="checkbox" name="roles" value={role.id} defaultChecked={role.slug === 'user'} className="mr-2" />
                  {role.name}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center text-gray-900 dark:text-gray-100">
            <input type="checkbox" name="isActive" defaultChecked className="mr-2" />
            Account is active
          </label>
          <div className="flex justify-end space-x-4">
            <Link href="/admin/users" className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</Link>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Create User</button>
          </div>
        </form>
      </div>
    </div>
  );
}
