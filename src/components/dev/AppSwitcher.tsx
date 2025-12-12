'use client';

import { usePathname } from 'next/navigation';
import { Grid3X3, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export default function AppSwitcher() {
  const pathname = usePathname();
  const currentAppSlug = pathname.match(/\/dev\/apps\/([^\/]+)/)?.[1];

  // Placeholder for future implementation
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-between h-7 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Grid3X3 className="h-4 w-4 flex-shrink-0" />
            <span className="truncate text-xs">
              {currentAppSlug || 'Select App'}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 flex-shrink-0 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 bg-[#090909] border-[#1f1f1f] p-0"
      >
        <div className="p-4 text-center text-xs text-gray-400">
          No apps available
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

