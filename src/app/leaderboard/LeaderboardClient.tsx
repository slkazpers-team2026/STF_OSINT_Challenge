'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

interface GlobalPlayer {
  uid: string;
  displayName: string;
  global_score: number;
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
          limit(50)
        );
        const snapshot = await getDocs(q);
        
        const data = snapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        })) as GlobalPlayer[];
        
        setPlayers(data);
      } catch (error) {
        console.error("Error fetching global leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGlobalLeaderboard();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold text-white mb-8 text-center">Global Leaderboard</h1>
      
      {loading ? (
        <p className="text-center text-gray-400">Loading top agents...</p>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-950 border-b border-gray-700 text-gray-300">
                <th className="py-4 px-6 font-bold">Rank</th>
                <th className="py-4 px-6 font-bold">Agent Name</th>
                <th className="py-4 px-6 font-bold text-right">Global Points</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr 
                  key={player.uid} 
                  className="border-b border-gray-700 hover:bg-gray-800 transition-colors"
                >
                  <td className="py-4 px-6 text-gray-400 font-mono">#{index + 1}</td>
                  <td className="py-4 px-6 font-medium text-white">{player.displayName}</td>
                  <td className="py-4 px-6 text-right text-green-400 font-bold">{player.global_score}</td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-400">No data available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
