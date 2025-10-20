"use client";

import React from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import PendingInvitations from "./PendingInvitations";
import ExpiredInvitations from "./ExpiredInvitations";
import InviteNewMembers from "./InviteNewMembers";
import { useInvitations } from "./hooks";

interface InvitationsTabProps {
  workspaceId: string;
  canInviteMembers: boolean;
}

export default function InvitationsTab({ 
  workspaceId, 
  canInviteMembers 
}: InvitationsTabProps) {
  const { data: invitations = [], isLoading, error } = useInvitations(workspaceId);

  if (!canInviteMembers) {
    return null;
  }

  if (isLoading) {
    return (
      <TabsContent className="max-w-6xl px-6 py-4" value="invitations">
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </TabsContent>
    );
  }

  if (error) {
    return (
      <TabsContent className="max-w-6xl px-6 py-4" value="invitations">
        <div className="text-center py-8 text-destructive">
          Failed to load invitations. Please try again.
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent className="max-w-6xl px-6 py-4" value="invitations">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PendingInvitations
            invitations={invitations.filter(inv => new Date(inv.expiresAt) >= new Date())}
            workspaceId={workspaceId}
            canCancelInvitations={canInviteMembers}
          />
          <InviteNewMembers workspaceId={workspaceId} />
        </div>
        <ExpiredInvitations
          invitations={invitations}
          workspaceId={workspaceId}
          canCancelInvitations={canInviteMembers}
        />
      </div>
    </TabsContent>
  );
}
