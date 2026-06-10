'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { updateAgentProfile } from '@/app/actions/authActions';
import Link from 'next/link';

export default function SettingsClient() {
  const { user, userData, loading } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [sysMessage, setSysMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (userData?.displayName) {
      setDisplayName(userData.displayName);
    } else if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user, userData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-green-400 font-mono flex items-center justify-center p-8">
        <p className="text-lg animate-pulse">&gt;&gt; ACCESSING CORE CONFIGURATIONS...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-red-500 font-mono flex items-center justify-center p-8">
        <div className="max-w-md p-6 bg-red-950/20 border border-red-800 rounded text-center shadow-lg">
          <h1 className="text-2xl font-bold uppercase mb-4">[ACCESS_DENIED]</h1>
          <p className="text-base text-gray-300 mb-6">
            Authentication required to modify agent configuration protocols.
          </p>
          <Link href="/" className="inline-block px-4 py-2 bg-red-900/60 hover:bg-red-800 text-white rounded transition-colors text-base border border-red-700 font-mono">
            Exit Settings
          </Link>
        </div>
      </div>
    );
  }

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSysMessage(null);
    if (!displayName.trim()) {
      setSysMessage({ text: 'Alias cannot be empty.', isError: true });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Update Firebase Auth displayName
      await updateProfile(user, { displayName: displayName.trim() });

      // 2. Obtain fresh ID token
      const idToken = await user.getIdToken(true);

      // 3. Call Server Action to sync displayName in Firestore
      const res = await updateAgentProfile(idToken, displayName.trim());

      if (res.success) {
        setSysMessage({ text: 'Agent credentials synchronized successfully.', isError: false });
      } else {
        setSysMessage({ text: res.message || 'Synchronization failed.', isError: true });
      }
    } catch (error: any) {
      console.error("Profile update failure:", error);
      setSysMessage({ text: error.message || 'An error occurred during updating.', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setSysMessage(null);
    if (!user.email) return;

    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      setSysMessage({ text: 'Decryption code reset vector dispatched to registered email.', isError: false });
    } catch (error: any) {
      console.error("Password reset failure:", error);
      setSysMessage({ text: error.message || 'Reset dispatch vector failure.', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-8 flex items-center justify-center">
      <div className="w-full max-w-md p-6 bg-gray-900 border border-cyan-800 rounded shadow-2xl">
        {/* Header */}
        <div className="mb-6 border-b border-cyan-900 pb-3 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-widest text-cyan-400 uppercase">&gt; AGENT_SETTINGS</h1>
            <p className="text-xs text-cyan-700 mt-0.5">Manage agent authorization profiles.</p>
          </div>
          <Link href="/" className="text-sm text-gray-500 hover:text-cyan-400 transition-colors uppercase">
            [Close]
          </Link>
        </div>

        {/* System Message Banner */}
        {sysMessage && (
          <div className={`p-3 mb-6 border rounded text-sm ${sysMessage.isError ? 'bg-red-950/20 border-red-800 text-red-400' : 'bg-green-950/20 border-green-800 text-green-400'}`}>
            <strong>{sysMessage.isError ? '[ALERT_ERROR]:' : '[INTEL_UPDATE]:'}</strong> {sysMessage.text}
          </div>
        )}

        {/* Profile Settings Form */}
        <form onSubmit={handleUpdateName} className="space-y-6">
          <div>
            <label className="block text-sm font-bold uppercase tracking-wider text-cyan-500 mb-2">
              AGENT ALIAS / DISPLAY NAME
            </label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-base"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter new alias"
            />
          </div>

          <div>
            <label className="block text-sm font-bold uppercase tracking-wider text-cyan-500 mb-1">
              REGISTERED COORDINATES (EMAIL)
            </label>
            <p className="text-base text-gray-400 bg-black/40 px-3 py-2 rounded border border-gray-800 font-mono">
              {user.email}
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700 hover:border-cyan-500 text-cyan-400 font-bold rounded transition-colors tracking-wide font-mono uppercase text-base disabled:opacity-40"
          >
            {isSubmitting ? 'SYNCHRONIZING...' : 'UPDATE_PROFILE_ALIAS'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="px-2 bg-gray-900 text-gray-500 font-mono">Security Override</span>
          </div>
        </div>

        {/* Security Reset Area */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-red-500 mb-1">
              RESET ACCESS KEY (PASSWORD)
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-3">
              Triggering this action sends a password decryption reset link to your registered email address.
            </p>
            <button
              onClick={handlePasswordReset}
              disabled={isSubmitting || resetSent}
              className={`w-full py-2.5 px-4 border text-sm font-bold rounded transition-all font-mono uppercase ${
                resetSent
                  ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-red-950/20 hover:bg-red-950/40 border-red-900/60 hover:border-red-600 text-red-500 hover:text-red-400'
              }`}
            >
              {resetSent ? 'RESET_LINK_DISPATCHED' : 'DISPATCH_PASSWORD_RESET'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
