"use client";

import React, { useState } from "react";
import { User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { urlResolver } from "@/lib/url-resolver";
import CancelInvitationButton from "./CancelInvitationButton";
import type { PendingInvitationsProps } from "./types";

export default function PendingInvitations({ 
  invitations, 
  workspaceId, 
  canCancelInvitations 
}: PendingInvitationsProps) {
  const { toast } = useToast();
  const [manualCopy, setManualCopy] = useState<{ id: string; url: string } | null>(null);

  async function copyInvitationLink(id: string, token: string) {
    const url = new URL(urlResolver.workspaceInvitation(encodeURIComponent(token)), window.location.origin).href;
    setManualCopy(null);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Invitation link copied', description: 'Share this link with the invited person.' });
    } catch {
      setManualCopy({ id, url });
      toast({ title: 'Could not copy the link', description: 'Select and copy the invitation link below.', variant: 'destructive' });
    }
  }

  return (
    <Card className="border border-border/40 bg-card/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-base font-medium">Pending Invitations</CardTitle>
        <CardDescription className="text-xs">
          View and manage pending invitations to your workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {invitations.length > 0 ? (
          <div className="space-y-3">
            {invitations.map((invitation) => (
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
                  Expires on {new Date(invitation.expiresAt).toLocaleDateString()}
                </div>
                {canCancelInvitations && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {invitation.token && (
                      <Button type="button" variant="outline" size="sm" onClick={() => copyInvitationLink(invitation.id, invitation.token)}>
                        Copy invitation link
                      </Button>
                    )}
                    <CancelInvitationButton 
                      invitationId={invitation.id} 
                      workspaceId={workspaceId} 
                      onSuccess={() => setManualCopy(null)}
                    />
                    {manualCopy?.id === invitation.id && (
                      <Input aria-label={`Invitation link for ${invitation.email}`} value={manualCopy.url} readOnly onFocus={event => event.target.select()} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No pending invitations
          </div>
        )}
      </CardContent>
    </Card>
  );
}
