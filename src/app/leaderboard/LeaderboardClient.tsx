'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import Link from 'next/link';

interface GlobalPlayer {
  uid: string;
  displayName: string;
  global_score: number;
  role?: string;
}

export default function LeaderboardClient() {
  const [players, setPlayers] = useState<GlobalPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGlobalLeaderboard = async () => {
      try {
        const q = query(
          collection(db, 'users'),
          orderBy('global_score', 'desc'),
          limit(100)
        );
        const snapshot = await getDocs(q);
        
        const allUsers = snapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        })) as GlobalPlayer[];
        
        // Filter out admins and slice to top 50
        const playersOnly = allUsers
          .filter(player => player.role !== 'admin')
          .slice(0, 50);
        
        setPlayers(playersOnly);
      } catch (error) {
        console.error("Error fetching global leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGlobalLeaderboard();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl font-mono text-cyan-400">
      <h1 className="text-4xl font-bold text-white mb-8 text-center uppercase tracking-widest">&gt; GLOBAL_LEADERBOARD</h1>
      
      {loading ? (
        <p className="text-center text-cyan-600 animate-pulse">Loading top agents...</p>
      ) : (
        <div className="bg-black/60 rounded-lg overflow-hidden border border-cyan-950 shadow-2xl relative">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[size:100%_4px] pointer-events-none opacity-10"></div>
          
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-950/80 border-b border-cyan-950 text-cyan-500 text-xs tracking-wider">
                <th className="py-4 px-6 font-bold uppercase">RANK</th>
                <th className="py-4 px-6 font-bold uppercase">AGENT ID / CODENAME</th>
                <th className="py-4 px-6 font-bold text-right uppercase">SCORE</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr 
                  key={player.uid} 
                  className="border-b border-cyan-950/40 hover:bg-cyan-950/20 transition-all duration-200"
                >
                  <td className="py-4 px-6 text-cyan-600 font-mono text-sm">#{index + 1}</td>
                  <td className="py-4 px-6 font-medium text-white">
                    <Link 
                      href={`/profile/${player.uid}`}
                      className="hover:text-cyan-400 hover:underline transition-colors focus:outline-none"
                    >
                      {player.displayName}
                    </Link>
                  </td>
                  <td className="py-4 px-6 text-right text-green-400 font-bold font-mono">{player.global_score} PTS</td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-cyan-600 italic">No agent data retrieved from system.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
