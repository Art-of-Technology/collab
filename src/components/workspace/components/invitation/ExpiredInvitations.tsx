"use client";

import React from "react";
import { User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ResendInvitationButton from "@/components/workspace/components/invitation/ResendInvitationButton";
import DeleteInvitationButton from "@/components/workspace/components/invitation/DeleteInvitationButton";
import type { PendingInvitationsProps } from "./types";

export default function ExpiredInvitations({ 
  invitations, 
  workspaceId, 
  canCancelInvitations 
}: PendingInvitationsProps) {
  // Filter expired invitations
  const expiredInvitations = invitations.filter(invitation => 
    new Date(invitation.expiresAt) < new Date()
  );

  return (
    <Card className="border border-border/40 bg-card/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-base font-medium">Expired Invitations</CardTitle>
        <CardDescription className="text-xs">
          View and manage expired invitations to your workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {expiredInvitations.length > 0 ? (
          <div className="space-y-3">
            {expiredInvitations.map((invitation) => (
              <div key={invitation.id} className="p-3 border border-border/20 rounded">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-sm">{invitation.email}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Invited by {invitation.invitedBy?.name || invitation.invitedBy?.email} on{" "}
                  {new Date(invitation.createdAt).toLocaleDateString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  Expired on {new Date(invitation.expiresAt).toLocaleDateString()}
                </div>
                {canCancelInvitations && (
                  <div className="mt-2 flex gap-2">
                    <ResendInvitationButton 
                      invitationId={invitation.id}
                      email={invitation.email}
                      workspaceId={workspaceId} 
                    />
                    <DeleteInvitationButton
                      invitationId={invitation.id}
                      workspaceId={workspaceId}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No expired invitations
          </div>
        )}
      </CardContent>
    </Card>
  );
}
