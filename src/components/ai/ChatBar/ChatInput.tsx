"use client";

import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { ArrowUp, ChevronDown, Loader2, Paperclip, X, Globe, Mic, StopCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (message: string, files?: File[]) => void;
  isLoading: boolean;
  isStreaming: boolean;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onArrowKey?: (direction: 'up' | 'down') => void;
  onEscape?: () => void;
  hasSelectedResult?: boolean;
  webSearchEnabled: boolean;
  onWebSearchToggle: () => void;
  availableAgents?: Array<{ slug: string; name: string; color: string; isDefault: boolean }>;
  selectedAgentSlug?: string;
  onAgentChange?: (slug: string) => void;
  agentStatus?: {
    instanceStatus: string;
    isHealthy: boolean;
  } | null;
}

export interface ChatInputHandle {
  focus: () => void;
}

// Image preview dialog
function ImagePreviewDialog({
  imageUrl,
  onClose,
}: {
  imageUrl: string | null;
  onClose: () => void;
}) {
  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative max-w-[90vw] max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 rounded-full bg-white/10 p-2 hover:bg-white/20 transition-all"
        >
          <X className="h-4 w-4 text-white" />
        </button>
        <img
          src={imageUrl}
          alt="Preview"
          className="max-w-full max-h-[80vh] object-contain rounded-xl"
        />
      </motion.div>
    </div>
  );
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    value,
    onValueChange,
    onSend,
    isLoading,
    isStreaming,
    placeholder = "Search or ask Cleo anything...",
    onFocus,
    onBlur,
    onArrowKey,
    onEscape,
    hasSelectedResult,
    webSearchEnabled,
    onWebSearchToggle,
    availableAgents = [],
    selectedAgentSlug,
    onAgentChange,
    agentStatus,
  },
  ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // File upload state
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval>>();

  // Agent dropdown state
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const selectedAgent = availableAgents.find((a) => a.slug === selectedAgentSlug) || availableAgents[0];

  // Close dropdown on outside click
  useEffect(() => {
    if (!showAgentDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setShowAgentDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAgentDropdown]);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setRecordingTime(0);
    }
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isImageFile = (file: File) => file.type.startsWith("image/");

  const processFile = useCallback((file: File) => {
    if (!isImageFile(file)) {
      console.warn("Only image files are supported");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      console.warn("File too large (max 10MB)");
      return;
    }
    setFiles([file]);
    const reader = new FileReader();
    reader.onload = (e) => {
      setFilePreviews({ [file.name]: e.target?.result as string });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveFile = (index: number) => {
    const fileToRemove = files[index];
    if (fileToRemove && filePreviews[fileToRemove.name]) {
      setFilePreviews({});
    }
    setFiles([]);
  };

  // Paste handler for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            break;
          }
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [processFile]);

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const droppedFiles = Array.from(e.dataTransfer.files);
      const imageFiles = droppedFiles.filter((file) => isImageFile(file));
      if (imageFiles.length > 0) {
        processFile(imageFiles[0]);
      }
    },
    [processFile]
  );

  const handleSend = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      onSend(`[Voice message - ${recordingTime} seconds]`, []);
      return;
    }

    const trimmed = value.trim();
    if ((!trimmed && files.length === 0) || isLoading || isStreaming) return;

    onSend(trimmed, files.length > 0 ? files : undefined);
    onValueChange("");
    setFiles([]);
    setFilePreviews({});
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, files, isLoading, isStreaming, isRecording, recordingTime, onSend, onValueChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onEscape?.();
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (onArrowKey) {
        e.preventDefault();
        onArrowKey(e.key === "ArrowUp" ? "up" : "down");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (hasSelectedResult) {
        onArrowKey?.("up");
        return;
      }
      handleSend();
    }
  };

  const hasContent = value.trim().length > 0 || files.length > 0;
  const isActive = isLoading || isStreaming;

  const dynamicPlaceholder = webSearchEnabled
    ? "Search the web..."
    : placeholder;

  return (
    <div
      className="flex flex-col"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Image previews */}
      <AnimatePresence>
        {files.length > 0 && !isRecording && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-3 pt-2 overflow-hidden"
          >
            <div className="flex flex-wrap gap-2">
              {files.map((file, index) => (
                <div key={index} className="relative group">
                  {file.type.startsWith("image/") && filePreviews[file.name] && (
                    <div
                      className="w-14 h-14 rounded-lg overflow-hidden cursor-pointer border border-white/10 transition-all duration-200 hover:border-white/20"
                      onClick={() => setSelectedImage(filePreviews[file.name])}
                    >
                      <img
                        src={filePreviews[file.name]}
                        alt={file.name}
                        className="h-full w-full object-cover"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(index);
                        }}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-black/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity border border-white/10"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording visualizer */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-3 pt-3 pb-1"
          >
            <div className="flex flex-col items-center justify-center py-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-sm text-white/70">{formatTime(recordingTime)}</span>
              </div>
              <div className="w-full h-8 flex items-center justify-center gap-0.5 px-4">
                {[...Array(32)].map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 rounded-full bg-white/40 animate-pulse"
                    style={{
                      height: `${Math.max(15, Math.random() * 100)}%`,
                      animationDelay: `${i * 0.05}s`,
                      animationDuration: `${0.5 + Math.random() * 0.5}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text input area */}
      <div
        className={cn(
          "transition-all duration-200",
          isRecording ? "h-0 overflow-hidden opacity-0" : "opacity-100"
        )}
      >
        <div className="flex items-end gap-2 px-3 pt-3 pb-1.5">
          {/* Attach button */}
          <button
            onClick={() => uploadInputRef.current?.click()}
            disabled={isRecording || isActive}
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
              "text-white/40 hover:text-white/70 hover:bg-white/[0.06]",
              "transition-all duration-200",
              "mb-[1px]",
              (isRecording || isActive) && "opacity-50 cursor-not-allowed"
            )}
            title="Attach image"
            type="button"
          >
            <Paperclip className="h-4 w-4" />
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processFile(e.target.files[0]);
                }
                if (e.target) e.target.value = "";
              }}
              accept="image/*"
            />
          </button>

          {/* Input area */}
          <div className="flex-1 relative min-w-0">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder={dynamicPlaceholder}
              rows={1}
              className={cn(
                "w-full resize-none bg-transparent text-sm text-white/90",
                "placeholder:text-white/25",
                "outline-none py-1.5 max-h-[120px]",
                "scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
              )}
              disabled={isActive || isRecording}
            />
          </div>

          {/* Send / Mic / Stop button */}
          <button
            onClick={() => {
              if (isRecording) {
                handleSend();
              } else if (hasContent) {
                handleSend();
              } else {
                setIsRecording(true);
              }
            }}
            disabled={isActive && !isRecording}
            type="button"
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
              "transition-all duration-200 mb-[1px]",
              isRecording
                ? "bg-transparent text-red-500 hover:bg-red-500/10"
                : hasContent && !isActive
                  ? "bg-white text-black hover:bg-white/90 shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                  : "bg-transparent text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
            )}
          >
            {isActive ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <StopCircle className="h-5 w-5" />
            ) : hasContent ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Options row with web search toggle */}
      <div
        className={cn(
          "flex items-center gap-1 px-3 pb-2.5 pt-0.5 transition-opacity duration-200",
          isRecording ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        {/* Left side: Web Search toggle */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onWebSearchToggle}
            className={cn(
              "rounded-lg transition-all flex items-center gap-1 px-2 py-1 h-7",
              webSearchEnabled
                ? "bg-cyan-400/15 text-cyan-400 border border-cyan-500/40"
                : "bg-transparent text-white/30 hover:text-white/50 hover:bg-white/[0.04] border border-transparent"
            )}
          >
            <motion.div
              animate={{
                rotate: webSearchEnabled ? 360 : 0,
                scale: webSearchEnabled ? 1.1 : 1,
              }}
              whileHover={{
                rotate: webSearchEnabled ? 360 : 15,
                scale: 1.1,
                transition: { type: "spring", stiffness: 300, damping: 10 },
              }}
              transition={{ type: "spring", stiffness: 260, damping: 25 }}
              className="w-4 h-4 flex items-center justify-center flex-shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
            </motion.div>
            <AnimatePresence>
              {webSearchEnabled && (
                <motion.span
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-[11px] font-medium overflow-hidden whitespace-nowrap flex-shrink-0"
                >
                  Search
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

          {/* Agent selector */}
          {availableAgents.length > 1 && selectedAgent && (
            <div className="relative" ref={agentDropdownRef}>
              <button
                type="button"
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                className={cn(
                  "rounded-lg transition-all flex items-center gap-1 px-2 py-1 h-7",
                  "border",
                  showAgentDropdown
                    ? "bg-white/[0.08] text-white/70 border-white/20"
                    : "bg-transparent text-white/30 hover:text-white/50 hover:bg-white/[0.04] border-transparent"
                )}
              >
                <div className="relative w-2 h-2 flex-shrink-0">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: selectedAgent.color }}
                  />
                  {/* Pulse overlay for running Coclaw */}
                  {selectedAgent.slug === 'coclaw' && agentStatus?.instanceStatus === 'RUNNING' && (
                    <div
                      className="absolute inset-0 rounded-full animate-ping opacity-60"
                      style={{ backgroundColor: selectedAgent.color }}
                    />
                  )}
                </div>
                <span className="text-[11px] font-medium">{selectedAgent.name}</span>
                {selectedAgent.slug === 'coclaw' && agentStatus && (
                  <span
                    className={cn(
                      'text-[9px] font-medium px-1 py-0.5 rounded',
                      agentStatus.instanceStatus === 'RUNNING' && agentStatus.isHealthy
                        ? 'text-emerald-400/80 bg-emerald-500/10'
                        : agentStatus.instanceStatus === 'RUNNING'
                          ? 'text-amber-400/80 bg-amber-500/10'
                          : 'text-white/20 bg-white/[0.04]'
                    )}
                  >
                    {agentStatus.instanceStatus === 'RUNNING' && agentStatus.isHealthy
                      ? 'ON'
                      : agentStatus.instanceStatus === 'RUNNING'
                        ? '•••'
                        : 'OFF'}
                  </span>
                )}
                <ChevronDown className="w-3 h-3" />
              </button>

              {/* Dropdown */}
              <AnimatePresence>
                {showAgentDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                    className="absolute bottom-full left-0 mb-1 w-48 rounded-lg bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden z-50"
                  >
                    {availableAgents.map((agent) => (
                      <button
                        key={agent.slug}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onAgentChange?.(agent.slug);
                          setShowAgentDropdown(false);
                        }}
                        className={cn(
                          "flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors",
                          agent.slug === selectedAgentSlug
                            ? "bg-white/[0.08] text-white/90"
                            : "text-white/50 hover:bg-white/[0.04] hover:text-white/70"
                        )}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: agent.color }}
                        />
                        <span className="text-sm font-medium">{agent.name}</span>
                        {agent.slug === selectedAgentSlug && (
                          <span className="ml-auto text-[10px] text-white/30">Active</span>
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

        {/* Right side: Keyboard shortcut hint */}
        <div className="ml-auto hidden md:flex items-center gap-1.5">
          <kbd className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-white/20 font-mono">
            {typeof navigator !== "undefined" && navigator.platform?.includes("Mac")
              ? "\u2318"
              : "Ctrl"}
            +K
          </kbd>
        </div>
      </div>

      {/* Image preview dialog */}
      <AnimatePresence>
        {selectedImage && (
          <ImagePreviewDialog
            imageUrl={selectedImage}
            onClose={() => setSelectedImage(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

export default ChatInput;
