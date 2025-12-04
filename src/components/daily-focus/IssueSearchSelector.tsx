"use client";

import { useState, useMemo } from 'react';
import { useIssuesByWorkspace } from '@/hooks/queries/useIssues';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IssueSearchSelectorProps {
  workspaceId: string;
  projectIds?: string[];
  selectedIssueIds?: string[];
  onSelectIssue: (issueId: string) => void;
  placeholder?: string;
  className?: string;
}

export function IssueSearchSelector({
  workspaceId,
  projectIds,
  selectedIssueIds = [],
  onSelectIssue,
  placeholder = "Search issues...",
  className,
}: IssueSearchSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: issuesData, isLoading } = useIssuesByWorkspace(workspaceId, projectIds);
  const issues = issuesData?.issues || [];

  // Filter out already selected issues and apply search
  const filteredIssues = useMemo(() => {
    let filtered = issues.filter(issue => !selectedIssueIds.includes(issue.id));
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(issue =>
        issue.title?.toLowerCase().includes(query) ||
        issue.issueKey?.toLowerCase().includes(query) ||
        issue.project?.name?.toLowerCase().includes(query) ||
        issue.description?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [issues, selectedIssueIds, searchQuery]);

  // Group by project
  const groupedIssues = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredIssues.forEach(issue => {
      const projectName = issue.project?.name || 'No Project';
      if (!groups[projectName]) {
        groups[projectName] = [];
      }
      groups[projectName].push(issue);
    });
    return groups;
  }, [filteredIssues]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-start text-left font-normal", className)}
        >
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search issues..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandEmpty>
            {isLoading ? 'Loading issues...' : 'No issues found.'}
          </CommandEmpty>
          <div className="max-h-[300px] overflow-y-auto">
            {Object.entries(groupedIssues).map(([projectName, projectIssues]) => (
              <CommandGroup key={projectName} heading={projectName}>
                {projectIssues.map((issue) => (
                  <CommandItem
                    key={issue.id}
                    value={issue.id}
                    onSelect={() => {
                      onSelectIssue(issue.id);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-mono">
                            {issue.issueKey}
                          </span>
                          <span className="text-sm truncate">{issue.title}</span>
                        </div>
                        {issue.assignee && (
                          <div className="text-xs text-gray-500 mt-1">
                            Assigned to {issue.assignee.name}
                          </div>
                        )}
                      </div>
                      {issue.priority && (
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          issue.priority === 'URGENT' && "bg-red-500/20 text-red-400",
                          issue.priority === 'HIGH' && "bg-orange-500/20 text-orange-400",
                          issue.priority === 'MEDIUM' && "bg-yellow-500/20 text-yellow-400",
                          issue.priority === 'LOW' && "bg-blue-500/20 text-blue-400"
                        )}>
                          {issue.priority.toLowerCase()}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


