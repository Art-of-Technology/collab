import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import FeatureRequestsList from "@/components/features/FeatureRequestsList";
import CreateFeatureRequestButton from "@/components/features/CreateFeatureRequestButton";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Feature Requests | Devitter",
  description: "Submit and vote on feature requests for Devitter",
};

export default async function FeatureRequestsPage() {
  const session = await getAuthSession();

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="container max-w-5xl py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Feature Requests</h1>
          <p className="text-muted-foreground mt-1">
            Submit your ideas and vote on features you want to see
          </p>
        </div>
        <CreateFeatureRequestButton />
      </div>

      <Suspense fallback={<FeatureRequestsListSkeleton />}>
        <FeatureRequestsList currentUserId={session.user.id} />
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
            className="p-6 border border-border rounded-lg space-y-3"
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