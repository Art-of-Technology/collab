import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getPendingInvitations } from "@/actions/invitation";
import StreamlinedWelcomeClient from "@/components/welcome/StreamlinedWelcomeClient";

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Get pending invitations for the user using server action
  const pendingInvitations = await getPendingInvitations(session.user.email || '')
    .catch(() => []);

  return (
    <StreamlinedWelcomeClient initialInvitations={pendingInvitations} />
  );
} 