import { Skeleton } from "@/components/ui/skeleton";

export function CommentsSkeleton() {
    return (
        <div className="space-y-6 py-2">
            {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                    <Skeleton className="h-6 w-6 rounded-full bg-[#1f1f1f] flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-3 w-24 bg-[#1f1f1f]" />
                            <Skeleton className="h-3 w-16 bg-[#1f1f1f]" />
                        </div>
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-full rounded bg-[#1f1f1f]" />
                            <Skeleton className="h-4 w-3/4 rounded bg-[#1f1f1f]" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
