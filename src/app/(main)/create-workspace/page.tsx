import React from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { WorkspaceLimitClient } from './WorkspaceLimitClient';
import { checkWorkspaceLimit } from '@/actions/workspace';

export default async function CreateWorkspacePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user has reached their workspace limit using server action
  const { canCreateWorkspace } = await checkWorkspaceLimit();

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-6">
        <Link href="/workspaces">
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to workspaces
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create a new workspace</CardTitle>
          <CardDescription>
            Create a workspace to collaborate with your team. Free accounts can create up to 3 workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceLimitClient initialCanCreate={canCreateWorkspace} />
          
          {canCreateWorkspace && <CreateWorkspaceForm />}
        </CardContent>
      </Card>
    </div>
  );
} 