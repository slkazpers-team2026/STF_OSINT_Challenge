'use server';

import { adminAuth, adminDb } from '@/lib/firebase/admin';

/**
 * Helper function to verify that the caller is an authenticated admin.
 * Throws an error if authentication fails or claims are insufficient.
 */
async function verifyAdmin(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (decodedToken.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required.');
    }
    return decodedToken;
  } catch {
    throw new Error('Unauthorized: Verification failed.');
  }
}

/**
 * Action 1: Fetches all users and their public profiles, merging them into a serializable array.
 */
export async function getAllUsers(idToken: string) {
  await verifyAdmin(idToken);

  try {
    const usersSnap = await adminDb.collection('users').get();
    const profilesSnap = await adminDb.collection('public_profiles').get();

    // Map public profiles by UID
    const profilesMap = new Map();
    profilesSnap.docs.forEach(doc => {
      profilesMap.set(doc.id, doc.data());
    });

    // Merge private account details with public profiling details
    const mergedUsers = usersSnap.docs.map(doc => {
      const userData = doc.data();
      const profileData = profilesMap.get(doc.id) || {};
      
      // Ensure createdAt is serializable (Firestore Timestamps cannot cross Server Action boundaries)
      let createdAtStr = null;
      if (userData.createdAt) {
        createdAtStr = typeof userData.createdAt.toDate === 'function'
          ? userData.createdAt.toDate().toISOString()
          : new Date(userData.createdAt).toISOString();
      }

      return {
        uid: doc.id,
        email: userData.email || 'N/A',
        role: userData.role || 'user',
        createdAt: createdAtStr,
        displayName: profileData.displayName || 'Unknown Agent',
        currentLevel: profileData.currentLevel || 1,
        totalPoints: profileData.totalPoints !== undefined ? profileData.totalPoints : (userData.global_score || 0),
      };
    });

    return { success: true, data: mergedUsers };
  } catch (error: any) {
    console.error("Error fetching all users:", error);
    return { success: false, data: [], message: error.message || 'Failed to query users.' };
  }
}

/**
 * Action 2: Resets an agent's score to 0 in both collections.
 */
export async function resetUserScore(idToken: string, targetUid: string) {
  await verifyAdmin(idToken);

  try {
    const batch = adminDb.batch();
    const userRef = adminDb.collection('users').doc(targetUid);
    const profileRef = adminDb.collection('public_profiles').doc(targetUid);

    batch.set(userRef, { global_score: 0 }, { merge: true });
    batch.set(profileRef, { totalPoints: 0 }, { merge: true });

    await batch.commit();
    return { success: true, message: 'Agent score successfully reset to 0.' };
  } catch (error: any) {
    console.error("Error resetting user score:", error);
    return { success: false, message: error.message || 'Failed to reset score.' };
  }
}

/**
 * Action 3: Deletes an agent from Firebase Auth, and deletes their Firestore data.
 */
export async function deleteUserAccount(idToken: string, targetUid: string) {
  const callerToken = await verifyAdmin(idToken);
  
  // Prevent self-deletion
  if (callerToken.uid === targetUid) {
    return { success: false, message: 'Self-deletion is prohibited.' };
  }

  try {
    // 1. Delete from Firebase Authentication
    await adminAuth.deleteUser(targetUid);

    // 2. Delete Firestore records
    const batch = adminDb.batch();
    const userRef = adminDb.collection('users').doc(targetUid);
    const profileRef = adminDb.collection('public_profiles').doc(targetUid);
    // Also delete any submissions of this user to clean up
    const submissionQuery = await adminDb.collection('submissions').where('user_id', '==', targetUid).get();

    batch.delete(userRef);
    batch.delete(profileRef);
    submissionQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    return { success: true, message: 'Agent account and data successfully erased.' };
  } catch (error: any) {
    console.error("Error deleting user account:", error);
    return { success: false, message: error.message || 'Failed to delete account.' };
  }
}

/**
 * Action 4: Toggles admin custom claim and updates the Firestore role.
 */
export async function toggleAdminRole(idToken: string, targetUid: string, makeAdmin: boolean) {
  const callerToken = await verifyAdmin(idToken);

  // Prevent revoking own admin access
  if (callerToken.uid === targetUid && !makeAdmin) {
    return { success: false, message: 'You cannot revoke your own admin rights.' };
  }

  try {
    const roleValue = makeAdmin ? 'admin' : 'user';

    // 1. Set Custom User Claim on Firebase Auth
    await adminAuth.setCustomUserClaims(targetUid, { role: roleValue });

    // 2. Update user document role
    const userRef = adminDb.collection('users').doc(targetUid);
    await userRef.set({ role: roleValue }, { merge: true });

    return { success: true, message: `Successfully updated agent role to ${roleValue.toUpperCase()}.` };
  } catch (error: any) {
    console.error("Error toggling admin role:", error);
    return { success: false, message: error.message || 'Failed to toggle admin role.' };
  }
}
