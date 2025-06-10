import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { checkUserHasWorkspaces, getPendingInvitations } from "@/actions/invitation";
import WelcomeClient from "@/components/welcome/WelcomeClient";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Check if user has any workspaces using server action
  const hasWorkspaces = await checkUserHasWorkspaces().catch(() => false);

  // If user has workspaces, redirect to their first workspace dashboard
  if (hasWorkspaces) {
    // Get the user's first workspace
    const userWorkspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 1
    });

    if (userWorkspaces.length > 0) {
      redirect(`/${userWorkspaces[0].id}/dashboard`);
    }
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