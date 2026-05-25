'use client';

import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getSafeChallenges, verifyAndSubmitFlag, deleteChallenge } from '@/app/actions/ctfActions';
import AddChallengeModal from '@/components/AddChallengeModal';

// Type definitions
interface Challenge {
  id: string;
  level_no: number;
  question: string;
  points: number;
  title: string;
  formatGuide: string;
}

export default function CTFDetailPage({ params }: { params: { id: string } }) {
  const ctfId = params.id;
  const { user, userData } = useAuth();
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ctfDetails, setCtfDetails] = useState<any>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [flagInputs, setFlagInputs] = useState<{ [key: string]: string }>({});
  const [messages, setMessages] = useState<{ [key: string]: { text: string; isError: boolean } }>({});
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [challengeToEdit, setChallengeToEdit] = useState<Challenge | null>(null);

  // Challenges list query re-extracted for fetch triggers
  const fetchChallenges = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await getSafeChallenges(idToken, ctfId);
      if (res.success) setChallenges(res.data as Challenge[]);
    } catch (error) {
      console.error("Error loading objectives:", error);
    }
  }, [ctfId, user]);

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
        const ctfRef = doc(db, 'ctfs', ctfId);
        const ctfSnap = await getDoc(ctfRef);
        if (ctfSnap.exists()) setCtfDetails(ctfSnap.data());

        // 2. Server Action එක හරහා ආරක්ෂිතව Challenges ගැනීම (Flag එක නැතුව)
        await fetchChallenges();
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ctfId, user, fetchChallenges]);

  // Flag එක Submit කිරීමේ Function එක
  const handleFlagSubmit = async (challengeId: string) => {
    if (!user) {
      alert("You must be logged in to submit a flag.");
      return;
    }

    const flagValue = flagInputs[challengeId] || '';
    if (!flagValue.trim()) return;

    try {
      // Security: Client-side එකෙන් secure ID token එකක් ලබා ගැනීම
      const idToken = await user.getIdToken(true);

      // Server Action එකට token එක සමඟ දත්ත යැවීම
      const res = await verifyAndSubmitFlag(idToken, ctfId, challengeId, flagValue.trim());
      
      setMessages({
        ...messages,
        [challengeId]: { text: res.message, isError: !res.success }
      });

      // සාර්ථක නම් input එක හිස් කිරීම
      if (res.success) {
        setFlagInputs({ ...flagInputs, [challengeId]: '' });
      }
    } catch (error) {
      console.error("Flag submission failed:", error);
      alert("Flag submission error occurred.");
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
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-4xl font-bold text-white">{ctfDetails.title}</h1>
          <a 
            href={`/ctf/${ctfId}/leaderboard`}
            className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded text-sm transition-colors border border-gray-600"
          >
            View Leaderboard
          </a>
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
          {challenges.map((challenge) => (
            <div key={challenge.id} className="bg-gray-900 p-6 rounded border border-gray-800 relative">
              {/* Inline Edit/Delete controls for Admin/Creator */}
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

              {/* Title & Level Header */}
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-cyan-400 uppercase tracking-wide">
                    Level {challenge.level_no}
                  </h3>
                  <span className="bg-cyan-950/30 text-cyan-500 text-[10px] font-bold px-2 py-0.5 rounded border border-cyan-900">
                    {challenge.points} PTS
                  </span>
                </div>
                {challenge.title && (
                  <div className="text-sm font-bold text-white uppercase tracking-wider mt-1 border-l-2 border-cyan-800 pl-2">
                    {challenge.title}
                  </div>
                )}
              </div>
              
              {/* Question/Briefing (Optional rendering) */}
              {challenge.question && (
                <p className="text-gray-300 text-sm leading-relaxed mb-6 font-sans">
                  {challenge.question}
                </p>
              )}
              
              {/* Flag Submission Area */}
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder={challenge.formatGuide || "Enter flag format e.g. STF{...}"}
                  className="w-full px-4 py-2 bg-black border border-gray-800 rounded text-green-400 font-mono text-sm focus:outline-none focus:border-green-500"
                  value={flagInputs[challenge.id] || ''}
                  onChange={(e) => setFlagInputs({ ...flagInputs, [challenge.id]: e.target.value })}
                />
                <button
                  onClick={() => handleFlagSubmit(challenge.id)}
                  className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold py-2 px-4 rounded text-xs transition-colors tracking-wider font-mono uppercase"
                >
                  SUBMIT_FLAG
                </button>
              </div>

               {/* Feedback Message */}
              {messages[challenge.id] && (
                <p className={`mt-3 font-medium text-xs ${messages[challenge.id].isError ? 'text-red-400' : 'text-green-400'}`}>
                  {messages[challenge.id].text}
                </p>
              )}
            </div>
          ))}
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
    </div>
  );
}