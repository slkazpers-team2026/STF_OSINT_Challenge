'use client';

import { useEffect, useState } from 'react';
import { getPublicProfileData } from '@/app/actions/profileActions';
import Link from 'next/link';

interface ProfileData {
  profile: {
    displayName: string;
    global_score: number;
    createdAt: string | null;
  };
  globalRank: number;
  operationsAttempted: number;
  unlockedBadges: { [badgeId: string]: boolean };
}

export default function ProfileClient({ uid }: { uid: string }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await getPublicProfileData(uid);
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError(res.message || 'Failed to load agent file.');
        }
      } catch (err) {
        console.error("Error loading public profile Client:", err);
        setError('Error establishing database link.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [uid]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center font-mono text-cyan-400">
        <div className="inline-block w-16 h-16 border-4 border-t-cyan-500 border-r-cyan-500/30 border-b-transparent border-l-transparent rounded-full animate-spin mb-4"></div>
        <p className="tracking-widest uppercase animate-pulse">&gt; QUERYING_AGENT_INTEL_FILES...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-16 text-center font-mono text-red-500 max-w-md border border-red-900 bg-red-950/20 rounded p-6">
        <h1 className="text-xl font-bold uppercase tracking-widest mb-4">{"Error // Access Denied"}</h1>
        <p className="text-sm text-red-400 mb-6">{error || 'Agent record not found in system database.'}</p>
        <Link 
          href="/leaderboard"
          className="inline-block bg-red-950/40 hover:bg-red-900/60 border border-red-700 text-red-400 px-4 py-2 rounded text-sm transition-colors uppercase tracking-wider"
        >
          Return to Leaderboard
        </Link>
      </div>
    );
  }

  const { profile, globalRank, operationsAttempted, unlockedBadges } = data;

  const sectors = [
    {
      name: 'Sector 01: Creator & Architect Badges',
      colorClass: 'text-cyan-400',
      badges: [
        {
          id: 'operation_architect',
          name: 'OPERATION_ARCHITECT',
          requirement: '3 Published CTFs',
          unlocked: !!unlockedBadges.operation_architect,
          description: 'Deployed 3 validated CTF operations for public agents.',
          glowClass: 'border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.4)] text-cyan-400 bg-cyan-950/20',
          corruptText: '🔒 REQ: 3_PUBLISHED_CTFS'
        },
        {
          id: 'net_shaper',
          name: 'NET_SHAPER',
          requirement: '9 completions by others',
          unlocked: !!unlockedBadges.net_shaper,
          description: 'Constructed networks completed 9+ times by other intelligence units.',
          glowClass: 'border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.4)] text-cyan-400 bg-cyan-950/20',
          corruptText: '🔒 REQ: 9_CTF_COMPLETIONS_BY_OTHERS'
        },
        {
          id: 'masters_maze',
          name: 'MASTERS_MAZE',
          requirement: '3 challenges with >80% fail rate',
          unlocked: !!unlockedBadges.masters_maze,
          description: 'Designed 3+ systems maintaining trace difficulty exceeding 80% fail rates.',
          glowClass: 'border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.4)] text-cyan-400 bg-cyan-950/20',
          corruptText: '🔒 REQ: 3_MAZES_SOLVED_EXCEEDING_80%_FAIL'
        },
        {
          id: 'intel_provider',
          name: 'INTEL_PROVIDER',
          requirement: '15 Created operations',
          unlocked: !!unlockedBadges.intel_provider,
          description: 'Provided 15+ distinct deployment missions to the registry.',
          glowClass: 'border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.4)] text-cyan-400 bg-cyan-950/20',
          corruptText: '🔒 REQ: 15_CREATED_OPERATIONS'
        }
      ]
    },
    {
      name: 'Sector 02: Elite Score & Ranking Badges',
      colorClass: 'text-red-400',
      badges: [
        {
          id: 'elite_intruder',
          name: 'ELITE_INTRUDER',
          requirement: '3,000+ points',
          unlocked: !!unlockedBadges.elite_intruder,
          description: 'Crossed the 3,000 global score mark. Professional level intrusion.',
          glowClass: 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)] text-red-400 bg-red-950/20',
          corruptText: '🔒 REQ: 3,000_GLOBAL_PTS'
        },
        {
          id: 'ghost_in_the_shell',
          name: 'GHOST_IN_THE_SHELL',
          requirement: '9,000+ points',
          unlocked: !!unlockedBadges.ghost_in_the_shell,
          description: 'Crossed the 9,000 global score mark. Fully integrated netrunner.',
          glowClass: 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)] text-red-400 bg-red-950/20',
          corruptText: '🔒 REQ: 9,000_GLOBAL_PTS'
        },
        {
          id: 'god_mode',
          name: 'GOD_MODE',
          requirement: '15,000+ points',
          unlocked: !!unlockedBadges.god_mode,
          description: 'Crossed the 15,000 global score mark. Complete protocol override status.',
          glowClass: 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)] text-red-400 bg-red-950/20',
          corruptText: '🔒 REQ: 15,000_GLOBAL_PTS'
        },
        {
          id: 'binary_vanguard',
          name: 'BINARY_VANGUARD',
          requirement: 'Rank #1 for 21 days',
          unlocked: !!unlockedBadges.binary_vanguard,
          description: 'Maintained the #1 global leaderboard rank for 21 consecutive days.',
          glowClass: 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)] text-red-400 bg-red-950/20',
          corruptText: '🔒 REQ: GLOBAL_RANK_#1_FOR_21_DAYS'
        }
      ]
    },
    {
      name: 'Sector 03: Tactical & Speed Badges',
      colorClass: 'text-amber-400',
      badges: [
        {
          id: 'first_blood',
          name: 'FIRST_BLOOD',
          requirement: 'First solve on 3 objectives',
          unlocked: !!unlockedBadges.first_blood,
          description: 'Secured the first valid solve on 3 separate mission objectives.',
          glowClass: 'border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)] text-amber-400 bg-amber-950/20',
          corruptText: '🔒 REQ: FIRST_VALID_SOLVE_ON_3_OBJECTIVES'
        },
        {
          id: 'blitz_intrusion',
          name: 'BLITZ_INTRUSION',
          requirement: '3 Solves within 60s',
          unlocked: !!unlockedBadges.blitz_intrusion,
          description: 'Cracked 3 security barriers in less than 60 seconds from intercept.',
          glowClass: 'border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)] text-amber-400 bg-amber-950/20',
          corruptText: '🔒 REQ: 3_SOLVES_<_60_SEC'
        },
        {
          id: 'overclock',
          name: 'OVERCLOCK',
          requirement: '15 streak, 0 failures',
          unlocked: !!unlockedBadges.overclock,
          description: 'Cleared 15 levels consecutively with exactly zero system failures.',
          glowClass: 'border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)] text-amber-400 bg-amber-950/20',
          corruptText: '🔒 REQ: 15_STREAK_0_ERR'
        },
        {
          id: 'zero_day_hunter',
          name: 'ZERO_DAY_HUNTER',
          requirement: 'Clear 3 ops in 24h',
          unlocked: !!unlockedBadges.zero_day_hunter,
          description: 'Solved 3 entire operations within 24 hours of initialization.',
          glowClass: 'border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)] text-amber-400 bg-amber-950/20',
          corruptText: '🔒 REQ: 3_OPS_CLEARED_<_24_HOURS'
        }
      ]
    },
    {
      name: 'Sector 04: Grind & Replay Badges',
      colorClass: 'text-indigo-400',
      badges: [
        {
          id: 'replay_master',
          name: 'REPLAY_MASTER',
          requirement: '9 Operation resets',
          unlocked: !!unlockedBadges.replay_master,
          description: 'Re-ran and re-cleared operational structures 9+ times.',
          glowClass: 'border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.4)] text-indigo-400 bg-indigo-950/20',
          corruptText: '🔒 REQ: 9_OP_RESETS'
        },
        {
          id: 'terminal_addict',
          name: 'TERMINAL_ADDICT',
          requirement: '21 days active correct submissions',
          unlocked: !!unlockedBadges.terminal_addict,
          description: 'Maintained active correct submissions over 21 consecutive days.',
          glowClass: 'border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.4)] text-indigo-400 bg-indigo-950/20',
          corruptText: '🔒 REQ: 21_DAYS_ACTIVE'
        },
        {
          id: 'brute_forcer',
          name: 'BRUTE_FORCER',
          requirement: 'Solve after 60+ attempts',
          unlocked: !!unlockedBadges.brute_forcer,
          description: 'Overwhelmed cryptographic gates via brute force (60+ attempts).',
          glowClass: 'border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.4)] text-indigo-400 bg-indigo-950/20',
          corruptText: '🔒 REQ: 60+_ATTEMPTS_SOLVE'
        }
      ]
    },
    {
      name: 'Sector 05: Specialist Investigation Badges',
      colorClass: 'text-green-400',
      badges: [
        {
          id: 'geo_tracker',
          name: 'GEO_TRACKER',
          requirement: '15 Geolocation solves',
          unlocked: !!unlockedBadges.geo_tracker,
          description: 'Solved 15+ Geolocation-based objectives using visual intelligence.',
          glowClass: 'border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)] text-green-400 bg-green-950/20',
          corruptText: '🔒 REQ: 15_GEOLOCATION_SOLVES'
        },
        {
          id: 'shadow_stalker',
          name: 'SHADOW_STALKER',
          requirement: '15 SOCMINT solves',
          unlocked: !!unlockedBadges.shadow_stalker,
          description: 'Solved 15+ SOCMINT-based social intelligence objectives.',
          glowClass: 'border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)] text-green-400 bg-green-950/20',
          corruptText: '🔒 REQ: 15_SOCMINT_SOLVES'
        },
        {
          id: 'metadata_expert',
          name: 'METADATA_EXPERT',
          requirement: '15 Metadata solves',
          unlocked: !!unlockedBadges.metadata_expert,
          description: 'Solved 15+ Metadata or file forensics objectives.',
          glowClass: 'border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)] text-green-400 bg-green-950/20',
          corruptText: '🔒 REQ: 15_METADATA_SOLVES'
        },
        {
          id: 'deep_diver',
          name: 'DEEP_DIVER',
          requirement: 'Uncover 3 Easter Eggs',
          unlocked: !!unlockedBadges.deep_diver,
          description: 'Discovered 3 hidden Easter Egg payloads inside the registry.',
          glowClass: 'border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)] text-green-400 bg-green-950/20',
          corruptText: '🔒 REQ: UNCOVER_3_EASTER_EGGS'
        },
        {
          id: 'stf_commander',
          name: 'STF_COMMANDER',
          requirement: 'All 19 badges unlocked',
          unlocked: !!unlockedBadges.stf_commander,
          description: 'Supreme Commander status. Complete mastery of the OSINT registry.',
          glowClass: 'border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)] text-pink-400 bg-pink-950/20 animate-pulse',
          corruptText: '🔒 REQ: 100%_ACHIEVEMENTS'
        }
      ]
    }
  ];

  let badgesEarnedCount = 0;
  Object.keys(unlockedBadges).forEach(key => {
    if (unlockedBadges[key]) badgesEarnedCount++;
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl font-mono text-cyan-400 relative">
      {/* Scanline background decoration */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[size:100%_4px] pointer-events-none opacity-20"></div>

      <div className="mb-6">
        <Link 
          href="/leaderboard" 
          className="text-xs text-cyan-600 hover:text-cyan-400 transition-colors uppercase tracking-wider flex items-center gap-1.5"
        >
          &lt; return_to_leaderboard
        </Link>
      </div>

      {/* Main Terminal Header */}
      <div className="bg-black/80 border border-cyan-950 rounded-lg p-6 mb-8 relative overflow-hidden shadow-2xl">
        {/* Glow corner accents */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-500"></div>
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-500"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-500"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-500"></div>
        
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 relative z-10">
          {/* Avatar Graphic */}
          <div className="w-24 h-24 rounded border border-cyan-500/50 bg-cyan-950/10 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0">
            <svg className="w-14 h-14 text-cyan-500/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          <div className="text-center md:text-left flex-grow">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              <h1 className="text-3xl font-bold tracking-widest text-white uppercase">{profile.displayName}</h1>
              <span className="text-[10px] font-mono border border-cyan-500/30 text-cyan-500 bg-cyan-950/20 px-2 py-0.5 rounded tracking-widest uppercase animate-pulse">
                AGENT_READY
              </span>
            </div>
            <p className="text-xs text-cyan-600 mt-2 font-mono uppercase tracking-wider">
              System ID: <span className="text-cyan-500/70">{uid.substring(0, 15)}...</span>
            </p>
            {profile.createdAt && (
              <p className="text-xs text-cyan-600 mt-1 font-mono uppercase tracking-wider">
                Registration Date: <span className="text-cyan-500/70">{new Date(profile.createdAt).toLocaleDateString()}</span>
              </p>
            )}
            <div className="mt-4 h-1.5 w-full bg-cyan-950/40 rounded overflow-hidden border border-cyan-900/60 relative">
              <div 
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-500" 
                style={{ width: `${Math.min(100, (profile.global_score / 15000) * 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[10px] text-cyan-600/70 mt-1">
              <span>LVL_0</span>
              <span>{`PROG_TO_GOD_MODE // ${profile.global_score}/15000 PTS`}</span>
              <span>LVL_MAX</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Card Grid */}
      <h2 className="text-sm font-bold tracking-widest uppercase text-white mb-4 flex items-center gap-2">
        <span className="text-cyan-500">&gt;</span> OPERATIONAL_STATISTICS
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* Total Points */}
        <div className="bg-black/60 border border-cyan-950 rounded p-4 relative overflow-hidden flex flex-col justify-between min-h-[100px] shadow-[0_0_10px_rgba(0,0,0,0.3)]">
          <div className="text-[10px] text-cyan-600 uppercase tracking-widest">Total Points</div>
          <div className="text-2xl font-black text-green-400 mt-2 tracking-wide drop-shadow-[0_0_6px_rgba(34,197,94,0.3)]">
            {profile.global_score} <span className="text-xs font-normal text-cyan-600">PTS</span>
          </div>
          <div className="absolute top-0 right-0 w-2 h-2 bg-green-500/20"></div>
        </div>

        {/* Global Rank */}
        <div className="bg-black/60 border border-cyan-950 rounded p-4 relative overflow-hidden flex flex-col justify-between min-h-[100px] shadow-[0_0_10px_rgba(0,0,0,0.3)]">
          <div className="text-[10px] text-cyan-600 uppercase tracking-widest">Global Rank</div>
          <div className="text-2xl font-black text-cyan-400 mt-2 tracking-wide drop-shadow-[0_0_6px_rgba(6,182,212,0.3)]">
            #{globalRank}
          </div>
          <div className="absolute top-0 right-0 w-2 h-2 bg-cyan-500/20"></div>
        </div>

        {/* Operations Attempted */}
        <div className="bg-black/60 border border-cyan-950 rounded p-4 relative overflow-hidden flex flex-col justify-between min-h-[100px] shadow-[0_0_10px_rgba(0,0,0,0.3)]">
          <div className="text-[10px] text-cyan-600 uppercase tracking-widest">Ops Attempted</div>
          <div className="text-2xl font-black text-purple-400 mt-2 tracking-wide drop-shadow-[0_0_6px_rgba(168,85,247,0.3)]">
            {operationsAttempted} <span className="text-xs font-normal text-cyan-600">UNITS</span>
          </div>
          <div className="absolute top-0 right-0 w-2 h-2 bg-purple-500/20"></div>
        </div>

        {/* Badges Earned */}
        <div className="bg-black/60 border border-cyan-950 rounded p-4 relative overflow-hidden flex flex-col justify-between min-h-[100px] shadow-[0_0_10px_rgba(0,0,0,0.3)]">
          <div className="text-[10px] text-cyan-600 uppercase tracking-widest">Badges Earned</div>
          <div className="text-2xl font-black text-pink-400 mt-2 tracking-wide drop-shadow-[0_0_6px_rgba(236,72,153,0.3)]">
            {badgesEarnedCount} <span className="text-xs font-normal text-cyan-600">/ 20</span>
          </div>
          <div className="absolute top-0 right-0 w-2 h-2 bg-pink-500/20"></div>
        </div>
      </div>

      {/* Badges / Achievements Section */}
      <h2 className="text-sm font-bold tracking-widest uppercase text-white mb-6 flex items-center gap-2">
        <span className="text-cyan-500">&gt;</span> SPECIAL_ACCESS_BADGES
      </h2>
      
      <div className="space-y-8">
        {sectors.map(sector => (
          <div key={sector.name} className="border border-cyan-950/60 p-6 rounded bg-black/40 relative">
            <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 ${sector.colorClass}`}>
              {`// ${sector.name}`}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {sector.badges.map(badge => (
                <div 
                  key={badge.id}
                  className={`border p-4 rounded flex flex-col justify-between h-full relative overflow-hidden transition-all duration-300 min-h-[160px] ${
                    badge.unlocked 
                      ? badge.glowClass
                      : 'border-gray-950 bg-gray-950/30 opacity-20 select-none'
                  }`}
                >
                  {/* Corner bracket accents */}
                  <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-current"></div>
                  <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-current"></div>
                  <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-current"></div>
                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-current"></div>

                  <div>
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-[10px] font-black tracking-wider uppercase border border-current px-1.5 py-0.2 rounded shrink-0">
                        {badge.unlocked ? badge.name : '[LOCKED]'}
                      </span>
                    </div>

                    <p className="text-[11px] text-white/90 font-sans mt-2 leading-relaxed">
                      {badge.unlocked ? badge.description : `Auth status: ${badge.corruptText}`}
                    </p>
                  </div>

                  <div className="text-[9px] text-cyan-600/50 mt-4 font-mono text-right">
                    {badge.unlocked ? `AUTH // OK` : `AUTH // REJECT`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
