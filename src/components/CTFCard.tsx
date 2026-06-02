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
}

export default function CTFCard({ 
  id, 
  title, 
  description, 
  creatorName, 
  displayName, 
  creator_uid, 
  isPublished, 
  currentUserUid 
}: CTFCardProps) {
  const showDraftBadge = isPublished === false && currentUserUid && creator_uid && currentUserUid === creator_uid;
  const nameToDisplay = creatorName || displayName;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-blue-500 transition-colors flex flex-col h-full relative">
      <div className="flex-grow">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-xl font-bold text-white leading-tight">{title}</h3>
          {showDraftBadge && (
            <span className="text-xs font-mono border border-amber-500/50 text-amber-400 bg-amber-950/20 px-2 py-0.5 rounded shrink-0 blink-effect">
              [DRAFT - NOT LIVE]
            </span>
          )}
        </div>
        
        {/* Creator Name */}
        {nameToDisplay && (
          <div className="text-xs text-cyan-500/70 font-mono mb-3">
            By {nameToDisplay}
          </div>
        )}
        
        {/* Description එක දිග වැඩි නම් කපා පෙන්වීම (truncate) */}
        <p className="text-gray-400 mb-6 line-clamp-3 font-sans text-sm leading-relaxed">{description}</p>
      </div>
      
      <div className="mt-auto">
        <Link 
          href={`/ctf/${id}`}
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm"
        >
          Start Mission
        </Link>
      </div>
    </div>
  );
}