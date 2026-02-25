"use client";

import { useState } from "react";
import UnifiedTimeline from "@/components/timeline/UnifiedTimeline";
import CreatePostForm from "@/components/posts/CreatePostForm";
import { PageLayout } from "@/components/ui/page-layout";
import { PageHeader } from "@/components/ui/page-header";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterToggle } from "@/components/ui/filter-toggle";

interface TimelinePageClientProps {
  workspaceId: string;
  workspaceSlug: string;
}

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

  const filterOptions = TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
  }));

  return (
    <PageLayout className="gap-8">
      <PageHeader
        title="Timeline"
        subtitle="Activity feed from your workspace"
      >
        <div className="flex items-center gap-3">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search activities..."
          />
          <FilterToggle
            options={filterOptions}
            value={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
          />
        </div>
      </PageHeader>

      {/* Create Post Form with AI features */}
      <CreatePostForm />

      {/* Timeline Content */}
      <UnifiedTimeline
        workspaceSlug={workspaceSlug}
        searchQuery={searchQuery}
        showMineOnly={activeTab === "mine"}
      />
    </PageLayout>
  );
}
