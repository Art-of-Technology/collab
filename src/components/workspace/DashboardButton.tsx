"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Gauge } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';

interface DashboardButtonProps {
  workspaceId: string;
}

export default function DashboardButton({ workspaceId }: DashboardButtonProps) {
  const router = useRouter();
  const { switchWorkspace } = useWorkspace();

  const handleClick = () => {
    // Set workspace context
    switchWorkspace(workspaceId);
    
    // Navigate to dashboard
    router.push('/dashboard');
  };

  return (
    <Button variant="outline" onClick={handleClick}>
      <Gauge className="mr-2 h-4 w-4" />
      View Dashboard
    </Button>
  );
} 