'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { deployChallenge, updateChallenge } from '@/app/actions/ctfActions';

interface AddChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  ctfId: string;
  onSuccess: () => void;
  challengeToEdit?: {
    id: string;
    levelId: number;
    clue: string;
    points: number;
    title: string;
    formatGuide: string;
  } | null;
}

export default function AddChallengeModal({ isOpen, onClose, ctfId, onSuccess, challengeToEdit = null }: AddChallengeModalProps) {
  const { user } = useAuth();
  
  const [levelId, setLevelId] = useState('');
  const [points, setPoints] = useState('');
  const [title, setTitle] = useState('');
  const [clue, setClue] = useState('');
  const [flag, setFlag] = useState('');
  const [formatGuide, setFormatGuide] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isEdit = !!challengeToEdit;

  // Close modal on Escape key
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

  // Reset or fill form states on toggle transitions
  useEffect(() => {
    if (isOpen) {
      if (challengeToEdit) {
        setLevelId(String(challengeToEdit.levelId || ''));
        setPoints(String(challengeToEdit.points || ''));
        setTitle(challengeToEdit.title || '');
        setClue(challengeToEdit.clue || '');
        setFlag(''); // Edit වලදී flag එක blank තබයි (keep current value)
        setFormatGuide(challengeToEdit.formatGuide || '');
      } else {
        setLevelId('');
        setPoints('');
        setTitle('');
        setClue('');
        setFlag('');
        setFormatGuide('');
      }
      setError('');
      setLoading(false);
    }
  }, [isOpen, challengeToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be authenticated to perform this operation.');
      return;
    }

    if (!levelId || !points || !title || !formatGuide) {
      setError('Required operational parameter inputs are missing.');
      return;
    }

    // අලුත් challenge එකක් හදද්දී flag එක අනිවාර්ය වේ. Edit වලදී optional වේ.
    if (!isEdit && !flag.trim()) {
      setError('Secret flag payload is required for new deployments.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const idToken = await user.getIdToken();
      
      const payload = {
        levelId: Number(levelId),
        points: Number(points),
        title: title.trim(),
        clue: clue.trim(), // Clue/Intel දැන් optional වේ
        flag: flag.trim(),
        formatGuide: formatGuide.trim()
      };

      let res;
      if (isEdit && challengeToEdit) {
        res = await updateChallenge(idToken, challengeToEdit.id, payload);
      } else {
        res = await deployChallenge(idToken, ctfId, payload);
      }

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Operation failed: Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      {/* Backdrop overlay (click outside to close) */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Modal Container */}
      <div className="relative w-full max-w-lg p-6 bg-gray-900 border border-cyan-800 rounded shadow-2xl z-10 font-mono text-cyan-400">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-cyan-600 hover:text-cyan-400 transition-colors"
          title="Abort operation (Esc)"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6 border-b border-cyan-900/60 pb-3">
          <h2 className="text-xl font-bold tracking-widest uppercase">
            {isEdit ? '> UPDATE_DEPLOYED_INTEL' : '> DEPLOY_NEW_INTEL'}
          </h2>
          <p className="text-xs text-cyan-700 mt-1">
            {isEdit ? 'Modify mission objective parameters.' : 'Specify mission objective parameters. Secret flag is isolated server-side.'}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 mb-4 text-xs bg-red-950/20 border border-red-900 text-red-500 rounded">
            <strong>[ALERT_ERR]:</strong> {error}
          </div>
        )}

        {/* Inputs Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-sm text-white">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-1">
                LEVEL ID
              </label>
              <input
                type="number"
                required
                className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm"
                placeholder="e.g. 1"
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-1">
                POINTS
              </label>
              <input
                type="number"
                required
                className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm"
                placeholder="e.g. 100"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-1">
              TITLE
            </label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm"
              placeholder="e.g. MISSION_NAME"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-1">
              CLUE/INTEL (OPTIONAL)
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm resize-none"
              placeholder="Provide optional mission briefing clues..."
              value={clue}
              onChange={(e) => setClue(e.target.value)}
            ></textarea>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-1">
              FLAG {isEdit && '(LEAVE BLANK TO KEEP CURRENT}'}
            </label>
            <input
              type="text"
              required={!isEdit}
              className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm"
              placeholder={isEdit ? "•••••••• (Keep current flag)" : "Enter the plain text flag or number"}
              value={flag}
              onChange={(e) => setFlag(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-1">
              FORMAT GUIDE
            </label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm"
              placeholder="e.g. xxxxxxxxxx or xxxxxxx@xxxxx.xxx"
              value={formatGuide}
              onChange={(e) => setFormatGuide(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700 hover:border-cyan-500 text-cyan-400 hover:text-cyan-300 font-bold rounded transition-colors tracking-wide font-mono uppercase text-xs disabled:opacity-40"
          >
            {loading ? 'PROCESSING_DEPLOYMENT...' : isEdit ? 'UPDATE_CHALLENGE_DEPLOYMENT' : 'INITIALIZE_CHALLENGE_DEPLOYMENT'}
          </button>
        </form>
      </div>
    </div>
  );
}
