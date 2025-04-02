import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import FeatureRequestDetail from "@/components/features/FeatureRequestDetail";
import FeatureRequestComments from "@/components/features/FeatureRequestComments";

interface FeatureRequestPageProps {
  params: {
    id: string;
  };
}

export async function generateMetadata({ params }: FeatureRequestPageProps) {
  try {
    const featureRequest = await prisma.featureRequest.findUnique({
      where: { id: params.id },
      include: { author: true },
    });

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

export default async function FeatureRequestPage({ params }: FeatureRequestPageProps) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/sign-in");
  }

  const _params = await params;
  const { id } = _params;

  try {
    const featureRequest = await prisma.featureRequest.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        votes: {
          where: {
            userId: session.user.id,
          },
          select: {
            value: true,
          },
        },
        _count: {
          select: {
            votes: {
              where: {
                value: 1,
              },
            },
            comments: true
          },
        },
      },
    });

    if (!featureRequest) {
      notFound();
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    // Get user's vote if any
    const userVote = featureRequest.votes.length > 0 ? featureRequest.votes[0].value : null;

    // Get comments
    const comments = await prisma.featureRequestComment.findMany({
      where: { featureRequestId: id },
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    // Count downvotes separately
    const downvotesCount = await prisma.featureVote.count({
      where: {
        featureRequestId: id,
        value: -1,
      },
    });

    // Format the feature request data
    const formattedFeatureRequest = {
      ...featureRequest,
      voteScore: featureRequest._count.votes - downvotesCount,
      upvotes: featureRequest._count.votes,
      downvotes: downvotesCount,
    };

    return (
      <div className="container max-w-4xl py-8">
        <div className="mb-6">
          <Link href="/features">
            <Button variant="ghost" className="gap-1 pl-1">
              <ChevronLeft className="h-4 w-4" />
              Back to Feature Requests
            </Button>
          </Link>
        </div>

        <div className="space-y-8">
          <FeatureRequestDetail
            featureRequest={formattedFeatureRequest}
            userVote={userVote}
            isAdmin={user?.role === "admin"}
            currentUserId={session.user.id}
          />
          
          <div className="mt-8 bg-card/95 backdrop-blur-sm border rounded-lg border-border/50 p-6">
            <FeatureRequestComments
              featureRequestId={id}
              comments={comments}
              currentUserId={session.user.id}
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