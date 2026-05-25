'use server';

import { adminDb, adminAuth } from '@/lib/firebase/admin';

// 1. Flag එක ඉවත් කර ආරක්ෂිතව Challenges ලබා දෙන Action එක
export async function getSafeChallenges(idToken: string, ctfId: string) {
  try {
    // Token එක verify කර user කවුදැයි බැලීම
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authError) {
      console.error("Auth error in getSafeChallenges:", authError);
      return { success: false, data: [], solvedChallengeIds: [], message: 'Unauthorized: Invalid session.' };
    }

    if (!decodedToken) {
      return { success: false, data: [], solvedChallengeIds: [], message: 'Unauthorized.' };
    }

    const userId = decodedToken.uid;
    const snapshot = await adminDb.collection('challenges').where('ctf_id', '==', ctfId).get();
    
    const submissionRef = adminDb.collection('submissions').doc(`${userId}_${ctfId}`);
    const submissionSnap = await submissionRef.get();
    const completedArr = submissionSnap.exists ? (submissionSnap.data()?.completed_challenges || []) : [];

    // මෙහිදී 'flag' එක ඉවත් කර (strip out) අනිත් දත්ත පමණක් යවමු
    // Legacy fields (level_no, question) සහ modern fields (levelId, clue) දෙකම support කරයි
    const challenges = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        levelId: data.levelId !== undefined ? Number(data.levelId) : (data.level_no !== undefined ? Number(data.level_no) : 0),
        clue: data.clue !== undefined ? data.clue : (data.question || ''),
        points: data.points !== undefined ? Number(data.points) : 0,
        title: data.title || '',
        formatGuide: data.formatGuide || ''
      };
    }).sort((a, b) => a.levelId - b.levelId); // Level එක අනුව පිළිවෙලට සැකසීම

    return { success: true, data: challenges, solvedChallengeIds: completedArr };
  } catch (error) {
    console.error("Error fetching challenges:", error);
    return { success: false, data: [], solvedChallengeIds: [], message: 'Failed to load challenges' };
  }
}

// 2. Flag එක Check කර ලකුණු ලබා දෙන Action එක
export async function verifyAndSubmitFlag(idToken: string, ctfId: string, challengeId: string, submittedFlag: string) {
  try {
    // Token එක verify කර user කවුදැයි බැලීම (Spoofing වැළැක්වීම සඳහා)
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authError) {
      console.error("Auth error in verifyAndSubmitFlag:", authError);
      return { success: false, message: 'Unauthorized: Invalid session.' };
    }

    const userId = decodedToken.uid;

    // Admin SDK හරහා සැබෑ flag එක ලබාගැනීම
    const challengeRef = adminDb.collection('challenges').doc(challengeId);
    const challengeSnap = await challengeRef.get();
    
    if (!challengeSnap.exists) {
      return { success: false, message: 'Challenge not found.' };
    }
    
    const challengeData = challengeSnap.data();
    
    // Flag එක නිවැරදි දැයි පරීක්ෂා කිරීම
    // Legacy schema (ප්‍රධාන doc එකේ flag එක) සහ Secure split subcollection schema දෙකම support කරයි
    let actualFlag = challengeData?.flag;
    if (actualFlag === undefined) {
      const secretSnap = await challengeRef.collection('secrets').doc('data').get();
      if (secretSnap.exists) {
        actualFlag = secretSnap.data()?.flag;
      }
    }

    if (actualFlag !== submittedFlag) {
      return { success: false, message: 'Invalid flag. Try again!' };
    }

    // ලකුණු යාවත්කාලීන කිරීම සහ එකම ප්‍රශ්නයට දෙවරක් ලකුණු දීම වැළැක්වීම සඳහා Transaction එකක් භාවිතා කරමු
    const points = challengeData?.points || 0;
    const userRef = adminDb.collection('users').doc(userId);
    const submissionRef = adminDb.collection('submissions').doc(`${userId}_${ctfId}`);

    await adminDb.runTransaction(async (transaction) => {
      const subDoc = await transaction.get(submissionRef);
      
      // පරිශීලකයා කලින් මෙය විසඳා ඇත්දැයි බැලීම
      if (subDoc.exists && subDoc.data()?.completed_challenges?.includes(challengeId)) {
        throw new Error('ALREADY_SOLVED');
      }

      const userDoc = await transaction.get(userRef);
      const currentGlobalScore = userDoc.exists ? (userDoc.data()?.global_score || 0) : 0;
      const displayName = userDoc.exists ? (userDoc.data()?.displayName || 'Unknown Agent') : 'Unknown Agent';
      const currentCtfScore = subDoc.exists ? (subDoc.data()?.total_score || 0) : 0;
      const completedArr = subDoc.exists ? (subDoc.data()?.completed_challenges || []) : [];

      // Submissions Collection එක Update කිරීම
      transaction.set(submissionRef, {
        user_id: userId,
        ctf_id: ctfId,
        displayName: displayName,
        total_score: currentCtfScore + points,
        completed_challenges: [...completedArr, challengeId]
      }, { merge: true });

      // Users Collection එකේ Global Score එක Update කිරීම
      transaction.set(userRef, {
        global_score: currentGlobalScore + points
      }, { merge: true });
    });

    return { success: true, message: `Access Granted! You earned ${points} points.` };

  } catch (error: any) {
    if (error.message === 'ALREADY_SOLVED') {
      return { success: false, message: 'You have already solved this challenge.' };
    }
    console.error("Flag verification error:", error);
    return { success: false, message: 'Server error occurred.' };
  }
}

