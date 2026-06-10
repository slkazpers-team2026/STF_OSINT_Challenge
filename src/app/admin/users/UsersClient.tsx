'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getAllUsers, 
  deleteUserByAdmin, 
  getUserChallengeDetails, 
  updateUserChallengeScore 
} from '@/app/actions/adminManagement';

interface ManagedUser {
  uid: string;
  email: string;
  role: string;
  createdAt: string | null;
  displayName: string;
  currentLevel: number;
  totalPoints: number;
  global_score?: number;
}

interface UserChallengeDetail {
  id: string;
  levelId: number;
  points: number;
  title: string;
  ctfId: string;
  ctfTitle: string;
  isSolved: boolean;
  userScore: number;
}

export default function UsersClient() {
  const { user, userData, loading: authLoading } = useAuth();
  
  // States
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sysMessage, setSysMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Edit Scores Modal State
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [challengesDetails, setChallengesDetails] = useState<UserChallengeDetail[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [scoreInputs, setScoreInputs] = useState<{ [challengeId: string]: string }>({});

  // --- Fetch Users Directory ---
  const fetchUsers = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const res = await getAllUsers(idToken);
      console.log("[UsersClient] fetchUsers response data:", res.data);
      if (res.success) {
        setUsersList(res.data);
      } else {
        setSysMessage({ text: res.message || 'Failed to fetch user directory.', isError: true });
      }
    } catch (err: any) {
      console.error(err);
      setSysMessage({ text: err.message || 'Failed to retrieve directory data.', isError: true });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user && userData?.role === 'admin') {
      fetchUsers();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, userData, authLoading, fetchUsers]);

  // --- Delete User Handler ---
  const handleDeleteUser = async (targetUid: string, displayName: string) => {
    if (!user) return;
    if (!window.confirm(`[CRITICAL WARNING]: Are you sure you want to PERMANENTLY ERASE Agent ${displayName.toUpperCase()}? This deletes their Auth account, profile data, and all CTF submissions. This action CANNOT be reversed.`)) {
      return;
    }

    try {
      setActionLoading(`delete-${targetUid}`);
      setSysMessage(null);
      const idToken = await user.getIdToken();
      const res = await deleteUserByAdmin(idToken, targetUid);

      if (res.success) {
        setSysMessage({ text: `[SUCCESS]: Agent ${displayName} has been purged from system logs.`, isError: false });
        await fetchUsers();
      } else {
        setSysMessage({ text: `[ERROR]: ${res.message}`, isError: true });
      }
    } catch (err: any) {
      setSysMessage({ text: `[SYSTEM_CRITICAL]: ${err.message}`, isError: true });
    } finally {
      setActionLoading(null);
    }
  };

  // --- Score Editor Overlay Triggers ---
  const openScoreEditor = async (targetUser: ManagedUser) => {
    if (!user) return;
    setSelectedUser(targetUser);
    setModalLoading(true);
    setModalMessage(null);
    setScoreInputs({});
    
    try {
      const idToken = await user.getIdToken();
      const res = await getUserChallengeDetails(idToken, targetUser.uid);
      if (res.success) {
        setChallengesDetails(res.data as UserChallengeDetail[]);
        
        // Initialize score input states
        const inputs: { [id: string]: string } = {};
        (res.data || []).forEach((c: any) => {
          inputs[c.id] = c.isSolved ? String(c.userScore) : '';
        });
        setScoreInputs(inputs);
      } else {
        setModalMessage({ text: res.message || 'Failed to fetch agent progress.', isError: true });
      }
    } catch (err: any) {
      setModalMessage({ text: err.message || 'Error loading challenge intelligence.', isError: true });
    } finally {
      setModalLoading(false);
    }
  };

  const closeScoreEditor = () => {
    setSelectedUser(null);
    setChallengesDetails([]);
    setModalMessage(null);
  };

  const handleUpdateScore = async (challengeId: string, originalPoints: number, isReset: boolean) => {
    if (!user || !selectedUser) return;
    
    const scoreVal = isReset ? 0 : Number(scoreInputs[challengeId]);
    if (!isReset && (isNaN(scoreVal) || scoreVal < 0)) {
      setModalMessage({ text: '[INPUT_ERROR]: Please input a valid non-negative integer score.', isError: true });
      return;
    }

    try {
      setActionLoading(`score-${challengeId}`);
      setModalMessage(null);
      const idToken = await user.getIdToken();
      const res = await updateUserChallengeScore(idToken, selectedUser.uid, challengeId, scoreVal);

      if (res.success) {
        setModalMessage({ text: `[INTEL_UPDATED]: ${res.message}`, isError: false });
        
        // Update local state details to avoid full reopen
        setChallengesDetails(prev => prev.map(c => {
          if (c.id === challengeId) {
            return {
              ...c,
              isSolved: scoreVal > 0,
              userScore: scoreVal
            };
          }
          return c;
        }));

        if (scoreVal === 0) {
          setScoreInputs(prev => ({ ...prev, [challengeId]: '' }));
        }

        // Re-fetch users list silently in background to update global scores
        const listRes = await getAllUsers(idToken);
        if (listRes.success) {
          setUsersList(listRes.data);
        }
      } else {
        setModalMessage({ text: `[ACTION_FAILED]: ${res.message}`, isError: true });
      }
    } catch (err: any) {
      setModalMessage({ text: `[CRITICAL_FAILURE]: ${err.message}`, isError: true });
    } finally {
      setActionLoading(null);
    }
  };

  // Group challenges by CTF
  const groupedChallenges = challengesDetails.reduce((groups, challenge) => {
    const groupName = challenge.ctfTitle;
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(challenge);
    return groups;
  }, {} as { [ctfTitle: string]: UserChallengeDetail[] });

  if (authLoading || (loading && usersList.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-950 text-green-400 font-mono flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-lg animate-pulse mb-4">&gt;&gt; LOGGING INTO AGENT DATABASE SYSTEM...</p>
          <div className="w-64 h-1 bg-gray-800 mx-auto overflow-hidden relative rounded">
            <div className="absolute inset-0 bg-green-500 w-1/3 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user || userData?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-950 text-red-500 font-mono flex items-center justify-center p-8">
        <div className="max-w-md p-6 bg-red-950/20 border border-red-800 rounded-lg text-center shadow-lg">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-4">[ACCESS_DENIED]</h1>
          <p className="text-sm text-gray-300 mb-6">
            Intrusion detected. Access to this subsystem is restricted to level-1 administrators.
          </p>
          <a href="/" className="inline-block px-4 py-2 bg-red-900/60 hover:bg-red-800 text-white rounded transition-colors text-sm border border-red-700">
            Exit System
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-green-500/20 pb-6 mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-widest text-green-400 flex items-center gap-2">
              <span className="animate-pulse">●</span> SECURE_AGENT_REGISTRY
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Admin administration dashboard for purging records, monitoring progress, and overriding objective marks.
            </p>
          </div>
          <div className="flex gap-2">
            <a 
              href="/admin"
              className="px-4 py-2 bg-gray-900 border border-gray-700 hover:border-gray-600 text-gray-300 font-bold rounded text-sm transition-colors flex items-center gap-1.5"
            >
              Control Center
            </a>
            <button 
              onClick={fetchUsers} 
              className="px-4 py-2 bg-gray-900 border border-green-500/30 hover:border-green-400 text-green-400 hover:text-green-300 font-bold rounded text-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
              </svg>
              REFRESH_REGISTRY
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900/60 p-6 rounded-lg border border-gray-800 shadow-lg">
            <div className="text-sm text-gray-500 uppercase tracking-widest font-bold mb-1">Total Agents</div>
            <div className="text-3xl font-bold text-white tracking-wider">{usersList.length}</div>
          </div>
          <div className="bg-gray-900/60 p-6 rounded-lg border border-gray-800 shadow-lg">
            <div className="text-sm text-gray-500 uppercase tracking-widest font-bold mb-1">System State</div>
            <div className="text-3xl font-bold text-green-400 tracking-wider flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              ACTIVE
            </div>
          </div>
          <div className="bg-gray-900/60 p-6 rounded-lg border border-gray-800 shadow-lg sm:col-span-2 lg:col-span-1">
            <div className="text-sm text-gray-500 uppercase tracking-widest font-bold mb-1">Terminal Level</div>
            <div className="text-3xl font-bold text-cyan-400 tracking-wider">ROOT_ADMIN</div>
          </div>
        </div>

        {/* Alert Messages */}
        {sysMessage && (
          <div className={`p-4 mb-8 border rounded text-base ${sysMessage.isError ? 'bg-red-950/20 border-red-800 text-red-400' : 'bg-green-950/20 border-green-800 text-green-400'}`}>
            <strong>{sysMessage.isError ? '[SYSTEM_ALERT]:' : '[INTEL_ALERT]:'}</strong> {sysMessage.text}
          </div>
        )}

        {/* User Directory Table */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-950 border-b border-gray-800 text-green-400 text-sm uppercase tracking-wider">
                  <th className="py-4 px-6 font-bold">Agent Alias / ID</th>
                  <th className="py-4 px-6 font-bold">Security Auth Role</th>
                  <th className="py-4 px-6 font-bold text-center">Score</th>
                  <th className="py-4 px-6 font-bold">Enrolled</th>
                  <th className="py-4 px-6 font-bold text-right">Operational Commands</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 text-base">
                {usersList.map((managedUser) => (
                  <tr 
                    key={managedUser.uid} 
                    className="hover:bg-gray-900/40 transition-colors border-b border-gray-800/40"
                  >
                    <td className="py-4 px-6">
                      <div className="font-bold text-white tracking-wide">{managedUser.displayName}</div>
                      <div className="text-sm text-gray-500 font-mono mt-0.5">{managedUser.email}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-0.5 rounded text-sm uppercase font-bold tracking-wider ${managedUser.role === 'admin' ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                        {managedUser.role}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center text-blue-400 font-bold font-mono">
                      {managedUser.global_score !== undefined ? managedUser.global_score : managedUser.totalPoints} PTS
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-400">
                      {managedUser.createdAt ? new Date(managedUser.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openScoreEditor(managedUser)}
                          className="px-2.5 py-1.5 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800 hover:border-cyan-600 rounded text-sm text-cyan-400 font-bold transition-colors"
                        >
                          Edit Scores
                        </button>
                        <button
                          onClick={() => handleDeleteUser(managedUser.uid, managedUser.displayName)}
                          disabled={actionLoading !== null || managedUser.uid === user.uid}
                          className="px-2.5 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/60 hover:border-red-700 rounded text-sm text-red-500 font-bold transition-colors disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {usersList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500 italic text-base">No registered agents detected.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Marks/Scores Overlay Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeScoreEditor}></div>
          <div className="relative w-full max-w-2xl p-6 bg-gray-900 border border-cyan-800 rounded shadow-2xl z-10 font-mono text-cyan-400 flex flex-col max-h-[85vh] animate-fade-in">
            {/* Modal Header */}
            <button 
              onClick={closeScoreEditor}
              className="absolute top-4 right-4 text-cyan-600 hover:text-cyan-400 transition-colors"
              title="Abort updates"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="mb-4 border-b border-cyan-900/60 pb-3">
              <h2 className="text-xl font-bold tracking-widest uppercase">&gt; OVERRIDE_MARKS_SHEET</h2>
              <p className="text-sm text-gray-400 mt-1">
                Editing points record for Agent: <span className="text-white font-bold">{selectedUser.displayName}</span>
              </p>
            </div>

            {/* Modal Alert Message */}
            {modalMessage && (
              <div className={`p-3 mb-4 border rounded text-sm ${modalMessage.isError ? 'bg-red-950/20 border-red-800 text-red-400' : 'bg-green-950/20 border-green-800 text-green-400'}`}>
                {modalMessage.text}
              </div>
            )}

            {/* Modal Body / Scrollable Content */}
            <div className="flex-grow overflow-y-auto space-y-6 pr-2">
              {modalLoading ? (
                <div className="py-12 text-center text-cyan-500 animate-pulse text-base">
                  Fetching challenge records...
                </div>
              ) : Object.keys(groupedChallenges).length === 0 ? (
                <p className="text-gray-500 italic text-center text-base py-12">No challenges deployed on the platform.</p>
              ) : (
                Object.entries(groupedChallenges).map(([ctfTitle, challenges]) => (
                  <div key={ctfTitle} className="border border-gray-800 bg-black/40 rounded p-4">
                    <h3 className="text-base font-bold text-white uppercase tracking-wider border-b border-gray-800 pb-2 mb-3">
                      Operation: {ctfTitle}
                    </h3>
                    <div className="space-y-3">
                      {challenges.map((challenge) => {
                        const isScoreOverridden = challenge.isSolved && challenge.userScore !== challenge.points;
                        return (
                          <div 
                            key={challenge.id} 
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded border border-gray-900 bg-gray-950/40 hover:bg-gray-950/80 transition-colors gap-3"
                          >
                            {/* Info Section */}
                            <div className="flex-grow min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-cyan-500 bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-900/60 uppercase">
                                  Lvl {challenge.levelId}
                                </span>
                                <span className="text-sm font-bold text-white truncate max-w-[200px]" title={challenge.title}>
                                  {challenge.title}
                                </span>
                                <span className="text-xs text-gray-500">
                                  Default: {challenge.points} PTS
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {challenge.isSolved ? (
                                  <>
                                    <span className="text-xs bg-green-950/30 text-green-500 font-bold px-1.5 rounded border border-green-900">
                                      SOLVED
                                    </span>
                                    <span className={`text-xs font-bold ${isScoreOverridden ? 'text-yellow-500' : 'text-blue-400'}`}>
                                      Current Score: {challenge.userScore} PTS {isScoreOverridden && '(OVERRIDDEN)'}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs bg-gray-800 text-gray-500 font-bold px-1.5 rounded border border-gray-700">
                                    UNSOLVED
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Override Form Panel */}
                            <div className="flex items-center gap-2 shrink-0">
                              <input 
                                type="number" 
                                placeholder={String(challenge.points)}
                                className="w-16 px-2 py-1 bg-black border border-cyan-900/80 rounded text-cyan-400 text-sm font-mono text-center focus:outline-none focus:border-cyan-500"
                                value={scoreInputs[challenge.id] !== undefined ? scoreInputs[challenge.id] : ''}
                                onChange={(e) => setScoreInputs({ ...scoreInputs, [challenge.id]: e.target.value })}
                              />
                              <button
                                onClick={() => handleUpdateScore(challenge.id, challenge.points, false)}
                                disabled={actionLoading !== null}
                                className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-900 text-cyan-400 hover:text-cyan-300 border border-cyan-800 hover:border-cyan-600 rounded text-xs font-bold uppercase transition-all disabled:opacity-30"
                              >
                                Set
                              </button>
                              {challenge.isSolved && (
                                <button
                                  onClick={() => handleUpdateScore(challenge.id, challenge.points, true)}
                                  disabled={actionLoading !== null}
                                  className="px-2 py-1 bg-red-950/20 hover:bg-red-950/40 text-red-500 hover:text-red-400 border border-red-900/50 hover:border-red-700 rounded text-xs font-bold uppercase transition-all disabled:opacity-30"
                                  title="Reset points for this challenge and relock it for user"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-6 border-t border-cyan-900/60 pt-3 flex justify-end">
              <button 
                onClick={closeScoreEditor} 
                className="px-5 py-2 bg-gray-900 border border-cyan-800 hover:border-cyan-600 text-cyan-400 hover:text-cyan-300 font-bold rounded text-sm transition-colors uppercase tracking-wider"
              >
                Close Briefing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
