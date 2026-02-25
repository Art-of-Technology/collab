import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import ProjectsPageClient from './ProjectsPageClient';

interface Props {
  params: Promise<{ workspaceId: string }>;
}

export default async function ProjectsPage({ params }: Props) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <Suspense fallback={
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-collab-700 border-t-[#75757a] rounded-full animate-spin" />
      </div>
    }>
      <ProjectsPageClient/>
    </Suspense>
  );
} 