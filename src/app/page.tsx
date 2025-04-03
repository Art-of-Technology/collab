import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await getAuthSession();

  // If user is not logged in, redirect to login page
  if (!session?.user) {
    redirect("/login");
  }

  // Check if user has any workspaces
  const userWorkspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } }
      ]
    },
    take: 1
  });

  // If user has no workspaces, redirect to welcome page
  if (userWorkspaces.length === 0) {
    redirect("/welcome");
  }

  // Otherwise, redirect to dashboard
  redirect("/dashboard");
}
