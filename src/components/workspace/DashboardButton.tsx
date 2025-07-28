"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Gauge } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';
import { urls } from "@/lib/url-resolver";

interface DashboardButtonProps {
  workspaceId: string;
  workspaceSlug?: string;
}

export default function DashboardButton({ workspaceId, workspaceSlug }: DashboardButtonProps) {
  const router = useRouter();
  const { switchWorkspace } = useWorkspace();

  const handleClick = () => {
    // Set workspace context
    switchWorkspace(workspaceId);
    
    // Navigate to workspace-specific dashboard using URL resolver
    const dashboardUrl = workspaceSlug 
      ? urls.workspaceDashboard(workspaceSlug)
      : `/${workspaceId}/dashboard`; // Fallback for backward compatibility
    
    router.push(dashboardUrl);
  };

  return (
    <Button variant="outline" onClick={handleClick}>
      <Gauge className="mr-2 h-4 w-4" />
      View Dashboard
    </Button>
  );
} 