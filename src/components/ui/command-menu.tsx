"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Plus,
  CheckSquare,
  FolderOpen,
  Eye,
  Search,
  Filter,
  Users,
  Tag,
  Lightbulb,
  FileText,
  Clock,
  Copy,
  Settings,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";
import { useCommandSearch } from "@/hooks/queries/useCommandSearch";
import { IssueStatusSelector } from "@/components/issue/selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "@/components/issue/selectors/IssuePrioritySelector";
import { IssueTypeSelector } from "@/components/issue/selectors/IssueTypeSelector";
import { cn } from "@/lib/utils";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateIssue?: () => void;
  onCreateView?: () => void;
  onCreateProject?: () => void;
}

export function CommandMenu({ 
  open, 
  onOpenChange, 
  onCreateIssue,
  onCreateView,
  onCreateProject 
}: CommandMenuProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const runCommand = useCallback((command: () => void) => {
    onOpenChange(false);
    command();
  }, [onOpenChange]);

  const navigateTo = useCallback((path: string) => {
    onOpenChange(false);
    router.push(path);
  }, [onOpenChange, router]);

  const getWorkspacePath = (path: string) => {
    if (!currentWorkspace) return "#";
    return `/${currentWorkspace.slug || currentWorkspace.id}${path}`;
  };

  // Search results
  const { data: searchResults = [], isLoading: isSearching, error } = useCommandSearch(
    search,
    currentWorkspace?.id || ""
  );

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  // Helper function to get icon for search result type
  const getResultIcon = (type: string) => {
    switch (type) {
      case 'user': return <Users className="h-4 w-4" />;
      case 'issue': return <CheckSquare className="h-4 w-4" />;
      case 'view': return <Eye className="h-4 w-4" />;
      case 'project': return <FolderOpen className="h-4 w-4" />;
      case 'note': return <FileText className="h-4 w-4" />;
      case 'post': return <Clock className="h-4 w-4" />;
      case 'tag': return <Tag className="h-4 w-4" />;
      default: return <Search className="h-4 w-4" />;
    }
  };

  // Helper function to get badge color for search result type
  const getResultBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (type) {
      case 'issue': return 'default';
      case 'project': return 'secondary';
      case 'view': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 bg-[#090909] border-[#1f1f1f] shadow-2xl max-w-xl">
        <VisuallyHidden>
          <DialogTitle>Command Menu</DialogTitle>
        </VisuallyHidden>
        <Command className="bg-[#090909] border-[#1f1f1f]" filter={() => 1}>
          <CommandInput
            placeholder="Type a command or search..."
            value={search}
            onValueChange={setSearch}
            className="bg-[#090909] border-[#1f1f1f] text-white placeholder-gray-500 border-0 border-b h-12 px-4 text-sm"
          />
          <CommandList className="bg-[#090909] max-h-[400px] p-1">
          {search.trim().length < 2 && (
            <CommandEmpty className="text-gray-400 py-6 text-center">
              {search.trim().length === 1 ? "Type more to search..." : "Start typing to search..."}
            </CommandEmpty>
          )}
        
        {/* Search Results */}
        {search.trim().length >= 2 && (
          <CommandGroup heading="Search Results" className="text-gray-400 text-xs font-medium px-3 py-1">

            {isSearching ? (
              <CommandItem className="px-3 py-4 text-gray-400 justify-center" value="searching">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                  <span className="text-sm">Searching...</span>
                </div>
              </CommandItem>
            ) : error ? (
              <CommandItem className="px-3 py-4 text-red-400 justify-center" value="error">
                <span className="text-sm">Search failed. Please try again.</span>
              </CommandItem>
            ) : searchResults.length > 0 ? (
              searchResults.slice(0, 8).map((result) => (
              <CommandItem
                key={`${result.type}-${result.id}`}
                value={`${result.type}-${result.id}-${result.title}`}
                onSelect={() => navigateTo(result.url)}
                className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 cursor-pointer transition-colors duration-150 rounded-md mx-1"
              >
                {result.type === 'issue' ? (
                  // Special rendering for issues - more compact
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center text-gray-400 shrink-0">
                        {getResultIcon(result.type)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-xs text-gray-400 capitalize font-medium shrink-0">
                          {result.type}
                        </span>
                        <span className="text-gray-500 shrink-0">›</span>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium text-gray-200">
                            {result.title}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Issue properties using selectors - more compact */}
                    <div className="flex items-center gap-1.5 ml-5">
                      {result.metadata?.issue?.statusValue && (
                        <IssueStatusSelector
                          value={result.metadata.issue.statusValue}
                          onChange={() => {}}
                          readonly={true}
                          projectId={result.metadata.issue.project?.id}
                        />
                      )}
                      {result.metadata?.issue?.priority && (
                        <IssuePrioritySelector
                          value={result.metadata.issue.priority as any}
                          onChange={() => {}}
                          readonly={true}
                        />
                      )}
                      {result.metadata?.issue?.type && (
                        <IssueTypeSelector
                          value={result.metadata.issue.type as any}
                          onChange={() => {}}
                          readonly={true}
                        />
                      )}
                      {result.metadata?.issue?.assignee && (
                        <div
                          className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-auto leading-tight min-h-[20px]",
                            "border border-[#2d2d30] bg-[#181818]",
                            "text-[#cccccc]"
                          )}
                        >
                          <span className="text-[#cccccc] text-xs">{result.metadata.issue.assignee.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Regular rendering for other types - more compact
                  <div className="flex items-center gap-2">
                    <div className="flex items-center text-gray-400 shrink-0">
                      {getResultIcon(result.type)}
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-xs text-gray-400 capitalize font-medium shrink-0">
                        {result.type}
                      </span>
                      <span className="text-gray-500 shrink-0">›</span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium text-gray-200">
                          {result.title}
                        </div>
                        {result.description && (
                          <div className="text-xs text-gray-500 truncate mt-0.5">
                            {result.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CommandItem>
              ))
            ) : (
              <CommandItem className="px-3 py-4 text-gray-400 justify-center" value="no-results">
                <span className="text-sm">No results found</span>
              </CommandItem>
            )}
          </CommandGroup>
        )}
        
        {search.trim().length >= 2 && searchResults.length === 0 && !isSearching && !error && (
          <CommandEmpty className="text-gray-400 py-6 text-center">
            No results found.
          </CommandEmpty>
        )}

        {/* Show actions only when search is empty or too short */}
        {search.trim().length < 2 && (
          <>
        {/* Issues Group */}
        <CommandGroup heading="Issues" className="text-gray-400 text-xs font-medium px-3 py-1">
          <CommandItem
            onSelect={() => runCommand(() => onCreateIssue?.())}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create new issue...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">C</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onCreateIssue?.())}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create issue in fullscreen...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">V</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onCreateIssue?.())}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create new issue from template...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">Alt C</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/issues"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <CheckSquare className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Issues</span>
          </CommandItem>
        </CommandGroup>

        {/* Projects Group */}
        <CommandGroup heading="Projects" className="text-gray-400 text-xs font-medium px-3 py-1">
          <CommandItem
            onSelect={() => runCommand(() => onCreateProject?.())}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create new project...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">P then C</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/projects"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <FolderOpen className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Projects</span>
          </CommandItem>
        </CommandGroup>

        {/* Views Group */}
        <CommandGroup heading="Views" className="text-gray-400 text-xs font-medium px-3 py-1">
          <CommandItem
            onSelect={() => runCommand(() => onCreateView?.())}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span>Create view...</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/views"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Eye className="h-4 w-4 text-gray-400" />
            <span>Go to Views</span>
          </CommandItem>
        </CommandGroup>

        {/* Workspaces Group */}
        <CommandGroup heading="Workspaces" className="text-gray-400 text-xs font-medium px-3 py-1">
          <CommandItem
            onSelect={() => navigateTo("/create-workspace")}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span>Create workspace...</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo("/workspaces")}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Users className="h-4 w-4 text-gray-400" />
            <span>All workspaces</span>
          </CommandItem>
        </CommandGroup>

        {/* Filter Group */}
        <CommandGroup heading="Filter" className="text-gray-400 text-xs font-medium px-3 py-1">
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/search"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Search className="h-4 w-4 text-gray-400" />
            <span>Search workspace...</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              // TODO: Implement in-view filter functionality
              toast({
                title: "Coming soon",
                description: "Find in view functionality will be available soon",
              });
            }}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Search className="h-4 w-4 text-gray-400" />
            <span>Find in view...</span>
            <CommandShortcut>Ctrl F</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              // TODO: Implement filter functionality
              toast({
                title: "Coming soon", 
                description: "Filter functionality will be available soon",
              });
            }}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Filter className="h-4 w-4 text-gray-400" />
            <span>Filter...</span>
            <CommandShortcut>F</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Navigation Group */}
        <CommandGroup heading="Navigation" className="text-gray-400 text-xs font-medium px-3 py-1">
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/timeline"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Clock className="h-4 w-4 text-gray-400" />
            <span>Go to Timeline</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/notes"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <FileText className="h-4 w-4 text-gray-400" />
            <span>Go to Notes</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/features"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Lightbulb className="h-4 w-4 text-gray-400" />
            <span>Go to Feature Requests</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/tags"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Tag className="h-4 w-4 text-gray-400" />
            <span>Go to Tags</span>
          </CommandItem>
        </CommandGroup>

        {/* Utilities Group */}
        <CommandGroup heading="Utilities" className="text-gray-400 text-xs font-medium px-3 py-1">
          <CommandItem
            onSelect={() => runCommand(() => copyToClipboard(window.location.href, "Current URL"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Copy className="h-4 w-4 text-gray-400" />
            <span>Copy current URL</span>
          </CommandItem>
          {currentWorkspace && (
            <CommandItem
              onSelect={() => runCommand(() => copyToClipboard(currentWorkspace.id, "Workspace ID"))}
              className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
            >
              <Copy className="h-4 w-4 text-gray-400" />
              <span>Copy workspace ID</span>
            </CommandItem>
          )}
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/profile"))}
            className="px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] hover:text-gray-200 flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md mx-1"
          >
            <Settings className="h-4 w-4 text-gray-400" />
            <span>Go to Profile Settings</span>
          </CommandItem>
        </CommandGroup>
          </>
        )}
        </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// Hook for keyboard shortcut
export function useCommandMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}
