"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Send, WandSparkles } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { type User, MentionSuggestion } from "@/components/ui/mention-suggestion"
import { useWorkspace } from "@/context/WorkspaceContext"

interface CollabInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (text: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
  maxHeight?: string
  maxLength?: number
  onAiImprove?: (text: string) => Promise<string>
  submitLabel?: string
  loading?: boolean
  disabled?: boolean
  showAiButton?: boolean
  showSubmitButton?: boolean
}

export function CollabInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Write something...",
  className = "",
  minHeight = "100px",
  maxHeight = "200px",
  maxLength,
  onAiImprove,
  submitLabel = "",
  loading = false,
  disabled = false,
  showAiButton = true,
  showSubmitButton = true,
}: CollabInputProps) {
  // Refs
  const editorRef = useRef<HTMLDivElement>(null)
  const mentionSuggestionRef = useRef<HTMLDivElement>(null)
  
  // State
  const [isFocused, setIsFocused] = useState(false)
  const [rawContent, setRawContent] = useState(value)
  
  // AI state
  const [isImproving, setIsImproving] = useState(false)
  const [improvedText, setImprovedText] = useState<string | null>(null)
  const [showImprovePopover, setShowImprovePopover] = useState(false)
  
  // Mention state
  const [mentionQuery, setMentionQuery] = useState("")
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [caretPosition, setCaretPosition] = useState({ top: 0, left: 0 })
  const { currentWorkspace } = useWorkspace()
  
  // Calculate visible text length
  const getVisibleTextLength = (text: string): number => {
    if (!text) return 0;
    
    // Replace mentions with their visible representation
    const visibleText = text.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_, name) => `@${name}`);
    
    return visibleText.length;
  }
  
  // Calculate character count and limit states
  const visibleLength = getVisibleTextLength(rawContent)
  const charCount = visibleLength
  const isNearLimit = maxLength && charCount > maxLength * 0.8
  const isOverLimit = maxLength && charCount > maxLength
  
  // Initialize the editor with the initial value
  useEffect(() => {
    if (editorRef.current && value) {
      // Format mentions in the HTML
      const formattedContent = formatContentWithMentions(value)
      editorRef.current.innerHTML = formattedContent || placeholder ? 
        `<span class="text-muted-foreground">${placeholder}</span>` : ""
    }
  }, [value, placeholder])
  
  // Update the rawContent when value prop changes (for controlled component)
  useEffect(() => {
    if (value !== rawContent) {
      setRawContent(value)
      // Update the editor content only if it doesn't have focus
      // to avoid cursor jumping while typing
      if (editorRef.current && !isFocused) {
        const formattedContent = formatContentWithMentions(value)
        editorRef.current.innerHTML = formattedContent || placeholder ?
          `<span class="text-muted-foreground">${placeholder}</span>` : ""
      }
    }
  }, [value, rawContent, isFocused, placeholder])
  
  // Format content with mentions
  const formatContentWithMentions = (text: string): string => {
    if (!text) return "";
    
    // Escape HTML special characters to prevent XSS
    let formatted = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    
    // Convert @[username](userId) to span with data attributes
    formatted = formatted.replace(
      /@\[([^\]]+)\]\(([^)]+)\)/g, 
      (match, name, id) => {
        return `<span class="mention" data-mention="true" data-user-id="${id}" data-user-name="${name}" contenteditable="false"><span class="mention-symbol">@</span>${name}</span>`;
      }
    );
    
    // Handle old format @username
    formatted = formatted.replace(
      /@([a-zA-Z0-9_-]+)(?!\])/g, 
      '<span class="mention" data-mention="true" contenteditable="false"><span class="mention-symbol">@</span>$1</span>'
    );
    
    // Replace newlines with <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }
  
  // Extract raw content from HTML with mentions
  const extractRawContentFromHtml = (html: string): string => {
    // Create a temporary div to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Process all mention spans
    const mentions = tempDiv.querySelectorAll('span.mention');
    mentions.forEach(mention => {
      const userId = mention.getAttribute('data-user-id');
      const userName = mention.getAttribute('data-user-name');
      
      // Replace with the raw format: @[username](userId)
      if (userId && userName) {
        mention.replaceWith(`@[${userName}](${userId})`);
      } else {
        // For old format mentions
        const text = mention.textContent || '';
        // Remove the @ symbol which is in a child span
        const username = text.replace('@', '');
        mention.replaceWith(`@${username}`);
      }
    });
    
    // Convert <br> to newlines
    let rawText = tempDiv.innerHTML
      .replace(/<br>/g, '\n')
      .replace(/&nbsp;/g, ' ');
    
    // Strip any remaining HTML tags
    rawText = rawText
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&');
    
    return rawText;
  }
  
  // Handle content changes
  const handleContentChange = () => {
    if (!editorRef.current) return;
    
    // Get the raw content
    const newHtml = editorRef.current.innerHTML;
    
    // Check if the editor is empty
    const isEmpty = newHtml === "" || 
      newHtml === "<br>" || 
      newHtml === `<span class="text-muted-foreground">${placeholder}</span>`;
    
    // Handle placeholder
    if (isEmpty) {
      if (!isFocused) {
        editorRef.current.innerHTML = placeholder ? 
          `<span class="text-muted-foreground">${placeholder}</span>` : "";
      } else {
        editorRef.current.innerHTML = "";
      }
      
      setRawContent("");
      onChange("");
      return;
    }
    
    // Extract raw content with mentions
    const extracted = extractRawContentFromHtml(newHtml);
    setRawContent(extracted);
    onChange(extracted);
    
    // Check for mentions
    checkForMentionTrigger();
  }
  
  // Focus handler
  const handleFocus = () => {
    setIsFocused(true);
    
    // Remove placeholder if present
    if (editorRef.current && editorRef.current.innerHTML === `<span class="text-muted-foreground">${placeholder}</span>`) {
      editorRef.current.innerHTML = "";
    }
  }
  
  // Blur handler
  const handleBlur = () => {
    setIsFocused(false);
    
    // Add placeholder if empty
    if (editorRef.current && (editorRef.current.innerHTML === "" || editorRef.current.innerHTML === "<br>")) {
      editorRef.current.innerHTML = placeholder ? 
        `<span class="text-muted-foreground">${placeholder}</span>` : "";
    }
  }
  
  // Check for @ mentions
  const checkForMentionTrigger = () => {
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const cursorPosition = range.startOffset;
    const textNode = range.startContainer;
    
    // Only look for mentions in text nodes
    if (textNode.nodeType !== Node.TEXT_NODE) {
      setShowMentionSuggestions(false);
      return;
    }
    
    const text = textNode.textContent || "";
    const textBeforeCursor = text.substring(0, cursorPosition);
    
    // Find the last @ character
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex >= 0) {
      // Check if there's a space between the last @ and the word we're typing
      const hasSpaceAfterAt = textBeforeCursor.substring(lastAtIndex + 1).match(/^\s/);
      if (!hasSpaceAfterAt) {
        const query = textBeforeCursor.substring(lastAtIndex + 1);
        
        // Don't show suggestions if the query starts with a special character or space
        if (!query.match(/^[^a-zA-Z0-9]/)) {
          // Position mention suggestions
          const rect = range.getBoundingClientRect();
          const editorRect = editorRef.current.getBoundingClientRect();
          
          setCaretPosition({
            top: rect.bottom - editorRect.top,
            left: rect.left - editorRect.left,
          });
          
          setMentionQuery(query);
          setShowMentionSuggestions(true);
          return;
        }
      }
    }
    
    setShowMentionSuggestions(false);
  }
  
  // Insert a mention at cursor position
  const insertMention = (user: User) => {
    if (!editorRef.current) return;
    
    // Get current selection
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // Find the text node where @ character is
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return;
    
    const text = textNode.textContent || "";
    const cursorPos = range.startOffset;
    
    // Find the position of @ character before cursor
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') {
        atPos = i;
        break;
      } else if (/\s/.test(text[i])) {
        break;
      }
    }
    
    if (atPos >= 0) {
      // Create a mention element
      const mentionElement = document.createElement('span');
      mentionElement.className = 'mention';
      mentionElement.setAttribute('data-mention', 'true');
      mentionElement.setAttribute('data-user-id', user.id);
      mentionElement.setAttribute('data-user-name', user.name || 'Unknown User');
      mentionElement.setAttribute('contenteditable', 'false');
      
      const symbolSpan = document.createElement('span');
      symbolSpan.className = 'mention-symbol';
      symbolSpan.textContent = '@';
      
      mentionElement.appendChild(symbolSpan);
      mentionElement.appendChild(document.createTextNode(user.name || 'Unknown User'));
      
      // Replace the @query with the mention element
      const beforeAt = text.substring(0, atPos);
      const afterCursor = text.substring(cursorPos);
      
      // Set text before the mention
      textNode.textContent = beforeAt;
      
      // Insert mention element
      const parent = textNode.parentNode;
      if (parent) {
        // Insert mention
        parent.insertBefore(mentionElement, textNode.nextSibling);
        
        // Insert space after mention
        const spaceNode = document.createTextNode(' ');
        parent.insertBefore(spaceNode, mentionElement.nextSibling);
        
        // Insert text after cursor
        if (afterCursor) {
          const afterNode = document.createTextNode(afterCursor);
          parent.insertBefore(afterNode, spaceNode.nextSibling);
        }
        
        // Set cursor after the space
        const newRange = document.createRange();
        newRange.setStartAfter(spaceNode);
        newRange.setEndAfter(spaceNode);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        // Update content
        handleContentChange();
      }
    }
    
    setShowMentionSuggestions(false);
  }
  
  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    
    // Handle Escape to close mention suggestions
    if (e.key === "Escape" && showMentionSuggestions) {
      e.preventDefault();
      setShowMentionSuggestions(false);
      return;
    }
    
    // Let MentionSuggestion handle these keys
    if (showMentionSuggestions && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      return;
    }
  }
  
  // Handle composition events (for IME input)
  const handleCompositionStart = () => {
    // IME composition started - no action needed
  }
  
  const handleCompositionEnd = () => {
    // IME composition ended - update content
    handleContentChange();
  }
  
  // Close mention suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionSuggestionRef.current &&
        !mentionSuggestionRef.current.contains(event.target as Node) &&
        editorRef.current &&
        !editorRef.current.contains(event.target as Node)
      ) {
        setShowMentionSuggestions(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    }
  }, []);
  
  // Handle AI text improvement
  const handleAiImprove = useCallback(async () => {
    if (!onAiImprove || isImproving || !rawContent.trim()) return;
    
    setIsImproving(true);
    
    try {
      const result = await onAiImprove(rawContent);
      setImprovedText(result);
      setShowImprovePopover(true);
    } catch (error) {
      console.error("Error improving text:", error);
    } finally {
      setIsImproving(false);
    }
  }, [onAiImprove, isImproving, rawContent]);
  
  // Apply AI improved text
  const applyImprovedText = useCallback(() => {
    if (!improvedText || !editorRef.current) return;
    
    // Format the improved text with mentions
    const formattedContent = formatContentWithMentions(improvedText);
    editorRef.current.innerHTML = formattedContent;
    
    // Update state
    setRawContent(improvedText);
    onChange(improvedText);
    setImprovedText(null);
    setShowImprovePopover(false);
    
    // Focus the editor
    editorRef.current.focus();
  }, [improvedText, onChange]);
  
  // Handle form submission
  const handleSubmit = () => {
    if (onSubmit && rawContent.trim() && !disabled && !loading && !isOverLimit) {
      onSubmit(rawContent);
    }
  }
  
  // Paste handler to strip formatting
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    
    // Get plain text
    const text = e.clipboardData.getData('text/plain');
    
    // Insert at cursor position
    if (document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text);
    } else {
      // Fallback
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
      }
    }
    
    // Update content
    handleContentChange();
  }
  
  return (
    <div className={cn("relative group", className)}>
      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable={disabled || loading || isImproving ? "false" : "true"}
        suppressContentEditableWarning
        className={cn(
          "min-h-[80px] p-3 rounded-md pr-20 text-sm",
          "overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-border",
          "border border-border/50 focus:border-primary/40 transition-colors duration-200",
          "whitespace-pre-wrap text-foreground !outline-none",
          isOverLimit ? "border-red-400/70" : "",
          disabled && "opacity-70 cursor-not-allowed",
        )}
        style={{
          minHeight,
          maxHeight,
        }}
        onInput={handleContentChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onPaste={handlePaste}
      />
      
      {/* Mention suggestions */}
      {showMentionSuggestions && (
        <div 
          style={{ 
            position: "absolute",
            top: `${caretPosition.top}px`,
            left: `${caretPosition.left}px`,
            zIndex: 9999,
          }}
          className="transition-all duration-200 animate-in slide-in-from-left-1"
        >
          <MentionSuggestion
            ref={mentionSuggestionRef}
            query={mentionQuery}
            onSelect={insertMention}
            workspaceId={currentWorkspace?.id}
          />
        </div>
      )}
      
      {/* Character count indicator */}
      {maxLength && (rawContent.length > 0 || isFocused) && (
        <div
          className={cn(
            "absolute text-xs transition-opacity duration-200",
            "right-1 top-1 px-1.5 py-0.5 rounded-sm",
            isFocused || rawContent.length > 0 ? "opacity-100" : "opacity-0",
            isOverLimit
              ? "bg-red-100 text-red-600"
              : isNearLimit
                ? "bg-amber-50 text-amber-600"
                : "bg-muted/70 text-muted-foreground",
          )}
        >
          {charCount}/{maxLength}
        </div>
      )}
      
      {/* Action buttons */}
      <div className="absolute bottom-2 right-3 flex items-center space-x-2 z-10">
        {/* AI Improve button */}
        {showAiButton && onAiImprove && (
          <Popover open={showImprovePopover} onOpenChange={setShowImprovePopover}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 px-3 gap-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center",
                  "border-border/60 bg-background/80 backdrop-blur-sm",
                  "hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm",
                  "focus:ring-1 focus:ring-primary/20 focus:border-primary/40 active:scale-[0.98]",
                  !rawContent.trim() && "opacity-70",
                )}
                onClick={handleAiImprove}
                disabled={isImproving || disabled || !rawContent.trim() || loading}
              >
                {isImproving ? (
                  <Loader2 className="h-4 w-4 text-purple-500 animate-spin" />
                ) : (
                  <WandSparkles className="h-4 w-4 text-purple-500 transition-transform group-hover:rotate-12" />
                )}
              </Button>
            </PopoverTrigger>
            
            {improvedText && (
              <PopoverContent className="w-72 p-0" align="end">
                <div className="p-3 border-b">
                  <h4 className="text-sm font-semibold">AI Improved Text</h4>
                  <p className="text-xs text-muted-foreground mt-1">Review and apply the AI improved version</p>
                </div>
                <div className="p-3 max-h-48 overflow-y-auto text-sm">{improvedText}</div>
                <div className="border-t p-2 flex justify-end gap-2 bg-muted/20">
                  <Button size="sm" variant="ghost" onClick={() => setShowImprovePopover(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={applyImprovedText}>
                    Apply
                  </Button>
                </div>
              </PopoverContent>
            )}
          </Popover>
        )}
        
        {/* Submit button */}
        {showSubmitButton && (
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-8 px-3 gap-1.5 text-xs font-medium rounded-md transition-all",
              "border-border/60 bg-background/80 backdrop-blur-sm",
              "hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm",
              "focus:ring-1 focus:ring-primary/20 focus:border-primary/40 active:scale-[0.98]",
              !rawContent.trim() && "opacity-70",
            )}
            disabled={Boolean(disabled || loading || !rawContent.trim() || isOverLimit)}
            onClick={handleSubmit}
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {submitLabel && <span>Sending...</span>}
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                {submitLabel && <span>{submitLabel}</span>}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
} 