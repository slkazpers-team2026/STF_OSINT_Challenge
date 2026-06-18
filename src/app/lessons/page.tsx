'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/client';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc,
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot,
  where 
} from 'firebase/firestore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
}

export default function LessonsPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const currentUser = userData;
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [progress, setProgress] = useState<{ [programId: string]: UserProgress }>({});
  const [loadingPrograms, setLoadingPrograms] = useState(true);

  // Viewer State
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [activeModule, setActiveModule] = useState<Module | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<{ [qIndex: number]: number }>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizSuccess, setQuizSuccess] = useState<boolean | null>(null);
  const [quizMessage, setQuizMessage] = useState('');
  
  // Final Exam State
  const [isExamMode, setIsExamMode] = useState(false);
  const [examAnswers, setExamAnswers] = useState<{ [qIndex: number]: number }>({});
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [examScore, setExamScore] = useState<number | null>(null);

  // Admin Injection Form State
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [adminTitle, setAdminTitle] = useState('');
  const [adminDescription, setAdminDescription] = useState('');
  const [adminModules, setAdminModules] = useState<Module[]>([
    {
      moduleId: 1,
      moduleTitle: '',
      subLessons: [
        {
          subTitle: '',
          fbVideoUrl: '',
          quizQuestions: [
            {
              text: '',
              options: ['', '', '', ''],
              correctOptionIndex: 0,
              scoreValue: 5
            }
          ]
        }
      ]
    }
  ]);
  const [adminError, setAdminError] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminIsPublished, setAdminIsPublished] = useState(false);

  const handleOpenCreateModal = () => {
    setEditingProgramId(null);
    setAdminTitle('');
    setAdminDescription('');
    setAdminIsPublished(false);
    setAdminModules([
      {
        moduleId: 1,
        moduleTitle: '',
        subLessons: [
          {
            subTitle: '',
            fbVideoUrl: '',
            quizQuestions: [
              {
                text: '',
                options: ['', '', '', ''],
                correctOptionIndex: 0,
                scoreValue: 5
              }
            ]
          }
        ]
      }
    ]);
    setIsAdminModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAdminModalOpen(false);
    setEditingProgramId(null);
    setAdminTitle('');
    setAdminDescription('');
    setAdminIsPublished(false);
    setAdminModules([
      {
        moduleId: 1,
        moduleTitle: '',
        subLessons: [
          {
            subTitle: '',
            fbVideoUrl: '',
            quizQuestions: [
              {
                text: '',
                options: ['', '', '', ''],
                correctOptionIndex: 0,
                scoreValue: 5
              }
            ]
          }
        ]
      }
    ]);
  };

  const handleEditProgram = (prog: Program) => {
    setEditingProgramId(prog.id);
    setAdminTitle(prog.title);
    setAdminDescription(prog.description);
    setAdminIsPublished(prog.isPublished ?? false);
    
    // Deep map modules -> subLessons -> quizQuestions
    const mappedModules = (prog.modules || []).map((mod) => ({
      moduleId: mod.moduleId,
      moduleTitle: mod.moduleTitle || '',
      subLessons: (mod.subLessons || []).map((sub) => ({
        subTitle: sub.subTitle || '',
        fbVideoUrl: sub.fbVideoUrl || '',
        quizQuestions: (sub.quizQuestions || []).map((q) => ({
          text: q.text || '',
          options: Array.isArray(q.options) ? [...q.options] : ['', '', '', ''],
          correctOptionIndex: typeof q.correctOptionIndex === 'number' ? q.correctOptionIndex : 0,
          scoreValue: typeof q.scoreValue === 'number' ? q.scoreValue : 5
        }))
      }))
    }));

    setAdminModules(mappedModules);
    setIsAdminModalOpen(true);
  };

  // Fetch programs dynamically
  useEffect(() => {
    if (!user) return;

    const programsQuery = query(collection(db, 'programs'), orderBy('createdAt', 'desc'));
    const unsubscribePrograms = onSnapshot(programsQuery, (snapshot) => {
      const programsData: Program[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const isProgPublished = data.isPublished ?? false;

        // Visibility guard
        if (userData?.role !== 'admin' && !isProgPublished) {
          return;
        }

        programsData.push({
          id: doc.id,
          title: data.title || '',
          description: data.description || '',
          createdAt: data.createdAt,
          createdBy: data.createdBy || '',
          modules: data.modules || [],
          isPublished: isProgPublished
        });
      });
      setPrograms(programsData);
      setLoadingPrograms(false);
    }, (err) => {
      console.error("Error listening to programs:", err);
      setLoadingPrograms(false);
    });

    return () => unsubscribePrograms();
  }, [user, userData]);

  // Real-time user progress listener
  useEffect(() => {
    if (!user) return;

    const progressQuery = query(
      collection(db, 'user_course_progress'),
      where('userId', '==', user.uid)
    );

    const unsubscribeProgress = onSnapshot(progressQuery, (snapshot) => {
      const progressData: { [programId: string]: UserProgress } = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        progressData[data.programId] = data as UserProgress;
      });
      setProgress(progressData);
    }, (err) => {
      console.error("Error listening to progress:", err);
    });

    return () => unsubscribeProgress();
  }, [user]);



  // Switch module
  const handleSelectModule = (mod: Module) => {
    setIsExamMode(false);
    setActiveModule(mod);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizSuccess(null);
    setQuizMessage('');
  };

  // Submit module quiz
  const handleQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram || !activeModule || !user) return;

    const questions = activeModule.subLessons?.[0]?.quizQuestions || [];
    
    // Check if all questions are answered
    if (Object.keys(quizAnswers).length < questions.length) {
      setQuizSuccess(false);
      setQuizMessage('[SYS_ERR]: All evaluation questions must be completed.');
      return;
    }

    // Check correctness
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correctOptionIndex) {
        correctCount++;
      }
    });

    setQuizSubmitted(true);

    if (correctCount === questions.length) {
      setQuizSuccess(true);
      setQuizMessage(`[SYS_INF]: Module evaluation successful (${correctCount}/${questions.length}). Next module decrypted.`);
      
      // Update progress in Firestore
      const progProgress = progress[selectedProgram.id];
      const completedList = progProgress?.completedModules || [];
      const nextUnlockedId = Math.max(progProgress?.currentUnlockedModuleId || 1, activeModule.moduleId + 1);
      
      const newCompleted = [...completedList];
      if (!newCompleted.includes(activeModule.moduleId)) {
        newCompleted.push(activeModule.moduleId);
      }

      const progressRefId = `${user.uid}_${selectedProgram.id}`;
      const progressRef = doc(db, 'user_course_progress', progressRefId);

      await setDoc(progressRef, {
        userId: user.uid,
        programId: selectedProgram.id,
        currentUnlockedModuleId: nextUnlockedId,
        completedModules: newCompleted,
        finalExamScorePercent: progProgress?.finalExamScorePercent || null,
        finalExamAttempted: progProgress?.finalExamAttempted || false
      }, { merge: true });

    } else {
      setQuizSuccess(false);
      setQuizMessage(`[SYS_ERR]: Evaluation failed (${correctCount}/${questions.length}). Cryptographic keys mismatched. Review answers.`);
    }
  };

  // Submit Final Exam
  const handleExamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram || !user) return;

    // Combine all questions
    const allQuestions: QuizQuestion[] = [];
    selectedProgram.modules.forEach(m => {
      (m.subLessons || []).forEach(sub => {
        if (sub.quizQuestions) allQuestions.push(...sub.quizQuestions);
      });
    });

    if (Object.keys(examAnswers).length < allQuestions.length) {
      alert("Please answer all exam questions before submitting.");
      return;
    }

    let correctCount = 0;
    allQuestions.forEach((q, idx) => {
      if (examAnswers[idx] === q.correctOptionIndex) {
        correctCount++;
      }
    });

    const percent = Math.round((correctCount / allQuestions.length) * 100);
    setExamScore(percent);
    setExamSubmitted(true);

    const progressRefId = `${user.uid}_${selectedProgram.id}`;
    const progressRef = doc(db, 'user_course_progress', progressRefId);
    const progProgress = progress[selectedProgram.id];

    await setDoc(progressRef, {
      userId: user.uid,
      programId: selectedProgram.id,
      currentUnlockedModuleId: progProgress?.currentUnlockedModuleId || 1,
      completedModules: progProgress?.completedModules || [],
      finalExamScorePercent: percent,
      finalExamAttempted: true
    }, { merge: true });
  };

  const handleAddModule = () => {
    const nextId = adminModules.length + 1;
    setAdminModules([
      ...adminModules,
      {
        moduleId: nextId,
        moduleTitle: '',
        subLessons: [
          {
            subTitle: '',
            fbVideoUrl: '',
            quizQuestions: [
              {
                text: '',
                options: ['', '', '', ''],
                correctOptionIndex: 0,
                scoreValue: 5
              }
            ]
          }
        ]
      }
    ]);
  };

  const handleRemoveModule = (modIdx: number) => {
    const updated = adminModules.filter((_, idx) => idx !== modIdx).map((mod, idx) => ({
      ...mod,
      moduleId: idx + 1
    }));
    setAdminModules(updated);
  };

  const handleModuleChange = (modIdx: number, field: keyof Module, value: any) => {
    const updated = [...adminModules];
    updated[modIdx] = {
      ...updated[modIdx],
      [field]: value
    };
    setAdminModules(updated);
  };

  const handleAddSubLesson = (modIdx: number) => {
    const updated = [...adminModules];
    updated[modIdx].subLessons.push({
      subTitle: '',
      fbVideoUrl: '',
      quizQuestions: [
        {
          text: '',
          options: ['', '', '', ''],
          correctOptionIndex: 0,
          scoreValue: 5
        }
      ]
    });
    setAdminModules(updated);
  };

  const handleRemoveSubLesson = (modIdx: number, subIdx: number) => {
    const updated = [...adminModules];
    updated[modIdx].subLessons = updated[modIdx].subLessons.filter((_, idx) => idx !== subIdx);
    setAdminModules(updated);
  };

  const handleSubLessonChange = (modIdx: number, subIdx: number, field: keyof SubLesson, value: string) => {
    const updated = [...adminModules];
    updated[modIdx].subLessons[subIdx] = {
      ...updated[modIdx].subLessons[subIdx],
      [field]: value
    };
    setAdminModules(updated);
  };

  const handleAddQuestion = (modIdx: number, subIdx: number) => {
    const updated = [...adminModules];
    if (!updated[modIdx].subLessons[subIdx].quizQuestions) {
      updated[modIdx].subLessons[subIdx].quizQuestions = [];
    }
    updated[modIdx].subLessons[subIdx].quizQuestions.push({
      text: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      scoreValue: 5
    });
    setAdminModules(updated);
  };

  const handleRemoveQuestion = (modIdx: number, subIdx: number, qIdx: number) => {
    const updated = [...adminModules];
    updated[modIdx].subLessons[subIdx].quizQuestions = updated[modIdx].subLessons[subIdx].quizQuestions.filter((_, idx) => idx !== qIdx);
    setAdminModules(updated);
  };

  const handleQuestionChange = (modIdx: number, subIdx: number, qIdx: number, field: keyof QuizQuestion, value: any) => {
    const updated = [...adminModules];
    updated[modIdx].subLessons[subIdx].quizQuestions[qIdx] = {
      ...updated[modIdx].subLessons[subIdx].quizQuestions[qIdx],
      [field]: value
    };
    setAdminModules(updated);
  };

  const handleOptionChange = (modIdx: number, subIdx: number, qIdx: number, optIdx: number, value: string) => {
    const updated = [...adminModules];
    updated[modIdx].subLessons[subIdx].quizQuestions[qIdx].options[optIdx] = value;
    setAdminModules(updated);
  };

  const handleInjectProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    // Validation check (enforced only for live publish, drafts require title)
    if (adminIsPublished) {
      if (!adminTitle.trim() || !adminDescription.trim()) {
        setAdminError('Program Title and Description are required to publish live.');
        return;
      }

      for (let m = 0; m < adminModules.length; m++) {
        const mod = adminModules[m];
        if (!mod.moduleTitle.trim()) {
          setAdminError(`Module ${m + 1} must have a title to publish live.`);
          return;
        }
        if (!mod.subLessons || mod.subLessons.length === 0) {
          setAdminError(`Module ${m + 1} must contain at least one sub-topic to publish live.`);
          return;
        }
        for (let s = 0; s < mod.subLessons.length; s++) {
          const sub = mod.subLessons[s];
          if (!sub.subTitle.trim()) {
            setAdminError(`Module ${m + 1}, Sub-topic ${s + 1} must have a title to publish live.`);
            return;
          }
          if (!sub.fbVideoUrl.trim()) {
            setAdminError(`Module ${m + 1}, Sub-topic ${s + 1} must have a video feed URL to publish live.`);
            return;
          }
          if (!sub.quizQuestions || sub.quizQuestions.length === 0) {
            setAdminError(`Module ${m + 1}, Sub-topic ${s + 1} must contain at least one question to publish live.`);
            return;
          }
          for (let q = 0; q < sub.quizQuestions.length; q++) {
            const question = sub.quizQuestions[q];
            if (!question.text.trim()) {
              setAdminError(`Module ${m + 1}, Sub-topic ${s + 1}, Question ${q + 1} is missing the question text.`);
              return;
            }
            if (question.options.some(opt => !opt.trim())) {
              setAdminError(`Module ${m + 1}, Sub-topic ${s + 1}, Question ${q + 1} contains blank options.`);
              return;
            }
          }
        }
      }
    } else {
      if (!adminTitle.trim()) {
        setAdminError('Program Title is required to save a draft.');
        return;
      }
    }

    setAdminSubmitting(true);
    try {
      if (editingProgramId) {
        const programDocRef = doc(db, 'programs', editingProgramId);
        await updateDoc(programDocRef, {
          title: adminTitle.trim(),
          description: adminDescription.trim(),
          modules: adminModules,
          isPublished: adminIsPublished
        });
        console.log('[SYS_INF]: Program data successfully overridden.');
        alert('[SYS_INF]: Program data successfully overridden.');
      } else {
        await addDoc(collection(db, 'programs'), {
          title: adminTitle.trim(),
          description: adminDescription.trim(),
          createdBy: user?.uid || 'system',
          createdAt: serverTimestamp(),
          modules: adminModules,
          isPublished: adminIsPublished
        });
      }

      // Clear Form and Close Modal
      setAdminTitle('');
      setAdminDescription('');
      setAdminIsPublished(false);
      setAdminModules([
        {
          moduleId: 1,
          moduleTitle: '',
          subLessons: [
            {
              subTitle: '',
              fbVideoUrl: '',
              quizQuestions: [
                {
                  text: '',
                  options: ['', '', '', ''],
                  correctOptionIndex: 0,
                  scoreValue: 5
                }
              ]
            }
          ]
        }
      ]);
      setEditingProgramId(null);
      setIsAdminModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setAdminError(err.message || 'Failed to save training program.');
    } finally {
      setAdminSubmitting(false);
    }
  };

  // Auth Guard Rendering
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 text-cyan-400 font-mono flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-lg animate-pulse mb-4">&gt;&gt; DECRYPTING ACADEMY DATABASES...</p>
          <div className="w-64 h-1 bg-gray-800 mx-auto overflow-hidden relative rounded">
            <div className="absolute inset-0 bg-cyan-500 w-1/3 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-red-500 font-mono flex items-center justify-center p-8">
        <div className="max-w-md p-6 bg-red-950/20 border border-red-800 rounded-lg text-center shadow-lg">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-4">[ACCESS_DENIED]</h1>
          <p className="text-base text-gray-300 mb-6">
            Authentication signature required. Establish connection protocol to access the Learning Academy databases.
          </p>
          <Link href="/" className="inline-block px-4 py-2 bg-red-900/60 hover:bg-red-800 text-white rounded transition-colors text-base border border-red-700">
            Exit Portal
          </Link>
        </div>
      </div>
    );
  }

  // Combine exam questions
  const getExamQuestions = (prog: Program) => {
    const list: QuizQuestion[] = [];
    prog.modules.forEach(m => {
      (m.subLessons || []).forEach(sub => {
        if (sub.quizQuestions) list.push(...sub.quizQuestions);
      });
    });
    return list;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-cyan-500/20 pb-6 mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-widest text-cyan-400 flex items-center gap-2">
              <span className="animate-pulse">●</span> TRAINING_ACADEMY_ECOSYSTEM
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Hone your skills. Complete tactical modules to unlock advanced intelligence profiles.
            </p>
          </div>
          
          {/* Admin Injection Toggle */}
          {currentUser?.role === 'admin' && (
            <button
              onClick={handleOpenCreateModal}
              className="px-5 py-2.5 bg-green-950/40 hover:bg-green-900/60 border border-green-700 hover:border-green-400 text-green-400 font-bold rounded tracking-wide transition-all duration-300 shadow-[0_0_10px_rgba(34,197,94,0.2)] hover:shadow-[0_0_15px_rgba(34,197,94,0.4)] flex items-center gap-2"
            >
              <span>+ INJECT NEW TRAINING PROGRAM // [NEW_LESSON]</span>
            </button>
          )}
        </div>

        {/* Selected Program Detailed Viewer Panel */}
        {selectedProgram && (
          <div className="mb-8 p-6 bg-gray-900 border border-cyan-800 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.1)] relative">
            <button 
              onClick={() => setSelectedProgram(null)}
              className="absolute top-4 right-4 text-cyan-600 hover:text-cyan-400 text-sm font-bold uppercase tracking-wider transition-colors"
            >
              [BACK_TO_GRID]
            </button>

            <h2 className="text-2xl font-bold text-cyan-400 mb-2 uppercase tracking-wide">
              {selectedProgram.title}
            </h2>
            <p className="text-sm text-gray-400 mb-6 border-b border-gray-800 pb-4">
              {selectedProgram.description}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* Modules Sidebar */}
              <div className="lg:col-span-1 border-r border-gray-800/80 pr-4 space-y-2.5">
                <h3 className="text-xs font-bold text-cyan-600 uppercase tracking-wider mb-3">
                  {"// DECRYPTED_MODULES"}
                </h3>
                
                {selectedProgram.modules.map((mod) => {
                  const isUnlocked = mod.moduleId <= (progress[selectedProgram.id]?.currentUnlockedModuleId || 1);
                  const isCompleted = progress[selectedProgram.id]?.completedModules?.includes(mod.moduleId);
                  const isActive = activeModule?.moduleId === mod.moduleId && !isExamMode;

                  return (
                    <button
                      key={mod.moduleId}
                      onClick={() => isUnlocked && handleSelectModule(mod)}
                      disabled={!isUnlocked}
                      className={`w-full text-left p-3 rounded border text-sm transition-all duration-300 font-mono ${
                        isActive
                          ? 'bg-cyan-950/40 border-cyan-500 text-cyan-400'
                          : isUnlocked
                          ? 'bg-black/40 border-cyan-900/60 text-cyan-300 hover:border-cyan-700/80 hover:text-white'
                          : 'bg-gray-950/20 border-gray-900 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold">
                          {mod.moduleId}. {mod.moduleTitle || `Module ${mod.moduleId}`}
                        </span>
                        {isCompleted ? (
                          <span className="text-green-500 text-xs font-bold tracking-wider">[PASSED]</span>
                        ) : !isUnlocked ? (
                          <span className="text-red-950/60 text-xs font-bold tracking-wider">[LOCKED]</span>
                        ) : (
                          <span className="text-cyan-600 text-xs font-bold tracking-wider">[ACTIVE]</span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Final Exam Entry */}
                {selectedProgram.modules.length > 0 && (
                  <button
                    onClick={() => {
                      const allDone = (progress[selectedProgram.id]?.completedModules?.length || 0) >= selectedProgram.modules.length;
                      if (allDone) {
                        setIsExamMode(true);
                        setActiveModule(null);
                      }
                    }}
                    disabled={(progress[selectedProgram.id]?.completedModules?.length || 0) < selectedProgram.modules.length}
                    className={`w-full text-left p-3 rounded border text-sm transition-all duration-300 font-mono ${
                      isExamMode
                        ? 'bg-red-950/40 border-red-500 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                        : (progress[selectedProgram.id]?.completedModules?.length || 0) >= selectedProgram.modules.length
                        ? 'bg-black border-red-900/60 text-red-400 hover:border-red-600 hover:text-red-300'
                        : 'bg-gray-950/20 border-gray-900 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold">{"// FINAL CERTIFICATION EXAM"}</span>
                      {progress[selectedProgram.id]?.finalExamAttempted ? (
                        <span className="text-green-500 text-xs font-bold">
                          {progress[selectedProgram.id]?.finalExamScorePercent}%
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs font-bold">[READY]</span>
                      )}
                    </div>
                  </button>
                )}
              </div>

              {/* Lesson details & quiz content area */}
              <div className="lg:col-span-3 bg-black/30 p-4 rounded border border-gray-800">
                {isExamMode ? (
                  /* Final Exam Rendering */
                  <form onSubmit={handleExamSubmit} className="space-y-6">
                    <div className="border-b border-red-900/40 pb-3">
                      <h3 className="text-xl font-bold text-red-500 uppercase tracking-widest">
                        [SYS_EVAL]: FINAL OPERATION EXAM
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">
                        Comprehensive assessment covering all modules. Minimum 100% required for perfect clearance.
                      </p>
                    </div>

                    {examSubmitted && (
                      <div className="p-4 border rounded border-red-800 bg-red-950/20 text-red-400">
                        <strong>[EVAL_REPORT]:</strong> Final Exam completed. Authenticated Score: {examScore}%.
                        {examScore !== null && examScore >= 75 ? (
                          <span className="text-green-400 font-bold block mt-1">
                            &gt;&gt; DECISION: Clearance Granted. Certificate code generated.
                          </span>
                        ) : (
                          <span className="text-red-500 font-bold block mt-1">
                            &gt;&gt; DECISION: Score insufficient for administrative credentials. Recalibrate and try again.
                          </span>
                        )}
                      </div>
                    )}

                    <div className="space-y-6">
                      {getExamQuestions(selectedProgram).map((q, idx) => (
                        <div key={idx} className="p-4 bg-gray-900/40 border border-gray-800 rounded">
                          <p className="font-bold text-gray-200 mb-3 text-base">
                            {idx + 1}. {q.text}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {q.options.map((opt, optIdx) => (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={examSubmitted}
                                onClick={() => setExamAnswers({ ...examAnswers, [idx]: optIdx })}
                                className={`text-left p-2.5 rounded border text-sm transition-all font-mono ${
                                  examAnswers[idx] === optIdx
                                    ? 'bg-red-950/20 border-red-500 text-red-400'
                                    : 'bg-black/30 border-gray-800 text-gray-400 hover:border-gray-700'
                                }`}
                              >
                                {String.fromCharCode(65 + optIdx)}. {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {!examSubmitted && (
                      <button
                        type="submit"
                        className="w-full py-3 bg-red-950/40 hover:bg-red-900/60 border border-red-800 hover:border-red-500 text-red-400 font-bold rounded tracking-widest font-mono uppercase text-base transition-colors"
                      >
                        SUBMIT FINAL SYSTEM EVALUATION
                      </button>
                    )}
                  </form>
                ) : activeModule ? (
                  /* Active Module Rendering */
                  <div>
                    <div className="border-b border-cyan-950 pb-3 mb-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                      <div>
                        <h3 className="text-lg font-bold text-cyan-400 uppercase tracking-wide">
                          Module {activeModule.moduleId}: {activeModule.moduleTitle}
                        </h3>
                        <p className="text-xs text-cyan-700 font-mono mt-0.5">
                          Analyze feed and pass decryption tests.
                        </p>
                      </div>
                    </div>

                    {/* Sub-Lessons Briefing List */}
                    <div className="space-y-3 mb-6">
                      <p className="text-xs font-bold text-cyan-600 uppercase tracking-widest font-mono">
                        {"// BRIEFING_CHANNELS"}
                      </p>
                      {(activeModule.subLessons || []).map((sub, idx) => (
                        <div key={idx} className="flex flex-col md:flex-row justify-between items-start md:items-center p-3 bg-black/40 border border-cyan-950 rounded gap-2.5">
                          <span className="text-sm text-cyan-400 font-mono">
                            {idx + 1}. {sub.subTitle || `Sub-topic ${idx + 1}`}
                          </span>
                          <a
                            href={sub.fbVideoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-1.5 bg-cyan-950/60 hover:bg-cyan-800 border border-cyan-750 text-cyan-300 hover:text-white rounded text-xs uppercase font-bold tracking-wider transition-all font-mono"
                          >
                            ▶ WATCH BRIEFING
                          </a>
                        </div>
                      ))}
                      {(!activeModule.subLessons || activeModule.subLessons.length === 0) && (
                        <div className="text-xs text-gray-500 italic">No briefing feeds configured.</div>
                      )}
                    </div>

                    {/* Module Evaluation Form */}
                    <form onSubmit={handleQuizSubmit} className="space-y-6">
                      <div className="border-t border-cyan-950 pt-5">
                        <h4 className="text-sm font-bold text-cyan-500 uppercase tracking-widest mb-4">
                          {"// MODULE DECRYPTION TEST"}
                        </h4>
                      </div>

                      {quizMessage && (
                        <div className={`p-3 border rounded text-xs ${quizSuccess ? 'bg-green-950/20 border-green-800 text-green-400' : 'bg-red-950/20 border-red-800 text-red-400'}`}>
                          <strong>{quizSuccess ? '[SYS_INF]:' : '[SYS_ERR]:'}</strong> {quizMessage}
                        </div>
                      )}

                      <div className="space-y-5">
                        {(activeModule.subLessons?.[0]?.quizQuestions || []).map((q, idx) => (
                          <div key={idx} className="p-4 bg-gray-900/40 border border-gray-800 rounded">
                            <p className="font-bold text-gray-200 mb-3 text-sm">
                              Q{idx + 1}: {q.text}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {q.options.map((opt, optIdx) => (
                                <button
                                  key={optIdx}
                                  type="button"
                                  disabled={quizSubmitted && quizSuccess === true}
                                  onClick={() => setQuizAnswers({ ...quizAnswers, [idx]: optIdx })}
                                  className={`text-left p-2.5 rounded border text-xs transition-all font-mono ${
                                    quizAnswers[idx] === optIdx
                                      ? 'bg-cyan-950/30 border-cyan-500 text-cyan-400'
                                      : 'bg-black/30 border-gray-800 text-gray-400 hover:border-gray-700'
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
                        <button
                          type="submit"
                          className="w-full py-2.5 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700 hover:border-cyan-500 text-cyan-400 font-bold rounded tracking-wide font-mono uppercase text-sm transition-colors"
                        >
                          SUBMIT MODULE EVALUATION
                        </button>
                      )}
                    </form>
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-500 italic">
                    Select a decrypted module to view the training file details.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Programs Grid */}
        {loadingPrograms ? (
          <div className="py-12 text-center text-cyan-500/60 animate-pulse">
            Establishing secure connection to Academy Database collections...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {programs.map((prog) => {
              const progProgress = progress[prog.id];
              const completedCount = progProgress?.completedModules?.length || 0;
              const totalModules = prog.modules.length;

              return (
                <div
                  key={prog.id}
                  onClick={() => router.push(`/lessons/${prog.id}`)}
                  className="bg-gray-900/60 border border-cyan-800/60 hover:border-cyan-500 rounded-lg p-5 transition-all duration-300 shadow-[0_0_15px_rgba(6,182,212,0.03)] hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] flex flex-col justify-between cursor-pointer group"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 px-2 py-0.5 rounded uppercase font-bold tracking-widest">
                          ACADEMY_PROGRAM
                        </span>
                        {!prog.isPublished && (
                          <span className="text-[10px] bg-yellow-950/60 text-yellow-500 border border-yellow-800/60 px-2 py-0.5 rounded uppercase font-bold tracking-widest animate-pulse">
                            ⚠️ [OFFLINE_DRAFT]
                          </span>
                        )}
                      </div>
                      {progProgress?.finalExamAttempted && (
                        <span className="text-[10px] bg-green-950/60 text-green-400 border border-green-800/60 px-2 py-0.5 rounded uppercase font-bold tracking-widest">
                          CERTIFIED
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-cyan-400 group-hover:text-cyan-300 uppercase tracking-wide mb-2 line-clamp-1">
                      {prog.title}
                    </h3>
                    
                    <p className="text-gray-400 text-xs leading-relaxed mb-4 line-clamp-2">
                      {prog.description}
                    </p>
                  </div>

                  <div>
                    <div className="border-t border-cyan-950/40 pt-3 mt-4 flex justify-between items-center text-[10px] font-bold tracking-wider text-cyan-600">
                      <div>
                        MODULES: {completedCount}/{totalModules} COMPLETED
                      </div>
                      <div>
                        {prog.createdAt ? new Date(prog.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>

                    {currentUser?.role === 'admin' && (
                      <div className="mt-4 pt-3 border-t border-cyan-950/40 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditProgram(prog);
                          }}
                          className="px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 hover:border-cyan-400 text-cyan-400 font-bold rounded text-xs uppercase tracking-wider transition-all duration-300 font-mono shadow-[0_0_10px_rgba(6,182,212,0.15)] hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] z-10"
                        >
                          [✏️ EDIT_PROGRAM]
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {programs.length === 0 && (
              <div className="col-span-full py-16 text-center text-gray-500 border border-cyan-950 rounded-lg bg-gray-950/40 font-mono">
                &gt;&gt; NO TRAINING PROGRAMS DETECTED ON NODE. INJECT MODULES TO COMMENCE COURSEWARE.
              </div>
            )}
          </div>
        )}

      </div>

      {/* --- Admin Program Injection Modal --- */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => !adminSubmitting && handleCloseModal()}></div>
          
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 bg-gray-900 border border-green-500 rounded-lg shadow-2xl z-10 font-mono text-white">
            
            {/* Header */}
            <div className="mb-6 border-b border-green-900 pb-3 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold tracking-widest text-green-400 uppercase">
                  {editingProgramId ? '> OVERRIDE_ACADEMY_PROGRAM' : '> INJECT_ACADEMY_PROGRAM'}
                </h2>
                <p className="text-sm text-green-700 mt-0.5">
                  {editingProgramId ? 'Modify existing training courses in database collection.' : 'Deploy new training courses to database collection.'}
                </p>
              </div>
              <button
                type="button"
                disabled={adminSubmitting}
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-green-400 transition-colors uppercase text-sm font-bold"
              >
                [Cancel]
              </button>
            </div>

            {/* Error Message */}
            {adminError && (
              <div className="p-3 mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800 rounded">
                <strong>[ALERT_ERR]:</strong> {adminError}
              </div>
            )}

            <form onSubmit={handleInjectProgram} className="space-y-6">
              
              {/* Program metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-green-500 mb-1.5">
                    Program Title
                  </label>
                  <input
                    type="text"
                    disabled={adminSubmitting}
                    className="w-full px-3 py-2 bg-black border border-green-950 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base"
                    placeholder="e.g. Master's in OSINT Methodologies"
                    value={adminTitle}
                    onChange={(e) => setAdminTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-green-500 mb-1.5">
                    Description
                  </label>
                  <textarea
                    disabled={adminSubmitting}
                    className="w-full px-3 py-2 bg-black border border-green-950 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base h-12"
                    placeholder="Brief objective summary of the training course."
                    value={adminDescription}
                    onChange={(e) => setAdminDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* Modules section */}
              <div className="border-t border-green-900/60 pt-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-green-400 uppercase tracking-widest">
                    {"// COURSE_MODULES ("}{adminModules.length}{")"}
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddModule}
                    disabled={adminSubmitting}
                    className="px-3 py-1.5 bg-green-950/60 hover:bg-green-900 border border-green-800 text-green-400 rounded text-sm font-bold transition-colors"
                  >
                    + ADD MODULE
                  </button>
                </div>

                <div className="space-y-6">
                  {adminModules.map((mod, modIdx) => (
                    <div key={modIdx} className="p-4 bg-black/40 border border-green-950 rounded relative">
                      
                      <button
                        type="button"
                        onClick={() => handleRemoveModule(modIdx)}
                        disabled={adminSubmitting || adminModules.length === 1}
                        className="absolute top-4 right-4 text-sm font-bold text-red-500 hover:text-red-400 disabled:opacity-30 uppercase"
                      >
                        [Remove Module]
                      </button>

                      <h4 className="text-sm font-bold text-green-500 uppercase tracking-wider mb-4">
                        Module {modIdx + 1} configuration
                      </h4>
                      <div className="mb-4">
                        <label className="block text-sm font-bold uppercase tracking-wider text-green-700 mb-1">
                          Module Title
                        </label>
                        <input
                          type="text"
                          disabled={adminSubmitting}
                          className="w-full px-3 py-2 bg-black border border-green-950/80 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base"
                          placeholder="e.g. Reverse Image Search Techniques"
                          value={mod.moduleTitle}
                          onChange={(e) => handleModuleChange(modIdx, 'moduleTitle', e.target.value)}
                        />
                      </div>

                      {/* Sub-Lessons Configuration */}
                      <div className="border-t border-green-950/40 pt-3 mt-3 mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-bold text-green-700 uppercase tracking-widest">
                            {"// SUB-LESSONS ("}{mod.subLessons.length}{")"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddSubLesson(modIdx)}
                            disabled={adminSubmitting}
                            className="px-2 py-1 bg-green-950/40 hover:bg-green-900/40 border border-green-900 text-green-400 rounded text-sm font-bold transition-colors"
                          >
                            + ADD SUB-TOPIC // 📎
                          </button>
                        </div>

                        <div className="space-y-4">
                          {mod.subLessons.map((sub, subIdx) => (
                            <div key={subIdx} className="p-4 bg-gray-950/45 border border-green-950/60 rounded relative pt-10 md:pt-4">
                              
                              <button
                                type="button"
                                onClick={() => handleRemoveSubLesson(modIdx, subIdx)}
                                disabled={adminSubmitting || mod.subLessons.length === 1}
                                className="absolute top-2 right-2 text-xs font-bold text-red-500 hover:text-red-400 disabled:opacity-30 uppercase font-mono"
                              >
                                [X]
                              </button>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                  <label className="block text-sm font-bold uppercase text-green-800 mb-1">
                                    Sub-Lesson Title
                                  </label>
                                  <input
                                    type="text"
                                    disabled={adminSubmitting}
                                    className="w-full px-2 py-1.5 bg-black border border-green-950/60 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base"
                                    placeholder="e.g. Intro & Overview"
                                    value={sub.subTitle}
                                    onChange={(e) => handleSubLessonChange(modIdx, subIdx, 'subTitle', e.target.value)}
                                  />
                                </div>

                                <div>
                                  <label className="block text-sm font-bold uppercase text-green-800 mb-1">
                                    Facebook Video URL
                                  </label>
                                  <input
                                    type="url"
                                    disabled={adminSubmitting}
                                    className="w-full px-2 py-1.5 bg-black border border-green-950/60 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base"
                                    placeholder="e.g. https://www.facebook.com/watch/?v=..."
                                    value={sub.fbVideoUrl}
                                    onChange={(e) => handleSubLessonChange(modIdx, subIdx, 'fbVideoUrl', e.target.value)}
                                  />
                                </div>
                              </div>

                              {/* Nested Quiz questions section inside sub-lesson */}
                              <div className="border-t border-green-950/40 pt-3 mt-3">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="text-sm font-bold text-green-700 uppercase tracking-widest font-mono">
                                    {"// SUB-TOPIC QUIZ QUESTIONS ("}{(sub.quizQuestions || []).length}{")"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddQuestion(modIdx, subIdx)}
                                    disabled={adminSubmitting}
                                    className="px-2 py-0.5 bg-green-950/40 hover:bg-green-900/40 border border-green-900 text-green-400 rounded text-sm font-bold transition-colors font-mono"
                                  >
                                    + Add Question
                                  </button>
                                </div>

                                <div className="space-y-4">
                                  {(sub.quizQuestions || []).map((q, qIdx) => (
                                    <div key={qIdx} className="p-3 bg-black/40 border border-green-950/30 rounded relative">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveQuestion(modIdx, subIdx, qIdx)}
                                        disabled={adminSubmitting || sub.quizQuestions.length === 1}
                                        className="absolute top-2 right-2 text-xs font-bold text-red-650 hover:text-red-500 disabled:opacity-30 uppercase font-mono"
                                      >
                                        [Remove Question]
                                      </button>

                                      <label className="block text-sm font-bold uppercase tracking-wider text-green-700 mb-1">
                                        Question {qIdx + 1} Text
                                      </label>
                                      <input
                                        type="text"
                                        disabled={adminSubmitting}
                                        className="w-full px-2 py-1.5 bg-black border border-green-950/60 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base mb-3"
                                        placeholder="State question query..."
                                        value={q.text}
                                        onChange={(e) => handleQuestionChange(modIdx, subIdx, qIdx, 'text', e.target.value)}
                                      />

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                        {q.options.map((opt, optIdx) => (
                                          <div key={optIdx} className="w-full">
                                            <label className="block text-sm font-bold uppercase text-green-800 mb-0.5">
                                              Option {String.fromCharCode(65 + optIdx)}
                                            </label>
                                            <input
                                              type="text"
                                              disabled={adminSubmitting}
                                              className="w-full px-2 py-1 bg-black border border-green-950/40 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base"
                                              placeholder={`Option choice ${optIdx + 1}`}
                                              value={opt}
                                              onChange={(e) => handleOptionChange(modIdx, subIdx, qIdx, optIdx, e.target.value)}
                                            />
                                          </div>
                                        ))}
                                      </div>

                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <label className="block text-sm font-bold uppercase text-green-800 mb-0.5 font-mono">
                                            Correct Option
                                          </label>
                                          <select
                                            disabled={adminSubmitting}
                                            className="w-full px-2 py-1 bg-black border border-green-950/40 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base"
                                            value={q.correctOptionIndex}
                                            onChange={(e) => handleQuestionChange(modIdx, subIdx, qIdx, 'correctOptionIndex', Number(e.target.value))}
                                          >
                                            <option value={0}>Option A</option>
                                            <option value={1}>Option B</option>
                                            <option value={2}>Option C</option>
                                            <option value={3}>Option D</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-sm font-bold uppercase text-green-800 mb-0.5 font-mono">
                                            Score Value
                                          </label>
                                          <input
                                            type="number"
                                            min={1}
                                            disabled={adminSubmitting}
                                            className="w-full px-2 py-1 bg-black border border-green-950/40 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base"
                                            value={q.scoreValue}
                                            onChange={(e) => handleQuestionChange(modIdx, subIdx, qIdx, 'scoreValue', Number(e.target.value))}
                                          />
                                        </div>
                                      </div>

                                    </div>
                                  ))}
                                </div>
                              </div>

                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Program Visibility Toggle */}
              <div>
                <label className="block text-sm font-bold uppercase tracking-wider text-green-500 mb-1.5 font-mono">
                  Deployment Visibility
                </label>
                <select
                  disabled={adminSubmitting}
                  className="w-full px-3 py-2 bg-black border border-green-950 rounded text-green-400 focus:outline-none focus:border-green-500 font-mono text-base"
                  value={adminIsPublished ? "true" : "false"}
                  onChange={(e) => setAdminIsPublished(e.target.value === "true")}
                >
                  <option value="false">[SAVE_AS_DRAFT_//_HIDDEN]</option>
                  <option value="true">[PUBLISH_IMMEDIATELY_//_LIVE]</option>
                </select>
              </div>

              {/* Submit / Save area */}
              <button
                type="submit"
                disabled={adminSubmitting}
                className="w-full py-3 bg-green-950/40 hover:bg-green-900/60 border border-green-800 hover:border-green-500 text-green-400 font-bold rounded tracking-widest font-mono uppercase text-lg transition-colors"
              >
                {adminSubmitting 
                  ? 'SAVING COURSEWARE...' 
                  : (editingProgramId ? 'OVERRIDE TRAINING PROGRAM IN DATABASE' : 'INJECT TRAINING PROGRAM TO DATABASE')}
              </button>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
