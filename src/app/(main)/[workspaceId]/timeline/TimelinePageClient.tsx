"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import UnifiedTimeline from "@/components/timeline/UnifiedTimeline";
import CreatePostForm from "@/components/posts/CreatePostForm";

interface TimelinePageClientProps {
  workspaceId: string;
  workspaceSlug: string;
}

// Tab configuration
const TABS = [
  { id: "all", label: "All" },
  { id: "mine", label: "My Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function TimelinePageClient({
  workspaceSlug,
}: TimelinePageClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("all");

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="flex flex-col gap-8 p-8 max-w-[1400px] mx-auto">
        {/* Header - matching dashboard style */}
        <div>
          <h1 className="text-2xl font-medium text-white mb-1">Timeline</h1>
          <p className="text-sm text-[#75757a]">
            Activity feed from your workspace
          </p>
        </div>

        {/* Create Post Form with AI features */}
        <CreatePostForm />

        {/* Search and Tab Toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75757a]" />
            <Input
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-[#171719] border-[#1f1f22] text-[#fafafa] placeholder:text-[#75757a] focus:border-[#27272b] rounded-xl"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-[#1f1f22] p-1 bg-[#171719]">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "h-8 px-3 rounded-lg",
                    isActive
                      ? "bg-[#27272b] text-[#fafafa]"
                      : "text-[#75757a] hover:text-[#9c9ca1] hover:bg-transparent"
                  )}
                >
                  {tab.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Timeline Content */}
        <UnifiedTimeline
          workspaceSlug={workspaceSlug}
          searchQuery={searchQuery}
          showMineOnly={activeTab === "mine"}
        />
      </div>
    </div>
  );
}
