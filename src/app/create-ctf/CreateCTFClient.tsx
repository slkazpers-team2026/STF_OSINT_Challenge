'use client';

import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function CreateCTFClient() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) return <p className="p-8 text-center text-gray-400">Loading...</p>;
  if (!user) return <p className="p-8 text-center text-red-500">Access Denied. Please login to create a CTF.</p>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;

    setIsSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'ctfs'), {
        title,
        description,
        creator_uid: user.uid,
        created_at: serverTimestamp(),
        isPublished: false,
      });
      
      router.push(`/ctf/${docRef.id}`);
    } catch (error) {
      console.error("Error creating CTF:", error);
      alert("Failed to create CTF.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 font-mono text-cyan-400">
      <h1 className="text-3xl font-bold tracking-widest text-white mb-6 uppercase">&gt; CREATE_NEW_CTF_OPERATION</h1>
      
      <form onSubmit={handleSubmit} className="bg-gray-900 p-6 rounded border border-cyan-900 shadow-2xl">
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-2" htmlFor="title">
            OPERATION TITLE
          </label>
          <input
            id="title"
            type="text"
            className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm"
            placeholder="e.g. OPERATION_DARK_WEB"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider text-cyan-500 mb-2" htmlFor="description">
            MISSION BRIEFING (DESCRIPTION & LINKS)
          </label>
          <textarea
            id="description"
            rows={6}
            className="w-full px-3 py-2 bg-black border border-cyan-900 rounded text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono text-sm resize-none"
            placeholder="Provide operational briefing coordinates and initial evidence links..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700 hover:border-cyan-500 text-cyan-400 font-bold rounded transition-colors tracking-wide font-mono uppercase text-sm disabled:opacity-40"
        >
          {isSubmitting ? 'DEPLOYING_OPERATION...' : 'INITIALIZE_CTF_DEPLOYMENT'}
        </button>
      </form>
    </div>
  );
}
