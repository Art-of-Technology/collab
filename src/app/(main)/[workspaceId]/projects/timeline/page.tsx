import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import ProjectsTimelineClient from './ProjectsTimelineClient';

interface Props {
  params: Promise<{ workspaceId: string }>;
}

export default async function ProjectsTimelinePage({ params }: Props) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect('/login');
  }

  const { workspaceId } = await params;

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-[#0a0a0b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    }>
      <ProjectsTimelineClient workspaceId={workspaceId} />
    </Suspense>
  );
}
