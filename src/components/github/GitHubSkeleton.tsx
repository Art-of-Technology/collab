import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code } from "lucide-react";

export function GitHubSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5 text-[#8b949e]" />
          <Skeleton className="h-6 w-40 bg-[#1f1f1f]" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Tabs List Skeleton */}
          <div className="grid w-full grid-cols-4 gap-2 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 rounded bg-[#1f1f1f]" />
            ))}
          </div>

          {/* Content Skeleton */}
          <div className="space-y-4">
            {/* Repo Info */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-[#1f1f1f]">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded bg-[#1f1f1f]" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48 bg-[#1f1f1f]" />
                  <Skeleton className="h-3 w-32 bg-[#1f1f1f]" />
                </div>
              </div>
              <Skeleton className="h-8 w-32 bg-[#1f1f1f]" />
            </div>

            {/* Timeline */}
            <div className="space-y-4 pl-4 border-l border-[#1f1f1f] ml-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="relative flex items-start gap-4">
                  <div className="absolute -left-[21px] top-1">
                    <Skeleton className="h-8 w-8 rounded-full bg-[#1f1f1f] border-2 border-[#0a0a0a]" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-32 bg-[#1f1f1f]" />
                      <Skeleton className="h-5 w-16 rounded-full bg-[#1f1f1f]" />
                    </div>
                    <Skeleton className="h-3 w-48 bg-[#1f1f1f]" />
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

