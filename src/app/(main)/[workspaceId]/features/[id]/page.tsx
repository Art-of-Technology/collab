import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import FeatureRequestDetail from "@/components/features/FeatureRequestDetail";
import FeatureRequestComments from "@/components/features/FeatureRequestComments";
import { getFeatureRequestById } from "@/actions/feature";

interface FeatureRequestPageProps {
  params: Promise<{
    workspaceId: string;
    id: string;
  }>;
}

export async function generateMetadata({ params }: FeatureRequestPageProps) {
  const _params = await params;
  const { id } = _params;
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

export default async function FeatureRequestPage({ params }: FeatureRequestPageProps) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/sign-in");
  }

  const { id, workspaceId } = await params;

  try {
    const featureRequest = await getFeatureRequestById(id, workspaceId);

    if (!featureRequest) {
      notFound();
    }

    return (
      <div className="container max-w-4xl py-8">
        <div className="mb-6">
          <Link href={`/${workspaceId}/features`}>
            <Button variant="ghost" className="gap-1 pl-1">
              <ChevronLeft className="h-4 w-4" />
              Back to Feature Requests
            </Button>
          </Link>
        </div>

        <div className="space-y-8">
          <FeatureRequestDetail
            featureRequest={featureRequest}
            userVote={featureRequest.userVote}
            isAdmin={featureRequest.isAdmin}
            currentUserId={session.user.id}
          />
          
          <div className="mt-8 bg-card/95 backdrop-blur-sm border rounded-lg border-border/50 p-6">
            <FeatureRequestComments
              featureRequestId={id}
              comments={featureRequest.comments}
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