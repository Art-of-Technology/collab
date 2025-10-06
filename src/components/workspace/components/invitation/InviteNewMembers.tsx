"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import InviteMemberForm from "./InviteMemberForm";
import type { InvitationComponentProps } from "./types";

export default function InviteNewMembers({ workspaceId }: InvitationComponentProps) {
  return (
    <Card className="border border-border/40 bg-card/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-base font-medium">Invite New Members</CardTitle>
        <CardDescription className="text-xs">
          Send invitations to new members to join your workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <InviteMemberForm workspaceId={workspaceId} />
      </CardContent>
    </Card>
  );
}
