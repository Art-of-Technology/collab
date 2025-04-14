"use client"

import type React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Send, WandSparkles } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { type User, MentionSuggestion } from "@/components/ui/mention-suggestion"
import { useWorkspace } from "@/context/WorkspaceContext"
import { formatMentions } from "@/utils/mentions"

interface TextAreaWithAIProps {
    value: string
    onChange: (value: string) => void
    onSubmit?: () => void
    placeholder?: string
    className?: string
    minHeight?: string
    maxHeight?: string
    maxLength?: number
    onAiImprove?: (text: string) => Promise<string>
    submitLabel?: string
    loading?: boolean
    disabled?: boolean
    extractMentions?: (text: string) => string[]
}

export function TextAreaWithAI({
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
}: TextAreaWithAIProps) {
    // AI improvement state
    const [isImproving, setIsImproving] = useState(false)
    const [improvedText, setImprovedText] = useState<string | null>(null)
    const [showImprovePopover, setShowImprovePopover] = useState(false)

    // Textarea state
    const [isFocused, setIsFocused] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const overlayRef = useRef<HTMLDivElement>(null)
    const { currentWorkspace } = useWorkspace()

    // Mention state
    const [mentionQuery, setMentionQuery] = useState("")
    const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
    const [caretPosition, setCaretPosition] = useState({ top: 0, left: 0 })
    const [selectionStart, setSelectionStart] = useState(0)
    const mentionSuggestionRef = useRef<HTMLDivElement>(null)
    const [styledContent, setStyledContent] = useState<string>("")

    // Handle AI text improvement
    const handleAiImprove = useCallback(async () => {
        if (!onAiImprove || isImproving || !value.trim()) return

        setIsImproving(true)

        try {
            const result = await onAiImprove(value)
            setImprovedText(result)
            setShowImprovePopover(true)
        } catch (error) {
            console.error("Error improving text:", error)
        } finally {
            setIsImproving(false)
        }
    }, [onAiImprove, isImproving, value])

    // Apply AI improved text
    const applyImprovedText = useCallback(() => {
        if (!improvedText) return

        onChange(improvedText)
        setImprovedText(null)
        setShowImprovePopover(false)

        if (textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [improvedText, onChange])

    // Handle form submission
    const handleSubmit = () => {
        if (onSubmit && value.trim() && !disabled && !loading) {
            onSubmit()
        }
    }

    // Handle keyboard events
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Submit on Ctrl+Enter or Cmd+Enter
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
            return
        }

        // Handle escape key to close mention suggestions
        if (e.key === "Escape" && showMentionSuggestions) {
            e.preventDefault()
            setShowMentionSuggestions(false)
            return
        }

        // Allow keyboard navigation in mention suggestions
        if (showMentionSuggestions && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter")) {
            e.preventDefault()
            return
        }

        // Delete entire mention token on backspace or delete
        if ((e.key === "Backspace" || e.key === "Delete") && textareaRef.current) {
            const currentPos = textareaRef.current.selectionStart
            const text = textareaRef.current.value

            // Check if we're inside or at the edge of a mention token
            const mentionRegex = /@\[([^\]]+)\]$$([^)]+)$$/g
            let match
            while ((match = mentionRegex.exec(text)) !== null) {
                const startPos = match.index
                const endPos = startPos + match[0].length

                // If cursor is anywhere within the mention token or right after it
                if (currentPos >= startPos && currentPos <= endPos) {
                    e.preventDefault()

                    // Delete the entire mention token
                    const newText = text.substring(0, startPos) + text.substring(endPos)
                    onChange(newText)

                    // Set cursor position to where the token started
                    setTimeout(() => {
                        if (textareaRef.current) {
                            textareaRef.current.setSelectionRange(startPos, startPos)
                        }
                    }, 0)
                    return
                }
            }
        }

        // Close mention suggestions on arrow keys
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && showMentionSuggestions) {
            setShowMentionSuggestions(false)
        }
    }

    // Handle input changes and detect @mentions
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        onChange(newValue)

        // Store selection start for mention insertion
        if (textareaRef.current) {
            setSelectionStart(textareaRef.current.selectionStart)
        }

        // Check for mention trigger character (@)
        const currentPosition = e.target.selectionStart
        let mentionStartPos = -1

        // Find the position of @ character before cursor
        for (let i = currentPosition - 1; i >= 0; i--) {
            if (newValue[i] === "@") {
                mentionStartPos = i
                break
            } else if (/\s/.test(newValue[i])) {
                break
            }
        }

        if (mentionStartPos >= 0) {
            const query = newValue.substring(mentionStartPos + 1, currentPosition)
            setMentionQuery(query)

            // Position at the bottom of the textarea
            if (textareaRef.current) {
                setCaretPosition({
                    // Position it at the bottom left with some padding
                    top: textareaRef.current.offsetHeight - 5,
                    left: 5,
                });
            }

            setShowMentionSuggestions(true)
        } else {
            setShowMentionSuggestions(false)
        }
    }

    // Handle mention selection
    const handleMentionSelect = (user: User) => {
        if (!textareaRef.current) return;
        
        const currentText = value;
        
        // Find the position of @ character before cursor
        const currentPosition = selectionStart;
        let mentionStartPos = -1;
        
        for (let i = currentPosition - 1; i >= 0; i--) {
            if (currentText[i] === '@') {
                mentionStartPos = i;
                break;
            } else if (/\s/.test(currentText[i])) {
                break;
            }
        }
        
        if (mentionStartPos >= 0) {
            // Replace the @query with formatted mention token: @[fullname](userId)
            // Make sure we use the entire name (including spaces) in a single token
            const beforeMention = currentText.substring(0, mentionStartPos);
            const afterMention = currentText.substring(currentPosition);
            const userName = user.name || "Unknown User";
            const mentionToken = `@[${userName}](${user.id})`;
            const newText = `${beforeMention}${mentionToken} ${afterMention}`;
            
            onChange(newText);
            
            // Set cursor position after the inserted mention
            setTimeout(() => {
                if (textareaRef.current) {
                    const newCursorPos = mentionStartPos + mentionToken.length + 1; // +1 for space
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                }
            }, 0);
        }
        
        setShowMentionSuggestions(false);
    };

    // Handle click on the styled overlay
    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Focus the textarea when clicking the styled display
        if (textareaRef.current) {
            textareaRef.current.focus()

            // Check if user clicked on a mention
            if ((e.target as HTMLElement).classList.contains("mention")) {
                // If clicked on a mention, don't change cursor position
                return
            }

            // Try to place cursor at click position
            const rect = e.currentTarget.getBoundingClientRect()
            const clickX = e.clientX - rect.left
            const clickY = e.clientY - rect.top

            // Using a rough character width estimate
            const charWidth = 8
            const lineHeight = 20

            // Estimate the position in the text
            const line = Math.floor(clickY / lineHeight)
            const charPos = Math.floor(clickX / charWidth)

            // Calculate an approximate position in the text
            const lines = value.split("\n")
            let position = 0

            for (let i = 0; i < line && i < lines.length; i++) {
                position += lines[i].length + 1 // +1 for the newline
            }

            // Add the character position in the current line
            if (line < lines.length) {
                position += Math.min(charPos, lines[line].length)
            }

            // Set selection to this position
            textareaRef.current.setSelectionRange(position, position)
        }
    }

    // Synchronize scroll positions between textarea and overlay
    const syncScroll = useCallback(() => {
        if (textareaRef.current && overlayRef.current) {
            overlayRef.current.scrollTop = textareaRef.current.scrollTop
        }
    }, [])

    // Close mention suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                mentionSuggestionRef.current &&
                !mentionSuggestionRef.current.contains(event.target as Node) &&
                textareaRef.current &&
                !textareaRef.current.contains(event.target as Node)
            ) {
                setShowMentionSuggestions(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [])

    // Add scroll event listener to textarea
    useEffect(() => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.addEventListener("scroll", syncScroll)
            return () => {
                textarea.removeEventListener("scroll", syncScroll)
            }
        }
    }, [syncScroll])

    // Process the value to create styled mentions when value changes
    useEffect(() => {
        if (!value || value.trim() === "") {
            setStyledContent(placeholder ? `<span class="text-muted-foreground">${placeholder}</span>` : "")
            return
        }

        // Format mentions as blocks
        const formattedContent = formatMentions(value)
        setStyledContent(formattedContent)
    }, [value, placeholder])

    // Ensure proper synchronization between textarea and overlay
    useEffect(() => {
        // Make sure the font family, size, line height, padding, etc. are the same
        if (textareaRef.current && overlayRef.current) {
            const textareaStyles = window.getComputedStyle(textareaRef.current);
            
            // Apply key styles to ensure alignment
            overlayRef.current.style.fontFamily = textareaStyles.fontFamily;
            overlayRef.current.style.fontSize = textareaStyles.fontSize;
            overlayRef.current.style.lineHeight = textareaStyles.lineHeight;
            overlayRef.current.style.padding = textareaStyles.padding;
            overlayRef.current.style.letterSpacing = textareaStyles.letterSpacing;
            
            // Sync scroll
            syncScroll();
        }
    }, [syncScroll, value]);

    // Calculate character count and percentage for progress indicator
    const charCount = value.length || 0
    const isNearLimit = maxLength && charCount > maxLength * 0.8
    const isOverLimit = maxLength && charCount > maxLength

    return (
        <div className={cn("relative group", className)}>
            {/* Hidden textarea for actual input handling */}
            <Textarea
                ref={textareaRef}
                value={value}
                onChange={handleInputChange}
                placeholder=""
                className={cn(
                    "resize-none min-h-[80px] p-3 rounded-md pr-20",
                    "overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-border",
                    "border-border/30 focus:border-primary/40 transition-colors duration-200",
                    "focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary/40",
                    isOverLimit && "border-red-400/70 focus-visible:ring-red-400/70",
                    "absolute inset-0 z-10 caret-primary opacity-100 text-transparent selection:bg-primary/20 selection:text-transparent",
                )}
                style={{
                    minHeight,
                    maxHeight,
                    caretColor: "hsl(var(--primary))",
                    color: "transparent",
                    WebkitTextFillColor: "transparent",
                }}
                maxLength={maxLength}
                disabled={disabled || loading || isImproving}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onScroll={syncScroll}
            />

            {/* Styled visible overlay that displays the formatted mentions */}
            <div
                ref={overlayRef}
                className={cn(
                    "resize-none min-h-[80px] p-3 rounded-md pr-20",
                    "overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-border",
                    "border border-border/50 transition-colors duration-200",
                    "whitespace-pre-wrap text-foreground",
                    isFocused && "border-primary/40 ring-1 ring-primary/40 shadow-sm",
                    isOverLimit && "border-red-400/70 ring-red-400/70",
                    "pointer-events-none", // Make sure clicks pass through to the textarea
                )}
                style={{
                    minHeight,
                    maxHeight,
                    userSelect: "none", // Prevent text selection in the overlay
                }}
                dangerouslySetInnerHTML={{ __html: styledContent }}
                onClick={handleOverlayClick}
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
                        onSelect={handleMentionSelect}
                        workspaceId={currentWorkspace?.id}
                    />
                </div>
            )}

            {/* Character count indicator */}
            {maxLength && (value.length > 0 || isFocused) && (
                <div
                    className={cn(
                        "absolute text-xs transition-opacity duration-200",
                        "right-1 top-1 px-1.5 py-0.5 rounded-sm",
                        isFocused || value.length > 0 ? "opacity-100" : "opacity-0",
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
                {onAiImprove && (
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
                                    !value.trim() && "opacity-70",
                                )}
                                onClick={handleAiImprove}
                                disabled={isImproving || disabled || !value.trim() || loading}
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
                <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                        "h-8 px-3 gap-1.5 text-xs font-medium rounded-md transition-all",
                        "border-border/60 bg-background/80 backdrop-blur-sm",
                        "hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm",
                        "focus:ring-1 focus:ring-primary/20 focus:border-primary/40 active:scale-[0.98]",
                        !value.trim() && "opacity-70",
                    )}
                    disabled={disabled || loading || !value.trim()}
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
            </div>
        </div>
    )
}
