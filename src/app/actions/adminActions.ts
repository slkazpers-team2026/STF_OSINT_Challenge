'use server';

import { adminAuth, adminDb, adminFirestore } from '@/lib/firebase/admin';

/**
 * Grants the admin role to a target user using Firebase Custom Claims.
 * Only a verified admin (via the claims on their ID token) can invoke this.
 */
export async function grantAdminRole(idToken: string, targetUid: string) {
  try {
    // 1. Verify the caller's ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    // 2. Enforce authorization: Only existing admins can promote others
    if (decodedToken.role !== 'admin') {
      return { success: false, message: 'Unauthorized: Only administrators can grant admin roles.' };
    }

    // 3. Set custom user claim 'role: admin' on Firebase Auth
    await adminAuth.setCustomUserClaims(targetUid, { role: 'admin' });

    // 4. Update the Firestore user document to synchronize the role state
    const userRef = adminDb.collection('users').doc(targetUid);
    await userRef.set({ role: 'admin' }, { merge: true });

    return { success: true, message: `Successfully granted admin role to user: ${targetUid}` };
  } catch (error: any) {
    console.error("Error in grantAdminRole:", error);
    return { success: false, message: 'Server error occurred during role transition.' };
  }
}

/**
 * Retroactively awards 1000 points to creators of already-published CTF operations
 * that do not have the points_awarded flag set to true.
 */
export async function backfillRetroactiveCreatorPoints(idToken: string) {
  try {
    // 1. Verify caller's ID token and role
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (decodedToken.role !== 'admin') {
      return { success: false, message: 'Unauthorized: Admin rights required.' };
    }

    // 2. Query published CTFs
    const publishedCtfsSnap = await adminDb.collection('ctfs')
      .where('isPublished', '==', true)
      .get();

    // 3. Filter matching docs where points_awarded is false, missing, or undefined
    const pendingCtfs = publishedCtfsSnap.docs.filter(doc => {
      const data = doc.data();
      return data.points_awarded !== true;
    });

    if (pendingCtfs.length === 0) {
      return { success: true, message: 'All published operations already have points awarded.', count: 0 };
    }

    // 4. Batch update creator points and mark CTF document
    const batch = adminDb.batch();

    pendingCtfs.forEach(docSnap => {
      const data = docSnap.data();
      const creatorUid = data.creator_uid;
      
      // Update CTF doc
      batch.update(docSnap.ref, { points_awarded: true });

      // If creator_uid is present, update user's global_score
      if (creatorUid) {
        const userRef = adminDb.collection('users').doc(creatorUid);
        batch.update(userRef, {
          global_score: adminFirestore.FieldValue.increment(1000)
        });
      }
    });

    // 5. Commit
    await batch.commit();

    return { 
      success: true, 
      message: `Successfully backfilled ${pendingCtfs.length} operations. Creator scores synchronized.`, 
      count: pendingCtfs.length 
    };
  } catch (error: any) {
    console.error("Error in backfillRetroactiveCreatorPoints:", error);
    return { success: false, message: error.message || 'Server error occurred during data backfill.' };
  }
}

/**
 * Toggles the pinned status of a review document.
 * Only verified admins (either via Custom Claims role or Firestore users collection role) can call this.
 */
export async function toggleReviewPinStatus(idToken: string, reviewId: string, shouldPin: boolean) {
  try {
    // 1. Verify the caller's ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 2. Check if custom claim role is strictly admin
    let isAdmin = decodedToken.role === 'admin';

    // 3. If not, check Firestore user document role
    if (!isAdmin) {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (userDoc.exists && userDoc.data()?.role === 'admin') {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      throw new Error('Unauthorized: Admin role required.');
    }

    // 4. Update the target document in the /reviews collection by setting the field isPinned: shouldPin
    await adminDb.collection('reviews').doc(reviewId).update({
      isPinned: shouldPin
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error in toggleReviewPinStatus:", error);
    throw error;
  }
}

/**
 * Toggles the pinned status of a writeup document.
 * Only verified admins (either via Custom Claims role or Firestore users collection role) can call this.
 */
export async function toggleWriteupPinStatus(idToken: string, writeupId: string, shouldPin: boolean) {
  try {
    // 1. Verify the caller's ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 2. Check if custom claim role is strictly admin
    let isAdmin = decodedToken.role === 'admin';

    // 3. If not, check Firestore user document role
    if (!isAdmin) {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (userDoc.exists && userDoc.data()?.role === 'admin') {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      throw new Error('Unauthorized: Admin role required.');
    }

    // 4. Update the target document in the /writeups collection by setting the field isPinned: shouldPin
    await adminDb.collection('writeups').doc(writeupId).update({
      isPinned: shouldPin
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error in toggleWriteupPinStatus:", error);
    throw error;
  }
}


