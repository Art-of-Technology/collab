import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { getDetailedWorkspaceById } from '@/actions/workspace';
import WorkspaceDetailClient from '@/components/workspace/WorkspaceDetailClient';

interface WorkspacePageProps {
  params: {
    workspaceId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceId } = params;
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect('/login');
  }
  
  try {
    // Fetch initial workspace data
    const initialWorkspace = await getDetailedWorkspaceById(workspaceId);
    
    return (
      <WorkspaceDetailClient 
        workspaceId={workspaceId}
        initialWorkspace={initialWorkspace}
        userId={session.user.id}
      />
    );
  } catch (error) {
    console.error("Error loading workspace:", error);
    
    // Handle different error scenarios
    if ((error as Error).message === 'Workspace not found') {
      notFound();
    }
    
    if ((error as Error).message === 'You do not have access to this workspace') {
      redirect('/workspaces');
    }
    
    // For any other errors, show the client component with proper error handling
    return (
      <WorkspaceDetailClient 
        workspaceId={workspaceId}
        initialWorkspace={null}
        userId={session.user.id}
      />
    );
  }
} 