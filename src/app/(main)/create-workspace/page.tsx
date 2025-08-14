'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { WorkspaceLimitClient } from './WorkspaceLimitClient';
import { useWorkspaceLimit } from '@/hooks/queries/useWorkspace';
import PageHeader, { pageHeaderButtonStyles } from '@/components/layout/PageHeader';

export default function CreateWorkspacePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: workspaceLimit, isLoading } = useWorkspaceLimit();
  
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="h-full bg-[#101011] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8b949e]" />
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const canCreateWorkspace = workspaceLimit?.canCreateWorkspace ?? true;

  return (
    <div className="h-full bg-[#101011] flex flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        icon={Building2}
        title="Create Workspace"
        subtitle="Create a workspace to collaborate with your team"
        actions={
          <Link href="/workspaces">
            <Button
              variant="ghost"
              size="sm"
              className={pageHeaderButtonStyles.ghost}
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              Back to Workspaces
            </Button>
          </Link>
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl">
          <WorkspaceLimitClient initialCanCreate={canCreateWorkspace} />
          
          {canCreateWorkspace && <CreateWorkspaceForm />}
        </div>
      </div>
    </div>
  );
} 