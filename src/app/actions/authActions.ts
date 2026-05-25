'use server';

import { adminAuth, adminDb } from '@/lib/firebase/admin';
import * as admin from 'firebase-admin';

/**
 * Secures and synchronizes new user data from Firebase Auth into Cloud Firestore.
 * Creates a private user document and a public profile document in a single batch.
 */
export async function syncNewUser(idToken: string, username: string) {
  try {
    // 1. Cryptographically verify the ID token on the server
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email || '';

    const userRef = adminDb.collection('users').doc(uid);
    const profileRef = adminDb.collection('public_profiles').doc(uid);

    // 2. Safely inspect if the user already exists to avoid overwriting existing data (e.g. Google Auth returning users)
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      const batch = adminDb.batch();

      // a) Create private users document (sensitive info, server-controlled roles)
      batch.set(userRef, {
        email: email,
        displayName: username || 'Anonymous CTF Player',
        role: 'user',
        global_score: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // b) Create public profile document (leaderboards, public progression stats)
      batch.set(profileRef, {
        displayName: username || 'Anonymous CTF Player',
        currentLevel: 1,
        totalPoints: 0,
      });

      await batch.commit();
      return { success: true, message: 'Agent registration and profiles established successfully.' };
    } else {
      // Document already exists, but check if displayName is default/missing due to client-side context race
      const userData = userSnap.data();
      const profileSnap = await profileRef.get();
      const batch = adminDb.batch();
      let shouldCommit = false;

      // Ensure public profile exists
      if (!profileSnap.exists) {
        batch.set(profileRef, {
          displayName: username || userData?.displayName || 'Anonymous CTF Player',
          currentLevel: 1,
          totalPoints: 0,
        });
        shouldCommit = true;
      }

      // Check if we need to correct the username
      if (username && (!userData?.displayName || userData.displayName === 'Anonymous CTF Player')) {
        batch.update(userRef, {
          displayName: username
        });
        batch.set(profileRef, {
          displayName: username
        }, { merge: true });
        shouldCommit = true;
      }

      if (shouldCommit) {
        await batch.commit();
        return { success: true, message: 'Agent profile corrected and synced.' };
      }
    }

    return { success: true, message: 'Agent profiles already exist.' };
  } catch (error: any) {
    console.error("Error in syncNewUser action:", error);
    return { success: false, message: 'Internal server error during profile synchronization.' };
  }
}
