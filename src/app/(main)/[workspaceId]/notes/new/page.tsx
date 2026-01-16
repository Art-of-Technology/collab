"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Plus } from "lucide-react";
import Link from "next/link";
import { NoteFormEditor } from "@/components/notes/NoteFormEditor";
import { NoteCreationWizard } from "@/components/notes/NoteCreationWizard";
import { TemplatePickerDialog } from "@/components/notes/TemplatePickerDialog";
import { TemplateData } from "@/components/notes/TemplateCard";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRouter, useSearchParams } from "next/navigation";
import { NoteType, NoteScope } from "@prisma/client";
import { toast } from "sonner";

interface WizardConfig {
    type: NoteType;
    scope: NoteScope;
    projectId: string | null;
}

interface TemplateConfig {
    title: string;
    content: string;
    defaultTags: string[];
    templateId: string | null;
    templateName: string;
}

export default function NewNotePage() {
    const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Check if coming from a project page with pre-set project
    const presetProjectId = searchParams.get("projectId") || undefined;

    // Wizard state
    const [wizardComplete, setWizardComplete] = useState(false);
    const [wizardConfig, setWizardConfig] = useState<WizardConfig | null>(null);

    // Template picker state
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [templateConfig, setTemplateConfig] = useState<TemplateConfig | null>(null);

    const handleWizardComplete = (config: WizardConfig) => {
        setWizardConfig(config);
        // Show template picker after type/scope selection
        setShowTemplatePicker(true);
    };

    const handleSelectTemplate = async (template: TemplateData, customTitle?: string) => {
        if (!currentWorkspace?.id || !wizardConfig) return;

        try {
            const res = await fetch(`/api/notes/templates/${template.id}/use`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId: currentWorkspace.id,
                    projectId: wizardConfig.projectId,
                    title: customTitle,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to apply template");
            }

            const data = await res.json();
            setTemplateConfig({
                title: data.title,
                content: data.content,
                defaultTags: data.defaultTags,
                templateId: data.templateId,
                templateName: data.templateName,
            });
            setShowTemplatePicker(false);
            setWizardComplete(true);
        } catch (error) {
            console.error("Error applying template:", error);
            toast.error(error instanceof Error ? error.message : "Failed to apply template");
        }
    };

    const handleStartBlank = () => {
        setTemplateConfig(null);
        setShowTemplatePicker(false);
        setWizardComplete(true);
    };

    const handleSuccess = (noteId: string) => {
        // Navigate to the newly created note's edit page
        if (currentWorkspace?.slug) {
            router.replace(`/${currentWorkspace.slug}/notes/${noteId}`);
        }
    };

    const handleCancel = () => {
        // If in editor, go back to template picker
        if (wizardComplete) {
            setWizardComplete(false);
            setTemplateConfig(null);
            setShowTemplatePicker(true);
            return;
        }
        // If in template picker, go back to wizard
        if (showTemplatePicker) {
            setShowTemplatePicker(false);
            setWizardConfig(null);
            return;
        }
        // Otherwise, navigate back to notes list
        if (currentWorkspace?.slug) {
            router.push(`/${currentWorkspace.slug}/notes`);
        }
    };

    if (workspaceLoading) {
        return (
            <div className="h-full flex flex-col bg-[#09090b]">
                <div className="flex-1 flex items-center justify-center">
                    <div className="h-6 w-6 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-[#09090b]">
            {/* Header - matching notes list page */}
            <div className="flex-none border-b border-[#1f1f1f]">
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Link href={`/${currentWorkspace?.slug}/notes`}>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
                            <Plus className="h-4 w-4 text-[#3b82f6]" />
                        </div>
                        <div>
                            <h1 className="text-sm font-medium text-[#e6edf3]">New Context</h1>
                            <p className="text-xs text-[#6e7681]">
                                {wizardComplete
                                    ? "Create your content"
                                    : "Choose type and visibility"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-auto">
                {currentWorkspace?.id ? (
                    wizardComplete && wizardConfig ? (
                        <NoteFormEditor
                            mode="create"
                            workspaceId={currentWorkspace.id}
                            projectId={wizardConfig.projectId || undefined}
                            defaultType={wizardConfig.type}
                            defaultScope={wizardConfig.scope}
                            onSuccess={handleSuccess}
                            onCancel={handleCancel}
                            lockedType={true}
                            initialTitle={templateConfig?.title}
                            initialContent={templateConfig?.content}
                            initialTags={templateConfig?.defaultTags}
                            templateId={templateConfig?.templateId || undefined}
                        />
                    ) : (
                        <>
                            <NoteCreationWizard
                                workspaceId={currentWorkspace.id}
                                onComplete={handleWizardComplete}
                                onCancel={handleCancel}
                            />
                            {/* Template Picker Dialog */}
                            <TemplatePickerDialog
                                open={showTemplatePicker}
                                onOpenChange={(open) => {
                                    if (!open) {
                                        setShowTemplatePicker(false);
                                        setWizardConfig(null);
                                    }
                                }}
                                workspaceId={currentWorkspace.id}
                                projectId={wizardConfig?.projectId}
                                onSelectTemplate={handleSelectTemplate}
                                onStartBlank={handleStartBlank}
                            />
                        </>
                    )
                ) : (
                    <div className="flex justify-center items-center py-12">
                        <div className="h-6 w-6 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>
        </div>
    );
}
