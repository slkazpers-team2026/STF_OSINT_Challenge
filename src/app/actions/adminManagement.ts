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

    console.log(`[getAllUsers] Successfully retrieved data. Users count: ${usersSnap.size}`);

    // Merge private account details with public profiling details
    const mergedUsers = usersSnap.docs.map(doc => {
      const userData = doc.data();
      
      return {
        uid: doc.id,
        email: userData.email || 'N/A',
        role: userData.role || 'user',
        createdAt: userData.createdAt ? (userData.createdAt.toDate ? userData.createdAt.toDate().toISOString() : userData.createdAt) : null,
        displayName: userData.displayName || 'Anonymous',
        currentLevel: userData.currentLevel !== undefined ? Number(userData.currentLevel) : 1,
        global_score: userData.global_score !== undefined ? Number(userData.global_score) : 0,
        totalPoints: userData.global_score !== undefined ? Number(userData.global_score) : 0,
      };
    });

    return { success: true, data: mergedUsers };
  } catch (error: any) {
    console.error("Error fetching all users in Server Action:", error.message || error);
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

/**
 * Action 5: Wrapper action to delete a user by Admin.
 */
export async function deleteUserByAdmin(adminToken: string, targetUid: string) {
  return deleteUserAccount(adminToken, targetUid);
}

/**
 * Action 6: Fetches all challenges and annotations about whether the user solved them and their scores.
 */
export async function getUserChallengeDetails(idToken: string, targetUid: string) {
  await verifyAdmin(idToken);

  try {
    // 1. Fetch all CTFs
    const ctfsSnap = await adminDb.collection('ctfs').get();
    const ctfs = ctfsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

    // 2. Fetch all challenges
    const challengesSnap = await adminDb.collection('challenges').get();
    const challenges = challengesSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        levelId: data.levelId !== undefined ? Number(data.levelId) : (data.level_no !== undefined ? Number(data.level_no) : 0),
        points: data.points !== undefined ? Number(data.points) : 0,
        title: data.title || '',
        ctf_id: data.ctf_id
      };
    }).sort((a, b) => a.levelId - b.levelId);

    // 3. Fetch user's submissions
    const submissionsSnap = await adminDb.collection('submissions').where('user_id', '==', targetUid).get();
    const submissionsMap = new Map();
    submissionsSnap.docs.forEach(doc => {
      submissionsMap.set(doc.data().ctf_id, doc.data());
    });

    // 4. Map challenges with user's solve status and score
    const challengeDetails = challenges.map(challenge => {
      const submission = submissionsMap.get(challenge.ctf_id);
      const isSolved = submission?.completed_challenges?.includes(challenge.id) || false;
      
      let userScore = 0;
      if (isSolved) {
        const scores = submission?.challenge_scores || {};
        userScore = scores[challenge.id] !== undefined ? Number(scores[challenge.id]) : challenge.points;
      }

      const ctf = ctfs.find(c => c.id === challenge.ctf_id);

      return {
        id: challenge.id,
        levelId: challenge.levelId,
        points: challenge.points,
        title: challenge.title || `Level ${challenge.levelId} Objective`,
        ctfId: challenge.ctf_id,
        ctfTitle: ctf?.title || 'Unknown Operation',
        isSolved,
        userScore
      };
    });

    return { success: true, data: challengeDetails };
  } catch (error: any) {
    console.error("Error in getUserChallengeDetails:", error);
    return { success: false, data: [], message: error.message || 'Failed to fetch user challenge details.' };
  }
}

/**
 * Action 7: Updates or resets a user's score for a specific challenge.
 */
