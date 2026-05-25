import Link from 'next/link';

interface CTFCardProps {
  id: string;
  title: string;
  description: string;
}

export default function CTFCard({ id, title, description }: CTFCardProps) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-blue-500 transition-colors">
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      {/* Description එක දිග වැඩි නම් කපා පෙන්වීම (truncate) */}
      <p className="text-gray-400 mb-4 line-clamp-3">{description}</p>
      
      <Link 
        href={`/ctf/${id}`}
        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
      >
        Start Mission
      </Link>
    </div>
  );
}