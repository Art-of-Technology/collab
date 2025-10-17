"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useCancelInvitation } from "./hooks";

interface DeleteInvitationButtonProps {
  invitationId: string;
  workspaceId: string;
}

export default function DeleteInvitationButton({ 
  invitationId, 
  workspaceId 
}: DeleteInvitationButtonProps) {
  const { mutate: cancelInvitation, isPending } = useCancelInvitation(workspaceId);

  const handleDelete = () => {
    cancelInvitation(invitationId);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
      onClick={handleDelete}
      disabled={isPending}
    >
      <Trash2 className="h-3 w-3" />
      Delete
    </Button>
  );
}
