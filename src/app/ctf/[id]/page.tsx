'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getSafeChallenges, 
  verifyAndSubmitFlag, 
  deleteChallenge, 
  deleteCtfOperation, 
  updateCtfOperation,
  resetEntireOperationProgress,
  publishCtfOperation
} from '@/app/actions/ctfActions';
import AddChallengeModal from '@/components/AddChallengeModal';
import { useRouter } from 'next/navigation';

// Type definitions
interface Challenge {
  id: string;
  levelId: number;
  clue: string;
  points: number;
  title: string;
  formatGuide: string;
}

export default function CTFDetailPage({ params }: { params: { id: string } }) {
  const ctfId = params.id;
  const { user, userData } = useAuth();
  const router = useRouter();
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ctfDetails, setCtfDetails] = useState<any>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [solvedChallengeIds, setSolvedChallengeIds] = useState<string[]>([]);
  const [flagInputs, setFlagInputs] = useState<{ [key: string]: string }>({});
  const [messages, setMessages] = useState<{ [key: string]: { text: string; isError: boolean } }>({});
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [challengeToEdit, setChallengeToEdit] = useState<Challenge | null>(null);

  // Edit CTF state
  const [isEditCtfOpen, setIsEditCtfOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Cyberpunk flag decryption states
  const [showDecryptModal, setShowDecryptModal] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [decryptionStatus, setDecryptionStatus] = useState<'processing' | 'success' | 'failed' | null>(null);
  const [submissionResult, setSubmissionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [showFinalClearModal, setShowFinalClearModal] = useState(false);
  const [isResettingEntire, setIsResettingEntire] = useState(false);

  // Challenges list query re-extracted for fetch triggers
  const fetchChallenges = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await getSafeChallenges(idToken, ctfId);
      if (res.success) {
        setChallenges(res.data as Challenge[]);
        setSolvedChallengeIds(res.solvedChallengeIds || []);
      }
    } catch (error) {
      console.error("Error loading objectives:", error);
    }
  }, [ctfId, user]);

  const fetchCtfDetails = useCallback(async () => {
    try {
      const ctfRef = doc(db, 'ctfs', ctfId);
      const ctfSnap = await getDoc(ctfRef);
      if (ctfSnap.exists()) {
        const ctfData = ctfSnap.data();
        setCtfDetails(ctfData);
        
        if (ctfData.creator_uid && !ctfData.creatorName && !ctfData.displayName) {
          const userRef = doc(db, 'users', ctfData.creator_uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const uData = userSnap.data();
            setCtfDetails((prev: any) => ({
              ...prev,
              creatorName: uData.displayName
            }));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching CTF details:", error);
    }
  }, [ctfId]);

  // 1. Countdown timer effect: tick down every 1 second
  useEffect(() => {
    if (!showDecryptModal || countdown <= 0) return;

    const intervalId = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [showDecryptModal, countdown]);

  // 2. Synchronize decryption status change when countdown hits 0
  useEffect(() => {
    if (showDecryptModal && countdown === 0) {
      if (submissionResult) {
        if (submissionResult.success) {
          const isFinalChallenge = activeChallengeId === challenges[challenges.length - 1]?.id;
          if (isFinalChallenge) {
            // Close loading modal and show the celebration modal
            setShowDecryptModal(false);
            setShowFinalClearModal(true);

            // Execute completion logic immediately
            if (activeChallengeId) {
              setMessages((prev) => ({
                ...prev,
                [activeChallengeId]: { text: submissionResult.message, isError: false }
              }));
              setFlagInputs((prev) => ({
                ...prev,
                [activeChallengeId]: ''
              }));
              fetchChallenges();
            }

            // Reset decryption state
            setDecryptionStatus(null);
            setSubmissionResult(null);
            setActiveChallengeId(null);
          } else {
            setDecryptionStatus('success');
          }
        } else {
          setDecryptionStatus('failed');
        }
      }
    }
  }, [countdown, submissionResult, showDecryptModal, activeChallengeId, challenges, fetchChallenges]);

  // 3. Auto-dismiss after 2 seconds once decryption is 'success' or 'failed'
  useEffect(() => {
    if (decryptionStatus === 'success' || decryptionStatus === 'failed') {
      const dismissTimer = setTimeout(async () => {
        setShowDecryptModal(false);

        if (activeChallengeId && submissionResult) {
          setMessages((prev) => ({
            ...prev,
            [activeChallengeId]: { text: submissionResult.message, isError: !submissionResult.success }
          }));

          if (submissionResult.success) {
            setFlagInputs((prev) => ({
              ...prev,
              [activeChallengeId]: ''
            }));
            await fetchChallenges();
          }
        }

        setDecryptionStatus(null);
        setSubmissionResult(null);
        setActiveChallengeId(null);
      }, 2000);

      return () => clearTimeout(dismissTimer);
    }
  }, [decryptionStatus, activeChallengeId, submissionResult, fetchChallenges]);

  // CTF විස්තර සහ Challenges ලබා ගැනීම
  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // 1. Client SDK එකෙන් CTF විස්තර ගැනීම
        await fetchCtfDetails();

        // 2. Server Action එක හරහා ආරක්ෂිතව Challenges ගැනීම (Flag එක නැතුව)
        await fetchChallenges();
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ctfId, user, fetchChallenges, fetchCtfDetails]);

  // Update edit CTF form state when details are loaded
  useEffect(() => {
    if (ctfDetails) {
      setEditTitle(ctfDetails.title || '');
      setEditDescription(ctfDetails.description || '');
    }
  }, [ctfDetails]);

  // Flag එක Submit කිරීමේ Function එක (Cyberpunk Decryption Interception)
  const handleFlagSubmit = async (challengeId: string) => {
    if (!user) {
      alert("You must be logged in to submit a flag.");
      return;
    }

    const flagValue = flagInputs[challengeId] || '';
    if (!flagValue.trim()) return;

    // Immediately trigger UI modal state and start simulated countdown
    setShowDecryptModal(true);
    setCountdown(5);
    setDecryptionStatus('processing');
    setSubmissionResult(null);
    setActiveChallengeId(challengeId);

    try {
      // Fetch user ID Token
      const idToken = await user.getIdToken(true);

      // Trigger background Server Action immediately without blocking UI
      verifyAndSubmitFlag(idToken, ctfId, challengeId, flagValue.trim())
        .then((res) => {
          setSubmissionResult(res);
        })
        .catch((error) => {
          console.error("Flag submission background error:", error);
          setSubmissionResult({ success: false, message: "Flag submission error occurred." });
        });
    } catch (error) {
      console.error("Token retrieval failed:", error);
      setSubmissionResult({ success: false, message: "Authentication failure." });
    }
  };

  // Reset entire operation progress handler
  const handleResetEntireOperation = async () => {
    if (!user) {
      alert("You must be logged in to reset progress.");
      return;
    }

    if (!window.confirm("Are you sure you want to reset all progress for this operation? Your points will be deducted.")) {
      return;
    }

    try {
      setIsResettingEntire(true);
      const idToken = await user.getIdToken();
      const res = await resetEntireOperationProgress(idToken, ctfId);
      if (res.success) {
        await fetchChallenges();
        router.refresh();
      } else {
        alert(res.message);
      }
    } catch (err) {
      console.error("Error resetting entire operation progress:", err);
      alert("An error occurred during operation reset.");
    } finally {
      setIsResettingEntire(false);
    }
  };

  // Challenge deletion trigger
  const handleDeleteChallenge = async (challengeId: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this mission objective? This action is permanent and cannot be reversed.")) {
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const res = await deleteChallenge(idToken, challengeId);
      if (res.success) {
        alert(res.message);
        await fetchChallenges();
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      console.error(err);
      alert("An error occurred during objective erasure.");
    }
  };

  // CTF deletion trigger
  const handleDeleteCtf = async () => {
    if (!user) return;
    if (!window.confirm("CRITICAL WARNING: Are you sure you want to PERMANENTLY delete this CTF Operation and all of its challenge objectives and user submissions? This action is permanent and cannot be undone.")) {
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const res = await deleteCtfOperation(idToken, ctfId);
      if (res.success) {
        alert(res.message);
        router.push('/');
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      console.error(err);
      alert("An error occurred during operation erasure.");
    }
  };

  // CTF edit submission
  const handleUpdateCtf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      const res = await updateCtfOperation(idToken, ctfId, editTitle, editDescription);
      if (res.success) {
        alert(res.message);
        setIsEditCtfOpen(false);
        
        // Reload details
        await fetchCtfDetails();
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      console.error(err);
      alert("An error occurred during briefing update.");
    }
  };

  // Publish CTF Operation
  const handlePublishCtf = async () => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to PUBLISH this operation? Once published, it will be visible to all intelligence agents on the main dashboard.")) {
      return;
    }

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const res = await publishCtfOperation(idToken, ctfId);
      
      if (res.success) {
        // Reload details locally
        await fetchCtfDetails();
        alert(res.message || "Operation successfully published to registry.");
      } else {
        alert(res.message);
      }
    } catch (error: any) {
      console.error("Error publishing operation:", error);
      alert("Failed to publish operation: " + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  // Challenge edit trigger
  const handleEditClick = (challenge: Challenge) => {
    setChallengeToEdit(challenge);
    setIsAddModalOpen(true);
  };

  const handleDeployClick = () => {
    setChallengeToEdit(null);
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
    setChallengeToEdit(null);
  };

  if (loading) return <div className="p-8 text-center text-gray-400 font-mono">Loading Mission Data...</div>;
  if (!user) return <div className="p-8 text-center text-red-500 font-mono">Access Denied. Please login to view this mission.</div>;
  if (!ctfDetails) return <div className="p-8 text-center text-red-500 font-mono">Mission not found.</div>;

  const canDeploy = userData?.role === 'admin' || ctfDetails?.creator_uid === user.uid;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl font-sans">
      {/* Mission Briefing */}
      <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 mb-8 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white flex items-center gap-3">
              {ctfDetails.title}
              {!ctfDetails.isPublished && (
                <span className="bg-yellow-950/30 text-yellow-500 text-xs font-bold px-2.5 py-1 rounded border border-yellow-900 font-mono">
                  DRAFT
                </span>
              )}
            </h1>
            {(ctfDetails.creatorName || ctfDetails.displayName) && (
              <div className="text-xs text-cyan-500/70 font-mono mt-1">
                By {ctfDetails.creatorName || ctfDetails.displayName}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a 
              href={`/ctf/${ctfId}/leaderboard`}
              className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded text-sm transition-colors border border-gray-600 flex items-center justify-center"
            >
              View Leaderboard
            </a>
            <button
              onClick={handleResetEntireOperation}
              disabled={isResettingEntire}
              className="text-xs font-mono border border-red-500/30 text-red-400 bg-red-950/10 hover:bg-red-950/40 px-3 py-1.5 rounded transition-all disabled:opacity-50 flex items-center gap-1.5"
              title="Reset all progress for this operation"
            >
              {isResettingEntire ? 'RESETTING...' : 'RESET OPERATION PROGRESS // 🔄'}
            </button>
            {canDeploy && (
              <>
                {!ctfDetails.isPublished && (
                  <button
                    onClick={handlePublishCtf}
                    className="bg-green-950/40 hover:bg-green-900/60 text-green-400 hover:text-green-300 font-bold py-2 px-4 rounded text-sm transition-colors border border-green-800 flex items-center gap-1.5 font-mono"
                    title="Publish this operation to the main registry"
                  >
                    PUBLISH_OPERATION
                  </button>
                )}
                <button
                  onClick={() => setIsEditCtfOpen(true)}
                  className="bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-400 hover:text-cyan-300 font-bold py-2 px-4 rounded text-sm transition-colors border border-cyan-800 flex items-center gap-1.5 font-mono"
                  title="Edit Operation briefing parameters"
                >
                  EDIT_BRIEFING
                </button>
                <button
                  onClick={handleDeleteCtf}
                  className="bg-red-950/20 hover:bg-red-950/40 border border-red-900/60 hover:border-red-700 text-red-500 hover:text-red-400 font-bold py-2 px-4 rounded text-sm transition-colors flex items-center gap-1.5 font-mono"
                  title="Erase CTF Operation and all objectives"
                >
                  DELETE_OPERATION
                </button>
              </>
            )}
          </div>
        </div>
        <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
          {ctfDetails.description}
        </div>
      </div>

      {/* Challenges Section Header */}
      <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-2">
        <h2 className="text-2xl font-bold text-white">Mission Objectives</h2>
        {canDeploy && (
          <button
            onClick={handleDeployClick}
            className="bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-400 hover:text-cyan-300 font-bold py-1.5 px-4 rounded text-xs transition-colors border border-cyan-800 flex items-center gap-1.5 font-mono"
            title="Deploy new mission objectives to this operation"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            DEPLOY_NEW_INTEL
          </button>
        )}
      </div>
      
      {challenges.length === 0 ? (
        <p className="text-gray-400 italic font-mono">[NO_OBJECTIVES_DEPLOYED]</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono">
          {challenges.map((challenge, index) => {
            // Determine if the challenge is unlocked: First is always unlocked, N+1 unlocked only if N is solved
            const isUnlocked = index === 0 || solvedChallengeIds.includes(challenges[index - 1].id);
            const isSolved = solvedChallengeIds.includes(challenge.id);

            return (
              <div 
                key={challenge.id} 
                className={`bg-gray-900 p-6 rounded border relative flex flex-col h-full transition-all ${
                  isSolved 
                    ? 'border-green-950 shadow-lg shadow-green-950/10' 
                    : isUnlocked 
                      ? 'border-gray-800' 
                      : 'border-gray-950 opacity-40 select-none'
                }`}
              >
                {/* Inline Edit/Delete controls for Admin/Creator (visible even if locked) */}
                {canDeploy && (
                  <div className="absolute top-4 right-4 flex gap-2 z-10">
                    <button
                      onClick={() => handleEditClick(challenge)}
                      className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-cyan-400 hover:text-cyan-300 font-bold transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteChallenge(challenge.id)}
                      className="text-xs px-2.5 py-1 bg-red-950/20 hover:bg-red-950/40 border border-red-900 text-red-500 hover:text-red-400 font-bold rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}

                <div className="flex-grow">
                  {/* Title & Level Header */}
                  <div className="mb-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-cyan-400 uppercase tracking-wide">
                        Level {challenge.levelId}
                      </h3>
                      <span className="bg-cyan-950/30 text-cyan-500 text-[10px] font-bold px-2 py-0.5 rounded border border-cyan-900">
                        {challenge.points} PTS
                      </span>
                      {isSolved && (
                        <span className="bg-green-950/30 text-green-500 text-[10px] font-bold px-2 py-0.5 rounded border border-green-900 font-mono">
                          SOLVED
                        </span>
                      )}
                    </div>
                    {challenge.title && (
                      <div className="text-sm font-bold text-white uppercase tracking-wider mt-1 border-l-2 border-cyan-800 pl-2">
                        {isUnlocked ? challenge.title : '[ENCRYPTED DATA]'}
                      </div>
                    )}
                  </div>
                  
                  {/* Question/Briefing (Optional rendering) */}
                  <p className="text-gray-300 text-sm leading-relaxed mb-6 font-sans">
                    {isUnlocked 
                      ? (challenge.clue || '[NO BRIEFING PROVIDED]') 
                      : '[ENCRYPTED OPERATIONS BRIEFING - DECRYPT PREVIOUS LEVEL TO UNLOCK]'}
                  </p>
                </div>
                
                {/* Flag Submission Area */}
                <div className="flex flex-col gap-2 mt-auto pt-4">
                  <input
                    type="text"
                    disabled={!isUnlocked || isSolved}
                    placeholder={
                      isSolved 
                        ? "SOLVED" 
                        : isUnlocked 
                          ? (challenge.formatGuide || "Enter flag format e.g. STF{...}") 
                          : "LOCKED"
                    }
                    className="w-full px-4 py-2 bg-black border border-gray-800 rounded text-green-400 font-mono text-sm focus:outline-none focus:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    value={flagInputs[challenge.id] || ''}
                    onChange={(e) => setFlagInputs({ ...flagInputs, [challenge.id]: e.target.value })}
                  />
                  <button
                    onClick={() => handleFlagSubmit(challenge.id)}
                    disabled={!isUnlocked || isSolved}
                    className={`w-full font-bold py-2 px-4 rounded text-xs transition-colors tracking-wider font-mono uppercase ${
                      isSolved
                        ? 'bg-green-950/20 text-green-500 border border-green-900 cursor-not-allowed'
                        : isUnlocked 
                          ? 'bg-green-700 hover:bg-green-600 active:bg-green-800 text-white' 
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                    }`}
                  >
                    {isSolved ? 'COMPLETED' : isUnlocked ? 'SUBMIT_FLAG' : 'LOCKED'}
                  </button>
                </div>

                 {/* Feedback Message */}
                {messages[challenge.id] && (
                  <p className={`mt-3 font-medium text-xs ${messages[challenge.id].isError ? 'text-red-400' : 'text-green-400'}`}>
                    {messages[challenge.id].text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit CTF Operation Modal */}
      {isEditCtfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsEditCtfOpen(false)}></div>
          <div className="relative w-full max-w-lg p-6 bg-gray-900 border border-cyan-800 rounded shadow-2xl z-10 font-mono text-cyan-400 animate-fade-in">
            <button 
              onClick={() => setIsEditCtfOpen(false)}
              className="absolute top-4 right-4 text-cyan-600 hover:text-cyan-400 transition-colors"
              title="Abort update (Esc)"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="mb-6 border-b border-cyan-900/60 pb-3">
              <h2 className="text-xl font-bold tracking-widest uppercase">&gt; UPDATE_OPERATION_BRIEFING</h2>
              <p className="text-xs text-cyan-700 mt-1">Modify Operation core parameters.</p>
            </div>
            <form onSubmit={handleUpdateCtf} className="space-y-4 text-sm text-white">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-1">
                  OPERATION TITLE
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-1">
                  MISSION BRIEFING / DESCRIPTION
                </label>
                <textarea
                  rows={6}
                  required
                  className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm resize-none"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                ></textarea>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700 hover:border-cyan-500 text-cyan-400 hover:text-cyan-300 font-bold rounded transition-colors tracking-wide font-mono uppercase text-xs"
              >
                UPDATE_BRIEFING
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Deployment Modal Overlay */}
      <AddChallengeModal 
        isOpen={isAddModalOpen}
        onClose={handleModalClose}
        ctfId={ctfId}
        onSuccess={fetchChallenges}
        challengeToEdit={challengeToEdit}
      />

      {/* Cyberpunk Flag Decryption Modal */}
      {showDecryptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes cyber-scan {
              0% { top: 0%; }
              50% { top: 100%; }
              100% { top: 0%; }
            }
            .cyber-scan-bar {
              position: absolute;
              left: 0;
              height: 4px;
              width: 100%;
              animation: cyber-scan 3s linear infinite;
            }
            @keyframes flash-red {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
            .animate-flash-red {
              animation: flash-red 0.5s infinite;
            }
          `}} />
          <div 
            className={`relative w-full max-w-lg p-8 bg-black rounded-lg border-2 shadow-2xl z-10 font-mono text-center overflow-hidden transition-all duration-300 ${
              decryptionStatus === 'processing' 
                ? 'border-cyan-500 shadow-[0_0_25px_rgba(6,182,212,0.4)]' 
                : decryptionStatus === 'success'
                  ? 'border-green-500 shadow-[0_0_35px_rgba(34,197,94,0.5)]'
                  : 'border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.5)]'
            }`}
          >
            {/* Cyber Scan Line */}
            <div 
              className={`cyber-scan-bar ${
                decryptionStatus === 'processing' 
                  ? 'bg-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.5)]' 
                  : decryptionStatus === 'success'
                    ? 'bg-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.5)]'
                    : 'bg-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
              }`}
            />

            {/* Corner Bracket decorations */}
            <div className={`absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 ${
              decryptionStatus === 'processing' ? 'border-cyan-500' : decryptionStatus === 'success' ? 'border-green-500' : 'border-red-500'
            }`}></div>
            <div className={`absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 ${
              decryptionStatus === 'processing' ? 'border-cyan-500' : decryptionStatus === 'success' ? 'border-green-500' : 'border-red-500'
            }`}></div>
            <div className={`absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 ${
              decryptionStatus === 'processing' ? 'border-cyan-500' : decryptionStatus === 'success' ? 'border-green-500' : 'border-red-500'
            }`}></div>
            <div className={`absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 ${
              decryptionStatus === 'processing' ? 'border-cyan-500' : decryptionStatus === 'success' ? 'border-green-500' : 'border-red-500'
            }`}></div>

            <div className="relative z-10 flex flex-col items-center justify-center min-h-[220px]">
              {decryptionStatus === 'processing' && (
                <>
                  {/* Glowing spinner */}
                  <div className="w-16 h-16 border-4 border-t-cyan-500 border-r-green-500 border-b-transparent border-l-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(6,182,212,0.4)]"></div>
                  
                  <h3 className="text-lg font-bold tracking-widest text-cyan-400 mb-2 uppercase animate-pulse">
                    &gt; INTRUDING SYSTEM GATEWAY...
                  </h3>
                  
                  <div className="text-sm font-semibold tracking-wider text-green-400 drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]">
                    [DECRYPTING FLAG INTERCEPTED... {countdown}s]
                  </div>

                  {/* Simulated terminal logs */}
                  <div className="mt-6 w-full text-left bg-gray-950/80 p-3 rounded border border-cyan-950 text-[10px] text-cyan-500/70 h-20 overflow-hidden font-mono space-y-1">
                    <p className="animate-pulse">&gt; ATTACHING PROCESS TO PORT 8443...</p>
                    {countdown <= 4 && <p>&gt; BYPASSING FIREWALL CORRUPTING PACKETS...</p>}
                    {countdown <= 3 && <p className="text-green-500/70">&gt; ALIGNING CRYPTO KEYSETS OVERFLOW...</p>}
                    {countdown <= 2 && <p>&gt; DECRYPTING SHA-256 MATRIX SEGMENTS...</p>}
                    {countdown <= 1 && <p className="text-yellow-500/70">&gt; EXECUTING BUFFER DECRYPTION OVERRIDE...</p>}
                  </div>
                </>
              )}

              {decryptionStatus === 'success' && (
                <>
                  <div className="w-16 h-16 bg-green-950/30 border-2 border-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(34,197,94,0.4)]">
                    <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  
                  <h3 className="text-xl font-black tracking-widest text-green-400 uppercase drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]">
                    {"// ACCESS GRANTED //"}
                  </h3>
                  
                  <p className="text-sm font-bold text-green-400 mt-2 tracking-wider">
                    SUCCESSFUL INTRUSION.
                  </p>

                  <div className="mt-4 w-full bg-green-950/40 border border-green-800 p-2 rounded text-[10px] text-green-500">
                    {"STATUS: KEY_MATCH // RE-ROUTING TO BRIEFING"}
                  </div>
                </>
              )}

              {decryptionStatus === 'failed' && (
                <>
                  <div className="w-16 h-16 bg-red-950/30 border-2 border-red-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  
                  <h3 className="text-xl font-black tracking-widest text-red-500 uppercase drop-shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-flash-red">
                    {"// ACCESS DENIED //"}
                  </h3>
                  
                  <p className="text-sm font-bold text-red-500 mt-2 tracking-wider">
                    INVALID ENCRYPTION KEY.
                  </p>

                  <div className="mt-4 w-full bg-red-950/40 border border-red-900 p-2 rounded text-[10px] text-red-400">
                    {"STATUS: HASH_MISMATCH // COLD_REBOOTING_SEGMENT"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grand Finale Popup UI */}
      {showFinalClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-fade-in">
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes pulse-glow {
              0%, 100% {
                box-shadow: 0 0 20px rgba(34, 197, 94, 0.4), inset 0 0 15px rgba(34, 197, 94, 0.2);
              }
              50% {
                box-shadow: 0 0 40px rgba(6, 182, 212, 0.6), inset 0 0 25px rgba(6, 182, 212, 0.3);
              }
            }
            .cyber-final-modal {
              animation: pulse-glow 4s infinite alternate;
            }
            @keyframes text-glitch {
              0% { text-shadow: 2px -1px #ff00c1, -2px 1px #0ff; }
              25% { text-shadow: -2px 1px #ff00c1, 2px -1px #0ff; }
              50% { text-shadow: 2px 2px #ff00c1, -2px -2px #0ff; }
              75% { text-shadow: -2px -2px #ff00c1, 2px 2px #0ff; }
              100% { text-shadow: 2px -1px #ff00c1, -2px 1px #0ff; }
            }
            .cyber-glitch-final {
              animation: text-glitch 2s infinite steps(2);
            }
          `}} />
          <div className="relative w-full max-w-2xl p-10 bg-black rounded-lg border-2 border-green-500/80 cyber-final-modal text-center font-mono overflow-hidden">
            {/* Ambient grid background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(0,255,0,0.04),rgba(0,0,0,0),rgba(6,182,212,0.04))] bg-[size:100%_4px,3px_100%] pointer-events-none opacity-50"></div>
            
            {/* Decors */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-500"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-500"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500"></div>

            <div className="relative z-10 flex flex-col items-center">
              {/* Mission Cleared Badge / Icon */}
              <div className="w-24 h-24 bg-green-950/40 border-2 border-green-500 rounded-full flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(34,197,94,0.4)] animate-bounce-subtle">
                <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>

              {/* Glowing headers */}
              <h2 className="text-2xl md:text-3xl font-black text-green-400 uppercase tracking-widest mb-2 cyber-glitch-final drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]">
                {"[🔥 OPERATION COMPLETELY NEUTRALIZED 🔥]"}
              </h2>
              <div className="text-cyan-400 font-bold tracking-wider text-sm mb-6">
                {"// STATUS: ALL OBJECTIVES CLEARED"}
              </div>

              {/* Appreciation message */}
              <div className="bg-gray-950/90 border border-green-900/60 p-6 rounded-md mb-8 max-w-lg text-left text-xs md:text-sm leading-relaxed text-gray-300 space-y-3">
                <p className="text-green-500 font-bold">&gt; CONNECTING SECURE SATELLITE UPLINK...</p>
                <p className="text-green-400 font-bold">&gt; [SUCCESS] Congratulations Agent! You have successfully penetrated all encryption layers for this operation. The Special Task Force Cyber Security & OSINT Unit has secured the perimeter.</p>
                <p className="text-cyan-500/80">&gt; INTEL FILE DOWNLOAD COMPLETE. ENCRYPTED DATABASE PURGED.</p>
              </div>

              {/* Action Redirect Button */}
              <button
                onClick={() => {
                  setShowFinalClearModal(false);
                  router.push('/');
                }}
                className="relative group overflow-hidden bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-500 hover:to-cyan-500 text-white font-bold py-3.5 px-8 rounded border border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300 tracking-widest text-xs uppercase"
              >
                <span className="relative z-10">RETURN TO COMMAND CENTER // ⚡</span>
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 bg-gradient-to-r from-cyan-500 to-green-500 transition-transform duration-500 ease-out opacity-25"></div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}