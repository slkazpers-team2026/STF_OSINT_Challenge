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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-6">Create New CTF Operation</h1>
      
      <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <div className="mb-4">
          <label className="block text-gray-300 font-bold mb-2" htmlFor="title">
            Operation Title
          </label>
          <input
            id="title"
            type="text"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            placeholder="e.g. Operation Dark Web"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-300 font-bold mb-2" htmlFor="description">
            Mission Briefing (Description & Links)
          </label>
          <textarea
            id="description"
            rows={6}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            placeholder="Provide the briefing and initial evidence links..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Deploying...' : 'Deploy Operation'}
        </button>
      </form>
    </div>
  );
}
