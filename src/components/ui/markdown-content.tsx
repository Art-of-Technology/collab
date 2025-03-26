"use client";

import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div 
      className={cn(
        "prose prose-sm dark:prose-invert max-w-full",
        "prose-headings:mt-2 prose-headings:mb-1 prose-headings:font-semibold prose-p:my-1.5",
        "prose-pre:bg-muted prose-pre:text-muted-foreground prose-pre:p-2 prose-pre:rounded-md",
        "prose-code:text-primary prose-code:font-medium",
        "prose-a:text-primary prose-a:underline prose-a:underline-offset-2",
        "prose-img:my-1 prose-img:rounded-md",
        "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:my-1",
        className
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
} 