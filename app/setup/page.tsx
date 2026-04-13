export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { SetupForm } from './SetupForm';

export default async function SetupPage() {
  // If ANY users exist, setup is complete — redirect to login
  const userCount = await db.user.count();
  if (userCount > 0) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <div className="max-w-lg w-full">
        {/* Logo & Welcome */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <svg width="64" height="64" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <circle cx="256" cy="256" r="220" fill="#1E3A5F"/>
              <polygon points="256,100 360,380 300,380 276,310 236,310 212,380 152,380" fill="white"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Agora</h1>
          <p className="text-sm text-gray-500 mt-2">Let's set up your admin account to get started.</p>
        </div>

        {/* Setup Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Create Admin Account</h2>
            <p className="text-sm text-gray-500 mt-1">This will be the first user with full system access.</p>
          </div>
          <SetupForm />
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-400">
          <p>This page only appears on first launch. Once your admin account is created, it won't be accessible again.</p>
        </div>
      </div>
    </div>
  );
}
