'use server';

import { adminDb } from '@/lib/firebase/admin';

export async function getPublicProfileData(uid: string) {
  try {
    // 1. Fetch user doc
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return { success: false, message: 'Agent not found in registry.' };
    }
    
    const userData = userSnap.data() || {};
    const global_score = userData.global_score !== undefined ? Number(userData.global_score) : 0;
    
    // Security boundary: Only expose displayName, global_score, and createdAt
    let createdAtStr = null;
    if (userData.createdAt) {
      createdAtStr = typeof userData.createdAt.toDate === 'function'
        ? userData.createdAt.toDate().toISOString()
        : new Date(userData.createdAt).toISOString();
    }

    const publicProfile = {
      displayName: userData.displayName || 'Anonymous Agent',
      global_score,
      createdAt: createdAtStr,
    };

    // 2. Calculate Global Rank
    const usersSnap = await adminDb.collection('users').orderBy('global_score', 'desc').get();
    const players = usersSnap.docs
      .map(doc => ({
        uid: doc.id,
        role: doc.data().role,
        global_score: doc.data().global_score !== undefined ? Number(doc.data().global_score) : 0
      }))
      .filter(p => p.role !== 'admin');
    
    const index = players.findIndex(p => p.uid === uid);
    const globalRank = index !== -1 ? index + 1 : players.length + 1;

    // 3. Submissions data for stats & badges
    const submissionsSnap = await adminDb.collection('submissions').where('user_id', '==', uid).get();
    const submissions = submissionsSnap.docs.map(doc => doc.data());
    const operationsAttempted = submissions.length;

    // 4. Count all unique challenges completed by this user
    const completedSet = new Set<string>();
    submissions.forEach(sub => {
      const completed = sub.completed_challenges || [];
      completed.forEach((id: string) => {
        completedSet.add(id);
      });
    });
    const completedChallengesCount = completedSet.size;

    // 5. Creator parameters query
    const myCtfsSnap = await adminDb.collection('ctfs').where('creator_uid', '==', uid).get();
    const myCtfs = myCtfsSnap.docs.map(doc => doc.data());
    const myPublishedCtfs = myCtfs.filter(c => c.isPublished === true);
    const isOperationArchitect = myPublishedCtfs.length >= 3; // was 1, now 3

    let otherSubsCount = 0;
    if (myCtfs.length > 0) {
      const myCtfIds = myCtfsSnap.docs.map(doc => doc.id);
      for (const ctfId of myCtfIds) {
        const subsSnap = await adminDb.collection('submissions')
          .where('ctf_id', '==', ctfId)
          .get();
        const otherSubs = subsSnap.docs.filter(doc => doc.data().user_id !== uid);
        otherSubsCount += otherSubs.length;
      }
    }
    const isNetShaper = otherSubsCount >= 9; // was 3, now 9

    // 6. Check if they solved a final operation challenge
    const challengesSnap = await adminDb.collection('challenges').get();
    const allChallenges = challengesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    
    const ctfChallengesMap: { [ctfId: string]: any[] } = {};
    allChallenges.forEach(ch => {
      const ctfId = ch.ctf_id;
      if (ctfId) {
        if (!ctfChallengesMap[ctfId]) {
          ctfChallengesMap[ctfId] = [];
        }
        ctfChallengesMap[ctfId].push({
          id: ch.id,
          levelId: ch.levelId !== undefined ? Number(ch.levelId) : (ch.level_no !== undefined ? Number(ch.level_no) : 0)
        });
      }
    });

    const finalChallengeIds = new Set<string>();
    Object.keys(ctfChallengesMap).forEach(ctfId => {
      const sortedChallenges = ctfChallengesMap[ctfId].sort((a, b) => a.levelId - b.levelId);
      if (sortedChallenges.length > 0) {
        const finalChallenge = sortedChallenges[sortedChallenges.length - 1];
        finalChallengeIds.add(finalChallenge.id);
      }
    });

    let solvedFinalChallenge = false;
    for (const sub of submissions) {
      const completed = sub.completed_challenges || [];
      for (const challengeId of completed) {
        if (finalChallengeIds.has(challengeId)) {
          solvedFinalChallenge = true;
          break;
        }
      }
      if (solvedFinalChallenge) break;
    }

    // 7. Specialist category calculations (using keyword scanning as fallback)
    const geoKeywords = ['geo', 'location', 'map', 'satellite', 'coordinate', 'where', 'street', 'photo', 'gps', 'spot'];
    const socmintKeywords = ['socmint', 'social', 'profile', 'account', 'tweet', 'facebook', 'instagram', 'twitter', 'linkedin', 'handle', 'post', 'alias', 'username'];
    const forensicsKeywords = ['metadata', 'exif', 'forensics', 'file', 'bytes', 'hex', 'binary', 'pdf', 'image', 'jpg', 'png', 'hidden', 'embed', 'doc'];
    const easterKeywords = ['easter', 'egg', 'secret', 'bonus', 'hidden'];

    let solvedGeoCount = 0;
    let solvedSocmintCount = 0;
    let solvedForensicsCount = 0;
    let solvedEasterCount = 0;

    let totalGeo = 0;
    let totalSocmint = 0;
    let totalForensics = 0;
    let totalEaster = 0;

    allChallenges.forEach(ch => {
      const title = (ch.title || '').toLowerCase();
      const clue = (ch.clue || ch.question || '').toLowerCase();
      const isSolved = completedSet.has(ch.id);

      const isGeo = geoKeywords.some(kw => title.includes(kw) || clue.includes(kw));
      const isSocmint = socmintKeywords.some(kw => title.includes(kw) || clue.includes(kw));
      const isForensics = forensicsKeywords.some(kw => title.includes(kw) || clue.includes(kw));
      const isEaster = easterKeywords.some(kw => title.includes(kw) || clue.includes(kw));

      if (isGeo) totalGeo++;
      if (isSocmint) totalSocmint++;
      if (isForensics) totalForensics++;
      if (isEaster) totalEaster++;

      if (isSolved) {
        if (isGeo) solvedGeoCount++;
        if (isSocmint) solvedSocmintCount++;
        if (isForensics) solvedForensicsCount++;
        if (isEaster) solvedEasterCount++;
      }
    });

    const geoThreshold = totalGeo >= 15 ? 15 : Math.max(1, totalGeo);
    const socmintThreshold = totalSocmint >= 15 ? 15 : Math.max(1, totalSocmint);
    const forensicsThreshold = totalForensics >= 15 ? 15 : Math.max(1, totalForensics);
    const easterThreshold = totalEaster >= 3 ? 3 : Math.max(1, totalEaster);

    const unlockedGeo = totalGeo > 0 ? (solvedGeoCount >= geoThreshold) : (completedChallengesCount >= 15);
    const unlockedSocmint = totalSocmint > 0 ? (solvedSocmintCount >= socmintThreshold) : (completedChallengesCount >= 15);
    const unlockedForensics = totalForensics > 0 ? (solvedForensicsCount >= forensicsThreshold) : (completedChallengesCount >= 15);
    const unlockedEasterEgg = totalEaster > 0 ? (solvedEasterCount >= easterThreshold) : (global_score >= 750);

    const isIntelProvider = myCtfs.length >= 15; // was 5, now 15
    const daysDiff = createdAtStr ? ((Date.now() - new Date(createdAtStr).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    // 8. Build the boolean map payload for the 20 badges (X3 Hardcore Targets)
    const unlockedBadges: { [badgeId: string]: boolean } = {
      // Sector 01: Creator & Architect Badges
      operation_architect: isOperationArchitect,
      net_shaper: isNetShaper,
      masters_maze: isOperationArchitect && isNetShaper && myPublishedCtfs.length >= 3,
      intel_provider: isIntelProvider,

      // Sector 02: Elite Score & Ranking Badges
      elite_intruder: global_score >= 3000,
      ghost_in_the_shell: global_score >= 9000,
      god_mode: global_score >= 15000,
      binary_vanguard: globalRank === 1 && daysDiff >= 21,

      // Sector 03: Tactical & Speed Badges
      first_blood: completedChallengesCount >= 3 && (global_score >= 300 || uid.charCodeAt(0) % 2 === 0),
      blitz_intrusion: completedChallengesCount >= 6,
      overclock: completedChallengesCount >= 9 && global_score >= 600,
      zero_day_hunter: solvedFinalChallenge && completedChallengesCount >= 12 && global_score >= 1200,

      // Sector 04: Grind & Replay Badges
      replay_master: completedChallengesCount >= 9 && global_score >= 450,
      terminal_addict: daysDiff >= 21,
      brute_forcer: completedChallengesCount >= 12,

      // Sector 05: Specialist Investigation Badges
      geo_tracker: unlockedGeo,
      shadow_stalker: unlockedSocmint,
      metadata_expert: unlockedForensics,
      deep_diver: unlockedEasterEgg,
    };

    // STF_COMMANDER requires all other 19 badges to be unlocked
    const other19Keys = Object.keys(unlockedBadges);
    const allOtherUnlocked = other19Keys.every(key => unlockedBadges[key]);
    unlockedBadges['stf_commander'] = allOtherUnlocked;

    return {
      success: true,
      data: {
        profile: publicProfile,
        globalRank,
        operationsAttempted,
        unlockedBadges
      }
    };
  } catch (error: any) {
    console.error("Error fetching public profile:", error);
    return { success: false, message: error.message || 'Failed to retrieve agent intelligence file.' };
  }
}
