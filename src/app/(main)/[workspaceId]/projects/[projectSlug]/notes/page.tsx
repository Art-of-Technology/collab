/* eslint-disable */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ChevronLeft, FileText, Plus } from "lucide-react";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import ProjectNotesList from "@/components/notes/ProjectNotesList";

interface ProjectNotesPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
}

export async function generateMetadata({ params }: ProjectNotesPageProps) {
  const { projectSlug } = await params;
  return {
    title: `Context - ${projectSlug}`,
    description: "Project documentation and context",
  };
}

export default async function ProjectNotesPage({ params }: ProjectNotesPageProps) {
  const { workspaceId: workspaceSlugOrId, projectSlug } = await params;
  const session = await getServerSession(authConfig);

  if (!session?.user?.email) {
    redirect('/login');
  }

  // Resolve workspace slug/ID to actual workspace ID
  const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
  if (!workspaceId) {
    redirect('/');
  }

  // Verify user has access to workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      members: {
        some: {
          user: {
            email: session.user.email
          }
        }
      }
    },
    select: {
      id: true,
      slug: true,
    }
  });

  if (!workspace) {
    redirect('/');
  }

  // Fetch project by slug
  const project = await prisma.project.findFirst({
    where: {
      workspaceId,
      slug: projectSlug
    },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
    }
  });

  if (!project) {
    redirect(`/${workspaceSlugOrId}/projects`);
  }

  // Get current user ID
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="container max-w-5xl py-4 sm:py-8 px-0 sm:px-6">
      <div className="mb-4 px-6 sm:px-0">
        <Link href={`/${workspaceSlugOrId}/projects/${projectSlug}/settings`}>
          <Button variant="ghost" className="gap-1 pl-1 -ml-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Project
          </Button>
        </Link>
      </div>

      <PageHeader
        icon={FileText}
        title="Project Context"
        subtitle={`Documentation and context for ${project.name}`}
        actions={
          <Link href={`/${workspace.slug}/notes/new?projectId=${project.id}`}>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              New Context
            </Button>
          </Link>
        }
      />

      <Suspense fallback={<NotesListSkeleton />}>
        <ProjectNotesList
          projectId={project.id}
          workspaceSlug={workspace.slug}
          currentUserId={user.id}
        />
      </Suspense>
    </div>
  );
}

function NotesListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
      {Array(6)
        .fill(0)
        .map((_, i) => (
          <div
            key={i}
            className="p-4 border border-border rounded-lg space-y-3"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-6 rounded" />
            </div>
            <Skeleton className="h-12 w-full" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
    </div>
  );
}
