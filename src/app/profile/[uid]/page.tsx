import ProfileClient from './ProfileClient';

export const dynamic = 'force-dynamic';

export default function ProfilePage({ params }: { params: { uid: string } }) {
  return <ProfileClient uid={params.uid} />;
}
