"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Gauge } from 'lucide-react';

interface DashboardButtonProps {
  workspaceId: string;
}

export default function DashboardButton({ workspaceId }: DashboardButtonProps) {
  const handleClick = () => {
    // Set both localStorage and cookie
    localStorage.setItem('currentWorkspaceId', workspaceId);
    document.cookie = `currentWorkspaceId=${workspaceId}; path=/; max-age=31536000; SameSite=Lax`;
    // Navigate to dashboard
    window.location.href = '/dashboard';
  };

  return (
    <Button variant="outline" onClick={handleClick}>
      <Gauge className="mr-2 h-4 w-4" />
      View Dashboard
    </Button>
  );
} 