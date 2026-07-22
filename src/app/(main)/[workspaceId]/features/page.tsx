import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import FeatureRequestsList from "@/components/features/FeatureRequestsList";
import CreateFeatureRequestButton from "@/components/features/CreateFeatureRequestButton";
import { Lightbulb } from "lucide-react";

export const metadata = {
  title: "Feature Requests",
  description: "Submit and vote on feature requests for your projects",
};

export default async function FeatureRequestsPage() {
  const session = await getAuthSession();

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="flex flex-col gap-6 p-8 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <Lightbulb className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-medium text-collab-50">Feature Requests</h1>
                <p className="text-sm text-collab-500">
                  Submit ideas and vote on features you want to see
                </p>
              </div>
            </div>
            <CreateFeatureRequestButton />
          </div>
        </div>

        {/* List */}
        <Suspense fallback={<FeatureRequestsListSkeleton />}>
          <FeatureRequestsList currentUserId={session.user.id} />
        </Suspense>
      </div>
    </div>
  );
}

function FeatureRequestsListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Filters skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-[140px] bg-collab-800 rounded-lg animate-pulse" />
          <div className="h-9 w-[140px] bg-collab-800 rounded-lg animate-pulse" />
        </div>
        <div className="h-5 w-24 bg-collab-800 rounded animate-pulse" />
      </div>

      {/* List items skeleton */}
      <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden divide-y divide-collab-700">
        {Array(5).fill(0).map((_, i) => (
          <div key={i} className="p-5 animate-pulse">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-1 w-12">
                <div className="h-6 w-6 bg-collab-600 rounded" />
                <div className="h-4 w-8 bg-collab-600 rounded" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="h-5 w-3/4 bg-collab-600 rounded" />
                <div className="h-4 w-full bg-collab-600 rounded" />
                <div className="h-4 w-2/3 bg-collab-600 rounded" />
                <div className="flex items-center gap-4 pt-2">
                  <div className="h-4 w-20 bg-collab-600 rounded" />
                  <div className="h-4 w-24 bg-collab-600 rounded" />
                  <div className="h-4 w-16 bg-collab-600 rounded" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
