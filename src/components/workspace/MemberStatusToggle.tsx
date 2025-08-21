"use client";

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

interface MemberStatusToggleProps {
  readonly memberId: string;
  readonly workspaceId: string;
  readonly currentStatus: boolean;
  readonly memberName: string;
  readonly canManage: boolean;
  readonly isOwner: boolean;
  readonly onStatusChange?: (memberId: string, newStatus: boolean) => void;
}

function OwnerBadge() {
  return (
    <Badge className="bg-primary hover:bg-primary/90 h-5 px-2 text-xs">
      Owner
    </Badge>
  );
}

function StatusBadge({ status }: { readonly status: boolean }) {
  return (
    <Badge
      variant={status ? "default" : "secondary"}
      className={cn(
        "h-5 px-2 text-xs",
        status
          ? "bg-green-100 text-green-800 border-green-200"
          : "bg-gray-100 text-gray-600 border-gray-200"
      )}
    >
      {status ? "Active" : "Inactive"}
    </Badge>
  );
}

export default function MemberStatusToggle({
  memberId,
  workspaceId,
  currentStatus,
  memberName,
  canManage,
  isOwner,
  onStatusChange,
}: MemberStatusToggleProps) {
  const [status, setStatus] = useState(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleStatusChange = async (newStatus: boolean) => {
    if (!canManage || isOwner) return;

    setIsUpdating(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update member status");
      }

      setStatus(newStatus);

      // Notify parent component
      onStatusChange?.(memberId, newStatus);

      // Refetch workspace data to reflect changes
      await queryClient.invalidateQueries({
        queryKey: ['workspace', workspaceId]
      });

      toast({
        title: "Status Updated",
        description: `${memberName} is now ${newStatus ? "active" : "inactive"
        description: `${memberName} is now ${newStatus ? "active" : "inactive"}`,
      });
    } catch (error) {
      console.error("Error updating member status:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update member status",
        variant: "destructive",
      });
      setStatus(currentStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isOwner) {
    return <OwnerBadge />;
  }

  if (!canManage) {
    return <StatusBadge status={status} />;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">

        {isUpdating ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={status}
            onCheckedChange={handleStatusChange}
            disabled={isUpdating}
            className="data-[state=checked]:bg-green-600"
          />
        )}
      </div>
    </TooltipProvider>
  );
}
