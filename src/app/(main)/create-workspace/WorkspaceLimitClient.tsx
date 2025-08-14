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
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-[#8b949e]" />
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="p-6 bg-[#f85149]/10 border border-[#f85149]/20 rounded-md text-center mb-6">
        <p className="text-[#f85149] text-sm">Error checking workspace limits. Please try refreshing the page.</p>
      </div>
    );
  }
  
  if (!canCreateWorkspace) {
    return (
      <div className="bg-[#f59e0b]/10 p-6 rounded-md border border-[#f59e0b]/20 mb-6">
        <h3 className="font-medium text-[#f59e0b] text-lg">Workspace limit reached</h3>
        <p className="text-sm text-[#8b949e] mt-2">
          You have reached the maximum number of workspaces ({data?.maxCount || 3}) allowed on the free plan.
          Please upgrade your account to create more workspaces or manage your existing ones.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button 
            variant="default" 
            size="sm"
            className="bg-[#f59e0b] hover:bg-[#d97706] text-white border-0"
          >
            Upgrade Plan
          </Button>
          <Link href="/workspaces">
            <Button 
              variant="outline" 
              size="sm"
              className="border-[#30363d] text-[#8b949e] hover:bg-[#1a1a1a] hover:text-[#e6edf3]"
            >
              Manage Existing Workspaces
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return null;
} 