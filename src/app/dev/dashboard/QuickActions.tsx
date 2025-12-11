import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Book, ExternalLink } from 'lucide-react';

export default function QuickActions() {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <Link href="/dev/apps/new">
        <Button size="sm" className="h-8 sm:h-9">
          <Plus className="h-4 w-4 mr-1.5 sm:mr-2" />
          <span className="hidden sm:inline">Create App</span>
          <span className="sm:hidden">Create</span>
        </Button>
      </Link>
      
      <Link href="/dev/docs" target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm" className="h-8 sm:h-9">
          <Book className="h-4 w-4 mr-1.5 sm:mr-2" />
          <span className="hidden sm:inline">Documentation</span>
          <span className="sm:hidden">Docs</span>
          <ExternalLink className="h-3 w-3 ml-1.5 sm:ml-2" />
        </Button>
      </Link>
    </div>
  );
}

