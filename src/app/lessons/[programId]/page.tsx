'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/client';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot 
} from 'firebase/firestore';
import Link from 'next/link';

interface QuizQuestion {
  text: string;
  options: string[];
  correctOptionIndex: number;
  scoreValue: number;
}

interface SubLesson {
  subTitle: string;
  fbVideoUrl: string;
  quizQuestions: QuizQuestion[];
}

interface Module {
  moduleId: number;
  moduleTitle: string;
  subLessons: SubLesson[];
}

interface Program {
  id: string;
  title: string;
  description: string;
  createdAt: any;
  createdBy: string;
  modules: Module[];
  isPublished?: boolean;
}

interface UserProgress {
  userId: string;
  programId: string;
  currentUnlockedModuleId: number;
  completedModules: number[];
  finalExamScorePercent: number | null;
  finalExamAttempted: boolean;
  completedSubLessons?: { [moduleId: string]: number[] };
}

export default function ProgramPage({ params }: { params: { programId: string } }) {
  const { programId } = params;
  const { user, userData, loading: authLoading } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  
  const [loadingProgram, setLoadingProgram] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [error, setError] = useState('');

  // Fetch program details
  useEffect(() => {
    if (!programId) return;

    const fetchProgram = async () => {
      try {
        const progRef = doc(db, 'programs', programId);
        const progSnap = await getDoc(progRef);
        if (progSnap.exists()) {
          const data = progSnap.data();
          const rawModules = data.modules || [];
          const normalizedModules = rawModules.map((m: any) => {
            if ((!m.subLessons || m.subLessons.length === 0) && (m.fbVideoUrl || m.quizQuestions)) {
              return {
                ...m,
                subLessons: [
                  { 
                    subTitle: 'Module Briefing Feed', 
                    fbVideoUrl: m.fbVideoUrl || '',
                    quizQuestions: m.quizQuestions || []
                  }
                ]
              };
            }
            return m;
          });

          setProgram({
            id: progSnap.id,
            title: data.title || '',
            description: data.description || '',
            createdAt: data.createdAt,
            createdBy: data.createdBy || '',
            modules: normalizedModules,
            isPublished: data.isPublished ?? false
          });
        } else {
          setError('Academy program not found on active nodes.');
        }
      } catch (err: any) {
        console.error("Error fetching program details:", err);
        setError(err.message || 'Failed to download program configuration.');
      } finally {
        setLoadingProgram(false);
      }
    };

    fetchProgram();
  }, [programId]);

  // Real-time progress listener and automatic initialization
  useEffect(() => {
    if (!user || !programId) return;

    const progressRefId = `${user.uid}_${programId}`;
    const progressRef = doc(db, 'user_course_progress', progressRefId);

    const unsubscribe = onSnapshot(progressRef, async (docSnap) => {
      if (docSnap.exists()) {
        setProgress(docSnap.data() as UserProgress);
      } else {
        // Initialize progress
        const initialProgress: UserProgress = {
          userId: user.uid,
          programId: programId,
          currentUnlockedModuleId: 1,
          completedModules: [],
          finalExamScorePercent: null,
          finalExamAttempted: false
        };
        try {
          await setDoc(progressRef, initialProgress);
          setProgress(initialProgress);
        } catch (err) {
          console.error("Error initializing progress document:", err);
        }
      }
      setLoadingProgress(false);
    }, (err) => {
      console.error("Error listening to progress:", err);
      setLoadingProgress(false);
    });

    return () => unsubscribe();
  }, [user, programId]);

  // Render Loading state
  if (authLoading || loadingProgram || loadingProgress) {
    return (
      <div className="min-h-screen bg-gray-950 text-cyan-400 font-mono flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-lg animate-pulse mb-4">&gt;&gt; ACCESSING CORE CONFIGURATIONS...</p>
          <div className="w-64 h-1 bg-gray-800 mx-auto overflow-hidden relative rounded">
            <div className="absolute inset-0 bg-cyan-500 w-1/3 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  // Render Access Denied/Error
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-red-500 font-mono flex items-center justify-center p-8">
        <div className="max-w-md p-6 bg-red-950/20 border border-red-800 rounded-lg text-center shadow-lg">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-4">[ACCESS_DENIED]</h1>
          <p className="text-base text-gray-300 mb-6">
            Authentication required to modify agent configuration protocols.
          </p>
          <Link href="/" className="inline-block px-4 py-2 bg-red-900/60 hover:bg-red-800 text-white rounded transition-colors text-base border border-red-700">
            Exit Settings
          </Link>
        </div>
      </div>
    );
  }

  const isAuthorized = userData?.role === 'admin' || program?.isPublished;

  if (error || !program || !isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-950 text-red-500 font-mono flex items-center justify-center p-8">
        <div className="max-w-md p-6 bg-red-950/20 border border-red-800 rounded-lg text-center shadow-lg">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-4">
            {!isAuthorized && program ? '[ACCESS_RESTRICTED]' : '[SYS_ERROR]'}
          </h1>
          <p className="text-base text-gray-300 mb-6">
            {error || (!isAuthorized && program
              ? 'This training program is currently offline (Draft mode) and access is restricted to administrative units.'
              : 'An unexpected error occurred.')}
          </p>
          <Link href="/lessons" className="inline-block px-4 py-2 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-400 rounded transition-colors text-base border border-cyan-800 font-mono">
            [BACK_TO_ACADEMY]
          </Link>
        </div>
      </div>
    );
  }

  const currentUnlockedModuleId = progress?.currentUnlockedModuleId || 1;

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-6">
      <div className="max-w-4xl mx-auto">
        
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Link href="/lessons" className="text-xs text-cyan-500 hover:text-cyan-400 font-bold uppercase tracking-wider transition-colors">
            &lt;&lt; [BACK_TO_ACADEMY_DATABASE]
          </Link>
        </div>

        {/* Program Header */}
        <div className="mb-10 border-b border-cyan-900/40 pb-6">
          <span className="text-[10px] bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 px-2 py-0.5 rounded uppercase font-bold tracking-widest">
            ACTIVE_COURSEWARE
          </span>
          <h1 className="text-3xl font-bold tracking-wide text-cyan-400 mt-2 uppercase">
            {program.title}
          </h1>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed">
            {program.description}
          </p>
        </div>

        {/* Modules Timeline */}
        <div className="space-y-6">
          <h2 className="text-xs font-bold text-cyan-600 uppercase tracking-widest mb-4">
            {"// TACTICAL_OBJECTIVES_TIMELINE"}
          </h2>
          
          {program.modules.map((mod) => {
            const isUnlocked = mod.moduleId <= currentUnlockedModuleId;
            const isCompleted = progress?.completedModules?.includes(mod.moduleId) || false;

            return (
              <ModuleCard
                key={mod.moduleId}
                mod={mod}
                isUnlocked={isUnlocked}
                isCompleted={isCompleted}
                programId={program.id}
                progress={progress}
              />
            );
          })}

          {program.modules.length === 0 && (
            <div className="py-12 text-center text-gray-500 border border-cyan-950 rounded bg-gray-950/40">
              &gt;&gt; NO ACTIVE OBJECTIVE MODULES CONFIGURED FOR THIS PROGRAM.
            </div>
          )}

          {program.modules.length > 0 && (
            <div className="pt-4 border-t border-cyan-950/40 mt-6">
              <Link
                href={`/lessons/${program.id}/final`}
                onClick={(e) => {
                  const allDone = (progress?.completedModules?.length || 0) >= program.modules.length;
                  if (!allDone) {
                    e.preventDefault();
                  }
                }}
                className={`w-full text-left p-4 rounded border text-sm transition-all duration-300 font-mono flex items-center justify-between group ${
                  (progress?.completedModules?.length || 0) >= program.modules.length
                    ? 'bg-black border-red-900/60 text-red-400 hover:border-red-500 hover:text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.1)]'
                    : 'bg-gray-950/20 border-gray-900 text-gray-600 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">⚡</span>
                  <span className="font-bold">{"// FINAL CERTIFICATION EXAM"}</span>
                </div>
                {progress?.finalExamAttempted ? (
                  <span className="text-green-500 text-xs font-bold bg-green-950/40 border border-green-800/60 px-2 py-0.5 rounded uppercase tracking-wider">
                    Score: {progress.finalExamScorePercent}%
                  </span>
                ) : (
                  <span className="text-gray-500 text-xs font-bold bg-gray-950/60 border border-gray-800/60 px-2 py-0.5 rounded uppercase tracking-wider">
                    {(progress?.completedModules?.length || 0) >= program.modules.length ? '[READY]' : '[LOCKED]'}
                  </span>
                )}
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// Module Card Sub-component
function ModuleCard({ 
  mod, 
  isUnlocked, 
  isCompleted, 
  programId,
  progress
}: { 
  mod: Module; 
  isUnlocked: boolean; 
  isCompleted: boolean; 
  programId: string;
  progress: UserProgress | null;
}) {
  const { user } = useAuth();
  
  const completedSubsForModule = progress?.completedSubLessons?.[mod.moduleId.toString()] || progress?.completedSubLessons?.[mod.moduleId] || [];
  const currentUnlockedSubIdx = completedSubsForModule.length;

  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes = 180 seconds
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Inline Quiz States
  const [activeQuizSubIdx, setActiveQuizSubIdx] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ [qIdx: number]: number }>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizSuccess, setQuizSuccess] = useState<boolean | null>(null);
  const [quizMessage, setQuizMessage] = useState('');

  // Sync state with storage on mount / active sub-lesson change
  useEffect(() => {
    const key = `fb_watched_${programId}_${mod.moduleId}_${currentUnlockedSubIdx}`;
    const timestamp = localStorage.getItem(key);
    
    if (timestamp) {
      const elapsed = Math.floor((Date.now() - Number(timestamp)) / 1000);
      if (elapsed < 180) {
        setTimeLeft(180 - elapsed);
        setTimerActive(true);
      } else {
        setTimeLeft(0);
        setTimerActive(false);
      }
    } else {
      setTimeLeft(180);
      setTimerActive(false);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [programId, mod.moduleId, currentUnlockedSubIdx]);

  // Countdown timer hook
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive, timeLeft]);

  const handleWatchBriefing = (fbVideoUrl: string, subIdx: number) => {
    // Open watch link in new window
    window.open(fbVideoUrl, '_blank', 'noopener,noreferrer');

    // Only trigger timer for the active unlocked sub-lesson
    if (subIdx === currentUnlockedSubIdx) {
      const key = `fb_watched_${programId}_${mod.moduleId}_${subIdx}`;
      const timestamp = localStorage.getItem(key);
      if (!timestamp) {
        localStorage.setItem(key, Date.now().toString());
        setTimeLeft(180);
        setTimerActive(true);
      }
    }
  };

  const handleQuizSubmit = async (e: React.FormEvent, subIdx: number) => {
    e.preventDefault();
    const subLesson = mod.subLessons[subIdx];
    if (!subLesson || !user) return;

    const questions = subLesson.quizQuestions || [];
    if (questions.length === 0) return;

    // Check if all questions are answered
    if (Object.keys(answers).length < questions.length) {
      setQuizSuccess(false);
      setQuizMessage('[SYS_ERR]: All evaluation questions must be completed.');
      return;
    }

    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correctOptionIndex) {
        correctCount++;
      }
    });

    const percent = Math.round((correctCount / questions.length) * 100);
    setQuizSubmitted(true);

    if (percent >= 75) {
      setQuizSuccess(true);
      setQuizMessage(`[SYS_INF]: Sub-topic evaluation successful (${correctCount}/${questions.length}) - ${percent}%. Next sub-topic decrypted.`);
      
      // Update Firestore progress document
      const currentCompletedSubLessons = progress?.completedSubLessons || {};
      const moduleCompletedSubs = currentCompletedSubLessons[mod.moduleId.toString()] || currentCompletedSubLessons[mod.moduleId] || [];
      
      const newModuleCompletedSubs = [...moduleCompletedSubs];
      if (!newModuleCompletedSubs.includes(subIdx)) {
        newModuleCompletedSubs.push(subIdx);
      }

      const updatedCompletedSubLessons = {
        ...currentCompletedSubLessons,
        [mod.moduleId]: newModuleCompletedSubs
      };

      // Check if all sub-lessons of this module are now completed
      const totalSubs = mod.subLessons.length;
      let newCompletedModules = progress?.completedModules || [];
      let nextUnlockedModuleId = progress?.currentUnlockedModuleId || 1;

      if (newModuleCompletedSubs.length >= totalSubs) {
        if (!newCompletedModules.includes(mod.moduleId)) {
          newCompletedModules = [...newCompletedModules, mod.moduleId];
        }
        nextUnlockedModuleId = Math.max(nextUnlockedModuleId, mod.moduleId + 1);
      }

      const progressRefId = `${user.uid}_${programId}`;
      const progressRef = doc(db, 'user_course_progress', progressRefId);

      await setDoc(progressRef, {
        userId: user.uid,
        programId: programId,
        currentUnlockedModuleId: nextUnlockedModuleId,
        completedModules: newCompletedModules,
        completedSubLessons: updatedCompletedSubLessons
      }, { merge: true });

      // Reset state and close form
      setTimeout(() => {
        setActiveQuizSubIdx(null);
        setAnswers({});
        setQuizSubmitted(false);
        setQuizSuccess(null);
        setQuizMessage('');
      }, 3000);

    } else {
      setQuizSuccess(false);
      setQuizMessage(`[SYS_ERR]: EVALUATION_FAILED: INSUFFICIENT KNOWLEDGE BASE (${percent}%). RETRY PERMITTED.`);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. Locked State rendering
  if (!isUnlocked) {
    return (
      <div className="bg-gray-950/40 border border-gray-900 rounded-lg p-6 flex flex-col items-center justify-center min-h-[140px] relative overflow-hidden group">
        <div className="absolute inset-0 bg-scanlines pointer-events-none opacity-5"></div>
        <div className="text-gray-600 text-center font-mono z-10 select-none">
          <div className="text-3xl mb-2">🔒</div>
          <div className="text-sm font-bold uppercase tracking-widest text-red-950/60 animate-pulse">
            [MODULE ENCRYPTED: COMPLETE PREVIOUS OBJECTIVE]
          </div>
          <div className="text-[10px] text-gray-800 mt-1 uppercase">
            Access credentials withheld by command node
          </div>
        </div>
      </div>
    );
  }

  // 2. Unlocked state rendering
  return (
    <div className={`bg-gray-900/60 border ${isCompleted ? 'border-green-900/60' : 'border-cyan-800/60'} hover:border-cyan-500 rounded-lg p-6 transition-all duration-300 shadow-[0_0_15px_rgba(6,182,212,0.03)] font-mono flex flex-col justify-between relative`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="text-[10px] bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 px-2.5 py-0.5 rounded uppercase font-bold tracking-widest">
            Module {mod.moduleId}
          </span>
          <h3 className="text-lg font-bold text-white uppercase mt-2 tracking-wide">
            {mod.moduleTitle}
          </h3>
        </div>
        {isCompleted && (
          <span className="text-xs bg-green-950/60 text-green-400 border border-green-800/60 px-2 py-0.5 rounded uppercase font-bold tracking-widest">
            Passed
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Sub-Lessons Briefings */}
        <div className="space-y-4">
          {(mod.subLessons || []).map((sub, idx) => {
            const isSubUnlocked = idx <= currentUnlockedSubIdx;
            const isSubCompleted = completedSubsForModule.includes(idx);
            const isSubActive = idx === currentUnlockedSubIdx;
            const isTimerFinished = isSubCompleted || (isSubActive && timeLeft === 0);

            return (
              <div key={idx} className={`p-4 bg-black/45 border rounded transition-all duration-300 ${
                isSubCompleted
                  ? 'border-green-950/80 bg-green-950/5'
                  : isSubActive
                  ? 'border-cyan-900/60 shadow-[0_0_8px_rgba(6,182,212,0.05)]'
                  : 'border-gray-950 opacity-40'
              }`}>
                
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-600">
                      Sub-Topic {idx + 1}
                    </span>
                    <h4 className="text-sm font-bold text-cyan-400 mt-1 uppercase tracking-wide">
                      {sub.subTitle || `Sub-topic ${idx + 1}`}
                    </h4>
                  </div>
                  {isSubCompleted ? (
                    <span className="text-[10px] bg-green-950/60 text-green-400 border border-green-800/60 px-2 py-0.5 rounded uppercase font-bold tracking-widest">
                      [CLEARED]
                    </span>
                  ) : !isSubUnlocked ? (
                    <span className="text-[10px] bg-red-950/20 text-red-950 border border-red-950/40 px-2 py-0.5 rounded uppercase font-bold tracking-widest animate-pulse">
                      [LOCKED]
                    </span>
                  ) : (
                    <span className="text-[10px] bg-cyan-950/40 text-cyan-400 border border-cyan-800/60 px-2 py-0.5 rounded uppercase font-bold tracking-widest animate-pulse">
                      [ACTIVE]
                    </span>
                  )}
                </div>

                {!isSubUnlocked ? (
                  <div className="py-2 text-center text-xs text-red-950/60 font-bold uppercase tracking-wider select-none font-mono">
                    🔒 [COMPLETE PREVIOUS SUB-TOPIC TO DECRYPT]
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={() => handleWatchBriefing(sub.fbVideoUrl, idx)}
                      className="w-full py-2 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-850 hover:border-cyan-500 text-cyan-400 font-bold rounded tracking-wide transition-all uppercase text-xs flex items-center justify-center gap-2 font-mono"
                    >
                      ▶ WATCH BRIEFING
                    </button>

                    {isSubActive && (
                      <div className="space-y-3">
                        {timerActive && timeLeft > 0 && (
                          <div className="text-center bg-black/40 border border-red-950 py-2 rounded">
                            <span className="text-xs text-red-500 font-bold tracking-widest animate-pulse font-mono">
                              [DECRYPTING QUIZ ACCESS // {formatTime(timeLeft)}]
                            </span>
                          </div>
                        )}

                        {isTimerFinished && activeQuizSubIdx !== idx && (
                          <button
                            onClick={() => {
                              setActiveQuizSubIdx(idx);
                              setAnswers({});
                              setQuizSubmitted(false);
                              setQuizSuccess(null);
                              setQuizMessage('');
                            }}
                            className="w-full py-2 bg-green-950/40 hover:bg-green-900/60 border border-green-700 hover:border-green-400 text-green-400 font-bold rounded tracking-wide transition-all uppercase text-xs flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(34,197,94,0.15)] font-mono"
                          >
                            ⚡ TAKE SUB-LESSON QUIZ
                          </button>
                        )}

                        {!timerActive && timeLeft === 180 && (
                          <div className="text-center text-[10px] text-cyan-600/60 py-1.5 border border-cyan-950/40 border-dashed rounded italic font-mono">
                            Watch briefing to initialize decryption countdown.
                          </div>
                        )}
                      </div>
                    )}

                    {activeQuizSubIdx === idx && (
                      <form onSubmit={(e) => handleQuizSubmit(e, idx)} className="mt-4 border-t border-cyan-950 pt-4 space-y-4 font-mono">
                        <h5 className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-3">
                          {"// SUB-TOPIC EVALUATION CHECKLIST"}
                        </h5>

                        {quizMessage && (
                          <div className={`p-3 border rounded text-xs ${quizSuccess ? 'bg-green-950/20 border-green-800 text-green-400' : 'bg-red-950/20 border-red-800 text-red-400'}`}>
                            <strong>{quizSuccess ? '[SYS_INF]:' : '[SYS_ERR]:'}</strong> {quizMessage}
                          </div>
                        )}

                        <div className="space-y-4">
                          {(sub.quizQuestions || []).map((q, qIndex) => (
                            <div key={qIndex} className="p-3 bg-black/45 border border-cyan-950 rounded">
                              <p className="font-bold text-gray-200 mb-2.5 text-xs">
                                Q{qIndex + 1}: {q.text}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {q.options.map((opt, optIdx) => (
                                  <button
                                    key={optIdx}
                                    type="button"
                                    disabled={quizSubmitted && quizSuccess === true}
                                    onClick={() => setAnswers({ ...answers, [qIndex]: optIdx })}
                                    className={`text-left p-2 rounded border text-xs transition-all font-mono ${
                                      answers[qIndex] === optIdx
                                        ? 'bg-cyan-950/30 border-cyan-500 text-cyan-400'
                                        : 'bg-black/30 border-gray-900 text-gray-400 hover:border-gray-800'
                                    }`}
                                  >
                                    {String.fromCharCode(65 + optIdx)}. {opt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {!(quizSubmitted && quizSuccess === true) && (
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="w-full py-2 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700 hover:border-cyan-500 text-cyan-400 font-bold rounded tracking-wide font-mono uppercase text-xs transition-colors"
                            >
                              SUBMIT EVALUATION
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveQuizSubIdx(null);
                                setAnswers({});
                                setQuizSubmitted(false);
                                setQuizSuccess(null);
                                setQuizMessage('');
                              }}
                              className="px-3 py-2 bg-black border border-gray-800 hover:border-gray-600 text-gray-400 font-bold rounded text-xs transition-colors uppercase"
                            >
                              [Close]
                            </button>
                          </div>
                        )}
                      </form>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
