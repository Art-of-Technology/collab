"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, FileText, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { NoteType, NoteScope } from "@prisma/client";
import { NOTE_TYPE_CONFIGS } from "@/lib/note-types";
import Link from "next/link";

interface SearchResult {
  id: string;
  title: string;
  type: NoteType;
  scope: NoteScope;
  excerpt: string;
  matchScore: number;
  isPinned: boolean;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  project: {
    id: string;
    name: string;
    slug: string;
  } | null;
  updatedAt: string;
}

interface NoteSearchProps {
  workspaceId: string;
  workspaceSlug: string;
  projectId?: string;
  onResultClick?: (noteId: string) => void;
  placeholder?: string;
  className?: string;
}

export function NoteSearch({
  workspaceId,
  workspaceSlug,
  projectId,
  onResultClick,
  placeholder = "Search context pages...",
  className
}: NoteSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Perform search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        workspaceId,
        limit: "5"
      });

      if (projectId) {
        params.set("projectId", projectId);
      }

      const response = await fetch(`/api/notes/search?${params}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, projectId]);

  // Effect to trigger search on debounced query change
  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery);
      setIsOpen(true);
    } else {
      setResults([]);
      setTotal(0);
    }
  }, [debouncedQuery, performSearch]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleResultClick(results[selectedIndex].id);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Handle result click
  const handleResultClick = (noteId: string) => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(-1);
    if (onResultClick) {
      onResultClick(noteId);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-9 pr-8"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (query.length >= 2 || results.length > 0) && (
        <div
          ref={resultsRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-[400px] overflow-auto"
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length > 0 ? (
            <>
              <div className="p-2 space-y-1">
                {results.map((result, index) => {
                  const typeConfig = NOTE_TYPE_CONFIGS[result.type];
                  const TypeIcon = typeConfig?.icon || FileText;

                  return (
                    <Link
                      key={result.id}
                      href={`/${workspaceSlug}/notes/${result.id}`}
                      onClick={() => handleResultClick(result.id)}
                      className={cn(
                        "block p-2 rounded-md hover:bg-accent cursor-pointer",
                        selectedIndex === index && "bg-accent"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <TypeIcon
                          className="h-4 w-4 mt-0.5 shrink-0"
                          style={{ color: typeConfig?.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {result.title}
                            </span>
                            {result.isPinned && (
                              <span className="text-xs text-amber-500">Pinned</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {result.excerpt}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{result.author.name}</span>
                            {result.project && (
                              <>
                                <span>•</span>
                                <span>{result.project.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {total > results.length && (
                <div className="p-2 border-t text-center">
                  <Link
                    href={`/${workspaceSlug}/notes?search=${encodeURIComponent(query)}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View all {total} results
                  </Link>
                </div>
              )}
            </>
          ) : query.length >= 2 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No results found for &quot;{query}&quot;
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
