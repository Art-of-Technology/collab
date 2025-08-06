'use client';

import { useTags } from "@/hooks/queries/useTag";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";

interface TagsClientProps {
  initialData: {
    tags: any[];
    groupedTags: Record<string, any[]>;
    sortedLetters: string[];
  };
}

export default function TagsClient({ initialData }: TagsClientProps) {
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  
  // Use the query hook with initialData for immediate rendering
  const { data, isLoading } = useTags();
  
  // Use the data from query or fall back to initial data
  const { tags, groupedTags, sortedLetters } = data || initialData;
  
  // State for keyboard navigation
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Create a flat array of all tags for easier navigation
  const flatTags = useMemo(() => {
    const allTags: any[] = [];
    sortedLetters.forEach(letter => {
      groupedTags[letter].forEach(tag => {
        allTags.push(tag);
      });
    });
    return allTags;
  }, [groupedTags, sortedLetters]);
  
  // Handle keyboard navigation - simple pattern like CommandMenu
  useEffect(() => {
    console.log('TagsClient useEffect - flatTags.length:', flatTags.length);
    if (!flatTags.length) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('TagsClient keydown:', e.key, 'target:', e.target);
      
      // Only handle if there are tags and we're not in an input/textarea
      if ((e.target as HTMLElement).tagName === 'INPUT' || 
          (e.target as HTMLElement).tagName === 'TEXTAREA' ||
          (e.target as HTMLElement).contentEditable === 'true') {
        console.log('TagsClient: Ignoring key - in input/textarea');
        return;
      }
      
      // Arrow keys for navigation
      if (e.key === "ArrowDown") {
        console.log('TagsClient: ArrowDown pressed');
        e.preventDefault();
        e.stopPropagation();
        setIsKeyboardNavigation(true);
        setSelectedIndex((prev) => {
          // If no item is selected (-1), start from 0
          if (prev === -1) return 0;
          // Otherwise move to next item
          return prev < flatTags.length - 1 ? prev + 1 : prev;
        });
      } else if (e.key === "ArrowUp") {
        console.log('TagsClient: ArrowUp pressed');
        e.preventDefault();
        e.stopPropagation();
        setIsKeyboardNavigation(true);
        setSelectedIndex((prev) => {
          // If no item is selected (-1), start from last item
          if (prev === -1) return flatTags.length - 1;
          // Otherwise move to previous item
          return prev > 0 ? prev - 1 : prev;
        });
      } else if (e.key === "Enter" && selectedIndex >= 0 && flatTags[selectedIndex]) {
        console.log('TagsClient: Enter pressed');
        e.preventDefault();
        e.stopPropagation();
        const selectedTag = flatTags[selectedIndex];
        if (currentWorkspace) {
          router.push(`/${currentWorkspace.id}/timeline?tag=${encodeURIComponent(selectedTag.name)}`);
        }
      } else if (e.key === "Escape") {
        console.log('TagsClient: Escape pressed');
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(-1);
        setIsKeyboardNavigation(false);
      }
    };
    
    console.log('TagsClient: Adding keyboard event listener');
    // Add event listener to document with capture phase
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      console.log('TagsClient: Removing keyboard event listener');
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [flatTags, selectedIndex, currentWorkspace, router]);
  
  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedIndex >= 0 && isKeyboardNavigation && containerRef.current) {
      const selectedElement = containerRef.current.querySelector(`[data-tag-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [selectedIndex, isKeyboardNavigation]);
  
  // Reset keyboard navigation when mouse is used
  const handleMouseEnter = () => {
    setIsKeyboardNavigation(false);
  };
  
  if (isLoading && !initialData) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
      return (
      <div 
        className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden" 
        ref={containerRef}
      >
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Tags</h1>
          <p className="text-muted-foreground">
            Browse posts by topic (Use arrow keys to navigate, Enter to select)
          </p>
          <p className="text-xs text-gray-500">
            Debug: selectedIndex={selectedIndex}, isKeyboardNavigation={isKeyboardNavigation.toString()}, flatTags.length={flatTags.length}
          </p>
        </div>
      
      {tags.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No tags have been created yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedLetters.map(letter => {
            const letterTags = groupedTags[letter];
            const startIndex = flatTags.findIndex(tag => letterTags[0] && tag.id === letterTags[0].id);
            
            return (
              <div key={letter} className="space-y-2">
                <h2 className="text-xl font-semibold border-b pb-2">{letter}</h2>
                <div className="flex flex-wrap gap-3">
                  {letterTags.map((tag: any, index: number) => {
                    const globalIndex = startIndex + index;
                    const isSelected = selectedIndex === globalIndex;
                    
                    return (
                      <Link 
                        key={tag.id} 
                        href={currentWorkspace ? `/${currentWorkspace.id}/timeline?tag=${encodeURIComponent(tag.name)}` : '#'}
                        className="no-underline"
                        onMouseEnter={handleMouseEnter}
                      >
                        <Badge 
                          variant="outline" 
                          className={`text-sm px-3 py-1 transition-colors whitespace-nowrap ${
                            isSelected && isKeyboardNavigation 
                              ? 'bg-primary text-primary-foreground' 
                              : 'hover:bg-secondary'
                          }`}
                          data-tag-index={globalIndex}
                        >
                          #{tag.name}
                          <span className="ml-2 bg-muted-foreground/20 rounded-full px-2 py-0.5 text-xs">
                            {tag._count.posts}
                          </span>
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 