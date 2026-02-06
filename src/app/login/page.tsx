import { auth, signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const session = await auth();
  
  // If already logged in, redirect to home
  if (session?.user) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Agora</h1>
          <p className="text-gray-600">
            Secure Data Management Platform
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Sign In
          </h2>

          <form
            action={async (formData: FormData) => {
              'use server';
              await signIn('credentials', {
                email: formData.get('email'),
                password: formData.get('password'),
                redirectTo: '/',
              });
            }}
            className="space-y-6"
          >
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-all"
            >
              Sign In
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            <p>Built for the White Earth Reservation</p>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          <p>🔒 Secured with Argon2id encryption</p>
        </div>
      </div>
    </div>
  );
}
