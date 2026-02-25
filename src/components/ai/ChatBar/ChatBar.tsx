"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  CheckSquare,
  FolderOpen,
  Eye,
  Users,
  Tag,
  FileText,
  Clock,
  Lightbulb,
  Search,
  Sparkles,
  Copy,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAI } from "@/context/AIContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";
import { useCommandSearch } from "@/hooks/queries/useCommandSearch";
import { useProjects } from "@/hooks/queries/useProjects";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NewIssueModal } from "@/components/issue";
import CreateViewModal from "@/components/modals/CreateViewModal";
import CreateProjectModal from "@/components/modals/CreateProjectModal";

import ChatPanel from "./ChatPanel";
import ChatInput from "./ChatInput";
import type { ChatInputHandle } from "./ChatInput";

// ─── Result icon helper ───
function getResultIcon(type: string) {
  switch (type) {
    case "user": return <Users className="h-3.5 w-3.5" />;
    case "issue": return <CheckSquare className="h-3.5 w-3.5" />;
    case "view": return <Eye className="h-3.5 w-3.5" />;
    case "project": return <FolderOpen className="h-3.5 w-3.5" />;
    case "note": return <FileText className="h-3.5 w-3.5" />;
    case "post": return <Clock className="h-3.5 w-3.5" />;
    case "tag": return <Tag className="h-3.5 w-3.5" />;
    default: return <Search className="h-3.5 w-3.5" />;
  }
}

// ─── Quick actions ───
interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

