'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/contexts/AuthContext';
import CTFCard from '@/components/CTFCard';
import Link from 'next/link';

interface CTF {
  id: string;
  title: string;
  description: string;
  isPublished?: boolean;
  creator_uid?: string;
}

export default function HomeClient() {
  const [ctfs, setCtfs] = useState<CTF[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchCTFs = async () => {
      try {
        const q = query(collection(db, 'ctfs'), orderBy('created_at', 'desc'));
        const querySnapshot = await getDocs(q);
        const allCtfs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CTF[];
        
        // Filter out drafts unless the current user is the creator
        const visibleCtfs = allCtfs.filter(ctf => 
          ctf.isPublished === true || ctf.creator_uid === user?.uid
        );
        
        setCtfs(visibleCtfs);
      } catch (error) {
        console.error("Error fetching CTFs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCTFs();
  }, [user]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Active Operations (CTFs)</h1>
        
        {user && (
          <Link 
            href="/create-ctf"
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            + Create New CTF
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">Loading operations...</p>
      ) : ctfs.length === 0 ? (
        <p className="text-gray-400">No active CTFs found. Be the first to create one!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ctfs.map((ctf) => (
            <CTFCard 
              key={ctf.id} 
              id={ctf.id} 
              title={ctf.title} 
              description={ctf.description} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