// 3. නව Challenge එකක් ආරක්ෂිතව Deploy කරන Action එක
export async function deployChallenge(idToken: string, ctfId: string, challengeData: {
  levelId: number;
  points: number;
  title: string;
  clue: string;
  flag: string;
  formatGuide: string;
}) {
  try {
    // Caller කවුදැයි බැලීම
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authError) {
      console.error("Auth error in deployChallenge:", authError);
      return { success: false, message: 'Unauthorized: Invalid session.' };
    }

    if (!decodedToken) {
      return { success: false, message: 'Unauthorized.' };
    }

    // CTF එකේ creator කවුදැයි බැලීම
    const ctfRef = adminDb.collection('ctfs').doc(ctfId);
    const ctfSnap = await ctfRef.get();
    
    if (!ctfSnap.exists) {
      return { success: false, message: 'CTF Operation not found.' };
    }

    const ctf = ctfSnap.data();
    const isCreator = ctf?.creator_uid === decodedToken.uid;
    const isAdmin = decodedToken.role === 'admin';

    // Admin කෙනෙක් හෝ CTF එක හැදූ කෙනා පමණක් විය යුතුයි
    if (!isAdmin && !isCreator) {
      return { success: false, message: 'Unauthorized: Only the creator or an administrator can deploy objectives.' };
    }

    // Batch එකක් මඟින් දත්ත Firestore එකට ලිවීම
    const batch = adminDb.batch();
    const newChallengeRef = adminDb.collection('challenges').doc(); // Auto-generated ID

    // a) Public document: challenges/{challengeId} (Flag එක හැර අනිත් දත්ත)
    batch.set(newChallengeRef, {
      levelId: Number(challengeData.levelId),
      level_no: Number(challengeData.levelId), // Legacy compatibility
      points: Number(challengeData.points),
      title: challengeData.title,
      clue: challengeData.clue,
      question: challengeData.clue, // Legacy compatibility
      formatGuide: challengeData.formatGuide,
      ctf_id: ctfId
    });

    // b) Secret document: challenges/{challengeId}/secrets/data (Flag එක පමණක්)
    const secretRef = newChallengeRef.collection('secrets').doc('data');
    batch.set(secretRef, {
      flag: challengeData.flag
    });

    await batch.commit();
    
    return { success: true, message: 'New mission objective successfully deployed.' };
  } catch (error) {
    console.error("Error deploying challenge:", error);
    return { success: false, message: 'Server failed to deploy challenge objective.' };
  }
}

// 4. Challenge එකක් Delete කරන Action එක
export async function deleteChallenge(idToken: string, challengeId: string) {
  try {
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authError) {
      console.error("Auth error in deleteChallenge:", authError);
      return { success: false, message: 'Unauthorized: Invalid session.' };
    }

    const challengeRef = adminDb.collection('challenges').doc(challengeId);
    const challengeSnap = await challengeRef.get();
    if (!challengeSnap.exists) {
      return { success: false, message: 'Challenge not found.' };
    }
    const challengeData = challengeSnap.data();

    // CTF එක හැදූ කෙනා හෝ Admin කෙනෙක්දැයි බැලීම
    const ctfRef = adminDb.collection('ctfs').doc(challengeData?.ctf_id);
    const ctfSnap = await ctfRef.get();
    if (!ctfSnap.exists) {
      return { success: false, message: 'Parent CTF not found.' };
    }
    const ctf = ctfSnap.data();
    const isCreator = ctf?.creator_uid === decodedToken.uid;
    const isAdmin = decodedToken.role === 'admin';

    if (!isAdmin && !isCreator) {
      return { success: false, message: 'Unauthorized: Access denied.' };
    }

    const batch = adminDb.batch();
    batch.delete(challengeRef);
    batch.delete(challengeRef.collection('secrets').doc('data'));
    await batch.commit();

    return { success: true, message: 'Challenge objective successfully deleted.' };
  } catch (error) {
    console.error("Error deleting challenge:", error);
    return { success: false, message: 'Server failed to delete challenge.' };
  }
}

