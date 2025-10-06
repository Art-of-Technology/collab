export interface Invitation {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  invitedBy?: {
    name?: string;
    email?: string;
  };
}

export interface InvitationComponentProps {
  workspaceId: string;
}

export interface PendingInvitationsProps extends InvitationComponentProps {
  invitations: Invitation[];
  canCancelInvitations: boolean;
}

export interface InvitationsTabProps extends InvitationComponentProps {
  canInviteMembers: boolean;
}
