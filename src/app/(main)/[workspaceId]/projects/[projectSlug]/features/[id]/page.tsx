import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { Button } from "@/components/ui/button";
import FeatureRequestDetail from "@/components/features/FeatureRequestDetail";
import FeatureRequestComments from "@/components/features/FeatureRequestComments";
import { getFeatureRequestById } from "@/actions/feature";

interface FeatureRequestPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
    id: string;
  }>;
}

export async function generateMetadata({ params }: FeatureRequestPageProps) {
  const { id } = await params;
  try {
    const featureRequest = await getFeatureRequestById(id);

    if (!featureRequest) {
      return {
        title: "Feature Request Not Found",
      };
    }

    return {
      title: `${featureRequest.title} | Feature Request`,
      description: featureRequest.description.substring(0, 160),
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "Feature Request",
    };
  }
}

export default async function ProjectFeatureRequestPage({ params }: FeatureRequestPageProps) {
  const { workspaceId: workspaceSlugOrId, projectSlug, id } = await params;
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
    }
  });

  if (!project) {
    redirect(`/${workspaceSlugOrId}/projects`);
  }

  // Get current user
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });

  if (!user) {
    redirect('/login');
  }

  try {
    const featureRequest = await getFeatureRequestById(id, workspaceId);

    if (!featureRequest) {
      notFound();
    }

    // Verify the feature request belongs to this project
    if (featureRequest.projectId && featureRequest.projectId !== project.id) {
      redirect(`/${workspaceSlugOrId}/projects/${projectSlug}/features`);
    }

    return (
      <div className="container max-w-4xl py-4 sm:py-8 px-0 sm:px-0">
        <div className="mb-6 text-left">
          <Link href={`/${workspaceSlugOrId}/projects/${projectSlug}/features`}>
            <Button variant="ghost" className="gap-1 pl-1">
              <ChevronLeft className="h-4 w-4" />
              Back to {project.name} Feature Requests
            </Button>
          </Link>
        </div>

        <div className="space-y-8">
          <FeatureRequestDetail
            featureRequest={featureRequest}
            userVote={featureRequest.userVote}
            isAdmin={featureRequest.isAdmin}
            currentUserId={user.id}
          />
          
          <div className="mt-8 bg-card/95 backdrop-blur-sm border rounded-lg border-border/50 p-4 sm:p-6">
            <FeatureRequestComments
              featureRequestId={id}
              comments={featureRequest.comments}
              currentUserId={user.id}
            />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error loading feature request:", error);
    return <div>Something went wrong</div>;
  }
}

