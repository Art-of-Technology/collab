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
  X,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";
import { useCommandSearch } from "@/hooks/queries/useCommandSearch";
import { cn } from "@/lib/utils";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
      <DialogContent 
        className={cn(
          "overflow-hidden p-0 shadow-2xl border-0",
          // Mobile: Full screen with glassmorphism
          "md:max-w-2xl md:max-h-[80vh]",
          "max-md:w-full max-md:h-full max-md:max-w-none max-md:max-h-none max-md:rounded-none",
          // Desktop: Floating dock-like design
          "bg-black/40 backdrop-blur-xl md:border md:border-white/10 md:rounded-2xl",
        )}
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <VisuallyHidden>
          <DialogTitle>Command Menu</DialogTitle>
        </VisuallyHidden>
        <Command 
          className={cn(
            "border-0",
            "bg-transparent", // Transparent on desktop for glassmorphism
          )} 
          filter={() => 1}
        >
          {/* Desktop: Input at top */}
          <div className={cn(
            "sticky top-0 z-10",
            "bg-black/60 backdrop-blur-xl", // Glassmorphism header on desktop
            "border-b border-white/10",
            "relative" // For positioning close button
          )}>
            <CommandInput
              placeholder="Type a command or search..."
              value={search}
              onValueChange={setSearch}
              className={cn(
                "text-white placeholder-gray-400 border-0 bg-transparent",
                "h-12 px-4 pr-12 md:pr-4 text-sm", // Extra right padding on mobile for close button
                "focus:ring-0 focus:outline-none"
              )}
            />
            {/* Close button - Mobile only */}
            <button
              onClick={() => onOpenChange(false)}
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2",
                "md:hidden", // Only show on mobile
                "h-8 w-8 rounded-full",
                "flex items-center justify-center",
                "text-gray-400 hover:text-white",
                "hover:bg-white/10 transition-all duration-200",
                "touch-manipulation" // Better touch interaction
              )}
              aria-label="Close command menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <CommandList 
            className={cn(
              "bg-transparent", // Transparent on desktop
              "md:h-[400px]", // Fixed height on desktop
              "max-md:flex-1 max-md:flex max-md:flex-col", // Mobile: flex column reverse
              "overflow-y-auto", // Always scrollable
              "p-1" // More compact padding
            )}
          >
          {search.trim().length < 2 && (
            <CommandEmpty className={cn(
              "text-gray-400 text-center",
              "hover:bg-white/10 aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "py-6 md:py-4",
              "text-sm"
            )}>
              {search.trim().length === 1 ? "Type more to search..." : "Start typing to search..."}
            </CommandEmpty>
          )}
        
        {/* Search Results */}
        {search.trim().length >= 2 && (
          <CommandGroup 
            heading="Search Results" 
            className={cn(
              "text-gray-400 font-medium px-3 py-1",
              "text-xs" // Compact and consistent
            )}
          >
            {isSearching ? (
              <CommandItem 
                className={cn(
                  "text-gray-400 justify-center",
                  "hover:bg-white/10 aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
                  "px-3 py-4"
                )} 
                value="searching"
              >
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                  <span className="text-sm">Searching...</span>
                </div>
              </CommandItem>
            ) : error ? (
              <CommandItem 
                className={cn(
                  "text-red-400 justify-center",
                  "hover:bg-white/10 aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
                  "px-3 py-4"
                )} 
                value="error"
              >
                <span className="text-sm">Search failed. Please try again.</span>
              </CommandItem>
            ) : searchResults.length > 0 ? (
              <div className="flex flex-col">
                {searchResults.slice(0, 8).map((result) => (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  value={`${result.type}-${result.id}-${result.title}`}
                  onSelect={() => navigateTo(result.url)}
                  className={cn(
                    "text-gray-300 cursor-pointer transition-all duration-200 rounded-lg",
                    "hover:bg-white/10 hover:text-white",
                    "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
                    "px-3 py-2",
                    "mx-1"
                  )}
                >
                {result.type === 'user' ? (
                  // User rendering with profile image
                  <div className="flex items-center gap-2 w-full min-w-0">
                    {result.metadata?.user?.useCustomAvatar ? (
                      <CustomAvatar user={result.metadata.user} size="sm" className="h-6 w-6 shrink-0" />
                    ) : (
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarImage src={result.metadata?.user?.image || ''} alt={result.title} />
                        <AvatarFallback className="text-xs bg-gray-700 text-gray-300">
                          {result.title.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 capitalize font-medium shrink-0">
                          user
                        </span>
                        <span className="text-gray-500 shrink-0">›</span>
                        <div className="truncate text-sm font-medium text-gray-200 flex-1">
                          {result.title}
                        </div>
                      </div>
                      {result.description && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {result.description}
                        </div>
                      )}
                    </div>
                  </div>
                ) : result.type === 'issue' ? (
                  // Clean issue rendering with metadata
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <div className="flex items-center text-gray-400 shrink-0">
                      {getResultIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 capitalize font-medium shrink-0">
                          {result.type}
                        </span>
                        <span className="text-gray-500 shrink-0">›</span>
                        <div className="truncate text-sm font-medium text-gray-200 flex-1">
                          {result.title}
                        </div>
                      </div>
                      {/* Clean metadata line */}
                      {(result.metadata?.issue?.statusValue || result.metadata?.issue?.priority || result.metadata?.issue?.assignee) && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {[
                            result.metadata?.issue?.statusValue,
                            result.metadata?.issue?.priority?.toLowerCase(),
                            result.metadata?.issue?.assignee?.name && `assigned to ${result.metadata.issue.assignee.name}`
                          ].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Compact rendering for other types
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <div className="flex items-center text-gray-400 shrink-0">
                      {getResultIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 capitalize font-medium shrink-0">
                          {result.type}
                        </span>
                        <span className="text-gray-500 shrink-0">›</span>
                        <div className="truncate text-sm font-medium text-gray-200 flex-1">
                          {result.title}
                        </div>
                      </div>
                      {result.description && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {result.description.length > 60 ? `${result.description.substring(0, 60)}...` : result.description}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </CommandItem>
                ))}
              </div>
            ) : (
              <CommandItem 
                className={cn(
                  "text-gray-400 justify-center",
                  "hover:bg-white/10 aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
                  "px-3 py-4"
                )} 
                value="no-results"
              >
                <span className="text-sm">No results found</span>
              </CommandItem>
            )}
          </CommandGroup>
        )}
        
        {search.trim().length >= 2 && searchResults.length === 0 && !isSearching && !error && (
          <CommandEmpty className={cn(
            "text-gray-400 text-center",
            "hover:bg-white/10 aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
            "py-6 md:py-4",
            "text-sm"
          )}>
            No results found.
          </CommandEmpty>
        )}

        {/* Show actions only when search is empty or too short */}
        {search.trim().length < 2 && (
          <>
        {/* Issues Group */}
        <CommandGroup 
          heading="Issues" 
          className={cn(
            "text-gray-400 font-medium px-3 py-1",
            "text-xs"
          )}
        >
          <CommandItem
            onSelect={() => runCommand(() => onCreateIssue?.())}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create new issue...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">C</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onCreateIssue?.())}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create issue in fullscreen...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">V</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onCreateIssue?.())}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create new issue from template...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">Alt C</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/views"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Eye className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Views</span>
          </CommandItem>
        </CommandGroup>

        {/* Projects Group */}
        <CommandGroup 
          heading="Projects" 
          className={cn(
            "text-gray-400 font-medium px-3 py-1",
            "text-xs"
          )}
        >
          <CommandItem
            onSelect={() => runCommand(() => onCreateProject?.())}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create new project...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">P then C</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/projects"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <FolderOpen className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Projects</span>
          </CommandItem>
        </CommandGroup>

        {/* Views Group */}
        <CommandGroup 
          heading="Views" 
          className={cn(
            "text-gray-400 font-medium px-3 py-1",
            "text-xs"
          )}
        >
          <CommandItem
            onSelect={() => runCommand(() => onCreateView?.())}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create view...</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/views"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Eye className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Views</span>
          </CommandItem>
        </CommandGroup>

        {/* Workspaces Group */}
        <CommandGroup 
          heading="Workspaces" 
          className={cn(
            "text-gray-400 font-medium px-3 py-1",
            "text-xs"
          )}
        >
          <CommandItem
            onSelect={() => navigateTo("/create-workspace")}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Plus className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Create workspace...</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo("/workspaces")}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Users className="h-4 w-4 text-gray-400" />
            <span className="text-sm">All workspaces</span>
          </CommandItem>
        </CommandGroup>

        {/* Filter Group */}
        <CommandGroup 
          heading="Filter" 
          className={cn(
            "text-gray-400 font-medium px-3 py-1",
            "text-xs"
          )}
        >
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/search"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Search className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Search workspace...</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              // TODO: Implement in-view filter functionality
              toast({
                title: "Coming soon",
                description: "Find in view functionality will be available soon",
              });
            }}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Search className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Find in view...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">Ctrl F</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              // TODO: Implement filter functionality
              toast({
                title: "Coming soon", 
                description: "Filter functionality will be available soon",
              });
            }}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Filter...</span>
            <CommandShortcut className="ml-auto text-xs text-gray-500">F</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Navigation Group */}
        <CommandGroup 
          heading="Navigation" 
          className={cn(
            "text-gray-400 font-medium px-3 py-1",
            "text-xs"
          )}
        >
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/timeline"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Timeline</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/notes"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <FileText className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Notes</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/features"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Lightbulb className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Feature Requests</span>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/tags"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Tag className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Tags</span>
          </CommandItem>
        </CommandGroup>

        {/* Utilities Group */}
        <CommandGroup 
          heading="Utilities" 
          className={cn(
            "text-gray-400 font-medium px-3 py-1",
            "text-xs"
          )}
        >
          <CommandItem
            onSelect={() => runCommand(() => copyToClipboard(window.location.href, "Current URL"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Copy className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Copy current URL</span>
          </CommandItem>
          {currentWorkspace && (
            <CommandItem
              onSelect={() => runCommand(() => copyToClipboard(currentWorkspace.id, "Workspace ID"))}
              className={cn(
                "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
                "hover:bg-white/10 hover:text-white",
                "px-3 py-1.5",
                "mx-1"
              )}
            >
              <Copy className="h-4 w-4 text-gray-400" />
              <span className="text-sm">Copy workspace ID</span>
            </CommandItem>
          )}
          <CommandItem
            onSelect={() => navigateTo(getWorkspacePath("/profile"))}
            className={cn(
              "text-gray-300 flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg",
              "hover:bg-white/10 hover:text-white",
              "aria-selected:bg-white/10 data-[selected=true]:bg-white/10",
              "px-3 py-1.5",
              "mx-1"
            )}
          >
            <Settings className="h-4 w-4 text-gray-400" />
            <span className="text-sm">Go to Profile Settings</span>
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
