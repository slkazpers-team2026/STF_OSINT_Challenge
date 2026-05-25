'use server';

import { adminAuth, adminDb } from '@/lib/firebase/admin';

/**
 * Helper to authenticate the caller as an administrator.
 */
async function verifyAdmin(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (decodedToken.role !== 'admin') {
      throw new Error('Unauthorized: Admin rights required.');
    }
    return decodedToken;
  } catch {
    throw new Error('Unauthorized: Session verification failed.');
  }
}

/**
 * Action 1: Fetches all CTF operations deployed on the platform.
 */
export async function getAllAdminCTFs(idToken: string) {
  await verifyAdmin(idToken);

  try {
    const snap = await adminDb.collection('ctfs').orderBy('created_at', 'desc').get();
    
    const ctfs = snap.docs.map(doc => {
      const data = doc.data();
      let createdAtStr = null;
      if (data.created_at) {
        createdAtStr = typeof data.created_at.toDate === 'function'
          ? data.created_at.toDate().toISOString()
          : new Date(data.created_at).toISOString();
      }

      return {
        id: doc.id,
        title: data.title || 'Untitled Mission',
        description: data.description || '',
        creator_uid: data.creator_uid || 'N/A',
        created_at: createdAtStr,
      };
    });

    return { success: true, data: ctfs };
  } catch (error: any) {
    console.error("Error fetching admin CTFs:", error);
    return { success: false, data: [], message: error.message || 'Failed to list CTFs.' };
  }
}

/**
 * Action 2: Deletes a CTF and performs a cascade delete of all its challenges.
 */
export async function adminDeleteCTF(idToken: string, ctfId: string) {
  await verifyAdmin(idToken);

  try {
    const batch = adminDb.batch();
    
    // 1. Mark CTF document for deletion
    const ctfRef = adminDb.collection('ctfs').doc(ctfId);
    batch.delete(ctfRef);

    // 2. Query and delete all challenges belonging to this CTF
    const challengesSnap = await adminDb.collection('challenges').where('ctf_id', '==', ctfId).get();
    challengesSnap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // 3. Commit batch deletion
    await batch.commit();
    
    return { success: true, message: 'CTF operation and all associated objectives erased.' };
  } catch (error: any) {
    console.error("Error deleting CTF by admin:", error);
    return { success: false, message: error.message || 'Failed to delete CTF operation.' };
  }
}
