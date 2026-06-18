import Link from 'next/link';

interface CTFCardProps {
  id: string;
  title: string;
  description: string;
  creatorName?: string;
  displayName?: string;
  creator_uid?: string;
  isPublished?: boolean;
  currentUserUid?: string;
  totalChallenges?: number;
  completedCount?: number;
}

export default function CTFCard({ 
  id, 
  title, 
  description, 
  creatorName, 
  displayName, 
  creator_uid, 
  isPublished, 
  currentUserUid,
  totalChallenges = 0,
  completedCount = 0
}: CTFCardProps) {
  const showDraftBadge = isPublished === false && currentUserUid && creator_uid && currentUserUid === creator_uid;
  const nameToDisplay = creatorName || displayName;
  
  const progressPercentage = totalChallenges > 0 ? Math.round((completedCount / totalChallenges) * 100) : 0;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-blue-500 transition-colors flex flex-col h-full relative overflow-hidden">
      <div className="flex-grow">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-xl font-bold text-white leading-tight">{title}</h3>
          {showDraftBadge && (
            <span className="text-sm font-mono border border-amber-500/50 text-amber-400 bg-amber-950/20 px-2 py-0.5 rounded shrink-0 blink-effect">
              [DRAFT - NOT LIVE]
            </span>
          )}
        </div>
        
        {/* Creator Name */}
        {nameToDisplay && (
          <div className="text-sm text-cyan-500/70 font-mono mb-3">
            By {nameToDisplay}
          </div>
        )}
        
        {/* Description එක දිග වැඩි නම් කපා පෙන්වීම (truncate) */}
        <p className="text-gray-400 mb-6 line-clamp-3 font-sans text-base leading-relaxed">{description}</p>
      </div>
      
      <div className="mt-auto">
        <div className="text-sm font-mono text-cyan-400/80 mb-4 tracking-wider">
          [OBJECTIVES: {completedCount} / {totalChallenges} SECURED // {progressPercentage}%]
        </div>
        <Link 
          href={`/ctf/${id}`}
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded transition-colors text-base font-mono border border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)] hover:shadow-[0_0_12px_rgba(59,130,246,0.6)]"
        >
          Start Mission
        </Link>
      </div>

      {/* Bottom Edge Progress Bar */}
      <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-950/80 rounded-b overflow-hidden">
        {progressPercentage > 0 && (
          <div 
            className={`h-full transition-all duration-500 ${
              progressPercentage === 100 
                ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                : 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] animate-pulse'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        )}
      </div>
    </div>
  );
}