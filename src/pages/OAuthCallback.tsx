import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

export default function OAuthCallback() {
  const [status, setStatus] = useState('Processing OAuth callback...');
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = getSupabase();

        console.log('OAuth Callback - Current URL:', window.location.href);
        console.log('OAuth Callback - Hash:', window.location.hash);

        // Wait a bit for Supabase to process the hash
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('❌ Session error:', sessionError);
          setError(sessionError);
          setStatus('❌ Error getting session');

          // Try to get error details from hash
          const hash = window.location.hash;
          if (hash.includes('error=')) {
            const errorMatch = hash.match(/error=([^&]+)/);
            const errorDescMatch = hash.match(/error_description=([^&]+)/);
            if (errorMatch) {
              setStatus(`❌ OAuth Error: ${decodeURIComponent(errorMatch[1])}`);
              if (errorDescMatch) {
                setError({ message: decodeURIComponent(errorDescMatch[1]) });
              }
            }
          }

          setTimeout(() => {
            window.location.hash = '/login';
          }, 3000);
          return;
        }

        if (session) {
          console.log('✅ Session found:', session);
          setSession(session);
          setStatus('✅ Authentication successful! Redirecting...');

          // Clean up URL and redirect
          window.history.replaceState(null, '', window.location.pathname);

          setTimeout(() => {
            window.location.hash = '/';
          }, 1500);
        } else {
          console.log('⚠️ No session found');
          console.log('Hash params:', window.location.hash);
          setStatus('⚠️ No session found');
          setError({
            message: 'Check Supabase Dashboard: Authentication → URL Configuration. Make sure redirect URLs include: https://taskhub.space and https://taskhub.space/'
          });

          setTimeout(() => {
            window.location.hash = '/login';
          }, 5000);
        }
      } catch (err: any) {
        console.error('OAuth callback error:', err);
        setError(err);
        setStatus('❌ Error processing authentication');

        setTimeout(() => {
          window.location.hash = '/login';
        }, 3000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E8F5F1] to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-[#6FE7C8] border-r-transparent mb-4"></div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {status}
          </h2>

          {session && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg text-left">
              <p className="text-sm text-gray-700">
                <strong>User:</strong> {session.user.email}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                <strong>Provider:</strong> {session.user.app_metadata?.provider}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg text-left">
              <p className="text-sm text-red-700">
                <strong>Error:</strong> {error.message || JSON.stringify(error)}
              </p>
            </div>
          )}

          <div className="mt-6 text-sm text-gray-600">
            <p>Please wait while we complete your authentication...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
