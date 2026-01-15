"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { canEditNote } from "@/utils/permissions";
import { redirect, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Plus,
  Star,
  FileText,
  Edit,
  Trash2,
  Lock,
  MessageSquare,
  Users,
  FolderKanban,
  Globe,
  Share2,
  Bot,
  RotateCcw,
  BookOpen,
  Cpu,
  Palette,
  Layers,
  Server,
  Play,
  Bug,
  Calendar,
  GitBranch,
  Pin,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { sortNotesBySearchTerm } from "@/utils/sortUtils";
import Link from "next/link";
import { useWorkspace } from "@/context/WorkspaceContext";
import { NoteScope, NoteType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";
import { getNoteTypeConfig } from "@/lib/note-types";
import { PinnedNotesSection } from "@/components/notes/PinnedNotesSection";
import { useProjects } from "@/hooks/queries/useProjects";

interface Note {
  id: string;
  title: string;
  content: string;
  scope: NoteScope;
  type: NoteType;
  isFavorite: boolean;
  isAiContext?: boolean;
  isPinned?: boolean;
  pinnedAt?: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    image?: string;
  };
  tags: {
    id: string;
    name: string;
    color: string;
  }[];
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  project?: {
    id: string;
    name: string;
    slug: string;
    color?: string;
  };
  comments?: {
    id: string;
  }[];
  sharedWith?: {
    id: string;
    userId: string;
    permission: string;
  }[];
}

interface NoteTag {
  id: string;
  name: string;
  color: string;
  _count: {
    notes: number;
  };
}


// Note type icons mapping
const noteTypeIcons: Record<NoteType, any> = {
  GENERAL: FileText,
  SYSTEM_PROMPT: Bot,
  GUIDE: BookOpen,
  README: FileText,
  TECH_STACK: Cpu,
  CODING_STYLE: Palette,
  ARCHITECTURE: Layers,
  API_DOCS: Server,
  RUNBOOK: Play,
  TROUBLESHOOT: Bug,
  MEETING: Calendar,
  DECISION: GitBranch,
};

// Note scope icons mapping
const noteScopeIcons: Record<NoteScope, any> = {
  PERSONAL: Lock,
  SHARED: Share2,
  PROJECT: FolderKanban,
  WORKSPACE: Users,
  PUBLIC: Globe,
};

// Utility function to process note content for preview
const getNotePreview = (content: string, maxLength: number = 120) => {
  const processedContent = content
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const truncated = processedContent.length > maxLength;
  const preview = processedContent.substring(0, maxLength);

  return { preview, truncated };
};

// Tab configuration
// Tabs represent note scopes
const TABS = [
  { id: "all", label: "All", icon: null },
  { id: "personal", label: "Personal", icon: Lock },
  { id: "project", label: "Project", icon: FolderKanban },
  { id: "workspace", label: "Workspace", icon: Users },
  { id: "public", label: "Public", icon: Globe },
  { id: "shared", label: "Shared", icon: Share2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Note List Item Component - Compact list view like projects page
function NoteListItem({
  note,
  workspaceSlug,
  onToggleFavorite,
  onTogglePin,
  onDelete,
  canEdit,
}: {
  note: Note;
  workspaceSlug: string;
  onToggleFavorite: (noteId: string, isFavorite: boolean) => void;
  onTogglePin: (noteId: string, isPinned: boolean) => void;
  onDelete: (noteId: string) => void;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { preview } = getNotePreview(note.content, 80);
  const TypeIcon = noteTypeIcons[note.type] || FileText;
  const typeConfig = getNoteTypeConfig(note.type);
  const ScopeIconComponent = noteScopeIcons[note.scope] || Lock;

  // Get scope color for indicator
  const getScopeColor = () => {
    switch (note.scope) {
      case NoteScope.PERSONAL: return '#71717a';
      case NoteScope.PROJECT: return '#a855f7';
      case NoteScope.WORKSPACE: return '#22c55e';
      case NoteScope.PUBLIC: return '#f59e0b';
      case NoteScope.SHARED: return '#3b82f6';
      default: return '#6366f1';
    }
  };

  return (
    <div
      className="group relative flex items-center gap-4 px-5 py-3.5 hover:bg-gradient-to-r hover:from-[#151518] hover:to-transparent transition-all duration-200 cursor-pointer"
      onClick={() => router.push(`/${workspaceSlug}/notes/${note.id}`)}
    >
      {/* Color indicator based on scope */}
      <div
        className="w-1 h-10 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: getScopeColor() }}
      />

      {/* Note Info */}
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-center gap-2.5">
          <TypeIcon className={cn("h-3.5 w-3.5 flex-shrink-0", typeConfig.color)} />
          <h3 className="text-[14px] font-semibold text-[#fafafa] group-hover:text-white truncate">
            {note.title}
          </h3>
          {note.isPinned && (
            <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />
          )}
          {note.isFavorite && (
            <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
          )}
          {note.isAiContext && (
            <Bot className="h-3 w-3 text-purple-400 flex-shrink-0" />
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f23] text-[#71717a] font-medium flex-shrink-0 flex items-center gap-1">
            <ScopeIconComponent className="h-2.5 w-2.5" />
            {note.scope.charAt(0) + note.scope.slice(1).toLowerCase()}
          </span>
        </div>

        {/* Description */}
        {preview && (
          <p className="text-[12px] text-[#52525b] truncate max-w-[400px] mt-0.5">
            {preview}
          </p>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-3 mt-1.5">
          {/* Author avatar */}
          <div className="flex items-center gap-1.5">
            <Avatar className="h-4 w-4">
              <AvatarImage src={note.author.image || undefined} />
              <AvatarFallback className="text-[8px] bg-[#27272a] text-[#71717a]">
                {note.author.name?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] text-[#52525b]">{note.author.name}</span>
          </div>

          {note.project && (
            <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: note.project.color || "#6366f1" }}
              />
              <span>{note.project.name}</span>
            </div>
          )}

          {note.tags.length > 0 && (
            <div className="flex items-center gap-1">
              {note.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  className="text-[10px] px-1.5 py-0 rounded"
                  style={{ color: tag.color, backgroundColor: `${tag.color}15` }}
                >
                  {tag.name}
                </span>
              ))}
              {note.tags.length > 2 && (
                <span className="text-[10px] text-[#52525b]">+{note.tags.length - 2}</span>
              )}
            </div>
          )}

          {note.sharedWith && note.sharedWith.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
              <Share2 className="h-3 w-3 text-[#3b82f6]" />
              <span className="tabular-nums">{note.sharedWith.length}</span>
            </div>
          )}

          {note.comments && note.comments.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
              <MessageSquare className="h-3 w-3 text-[#6e7681]" />
              <span className="tabular-nums">{note.comments.length}</span>
            </div>
          )}

          <span className="text-[10px] text-[#3f3f46]">
            {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Inline Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(note.id, note.isFavorite);
          }}
          className={cn(
            "h-8 w-8",
            note.isFavorite
              ? "text-amber-400"
              : "text-[#52525b] hover:text-amber-400"
          )}
          title={note.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("h-3.5 w-3.5", note.isFavorite && "fill-amber-400")} />
        </Button>

        {canEdit && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(note.id, !!note.isPinned);
              }}
              className={cn(
                "h-8 w-8",
                note.isPinned
                  ? "text-amber-500"
                  : "text-[#52525b] hover:text-amber-500"
              )}
              title={note.isPinned ? "Unpin" : "Pin to top"}
            >
              <Pin className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="md"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/${workspaceSlug}/notes/${note.id}`);
              }}
            >
              <Edit className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              className="h-8 w-8 text-[#52525b] hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function NotesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { data: session, status } = useSession();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();

  // Filter states
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showAiContext, setShowAiContext] = useState(false);

  // Fetch projects for filter using the proper hook
  const { data: projects = [] } = useProjects({
    workspaceId: currentWorkspace?.id,
  });

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      selectedTypes.length > 0 ||
      selectedProjects.length > 0 ||
      selectedTags.length > 0 ||
      showFavorites ||
      showAiContext ||
      searchQuery.trim() !== ""
    );
  }, [selectedTypes, selectedProjects, selectedTags, showFavorites, showAiContext, searchQuery]);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setSelectedTypes([]);
    setSelectedProjects([]);
    setSelectedTags([]);
    setShowFavorites(false);
    setShowAiContext(false);
    setSearchQuery("");
  }, []);

  // Stats computation - always computed from full notes array for accurate tab counts
  const stats = useMemo(() => {
    const totalNotes = notes.length;
    const personalNotes = notes.filter(
      (n) => n.scope === NoteScope.PERSONAL && n.authorId === session?.user?.id
    ).length;
    const projectNotes = notes.filter(
      (n) => n.scope === NoteScope.PROJECT
    ).length;
    const workspaceNotes = notes.filter(
      (n) => n.scope === NoteScope.WORKSPACE
    ).length;
    const publicNotes = notes.filter(
      (n) => n.scope === NoteScope.PUBLIC
    ).length;
    const sharedNotes = notes.filter(
      (n) => n.scope === NoteScope.SHARED || (n.sharedWith && n.sharedWith.length > 0)
    ).length;
    return { totalNotes, personalNotes, projectNotes, workspaceNotes, publicNotes, sharedNotes };
  }, [notes, session?.user?.id]);

  // Convert note types to FilterOption format
  const typeOptions: FilterOption[] = useMemo(() => {
    return Object.values(NoteType).map((type) => {
      const config = getNoteTypeConfig(type);
      return {
        id: type,
        label: config.label,
        icon: noteTypeIcons[type] || FileText,
        iconColor: config.color,
      };
    });
  }, []);

  // Convert projects to FilterOption format
  const projectOptions: FilterOption[] = useMemo(() => {
    return projects.map((project) => ({
      id: project.id,
      label: project.name,
      color: project.color || "#6366f1",
    }));
  }, [projects]);

  // Convert tags to FilterOption format
  const tagOptions: FilterOption[] = useMemo(() => {
    return tags.map((tag) => ({
      id: tag.id,
      label: tag.name,
      color: tag.color,
      suffix: `${tag._count.notes}`,
    }));
  }, [tags]);

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
  }, [status]);

  useEffect(() => {
    if (session?.user && currentWorkspace?.id) {
      fetchNotes();
      fetchTags();
    }
  }, [session?.user, currentWorkspace?.id]);

  const fetchNotes = async () => {
    try {
      const params = new URLSearchParams();
      if (currentWorkspace?.id) {
        params.append("workspace", currentWorkspace.id);
      }
      // Always fetch all notes - tab filtering is done client-side for accurate counts

      const response = await fetch(`/api/notes?${params}`);
      if (response.ok) {
        const data = await response.json();
        setNotes(data);
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
      toast({
        title: "Error",
        description: "Failed to fetch context",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const url = currentWorkspace?.id
        ? `/api/notes/tags?workspace=${currentWorkspace.id}`
        : "/api/notes/tags";
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setTags(data);
      }
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  // Apply client-side filters
  const filteredNotes = useMemo(() => {
    let filtered = [...notes];

    // Tab filter - tabs represent scopes
    switch (activeTab) {
      case "personal":
        filtered = filtered.filter((note) => note.scope === NoteScope.PERSONAL && note.authorId === session?.user?.id);
        break;
      case "project":
        filtered = filtered.filter((note) => note.scope === NoteScope.PROJECT);
        break;
      case "workspace":
        filtered = filtered.filter((note) => note.scope === NoteScope.WORKSPACE);
        break;
      case "public":
        filtered = filtered.filter((note) => note.scope === NoteScope.PUBLIC);
        break;
      case "shared":
        filtered = filtered.filter((note) => note.scope === NoteScope.SHARED || (note.sharedWith && note.sharedWith.length > 0));
        break;
      case "all":
      default:
        // On the "all" tab, exclude pinned notes since they're shown in the pinned section
        filtered = filtered.filter((note) => !note.isPinned);
        break;
    }

    // Search filter
    if (searchQuery.trim()) {
      filtered = sortNotesBySearchTerm(filtered, searchQuery) as Note[];
    }

    // Type filter
    if (selectedTypes.length > 0) {
      filtered = filtered.filter((note) => selectedTypes.includes(note.type));
    }

    // Project filter
    if (selectedProjects.length > 0) {
      filtered = filtered.filter((note) => note.project && selectedProjects.includes(note.project.id));
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter((note) =>
        note.tags.some((tag) => selectedTags.includes(tag.id))
      );
    }

    // Favorites filter
    if (showFavorites) {
      filtered = filtered.filter((note) => note.isFavorite);
    }

    // AI Context filter
    if (showAiContext) {
      filtered = filtered.filter((note) => note.isAiContext);
    }

    return filtered;
  }, [notes, activeTab, session?.user?.id, searchQuery, selectedTypes, selectedProjects, selectedTags, showFavorites, showAiContext]);

  const toggleFavorite = async (noteId: string, isFavorite: boolean) => {
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isFavorite: !isFavorite }),
      });

      if (response.ok) {
        const updatedNote = await response.json();
        setNotes(notes.map((note) => (note.id === noteId ? updatedNote : note)));
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      toast({
        title: "Error",
        description: "Failed to update context",
        variant: "destructive",
      });
    }
  };

  const togglePin = async (noteId: string, isPinned: boolean) => {
    try {
      const response = await fetch(`/api/notes/${noteId}/pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin: !isPinned }),
      });

      if (response.ok) {
        const result = await response.json();
        setNotes(notes.map((note) =>
          note.id === noteId
            ? { ...note, isPinned: result.isPinned, pinnedAt: result.isPinned ? new Date().toISOString() : undefined }
            : note
        ));
        toast({
          title: result.isPinned ? "Pinned" : "Unpinned",
          description: result.isPinned ? "Context pinned to top" : "Context unpinned",
        });
      }
    } catch (error) {
      console.error("Error toggling pin:", error);
      toast({
        title: "Error",
        description: "Failed to update pin status",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (noteId: string) => {
    setNoteToDelete(noteId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!noteToDelete) return;

    try {
      const response = await fetch(`/api/notes/${noteToDelete}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete note");
      }

      toast({
        title: "Success",
        description: "Context deleted successfully",
      });

      setNotes(notes.filter((note) => note.id !== noteToDelete));
      setDeleteConfirmOpen(false);
      setNoteToDelete(null);
    } catch (error) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: "Failed to delete context. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (status === "loading" || isLoading || workspaceLoading) {
    return (
      <div className="h-full flex flex-col bg-[#0a0a0b]">
        <div className="flex-1 flex items-center justify-center">
          <div className="h-6 w-6 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0b]">
      {/* Header */}
      <div className="flex-none border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
              <FileText className="h-4 w-4 text-[#3b82f6]" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-[#e6edf3]">Context</h1>
              <p className="text-xs text-[#6e7681]">
                {filteredNotes.length} context{filteredNotes.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push(`/${currentWorkspace?.slug}/notes/new`)}
              size="sm"
              className="h-7 px-3 bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/20 hover:border-[#3b82f6]/30"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Context
            </Button>
          </div>
        </div>

        {/* Search and Tab Toggle - Projects Style */}
        <div className="flex items-center gap-3 px-6 pb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6e7681]" />
            <Input
              placeholder="Search context..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-[#0d0d0e] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#6e7681] focus:border-[#30363d]"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#1f1f1f] p-0.5 bg-[#0d0d0e]">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              // Count for each tab
              const count = tab.id === 'all' ? stats.totalNotes
                : tab.id === 'personal' ? stats.personalNotes
                : tab.id === 'project' ? stats.projectNotes
                : tab.id === 'workspace' ? stats.workspaceNotes
                : tab.id === 'public' ? stats.publicNotes
                : tab.id === 'shared' ? stats.sharedNotes
                : 0;
              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "h-7 gap-1.5",
                    isActive
                      ? "bg-[#1f1f1f] text-[#e6edf3]"
                      : "text-[#6e7681] hover:text-[#8b949e] hover:bg-transparent"
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {tab.label}
                  <span className="text-[#6e7681]">{count}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="border-b border-[#1f1f1f] bg-[#0d0d0e] px-6 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <GlobalFilterSelector
            value={selectedTypes}
            onChange={(value) => setSelectedTypes(value as string[])}
            options={typeOptions}
            label="Type"
            pluralLabel="types"
            emptyIcon={FileText}
            selectionMode="multi"
            showSearch={false}
            allowClear={true}
            popoverWidth="w-56"
            filterHeader="Filter by type"
          />

          <GlobalFilterSelector
            value={selectedProjects}
            onChange={(value) => setSelectedProjects(value as string[])}
            options={projectOptions}
            label="Project"
            pluralLabel="projects"
            emptyIcon={FolderKanban}
            selectionMode="multi"
            showSearch={true}
            searchPlaceholder="Search projects..."
            allowClear={true}
            popoverWidth="w-64"
            filterHeader="Filter by project"
          />

          <GlobalFilterSelector
            value={selectedTags}
            onChange={(value) => setSelectedTags(value as string[])}
            options={tagOptions}
            label="Tags"
            pluralLabel="tags"
            emptyIcon={FileText}
            selectionMode="multi"
            showSearch={true}
            searchPlaceholder="Search tags..."
            allowClear={true}
            popoverWidth="w-64"
            filterHeader="Filter by tags"
          />

          <div className="w-px h-5 bg-[#27272a] mx-1" />

          {/* Favorite Toggle */}
          <Button
            variant={showFavorites ? "warning" : "outline"}
            size="sm"
            onClick={() => setShowFavorites(!showFavorites)}
            className={cn(
              "h-6",
              !showFavorites && "text-[#6e7681]"
            )}
          >
            <Star className={cn("h-3 w-3", showFavorites && "fill-amber-400")} />
            <span>Favorites</span>
          </Button>

          {/* AI Context Toggle */}
          <Button
            variant={showAiContext ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAiContext(!showAiContext)}
            className={cn(
              "h-6",
              showAiContext
                ? "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20 hover:border-purple-500/30"
                : "text-[#6e7681]"
            )}
          >
            <Bot className="h-3 w-3" />
            <span>AI</span>
          </Button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <Button
              variant="destructive"
              size="sm"
              onClick={resetFilters}
              className="h-6"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {/* Pinned Notes Section */}
          {activeTab === "all" && currentWorkspace?.id && (
            <PinnedNotesSection
              workspaceId={currentWorkspace.id}
              workspaceSlug={currentWorkspace.slug || ""}
              className="mb-6"
            />
          )}

          {/* Notes Grid */}
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-dashed border-[#27272a] bg-[#0d0d0e]/50">
              <FileText className="h-10 w-10 text-[#3f3f46] mb-4" />
              <h3 className="text-sm font-medium text-[#a1a1aa] mb-1">
                No context found
              </h3>
              <p className="text-xs text-[#52525b] mb-4 text-center max-w-sm">
                {hasActiveFilters
                  ? "Try adjusting your filters"
                  : activeTab === "personal"
                    ? "Create personal context to get started"
                    : activeTab === "workspace"
                      ? "No workspace context found"
                      : activeTab === "shared"
                        ? "No context has been shared with you yet"
                        : "Get started by creating your first context"}
              </p>
              <Button
                onClick={() => router.push(`/${currentWorkspace?.slug}/notes/new`)}
                size="sm"
                className="h-7 px-3 bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/20 hover:border-[#3b82f6]/30"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create Context
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-[#1f1f1f] overflow-hidden divide-y divide-[#1f1f1f]">
              {filteredNotes.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  workspaceSlug={currentWorkspace?.slug || ""}
                  onToggleFavorite={toggleFavorite}
                  onTogglePin={togglePin}
                  onDelete={handleDeleteClick}
                  canEdit={canEditNote(session, note)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-[#0d0d0e] border-[#27272a]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#fafafa]">Delete Context</AlertDialogTitle>
            <AlertDialogDescription className="text-[#71717a]">
              Are you sure you want to delete this context? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
