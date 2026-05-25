'use client';

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { syncNewUser } from '@/app/actions/authActions';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal State Reset on Open/Close transitions
  useEffect(() => {
    if (!isOpen) {
      setIsRegister(false);
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [isOpen]);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Form validations for registration
    if (isRegister) {
      if (!username.trim()) {
        setError('Agent alias (username) is required.');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Access codes (passwords) do not match.');
        setLoading(false);
        return;
      }
    }

    try {
      if (isRegister) {
        // 1. Create the user credentials
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // 2. Update the Auth Profile displayName
        await updateProfile(userCredential.user, { displayName: username.trim() });
        
        // 3. Await fresh ID token and securely sync profiles on server
        const idToken = await userCredential.user.getIdToken(true);
        const syncRes = await syncNewUser(idToken, username.trim());
        if (!syncRes.success) {
          setError(syncRes.message);
          setLoading(false);
          return;
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      console.error("Authentication error:", err);
      // Format readable error messages for Firebase Auth
      let msg = err.message || 'An error occurred during authentication.';
      if (err.code === 'auth/user-not-found') {
        msg = 'No agent found with this email.';
      } else if (err.code === 'auth/wrong-password') {
        msg = 'Invalid access credentials.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password must be at least 6 characters long.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password access key.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const userCredential = await signInWithPopup(auth, provider);

      // Securely sync profiles on server for Google users
      const idToken = await userCredential.user.getIdToken(true);
      const displayName = userCredential.user.displayName || '';
      
      const syncRes = await syncNewUser(idToken, displayName);
      if (!syncRes.success) {
        setError(syncRes.message);
        setLoading(false);
        return;
      }

      onClose();
    } catch (err: any) {
      console.error("Google Auth error:", err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Google authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      {/* Backdrop overlay (click outside to close) */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Modal Box */}
      <div className="relative w-full max-w-md p-6 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-10 font-sans text-white">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          title="Close dialog (Esc)"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title / Header */}
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold tracking-wider text-green-400 font-mono uppercase">
            {isRegister ? 'REGISTER_AGENT' : 'AUTHENTICATE_AGENT'}
          </h2>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            {isRegister ? 'Create secure portal credentials' : 'Enter decryption key details'}
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="p-3 mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800 rounded font-mono">
            <strong>[SYS_ERR]:</strong> {error}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {/* Username Field (Conditional Rendering for Registration) */}
          {isRegister && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 font-mono">
                Agent Alias (Username)
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-white focus:outline-none focus:border-green-500 font-mono text-sm"
                placeholder="e.g. Neo"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 font-mono">
              Agent Email
            </label>
            <input
              type="email"
              required
              className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-white focus:outline-none focus:border-green-500 font-mono text-sm"
              placeholder="agent@osint.net"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 font-mono">
              Access Code (Password)
            </label>
            <input
              type="password"
              required
              className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-white focus:outline-none focus:border-green-500 font-mono text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Confirm Password Field (Conditional Rendering for Registration) */}
          {isRegister && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 font-mono">
                Verify Access Code (Confirm Password)
              </label>
              <input
                type="password"
                required
                className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-white focus:outline-none focus:border-green-500 font-mono text-sm"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-green-700 hover:bg-green-600 active:bg-green-800 disabled:opacity-50 text-white font-bold rounded transition-colors tracking-wide font-mono uppercase text-sm"
          >
            {loading ? 'Authenticating...' : isRegister ? 'Establish Profile' : 'Verify ID'}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="px-2 bg-gray-900 text-gray-400 font-mono">Or continue with</span>
          </div>
        </div>

        {/* Google Authentication */}
        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded transition-colors flex items-center justify-center gap-2 font-mono text-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google Auth
        </button>

        {/* Toggle mode links */}
        <div className="mt-6 text-center text-xs">
          <span className="text-gray-400 font-mono">
            {isRegister ? 'Already registered?' : 'Need credentials?'}
          </span>{' '}
          <button
            onClick={toggleMode}
            className="text-green-400 hover:text-green-300 font-bold transition-colors underline decoration-dotted font-mono"
          >
            {isRegister ? '[LOGIN_AGENT]' : '[CREATE_AGENT]'}
          </button>
        </div>
      </div>
    </div>
  );
}
