import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ChevronLeft } from "lucide-react";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import FeatureRequestsList from "@/components/features/FeatureRequestsList";
import CreateFeatureRequestButton from "@/components/features/CreateFeatureRequestButton";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

interface ProjectFeaturesPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
}

export async function generateMetadata({ params }: ProjectFeaturesPageProps) {
  const { projectSlug } = await params;
  return {
    title: `Feature Requests - ${projectSlug}`,
    description: "Submit and vote on feature requests for this project",
  };
}

export default async function ProjectFeaturesPage({ params }: ProjectFeaturesPageProps) {
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
        title="Feature Requests"
        subtitle={`Submit your ideas and vote on features for ${project.name}`}
        actions={
          <CreateFeatureRequestButton 
            projectId={project.id} 
            projectName={project.name}
          />
        }
      />
      
      <Suspense fallback={<FeatureRequestsListSkeleton />}>
        <FeatureRequestsList 
          currentUserId={user.id} 
          projectId={project.id}
          showProjectBadge={false}
        />
      </Suspense>
    </div>
  );
}

function FeatureRequestsListSkeleton() {
  return (
    <div className="space-y-4">
      {Array(3)
        .fill(0)
        .map((_, i) => (
          <div
            key={i}
            className="p-4 sm:p-6 border border-border rounded-lg space-y-3"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-20 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-36" />
            </div>
          </div>
        ))}
    </div>
  );
}