// 5. Challenge එකක් Update/Edit කරන Action එක
export async function updateChallenge(
  idToken: string, 
  challengeId: string, 
  challengeData: {
    levelId: number;
    points: number;
    title: string;
    clue: string;
    flag?: string; // Edit වලදී flag එක update කිරීම optional වේ
    formatGuide: string;
  }
) {
  try {
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authError) {
      console.error("Auth error in updateChallenge:", authError);
      return { success: false, message: 'Unauthorized: Invalid session.' };
    }

    const challengeRef = adminDb.collection('challenges').doc(challengeId);
    const challengeSnap = await challengeRef.get();
    if (!challengeSnap.exists) {
      return { success: false, message: 'Challenge not found.' };
    }
    const challenge = challengeSnap.data();

    // CTF එක හැදූ කෙනා හෝ Admin කෙනෙක්දැයි බැලීම
    const ctfRef = adminDb.collection('ctfs').doc(challenge?.ctf_id);
    const ctfSnap = await ctfRef.get();
    if (!ctfSnap.exists) {
      return { success: false, message: 'Parent CTF not found.' };
    }
    const ctf = ctfSnap.data();
    const isCreator = ctf?.creator_uid === decodedToken.uid;
    const isAdmin = decodedToken.role === 'admin';

    if (!isAdmin && !isCreator) {
      return { success: false, message: 'Unauthorized: Access denied.' };
    }

    const batch = adminDb.batch();
    batch.update(challengeRef, {
      levelId: Number(challengeData.levelId),
      level_no: Number(challengeData.levelId),
      points: Number(challengeData.points),
      title: challengeData.title,
      clue: challengeData.clue,
      question: challengeData.clue,
      formatGuide: challengeData.formatGuide
    });

    // අලුත් flag එකක් ඇතුලත් කර ඇත්නම් පමණක් secrets document එක update කරයි
    if (challengeData.flag && challengeData.flag.trim() !== '') {
      const secretRef = challengeRef.collection('secrets').doc('data');
      batch.set(secretRef, {
        flag: challengeData.flag.trim()
      });
    }

    await batch.commit();

    return { success: true, message: 'Challenge objective successfully updated.' };
  } catch (error) {
    console.error("Error updating challenge:", error);
    return { success: false, message: 'Server failed to update challenge.' };
  }
}

// 6. Delete a CTF and all associated challenges, secrets, and submissions
export async function deleteCtfOperation(idToken: string, ctfId: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const isAdmin = decodedToken.role === 'admin';

    const ctfRef = adminDb.collection('ctfs').doc(ctfId);
    const ctfSnap = await ctfRef.get();
    
    if (!ctfSnap.exists) {
      return { success: false, message: 'CTF Operation not found.' };
    }

    const ctfData = ctfSnap.data();
    if (!isAdmin && ctfData?.creator_uid !== userId) {
      return { success: false, message: 'Unauthorized: Only the creator or an administrator can delete this operation.' };
    }

    const batch = adminDb.batch();
    
    // 1. Delete CTF doc
    batch.delete(ctfRef);

    // 2. Query and delete all challenges and secrets
    const challengesSnap = await adminDb.collection('challenges').where('ctf_id', '==', ctfId).get();
    for (const challengeDoc of challengesSnap.docs) {
      batch.delete(challengeDoc.ref);
      batch.delete(challengeDoc.ref.collection('secrets').doc('data'));
    }

    // 3. Query and delete all submissions
    const submissionsSnap = await adminDb.collection('submissions').where('ctf_id', '==', ctfId).get();
    for (const submissionDoc of submissionsSnap.docs) {
      batch.delete(submissionDoc.ref);
    }

    await batch.commit();
    return { success: true, message: 'CTF operation and all associated objectives successfully erased.' };
  } catch (error: any) {
    console.error("Error in deleteCtfOperation action:", error);
    return { success: false, message: error.message || 'Failed to delete CTF operation.' };
  }
}

// 7. Update CTF title and description
export async function updateCtfOperation(idToken: string, ctfId: string, title: string, description: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const isAdmin = decodedToken.role === 'admin';

    const ctfRef = adminDb.collection('ctfs').doc(ctfId);
    const ctfSnap = await ctfRef.get();
    
    if (!ctfSnap.exists) {
      return { success: false, message: 'CTF Operation not found.' };
    }

    const ctfData = ctfSnap.data();
    if (!isAdmin && ctfData?.creator_uid !== userId) {
      return { success: false, message: 'Unauthorized: Only the creator or an administrator can update this operation.' };
    }

    await ctfRef.update({
      title: title.trim(),
      description: description.trim()
    });

    return { success: true, message: 'CTF operation briefing successfully updated.' };
  } catch (error: any) {
    console.error("Error in updateCtfOperation action:", error);
    return { success: false, message: error.message || 'Failed to update CTF operation.' };
  }
}