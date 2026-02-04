"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Home,
  CheckSquare,
  Users,
  FolderOpen,
  Eye,
  Plus,
  FileText,
  Bookmark,
  Tag,
  Bell,
  Settings,
  LogOut,
  MoreHorizontal,
  Star,
  Sparkles,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useProjects } from "@/hooks/queries/useProjects";
import { useViews } from "@/hooks/queries/useViews";
import { useAIWidget } from "@/hooks/useAI";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMention } from "@/context/MentionContext";
import WorkspaceSelector from "@/components/workspace/WorkspaceSelector";
import CreateViewModal from "@/components/modals/CreateViewModal";
import CreateProjectModal from "@/components/modals/CreateProjectModal";

interface SimplifiedSidebarProps {
  pathname?: string;
  isCollapsed?: boolean;
}

export default function SimplifiedSidebar({
  pathname = "",
  isCollapsed = false,
}: SimplifiedSidebarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const { data: userData } = useCurrentUser();
  const { openWidget } = useAIWidget();
  const workspaceBase = currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}` : "";

  const { unreadCount } = useMention();

  // Fetch projects and views
  const { data: projects = [] } = useProjects({
    workspaceId: currentWorkspace?.id,
    includeStats: true,
  });

  const { data: views = [] } = useViews({
    workspaceId: currentWorkspace?.id,
    includeStats: true,
  });

  // State
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    projects: false,
    views: false,
    more: true, // More section collapsed by default
  });

  // Filter active projects
  const activeProjects = useMemo(() => {
    return projects.filter(p => !p.isArchived).slice(0, 10);
  }, [projects]);

  // Filter favorite views
  const favoriteViews = useMemo(() => {
    return views.filter(v => v.isFavorite).slice(0, 8);
  }, [views]);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    toast({ title: "Signed out", description: "You have been signed out" });
    router.push("/");
  };

  // Main navigation items
  const mainNav = [
    {
      name: "Home",
      href: `${workspaceBase}/dashboard`,
      icon: Home,
      current: pathname.includes("/dashboard"),
    },
    {
      name: "My Work",
      href: `${workspaceBase}/views/my-issues`,
      icon: CheckSquare,
      current: pathname.includes("/my-issues"),
    },
    {
      name: "Team",
      href: `${workspaceBase}/timeline`,
      icon: Users,
      current: pathname.includes("/timeline"),
    },
  ];

  // More section items (collapsed by default)
  const moreItems = [
    {
      name: "Context",
      href: `${workspaceBase}/notes`,
      icon: FileText,
      current: pathname.includes("/notes"),
    },
    {
      name: "Saved",
      href: `${workspaceBase}/bookmarks`,
      icon: Bookmark,
      current: pathname.includes("/bookmarks"),
    },
    {
      name: "Tags",
      href: `${workspaceBase}/tags`,
      icon: Tag,
      current: pathname.includes("/tags"),
    },
  ];

  // Collapsed sidebar render
  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full py-2">
        {/* Logo */}
        <div className="px-2 mb-4">
          <Link href={`${workspaceBase}/dashboard`} className="flex justify-center">
            <Image src="/logo-icon.svg" width={28} height={28} alt="Collab" />
          </Link>
        </div>

        {/* Main nav icons */}
        <div className="px-2 space-y-1">
          {mainNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center justify-center h-9 w-full rounded-lg transition-colors",
                item.current
                  ? "bg-[#1f1f1f] text-white"
                  : "text-[#71717a] hover:text-white hover:bg-[#1f1f1f]"
              )}
              title={item.name}
            >
              <item.icon className="h-5 w-5" />
            </Link>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* AI Button */}
        <div className="px-2 mb-2">
          <button
            onClick={openWidget}
            className="flex items-center justify-center h-9 w-full rounded-lg bg-[#8b5cf6]/10 text-[#8b5cf6] hover:bg-[#8b5cf6]/20 transition-colors"
            title="AI Assistant"
          >
            <Sparkles className="h-5 w-5" />
          </button>
        </div>

        {/* User */}
        <div className="px-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center w-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={userData?.image || undefined} />
                  <AvatarFallback className="text-xs bg-[#1f1f1f]">
                    {userData?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => router.push(`${workspaceBase}/settings`)}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // Expanded sidebar render
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between">
          <Link href={`${workspaceBase}/dashboard`} className="flex items-center">
            <Image src="/logo-text.svg" width={100} height={28} alt="Collab" />
          </Link>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
                document.dispatchEvent(event);
              }}
              className="text-[#71717a] hover:text-white"
              title="Search (⌘K)"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative text-[#71717a] hover:text-white"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-red-500">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Workspace Selector */}
        <div className="mt-3">
          <WorkspaceSelector />
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        {/* Main Navigation */}
        <div className="px-2 space-y-0.5">
          {mainNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                item.current
                  ? "bg-[#1f1f1f] text-white"
                  : "text-[#a1a1aa] hover:text-white hover:bg-[#1f1f1f]"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.name}</span>
            </Link>
          ))}
        </div>

        {/* Divider */}
        <div className="my-3 mx-3 border-t border-[#1f1f1f]" />

        {/* Projects Section */}
        <div className="px-2">
          <Collapsible open={!collapsedSections.projects} onOpenChange={() => toggleSection("projects")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-medium text-[#52525b] uppercase tracking-wider hover:text-[#71717a]">
              <span>Projects</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreateProjectModal(true);
                  }}
                  className="p-0.5 hover:bg-[#1f1f1f] rounded"
                >
                  <Plus className="h-3 w-3" />
                </button>
                {collapsedSections.projects ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 mt-1">
              {activeProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`${workspaceBase}/projects/${project.slug}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    pathname.includes(`/projects/${project.slug}`)
                      ? "bg-[#1f1f1f] text-white"
                      : "text-[#a1a1aa] hover:text-white hover:bg-[#1f1f1f]"
                  )}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color || "#6366f1" }}
                  />
                  <span className="truncate">{project.name}</span>
                  {project._count?.issues !== undefined && (
                    <span className="ml-auto text-[10px] text-[#52525b]">
                      {project._count.issues}
                    </span>
                  )}
                </Link>
              ))}
              {activeProjects.length === 0 && (
                <div className="px-3 py-2 text-xs text-[#52525b]">No projects yet</div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Divider */}
        <div className="my-2 mx-3 border-t border-[#1f1f1f]" />

        {/* Views Section */}
        <div className="px-2">
          <Collapsible open={!collapsedSections.views} onOpenChange={() => toggleSection("views")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-medium text-[#52525b] uppercase tracking-wider hover:text-[#71717a]">
              <span>Views</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreateViewModal(true);
                  }}
                  className="p-0.5 hover:bg-[#1f1f1f] rounded"
                >
                  <Plus className="h-3 w-3" />
                </button>
                {collapsedSections.views ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 mt-1">
              {favoriteViews.map((view) => (
                <Link
                  key={view.id}
                  href={`${workspaceBase}/views/${view.slug || view.id}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    pathname.includes(`/views/${view.slug || view.id}`)
                      ? "bg-[#1f1f1f] text-white"
                      : "text-[#a1a1aa] hover:text-white hover:bg-[#1f1f1f]"
                  )}
                >
                  {view.isFavorite && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
                  <Eye className="h-3.5 w-3.5 text-[#52525b]" />
                  <span className="truncate">{view.name}</span>
                </Link>
              ))}
              {favoriteViews.length === 0 && (
                <div className="px-3 py-2 text-xs text-[#52525b]">Star views to pin them here</div>
              )}
              <Link
                href={`${workspaceBase}/views`}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#52525b] hover:text-[#71717a]"
              >
                View all views →
              </Link>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Divider */}
        <div className="my-2 mx-3 border-t border-[#1f1f1f]" />

        {/* More Section */}
        <div className="px-2">
          <Collapsible open={!collapsedSections.more} onOpenChange={() => toggleSection("more")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-medium text-[#52525b] uppercase tracking-wider hover:text-[#71717a]">
              <span>More</span>
              {collapsedSections.more ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 mt-1">
              {moreItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    item.current
                      ? "bg-[#1f1f1f] text-white"
                      : "text-[#a1a1aa] hover:text-white hover:bg-[#1f1f1f]"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-[#1f1f1f]">
        {/* AI Assistant Button */}
        <Button
          variant="ai"
          className="w-full mb-3 justify-start"
          onClick={openWidget}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          AI Assistant
          <span className="ml-auto text-[10px] opacity-60">⌘J</span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-[#1f1f1f] transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarImage src={userData?.image || undefined} />
                <AvatarFallback className="text-xs bg-[#27272a]">
                  {userData?.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm text-white truncate">{userData?.name || "User"}</p>
                <p className="text-[10px] text-[#52525b] truncate">{userData?.email}</p>
              </div>
              <MoreHorizontal className="h-4 w-4 text-[#52525b]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => router.push(`${workspaceBase}/settings`)}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-400">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Modals */}
      <CreateViewModal
        open={showCreateViewModal}
        onClose={() => setShowCreateViewModal(false)}
        workspaceId={currentWorkspace?.id || ""}
      />
      <CreateProjectModal
        open={showCreateProjectModal}
        onClose={() => setShowCreateProjectModal(false)}
      />
    </div>
  );
}
