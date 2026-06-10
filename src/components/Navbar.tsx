"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import AuthModal from '@/components/AuthModal';

export default function Navbar() {
  const { user, userData, loading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <>
      <nav className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-white tracking-wider">
              OSINT<span className="text-red-500">_STF</span>
            </Link>
            <Link href="/leaderboard" className="text-gray-300 hover:text-white transition-colors text-base font-medium">
              Global Leaderboard
            </Link>
            {user && (
              <Link href={`/profile/${user.uid}`} className="text-gray-300 hover:text-white transition-colors text-base font-medium">
                My Profile
              </Link>
            )}
            {userData?.role === 'admin' && (
              <Link href="/admin/users" className="text-gray-300 hover:text-white transition-colors text-base font-medium">
                Users
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <a
                href="https://chat.whatsapp.com/GGrLNSRZ0c6B7WQHnRkZ6Y"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex items-center justify-center p-2 rounded-full border border-green-500/50 hover:border-green-400 text-green-500 hover:text-green-400 bg-green-950/10 hover:bg-green-950/30 transition-all duration-300 shadow-[0_0_8px_rgba(34,197,94,0.2)] hover:shadow-[0_0_12px_rgba(34,197,94,0.5)]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.012 2c-5.506 0-9.988 4.482-9.988 9.988 0 1.76.458 3.48 1.332 5.006L2 22l5.148-1.348c1.468.8 3.11 1.22 4.854 1.22 5.506 0 9.988-4.482 9.988-9.988C22 6.482 17.518 2 12.012 2zm6.056 14.366c-.248.7-1.462 1.378-2.008 1.458-.496.074-1.144.13-3.324-.772-2.784-1.156-4.576-3.99-4.716-4.178-.138-.188-1.114-1.482-1.114-2.828 0-1.346.702-2.008.95-2.278.248-.27.546-.338.728-.338h.52c.164 0 .388.062.596.568.21.512.72 1.754.782 1.882.062.126.104.272.02.438-.082.166-.124.272-.248.414-.124.14-.262.316-.372.424-.124.124-.254.26-.11.512.146.25.644 1.058 1.382 1.716.954.848 1.758 1.112 2.008 1.238.25.126.39.104.536-.062.146-.166.62-.72.786-.968.166-.248.33-.208.55-.126.222.082 1.404.662 1.644.78.242.12.4.178.462.288.062.11.062.632-.186 1.332z" />
                </svg>
                <span className="absolute right-0 top-12 scale-0 group-hover:scale-100 transition-all duration-200 origin-right rounded bg-gray-900 border border-green-500 px-2 py-1 text-xs font-mono text-green-400 whitespace-nowrap z-50 shadow-[0_0_8px_rgba(34,197,94,0.3)]">
                  [JOIN_COMMAND_CHAT]
                </span>
              </a>
            )}
            {!loading && (
              <>
                {user ? (
                  <div className="flex items-center gap-4">
                    <div className="text-base text-gray-300">
                      <Link 
                        href="/settings" 
                        className="font-mono hover:text-green-400 hover:underline transition-colors"
                        title="Open agent settings configuration"
                      >
                        {userData?.displayName || user.displayName || user.email}
                      </Link>
                      {userData?.role && (
                        <span className={`ml-2 px-2 py-0.5 rounded text-sm uppercase tracking-wider font-bold ${userData.role === 'admin' ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-gray-700 text-gray-400'}`}>
                          {userData.role}
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={handleSignOut}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-base transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsAuthModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-base transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Agent Login
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Auth Modal overlay */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </>
  );
}