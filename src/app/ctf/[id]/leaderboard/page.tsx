'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

interface CTFSubmission {
  user_id: string;
  total_score: number;
  displayName?: string;
}

export default function CTFLeaderboardPage({ params }: { params: { id: string } }) {
  const ctfId = params.id;
  const [submissions, setSubmissions] = useState<CTFSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCTFLeaderboard = async () => {
      try {
        // 1. අදාළ CTF එකට අයත් submissions ලබාගැනීම
        const q = query(
          collection(db, 'submissions'),
          where('ctf_id', '==', ctfId),
          orderBy('total_score', 'desc')
        );
        const snapshot = await getDocs(q);
        
        const subsData = snapshot.docs.map(doc => {
          const data = doc.data() as CTFSubmission;
          return {
            ...data,
            displayName: data.displayName || 'Unknown Agent'
          };
        });

        setSubmissions(subsData);
      } catch (error) {
        console.error("Error fetching CTF leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCTFLeaderboard();
  }, [ctfId]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-white mb-8 text-center">Operation Leaderboard</h1>
      
      {loading ? (
        <p className="text-center text-gray-400">Compiling intel...</p>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-700 text-gray-300">
                <th className="py-4 px-6 font-bold">Rank</th>
                <th className="py-4 px-6 font-bold">Agent Name</th>
                <th className="py-4 px-6 font-bold text-right">Operation Score</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub, index) => (
                <tr 
                  key={sub.user_id} 
                  className="border-b border-gray-700 hover:bg-gray-800 transition-colors"
                >
                  <td className="py-4 px-6 text-gray-400 font-mono">#{index + 1}</td>
                  <td className="py-4 px-6 font-medium text-white">{sub.displayName}</td>
                  <td className="py-4 px-6 text-right text-blue-400 font-bold">{sub.total_score} PTS</td>
                </tr>
              ))}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-400">No submissions yet for this operation.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}