'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, doc, getDoc, addDoc, serverTimestamp, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/contexts/AuthContext';
import CTFCard from '@/components/CTFCard';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toggleReviewPinStatus } from '@/app/actions/adminActions';

interface CTF {
  id: string;
  title: string;
  description: string;
  isPublished?: boolean;
  creator_uid?: string;
  creatorName?: string;
  displayName?: string;
}

interface Review {
  id: string;
  uid: string;
  displayName: string;
  stars: number;
  comment: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt: any;
  isPinned?: boolean;
}

export default function HomeClient({ 
  initialReviews, 
  challengeCounts = {} 
}: { 
  initialReviews?: Review[];
  challengeCounts?: { [ctfId: string]: number };
}) {
  const [ctfs, setCtfs] = useState<CTF[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, userData } = useAuth();
  
  // Reviews state
  const [reviews, setReviews] = useState<Review[]>(initialReviews || []);
  const [submissions, setSubmissions] = useState<{ [ctfId: string]: string[] }>({});
  const [newComment, setNewComment] = useState('');
  const [newStars, setNewStars] = useState(5);
  const [hoverStars, setHoverStars] = useState<number | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [pinningIds, setPinningIds] = useState<{ [id: string]: boolean }>({});
  const router = useRouter();

  // SITREP headlines state
  const [headlines, setHeadlines] = useState<string[]>([]);
  const [loadingHeadlines, setLoadingHeadlines] = useState(true);

  // Fetch SITREP headlines
  useEffect(() => {
    const fetchHeadlines = async () => {
      try {
        const res = await fetch('/api/sitrep');
        if (res.ok) {
          const data = await res.json();
          setHeadlines(data);
        }
      } catch (err) {
        console.error("Error fetching SITREP headlines:", err);
      } finally {
        setLoadingHeadlines(false);
      }
    };
    fetchHeadlines();
  }, []);

  useEffect(() => {
    const fetchCTFs = async () => {
      try {
        const q = query(collection(db, 'ctfs'), orderBy('created_at', 'desc'));
        const querySnapshot = await getDocs(q);
        const allCtfs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CTF[];
        
        // Gather unique creator_uids that don't have creatorName/displayName in the document
        const uidsToFetch = Array.from(new Set(
          allCtfs
            .filter(ctf => ctf.creator_uid && !ctf.creatorName && !ctf.displayName)
            .map(ctf => ctf.creator_uid)
        )) as string[];

        // Fetch display names for these uids
        const nameMap: { [uid: string]: string } = {};
        if (uidsToFetch.length > 0) {
          await Promise.all(
            uidsToFetch.map(async (uid) => {
              try {
                const userSnap = await getDoc(doc(db, 'users', uid));
                if (userSnap.exists()) {
                  nameMap[uid] = userSnap.data()?.displayName || 'Unknown Agent';
                }
              } catch (e) {
                console.error("Error fetching creator display name:", e);
              }
            })
          );
        }

        // Map resolved display names back to allCtfs
        const resolvedCtfs = allCtfs.map(ctf => {
          if (ctf.creatorName || ctf.displayName) {
            return ctf;
          }
          if (ctf.creator_uid && nameMap[ctf.creator_uid]) {
            return {
              ...ctf,
              creatorName: nameMap[ctf.creator_uid]
            };
          }
          return ctf;
        });

        // Filter out drafts unless the current user is the creator
        const visibleCtfs = resolvedCtfs.filter(ctf => 
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

  // Real-time Reviews subscription
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Review[];
      
      const sortedList = list.sort((a, b) => {
        const aPinned = a.isPinned === true ? 1 : 0;
        const bPinned = b.isPinned === true ? 1 : 0;
        return bPinned - aPinned;
      });
      
      setReviews(sortedList);
    }, (err) => {
      console.error("Error fetching reviews:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // Real-time Submissions subscription
  useEffect(() => {
    if (!user) {
      setSubmissions({});
      return;
    }
    const q = query(collection(db, 'submissions'), where('user_id', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subMap: { [ctfId: string]: string[] } = {};
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.ctf_id) {
          subMap[data.ctf_id] = data.completed_challenges || [];
        }
      });
      setSubmissions(subMap);
    }, (err) => {
      console.error("Error listening to user submissions:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // Handle Review submission
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newComment.trim()) {
      setReviewError('Please write a comment.');
      return;
    }
    setSubmittingReview(true);
    setReviewError('');
    try {
      await addDoc(collection(db, 'reviews'), {
        uid: user.uid,
        displayName: userData?.displayName || user.displayName || user.email || 'Unknown Officer',
        stars: newStars,
        comment: newComment.trim(),
        createdAt: serverTimestamp(),
        isPinned: false
      });
      setNewComment('');
      setNewStars(5);
    } catch (err) {
      console.error("Error submitting review:", err);
      setReviewError('Failed to submit feedback.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleTogglePin = async (reviewId: string, currentPinStatus: boolean) => {
    if (!user) return;
    setPinningIds(prev => ({ ...prev, [reviewId]: true }));
    try {
      const idToken = await user.getIdToken();
      await toggleReviewPinStatus(idToken, reviewId, !currentPinStatus);
      router.refresh();
    } catch (err) {
      console.error("Error toggling pin status:", err);
      alert("Failed to toggle pin status. Are you authorized?");
    } finally {
      setPinningIds(prev => ({ ...prev, [reviewId]: false }));
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Live SITREP Marquee Banner */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
      `}} />
      <div className="mb-8 bg-black border border-green-900/60 p-2.5 rounded shadow-[0_0_12px_rgba(34,197,94,0.15)] relative overflow-hidden font-mono flex items-center gap-3">
        {/* Label badge */}
        <div className="flex-shrink-0 bg-green-950/60 border border-green-500/80 px-2 py-0.5 rounded text-xs font-bold text-green-400 tracking-wider z-10 shadow-[0_0_8px_rgba(34,197,94,0.3)] select-none">
          [LIVE SITREP // CYBER_ATTACK_FEED]
        </div>

        {/* Scrolling text area */}
        <div className="relative flex-grow overflow-hidden h-8">
          <div className="absolute inset-y-0 flex items-center gap-16 whitespace-nowrap text-xl text-green-400 font-bold tracking-widest drop-shadow-[0_0_4px_rgba(74,222,128,0.4)] animate-marquee hover:[animation-play-state:paused] cursor-default">
            {loadingHeadlines ? (
              <span>GETTING LATEST INTELLIGENCE REPORTS... STREAMING ENCRYPTED DATA UPLINK...</span>
            ) : (
              // Duplicate the headlines list a few times to ensure seamless infinite scroll
              Array(3).fill(headlines).flat().map((headline, idx) => (
                <span key={idx} className="flex items-center gap-2">
                  <span className="text-red-500">⚡</span>
                  {headline}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

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
              creatorName={ctf.creatorName}
              displayName={ctf.displayName}
              creator_uid={ctf.creator_uid}
              isPublished={ctf.isPublished}
              currentUserUid={user?.uid}
              totalChallenges={challengeCounts[ctf.id] || 0}
              completedCount={submissions[ctf.id]?.length || 0}
            />
          ))}
        </div>
      )}

      {/* Public Comment Wall & Star Reviews */}
      {user && (
        <div className="mt-16 bg-gray-900 border border-gray-800 p-8 rounded-lg shadow-xl relative overflow-hidden font-mono max-w-4xl mx-auto">
          {/* Corner Bracket decorations */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-cyan-500"></div>
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-cyan-500"></div>
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-cyan-500"></div>
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-cyan-500"></div>

          <h2 className="text-xl font-bold tracking-widest text-cyan-400 mb-6 uppercase border-b border-gray-800 pb-3 flex items-center gap-2">
            <span>&gt; AGENT_FEEDBACK_WALL</span>
            <span className="text-base text-cyan-600 font-normal normal-case tracking-normal">({reviews.length} entries in registry)</span>
          </h2>

          {/* Review Submission Form */}
          <form onSubmit={handleReviewSubmit} className="space-y-4 mb-8">
            <div>
              <label className="block text-base font-bold uppercase tracking-wider text-cyan-500 mb-2">
                RATING / CREDENTIALS STRENGTH
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setNewStars(star)}
                    onMouseEnter={() => setHoverStars(star)}
                    onMouseLeave={() => setHoverStars(null)}
                    className="text-2xl transition-all duration-150 transform hover:scale-110 focus:outline-none"
                  >
                    <span className={
                      star <= (hoverStars ?? newStars)
                        ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.6)]"
                        : "text-gray-700"
                    }>
                      ★
                    </span>
                  </button>
                ))}
                <span className="text-base text-gray-400 ml-2">[{newStars} / 5 STARS]</span>
              </div>
            </div>

            <div>
              <label className="block text-base font-bold uppercase tracking-wider text-cyan-500 mb-2">
                FEEDBACK REPORT // FIELD_NOTES
              </label>
              <textarea
                rows={3}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Document your experience or report feedback to Headquarters..."
                className="w-full px-4 py-2 bg-black border border-gray-800 rounded text-cyan-400 font-mono text-base focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-cyan-900/60"
              />
            </div>

            {reviewError && (
              <p className="text-red-400 text-base">{reviewError}</p>
            )}

            <button
              type="submit"
              disabled={submittingReview}
              className="bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800 text-cyan-400 px-6 py-2 rounded text-base font-bold tracking-widest uppercase transition-colors disabled:opacity-50"
            >
              {submittingReview ? 'LOGGING_ENTRY...' : 'SUBMIT_FEEDBACK // 📡'}
            </button>
          </form>

          {/* Live Chronological Feed */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar border-t border-gray-800/60 pt-6">
            {reviews.length === 0 ? (
              <p className="text-gray-500 italic text-base">[NO_FEEDBACK_LOGS_ON_RECORD]</p>
            ) : (
              reviews.map((rev) => (
                <div 
                  key={rev.id} 
                  className={`bg-black/40 border p-4 rounded relative hover:border-gray-800 transition-all duration-300 ${
                    rev.isPinned 
                      ? 'border-green-500/60 shadow-[0_0_12px_rgba(34,197,94,0.25)]' 
                      : 'border-gray-950'
                  }`}
                >
                  {rev.isPinned && (
                    <span className="absolute top-1 right-2 text-[10px] font-mono text-green-400 select-none tracking-wider">
                      [📌 PINNED_BY_ADMIN]
                    </span>
                  )}
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-base text-green-400 flex items-center gap-2 flex-wrap">
                      <span>{rev.displayName}</span>
                      <span className="text-sm text-gray-600 font-normal">UID: {rev.uid.substring(0, 6)}...</span>
                      {userData?.role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleTogglePin(rev.id, !!rev.isPinned)}
                          disabled={pinningIds[rev.id]}
                          className="text-xs font-mono text-cyan-400 hover:text-cyan-300 disabled:opacity-50 focus:outline-none transition-colors border border-cyan-800/40 bg-cyan-950/20 px-1 py-0.5 rounded"
                        >
                          {pinningIds[rev.id] 
                            ? '[⚙️ PROCESSING...]' 
                            : rev.isPinned 
                              ? '[📍 UNPIN]' 
                              : '[📌 PIN]'}
                        </button>
                      )}
                    </div>
                    <div className="text-yellow-400 text-base">
                      {'★'.repeat(rev.stars)}{'☆'.repeat(5 - rev.stars)}
                    </div>
                  </div>
                  <p className="text-gray-300 text-base font-sans whitespace-pre-wrap">{rev.comment}</p>
                  <div className="text-sm text-gray-650 mt-2 text-right">
                    {rev.createdAt?.seconds 
                      ? new Date(rev.createdAt.seconds * 1000).toLocaleString() 
                      : 'TRANSMITTING...'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
