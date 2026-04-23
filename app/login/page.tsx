export const dynamic = 'force-dynamic';
import { auth, signIn } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // Fresh install check — redirect to setup if no users exist
  const userCount = await db.user.count();
  if (userCount === 0) {
    redirect('/setup');
  }
  const session = await auth();
  
  if (session?.user) {
    redirect('/');
  }
  async function handleLogin(formData: FormData) {
    'use server';
    try {
      const email = formData.get('email') as string;
      
      // Check if user has MFA enabled before signing in
      const user = await db.user.findUnique({
        where: { email },
        select: { mfaEnabled: true },
      });
      
      await signIn('credentials', {
        email: email,
        password: formData.get('password'),
        redirectTo: user?.mfaEnabled ? '/verify-mfa' : '/',
      });
    } catch (error: any) {
      if (error?.message?.includes('NEXT_REDIRECT')) throw error;
      if (error?.type === 'CallbackRouteError' || error?.cause?.err?.message) {
        const msg = error?.cause?.err?.message || '';
        if (msg.includes('locked')) redirect('/login?error=locked');
        if (msg.includes('inactive')) redirect('/login?error=inactive');
        if (msg.includes('Too many')) redirect('/login?error=ratelimit');
        redirect('/login?error=CredentialsSignin');
      }
      redirect('/login?error=CredentialsSignin');
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 [&_input]:!text-gray-900 [&_input]:![-webkit-text-fill-color:rgb(17,24,39)]">
      <div className="max-w-md w-full">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <svg width="56" height="56" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <circle cx="256" cy="256" r="220" fill="#1E3A5F"/>
              <polygon points="256,100 360,380 300,380 276,310 236,310 212,380 152,380" fill="white"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Agora</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to manage your data</p>
        </div>
        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <LoginForm
            error={searchParams?.error}
            action={handleLogin}
          />
        </div>
        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-400">
          <p>Your data, your way. Secure and self-hosted.</p>
        </div>
      </div>
    </div>
  );
}