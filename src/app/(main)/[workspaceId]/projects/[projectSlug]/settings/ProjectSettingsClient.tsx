"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Settings,
  Save,
  ArrowLeft,
  Plus,
  X,
  FileText,
  Circle,
  Github,
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Tag,
  ChevronDown,
  ChevronRight,
  Palette,
  Archive,
  Activity,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useProject, ProjectStatus } from "@/hooks/queries/useProjects";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PROJECT_STATUSES,
  validateStatusDisplayName,
} from "@/constants/project-statuses";
import { isValidNewIssuePrefix } from "@/lib/shared-issue-key-utils";
import { GitHubOAuthConnection } from "@/components/github/GitHubOAuthConnection";

interface ProjectSettingsClientProps {
  workspaceId: string;
  projectSlug: string;
}

// Tab configuration
type SettingsTab = "general" | "statuses" | "github" | "danger";

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <FileText className="h-4 w-4" /> },
  { id: "statuses", label: "Statuses", icon: <Circle className="h-4 w-4" /> },
  { id: "github", label: "GitHub", icon: <Github className="h-4 w-4" /> },
  { id: "danger", label: "Danger Zone", icon: <AlertTriangle className="h-4 w-4" /> },
];

// Status colors
const statusColors = [
  "#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#84cc16",
  "#eab308", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#6b7280",
];

// Project colors
const projectColors = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
];

