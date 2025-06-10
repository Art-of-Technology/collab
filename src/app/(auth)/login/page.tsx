import LoginForm from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    // Check if user has any workspaces
    const userWorkspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 1
    });

    // If user has no workspaces, redirect to welcome page
    if (userWorkspaces.length === 0) {
      redirect("/welcome");
    }

    // Otherwise, redirect to the first workspace's dashboard
    redirect(`/${userWorkspaces[0].id}/timeline`);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md px-8 py-12">
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <Link href="/" className="mb-4">
            <Image src="/logo-v2.png" width={125} height={125} alt="Collab" />
          </Link>
          <p className="mt-2 text-muted-foreground">PMs, Designers & Devs — Aligned at Last.</p>
        </div>
        
        <div className="bg-card border border-border/40 shadow-lg rounded-lg p-8">
          <h2 className="text-xl font-semibold text-center mb-6">Sign in to your account</h2>
          <LoginForm />
        </div>
      </div>
    </div>
  );
} 