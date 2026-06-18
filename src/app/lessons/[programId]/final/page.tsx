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

export default function FinalExamPage({ 
  params 
}: { 
  params: { programId: string } 
}) {
  const { programId } = params;
  const { user, userData, loading: authLoading } = useAuth();
  
  const [program, setProgram] = useState<Program | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuizQuestion[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected answers
  const [answers, setAnswers] = useState<{ [qIdx: number]: number }>({});
  const [submitted, setSubmitted] = useState(false);
  const [scorePercent, setScorePercent] = useState<number | null>(null);

  useEffect(() => {
    if (!user || !programId) return;

    const fetchData = async () => {
      try {
        // 1. Fetch program details
        const progRef = doc(db, 'programs', programId);
        const progSnap = await getDoc(progRef);
        if (!progSnap.exists()) {
          setError('Academy program not found.');
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
        const normalizedModules: Module[] = rawModules.map((m: any) => {
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
          ...progData,
          modules: normalizedModules,
          id: progSnap.id
        });

        // 2. Fetch progress details
        const progressRefId = `${user.uid}_${programId}`;
        const progressRef = doc(db, 'user_course_progress', progressRefId);
        const progSnap2 = await getDoc(progressRef);
        
        if (progSnap2.exists()) {
          const progressData = progSnap2.data() as UserProgress;

          // Access Guard 1: Single attempt check
          if (progressData.finalExamAttempted) {
            setError('[ACCESS DENIED: FINAL EVALUATION ALREADY SUBMITTED]');
            setLoading(false);
            return;
          }

          // Access Guard 2: Complete all modules check
          const totalModules = normalizedModules.length;
          const completedModules = progressData.completedModules?.length || 0;
          if (completedModules < totalModules) {
            setError('[ACCESS DENIED: INCOMPLETE TRAINING MODULES. CLEAR ALL MODULES IN OBJECTIVE TIMELINE FIRST.]');
            setLoading(false);
            return;
          }

          // 3. Pool questions and shuffle
          const questionPool: QuizQuestion[] = [];
          normalizedModules.forEach(m => {
            (m.subLessons || []).forEach(sub => {
              if (sub.quizQuestions) questionPool.push(...sub.quizQuestions);
            });
          });

          // Shuffle and pick top 25 (or pool length if less than 25)
          const shuffled = [...questionPool].sort(() => 0.5 - Math.random()).slice(0, 25);
          setExamQuestions(shuffled);

        } else {
          setError('[ACCESS DENIED: INCOMPLETE TRAINING MODULES]');
        }

      } catch (err: any) {
        console.error("Error loading final exam:", err);
        setError(err.message || 'Failed to download final evaluation protocols.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, userData, programId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (examQuestions.length === 0 || !user || !program) return;

    if (Object.keys(answers).length < examQuestions.length) {
      alert("Please answer all questions before submitting your final exam.");
      return;
    }

    let correctCount = 0;
    examQuestions.forEach((q, idx) => {
      if (answers[idx] === q.correctOptionIndex) {
        correctCount++;
      }
    });

    const percentValue = Math.round((correctCount / examQuestions.length) * 100);
    setScorePercent(percentValue);
    setSubmitted(true);

    // Update Firestore progress
    const progressRefId = `${user.uid}_${programId}`;
    const progressRef = doc(db, 'user_course_progress', progressRefId);
    
    try {
      await setDoc(progressRef, {
        finalExamAttempted: true,
        finalExamScorePercent: percentValue
      }, { merge: true });
    } catch (err) {
      console.error("Error saving final exam status:", err);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-cyan-400 font-mono flex items-center justify-center p-8">
        <p className="text-lg animate-pulse">&gt;&gt; ACCESSING ENCRYPTED SYSTEM EVALUATION VECTOR...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-red-500 font-mono flex items-center justify-center p-8">
        <div className="max-w-md p-6 bg-red-950/20 border border-red-800 rounded-lg text-center shadow-lg">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-4">[ACCESS_RESTRICTED]</h1>
          <p className="text-sm text-gray-300 mb-6">{error}</p>
          <Link href={programId ? `/lessons/${programId}` : "/lessons"} className="inline-block px-4 py-2 bg-red-900/60 hover:bg-red-800 text-white rounded transition-colors text-base border border-red-700 font-mono">
            [BACK_TO_OBJECTIVE_TIMELINE]
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-6">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="mb-8 border-b border-red-900/40 pb-5">
          <Link href={`/lessons/${programId}`} className="text-xs text-red-500 hover:text-red-400 font-bold uppercase transition-colors">
            &lt;&lt; [ABORT_EXAM_SESSION]
          </Link>
          <h1 className="text-2xl font-bold uppercase text-red-500 mt-4 tracking-wider">
            [SYS_EVAL]: FINAL CERTIFICATION EXAM
          </h1>
          <p className="text-xs text-gray-400 mt-1 uppercase">
            WARNING: SINGLE ATTEMPT ONLY. SUBMITTING FINALIZES CERTIFICATION CREDENTIALS.
          </p>
        </div>

        {/* Results Banner */}
        {submitted && (
          <div className="p-5 mb-8 border border-green-800 bg-green-950/20 text-green-400 rounded-lg shadow-[0_0_10px_rgba(34,197,94,0.15)]">
            <h3 className="font-bold text-lg uppercase tracking-wider mb-1">[SYS_INF]: FINAL EXAM SUBMITTED</h3>
            <p className="text-sm">Comprehensive evaluation completed. Score: {scorePercent}% [AUTHENTICATED]. Clearance status modified.</p>
            <div className="mt-4">
              <Link 
                href={`/lessons/${programId}`}
                className="inline-block px-4 py-2 bg-green-900/60 hover:bg-green-800 border border-green-700 text-white rounded text-sm uppercase transition-colors font-bold"
              >
                [RETURN_TO_PROGRAM_VIEW]
              </Link>
            </div>
          </div>
        )}

        {/* Exam Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {examQuestions.map((q, idx) => (
            <div key={idx} className="p-5 bg-gray-900/60 border border-red-950/40 rounded-lg">
              <p className="font-bold text-gray-200 mb-4 text-base">
                Q{idx + 1}: {q.text}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {q.options.map((opt, optIdx) => (
                  <button
                    key={optIdx}
                    type="button"
                    disabled={submitted}
                    onClick={() => setAnswers({ ...answers, [idx]: optIdx })}
                    className={`text-left p-3.5 rounded border text-sm transition-all font-mono ${
                      answers[idx] === optIdx
                        ? 'bg-red-950/30 border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.15)]'
                        : 'bg-black/30 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    {String.fromCharCode(65 + optIdx)}. {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!submitted && (
            <button
              type="submit"
              className="w-full py-3.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800 hover:border-red-500 text-red-400 font-bold rounded tracking-widest font-mono uppercase text-base transition-colors"
            >
              SUBMIT SYSTEM FINAL EVALUATION
            </button>
          )}
        </form>

      </div>
    </div>
  );
}