export default function ProjectSettingsClient({
  workspaceId,
  projectSlug,
}: ProjectSettingsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [saving, setSaving] = useState(false);

  // Fetch project data
  const {
    data: project,
    isLoading: loading,
    refetch: refetchProject,
  } = useProject(workspaceId, projectSlug);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    keyPrefix: "",
    color: "#6366f1",
  });

  // Status management state
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#6366f1");

  // Status deletion state
  const [statusToDelete, setStatusToDelete] = useState<ProjectStatus | null>(null);
  const [statusIssueCount, setStatusIssueCount] = useState(0);
  const [targetStatusId, setTargetStatusId] = useState<string>("");
  const [deletingStatus, setDeletingStatus] = useState(false);

  // Prefix validation state
  const [prefixError, setPrefixError] = useState<string | null>(null);

  // Archive/Delete state
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Initialize form data when project loads
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || "",
        description: project.description || "",
        keyPrefix: project.keyPrefix || "",
        color: project.color || "#6366f1",
      });
      setPrefixError(null);

      if (project.statuses && project.statuses.length > 0) {
        setStatuses(project.statuses);
      } else {
        setStatuses(
          DEFAULT_PROJECT_STATUSES.map((status) => ({
            id: status.name,
            name: status.displayName,
            color: status.color,
            order: status.order,
            isDefault: status.isDefault,
          }))
        );
      }
    }
  }, [project]);

  const handleSave = async () => {
    try {
      setSaving(true);

      if (formData.keyPrefix && !isValidNewIssuePrefix(formData.keyPrefix)) {
        setPrefixError("Issue prefix must start with a letter and contain only letters and numbers");
        toast({
          title: "Error",
          description: "Invalid issue prefix format",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectSlug}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData, statuses }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to update project" }));
        throw new Error(errorData.error || "Failed to update project");
      }

      toast({
        title: "Settings saved",
        description: "Project settings updated successfully",
      });

      await refetchProject();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update project settings";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;

    const validation = validateStatusDisplayName(newStatusName.trim());
    if (!validation.valid) {
      toast({
        title: "Invalid Status Name",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    const newStatus: ProjectStatus = {
      id: `status-${Date.now()}`,
      name: newStatusName.trim(),
      color: newStatusColor,
      order: statuses.length,
    };

    setStatuses([...statuses, newStatus]);
    setNewStatusName("");
    setNewStatusColor("#6366f1");
  };

  const handleRemoveStatus = async (statusId: string) => {
    const status = statuses.find((s) => s.id === statusId);
    if (!status) return;

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectSlug}/statuses/${statusId}/issues-count`
      );
      if (!response.ok) throw new Error("Failed to check status usage");

      const { count } = await response.json();

      if (count > 0) {
        setStatusToDelete(status);
        setStatusIssueCount(count);
        setTargetStatusId("");
      } else {
        setStatuses(statuses.filter((s) => s.id !== statusId));
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to check if status is being used",
        variant: "destructive",
      });
    }
  };

  const handleConfirmStatusDeletion = async () => {
    if (!statusToDelete || !targetStatusId) return;

    try {
      setDeletingStatus(true);

      const response = await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectSlug}/statuses/${statusToDelete.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetStatusId }),
        }
      );

      if (!response.ok) throw new Error("Failed to delete status");

      setStatuses(statuses.filter((s) => s.id !== statusToDelete.id));
      setStatusToDelete(null);
      setStatusIssueCount(0);
      setTargetStatusId("");

      toast({
        title: "Status deleted",
        description: `${statusIssueCount} issue(s) moved to the selected status`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete status",
        variant: "destructive",
      });
    } finally {
      setDeletingStatus(false);
    }
  };

  const handleStatusColorChange = (statusId: string, color: string) => {
    setStatuses(statuses.map((s) => (s.id === statusId ? { ...s, color } : s)));
  };

  const handleArchiveProject = async () => {
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectSlug}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isArchived: true }),
        }
      );

      if (!response.ok) throw new Error("Failed to archive project");

      toast({
        title: "Project archived",
        description: "The project has been archived successfully",
      });

      router.push(`/${currentWorkspace?.slug || workspaceId}/projects`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to archive project",
        variant: "destructive",
      });
    } finally {
      setShowArchiveDialog(false);
    }
  };

  const handleDeleteProject = async () => {
    if (deleteConfirmText !== project?.name) return;

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectSlug}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete project");

      toast({
        title: "Project deleted",
        description: "The project has been permanently deleted",
      });

      router.push(`/${currentWorkspace?.slug || workspaceId}/projects`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    } finally {
      setShowDeleteDialog(false);
      setDeleteConfirmText("");
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-collab-900">
        <Loader2 className="h-6 w-6 animate-spin text-collab-500/60" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-collab-900">
        <div className="text-center">
          <p className="text-collab-500">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-collab-900">
      <div className="flex flex-col gap-6 p-8 max-w-[1000px] mx-auto">
        {/* Header */}
        <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-4">
              <div
                className="w-1.5 h-12 rounded-full flex-shrink-0"
                style={{ backgroundColor: formData.color || "#6366f1" }}
              />
              <div>
                <h1 className="text-xl font-medium text-collab-50">
                  {project.name} Settings
                </h1>
                <p className="text-sm text-collab-500">
                  Manage project configuration
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/${currentWorkspace?.slug || workspaceId}/projects/${projectSlug}`}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm text-collab-500 hover:text-collab-50 hover:bg-collab-700 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="h-9 px-4 bg-blue-500 hover:bg-blue-400 text-white font-medium"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 border-t border-collab-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative",
                  activeTab === tab.id
                    ? "text-collab-50"
                    : "text-collab-500 hover:text-collab-400",
                  tab.id === "danger" && "text-red-400 hover:text-red-300"
                )}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* General Tab */}
          {activeTab === "general" && (
            <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-collab-700">
                <h2 className="text-sm font-medium text-collab-50">Basic Information</h2>
                <p className="text-xs text-collab-500/60 mt-0.5">
                  Configure your project's name, description, and identification
                </p>
              </div>
              <div className="p-6 space-y-5">
                {/* Project Name */}
                <div className="space-y-2">
                  <Label className="text-sm text-collab-400">Project Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter project name"
                    className="h-10 bg-collab-900 border-collab-700 text-collab-50 placeholder:text-collab-500/60 focus:border-collab-500/50 focus-visible:ring-0"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label className="text-sm text-collab-400">Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter project description"
                    rows={3}
                    className="bg-collab-900 border-collab-700 text-collab-50 placeholder:text-collab-500/60 focus:border-collab-500/50 focus-visible:ring-0 resize-none"
                  />
                </div>

                {/* Issue Key Prefix */}
                <div className="space-y-2">
                  <Label className="text-sm text-collab-400">Issue Key Prefix</Label>
                  <Input
                    value={formData.keyPrefix}
                    onChange={(e) => {
                      const cleanValue = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                      setFormData({ ...formData, keyPrefix: cleanValue });
                      if (prefixError) setPrefixError(null);
                    }}
                    placeholder="e.g., PROJ"
                    maxLength={10}
                    className={cn(
                      "h-10 bg-collab-900 border-collab-700 text-collab-50 placeholder:text-collab-500/60 focus:border-collab-500/50 focus-visible:ring-0 font-mono uppercase",
                      prefixError && "border-red-500"
                    )}
                  />
                  {prefixError ? (
                    <p className="text-xs text-red-400">{prefixError}</p>
                  ) : (
                    <p className="text-xs text-collab-500/60">
                      Issues will be numbered as {formData.keyPrefix || "PROJ"}-1, {formData.keyPrefix || "PROJ"}-2, etc.
                    </p>
                  )}
                </div>

                {/* Project Color */}
                <div className="space-y-2">
                  <Label className="text-sm text-collab-400">Project Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {projectColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setFormData({ ...formData, color })}
                        className={cn(
                          "w-8 h-8 rounded-lg transition-all",
                          formData.color === color
                            ? "ring-2 ring-white ring-offset-2 ring-offset-collab-800 scale-110"
                            : "hover:scale-105"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Statuses Tab */}
          {activeTab === "statuses" && (
            <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-collab-700">
                <h2 className="text-sm font-medium text-collab-50">Project Statuses</h2>
                <p className="text-xs text-collab-500/60 mt-0.5">
                  Configure the available statuses for issues in this project
                </p>
              </div>
              <div className="p-6 space-y-3">
                {/* Existing Statuses */}
                {statuses.map((status) => (
                  <div
                    key={status.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-collab-900 border border-collab-700"
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    <span className="text-sm text-collab-50 flex-1">{status.name}</span>
                    {status.isDefault && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        Default
                      </span>
                    )}

                    {/* Color picker popover */}
                    <div className="flex items-center gap-1">
                      {statusColors.slice(0, 6).map((color) => (
                        <button
                          key={color}
                          onClick={() => handleStatusColorChange(status.id, color)}
                          className={cn(
                            "w-5 h-5 rounded-md transition-all",
                            status.color === color
                              ? "ring-1 ring-white scale-110"
                              : "opacity-60 hover:opacity-100"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    {!status.isDefault && (
                      <button
                        onClick={() => handleRemoveStatus(status.id)}
                        className="p-1.5 rounded-lg text-collab-500/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Add New Status */}
                <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-collab-600 bg-collab-900/50">
                  <button
                    onClick={() => {
                      const randomColor = statusColors[Math.floor(Math.random() * statusColors.length)];
                      setNewStatusColor(randomColor);
                    }}
                    className="w-6 h-6 rounded-lg flex-shrink-0 transition-transform hover:scale-110"
                    style={{ backgroundColor: newStatusColor }}
                  />
                  <Input
                    value={newStatusName}
                    onChange={(e) => setNewStatusName(e.target.value)}
                    placeholder="New status name..."
                    className="flex-1 h-8 bg-transparent border-0 text-collab-50 placeholder:text-collab-500/60 focus-visible:ring-0 px-0"
                    onKeyDown={(e) => e.key === "Enter" && handleAddStatus()}
                  />
                  <Button
                    onClick={handleAddStatus}
                    disabled={!newStatusName.trim()}
                    size="sm"
                    className="h-7 px-3 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* GitHub Tab */}
          {activeTab === "github" && (
            <div className="space-y-4">
              {!project.repository ? (
                /* Not Connected State - Full width repository selection */
                <GitHubOAuthConnection
                  projectId={project.id}
                  onSuccess={refetchProject}
                  compact={false}
                />
              ) : (
                /* Connected State */
                <>
                  {/* Repository Card */}
                  <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-collab-700 to-collab-600 flex items-center justify-center">
                            <Github className="h-6 w-6 text-collab-50" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="text-base font-medium text-collab-50">
                                {project.repository.fullName}
                              </h3>
                              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Active
                              </span>
                            </div>
                            <p className="text-sm text-collab-500/60">
                              Connected repository • Syncing automatically
                            </p>
                          </div>
                        </div>
                        <a
                          href={`https://github.com/${project.repository.fullName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-collab-700 hover:bg-collab-600 text-xs text-collab-400 hover:text-collab-50 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View on GitHub
                        </a>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-4 border-t border-collab-700">
                      {[
                        { icon: GitBranch, label: "Branches", value: project.repository._count?.branches || 0, color: "text-purple-400", bg: "bg-purple-500/10" },
                        { icon: GitCommit, label: "Commits", value: project.repository._count?.commits || 0, color: "text-blue-400", bg: "bg-blue-500/10" },
                        { icon: GitPullRequest, label: "Pull Requests", value: project.repository._count?.pullRequests || 0, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                        { icon: Tag, label: "Releases", value: project.repository._count?.releases || 0, color: "text-amber-400", bg: "bg-amber-500/10" },
                      ].map((stat, index) => (
                        <div
                          key={stat.label}
                          className={cn(
                            "p-4 flex items-center gap-3",
                            index !== 3 && "border-r border-collab-700"
                          )}
                        >
                          <div className={cn("p-2 rounded-lg", stat.bg)}>
                            <stat.icon className={cn("h-4 w-4", stat.color)} />
                          </div>
                          <div>
                            <div className="text-lg font-semibold text-collab-50">{stat.value}</div>
                            <div className="text-[11px] text-collab-500/60">{stat.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
                    <div className="px-5 py-3 border-b border-collab-700">
                      <span className="text-xs font-medium uppercase tracking-wider text-collab-500/60">Quick Actions</span>
                    </div>
                    <div className="p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          href={`/${currentWorkspace?.slug || workspaceId}/projects/${projectSlug}/github`}
                          className="group flex items-center gap-3 p-3 rounded-xl hover:bg-collab-700 transition-colors"
                        >
                          <div className="p-2 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                            <Activity className="h-4 w-4 text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-collab-50">Activity Dashboard</p>
                            <p className="text-xs text-collab-500/60">View commits, PRs & activity</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-collab-500/50 ml-auto group-hover:text-collab-500 transition-colors" />
                        </Link>

                        <Link
                          href={`/${currentWorkspace?.slug || workspaceId}/projects/${projectSlug}/changelog`}
                          className="group flex items-center gap-3 p-3 rounded-xl hover:bg-collab-700 transition-colors"
                        >
                          <div className="p-2 rounded-lg bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                            <Tag className="h-4 w-4 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-collab-50">Changelog</p>
                            <p className="text-xs text-collab-500/60">View releases & versions</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-collab-500/50 ml-auto group-hover:text-collab-500 transition-colors" />
                        </Link>

                        <Link
                          href={`/${currentWorkspace?.slug || workspaceId}/projects/${projectSlug}/github/settings`}
                          className="group flex items-center gap-3 p-3 rounded-xl hover:bg-collab-700 transition-colors"
                        >
                          <div className="p-2 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                            <Settings className="h-4 w-4 text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-collab-50">Integration Settings</p>
                            <p className="text-xs text-collab-500/60">Configure sync & webhooks</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-collab-500/50 ml-auto group-hover:text-collab-500 transition-colors" />
                        </Link>

                        <button
                          onClick={() => {
                            toast({
                              title: "Sync started",
                              description: "Syncing repository data from GitHub...",
                            });
                          }}
                          className="group flex items-center gap-3 p-3 rounded-xl hover:bg-collab-700 transition-colors text-left"
                        >
                          <div className="p-2 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                            <RefreshCw className="h-4 w-4 text-purple-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-collab-50">Sync Now</p>
                            <p className="text-xs text-collab-500/60">Manually refresh data</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-collab-500/50 ml-auto group-hover:text-collab-500 transition-colors" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Disconnect Option */}
                  <div className="rounded-xl bg-collab-800 border border-collab-700 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-collab-400">Disconnect Repository</p>
                      <p className="text-xs text-collab-500/60">Remove the GitHub integration from this project</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-collab-500 hover:text-red-400 hover:bg-red-500/10"
                    >
                      Disconnect
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Danger Zone Tab */}
          {activeTab === "danger" && (
            <div className="space-y-4">
              {/* Archive Project */}
              <div className="rounded-2xl bg-collab-800 border border-amber-500/20 overflow-hidden">
                <div className="px-6 py-4 border-b border-collab-700">
                  <div className="flex items-center gap-2">
                    <Archive className="h-4 w-4 text-amber-400" />
                    <h2 className="text-sm font-medium text-collab-50">Archive Project</h2>
                  </div>
                  <p className="text-xs text-collab-500/60 mt-0.5">
                    Archived projects are hidden from the main list but can be restored
                  </p>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <p className="text-sm text-collab-500">
                    Archive this project to hide it from your workspace
                  </p>
                  <Button
                    onClick={() => setShowArchiveDialog(true)}
                    variant="outline"
                    className="h-9 px-4 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </Button>
                </div>
              </div>

              {/* Delete Project */}
              <div className="rounded-2xl bg-collab-800 border border-red-500/20 overflow-hidden">
                <div className="px-6 py-4 border-b border-collab-700">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-red-400" />
                    <h2 className="text-sm font-medium text-collab-50">Delete Project</h2>
                  </div>
                  <p className="text-xs text-collab-500/60 mt-0.5">
                    Permanently delete this project and all its data
                  </p>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <p className="text-sm text-collab-500">
                    This action cannot be undone. All issues, views, and data will be lost.
                  </p>
                  <Button
                    onClick={() => setShowDeleteDialog(true)}
                    variant="outline"
                    className="h-9 px-4 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Deletion Dialog */}
      <AlertDialog open={!!statusToDelete} onOpenChange={(open) => !open && setStatusToDelete(null)}>
        <AlertDialogContent className="bg-collab-800 border-collab-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-collab-50">
              Delete "{statusToDelete?.name}"
            </AlertDialogTitle>
            <AlertDialogDescription className="text-collab-500">
              This status has <strong className="text-collab-50">{statusIssueCount}</strong> issue(s).
              Select a status to move them to.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Label className="text-sm text-collab-400 mb-2 block">Move issues to:</Label>
            <select
              value={targetStatusId}
              onChange={(e) => setTargetStatusId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-collab-900 border border-collab-700 text-sm text-collab-50 focus:outline-none focus:border-collab-500/50"
            >
              <option value="">Select a status</option>
              {statuses
                .filter((s) => s.id !== statusToDelete?.id)
                .map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
            </select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-collab-700 text-collab-500 hover:bg-collab-700 hover:text-collab-50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusDeletion}
              disabled={!targetStatusId || deletingStatus}
              className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
            >
              {deletingStatus ? "Moving..." : "Move & Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent className="bg-collab-800 border-collab-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-collab-50">Archive Project</AlertDialogTitle>
            <AlertDialogDescription className="text-collab-500">
              Are you sure you want to archive "{project.name}"? It will be hidden from your workspace but can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-collab-700 text-collab-500 hover:bg-collab-700 hover:text-collab-50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveProject}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Archive Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-collab-800 border-collab-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-collab-50">Delete Project</AlertDialogTitle>
            <AlertDialogDescription className="text-collab-500">
              This action cannot be undone. Type <strong className="text-red-400">{project.name}</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type project name to confirm"
              className="h-10 bg-collab-900 border-collab-700 text-collab-50 placeholder:text-collab-500/60 focus:border-red-500 focus-visible:ring-0"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-collab-700 text-collab-500 hover:bg-collab-700 hover:text-collab-50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={deleteConfirmText !== project.name}
              className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
