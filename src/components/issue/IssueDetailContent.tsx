"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Loader2,
  X,
  Check,
  PenLine,
  MessageSquare,
  Copy,
  Trash2,
  Clock,
  ArrowLeft,
  Play,
  Pause,
  StopCircle,
  Bell,
  BellOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useDeleteIssue } from "@/hooks/queries/useIssues";
import PageHeader, { pageHeaderButtonStyles } from "@/components/layout/PageHeader";
import { useSession } from "next-auth/react";
import { useActivity } from "@/context/ActivityContext";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { formatLiveTime } from "@/utils/taskHelpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { IssueTabs } from "./sections/IssueTabs";
import { IssueRichEditor } from "@/components/RichEditor/IssueRichEditor";
import { IssueCommentsSection } from "./sections/IssueCommentsSection";
import { EditorMiniToolbar } from "@/components/RichEditor/components/EditorMiniToolbar";
import { EditorHistoryModal } from "@/components/RichEditor/components/EditorHistoryModal";
import type { RichEditorRef } from "@/components/RichEditor/types";
import { generateBackNavigationUrl } from "@/lib/navigation-helpers";
import { IssueAssigneeSelector } from "@/components/issue/selectors/IssueAssigneeSelector";
import { IssueStatusSelector } from "@/components/issue/selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "@/components/issue/selectors/IssuePrioritySelector";
import { IssueReporterSelector } from "@/components/issue/selectors/IssueReporterSelector";
import { IssueLabelSelector } from "@/components/issue/selectors/IssueLabelSelector";
import { IssueTypeSelector } from "@/components/issue/selectors/IssueTypeSelector";
import { IssueProjectSelector } from "@/components/issue/selectors/IssueProjectSelector";
import { IssueDateSelector } from "@/components/issue/selectors/IssueDateSelector";
import { LoadingState } from "@/components/issue/sections/activity/components/LoadingState";

// Import types
import type { IssueDetailProps, IssueFieldUpdate, PlayTime } from "@/types/issue";

type PlayState = "playing" | "paused" | "stopped";

// Helper function for getting type color (still used for the type indicator dot)
const getTypeColor = (type: string) => {
  const colors = {
    'EPIC': '#8b5cf6',
    'STORY': '#3b82f6',
    'TASK': '#10b981',
    'BUG': '#ef4444',
    'MILESTONE': '#f59e0b',
    'SUBTASK': '#6b7280'
  };
  return colors[type as keyof typeof colors] || '#6b7280';
};

interface IssueDetailContentProps extends IssueDetailProps {
  workspaceId?: string;
  issueId?: string;
  viewName?: string;
  viewSlug?: string;
}

