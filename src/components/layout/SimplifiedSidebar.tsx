"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Home,
  Eye,
  Plus,
  FileText,
  Settings,
  LogOut,
  Star,
  Sparkles,
  Lightbulb,
  Grid3X3,
  MessageSquare,
  FolderKanban,
  ChevronDown,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useInstalledApps } from "@/hooks/queries/useInstalledApps";
import { useAIWidget, useAIAgents } from "@/hooks/useAI";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import WorkspaceSelector from "@/components/workspace/WorkspaceSelector";
import CreateViewModal from "@/components/modals/CreateViewModal";
import CreateProjectModal from "@/components/modals/CreateProjectModal";
import NotificationPopover from "@/components/layout/sidebar/NotificationPopover";


interface SimplifiedSidebarProps {
  pathname?: string;
  isCollapsed?: boolean;
}

export default function SimplifiedSidebar({
  pathname = "",
  isCollapsed = false,
}: SimplifiedSidebarProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const { data: userData } = useCurrentUser();
  const { focusInput } = useAIWidget();
  const { currentAgent } = useAIAgents();
  const workspaceBase = currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}` : "";

  const { data: projects = [] } = useProjects({
    workspaceId: currentWorkspace?.id,
    includeStats: true,
  });

  const { data: views = [] } = useViews({
    workspaceId: currentWorkspace?.id,
    includeStats: true,
  });

  const { data: installedApps = [] } = useInstalledApps(currentWorkspace?.id);

  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);

  const starredProjects = useMemo(() => {
    return projects.filter((p: any) => p.isFavorite && !p.isArchived).slice(0, 6);
  }, [projects]);

  const starredViews = useMemo(() => {
    return views.filter((v: any) => v.isFavorite).slice(0, 6);
  }, [views]);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    toast({ title: "Signed out", description: "You have been signed out" });
    router.push("/");
  };

  const agentColor = currentAgent?.color || '#2563eb';

  const mainNav = [
    { name: "Home", href: `${workspaceBase}/dashboard`, icon: Home, current: pathname.includes("/dashboard") },
    { name: "Timeline", href: `${workspaceBase}/timeline`, icon: MessageSquare, current: pathname.includes("/timeline") },
    { name: "Context", href: `${workspaceBase}/notes`, icon: FileText, current: pathname.includes("/notes") },
    { name: "Feature Requests", href: `${workspaceBase}/features`, icon: Lightbulb, current: pathname.includes("/features") },
  ];

  // ── Collapsed State ──
  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full py-3">
        {/* Logo */}
        <div className="px-2 mb-4 flex justify-center">
          <Link href={`${workspaceBase}/dashboard`}>
            <div className="p-2 rounded-lg hover:bg-collab-800 transition-colors">
              <Image src="/logo-icon.svg" width={24} height={24} alt="Collab" />
            </div>
          </Link>
        </div>

        {/* Main Nav Icons */}
        <div className="px-2 space-y-1">
          {mainNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center justify-center h-9 w-full rounded-lg transition-all duration-150",
                item.current
                  ? "bg-collab-800 text-white"
                  : "text-collab-500 hover:text-white hover:bg-collab-800"
              )}
              title={item.name}
            >
              <item.icon className="h-[18px] w-[18px]" />
            </Link>
          ))}
        </div>

        <div className="flex-1" />

        {/* AI Button */}
        <div className="px-2 mb-2 flex justify-center">
          <button
            onClick={focusInput}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-collab-950 border border-collab-700 hover:bg-collab-800 transition-all duration-150"
            title={currentAgent ? `Ask ${currentAgent.name}` : "AI Assistant"}
          >
            {currentAgent ? (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: agentColor }}
              >
                {currentAgent.name[0]}
              </div>
            ) : (
              <Sparkles className="h-4 w-4 text-blue-500" />
            )}
          </button>
        </div>

        {/* User Avatar */}
        <div className="px-2 flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded-lg hover:bg-collab-800 transition-colors">
                <Avatar className="h-8 w-8 ring-1 ring-collab-700">
                  <AvatarImage src={userData?.image || undefined} />
                  <AvatarFallback className="text-xs bg-collab-800 text-collab-400">
                    {userData?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-collab-900 border-collab-700">
              <DropdownMenuItem
                onClick={() => router.push(`${workspaceBase}/settings`)}
                className="text-collab-400 hover:text-white focus:bg-collab-800"
              >
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-collab-700" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-red-400 hover:text-red-300 focus:bg-red-500/10"
              >
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // ── Expanded State ──
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pt-3.5 px-2">
        <Link href={`${workspaceBase}/dashboard`} className="flex items-center">
          <Image src="/logo-text.svg" width={100} height={28} alt="Collab" />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationPopover />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-4 px-2 py-4 overflow-y-auto">
        {/* Search Box */}
        <button
          onClick={() => {
            const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
            document.dispatchEvent(event);
          }}
          className="flex items-center gap-4 rounded-lg border px-2 py-2 text-sm bg-collab-950 border-collab-700 hover:bg-collab-800 transition-colors"
        >
          <Search className="h-4 w-4 text-collab-500" />
          <span className="flex-1 text-left text-collab-500">Search...</span>
          <kbd className="text-xs px-1.5 py-0.5 rounded bg-collab-800 text-collab-400">⌘K</kbd>
        </button>

        {/* Workspace Selector */}
        <WorkspaceSelector />

        {/* Main Navigation */}
        <nav className="space-y-0.5">
          {mainNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-4 rounded-lg px-2 py-2 text-sm font-medium transition-all duration-150",
                item.current
                  ? "bg-collab-800 text-white"
                  : "text-collab-400 hover:text-white hover:bg-collab-800"
              )}
            >
              <item.icon className={cn("h-4 w-4", item.current ? "text-white" : "text-collab-500")} />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        {/* Projects Section */}
        <div>
          <Link
            href={`${workspaceBase}/projects`}
            className={cn(
              "flex items-center gap-4 rounded-lg px-2 py-2 text-sm font-medium transition-all duration-150 group",
              pathname.startsWith(`${workspaceBase}/projects`)
                ? "bg-collab-800 text-white"
                : "text-collab-400 hover:text-white hover:bg-collab-800"
            )}
          >
            <FolderKanban className={cn("h-4 w-4", pathname.startsWith(`${workspaceBase}/projects`) ? "text-white" : "text-collab-500")} />
            <span>Projects</span>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowCreateProjectModal(true); }}
              className="ml-auto p-1 hover:bg-collab-700 rounded transition-colors opacity-0 group-hover:opacity-100"
            >
              <Plus className="h-3.5 w-3.5 text-collab-500" />
            </button>
          </Link>

          {/* Starred Projects */}
          {starredProjects.length > 0 && (
            <div className="mt-1 space-y-0.5 ml-6 pl-3 border-l border-collab-700">
              {starredProjects.map((project: any) => (
                <Link
                  key={project.id}
                  href={`${workspaceBase}/projects/${project.slug}`}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-all duration-150",
                    pathname.includes(`/projects/${project.slug}`)
                      ? "text-white bg-collab-800"
                      : "text-collab-400 hover:text-white hover:bg-collab-900"
                  )}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color || "#6366f1" }}
                  />
                  <span className="truncate">{project.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Views Section */}
        <div>
          <Link
            href={`${workspaceBase}/views`}
            className={cn(
              "flex items-center gap-4 rounded-lg px-2 py-2 text-sm font-medium transition-all duration-150 group",
              pathname === `${workspaceBase}/views`
                ? "bg-collab-800 text-white"
                : "text-collab-400 hover:text-white hover:bg-collab-800"
            )}
          >
            <Eye className={cn("h-4 w-4", pathname === `${workspaceBase}/views` ? "text-white" : "text-collab-500")} />
            <span>Views</span>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowCreateViewModal(true); }}
              className="ml-auto p-1 hover:bg-collab-700 rounded transition-colors opacity-0 group-hover:opacity-100"
            >
              <Plus className="h-3.5 w-3.5 text-collab-500" />
            </button>
          </Link>

          {/* Starred Views */}
          {starredViews.length > 0 && (
            <div className="mt-1 space-y-0.5 ml-6 pl-3 border-l border-collab-700">
              {starredViews.map((view: any) => (
                <Link
                  key={view.id}
                  href={`${workspaceBase}/views/${view.slug || view.id}`}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-all duration-150",
                    pathname.includes(`/views/${view.slug || view.id}`)
                      ? "text-white bg-collab-800"
                      : "text-collab-400 hover:text-white hover:bg-collab-900"
                  )}
                >
                  <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                  <span className="truncate">{view.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Apps Section */}
        {installedApps.length > 0 && (
          <div>
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-collab-500">
              Apps
            </div>
            <div className="space-y-0.5">
              {installedApps.map((installation: any) => (
                <Link
                  key={installation.id}
                  href={`${workspaceBase}/apps/${installation.app.slug}`}
                  className={cn(
                    "flex items-center gap-4 rounded-lg px-2 py-2 text-sm transition-all duration-150",
                    pathname.includes(`/apps/${installation.app.slug}`)
                      ? "bg-collab-800 text-white"
                      : "text-collab-400 hover:text-white hover:bg-collab-800"
                  )}
                >
                  {installation.app.iconUrl ? (
                    <Image
                      src={installation.app.iconUrl}
                      alt={installation.app.name}
                      width={16}
                      height={16}
                      className="rounded flex-shrink-0"
                    />
                  ) : (
                    <Grid3X3 className="h-4 w-4 text-collab-500 flex-shrink-0" />
                  )}
                  <span className="truncate">{installation.app.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto px-2 pb-4 space-y-1">
        {/* Support Link */}
        <Link
          href="/support"
          className="flex items-center gap-4 rounded-lg px-2 py-2 text-sm text-collab-400 hover:text-white hover:bg-collab-800 transition-colors"
        >
          <HelpCircle className="h-4 w-4 text-collab-500" />
          <span>Support</span>
        </Link>

        {/* Documentation Link */}
        <Link
          href="/docs"
          className="flex items-center gap-4 rounded-lg px-2 py-2 text-sm text-collab-400 hover:text-white hover:bg-collab-800 transition-colors"
        >
          <ExternalLink className="h-4 w-4 text-collab-500" />
          <span>Documentation</span>
        </Link>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-collab-800 transition-colors group">
              <Avatar className="h-8 w-8 ring-1 ring-collab-700">
                <AvatarImage src={userData?.image || undefined} />
                <AvatarFallback className="text-xs bg-collab-800 text-collab-400">
                  {userData?.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm text-white truncate">{userData?.name || "User"}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-collab-500 group-hover:text-collab-400 transition-colors flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-collab-900 border-collab-700">
            <DropdownMenuItem
              onClick={() => router.push(`${workspaceBase}/settings`)}
              className="text-collab-400 hover:text-white focus:bg-collab-800"
            >
              <Settings className="mr-2 h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-collab-700" />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-red-400 hover:text-red-300 focus:bg-red-500/10"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Modals */}
      <CreateViewModal
        isOpen={showCreateViewModal}
        onClose={() => setShowCreateViewModal(false)}
        workspaceId={currentWorkspace?.id || ""}
      />
      <CreateProjectModal
        isOpen={showCreateProjectModal}
        onClose={() => setShowCreateProjectModal(false)}
        workspaceId={currentWorkspace?.id || ""}
      />
    </div>
  );
}
