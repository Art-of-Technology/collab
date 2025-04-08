'use client';

import { useTags } from "@/hooks/queries/useTag";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TagsClientProps {
  initialData: {
    tags: any[];
    groupedTags: Record<string, any[]>;
    sortedLetters: string[];
  };
}

export default function TagsClient({ initialData }: TagsClientProps) {
  // Use the query hook with initialData for immediate rendering
  const { data, isLoading } = useTags();
  
  // Use the data from query or fall back to initial data
  const { tags, groupedTags, sortedLetters } = data || initialData;
  
  if (isLoading && !initialData) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tags</h1>
        <p className="text-muted-foreground">
          Browse posts by topic
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
          {sortedLetters.map(letter => (
            <div key={letter} className="space-y-2">
              <h2 className="text-xl font-semibold border-b pb-2">{letter}</h2>
              <div className="flex flex-wrap gap-3">
                {groupedTags[letter].map((tag: any) => (
                  <Link 
                    key={tag.id} 
                    href={`/timeline?tag=${encodeURIComponent(tag.name)}`}
                    className="no-underline"
                  >
                    <Badge variant="outline" className="text-sm px-3 py-1 hover:bg-secondary transition-colors whitespace-nowrap">
                      #{tag.name}
                      <span className="ml-2 bg-muted-foreground/20 rounded-full px-2 py-0.5 text-xs">
                        {tag._count.posts}
                      </span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 