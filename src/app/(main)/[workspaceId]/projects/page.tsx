import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';
import ProjectsPageClient from './ProjectsPageClient';

interface Props {
  params: Promise<{ workspaceId: string }>;
}

export default async function ProjectsPage({ params }: Props) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect('/login');
  }

  // Verify workspace access
  const workspaceId = await verifyWorkspaceAccess(session.user);
  const { workspaceId: paramWorkspaceId } = await params;

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    }>
      <ProjectsPageClient workspaceId={workspaceId} />
    </Suspense>
  );
} 