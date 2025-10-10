import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';
import ViewsPageClient from './ViewsPageClient';

interface Props {
  params: Promise<{ workspaceId: string }>;
}

export default async function ViewsPage({ params }: Props) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect('/login');
  }

  const { workspaceId: paramWorkspaceId } = await params;
  
  // Verify workspace access - pass URL parameter first
  const workspaceId = await verifyWorkspaceAccess(session.user, true, paramWorkspaceId);
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    }>
      <ViewsPageClient workspaceId={workspaceId} />
    </Suspense>
  );
} 