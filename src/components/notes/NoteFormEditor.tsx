"use client";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { IssueRichEditor } from "@/components/RichEditor/IssueRichEditor";
import { TagSelect } from "@/components/notes/TagSelect";
import { Loader2, Check } from "lucide-react";
import { useNoteForm } from "@/hooks/useNoteForm";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface NoteFormEditorProps {
    noteId?: string;
    workspaceId: string;
    mode: "create" | "edit";
    onSuccess?: (noteId: string) => void;
    onCancel?: () => void;
    showCancelButton?: boolean;
}

export function NoteFormEditor({
    noteId,
    workspaceId,
    mode,
    onSuccess,
    onCancel,
    showCancelButton = true,
}: NoteFormEditorProps) {
    const { form, isLoading, isFetchingNote, isSaving, lastSaved, error, onSubmit } = useNoteForm({
        noteId,
        workspaceId,
        mode,
        onSuccess,
    });

    if (isFetchingNote) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading note...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="text-center">
                    <p className="text-sm text-destructive mb-4">{error}</p>
                    {onCancel && (
                        <Button variant="outline" onClick={onCancel}>
                            Go Back
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                {/* Title input - Notion-style: Large, borderless, no label */}
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem className="mb-0">
                            <FormControl>
                                <input
                                    {...field}
                                    type="text"
                                    placeholder="Untitled"
                                    className="w-full bg-transparent border-0 outline-none text-3xl sm:text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 px-0 py-2 focus:outline-none"
                                />
                            </FormControl>
                            <FormMessage className="text-xs mt-2" />
                        </FormItem>
                    )}
                />

                {/* Metadata row: Inline switches, tags, and autosave status */}
                <div className="flex flex-wrap items-center gap-4 border-b border-border/20">
                    {/* Public switch - inline, minimal */}
                    <FormField
                        control={form.control}
                        name="isPublic"
                        render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        className="data-[state=checked]:bg-green-500"
                                    />
                                </FormControl>
                                <span className="text-xs text-muted-foreground/70 cursor-pointer select-none" onClick={() => field.onChange(!field.value)}>
                                    Public
                                </span>
                            </FormItem>
                        )}
                    />

                    {/* Favorite switch - inline, minimal */}
                    <FormField
                        control={form.control}
                        name="isFavorite"
                        render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        className="data-[state=checked]:bg-yellow-500"
                                    />
                                </FormControl>
                                <span className="text-xs text-muted-foreground/70 cursor-pointer select-none" onClick={() => field.onChange(!field.value)}>
                                    Favorite
                                </span>
                            </FormItem>
                        )}
                    />

                    {/* Divider dot */}
                    <span className="text-muted-foreground/30">•</span>

                    {/* Tags - inline, no label */}
                    <FormField
                        control={form.control}
                        name="tagIds"
                        render={({ field }) => (
                            <FormItem className="flex-1">
                                <FormControl>
                                    <TagSelect
                                        value={field.value || []}
                                        onChange={field.onChange}
                                        workspaceId={workspaceId}
                                    />
                                </FormControl>
                                <FormMessage className="text-xs mt-1" />
                            </FormItem>
                        )}
                    />

                    {/* Autosave status indicator - show in both create and edit modes */}
                    <div className="flex flex-row gap-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <span className="text-muted-foreground/50">Autosave is active</span>
                            )}
                        </div>
                        <span className={cn(
                            isSaving ? "text-primary animate-pulse"
                                : "text-primary"
                        )}>•</span>
                    </div>
                </div>

                <div className="flex flex-col mt-8">
                    {/* Content editor - Notion-style: Seamless, borderless, no label */}
                    <FormField
                        control={form.control}
                        name="content"
                        render={({ field }) => (
                            <FormItem className="mb-8">
                                <FormControl>
                                    <IssueRichEditor
                                        value={field.value}
                                        onChange={field.onChange}
                                        placeholder="Press '/' for commands, or just start writing..."
                                        className="[&_.ProseMirror]:border-0 [&_.ProseMirror]:outline-none [&_.ProseMirror]:shadow-none [&_.ProseMirror]:p-0 [&_.ProseMirror]:focus:ring-0"
                                        minHeight="400px"
                                        maxHeight="none"
                                        enableSlashCommands={true}
                                        enableFloatingMenu={true}
                                        enableSubIssueCreation={false}
                                    />
                                </FormControl>
                                <FormMessage className="text-xs mt-2" />
                            </FormItem>
                        )}
                    />
                </div>
            </form>
        </Form>
    );
}

