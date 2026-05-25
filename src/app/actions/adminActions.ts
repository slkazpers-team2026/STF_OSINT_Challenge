'use server';

import { adminAuth, adminDb } from '@/lib/firebase/admin';

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
