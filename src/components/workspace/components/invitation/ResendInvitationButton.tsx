"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { useResendInvitation } from "./hooks";

interface ResendInvitationButtonProps {
  invitationId: string;
  email: string;
  workspaceId: string;
}

export default function ResendInvitationButton({ 
  invitationId, 
  email,
  workspaceId 
}: ResendInvitationButtonProps) {
  const { mutate: resendInvitation, isPending } = useResendInvitation(workspaceId);

  const handleResend = () => {
    resendInvitation({ invitationId, email });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs"
      onClick={handleResend}
      disabled={isPending}
    >
      <RotateCw className="h-3 w-3 mr-1" />
      {isPending ? "Resending..." : "Resend"}
    </Button>
  );
}
