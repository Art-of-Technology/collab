"use client";

import { useMemo, useState } from "react";
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
import { SaveAsTemplateDialog } from "@/components/notes/SaveAsTemplateDialog";
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
    Cpu,
    Palette,
    Layers,
    Server,
    Play,
    Bug,
    Calendar,
    GitBranch,
    X,
    KeyRound,
    Key,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { useNoteForm } from "@/hooks/useNoteForm";
import { cn } from "@/lib/utils";
import { NoteType, NoteScope } from "@prisma/client";
import { supportsAiContext, getNoteTypeConfig, getNoteScopeConfig, isSecretNoteType, getCompatibleTypes } from "@/lib/note-types";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";
import { useProjects } from "@/hooks/queries/useProjects";
import { SecretEditor } from "@/components/notes/SecretEditor";
import { SecretVariableData } from "@/components/notes/SecretVariableRow";
import { VersionHistoryPanel } from "@/components/notes/VersionHistoryPanel";

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
    lockedType?: boolean; // Prevent type changes (used after wizard selection)
    // Template-related props
    initialTitle?: string;
    initialContent?: string;
    initialTags?: string[];
    templateId?: string;
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
    // Secrets Vault types
    ENV_VARS: KeyRound,
    API_KEYS: Key,
    CREDENTIALS: ShieldCheck,
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
    defaultType = NoteType.GENERAL,
    defaultScope = NoteScope.PERSONAL,
    lockedType = false,
    initialTitle,
    initialContent,
    initialTags,
    templateId,
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
        initialTitle,
        initialContent,
        initialTags,
        templateId,
    });

    const watchType = form.watch("type");
    const watchScope = form.watch("scope");
    const watchProjectId = form.watch("projectId");
    const watchIsFavorite = form.watch("isFavorite");
    const watchIsAiContext = form.watch("isAiContext");
    const watchVariables = form.watch("variables");
    const watchRawSecretContent = form.watch("rawSecretContent");
    const watchSecretEditorMode = form.watch("secretEditorMode");
    const watchIsRestricted = form.watch("isRestricted");
    const watchExpiresAt = form.watch("expiresAt");
    const isOwner = !note || note._permissions?.isOwner !== false;

    // Save as template dialog state
    const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);

    // Check if current type is a secret type
    const isSecretType = isSecretNoteType(watchType);

    // Determine if type selector should be disabled
    // - Locked in create mode after wizard selection
    // - In edit mode, only allow switching between compatible types
    const isTypeDisabled = lockedType || !isOwner;

    // Convert note types to FilterOption format
    // Show all types - users can change type freely
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

    // Handle secret editor changes
    const handleSecretEditorChange = (data: {
        variables?: SecretVariableData[];
        rawContent?: string;
        mode?: "key-value" | "raw";
        isRestricted?: boolean;
        expiresAt?: string | null;
    }) => {
        if (data.variables !== undefined) {
            form.setValue("variables", data.variables);
        }
        if (data.rawContent !== undefined) {
            form.setValue("rawSecretContent", data.rawContent);
        }
        if (data.mode !== undefined) {
            form.setValue("secretEditorMode", data.mode);
        }
        if (data.isRestricted !== undefined) {
            form.setValue("isRestricted", data.isRestricted);
        }
        if (data.expiresAt !== undefined) {
            form.setValue("expiresAt", data.expiresAt);
        }
    };

    // Custom trigger for Type selector
    const renderTypeTrigger = (selectedOptions: FilterOption[]) => {
        const selected = selectedOptions[0];
        if (!selected) {
            return (
                <>
                    <FileText className="h-3.5 w-3.5 text-[#75757a]" />
                    <span className="text-[#75757a] text-xs">Type</span>
                </>
            );
        }
        const Icon = noteTypeIcons[selected.id as NoteType] || FileText;
        const config = getNoteTypeConfig(selected.id as NoteType);
        return (
            <>
                <Icon className={cn("h-3.5 w-3.5", config.color)} />
                <span className="text-[#fafafa] text-xs">{selected.label}</span>
            </>
        );
    };

    // Custom trigger for Scope selector
    const renderScopeTrigger = (selectedOptions: FilterOption[]) => {
        const selected = selectedOptions[0];
        if (!selected) {
            return (
                <>
                    <Lock className="h-3.5 w-3.5 text-[#75757a]" />
                    <span className="text-[#75757a] text-xs">Scope</span>
                </>
            );
        }
        const Icon = noteScopeIcons[selected.id as NoteScope] || Lock;
        const config = getNoteScopeConfig(selected.id as NoteScope);
        return (
            <>
                <Icon className={cn("h-3.5 w-3.5", config.color)} />
                <span className="text-[#fafafa] text-xs">{selected.label}</span>
            </>
        );
    };

    // Custom trigger for Project selector
    const renderProjectTrigger = (selectedOptions: FilterOption[]) => {
        const selected = selectedOptions[0];
        if (!selected || !selected.id) {
            return (
                <>
                    <FolderKanban className="h-3.5 w-3.5 text-[#75757a]" />
                    <span className="text-[#75757a] text-xs">No Project</span>
                </>
            );
        }
        return (
            <>
                <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: selected.color || "#6366f1" }}
                />
                <span className="text-[#fafafa] text-xs">{selected.label}</span>
            </>
        );
    };

    if (isFetchingNote) {
        return (
            <div className="rounded-2xl bg-[#171719] border border-[#1f1f22] p-12">
                <div className="flex flex-col items-center justify-center gap-3">
                    <div className="h-6 w-6 border-2 border-[#1f1f22] border-t-[#75757a] rounded-full animate-spin" />
                    <p className="text-sm text-[#75757a]">Loading context...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-2xl bg-[#171719] border border-[#1f1f22] p-12">
                <div className="flex flex-col items-center justify-center gap-4">
                    <p className="text-sm text-red-400">{error}</p>
                    {onCancel && (
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="bg-[#101011] border-[#1f1f22] text-[#9c9ca1] hover:bg-[#1f1f22] hover:text-[#fafafa] rounded-xl"
                        >
                            Go Back
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    // Shared button style for consistency
    const toolbarButtonClass = cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all",
        "bg-[#101011] border border-[#1f1f22] hover:border-[#27272b] hover:bg-[#1f1f22]",
        "text-[#9c9ca1] hover:text-[#fafafa]",
        "focus:outline-none !ring-0 !ring-offset-0"
    );

    const toolbarButtonActiveClass = (isActive: boolean, activeColor: string) => cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all",
        "focus:outline-none !ring-0 !ring-offset-0",
        isActive
            ? `bg-${activeColor}-500/10 border border-${activeColor}-500/30 text-${activeColor}-400 hover:bg-${activeColor}-500/20`
            : "bg-[#101011] border border-[#1f1f22] hover:border-[#27272b] hover:bg-[#1f1f22] text-[#9c9ca1] hover:text-[#fafafa]"
    );

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
                {/* Toolbar - organized in logical groups */}
                <div className="rounded-2xl bg-[#171719] border border-[#1f1f22] overflow-hidden">
                    {/* Main toolbar row */}
                    <div className="flex items-center gap-3 p-4">
                        {/* Left: Metadata selectors */}
                        <div className="flex items-center gap-2">
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
                                                disabled={isTypeDisabled}
                                                popoverWidth="w-56"
                                                filterHeader={lockedType ? "Type is locked" : "Select type"}
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

                            {/* Tags */}
                            <FormField
                                control={form.control}
                                name="tagIds"
                                render={({ field }) => (
                                    <FormItem className="space-y-0">
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
                        </div>

                        {/* Divider */}
                        <div className="h-6 w-px bg-[#1f1f22]" />

                        {/* Middle: Toggle buttons */}
                        <div className="flex items-center gap-2">
                            {/* Favorite Toggle */}
                            <FormField
                                control={form.control}
                                name="isFavorite"
                                render={({ field }) => (
                                    <FormItem className="space-y-0">
                                        <FormControl>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => field.onChange(!field.value)}
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all",
                                                    "focus:outline-none !ring-0 !ring-offset-0",
                                                    field.value
                                                        ? "bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                                                        : "bg-[#101011] border border-[#1f1f22] hover:border-[#27272b] hover:bg-[#1f1f22] text-[#9c9ca1] hover:text-[#fafafa]"
                                                )}
                                                title="Add to favorites"
                                            >
                                                <Star className={cn("h-3.5 w-3.5", field.value && "fill-amber-400")} />
                                                <span>Favorite</span>
                                            </Button>
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
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => isOwner && field.onChange(!field.value)}
                                                    disabled={!isOwner}
                                                    className={cn(
                                                        "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all",
                                                        "focus:outline-none !ring-0 !ring-offset-0",
                                                        field.value
                                                            ? "bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                                                            : "bg-[#101011] border border-[#1f1f22] hover:border-[#27272b] hover:bg-[#1f1f22] text-[#9c9ca1] hover:text-[#fafafa]",
                                                        !isOwner && "opacity-50 cursor-not-allowed"
                                                    )}
                                                    title="Include in AI context"
                                                >
                                                    <Bot className="h-3.5 w-3.5" />
                                                    <span>AI Context</span>
                                                </Button>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2">
                            {/* Share button */}
                            {mode === "edit" && noteId && isOwner && watchScope === NoteScope.PERSONAL && (
                                <ShareNoteDialog
                                    noteId={noteId}
                                    noteTitle={form.getValues("title") || "Untitled"}
                                    isOwner={isOwner}
                                    trigger={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className={toolbarButtonClass}
                                        >
                                            <Share2 className="h-3.5 w-3.5" />
                                            <span>Share</span>
                                        </Button>
                                    }
                                />
                            )}

                            {/* Save as Template button */}
                            {mode === "edit" && noteId && !isSecretType && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setShowSaveAsTemplate(true)}
                                    className={toolbarButtonClass}
                                >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    <span>Template</span>
                                </Button>
                            )}

                            {/* Version History */}
                            {mode === "edit" && noteId && !isSecretType && (
                                <VersionHistoryPanel
                                    noteId={noteId}
                                    currentVersion={note?.version}
                                    className={toolbarButtonClass}
                                />
                            )}

                            {/* Divider before status */}
                            <div className="h-6 w-px bg-[#1f1f22]" />

                            {/* Save button for secret types OR Autosave status */}
                            {isSecretType ? (
                                <Button
                                    type="submit"
                                    disabled={isSaving}
                                    size="sm"
                                    className="h-8 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-xs"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="h-3.5 w-3.5" />
                                            Save
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <div className="flex items-center gap-2 px-3 h-8 rounded-lg bg-[#101011] border border-[#1f1f22]">
                                    {autosaveStatus === "idle" && (
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                            <span className="text-xs text-[#52525b]">Autosave on</span>
                                        </div>
                                    )}

                                    {autosaveStatus === "saving" && (
                                        <div className="flex items-center gap-2 text-blue-400">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            <span className="text-xs">Saving...</span>
                                        </div>
                                    )}

                                    {autosaveStatus === "saved" && showSavedIndicator && (
                                        <div className="flex items-center gap-2 text-green-500">
                                            <Check className="h-3.5 w-3.5" />
                                            <span className="text-xs">Saved</span>
                                        </div>
                                    )}

                                    {autosaveStatus === "error" && (
                                        <div className="flex items-center gap-2">
                                            <X className="h-3.5 w-3.5 text-red-400" />
                                            <span className="text-xs text-red-400">Failed</span>
                                            <button
                                                type="button"
                                                onClick={retryAutosave}
                                                className="text-xs text-red-400 hover:text-red-300 underline"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Editor Area - in a card */}
                <div className="rounded-2xl bg-[#171719] border border-[#1f1f22] overflow-hidden">
                    {/* Title Input */}
                    <div className="px-6 pt-6 pb-4 border-b border-[#1f1f22]">
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
                                            className="w-full bg-transparent border-0 outline-none text-2xl font-semibold text-[#fafafa] placeholder:text-[#3f3f46] px-0 py-1 focus:outline-none"
                                            style={{ caretColor: '#3b82f6' }}
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs mt-2 text-red-400" />
                                </FormItem>
                            )}
                        />
                    </div>

                    {/* Content Editor - Conditional based on note type */}
                    <div className="p-6 min-h-[400px]">
                        {isSecretType ? (
                            /* Secret Editor for ENV_VARS, API_KEYS, CREDENTIALS */
                            <SecretEditor
                                variables={watchVariables || []}
                                rawContent={watchRawSecretContent || ""}
                                mode={watchSecretEditorMode || "key-value"}
                                isRestricted={watchIsRestricted || false}
                                expiresAt={watchExpiresAt || null}
                                onChange={handleSecretEditorChange}
                                disabled={!isOwner}
                                noteId={noteId}
                                workspaceSlug={undefined}
                            />
                        ) : (
                            /* Rich Editor for all other note types */
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
                                                    "[&_.ProseMirror]:text-[#9c9ca1]",
                                                    "[&_.ProseMirror]:text-sm",
                                                    "[&_.ProseMirror]:leading-relaxed",
                                                    "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-[#52525b]",
                                                    "[&_.ProseMirror_p]:my-3",
                                                    "[&_.ProseMirror_h1]:text-xl",
                                                    "[&_.ProseMirror_h1]:font-semibold",
                                                    "[&_.ProseMirror_h1]:text-[#fafafa]",
                                                    "[&_.ProseMirror_h1]:mt-6",
                                                    "[&_.ProseMirror_h1]:mb-3",
                                                    "[&_.ProseMirror_h2]:text-lg",
                                                    "[&_.ProseMirror_h2]:font-medium",
                                                    "[&_.ProseMirror_h2]:text-[#fafafa]",
                                                    "[&_.ProseMirror_h2]:mt-5",
                                                    "[&_.ProseMirror_h2]:mb-2",
                                                    "[&_.ProseMirror_h3]:text-base",
                                                    "[&_.ProseMirror_h3]:font-medium",
                                                    "[&_.ProseMirror_h3]:text-[#e4e4e7]",
                                                    "[&_.ProseMirror_h3]:mt-4",
                                                    "[&_.ProseMirror_h3]:mb-2",
                                                    "[&_.ProseMirror_ul]:my-3",
                                                    "[&_.ProseMirror_ol]:my-3",
                                                    "[&_.ProseMirror_li]:text-[#9c9ca1]",
                                                    "[&_.ProseMirror_code]:bg-[#1f1f22]",
                                                    "[&_.ProseMirror_code]:text-[#f472b6]",
                                                    "[&_.ProseMirror_code]:px-1.5",
                                                    "[&_.ProseMirror_code]:py-0.5",
                                                    "[&_.ProseMirror_code]:rounded-lg",
                                                    "[&_.ProseMirror_code]:text-xs",
                                                    "[&_.ProseMirror_pre]:bg-[#101011]",
                                                    "[&_.ProseMirror_pre]:border",
                                                    "[&_.ProseMirror_pre]:border-[#1f1f22]",
                                                    "[&_.ProseMirror_pre]:rounded-xl",
                                                    "[&_.ProseMirror_pre]:p-4",
                                                    "[&_.ProseMirror_pre]:my-4",
                                                    "[&_.ProseMirror_blockquote]:border-l-2",
                                                    "[&_.ProseMirror_blockquote]:border-[#27272b]",
                                                    "[&_.ProseMirror_blockquote]:pl-4",
                                                    "[&_.ProseMirror_blockquote]:text-[#75757a]",
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
                        )}
                    </div>
                </div>
            </form>

            {/* Save as Template Dialog */}
            {noteId && (
                <SaveAsTemplateDialog
                    open={showSaveAsTemplate}
                    onOpenChange={setShowSaveAsTemplate}
                    noteId={noteId}
                    noteTitle={form.getValues("title") || "Untitled"}
                    workspaceId={workspaceId}
                />
            )}
        </Form>
    );
}
