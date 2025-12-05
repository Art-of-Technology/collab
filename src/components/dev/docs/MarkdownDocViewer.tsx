'use client';

import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MarkdownDocViewerProps {
  title: string;
  content: string;
}

export function MarkdownDocViewer({ title, content }: MarkdownDocViewerProps) {
  if (!content || content.trim() === '') {
    return (
      <Card className="border-[#1f1f1f] bg-[#101011]">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-2">{title}</h1>
          </div>
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading documentation...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#1f1f1f] bg-[#101011]">
      <CardContent className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">{title}</h1>
        </div>
        <ScrollArea className="h-[calc(100vh-20rem)] max-h-[600px] md:max-h-none">
          <div className="pr-2 sm:pr-4">
            <MarkdownRenderer content={content} className="text-foreground" />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

