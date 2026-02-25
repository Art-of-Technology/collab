import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code } from "lucide-react";

export function GitHubSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5 text-collab-400" />
          <Skeleton className="h-6 w-40 bg-collab-700" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Tabs List Skeleton */}
          <div className="grid w-full grid-cols-4 gap-2 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 rounded bg-collab-700" />
            ))}
          </div>

          {/* Content Skeleton */}
          <div className="space-y-4">
            {/* Repo Info */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-collab-700">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded bg-collab-700" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48 bg-collab-700" />
                  <Skeleton className="h-3 w-32 bg-collab-700" />
                </div>
              </div>
              <Skeleton className="h-8 w-32 bg-collab-700" />
            </div>

            {/* Timeline */}
            <div className="space-y-4 pl-4 border-l border-collab-700 ml-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="relative flex items-start gap-4">
                  <div className="absolute -left-[21px] top-1">
                    <Skeleton className="h-8 w-8 rounded-full bg-collab-700 border-2 border-[#0a0a0a]" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-32 bg-collab-700" />
                      <Skeleton className="h-5 w-16 rounded-full bg-collab-700" />
                    </div>
                    <Skeleton className="h-3 w-48 bg-collab-700" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

