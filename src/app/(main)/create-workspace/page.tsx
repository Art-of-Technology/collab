import React from 'react';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
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

export default async function CreateWorkspacePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  // Check if user has reached their workspace limit (3 for free plan)
  const ownedWorkspacesCount = await prisma.workspace.count({
    where: { ownerId: session.user.id }
  });

  const canCreateWorkspace = ownedWorkspacesCount < 3;

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
          {canCreateWorkspace ? (
            <CreateWorkspaceForm />
          ) : (
            <div className="bg-amber-50 dark:bg-amber-950/30 p-6 rounded-md border border-amber-200 dark:border-amber-800">
              <h3 className="font-medium text-amber-800 dark:text-amber-400 text-lg">Workspace limit reached</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                You have reached the maximum number of workspaces (3) allowed on the free plan.
                Please upgrade your account to create more workspaces or manage your existing ones.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="default" className="bg-amber-600 hover:bg-amber-700 text-white border-none">
                  Upgrade Plan
                </Button>
                <Link href="/workspaces">
                  <Button variant="secondary" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
                    Manage Existing Workspaces
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 