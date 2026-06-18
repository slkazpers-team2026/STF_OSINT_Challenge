'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
}

export default function ModuleQuizPage({ 
  params 
}: { 
  params: { programId: string; moduleId: string } 
}) {
  const { programId } = params;
  const moduleId = Number(params.moduleId);
  const { user, userData, loading: authLoading } = useAuth();
  
  const [program, setProgram] = useState<Program | null>(null);
  const [activeModule, setActiveModule] = useState<Module | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected answers
  const [answers, setAnswers] = useState<{ [qIdx: number]: number }>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [percent, setPercent] = useState(0);
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    if (!user || !programId || isNaN(moduleId)) return;

    const fetchData = async () => {
      try {
        // 1. Fetch program details
        const progRef = doc(db, 'programs', programId);
        const progSnap = await getDoc(progRef);
        if (!progSnap.exists()) {
          setError('Academy program not found on active nodes.');
          setLoading(false);
          return;
        }
        
        const progData = progSnap.data() as Program;
        const isProgPublished = progData.isPublished ?? false;

        // Access Guard: Draft check
        if (userData?.role !== 'admin' && !isProgPublished) {
          setError('[ACCESS RESTRICTED: PROGRAM OFFLINE/DRAFT MODE]');
          setLoading(false);
          return;
        }

        const rawModules = progData.modules || [];
        const normalizedModules = rawModules.map((m: any) => {
          if ((!m.subLessons || m.subLessons.length === 0) && m.fbVideoUrl) {
            return {
              ...m,
              subLessons: [
                { subTitle: 'Module Briefing Feed', fbVideoUrl: m.fbVideoUrl }
              ]
            };
          }
          return m;
        });

        setProgram({
          ...progData,
          modules: normalizedModules,
          id: progSnap.id
        });

        // Find module
        const activeMod = normalizedModules.find(m => m.moduleId === moduleId);
        if (!activeMod) {
          setError('Objective module not found in program registry.');
          setLoading(false);
          return;
        }
        setActiveModule(activeMod);

        // 2. Fetch progress details
        const progressRefId = `${user.uid}_${programId}`;
        const progressRef = doc(db, 'user_course_progress', progressRefId);
        const progSnap2 = await getDoc(progressRef);
        
        if (progSnap2.exists()) {
          const progressData = progSnap2.data() as UserProgress;
          setProgress(progressData);
          
          // Access Guard: Ensure module is unlocked
          if (moduleId > progressData.currentUnlockedModuleId) {
            setError('[ACCESS DENIED: MODULE LOCKED. COMPLETE PREVIOUS OBJECTIVES.]');
          }
        } else {
          setError('[ACCESS DENIED: WATCH FB BRIEFING COUNTDOWN TIMER TO INITIATE ACCESS.]');
        }

      } catch (err: any) {
        console.error("Error loading quiz data:", err);
        setError(err.message || 'Failed to establish connection to evaluation node.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, userData, programId, moduleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModule || !user || !program) return;

    const questions = activeModule.subLessons?.[0]?.quizQuestions || [];
    if (Object.keys(answers).length < questions.length) {
      alert("Please answer all questions before submitting system evaluation.");
      return;
    }

    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correctOptionIndex) {
        correctCount++;
      }
    });

    const calculatedScore = correctCount * 5;
    const calculatedPercent = Math.round((correctCount / questions.length) * 100);
    const hasPassed = calculatedPercent >= 75;

    setScore(calculatedScore);
    setPercent(calculatedPercent);
    setPassed(hasPassed);
    setSubmitted(true);

    if (hasPassed) {
      // Update progress in Firestore
      const progressRefId = `${user.uid}_${programId}`;
      const progressRef = doc(db, 'user_course_progress', progressRefId);
      
      const completedList = progress?.completedModules || [];
      const newCompleted = [...completedList];
      if (!newCompleted.includes(moduleId)) {
        newCompleted.push(moduleId);
      }
      
      const nextUnlockedId = Math.max(progress?.currentUnlockedModuleId || 1, moduleId + 1);

      try {
        await setDoc(progressRef, {
          userId: user.uid,
          programId: programId,
          currentUnlockedModuleId: nextUnlockedId,
          completedModules: newCompleted
        }, { merge: true });
      } catch (err) {
        console.error("Error updating progress in Firestore:", err);
      }
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setScore(0);
    setPercent(0);
    setPassed(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-cyan-400 font-mono flex items-center justify-center p-8">
        <p className="text-lg animate-pulse">&gt;&gt; ACCESSING ENCRYPTED EVALUATION DATABASE...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-red-500 font-mono flex items-center justify-center p-8">
        <div className="max-w-md p-6 bg-red-950/20 border border-red-800 rounded-lg text-center shadow-lg">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-4">[SECURITY_GUARD_REJECTION]</h1>
          <p className="text-sm text-gray-300 mb-6">{error}</p>
          <Link href={programId ? `/lessons/${programId}` : "/lessons"} className="inline-block px-4 py-2 bg-red-900/60 hover:bg-red-800 text-white rounded transition-colors text-base border border-red-700">
            [BACK_TO_OBJECTIVE_TIMELINE]
          </Link>
        </div>
      </div>
    );
  }

  if (!activeModule) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-6">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="mb-8 border-b border-cyan-900/40 pb-5">
          <Link href={`/lessons/${programId}`} className="text-xs text-cyan-500 hover:text-cyan-400 font-bold uppercase transition-colors">
            &lt;&lt; [ABORT_EVALUATION_PROTOCOLS]
          </Link>
          <h1 className="text-2xl font-bold uppercase text-cyan-400 mt-4 tracking-wide">
            Module {moduleId} Evaluation: {activeModule.moduleTitle}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Complete the security checklist. 75% score required to clear this objective node.
          </p>
        </div>

        {/* Results Banner */}
        {submitted && (
          <div className={`p-5 mb-8 border rounded-lg ${passed ? 'bg-green-950/20 border-green-800 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.15)]' : 'bg-red-950/20 border-red-800 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.15)]'}`}>
            {passed ? (
              <div>
                <h3 className="font-bold text-lg uppercase tracking-wider mb-1">[SYS_INF]: EVALUATION SUCCESSFUL</h3>
                <p className="text-sm">Objective cleared with score: {percent}% ({score} Points). Next objective path decrypted.</p>
                <div className="mt-4">
                  <Link 
                    href={`/lessons/${programId}`}
                    className="inline-block px-4 py-2 bg-green-900/60 hover:bg-green-800 border border-green-700 text-white rounded text-sm uppercase transition-colors font-bold"
                  >
                    [RETURN_TO_PROGRAM_VIEW]
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="font-bold text-lg uppercase tracking-wider mb-1">[SYS_ERR]: EVALUATION_FAILED: INSUFFICIENT KNOWLEDGE BASE. RETRY PERMITTED</h3>
                <p className="text-sm">Score: {percent}% ({score} Points). System firewall remains active. Recalibrate answers and re-authenticate.</p>
                <div className="mt-4">
                  <button 
                    type="button"
                    onClick={handleRetry}
                    className="px-4 py-2 bg-red-900/60 hover:bg-red-800 border border-red-700 text-white rounded text-sm uppercase transition-colors font-bold"
                  >
                    [RE-ATTEMPT_DECRYPTION]
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quiz Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {(activeModule.subLessons?.[0]?.quizQuestions || []).map((q, idx) => (
            <div key={idx} className="p-5 bg-gray-900/60 border border-cyan-900/40 rounded-lg">
              <p className="font-bold text-gray-200 mb-4 text-base">
                Q{idx + 1}: {q.text}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {q.options.map((opt, optIdx) => (
                  <button
                    key={optIdx}
                    type="button"
                    disabled={submitted && passed}
                    onClick={() => setAnswers({ ...answers, [idx]: optIdx })}
                    className={`text-left p-3.5 rounded border text-sm transition-all font-mono ${
                      answers[idx] === optIdx
                        ? 'bg-cyan-950/40 border-cyan-500 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                        : 'bg-black/30 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    {String.fromCharCode(65 + optIdx)}. {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!(submitted && passed) && (
            <button
              type="submit"
              className="w-full py-3.5 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800 hover:border-cyan-500 text-cyan-400 font-bold rounded tracking-widest font-mono uppercase text-base transition-colors"
            >
              SUBMIT SYSTEM CHECKLIST
            </button>
          )}
        </form>

      </div>
    </div>
  );
}