export function IssueDetailContent({
  issue,
  error,
  isLoading = false,
  onRefresh,
  onClose,
  boardId,
  workspaceId,
  issueId,
  viewName,
  viewSlug
}: IssueDetailContentProps) {
  const router = useRouter();
  const deleteIssueMutation = useDeleteIssue();
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Autosave state
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("saved");
  const [lastSavedDescription, setLastSavedDescription] = useState("");
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const autosaveErrorToastShownRef = useRef(false);
  const latestDescriptionRef = useRef("");
  const [labels, setLabels] = useState<any[]>([]);
  const { toast } = useToast();

  // Session and activity hooks
  const { data: session } = useSession();
  const { userStatus, handleTaskAction } = useActivity();
  const { settings } = useWorkspaceSettings();
  const currentUserId = session?.user?.id;

  // Time tracking state
  const [totalPlayTime, setTotalPlayTime] = useState<PlayTime | null>(null);
  const [isTimerLoading, setIsTimerLoading] = useState(false);
  const [isLoadingPlayTime, setIsLoadingPlayTime] = useState(false);
  const [liveTimeDisplay, setLiveTimeDisplay] = useState<string | null>(null);
  const [showHelperModal, setShowHelperModal] = useState(false);

  // Follow state
  const [isFollowingIssue, setIsFollowingIssue] = useState(false);
  const [isTogglingIssueFollow, setIsTogglingIssueFollow] = useState(false);

  // Editor reference for mini toolbar
  const editorRef = useRef<RichEditorRef>(null);

  // History modal state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Time tracking utilities
  const canControlTimer = useMemo(() => {
    if (!issue || !currentUserId) return false;
    // Allow assignee, reporter, or any user to control their own timer
    return true;
  }, [issue, currentUserId]);

  // Get current play state from user activity status
  const currentPlayState: PlayState = useMemo(() => {
    if (!userStatus || !issue?.id) return "stopped";

    const isMyIssue = userStatus.currentTaskId === issue.id;
    if (!isMyIssue) return "stopped";

    return userStatus.currentTaskPlayState || "stopped";
  }, [userStatus, issue?.id]);

  // Fetch total play time for the issue
  const fetchTotalPlayTime = useCallback(async () => {
    if (!issue?.id) return;
    setIsLoadingPlayTime(true);
    try {
      const response = await fetch(`/api/issues/${issue.id}/playtime`);
      if (!response.ok) {
        throw new Error("Failed to fetch total play time");
      }
      const data: PlayTime = await response.json();
      setTotalPlayTime(data);
    } catch (err) {
      console.error("Error fetching total play time:", err);
    } finally {
      setIsLoadingPlayTime(false);
    }
  }, [issue?.id]);

  // Handle play/pause/stop actions
  const handlePlayPauseStop = async (action: "play" | "pause" | "stop") => {
    if (!issue?.id) return;

    // Check if user is assigned to this issue before starting
    if (action === "play") {
      const isAssignedToMe = issue.assigneeId === currentUserId;

      if (!isAssignedToMe) {
        // User is not assigned, show helper modal
        setShowHelperModal(true);
        return;
      }
    }

    setIsTimerLoading(true);
    try {
      // Use the ActivityContext for proper state management
      await handleTaskAction(action, issue.id);

      // Fetch updated play time
      await fetchTotalPlayTime();

    } catch (err: any) {
      console.error(`Error ${action} issue:`, err);
    } finally {
      setIsTimerLoading(false);
    }
  };

  const handleHelperConfirm = async () => {
    if (!issue?.id) return;

    try {
      // First, send help request
      const helpResponse = await fetch(`/api/issues/${issue.id}/request-help`, {
        method: 'POST',
      });

      if (!helpResponse.ok) {
        const error = await helpResponse.json();
        throw new Error(error.message || 'Failed to request help');
      }

      const helpData = await helpResponse.json();

      // Then, start working on the issue as a helper
      setIsTimerLoading(true);
      await handleTaskAction("play", issue.id);

      if (helpData.status === "approved") {
        toast({
          title: "Started as Helper",
          description: "You are already approved! Timer started and your time will be tracked separately.",
        });
      } else {
        toast({
          title: "Started as Helper",
          description: "Help request sent and timer started. Your time will be tracked separately.",
        });
      }

      setShowHelperModal(false);
      await fetchTotalPlayTime();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start as helper",
        variant: "destructive",
      });
    } finally {
      setIsTimerLoading(false);
    }
  };

  const handleHelperCancel = () => {
    setShowHelperModal(false);
  };

  // Initialize local state from issue data
  useEffect(() => {
    if (issue) {
      setTitle(issue.title || '');
      setDescription(issue.description || '');
      setLastSavedDescription(issue.description || '');
      setAutosaveStatus("saved");
      setTimeout(() => {
        setAutosaveStatus("idle");
      }, 600);
    }
  }, [issue]);

  // Keep a ref of the latest description to avoid race conditions when saving
  useEffect(() => {
    latestDescriptionRef.current = description;
  }, [description]);

  // Autosave function (direct API call to avoid noisy toasts and page dimming)
  const autosaveDescription = useCallback(async (content: string) => {
    if (!issue) return;
    setAutosaveStatus("saving");
    try {
      const response = await fetch(`/api/issues/${issue.issueKey || issue.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: content }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Autosave failed (${response.status})`);
      }

      // Only mark saved if this response corresponds to the latest content
      if (content === latestDescriptionRef.current) {
        setLastSavedDescription(content);
      }

      setAutosaveStatus("saved");
      setTimeout(() => {
        setAutosaveStatus("idle");
      }, 600);
      setShowSavedIndicator(true);
      setTimeout(() => setShowSavedIndicator(false), 1500);
      autosaveErrorToastShownRef.current = false;
    } catch (error: any) {
      setAutosaveStatus("error");
      if (!autosaveErrorToastShownRef.current) {
        toast({
          title: "Autosave failed",
          description: error?.message || "Could not save changes. We will retry when you continue editing.",
          variant: "destructive",
        });
        autosaveErrorToastShownRef.current = true;
      }
    }
  }, [issue, toast]);

  // Debounced autosave on description changes
  useEffect(() => {
    if (!issue) return;
    if (description === lastSavedDescription) return;

    const handle = setTimeout(() => {
      autosaveDescription(description);
    }, 800);

    return () => clearTimeout(handle);
  }, [description, lastSavedDescription, autosaveDescription, issue]);

  // Flush autosave on tab hide or before unload for reliability
  useEffect(() => {
    if (!issue) return;

    const flushIfPending = () => {
      if (latestDescriptionRef.current !== lastSavedDescription) {
        autosaveDescription(latestDescriptionRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        flushIfPending();
      }
    };

    const handleBeforeUnload = () => {
      if (latestDescriptionRef.current !== lastSavedDescription) {
        const endpoint = `/api/issues/${issue.issueKey || issue.id}`;
        const payload = JSON.stringify({ description: latestDescriptionRef.current });
        try {
          // Prefer keepalive PUT to match API
          fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => { });
        } catch (error) {
          console.error('Error saving description:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [issue, lastSavedDescription, autosaveDescription]);

  // Fetch labels for the workspace
  useEffect(() => {
    if (!workspaceId) return;

    const fetchLabels = async () => {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/labels`);
        if (response.ok) {
          const data = await response.json();
          setLabels(data.labels || []);
        }
      } catch (error) {
        console.error('Error fetching labels:', error);
        setLabels([]);
      }
    };

    fetchLabels();
  }, [workspaceId]);

  // Effect for live timer when issue is playing
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    // Wait for play time to be loaded before starting timer
    if (isLoadingPlayTime) {
      return;
    }

    if (userStatus?.statusStartedAt && issue?.id) {
      const isMyIssue = userStatus.currentTaskId === issue.id;
      const isPlaying = userStatus.currentTaskPlayState === "playing";

      if (isMyIssue && isPlaying) {
        const tick = () => {
          const start = new Date(userStatus.statusStartedAt);
          const now = new Date();
          const sessionElapsed = now.getTime() - start.getTime();

          // Use the totalTimeMs from the API if available, otherwise 0
          const baseTime = totalPlayTime?.totalTimeMs || 0;
          const currentTotalMs = baseTime + sessionElapsed;
          const formatted = formatLiveTime(currentTotalMs);
          setLiveTimeDisplay(formatted);
        };

        tick();
        intervalId = setInterval(tick, 1000);
      } else if (!isPlaying && totalPlayTime) {
        setLiveTimeDisplay(totalPlayTime.formattedTime);
      }
    } else if (totalPlayTime && userStatus?.currentTaskId !== issue?.id) {
      setLiveTimeDisplay(totalPlayTime.formattedTime);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [userStatus?.currentTaskId, userStatus?.currentTaskPlayState, userStatus?.statusStartedAt, issue?.id, totalPlayTime, isLoadingPlayTime]);

  // Fetch playtime when issue ID changes or onRefresh is called
  useEffect(() => {
    if (issue?.id) {
      fetchTotalPlayTime();
    }
  }, [issue?.id, fetchTotalPlayTime, onRefresh]);

  // Fetch follow status for this issue
  useEffect(() => {
    let active = true;
    (async () => {
      if (!issue?.id) return;
      try {
        const res = await fetch(`/api/issues/${issue.id}/follow`, { cache: 'no-store' });
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          if (active) setIsFollowingIssue(!!data.isFollowing);
        }
      } catch (e) {
        // Ignore fetch errors
      }
    })();
    return () => { active = false; };
  }, [issue?.id]);

  const toggleIssueFollow = useCallback(async () => {
    if (!issue?.id || isTogglingIssueFollow) return;
    setIsTogglingIssueFollow(true);
    try {
      const method = isFollowingIssue ? 'DELETE' : 'POST';
      const res = await fetch(`/api/issues/${issue.id}/follow`, { method });
      if (res.ok) {
        setIsFollowingIssue(prev => !prev);
      } else {
        const err = await res.json().catch(() => ({} as any));
        toast({ title: 'Error', description: err.error || 'Failed to toggle follow', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to toggle follow', variant: 'destructive' });
    } finally {
      setIsTogglingIssueFollow(false);
    }
  }, [issue?.id, isFollowingIssue, isTogglingIssueFollow, toast]);

  // Handle history modal
  const handleHistoryClick = useCallback(() => {
    setIsHistoryOpen(true);
  }, []);

  // Build collaboration document id using workspace slug and issue key
  const collabDocumentId = issue?.issueKey && workspaceId
    ? `${workspaceId}.${issue.issueKey}.description`
    : undefined;

  // Handle field updates with optimistic UI
  const handleUpdate = useCallback(async (updates: IssueFieldUpdate) => {
    if (!issue) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/issues/${issue.issueKey || issue.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(errorData.message || errorData.error || `Failed to update issue (${response.status})`);
      }

      toast({
        title: "Updated",
        description: "Issue updated successfully",
      });

      // Refresh the issue data
      onRefresh();
    } catch (error) {
      console.error('Failed to update issue:', error);
      toast({
        title: "Error",
        description: "Failed to update issue",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, [issue, onRefresh, toast]);

  // Handle title save
  const handleSaveTitle = useCallback(async () => {
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Title cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      await handleUpdate({ title });
      setEditingTitle(false);
    } catch (error) {
      // Error already handled in handleUpdate
    }
  }, [title, handleUpdate, toast]);

  // Handle description change and detect changes
  const handleDescriptionChange = useCallback((newDescription: string) => {
    setDescription(newDescription);
  }, []);

  // AI Improve function for description editor
  const handleAiImprove = useCallback(async (text: string): Promise<string> => {
    try {
      const response = await fetch('/api/ai/improve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Failed to improve text');
      }

      const data = await response.json();
      console.log('handleAiImprove: API response data:', data);
      return data.message || data.improvedText || text;
    } catch (error) {
      console.error('Error improving text:', error);
      toast({
        title: "Error",
        description: "Failed to improve text with AI",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);



  // Handle copy link
  const handleCopyLink = useCallback(() => {
    if (!issue?.issueKey) return;

    const url = `${window.location.origin}/${workspaceId}/issues/${issue.issueKey}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Link copied",
        description: "Issue link copied to clipboard",
      });
    }).catch(() => {
      toast({
        title: "Failed to copy",
        description: "Could not copy link to clipboard",
        variant: "destructive",
      });
    });
  }, [issue, workspaceId, toast]);

  // Handle delete issue
  const handleDeleteIssue = useCallback(async () => {
    if (!issue?.issueKey && !issue?.id) return;

    const confirmed = window.confirm('Are you sure you want to delete this issue? This action cannot be undone.');
    if (!confirmed) return;

    try {
      await deleteIssueMutation.mutateAsync(issue.issueKey || issue.id);

      toast({
        title: "Issue deleted",
        description: "The issue has been deleted successfully",
      });

      // Navigate back based on context
      if (viewSlug && workspaceId) {
        router.push(`/${workspaceId}/views/${viewSlug}`);
      } else {
        // Try to detect if we came from a view by checking referrer
        const referrer = document.referrer;
        if (referrer && workspaceId) {
          const url = new URL(referrer);
          const pathSegments = url.pathname.split('/').filter(Boolean);

          // Check if referrer is a view page: /workspace/views/viewSlug
          if (pathSegments.length >= 3 && pathSegments[1] === 'views') {
            router.push(referrer);
            return;
          }
        }

        // Fallback based on issue context
        if (issue.projectId && workspaceId) {
          router.push(`/${workspaceId}/projects/${issue.projectId}`);
        } else if (workspaceId) {
          router.push(`/${workspaceId}/views`);
        } else {
          router.push('/dashboard');
        }
      }
    } catch (error) {
      console.error('Failed to delete issue:', error);
      toast({
        title: "Error",
        description: "Failed to delete issue. Please try again.",
        variant: "destructive",
      });
    }
  }, [issue, deleteIssueMutation, toast, router, viewSlug, workspaceId]);

  // Handle back navigation
  const handleBackNavigation = useCallback(async () => {
    if (!workspaceId) {
      router.back();
      return;
    }

    try {
      const backUrl = await generateBackNavigationUrl(workspaceId, issue, viewSlug);
      router.push(backUrl);
    } catch (error) {
      console.error('Error generating back navigation URL:', error);

      // Fallback to original logic if helper fails
      if (viewSlug && workspaceId) {
        router.push(`/${workspaceId}/views/${viewSlug}`);
      } else if (issue?.projectId && workspaceId) {
        router.push(`/${workspaceId}/projects/${issue.projectId}`);
      } else if (workspaceId) {
        router.push(`/${workspaceId}/views`);
      } else {
        router.back();
      }
    }
  }, [router, viewSlug, workspaceId, issue]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        switch (event.key) {
          case 'c':
            {
              const activeElement = document.activeElement as HTMLElement | null;
              const isTextInputFocused = !!activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable ||
                !!activeElement.closest('[contenteditable="true"]')
              );

              if (!editingTitle && !isTextInputFocused) {
                event.preventDefault();
                handleCopyLink();
              }
            }
            break;
          case 'Enter':
            if (editingTitle) {
              event.preventDefault();
              handleSaveTitle();
            }
            break;
        }
      }

      if (event.key === 'Escape') {
        if (editingTitle) {
          setEditingTitle(false);
          setTitle(issue?.title || '');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingTitle, handleSaveTitle, handleCopyLink, issue, onClose]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <LoadingState size="md" className="mx-auto text-[#8b949e]" noPadding={true} />
          <p className="text-[#8b949e] text-sm">Loading issue...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="p-8 border border-[#1f1f1f] bg-[#0a0a0a] rounded-lg">
          <div className="space-y-4">
            <div className="text-red-400 font-semibold">Error</div>
            <p className="text-[#8b949e]">{error}</p>
            <div className="flex justify-center gap-2">
              <Button
                onClick={onRefresh}
                size="sm"
                className="bg-[#238636] hover:bg-[#2ea043] text-white"
              >
                Try Again
              </Button>
              {onClose && (
                <Button
                  onClick={onClose}
                  variant="outline"
                  size="sm"
                  className="border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f]"
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not found state
  if (!issue) {
    return (
      <div className="text-center py-12">
        <div className="p-8 border border-[#1f1f1f] bg-[#0a0a0a] rounded-lg">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-white">Issue not found</div>
            <p className="text-[#8b949e]">
              The issue you're looking for doesn't exist or you don't have permission to view it.
            </p>
            {onClose && (
              <Button
                onClick={onClose}
                variant="outline"
                size="sm"
                className="border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f]"
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "h-full flex flex-col",
      "bg-[#0a0a0a] text-white transition-opacity duration-200",
      isUpdating && "opacity-60"
    )}>
      {/* Page Header */}
      <PageHeader
        title={
          <button
            onClick={handleBackNavigation}
            className="flex items-center gap-2 text-[#7d8590] hover:text-[#e6edf3] transition-colors text-sm"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Back to {viewName || (issue?.project?.name ? `${issue.project.name}: Default` : 'Views')}</span>
          </button>
        }
        actions={
          <div className="flex items-center gap-2">
            {/* Time tracking controls - Only show if time tracking is enabled */}
            {false && (
              <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded-md border border-border/50 shadow-sm mr-2">
                {currentPlayState === "stopped" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePlayPauseStop("play")}
                    disabled={isTimerLoading || !issue?.id || !canControlTimer}
                    className="h-7 w-7 p-0 hover:bg-green-500/10 text-green-600 hover:text-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Start Timer"
                  >
                    {isTimerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                )}
                {currentPlayState === "playing" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePlayPauseStop("pause")}
                    disabled={isTimerLoading || !issue?.id || !canControlTimer}
                    className="h-7 w-7 p-0 hover:bg-amber-500/10 text-amber-600 hover:text-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Pause Timer"
                  >
                    {isTimerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                  </Button>
                )}
                {currentPlayState === "paused" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePlayPauseStop("play")}
                    disabled={isTimerLoading || !issue?.id || !canControlTimer}
                    className="h-7 w-7 p-0 hover:bg-green-500/10 text-green-600 hover:text-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Resume Timer"
                  >
                    {isTimerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                )}
                {(currentPlayState === "playing" || currentPlayState === "paused") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePlayPauseStop("stop")}
                    disabled={isTimerLoading || !issue?.id || !canControlTimer}
                    className="h-7 w-7 p-0 hover:bg-red-500/10 text-red-600 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Stop Timer"
                  >
                    {isTimerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                  </Button>
                )}

                <div className="border-l h-5 border-border/70 mx-1"></div>

                {isLoadingPlayTime ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : userStatus?.currentTaskId === issue?.id && userStatus?.currentTaskPlayState === "playing" ? (
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 pl-1" title={`Total time spent (live): ${liveTimeDisplay || totalPlayTime?.formattedTime || '0h 0m 0s'}`}>
                    <Clock className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-green-500 font-semibold">{liveTimeDisplay || totalPlayTime?.formattedTime || '0h 0m 0s'}</span>
                  </div>
                ) : totalPlayTime ? (
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 pl-1" title={`Total time spent: ${totalPlayTime?.formattedTime}`}>
                    <Clock className="h-3.5 w-3.5" />
                    <span>{totalPlayTime?.formattedTime}</span>
                  </div>
                ) : (
                  <div className="text-xs font-medium text-muted-foreground/60 flex items-center gap-1 pl-1" title="No time logged yet">
                    <Clock className="h-3.5 w-3.5" />
                    <span>0h 0m 0s</span>
                  </div>
                )}
              </div>
            )}

            {/* Follow Issue Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleIssueFollow}
              className={cn(
                pageHeaderButtonStyles.ghost,
                isFollowingIssue ? "text-red-400 hover:bg-red-500/10" : "text-green-400 hover:bg-green-500/10"
              )}
              disabled={isTogglingIssueFollow}
              aria-pressed={isFollowingIssue}
              aria-label={isFollowingIssue ? 'Unfollow' : 'Follow'}
            >
              {isTogglingIssueFollow ? (
                <Loader2 className="h-3 w-3 animate-spin md:mr-1" />
              ) : isFollowingIssue ? (
                <BellOff className="h-3 w-3 md:mr-1" />
              ) : (
                <Bell className="h-3 w-3 md:mr-1" />
              )}
              <span data-text className="hidden md:inline ml-1">
                {isFollowingIssue ? 'Unfollow' : 'Follow'}
              </span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              className="h-6 px-1 md:px-2 text-[#7d8590] hover:text-[#e6edf3] text-xs border border-[#21262d] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22] flex items-center justify-center"
            >
              <Copy className="h-3 w-3 md:mr-1" />
              <span data-text className="hidden md:inline ml-1">Copy Link</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteIssue}
              disabled={deleteIssueMutation.isPending}
              className="h-6 px-1 md:px-2 text-[#f85149] hover:text-[#ff6b6b] text-xs border border-[#21262d] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22] flex items-center justify-center"
            >
              {deleteIssueMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin md:mr-1" />
              ) : (
                <Trash2 className="h-3 w-3 md:mr-1" />
              )}
              <span data-text className="hidden md:inline ml-1">Delete</span>
            </Button>
          </div>
        }
      />

      <div className="flex-1 max-w-7xl mx-auto p-6 w-full flex flex-col min-h-0">
        {/* Header */}
        <div className="flex-none space-y-4 mb-6">


          {/* Title */}
          <div className="space-y-3">
            {editingTitle ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {/* Issue Key Badge */}
                  <Badge
                    className="font-mono text-xs px-2 py-1 bg-[#1f1f1f] border-[#333] text-[#8b949e] hover:bg-[#333] transition-colors cursor-pointer flex-shrink-0"
                    onClick={handleCopyLink}
                  >
                    {issue.issueKey}
                  </Badge>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-xl font-semibold bg-[#1f1f1f] border-[#333] text-white placeholder-[#6e7681] focus:border-[#58a6ff] h-auto py-2 flex-1"
                    placeholder="Issue title"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveTitle();
                      } else if (e.key === 'Escape') {
                        setEditingTitle(false);
                        setTitle(issue.title);
                      }
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveTitle}
                    disabled={isUpdating}
                    className="h-8 bg-[#238636] hover:bg-[#2ea043] text-white"
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingTitle(false);
                      setTitle(issue.title);
                    }}
                    disabled={isUpdating}
                    className="h-8 border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f]"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="group cursor-pointer flex items-center gap-3"
                onClick={() => setEditingTitle(true)}
              >
                {/* Issue Key Badge */}
                <Badge
                  className="font-mono text-xs px-2 py-1 bg-[#1f1f1f] border-[#333] text-[#8b949e] hover:bg-[#333] transition-colors cursor-pointer flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyLink();
                  }}
                >
                  {issue.issueKey}
                </Badge>
                <h1 className="text-xl font-semibold text-white group-hover:text-[#58a6ff] transition-colors flex-1">
                  {issue.title}
                </h1>
                <PenLine className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-[#6e7681] flex-shrink-0" />
              </div>
            )}

            {/* Properties Row - Using New Selectors */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Selector */}
              <IssueStatusSelector
                value={issue.status}
                onChange={(value) => handleUpdate({ status: value })}
                projectId={issue.projectId}
                currentStatus={issue.projectStatus}
                disabled={isUpdating}
              />

              {/* Priority Selector */}
              <IssuePrioritySelector
                value={issue.priority || 'MEDIUM'}
                onChange={(value) => handleUpdate({ priority: value })}
                disabled={isUpdating}
              />

              {/* Type Selector */}
              <IssueTypeSelector
                value={issue.type}
                onChange={(value) => handleUpdate({ type: value })}
                disabled={isUpdating}
              />

              {/* Assignee Selector */}
              <IssueAssigneeSelector
                value={issue.assigneeId}
                onChange={(value) => handleUpdate({ assigneeId: value })}
                workspaceId={workspaceId}
                disabled={isUpdating}
              />

              {/* Reporter Selector */}
              <IssueReporterSelector
                value={issue.reporterId}
                onChange={(value) => handleUpdate({ reporterId: value })}
                workspaceId={workspaceId}
                disabled={isUpdating}
              />

              {/* Labels Selector */}
              <IssueLabelSelector
                value={issue.labels?.map(l => l.id) || []}
                onChange={(labelIds) => {
                  // Convert label IDs back to label objects for the update
                  const labelObjects = labels.filter(label => labelIds.includes(label.id));
                  handleUpdate({ labels: labelObjects });
                }}
                workspaceId={workspaceId}
                disabled={isUpdating}
              />

              {/* Project Selector */}
              <IssueProjectSelector
                value={issue.projectId}
                onChange={(value) => handleUpdate({ projectId: value })}
                workspaceId={workspaceId || ''}
                disabled={isUpdating}
              />

              {/* Due Date Selector */}
              <IssueDateSelector
                value={issue.dueDate}
                onChange={(value) => handleUpdate({ dueDate: value })}
                disabled={isUpdating}
              />
            </div>

            <div className="flex items-center justify-between">
              {/* Created info */}
              <div className="flex items-center gap-2 text-xs text-[#6e7681]">
                <span>Created {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}</span>
                {issue.reporter && (
                  <>
                    <span>by</span>
                    <div className="flex items-center gap-1">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={issue.reporter.image} />
                        <AvatarFallback className="text-[10px] bg-[#333] text-[#8b949e]">
                          {issue.reporter.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{issue.reporter.name}</span>
                    </div>
                  </>
                )}
              </div>
              
              {/* Autosave status indicator and Editor Controls */}
              <div className="flex items-center gap-4 text-xs text-[#8b949e]">
                {/* Autosave Status */}
                <div className="flex items-center gap-2 border-r border-[#21262d] pr-4">
                  {autosaveStatus === "idle" && (
                    <>
                      <span className="text-[#8b949e]">Autosave is active</span>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </>
                  )}

                  {autosaveStatus === "saving" && (
                    <>
                      <span>Saving…</span>
                      <Loader2 className="h-2 w-2 animate-spin text-green-500" />
                    </>
                  )}
                  {autosaveStatus === "saved" && showSavedIndicator && (
                    <>
                      <span>Saved</span>
                      <Check className="h-2 w-2 text-green-500 animate-pulse" />
                    </>
                  )}

                  {autosaveStatus === "error" && (
                    <>
                      <X className="h-3 w-3" />
                      <span>Autosave failed</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-[#ff6b6b] hover:bg-[#2a1212]"
                        onClick={() => autosaveDescription(description)}
                      >
                        Retry
                      </Button>
                    </>
                  )}
                </div>
                {/* Editor Mini Toolbar */}
                {collabDocumentId && (
                  <EditorMiniToolbar
                    editorRef={editorRef}
                    onHistoryClick={handleHistoryClick}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Full Width Experience */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-6 pb-8">
            {/* Seamless Description Editor - Full Width */}
            <div className="w-full relative">

              <IssueRichEditor
                ref={editorRef}
                value={description}
                onChange={handleDescriptionChange}
                placeholder="Add a description..."
                onAiImprove={handleAiImprove}
                className="w-full"
                enableSlashCommands={true}
                enableFloatingMenu={true}
                collabDocumentId={collabDocumentId}
                minHeight="400px"
                maxHeight="none"
                issueId={issue.id}
              />
            </div>



            {/* Issue Tabs Section - Relations, Sub-issues, Time, Team, Activity (without Comments) */}
            <IssueTabs
              issue={issue}
              initialComments={issue.comments || []}
              currentUserId={workspaceId || ""} // TODO: Replace with actual current user ID
              workspaceId={workspaceId || ""}
              onRefresh={onRefresh}
            />

            {/* Separate Comments Section - Always visible */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[#e1e7ef] border-b border-[#21262d] pb-2">
                <MessageSquare className="h-4 w-4" />
                <span>Comments</span>
                {issue.comments && issue.comments.length > 0 && (
                  <span className="ml-1 text-xs bg-[#333] text-[#aaa] px-1.5 py-0.5 rounded-full">
                    {issue.comments.length}
                  </span>
                )}
              </div>
              <IssueCommentsSection
                issueId={issue.id}
                initialComments={(issue.comments || []) as any}
                currentUserId={currentUserId}
                workspaceId={workspaceId || ""}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Helper Confirmation Modal */}
      <Dialog open={showHelperModal} onOpenChange={setShowHelperModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Work as Helper</DialogTitle>
            <DialogDescription>
              You are not assigned to this issue. You will be added as a helper and your time will be tracked separately.
              {issue?.assigneeId && (
                <span className="block mt-2 text-sm">
                  This issue is assigned to someone else.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {issue && (
            <div className="py-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Play className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{issue.title}</p>
                  {issue.issueKey && (
                    <p className="text-xs text-muted-foreground font-mono">{issue.issueKey}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleHelperCancel}
              disabled={isTimerLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleHelperConfirm}
              disabled={isTimerLoading}
            >
              {isTimerLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                "Yes, Start as Helper"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <EditorHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        collabDocumentId={collabDocumentId}
        issueId={issue?.id}
        editorRef={editorRef}
      />

      {/* Autosave is always on; no unsaved changes modal */}
    </div>
  );
} 