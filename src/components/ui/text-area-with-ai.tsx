"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, WandSparkles } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TextAreaWithAIProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: () => void;
    placeholder?: string;
    className?: string;
    minHeight?: string;
    maxHeight?: string;
    maxLength?: number;
    onAiImprove?: (text: string) => Promise<string>;
    submitLabel?: string;
    loading?: boolean;
    disabled?: boolean;
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
    const [isImproving, setIsImproving] = useState(false);
    const [improvedText, setImprovedText] = useState<string | null>(null);
    const [showImprovePopover, setShowImprovePopover] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleAiImprove = useCallback(async () => {
        if (!onAiImprove || isImproving || !value.trim()) return;

        setIsImproving(true);

        try {
            // Call the AI improve function and get the improved text
            const result = await onAiImprove(value);

            // Store the improved text
            setImprovedText(result);

            // Show the improved text
            setShowImprovePopover(true);
        } catch (error) {
            console.error('Error improving text:', error);
        } finally {
            setIsImproving(false);
        }
    }, [onAiImprove, isImproving, value]);

    const applyImprovedText = useCallback(() => {
        if (!improvedText) return;

        // Replace the content with improved text
        onChange(improvedText);

        // Clean up
        setImprovedText(null);
        setShowImprovePopover(false);

        // Focus the textarea
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [improvedText, onChange]);

    const handleSubmit = () => {
        if (onSubmit && value.trim() && !disabled && !loading) {
            onSubmit();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Submit on Ctrl+Enter or Cmd+Enter
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Calculate character count and percentage for progress indicator
    const charCount = value.length || 0;
    const isNearLimit = maxLength && charCount > maxLength * 0.8;
    const isOverLimit = maxLength && charCount > maxLength;

    return (
        <div className={cn("relative group", className)}>
            <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(
                    "resize-none min-h-[80px] p-3 rounded-md pr-20",
                    "overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-border",
                    "border-border/30 focus:border-primary/40 transition-colors duration-200",
                    "focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary/40",
                    isOverLimit && "border-red-400/70 focus-visible:ring-red-400/70"
                )}
                style={{
                    minHeight: minHeight,
                    maxHeight: maxHeight
                }}
                maxLength={maxLength ? undefined : undefined} // Disable native maxLength to allow visual feedback
                disabled={disabled || loading || isImproving}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
            />

            {maxLength && (value.length > 0 || isFocused) && (
                <div className={cn(
                    "absolute text-xs transition-opacity duration-200",
                    "right-1 top-1 px-1.5 py-0.5 rounded-sm",
                    isFocused || value.length > 0 ? "opacity-100" : "opacity-0",
                    isOverLimit ? "bg-red-100 text-red-600" :
                        isNearLimit ? "bg-amber-50 text-amber-600" :
                            "bg-muted/70 text-muted-foreground"
                )}>
                    {charCount}/{maxLength}
                </div>
            )}


            <div className="absolute bottom-2 right-3 flex items-center space-x-2">
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
                                    !value.trim() && "opacity-70"
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
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Review and apply the AI improved version
                                    </p>
                                </div>
                                <div className="p-3 max-h-48 overflow-y-auto text-sm">
                                    {improvedText}
                                </div>
                                <div className="border-t p-2 flex justify-end gap-2 bg-muted/20">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setShowImprovePopover(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={applyImprovedText}
                                    >
                                        Apply
                                    </Button>
                                </div>
                            </PopoverContent>
                        )}
                    </Popover>
                )}

                <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                        "h-8 px-3 gap-1.5 text-xs font-medium rounded-md transition-all",
                        "border-border/60 bg-background/80 backdrop-blur-sm",
                        "hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm",
                        "focus:ring-1 focus:ring-primary/20 focus:border-primary/40 active:scale-[0.98]",
                        !value.trim() && "opacity-70"
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
    );
} 