"use client";

import { useState, useCallback, useEffect, useRef, useLayoutEffect } from "react";
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
  ArrowLeft,
  Bell,
  BellOff,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useDeleteIssue, useUpdateIssue, issueKeys } from "@/hooks/queries/useIssues";
import { useQueryClient } from "@tanstack/react-query";
import PageHeader, { pageHeaderButtonStyles } from "@/components/layout/PageHeader";
import { useSession } from "next-auth/react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { IssueTabs } from "./sections/IssueTabs";
import { IssueRichEditor } from "@/components/RichEditor/IssueRichEditor";
import { IssueCommentsSection } from "./sections/IssueCommentsSection";
import { EditorMiniToolbar } from "@/components/RichEditor/components/EditorMiniToolbar";
import { EditorHistoryModal } from "@/components/RichEditor/components/EditorHistoryModal";
import type { RichEditorRef } from "@/components/RichEditor/types";
import { generateBackNavigationUrl } from "@/lib/navigation-helpers";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IssueAssigneeSelector } from "@/components/issue/selectors/IssueAssigneeSelector";
import { IssueStatusSelector } from "@/components/issue/selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "@/components/issue/selectors/IssuePrioritySelector";
import { IssueReporterSelector } from "@/components/issue/selectors/IssueReporterSelector";
import { IssueLabelSelector } from "@/components/issue/selectors/IssueLabelSelector";
import { IssueTypeSelector } from "@/components/issue/selectors/IssueTypeSelector";
import { IssueProjectSelector } from "@/components/issue/selectors/IssueProjectSelector";
import { IssueDateSelector } from "@/components/issue/selectors/IssueDateSelector";
import { LoadingState } from "@/components/issue/sections/activity/components/LoadingState";
import { normalizeDescriptionHTML } from "@/utils/html-normalizer";

