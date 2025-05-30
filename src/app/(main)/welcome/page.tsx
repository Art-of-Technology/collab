import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { checkUserHasWorkspaces, getPendingInvitations } from "@/actions/invitation";
import WelcomeClient from "@/components/welcome/WelcomeClient";

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Check if user has any workspaces using server action
  const hasWorkspaces = await checkUserHasWorkspaces().catch(() => false);

  // If user has workspaces, redirect to dashboard
  if (hasWorkspaces) {
    redirect("/dashboard");
  }

  // Get pending invitations for the user using server action
  const pendingInvitations = await getPendingInvitations(session.user.email || '')
    .catch(() => []);

  return (
    <div className="container max-w-4xl py-8">
      <WelcomeClient initialInvitations={pendingInvitations} />
    </div>
  );
} 