'use client';

import { useState } from 'react';

export function LoginForm({ 
  error,
  action,
}: { 
  error?: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const errorMessage = 
    error === 'CredentialsSignin' ? 'Invalid email or password. Please try again.' :
    error === 'locked' ? 'Account is temporarily locked. Please try again later.' :
    error === 'inactive' ? 'Account is inactive. Please contact support.' :
    error === 'ratelimit' ? 'Too many attempts. Please try again in 15 minutes.' :
    error ? 'Something went wrong. Please try again.' : null;

  return (
    <form
      action={async (formData: FormData) => {
        setIsLoading(true);
        await action(formData);
        setIsLoading(false);
      }}
      className="space-y-6"
    >
      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-start space-x-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={isLoading}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:opacity-50 disabled:bg-gray-50 [&:-webkit-autofill]:[-webkit-text-fill-color:rgb(17,24,39)] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_white_inset]"
          placeholder="you@example.com"
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={isLoading}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:opacity-50 disabled:bg-gray-50 [&:-webkit-autofill]:[-webkit-text-fill-color:rgb(17,24,39)] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_white_inset]"
          placeholder="Enter your password"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Signing in...</span>
          </>
        ) : (
          <span>Sign In</span>
        )}
      </button>
    </form>
  );
}