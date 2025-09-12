import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { checkUserHasWorkspaces, getPendingInvitations } from "@/actions/invitation";
import { getWorkspaceSlugOrId } from "@/lib/workspace-helpers";
import StreamlinedWelcomeClient from "@/components/welcome/StreamlinedWelcomeClient";

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Check if user has any workspaces using server action
  const hasWorkspaces = await checkUserHasWorkspaces().catch(() => false);

  // If user has workspaces, redirect to currentWorkspace (cookie) or fallback to an accessible one
  if (hasWorkspaces) {
    const workspaceSlugOrId = await getWorkspaceSlugOrId({ id: session.user.id });
    if (workspaceSlugOrId) {
      redirect(`/${workspaceSlugOrId}/dashboard`);
    }
  }

  // Get pending invitations for the user using server action
  let pendingInvitations: any[] = [];
  if (session.user.email) {
    pendingInvitations = await getPendingInvitations(session.user.email)
      .catch(() => []);
  }

  return <StreamlinedWelcomeClient initialInvitations={pendingInvitations} />;
} 