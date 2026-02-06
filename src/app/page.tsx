import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LogOut, User, Shield } from 'lucide-react';

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">A</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Agora</h1>
                <p className="text-sm text-gray-500">Data Management Platform</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-gray-700">
                <User className="h-5 w-5" />
                <span className="font-medium">{session.user.name || session.user.email}</span>
              </div>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome to Agora! 🎉
          </h2>
          <p className="text-lg text-gray-600 mb-6">
            You're now logged into your secure data management platform.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">
                  Fort Knox Security Active
                </h3>
                <p className="text-sm text-blue-700">
                  Your session is protected with Argon2id encryption, database-backed sessions,
                  and comprehensive audit logging.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🗄️</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Dynamic Tables
            </h3>
            <p className="text-gray-600">
              Create tables on the fly with custom columns and relationships.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🧮</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Live Calculations
            </h3>
            <p className="text-gray-600">
              Real-time formula fields that update as you type.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🔐</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Granular Permissions
            </h3>
            <p className="text-gray-600">
              Column-level and row-level access control.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🔗</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Webhooks & API
            </h3>
            <p className="text-gray-600">
              Event-driven integrations and REST API access.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Data Visualization
            </h3>
            <p className="text-gray-600">
              Charts, graphs, and interactive dashboards.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🐳</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Fully Containerized
            </h3>
            <p className="text-gray-600">
              Deploy anywhere with Docker - you own everything.
            </p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-xl p-8 text-white">
          <h3 className="text-2xl font-bold mb-6">Platform Status</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-blue-200 text-sm mb-1">User Account</p>
              <p className="text-3xl font-bold">{session.user.name || 'Active'}</p>
            </div>
            <div>
              <p className="text-blue-200 text-sm mb-1">Security Level</p>
              <p className="text-3xl font-bold">Maximum</p>
            </div>
            <div>
              <p className="text-blue-200 text-sm mb-1">Database</p>
              <p className="text-3xl font-bold">PostgreSQL 16</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-600">
        <p>Built for the White Earth Reservation and small businesses everywhere.</p>
        <p className="text-sm mt-2">🔒 Secured with Argon2id • 🐳 Containerized • 🚀 Self-Hosted</p>
      </footer>
    </div>
  );
}