// Import types
import type { IssueDetailProps, IssueFieldUpdate, IssueUser } from "@/types/issue";


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
  createdByUser?: IssueUser;
  mode?: "modal" | "page";
  parentIssueInfo?: { title: string; key: string } | null;
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
  viewSlug,
  createdByUser,
  mode = "page",
  parentIssueInfo
}: IssueDetailContentProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const deleteIssueMutation = useDeleteIssue();
  const updateIssueMutation = useUpdateIssue();
  const queryClient = useQueryClient();
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

  // Session hooks
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;


  // Follow state
  const [isFollowingIssue, setIsFollowingIssue] = useState(false);
  const [isTogglingIssueFollow, setIsTogglingIssueFollow] = useState(false);

  // Editor reference for mini toolbar
  const editorRef = useRef<RichEditorRef>(null);

  // Focus management refs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const preventFocusStealRef = useRef(false);

  // History modal state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);


  // Focus management utilities
  const saveFocusState = useCallback(() => {
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && activeElement !== document.body) {
      lastFocusedElementRef.current = activeElement;
    }
  }, []);

  const restoreFocusState = useCallback(() => {
    if (lastFocusedElementRef.current && document.contains(lastFocusedElementRef.current)) {
      try {
        const element = lastFocusedElementRef.current;

        // Check if it's the ProseMirror editor (contenteditable)
        const isEditor = element.closest('.ProseMirror') || element.classList.contains('ProseMirror');

        if (isEditor && editorRef.current) {
          // Don't force focus to end - let the editor maintain its own cursor position
          // The editor component handles its own focus state
          return;
        }
        // For other elements, use normal focus
        element.focus();
      } catch (error) {
        // Ignore focus errors
      }
    }
  }, []);

  const preventFocusSteal = useCallback((duration = 100) => {
    preventFocusStealRef.current = true;
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    focusTimeoutRef.current = setTimeout(() => {
      preventFocusStealRef.current = false;
    }, duration);
  }, []);

  // Focus event handler to track focus changes
  const handleFocusChange = useCallback((event: FocusEvent) => {
    // Don't track focus when we're preventing focus steal
    if (preventFocusStealRef.current) {
      return;
    }

    const target = event.target as HTMLElement;

    // Only track focus for input-like elements
    if (target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      target.closest('[contenteditable="true"]') ||
      target.closest('.ProseMirror')
    )) {
      lastFocusedElementRef.current = target;
    }
  }, []);

  // Global focus tracking
  useEffect(() => {
    document.addEventListener('focusin', handleFocusChange);
    return () => {
      document.removeEventListener('focusin', handleFocusChange);
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, [handleFocusChange]);


  // Initialize local state from issue data (only when issue changes)
  useEffect(() => {
    if (issue) {
      setTitle(issue.title || '');
      const normalizedDescription = normalizeDescriptionHTML(issue.description || '');
      setDescription(normalizedDescription);
      setLastSavedDescription(normalizedDescription);
      setAutosaveStatus("saved");

      setTimeout(() => {
        setAutosaveStatus("idle");
      }, 600);
    }
  }, [issue]);

  // Separate focus restoration effect that doesn't reset data
  useEffect(() => {
    if (issue) {
      // Save focus state before any potential updates
      saveFocusState();

      // Use a microtask to restore focus after renders
      Promise.resolve().then(() => {
        if (!editingTitle) {
          // If editor is available and we're restoring focus, focus at end
          if (editorRef.current) {
            // Don't force focus to end - let the editor maintain its own cursor position
            // The editor component handles its own focus state
            // const editor = editorRef.current.getEditor();
            // if (editor) {
            //   setTimeout(() => {
            //     editor.commands.focus('end');
            //   }, 100);
            //   return;
            // }
          }
          restoreFocusState();
        }
      });
    }
  }, [issue, saveFocusState, restoreFocusState, editingTitle]);

  // Keep a ref of the latest description to avoid race conditions when saving
  useEffect(() => {
    latestDescriptionRef.current = description;
  }, [description]);

  // Autosave function (direct API call to avoid noisy toasts and page dimming)
  const autosaveDescription = useCallback(async (content: string) => {
    if (!issue) return;

    // Save focus state before autosave to restore it after
    saveFocusState();

    setAutosaveStatus("saving");
    try {
      const normalizedContent = normalizeDescriptionHTML(content);
      const response = await fetch(`/api/issues/${issue.issueKey || issue.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: normalizedContent }),
      });

      // Parse response once
      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responseData.message || responseData.error || `Autosave failed (${response.status})`);
      }

      // Get updated issue from response
      const updatedIssue = responseData?.issue || responseData;

      // Update React Query cache with the updated issue
      // This ensures modal shows fresh data when reopened
      if (updatedIssue) {
        const issueIdForCache = issue.issueKey || issue.id;
        queryClient.setQueryData(issueKeys.detail(issueIdForCache), { issue: updatedIssue });
      }

      // Only mark saved if this response corresponds to the latest content
      if (content === latestDescriptionRef.current) {
        setLastSavedDescription(normalizedContent);
      }

      setAutosaveStatus("saved");
      setTimeout(() => {
        setAutosaveStatus("idle");
      }, 600);
      setShowSavedIndicator(true);
      setTimeout(() => setShowSavedIndicator(false), 1500);
      autosaveErrorToastShownRef.current = false;

      // Restore focus after successful autosave
      Promise.resolve().then(() => {
        if (!editingTitle) {
          // Don't restore focus for editor - it handles itself
          // restoreFocusState(); 
        }
      });
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

      // Restore focus even on error
      Promise.resolve().then(() => {
        if (!editingTitle) {
          // Don't restore focus for editor - it handles itself
          // restoreFocusState();
        }
      });
    }
  }, [issue, toast, saveFocusState, restoreFocusState, editingTitle, queryClient]);

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
        const normalizedContent = normalizeDescriptionHTML(latestDescriptionRef.current);
        const payload = JSON.stringify({ description: normalizedContent });
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


  // Title editing focus management - Keep focus on title input when editing
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      // Focus the title input
      titleInputRef.current.focus();

      // Prevent focus steal during title editing
      preventFocusSteal(500);

      const preventFocusLoss = (event: FocusEvent) => {
        const target = event.target as HTMLElement;

        // Allow focus on the title input itself
        if (target === titleInputRef.current) {
          return;
        }

        // Allow focus on save/cancel buttons (inside .title-editing-actions)
        if (target.closest('button[type="button"]') && target.closest('.title-editing-actions')) {
          return;
        }

        // If focus is moving to any other element, prevent it and refocus title input
        if (titleInputRef.current) {
          event.preventDefault();
          titleInputRef.current.focus();
        }
      };

      // Add listener to prevent focus loss
      document.addEventListener('focusin', preventFocusLoss);

      return () => {
        document.removeEventListener('focusin', preventFocusLoss);
      };
    }
  }, [editingTitle, preventFocusSteal]);

  // Description and comment focus preservation during rerenders
  useLayoutEffect(() => {
    // This effect runs synchronously after all DOM mutations
    // Use it to restore focus immediately after renders
    if (!editingTitle && lastFocusedElementRef.current && document.contains(lastFocusedElementRef.current)) {
      // Only restore focus if no other element currently has focus
      const activeElement = document.activeElement;
      if (!activeElement || activeElement === document.body) {
        try {
          const element = lastFocusedElementRef.current;
          // Check if it's the ProseMirror editor
          const isEditor = element.closest('.ProseMirror') || element.classList.contains('ProseMirror');

          if (isEditor && editorRef.current) {
            // Don't force focus to end - let the editor maintain its own cursor position
            // The editor component handles its own focus state
            return;
          }

          lastFocusedElementRef.current.focus();
        } catch (error) {
          // Ignore focus errors
        }
      }
    }
  }, [editingTitle]);

  // Handle initial editor focus when issue loads - focus at end
  useEffect(() => {
    if (issue && editorRef.current && !editingTitle) {
      const editor = editorRef.current.getEditor();
      if (!editor) return;

      let hasMovedCursor = false;

      const moveCursorToEnd = () => {
        if (!hasMovedCursor) {
          const { from } = editor.state.selection;
          // If cursor is at the beginning (position 1 or very close), move to end
          if (from <= 1) {
            editor.commands.focus('end');
            hasMovedCursor = true;
          }
        }
      };

      // Listen for focus events on the editor
      const editorElement = editor.view.dom;
      editorElement.addEventListener('focus', moveCursorToEnd, { once: true });

      // Also check after a short delay in case autofocus already happened
      const timeoutId = setTimeout(() => {
        if (editor.view.hasFocus()) {
          moveCursorToEnd();
        }
      }, 100);

      return () => {
        editorElement.removeEventListener('focus', moveCursorToEnd);
        clearTimeout(timeoutId);
      };
    }
  }, [issue, editingTitle]);


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

    // Save focus state before updating
    saveFocusState();
    preventFocusSteal(200);

    setIsUpdating(true);
    try {
      const issueId = issue.issueKey || issue.id;

      // Transform updates to match UpdateIssueData format
      const updateData: any = {
        id: issueId,
        ...updates,
      };

      // Convert labels array to label IDs if present
      if (updates.labels && Array.isArray(updates.labels)) {
        updateData.labels = updates.labels.map((label: any) =>
          typeof label === 'string' ? label : label.id
        );
      }

      // Use React Query mutation for proper cache invalidation
      // The mutation's onSuccess handler will update the cache automatically
      await updateIssueMutation.mutateAsync(updateData);

      toast({
        title: "Updated",
        description: "Issue updated successfully",
      });

      // Only call onRefresh in page mode, not modal mode
      // In modal mode, React Query cache updates will handle the UI update automatically
      if (mode === 'page') {
        onRefresh();
      }

      // Restore focus after update
      Promise.resolve().then(() => {
        if (!editingTitle) {
          restoreFocusState();
        }
      });
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
  }, [issue, mode, onRefresh, toast, saveFocusState, restoreFocusState, preventFocusSteal, editingTitle, updateIssueMutation]);

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

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Handle delete issue
  const handleDeleteIssue = useCallback(() => {
    if (!issue?.issueKey && !issue?.id) return;
    setShowDeleteDialog(true);
  }, [issue]);

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!issue?.issueKey && !issue?.id) return;

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
    } finally {
      setShowDeleteDialog(false);
    }
  }, [issue, deleteIssueMutation, toast, router, viewSlug, workspaceId]);

  // Handle back navigation
  const handleBackNavigation = useCallback(async () => {
    // If in modal mode, close the modal instead of navigating
    if (mode === "modal" && onClose) {
      onClose();
      return;
    }

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
      // Check if we're in a text input
      const activeElement = document.activeElement as HTMLElement | null;
      const isTextInputFocused = !!activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable ||
        !!activeElement.closest('[contenteditable="true"]')
      );

      if (event.metaKey || event.ctrlKey) {
        switch (event.key) {
          case 'Enter':
            if (editingTitle) {
              event.preventDefault();
              handleSaveTitle();
            }
            break;
        }
      }

      // Single key shortcuts (only when not in text input)
      if (!isTextInputFocused && !editingTitle) {
        switch (event.key.toLowerCase()) {
          case 's':
            // Focus the Relations tab (where sub-issues are)
            event.preventDefault();
            const relationsTab = document.querySelector('[value="relations"]') as HTMLElement;
            if (relationsTab) {
              relationsTab.click();
              // Scroll to the sub-issues section after a short delay
              setTimeout(() => {
                const subIssuesSection = document.querySelector('[data-sub-issues-section]') as HTMLElement;
                if (subIssuesSection) {
                  subIssuesSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
              }, 100);
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
  }, [editingTitle, handleSaveTitle, issue, onClose]);

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
        disableBlur={mode === "modal"}
        sticky={mode === "modal"}
        title={
          <button
            onClick={handleBackNavigation}
            className="flex items-center gap-2 text-[#7d8590] hover:text-[#e6edf3] transition-colors text-sm"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>
              {parentIssueInfo
                ? `Back to ${parentIssueInfo.key}`
                : `Back to ${viewName || (issue?.project?.name ? `${issue.project.name}: Default` : 'Views')}`}
            </span>
          </button>
        }
        actions={
          <div className="flex items-center gap-2">
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

            {/* Open in new tab button - only show in modal mode */}
            {mode === "modal" && issue?.issueKey && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const url = currentWorkspace?.slug
                    ? `/${currentWorkspace.slug}/issues/${issue.issueKey}`
                    : workspaceId
                      ? `/${workspaceId}/issues/${issue.issueKey}`
                      : `/issues/${issue.issueKey}`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className={cn(
                  pageHeaderButtonStyles.ghost,
                  "text-[#7d8590] hover:text-[#e6edf3]"
                )}
                title="Open in new tab"
              >
                <ExternalLink className="h-3 w-3 md:mr-1" />
                <span data-text className="hidden md:inline ml-1">
                  Open in tab
                </span>
              </Button>
            )}

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

      <div className="flex-1 overflow-y-auto min-h-0 w-full">
        <div className="max-w-7xl mx-auto p-6 flex flex-col">
          {/* Header */}
          <div className="flex-none space-y-4 mb-6">
            {/* Title */}
            <div className="space-y-3">
              {editingTitle ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 title-editing-controls">
                    {/* Issue Key Badge */}
                    <Badge
                      className="font-mono text-xs px-2 py-1 bg-[#1f1f1f] border-[#333] text-[#8b949e] hover:bg-[#333] transition-colors cursor-pointer flex-shrink-0 w-fit"
                      onClick={handleCopyLink}
                    >
                      {issue.issueKey}
                    </Badge>
                    <Input
                      ref={titleInputRef}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="text-lg sm:text-xl font-semibold bg-[#1f1f1f] border-[#333] text-white placeholder-[#6e7681] h-auto py-1 flex-1 min-w-0"
                      placeholder="Issue title"
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
                    <div className="flex gap-2 title-editing-actions flex-shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveTitle}
                        disabled={isUpdating}
                        className="h-8 bg-[#238636] hover:bg-[#2ea043] text-white"
                      >
                        {isUpdating ? (
                          <Loader2 className="h-3 w-3 animate-spin sm:mr-1" />
                        ) : (
                          <Check className="h-3 w-3 sm:mr-1" />
                        )}
                        <span className="hidden sm:inline">Save</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingTitle(false);
                          setTitle(issue.title);
                        }}
                        disabled={isUpdating}
                        className="h-8 border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f]"
                      >
                        <X className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">Cancel</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="group cursor-pointer flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                  onClick={() => setEditingTitle(true)}
                >
                  {/* Issue Key Badge */}
                  <Badge
                    className="font-mono text-xs px-2 pt-1 pb-0.5 bg-[#1f1f1f] border-[#333] text-[#8b949e] hover:bg-[#333] transition-colors cursor-pointer flex-shrink-0 w-fit"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyLink();
                    }}
                  >
                    {issue.issueKey}
                  </Badge>
                  <div className="flex flex-row items-center gap-2 min-h-[2rem] sm:h-8">
                    <h1 className="text-lg sm:text-xl font-semibold text-white group-hover:text-[#58a6ff] transition-colors flex-1 min-w-0 break-words" data-issue-title>
                      {issue.title}
                    </h1>
                    <PenLine className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-[#6e7681] flex-shrink-0" />
                  </div>
                </div>
              )}

              {/* Properties Row - Using New Selectors */}
              <div className={cn("flex flex-wrap items-center gap-2", editingTitle ? "opacity-30 pointer-events-none transition-opacity duration-300" : "opacity-100")}>
                {/* Core Selectors - Always visible */}
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

                {/* Secondary Selectors - Hide on small screens */}
                {/* Reporter Selector */}
                <div className="hidden md:block">
                  <IssueReporterSelector
                    value={issue.reporterId}
                    onChange={(value) => handleUpdate({ reporterId: value })}
                    workspaceId={workspaceId}
                    disabled={isUpdating}
                  />
                </div>

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
                <div className="hidden sm:block">
                  <IssueProjectSelector
                    value={issue.projectId}
                    onChange={(value) => handleUpdate({ projectId: value })}
                    workspaceId={workspaceId || ''}
                    disabled={isUpdating}
                  />
                </div>

                {/* Due Date Selector */}
                <div className="hidden sm:block">
                  <IssueDateSelector
                    value={issue.dueDate}
                    onChange={(value) => handleUpdate({ dueDate: value })}
                    disabled={isUpdating}
                  />
                </div>
              </div>

              <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0", editingTitle ? "opacity-30 pointer-events-none transition-opacity duration-300" : "opacity-100")}>
                {/* Created info */}
                <div className="flex items-center gap-1 text-xs text-[#6e7681] flex-wrap">
                  <span>Created {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}</span>
                  {createdByUser && (
                    <>
                      <span className="hidden sm:inline">by</span>
                      <div className="flex items-center gap-1">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={createdByUser?.image} />
                          <AvatarFallback className="text-[10px] bg-[#333] text-[#8b949e]">
                            {createdByUser?.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden sm:inline">{createdByUser?.name}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Autosave status indicator and Editor Controls */}
                <div className="flex items-center gap-2 sm:gap-4 text-xs text-[#8b949e]">
                  {/* Autosave Status */}
                  <div className="flex items-center gap-2 border-r border-[#21262d] pr-2 sm:pr-4">
                    {autosaveStatus === "idle" && (
                      <>
                        <span className="hidden sm:inline text-[#8b949e]">Autosave is active</span>
                        <span className="sm:hidden text-[#8b949e]">Autosave</span>
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
                        <span className="hidden sm:inline">Autosave failed</span>
                        <span className="sm:hidden">Failed</span>
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
          <div className={cn("flex-1", editingTitle ? "opacity-30 pointer-events-none transition-opacity duration-300" : "opacity-100")}>
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
                mode={mode}
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
                  autofocus={false}
                />
              </div>
            </div>
          </div>
        </div>


        {/* Delete Confirm Dialog */}
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete Issue"
          description="Are you sure you want to delete this issue? This action cannot be undone."
          variant="danger"
          confirmText="Delete Issue"
          isLoading={deleteIssueMutation.isPending}
          onConfirm={handleDeleteConfirm}
          metadata={issue ? {
            title: issue.title,
            subtitle: issue.issueKey
          } : undefined}
        />

        {/* History Modal */}
        <EditorHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          collabDocumentId={collabDocumentId}
          issueId={issue?.id}
          editorRef={editorRef}
        />
      </div>
    </div>
  );
} 