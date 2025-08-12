"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function FilterTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get("filter") || "all";

  const filters = [
    { key: "all", label: "All", mobileLabel: "All" },
    { key: "updates", label: "Updates", mobileLabel: "Updates" },
    { key: "blockers", label: "Blockers", mobileLabel: "Blockers" },
    { key: "ideas", label: "Ideas", mobileLabel: "Ideas" },
    { key: "questions", label: "Questions", mobileLabel: "Questions" },
  ];

  const handleFilterChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      
      if (value === "all") {
        params.delete("filter");
      } else {
        params.set("filter", value);
      }
      
      const newPath = `${window.location.pathname}?${params.toString()}`;
      router.push(newPath);
    },
    [router, searchParams]
  );

  return (
    <div className="mb-4 sm:mb-6">
      <Tabs 
        defaultValue={currentFilter} 
        onValueChange={handleFilterChange}
        className="w-full"
      >
        <TabsList className="grid grid-cols-5 w-full h-auto p-1 gap-0.5 sm:gap-1 bg-muted/50">
          {filters.map((filter) => (
            <TabsTrigger 
              key={filter.key}
              value={filter.key}
              className="px-0.5 sm:px-2 md:px-3 py-2 sm:py-2.5 text-[9px] sm:text-xs md:text-sm font-medium min-h-[32px] sm:min-h-[36px] flex items-center justify-center hover:bg-background/80 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
} 