export default function ChatBar() {
  const {
    isExpanded,
    messages,
    sendMessage,
    isLoading,
    isStreaming,
    focusInput,
    blurInput,
    collapseChat,
    agent,
    webSearchEnabled,
    setWebSearchEnabled,
    quickActions: aiQuickActions,
    executeQuickAction,
  } = useAI();

  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  // Local focus state — independent from AIContext's isExpanded
  const [localFocused, setLocalFocused] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showOverlay, setShowOverlay] = useState(false);
  const inputRef = useRef<ChatInputHandle>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Modal states
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [isCreateViewOpen, setIsCreateViewOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  // Search
  const { data: searchResults = [], isLoading: isSearching } = useCommandSearch(
    inputValue,
    currentWorkspace?.id || ""
  );

  const { data: projects = [] } = useProjects({
    workspaceId: currentWorkspace?.id,
    includeStats: false,
  });

  const getWorkspacePath = useCallback(
    (path: string) => {
      if (!currentWorkspace) return "#";
      return `/${currentWorkspace.slug || currentWorkspace.id}${path}`;
    },
    [currentWorkspace]
  );

  // We're in conversation mode when the AI chat panel is actually open
  const inConversation = isExpanded;

  // Determine what to show in the overlay (only when NOT in conversation)
  const isSearchMode = inputValue.trim().length >= 2 && !inConversation;
  const isQuickActionsMode = localFocused && inputValue.trim().length < 2 && !inConversation;

  // Quick actions list
  const quickActions: QuickAction[] = [
    { id: "create-issue", label: "Create new issue", icon: <Plus className="h-3.5 w-3.5" />, shortcut: "C", action: () => setIsNewIssueOpen(true) },
    { id: "create-project", label: "Create project", icon: <Plus className="h-3.5 w-3.5" />, shortcut: "P", action: () => setIsCreateProjectOpen(true) },
    { id: "create-view", label: "Create view", icon: <Plus className="h-3.5 w-3.5" />, action: () => setIsCreateViewOpen(true) },
    { id: "nav-projects", label: "Go to Projects", icon: <FolderOpen className="h-3.5 w-3.5" />, action: () => router.push(getWorkspacePath("/projects")) },
    { id: "nav-views", label: "Go to Views", icon: <Eye className="h-3.5 w-3.5" />, action: () => router.push(getWorkspacePath("/views")) },
    { id: "nav-timeline", label: "Go to Timeline", icon: <Clock className="h-3.5 w-3.5" />, action: () => router.push(getWorkspacePath("/timeline")) },
    { id: "nav-context", label: "Go to Context", icon: <FileText className="h-3.5 w-3.5" />, action: () => router.push(getWorkspacePath("/notes")) },
    { id: "nav-features", label: "Feature Requests", icon: <Lightbulb className="h-3.5 w-3.5" />, action: () => router.push(getWorkspacePath("/features")) },
    { id: "copy-url", label: "Copy current URL", icon: <Copy className="h-3.5 w-3.5" />, action: () => { navigator.clipboard.writeText(window.location.href); toast({ title: "Copied", description: "URL copied to clipboard" }); } },
    { id: "nav-settings", label: "Profile Settings", icon: <Settings className="h-3.5 w-3.5" />, action: () => router.push(getWorkspacePath("/profile")) },
  ];

  // Items for keyboard navigation
  const overlayItems = isSearchMode
    ? searchResults.slice(0, 6).map((r) => ({
        id: `${r.type}-${r.id}`,
        action: () => router.push(r.url),
      }))
    : isQuickActionsMode
      ? quickActions.map((a) => ({ id: a.id, action: a.action }))
      : [];

  // Show/hide overlay
  useEffect(() => {
    setShowOverlay(isSearchMode || isQuickActionsMode);
    setSelectedIndex(-1);
  }, [isSearchMode, isQuickActionsMode]);

  // Handle arrow key navigation
  const handleArrowKey = useCallback(
    (direction: "up" | "down") => {
      if (overlayItems.length === 0) return;
      setSelectedIndex((prev) => {
        if (direction === "down") return Math.min(prev + 1, overlayItems.length - 1);
        return Math.max(prev - 1, -1);
      });
    },
    [overlayItems.length]
  );

  // Handle Enter — navigate to selected result, or send to AI
  const handleSend = useCallback(
    (message: string, files?: File[]) => {
      if (selectedIndex >= 0 && selectedIndex < overlayItems.length) {
        overlayItems[selectedIndex].action();
        setInputValue("");
        setSelectedIndex(-1);
        setShowOverlay(false);
        return;
      }
      // Send to AI — this expands the chat panel via AIContext
      setShowOverlay(false);
      focusInput(); // now expand into conversation mode

      // TODO: Handle files when image upload is implemented in AI context
      sendMessage(message);
    },
    [selectedIndex, overlayItems, sendMessage, focusInput]
  );

  const handleEscape = useCallback(() => {
    if (showOverlay) {
      setShowOverlay(false);
      setSelectedIndex(-1);
      return;
    }
    if (isExpanded) {
      collapseChat();
      blurInput();
    }
    setLocalFocused(false);
  }, [showOverlay, isExpanded, collapseChat, blurInput]);

  // Focus handler: just set local state, do NOT expand AI panel
  const handleFocus = useCallback(() => {
    setLocalFocused(true);
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
  }, []);

  // Blur handler: delay so overlay clicks register
  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      setLocalFocused(false);
    }, 200);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K: focus the unified bar (search mode, no expand)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (localFocused && !isExpanded) {
          // Already focused in search mode — blur/close
          setLocalFocused(false);
          setShowOverlay(false);
        } else if (isExpanded) {
          // In conversation — collapse
          collapseChat();
          blurInput();
        } else {
          // Focus without expanding
          setLocalFocused(true);
          inputRef.current?.focus();
        }
      }
      // Cmd+J: toggle AI conversation panel
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        if (isExpanded) {
          collapseChat();
          blurInput();
        } else {
          focusInput(); // this expands the panel
          inputRef.current?.focus();
        }
      }
      if (e.key === "Escape" && (isExpanded || showOverlay)) {
        e.preventDefault();
        handleEscape();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [localFocused, isExpanded, focusInput, blurInput, collapseChat, handleEscape, showOverlay]);

  const agentColor = agent?.color || "#6366f1";
  const barFocused = localFocused || isExpanded;

  const handleResultClick = useCallback(
    (action: () => void) => {
      action();
      setInputValue("");
      setShowOverlay(false);
      setSelectedIndex(-1);
    },
    []
  );

  return (
    <>
      <div
        className={cn(
          "fixed bottom-0 z-40",
          "left-0 right-0 md:left-[var(--sidebar-width)]",
          "flex justify-center pointer-events-none",
          "pb-4 md:pb-6 px-4",
        )}
      >
        {/* Single unified glass container */}
        <div
          className={cn(
            "w-full max-w-[720px] pointer-events-auto",
            "rounded-2xl overflow-hidden",
            "bg-white/[0.04] backdrop-blur-xl",
            "border border-white/[0.08]",
            "shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
            "transition-all duration-300 ease-out",
            barFocused && "border-white/[0.12]",
          )}
          style={{
            boxShadow: barFocused
              ? `0 8px 50px rgba(0,0,0,0.5), 0 0 30px ${agentColor}08`
              : "0 8px 40px rgba(0,0,0,0.4)",
          }}
        >
          {/* AI Chat panel (conversation mode — only when expanded) */}
          <ChatPanel />

          {/* Search results / Quick actions overlay (only when NOT in conversation) */}
          <AnimatePresence>
            {showOverlay && !inConversation && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="max-h-[320px] overflow-y-auto py-1">
                  {isSearchMode ? (
                    // ── Search results ──
                    <>
                      {isSearching ? (
                        <div className="flex items-center gap-2 px-4 py-3 text-xs text-white/30">
                          <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/50 rounded-full animate-spin" />
                          Searching...
                        </div>
                      ) : searchResults.length > 0 ? (
                        <>
                          <div className="px-4 pt-1 pb-1.5">
                            <span className="text-[10px] font-medium text-white/25 uppercase tracking-wider">
                              Results
                            </span>
                          </div>
                          {searchResults.slice(0, 6).map((result, i) => (
                            <button
                              key={`${result.type}-${result.id}`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleResultClick(() => router.push(result.url))}
                              className={cn(
                                "flex items-center gap-2.5 w-full px-4 py-2 text-left",
                                "transition-colors duration-100",
                                selectedIndex === i
                                  ? "bg-white/[0.08]"
                                  : "hover:bg-white/[0.04]"
                              )}
                            >
                              {result.type === "user" ? (
                                result.metadata?.user?.useCustomAvatar ? (
                                  <CustomAvatar user={result.metadata.user} size="sm" className="h-5 w-5 shrink-0" />
                                ) : (
                                  <UserAvatar user={result.metadata?.user} size="sm" className="shrink-0" />
                                )
                              ) : (
                                <span className="text-white/30">{getResultIcon(result.type)}</span>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-white/25 capitalize">{result.type}</span>
                                  <span className="text-white/15">&rsaquo;</span>
                                  <span className="text-sm text-white/70 truncate">{result.title}</span>
                                </div>
                                {result.description && (
                                  <p className="text-[11px] text-white/20 truncate mt-0.5">
                                    {result.description.length > 60
                                      ? `${result.description.substring(0, 60)}...`
                                      : result.description}
                                  </p>
                                )}
                              </div>
                            </button>
                          ))}
                          {/* "Ask AI" option at the bottom */}
                          <div className="h-px bg-white/[0.04] mx-3 my-1" />
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const q = inputValue.trim();
                              setInputValue("");
                              handleSend(q);
                            }}
                            className={cn(
                              "flex items-center gap-2.5 w-full px-4 py-2 text-left",
                              "transition-colors duration-100",
                              selectedIndex === searchResults.slice(0, 6).length
                                ? "bg-white/[0.08]"
                                : "hover:bg-white/[0.04]"
                            )}
                          >
                            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                            <span className="text-sm text-white/50">
                              Ask AI about <span className="text-white/70">&ldquo;{inputValue.trim()}&rdquo;</span>
                            </span>
                          </button>
                        </>
                      ) : (
                        <>
                          {/* No search results — offer AI */}
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const q = inputValue.trim();
                              setInputValue("");
                              handleSend(q);
                            }}
                            className={cn(
                              "flex items-center gap-2.5 w-full px-4 py-3 text-left",
                              "hover:bg-white/[0.04] transition-colors"
                            )}
                          >
                            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                            <span className="text-sm text-white/50">
                              Ask AI about <span className="text-white/70">&ldquo;{inputValue.trim()}&rdquo;</span>
                            </span>
                          </button>
                        </>
                      )}
                    </>
                  ) : isQuickActionsMode ? (
                    // ── Quick actions ──
                    <>
                      <div className="px-4 pt-1 pb-1.5">
                        <span className="text-[10px] font-medium text-white/25 uppercase tracking-wider">
                          Quick Actions
                        </span>
                      </div>
                      {quickActions.map((action, i) => (
                        <button
                          key={action.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleResultClick(action.action)}
                          className={cn(
                            "flex items-center gap-2.5 w-full px-4 py-1.5 text-left",
                            "transition-colors duration-100",
                            selectedIndex === i
                              ? "bg-white/[0.08]"
                              : "hover:bg-white/[0.04]"
                          )}
                        >
                          <span className="text-white/30">{action.icon}</span>
                          <span className="text-sm text-white/60 flex-1">{action.label}</span>
                          {action.shortcut && (
                            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-white/20 font-mono">
                              {action.shortcut}
                            </kbd>
                          )}
                        </button>
                      ))}

                      {/* AI Quick Actions (contextual) */}
                      {aiQuickActions.length > 0 && (
                        <>
                          <div className="h-px bg-white/[0.04] mx-3 my-1" />
                          <div className="px-4 pt-1 pb-1.5">
                            <span className="text-[10px] font-medium text-white/25 uppercase tracking-wider">
                              Ask Cleo
                            </span>
                          </div>
                          {aiQuickActions.slice(0, 4).map((action, i) => (
                            <button
                              key={action.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleResultClick(() => executeQuickAction(action))}
                              className={cn(
                                "flex items-center gap-2.5 w-full px-4 py-1.5 text-left",
                                "transition-colors duration-100",
                                selectedIndex === quickActions.length + i
                                  ? "bg-white/[0.08]"
                                  : "hover:bg-white/[0.04]"
                              )}
                            >
                              <Sparkles className="h-3.5 w-3.5 text-indigo-400/60" />
                              <span className="text-sm text-white/50">{action.label}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider between overlay/panel and input */}
          {(isExpanded || showOverlay) && (
            <div className="h-px bg-white/[0.06]" />
          )}

          {/* Input row */}
          <ChatInput
            ref={inputRef}
            value={inputValue}
            onValueChange={setInputValue}
            onSend={handleSend}
            isLoading={isLoading}
            isStreaming={isStreaming}
            placeholder={
              agent
                ? `Search or ask ${agent.name}...`
                : "Search or ask Cleo anything..."
            }
            onFocus={handleFocus}
            onBlur={handleBlur}
            onArrowKey={handleArrowKey}
            onEscape={handleEscape}
            hasSelectedResult={selectedIndex >= 0}
            webSearchEnabled={webSearchEnabled}
            onWebSearchToggle={() => setWebSearchEnabled(!webSearchEnabled)}
          />

        </div>
      </div>

      {/* Modals */}
      {currentWorkspace && (
        <>
          <NewIssueModal
            open={isNewIssueOpen}
            onOpenChange={setIsNewIssueOpen}
            workspaceId={currentWorkspace.id}
            onCreated={() => {
              setIsNewIssueOpen(false);
              queryClient.invalidateQueries();
              toast({ title: "Success", description: "Issue created successfully" });
            }}
          />
          <CreateViewModal
            isOpen={isCreateViewOpen}
            onClose={() => setIsCreateViewOpen(false)}
            workspaceId={currentWorkspace.id}
            projects={projects}
            onViewCreated={() => {
              setIsCreateViewOpen(false);
              queryClient.invalidateQueries();
              toast({ title: "Success", description: "View created successfully" });
            }}
          />
          <CreateProjectModal
            isOpen={isCreateProjectOpen}
            onClose={() => setIsCreateProjectOpen(false)}
            workspaceId={currentWorkspace.id}
            onProjectCreated={() => {
              setIsCreateProjectOpen(false);
              queryClient.invalidateQueries();
              toast({ title: "Success", description: "Project created successfully" });
            }}
          />
        </>
      )}
    </>
  );
}
