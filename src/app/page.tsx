import { adminDb } from '@/lib/firebase/admin';
import HomeClient from './HomeClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const snapshot = await adminDb.collection('reviews').orderBy('createdAt', 'desc').get();
  
  const reviews = snapshot.docs.map(doc => {
    const data = doc.data();
    
    const createdAt = data.createdAt 
      ? {
          seconds: data.createdAt.seconds,
          nanoseconds: data.createdAt.nanoseconds
        }
      : null;

    return {
      id: doc.id,
      uid: data.uid || '',
      displayName: data.displayName || 'Unknown Officer',
      stars: data.stars || 5,
      comment: data.comment || '',
      createdAt,
      isPinned: data.isPinned || false
    };
  });

  const sortedReviews = reviews.sort((a, b) => {
    const aPinned = a.isPinned === true ? 1 : 0;
    const bPinned = b.isPinned === true ? 1 : 0;
    return bPinned - aPinned;
  });

  // Fetch challenge counts per CTF
  const challengesSnapshot = await adminDb.collection('challenges').get();
  const challengeCounts: { [ctfId: string]: number } = {};
  challengesSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const ctfId = data.ctf_id;
    if (ctfId) {
      challengeCounts[ctfId] = (challengeCounts[ctfId] || 0) + 1;
    }
  });

  return <HomeClient initialReviews={sortedReviews} challengeCounts={challengeCounts} />;
}