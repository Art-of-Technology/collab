"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { SearchResult } from "@/app/api/search/route";

export function useCommandSearch(query: string, workspaceId: string) {
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  return useQuery({
    queryKey: ["command-search", debouncedQuery, workspaceId],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!debouncedQuery.trim() || !workspaceId || debouncedQuery.length < 2) return [];
      
      console.log('Searching for:', debouncedQuery); // Debug log
      
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}&workspace=${workspaceId}&limit=20`
      );
      
      if (!response.ok) {
        console.error('Search API error:', response.status, response.statusText);
        throw new Error("Failed to search");
      }
      
      const results = await response.json();
      console.log('Search results:', results); // Debug log
      return results;
    },
    enabled: !!debouncedQuery.trim() && !!workspaceId && debouncedQuery.length >= 2,
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: false,
  });
}
