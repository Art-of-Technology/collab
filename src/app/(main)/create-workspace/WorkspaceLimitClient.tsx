'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkspaceLimit } from '@/hooks/queries/useWorkspace';
import { Loader2 } from 'lucide-react';

export function WorkspaceLimitClient({ 
  initialCanCreate 
}: { 
  initialCanCreate: boolean 
}) {
  // Use TanStack Query for real-time updates to workspace limit
  const { data, isLoading, isError } = useWorkspaceLimit();
  
  // Use server-rendered value initially, then update with client data when available
  const canCreateWorkspace = data?.canCreateWorkspace ?? initialCanCreate;
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  if (isError) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <p>Error checking workspace limits. Please try refreshing the page.</p>
        </CardContent>
      </Card>
    );
  }
  
  if (!canCreateWorkspace) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/30 p-6 rounded-md border border-amber-200 dark:border-amber-800">
        <h3 className="font-medium text-amber-800 dark:text-amber-400 text-lg">Workspace limit reached</h3>
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
          You have reached the maximum number of workspaces ({data?.maxCount || 3}) allowed on the free plan.
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
    );
  }
  
  return null;
} 