export async function updateUserChallengeScore(
  idToken: string, 
  targetUid: string, 
  challengeId: string, 
  newScore: number
) {
  await verifyAdmin(idToken);

  try {
    // 1. Fetch challenge details to determine target CTF
    const challengeRef = adminDb.collection('challenges').doc(challengeId);
    const challengeSnap = await challengeRef.get();
    if (!challengeSnap.exists) {
      return { success: false, message: 'Challenge not found.' };
    }
    const challengeData = challengeSnap.data() || {};
    const ctfId = challengeData.ctf_id;
    if (!ctfId) {
      return { success: false, message: 'Challenge is not associated with any CTF operation.' };
    }

    // 2. Fetch all challenges of this CTF to establish default point map
    const challengesSnap = await adminDb.collection('challenges').where('ctf_id', '==', ctfId).get();
    const challengePointsMap: { [id: string]: number } = {};
    challengesSnap.docs.forEach(doc => {
      challengePointsMap[doc.id] = doc.data().points !== undefined ? Number(doc.data().points) : 0;
    });

    // 3. Fetch user's submission doc for this CTF
    const submissionRef = adminDb.collection('submissions').doc(`${targetUid}_${ctfId}`);
    const submissionSnap = await submissionRef.get();

    let completedChallenges: string[] = [];
    let challengeScores: { [id: string]: number } = {};
    let displayName = 'Unknown Agent';

    if (submissionSnap.exists) {
      const subData = submissionSnap.data() || {};
      completedChallenges = subData.completed_challenges || [];
      challengeScores = subData.challenge_scores || {};
      displayName = subData.displayName || 'Unknown Agent';
    } else {
      // Fetch target user's displayName
      const userRef = adminDb.collection('users').doc(targetUid);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        displayName = userSnap.data()?.displayName || 'Unknown Agent';
      } else {
        const profileRef = adminDb.collection('public_profiles').doc(targetUid);
        const profileSnap = await profileRef.get();
        if (profileSnap.exists) {
          displayName = profileSnap.data()?.displayName || 'Unknown Agent';
        }
      }
    }

    // Calculate score delta
    const originalCtfScore = submissionSnap.exists ? (submissionSnap.data()?.total_score || 0) : 0;

    // Update completed challenges array and custom score mapping
    if (newScore === 0) {
      // Reset: Remove from completed list and score overrides
      completedChallenges = completedChallenges.filter(id => id !== challengeId);
      delete challengeScores[challengeId];
    } else {
      // Set/Override: Ensure in completed list, and set custom score in map
      if (!completedChallenges.includes(challengeId)) {
        completedChallenges.push(challengeId);
      }
      challengeScores[challengeId] = newScore;
    }

    // Compute new total CTF score
    let newTotalScore = 0;
    completedChallenges.forEach(id => {
      const pts = challengeScores[id] !== undefined ? Number(challengeScores[id]) : (challengePointsMap[id] || 0);
      newTotalScore += pts;
    });

    const scoreDelta = newTotalScore - originalCtfScore;

    // Apply batch updates
    const batch = adminDb.batch();

    if (completedChallenges.length === 0) {
      // If no challenges remain solved, delete the submission document
      if (submissionSnap.exists) {
        batch.delete(submissionRef);
      }
    } else {
      batch.set(submissionRef, {
        user_id: targetUid,
        ctf_id: ctfId,
        displayName: displayName,
        total_score: newTotalScore,
        completed_challenges: completedChallenges,
        challenge_scores: challengeScores
      }, { merge: true });
    }

    // Update global score
    const userDocRef = adminDb.collection('users').doc(targetUid);
    const userDocSnap = await userDocRef.get();
    const currentGlobalScore = userDocSnap.exists ? (userDocSnap.data()?.global_score || 0) : 0;
    batch.set(userDocRef, {
      global_score: Math.max(0, currentGlobalScore + scoreDelta)
    }, { merge: true });

    // Update public profile score
    const profileDocRef = adminDb.collection('public_profiles').doc(targetUid);
    const profileDocSnap = await profileDocRef.get();
    const currentProfileScore = profileDocSnap.exists ? (profileDocSnap.data()?.totalPoints || 0) : 0;
    batch.set(profileDocRef, {
      totalPoints: Math.max(0, currentProfileScore + scoreDelta)
    }, { merge: true });

    await batch.commit();
    return { success: true, message: `Successfully updated score to ${newScore} PTS.` };
  } catch (error: any) {
    console.error("Error in updateUserChallengeScore action:", error);
    return { success: false, message: error.message || 'Failed to update challenge score.' };
  }
}

/**
 * Diagnostic Action: Fetches a single user document and its public profile directly and logs details.
 */
export async function debugFetchOneUser(idToken: string, targetUid: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (decodedToken.role !== 'admin') {
      return { success: false, message: 'Unauthorized: Admin access required.' };
    }

    const userDocRef = adminDb.collection('users').doc(targetUid);
    const userDocSnap = await userDocRef.get();
    const profileDocRef = adminDb.collection('public_profiles').doc(targetUid);
    const profileDocSnap = await profileDocRef.get();

    console.log(`--- [DEBUG DATA PIPELINE FOR UID: ${targetUid}] ---`);
    console.log(`User Document Exists: ${userDocSnap.exists}`);
    if (userDocSnap.exists) {
      console.log(`User Raw Data:`, JSON.stringify(userDocSnap.data()));
    }
    console.log(`Profile Document Exists: ${profileDocSnap.exists}`);
    if (profileDocSnap.exists) {
      console.log(`Profile Raw Data:`, JSON.stringify(profileDocSnap.data()));
    }
    console.log(`-------------------------------------------------`);

    return {
      success: true,
      existsInUsers: userDocSnap.exists,
      userRawData: userDocSnap.exists ? userDocSnap.data() : null,
      existsInProfiles: profileDocSnap.exists,
      profileRawData: profileDocSnap.exists ? profileDocSnap.data() : null
    };
  } catch (error: any) {
    console.error("[DEBUG SERVER ACTION ERROR]:", error);
    return { success: false, message: error.message || 'Error occurred.' };
  }
}

