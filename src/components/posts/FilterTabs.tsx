"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function FilterTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get("filter") || "all";

  const filters = [
    { key: "all", label: "All" },
    { key: "updates", label: "Updates" },
    { key: "blockers", label: "Blockers" },
    { key: "ideas", label: "Ideas" },
    { key: "questions", label: "Questions" },
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
    <div className="mb-6">
      <Tabs 
        defaultValue={currentFilter} 
        onValueChange={handleFilterChange}
        className="w-full"
      >
        <TabsList className="grid grid-cols-5 w-full">
          {filters.map((filter) => (
            <TabsTrigger 
              key={filter.key}
              value={filter.key}
              className="px-1 sm:px-3 text-xs sm:text-sm"
            >
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
} 