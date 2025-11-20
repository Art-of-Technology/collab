import { Skeleton } from "@/components/ui/skeleton";

export function RelationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Sub-issues Section Skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Skeleton className="h-4 w-4 rounded bg-[#1f1f1f]" />
            <Skeleton className="h-4 w-24 bg-[#1f1f1f]" />
          </div>
        </div>
        
        <div className="space-y-2 pl-6">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between p-2 border border-[#1f1f1f] rounded-md bg-[#0f0f0f]">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-4 bg-[#1f1f1f]" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-16 bg-[#1f1f1f]" />
                  <Skeleton className="h-3 w-48 bg-[#1f1f1f]" />
                </div>
              </div>
              <Skeleton className="h-5 w-16 rounded bg-[#1f1f1f]" />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[#1f1f1f]" />

      {/* Other Relations Skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Skeleton className="h-4 w-4 rounded bg-[#1f1f1f]" />
            <Skeleton className="h-4 w-24 bg-[#1f1f1f]" />
          </div>
        </div>
        
        <div className="space-y-2 pl-6">
          <div className="flex items-center justify-between p-2 border border-[#1f1f1f] rounded-md bg-[#0f0f0f]">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 bg-[#1f1f1f]" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-16 bg-[#1f1f1f]" />
                <Skeleton className="h-3 w-40 bg-[#1f1f1f]" />
              </div>
            </div>
            <Skeleton className="h-5 w-20 rounded bg-[#1f1f1f]" />
          </div>
        </div>
      </div>
    </div>
  );
}

