"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form";
import { IssueRichEditor } from "@/components/RichEditor/IssueRichEditor";
import { TagSelect } from "@/components/notes/TagSelect";
import { ShareNoteDialog } from "@/components/notes/ShareNoteDialog";
import {
    Loader2,
    Bot,
    Share2,
    Star,
    Check,
    Lock,
    Users,
    Globe,
    FolderKanban,
    FileText,
    BookOpen,
    Code,
    Cpu,
    Palette,
    Layers,
    Server,
    Play,
    Bug,
    Calendar,
    GitBranch,
    X,
} from "lucide-react";
import { useNoteForm } from "@/hooks/useNoteForm";
import { cn } from "@/lib/utils";
import { NoteType, NoteScope } from "@prisma/client";
import { supportsAiContext, getNoteTypeConfig, getNoteScopeConfig } from "@/lib/note-types";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";
import { useProjects } from "@/hooks/queries/useProjects";

interface NoteFormEditorProps {
    noteId?: string;
    workspaceId: string;
    projectId?: string;
    mode: "create" | "edit";
    onSuccess?: (noteId: string) => void;
    onCancel?: () => void;
    showCancelButton?: boolean;
    defaultType?: NoteType;
    defaultScope?: NoteScope;
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

export function NoteFormEditor({
    noteId,
    workspaceId,
    projectId: initialProjectId,
    mode,
    onSuccess,
    onCancel,
    showCancelButton = true,
    defaultType = NoteType.GENERAL,
    defaultScope = NoteScope.PERSONAL,
}: NoteFormEditorProps) {
    // Fetch projects using the proper hook
    const { data: projects = [], isLoading: isLoadingProjects } = useProjects({ workspaceId });

    const { form, note, isLoading, isFetchingNote, isSaving, lastSaved, error, onSubmit, autosaveStatus, showSavedIndicator, retryAutosave } = useNoteForm({
        noteId,
        workspaceId,
        projectId: initialProjectId,
        mode,
        onSuccess,
        defaultType,
        defaultScope,
    });

    const watchType = form.watch("type");
    const watchScope = form.watch("scope");
    const watchProjectId = form.watch("projectId");
    const watchIsFavorite = form.watch("isFavorite");
    const watchIsAiContext = form.watch("isAiContext");
    const isOwner = !note || note._permissions?.isOwner !== false;

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

    // Convert note scopes to FilterOption format (exclude SHARED)
    const scopeOptions: FilterOption[] = useMemo(() => {
        return Object.values(NoteScope)
            .filter(s => s !== NoteScope.SHARED)
            .map((scope) => {
                const config = getNoteScopeConfig(scope);
                const isProjectScope = scope === NoteScope.PROJECT;
                const isDisabled = isProjectScope && !watchProjectId;
                return {
                    id: scope,
                    label: config.label,
                    icon: noteScopeIcons[scope] || Lock,
                    iconColor: config.color,
                    disabled: isDisabled,
                    disabledReason: isDisabled ? "Select a project first" : undefined,
                };
            });
    }, [watchProjectId]);

    // Convert projects to FilterOption format
    const projectOptions: FilterOption[] = useMemo(() => {
        return [
            {
                id: "",
                label: "No Project",
                color: "#3f3f46",
            },
            ...projects.map((project) => ({
                id: project.id,
                label: project.name,
                color: project.color || "#6366f1",
            })),
        ];
    }, [projects]);

    // Get selected project
    const selectedProject = projects.find(p => p.id === watchProjectId);

    // Handle scope change - auto-select PROJECT scope if project is selected
    const handleProjectChange = (value: string | string[]) => {
        const projectId = value as string;
        form.setValue("projectId", projectId || null);
        if (projectId && watchScope !== NoteScope.PROJECT) {
            form.setValue("scope", NoteScope.PROJECT);
        } else if (!projectId && watchScope === NoteScope.PROJECT) {
            form.setValue("scope", NoteScope.PERSONAL);
        }
    };

    // Custom trigger for Type selector
    const renderTypeTrigger = (selectedOptions: FilterOption[]) => {
        const selected = selectedOptions[0];
        if (!selected) {
            return (
                <>
                    <FileText className="h-3 w-3 text-[#6e7681]" />
                    <span className="text-[#6e7681] text-xs">Type</span>
                </>
            );
        }
        const Icon = noteTypeIcons[selected.id as NoteType] || FileText;
        const config = getNoteTypeConfig(selected.id as NoteType);
        return (
            <>
                <Icon className={cn("h-3 w-3", config.color)} />
                <span className="text-[#cccccc] text-xs">{selected.label}</span>
            </>
        );
    };

    // Custom trigger for Scope selector
    const renderScopeTrigger = (selectedOptions: FilterOption[]) => {
        const selected = selectedOptions[0];
        if (!selected) {
            return (
                <>
                    <Lock className="h-3 w-3 text-[#6e7681]" />
                    <span className="text-[#6e7681] text-xs">Scope</span>
                </>
            );
        }
        const Icon = noteScopeIcons[selected.id as NoteScope] || Lock;
        const config = getNoteScopeConfig(selected.id as NoteScope);
        return (
            <>
                <Icon className={cn("h-3 w-3", config.color)} />
                <span className="text-[#cccccc] text-xs">{selected.label}</span>
            </>
        );
    };

    // Custom trigger for Project selector
    const renderProjectTrigger = (selectedOptions: FilterOption[]) => {
        const selected = selectedOptions[0];
        if (!selected || !selected.id) {
            return (
                <>
                    <FolderKanban className="h-3 w-3 text-[#6e7681]" />
                    <span className="text-[#6e7681] text-xs">No Project</span>
                </>
            );
        }
        return (
            <>
                <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: selected.color || "#6366f1" }}
                />
                <span className="text-[#cccccc] text-xs">{selected.label}</span>
            </>
        );
    };

    if (isFetchingNote) {
        return (
            <div className="flex justify-center items-center py-24">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-6 w-6 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-[#52525b]">Loading context...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex justify-center items-center py-24">
                <div className="text-center">
                    <p className="text-sm text-red-400 mb-4">{error}</p>
                    {onCancel && (
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa]"
                        >
                            Go Back
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
                {/* Filter Bar - matching notes list page */}
                <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 border-b border-[#1f1f1f] bg-[#0d0d0e]">
                    {/* Type Selector */}
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem className="space-y-0">
                                <FormControl>
                                    <GlobalFilterSelector
                                        value={field.value}
                                        onChange={(value) => field.onChange(value as string)}
                                        options={typeOptions}
                                        label="Type"
                                        emptyIcon={FileText}
                                        selectionMode="single"
                                        showSearch={false}
                                        allowClear={false}
                                        disabled={!isOwner}
                                        popoverWidth="w-56"
                                        filterHeader="Select type"
                                        renderTriggerContent={renderTypeTrigger}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    {/* Scope Selector */}
                    <FormField
                        control={form.control}
                        name="scope"
                        render={({ field }) => (
                            <FormItem className="space-y-0">
                                <FormControl>
                                    <GlobalFilterSelector
                                        value={field.value}
                                        onChange={(value) => field.onChange(value as string)}
                                        options={scopeOptions}
                                        label="Scope"
                                        emptyIcon={Lock}
                                        selectionMode="single"
                                        showSearch={false}
                                        allowClear={false}
                                        disabled={!isOwner}
                                        popoverWidth="w-56"
                                        filterHeader="Select visibility"
                                        renderTriggerContent={renderScopeTrigger}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    {/* Project Selector */}
                    <FormField
                        control={form.control}
                        name="projectId"
                        render={({ field }) => (
                            <FormItem className="space-y-0">
                                <FormControl>
                                    <GlobalFilterSelector
                                        value={field.value || ""}
                                        onChange={handleProjectChange}
                                        options={projectOptions}
                                        label="Project"
                                        emptyIcon={FolderKanban}
                                        selectionMode="single"
                                        showSearch={true}
                                        searchPlaceholder="Search projects..."
                                        allowClear={false}
                                        disabled={!isOwner || isLoadingProjects}
                                        isLoading={isLoadingProjects}
                                        popoverWidth="w-64"
                                        filterHeader="Select project"
                                        renderTriggerContent={renderProjectTrigger}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    {/* Divider */}
                    <div className="h-5 w-px bg-[#27272a]" />

                    {/* Favorite Toggle */}
                    <FormField
                        control={form.control}
                        name="isFavorite"
                        render={({ field }) => (
                            <FormItem className="space-y-0">
                                <FormControl>
                                    <button
                                        type="button"
                                        onClick={() => field.onChange(!field.value)}
                                        className={cn(
                                            "inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                                            "border focus:outline-none",
                                            field.value
                                                ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                                                : "border-[#1f1f1f] hover:border-[#30363d] hover:bg-[#161617] text-[#6e7681] bg-transparent"
                                        )}
                                        title="Favorite"
                                    >
                                        <Star className={cn("h-3 w-3", field.value && "fill-amber-400")} />
                                        <span>Favorite</span>
                                    </button>
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    {/* AI Context Toggle */}
                    {supportsAiContext(watchType) && (
                        <FormField
                            control={form.control}
                            name="isAiContext"
                            render={({ field }) => (
                                <FormItem className="space-y-0">
                                    <FormControl>
                                        <button
                                            type="button"
                                            onClick={() => isOwner && field.onChange(!field.value)}
                                            disabled={!isOwner}
                                            className={cn(
                                                "inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                                                "border focus:outline-none",
                                                field.value
                                                    ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                                                    : "border-[#1f1f1f] hover:border-[#30363d] hover:bg-[#161617] text-[#6e7681] bg-transparent",
                                                !isOwner && "opacity-50 cursor-not-allowed"
                                            )}
                                            title="AI Context"
                                        >
                                            <Bot className="h-3 w-3" />
                                            <span>AI</span>
                                        </button>
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    )}

                    {/* Divider */}
                    <div className="h-5 w-px bg-[#27272a]" />

                    {/* Tags */}
                    <FormField
                        control={form.control}
                        name="tagIds"
                        render={({ field }) => (
                            <FormItem className="flex-1 min-w-[120px]">
                                <FormControl>
                                    <TagSelect
                                        value={field.value || []}
                                        onChange={field.onChange}
                                        workspaceId={workspaceId}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    {/* Share button - only for personal notes owned by user in edit mode */}
                    {mode === "edit" && noteId && isOwner && watchScope === NoteScope.PERSONAL && (
                        <>
                            <div className="h-5 w-px bg-[#27272a]" />
                            <ShareNoteDialog
                                noteId={noteId}
                                noteTitle={form.getValues("title") || "Untitled"}
                                isOwner={isOwner}
                                trigger={
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors border border-[#1f1f1f] hover:border-[#30363d] hover:bg-[#161617] text-[#6e7681] bg-transparent"
                                    >
                                        <Share2 className="h-3 w-3" />
                                        <span>Share</span>
                                    </button>
                                }
                            />
                        </>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Autosave status - matching issue detail modal */}
                    <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                        {autosaveStatus === "idle" && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-[#6e7681]">Autosave</span>
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            </div>
                        )}

                        {autosaveStatus === "saving" && (
                            <div className="flex items-center gap-1.5 text-blue-400">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span className="text-[10px]">Saving...</span>
                            </div>
                        )}

                        {autosaveStatus === "saved" && showSavedIndicator && (
                            <div className="flex items-center gap-1.5 text-green-500">
                                <Check className="h-3 w-3" />
                                <span className="text-[10px]">Saved</span>
                            </div>
                        )}

                        {autosaveStatus === "error" && (
                            <div className="flex items-center gap-1.5">
                                <X className="h-3 w-3 text-red-400" />
                                <span className="text-[10px] text-red-400">Failed</span>
                                <button
                                    type="button"
                                    onClick={retryAutosave}
                                    className="text-[10px] text-red-400 hover:text-red-300 underline"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Editor Area - Centered like Notion/Slack */}
                <div className="flex-1 overflow-auto">
                    <div className="max-w-6xl mx-auto px-6 lg:px-12">
                        {/* Title Input - Notion Style */}
                        <div className="pt-8 pb-2">
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
                                                className="w-full bg-transparent border-0 outline-none text-3xl sm:text-4xl font-bold text-[#fafafa] placeholder:text-[#27272a] px-0 py-2 focus:outline-none tracking-tight"
                                                style={{ caretColor: '#3b82f6' }}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-xs mt-2 text-red-400" />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Content Editor - Clean Notion Style */}
                        <div className="py-4 pb-24 min-h-[400px]">
                            <FormField
                                control={form.control}
                                name="content"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <IssueRichEditor
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Start writing, or press '/' for commands..."
                                                className={cn(
                                                    "[&_.ProseMirror]:border-0",
                                                    "[&_.ProseMirror]:outline-none",
                                                    "[&_.ProseMirror]:shadow-none",
                                                    "[&_.ProseMirror]:p-0",
                                                    "[&_.ProseMirror]:focus:ring-0",
                                                    "[&_.ProseMirror]:text-[#e4e4e7]",
                                                    "[&_.ProseMirror]:text-base",
                                                    "[&_.ProseMirror]:leading-relaxed",
                                                    "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-[#3f3f46]",
                                                    "[&_.ProseMirror_p]:my-3",
                                                    "[&_.ProseMirror_h1]:text-2xl",
                                                    "[&_.ProseMirror_h1]:font-bold",
                                                    "[&_.ProseMirror_h1]:text-[#fafafa]",
                                                    "[&_.ProseMirror_h1]:mt-6",
                                                    "[&_.ProseMirror_h1]:mb-3",
                                                    "[&_.ProseMirror_h2]:text-xl",
                                                    "[&_.ProseMirror_h2]:font-semibold",
                                                    "[&_.ProseMirror_h2]:text-[#fafafa]",
                                                    "[&_.ProseMirror_h2]:mt-5",
                                                    "[&_.ProseMirror_h2]:mb-2",
                                                    "[&_.ProseMirror_h3]:text-lg",
                                                    "[&_.ProseMirror_h3]:font-medium",
                                                    "[&_.ProseMirror_h3]:text-[#e4e4e7]",
                                                    "[&_.ProseMirror_h3]:mt-4",
                                                    "[&_.ProseMirror_h3]:mb-2",
                                                    "[&_.ProseMirror_ul]:my-3",
                                                    "[&_.ProseMirror_ol]:my-3",
                                                    "[&_.ProseMirror_li]:text-[#d4d4d8]",
                                                    "[&_.ProseMirror_code]:bg-[#27272a]",
                                                    "[&_.ProseMirror_code]:text-[#f472b6]",
                                                    "[&_.ProseMirror_code]:px-1.5",
                                                    "[&_.ProseMirror_code]:py-0.5",
                                                    "[&_.ProseMirror_code]:rounded",
                                                    "[&_.ProseMirror_code]:text-sm",
                                                    "[&_.ProseMirror_pre]:bg-[#18181b]",
                                                    "[&_.ProseMirror_pre]:border",
                                                    "[&_.ProseMirror_pre]:border-[#27272a]",
                                                    "[&_.ProseMirror_pre]:rounded-lg",
                                                    "[&_.ProseMirror_pre]:p-4",
                                                    "[&_.ProseMirror_pre]:my-4",
                                                    "[&_.ProseMirror_blockquote]:border-l-2",
                                                    "[&_.ProseMirror_blockquote]:border-[#3f3f46]",
                                                    "[&_.ProseMirror_blockquote]:pl-4",
                                                    "[&_.ProseMirror_blockquote]:text-[#a1a1aa]",
                                                    "[&_.ProseMirror_blockquote]:italic",
                                                    "[&_.ProseMirror_a]:text-blue-400",
                                                    "[&_.ProseMirror_a]:underline",
                                                )}
                                                minHeight="350px"
                                                maxHeight="none"
                                                enableSlashCommands={true}
                                                enableFloatingMenu={true}
                                                enableSubIssueCreation={false}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-xs mt-2 text-red-400" />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                </div>
            </form>
        </Form>
    );
}
