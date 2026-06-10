'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers, resetUserScore, deleteUserAccount, toggleAdminRole } from '@/app/actions/adminManagement';
import { getAllAdminCTFs, adminDeleteCTF } from '@/app/actions/adminCTFActions';

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

interface ManagedCTF {
  id: string;
  title: string;
  description: string;
  creator_uid: string;
  created_at: string | null;
}

export default function AdminClient() {
  const { user, userData, loading: authLoading } = useAuth();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'agents' | 'operations'>('agents');
  
  // Data lists
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [ctfsList, setCtfsList] = useState<ManagedCTF[]>([]);
  
  // Loading flags
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Feedback alerts
  const [sysMessage, setSysMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // --- Data Fetch Actions ---
  const fetchUsers = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const res = await getAllUsers(idToken);
      if (res.success) {
        setUsersList(res.data);
      } else {
        setSysMessage({ text: res.message || 'Failed to fetch directory.', isError: true });
      }
    } catch (err: any) {
      console.error(err);
      setSysMessage({ text: err.message || 'Failed to establish secure request session.', isError: true });
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchCTFs = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const res = await getAllAdminCTFs(idToken);
      if (res.success) {
        setCtfsList(res.data);
      } else {
        setSysMessage({ text: res.message || 'Failed to fetch operations.', isError: true });
      }
    } catch (err: any) {
      console.error(err);
      setSysMessage({ text: err.message || 'Failed to retrieve CTFs.', isError: true });
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Synchronize fetches with tabs
  useEffect(() => {
    if (!authLoading && user && userData?.role === 'admin') {
      if (activeTab === 'agents') {
        fetchUsers();
      } else {
        fetchCTFs();
      }
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, userData, authLoading, activeTab, fetchUsers, fetchCTFs]);

  if (authLoading || (loading && usersList.length === 0 && ctfsList.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-950 text-green-400 font-mono flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-lg animate-pulse mb-4">&gt;&gt; ESTABLISHING SECURE TERMINAL CONNECTION...</p>
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
          <p className="text-base text-gray-300 mb-6">
            Intrusion detected. This terminal is strictly reserved for authorized administrators. Your access attempt has been logged.
          </p>
          <a href="/" className="inline-block px-4 py-2 bg-red-900/60 hover:bg-red-800 text-white rounded transition-colors text-base border border-red-700">
            Return to Core Terminal
          </a>
        </div>
      </div>
    );
  }

  // --- Agent Handlers ---
  const handleResetScore = async (targetUid: string, displayName: string) => {
    if (!window.confirm(`[WARNING]: Are you sure you want to reset scores for Agent ${displayName.toUpperCase()} to 0?`)) {
      return;
    }

    try {
      setActionLoading(`reset-${targetUid}`);
      setSysMessage(null);
      const idToken = await user.getIdToken();
      const res = await resetUserScore(idToken, targetUid);
      
      if (res.success) {
        setSysMessage({ text: `[SUCCESS]: Score reset for ${displayName}.`, isError: false });
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

  const handleDeleteUser = async (targetUid: string, displayName: string) => {
    if (!window.confirm(`[CRITICAL WARNING]: Are you sure you want to PERMANENTLY ERASE Agent ${displayName.toUpperCase()} from system files? This deletes their Auth account, profile records, and submission logs. This action CANNOT be undone.`)) {
      return;
    }

    try {
      setActionLoading(`delete-${targetUid}`);
      setSysMessage(null);
      const idToken = await user.getIdToken();
      const res = await deleteUserAccount(idToken, targetUid);

      if (res.success) {
        setSysMessage({ text: `[SUCCESS]: Agent ${displayName} has been erased.`, isError: false });
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

  const handleToggleAdmin = async (targetUid: string, displayName: string, currentRole: string) => {
    const makeAdmin = currentRole !== 'admin';
    const actionText = makeAdmin ? 'PROMOTE to ADMIN' : 'DEMOTE to USER';
    
    if (!window.confirm(`Change access authorization for Agent ${displayName.toUpperCase()} to ${actionText.toUpperCase()}?`)) {
      return;
    }

    try {
      setActionLoading(`role-${targetUid}`);
      setSysMessage(null);
      const idToken = await user.getIdToken();
      const res = await toggleAdminRole(idToken, targetUid, makeAdmin);

      if (res.success) {
        setSysMessage({ text: `[SUCCESS]: Access cleared: ${displayName} has been modified.`, isError: false });
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

  // --- CTF Handlers ---
  const handleDeleteCTF = async (ctfId: string, title: string) => {
    if (!window.confirm(`[CRITICAL WARNING]: Are you sure you want to delete Operation "${title.toUpperCase()}" and all its deployed challenges? This cascade deletion is permanent and cannot be reversed.`)) {
      return;
    }

    try {
      setActionLoading(`ctf-${ctfId}`);
      setSysMessage(null);
      const idToken = await user.getIdToken();
      const res = await adminDeleteCTF(idToken, ctfId);

      if (res.success) {
        setSysMessage({ text: `[SUCCESS]: Operation "${title}" has been deleted.`, isError: false });
        await fetchCTFs();
      } else {
        setSysMessage({ text: `[ERROR]: ${res.message}`, isError: true });
      }
    } catch (err: any) {
      setSysMessage({ text: `[SYSTEM_CRITICAL]: ${err.message}`, isError: true });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-green-500/20 pb-6 mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-widest text-green-400 flex items-center gap-2">
              <span className="animate-pulse">●</span> ADMIN_CONTROL_CENTER
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Secure operational interface for managing intelligence agents and active operations.
            </p>
          </div>
          <button 
            onClick={activeTab === 'agents' ? fetchUsers : fetchCTFs} 
            className="px-4 py-2 bg-gray-900 border border-green-500/30 hover:border-green-400 text-green-400 hover:text-green-300 font-bold rounded text-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
            </svg>
            REFRESH_INTEL
          </button>
        </div>

        {/* Tab Selection Navigation */}
        <div className="flex gap-2 mb-6 border-b border-gray-800 pb-px">
          <button
            onClick={() => { setActiveTab('agents'); setSysMessage(null); }}
            className={`px-6 py-2.5 font-bold text-base tracking-wider transition-colors border-b-2 ${activeTab === 'agents' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            [1.0] AGENT_MANAGEMENT
          </button>
          <button
            onClick={() => { setActiveTab('operations'); setSysMessage(null); }}
            className={`px-6 py-2.5 font-bold text-base tracking-wider transition-colors border-b-2 ${activeTab === 'operations' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            [2.0] OPERATION_MANAGEMENT (CTFs)
          </button>
        </div>

        {/* System Message Banner */}
        {sysMessage && (
          <div className={`p-4 mb-6 border rounded text-base ${sysMessage.isError ? 'bg-red-950/20 border-red-800 text-red-400' : 'bg-green-950/20 border-green-800 text-green-400'}`}>
            <strong>{sysMessage.isError ? '[ALERT_ERROR]:' : '[OPERATION_SUCCESSFUL]:'}</strong> {sysMessage.text}
          </div>
        )}

        {/* Directory Tables */}
        {loading ? (
          <div className="py-12 text-center text-gray-400 animate-pulse">
            Retrieving system directory data...
          </div>
        ) : activeTab === 'agents' ? (
          /* Tab 1: Agent Management List */
          <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden shadow-2xl animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-950 border-b border-gray-800 text-green-400 text-sm uppercase tracking-wider">
                    <th className="py-4 px-6 font-bold">Agent Alias / Email</th>
                    <th className="py-4 px-6 font-bold">Access Role</th>
                    <th className="py-4 px-6 font-bold text-center">Score</th>
                    <th className="py-4 px-6 font-bold">Registered</th>
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
                        <span className={`px-2.5 py-1 rounded text-sm uppercase font-bold tracking-wider ${managedUser.role === 'admin' ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
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
                            onClick={() => handleToggleAdmin(managedUser.uid, managedUser.displayName, managedUser.role)}
                            disabled={actionLoading !== null || managedUser.uid === user.uid}
                            className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded text-sm font-bold transition-colors disabled:opacity-30"
                          >
                            {managedUser.role === 'admin' ? 'Revoke Admin' : 'Grant Admin'}
                          </button>
                          <button
                            onClick={() => handleResetScore(managedUser.uid, managedUser.displayName)}
                            disabled={actionLoading !== null}
                            className="px-2.5 py-1.5 bg-yellow-950/20 hover:bg-yellow-950/40 border border-yellow-900/60 hover:border-yellow-700 rounded text-sm font-bold text-yellow-500 transition-colors disabled:opacity-30"
                          >
                            Reset Score
                          </button>
                          <button
                            onClick={() => handleDeleteUser(managedUser.uid, managedUser.displayName)}
                            disabled={actionLoading !== null || managedUser.uid === user.uid}
                            className="px-2.5 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/60 hover:border-red-700 rounded text-sm font-bold text-red-500 transition-colors disabled:opacity-30"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {usersList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500 italic">No users found in the database.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Tab 2: CTF Operations Management List */
          <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden shadow-2xl animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-950 border-b border-gray-800 text-green-400 text-sm uppercase tracking-wider">
                    <th className="py-4 px-6 font-bold">Operation Title</th>
                    <th className="py-4 px-6 font-bold">Creator UID</th>
                    <th className="py-4 px-6 font-bold">Operation ID</th>
                    <th className="py-4 px-6 font-bold">Created Date</th>
                    <th className="py-4 px-6 font-bold text-right">Operational Commands</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 text-base">
                  {ctfsList.map((ctf) => (
                    <tr 
                      key={ctf.id} 
                      className="hover:bg-gray-900/40 transition-colors border-b border-gray-800/40"
                    >
                      <td className="py-4 px-6 font-bold text-white tracking-wide">
                        {ctf.title}
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-500 font-mono">
                        {ctf.creator_uid}
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-400 font-mono">
                        {ctf.id}
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-400">
                        {ctf.created_at ? new Date(ctf.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleDeleteCTF(ctf.id, ctf.title)}
                          disabled={actionLoading !== null}
                          className="px-2.5 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/60 hover:border-red-700 rounded text-sm font-bold text-red-500 transition-colors disabled:opacity-30 flex items-center gap-1.5 ml-auto"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Operation
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ctfsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500 italic">No CTF operations deployed on platform.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
