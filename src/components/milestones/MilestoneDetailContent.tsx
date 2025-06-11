"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, Check, X, PenLine, Star, Calendar } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useQueryClient } from "@tanstack/react-query";
import { StatusSelect, getStatusBadge } from "../tasks/selectors/StatusSelect";
import { AssigneeSelect } from "../tasks/selectors/AssigneeSelect";
import { ReporterSelect } from "../tasks/selectors/ReporterSelect";
import { useWorkspace } from "@/context/WorkspaceContext";

// Format date helper
const formatDate = (date: Date | string) => {
    return format(new Date(date), 'MMM d, yyyy');
};

export interface Milestone {
    id: string;
    title: string;
    description?: string | null;
    status: string | null;
    color?: string;
    startDate?: Date | null;
    dueDate?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    workspaceId: string;
    epics?: Array<{ id: string; title: string; }>;
    taskBoard?: {
        id: string;
        name: string;
    };
    assignee?: {
        id: string;
        name: string;
        email: string;
        image?: string;
        useCustomAvatar?: boolean;
        avatarAccessory?: number;
        avatarBrows?: number;
        avatarEyes?: number;
        avatarEyewear?: number;
        avatarHair?: number;
        avatarMouth?: number;
        avatarNose?: number;
        avatarSkinTone?: number;
    } | null;
    reporter?: {
        id: string;
        name: string;
        email: string;
        image?: string;
        useCustomAvatar?: boolean;
        avatarAccessory?: number;
        avatarBrows?: number;
        avatarEyes?: number;
        avatarEyewear?: number;
        avatarHair?: number;
        avatarMouth?: number;
        avatarNose?: number;
        avatarSkinTone?: number;
    } | null;
}

interface MilestoneDetailContentProps {
    milestone: Milestone | null;
    error: string | null;
    onRefresh: () => void;
    onClose?: () => void;
    boardId?: string;
}

export function MilestoneDetailContent({
    milestone,
    error,
    onRefresh,
    onClose,
    boardId
}: MilestoneDetailContentProps) {
    const [editingTitle, setEditingTitle] = useState(false);
    const [title, setTitle] = useState(milestone?.title || "");
    const [savingTitle, setSavingTitle] = useState(false);
    const [editingDescription, setEditingDescription] = useState(false);
    const [savingDescription, setSavingDescription] = useState(false);
    const [isImprovingDescription, setIsImprovingDescription] = useState(false);
    const [description, setDescription] = useState(milestone?.description || "");
    const [savingStatus, setSavingStatus] = useState(false);
    const [savingStartDate, setSavingStartDate] = useState(false);
    const [savingDueDate, setSavingDueDate] = useState(false);
    const [savingAssignee, setSavingAssignee] = useState(false);
    const [savingReporter, setSavingReporter] = useState(false);
    const [startDate, setStartDate] = useState<Date | undefined>(milestone?.startDate || undefined);
    const [dueDate, setDueDate] = useState<Date | undefined>(milestone?.dueDate || undefined);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { currentWorkspace } = useWorkspace();

    // Prioritize the milestone's own board, then fall back to the one from props
    const effectiveBoardId = milestone?.taskBoard?.id || boardId;

    const handleDescriptionChange = useCallback((md: string) => {
        setDescription(md);
    }, []);

    const handleAiImproveDescription = async (text: string): Promise<string> => {
        if (isImprovingDescription || !text.trim()) return text;

        setIsImprovingDescription(true);

        try {
            const response = await fetch("/api/ai/improve", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ text })
            });

            if (!response.ok) {
                throw new Error("Failed to improve text");
            }

            const data = await response.json();

            // Extract message from the response
            return data.message || data.improvedText || text;
        } catch (error) {
            console.error("Error improving text:", error);
            toast({
                title: "Error",
                description: "Failed to improve text",
                variant: "destructive"
            });
            return text;
        } finally {
            setIsImprovingDescription(false);
        }
    };

    const saveMilestoneField = async (field: string, value: any) => {
        try {
            const response = await fetch(`/api/milestones/${milestone?.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ [field]: value }),
            });

            if (!response.ok) {
                throw new Error(`Failed to update ${field}`);
            }

            const updatedMilestone = await response.json();

            toast({
                title: 'Updated',
                description: `Milestone ${field} updated successfully`,
            });

            // Update local state based on the field
            if (field === 'title') {
                setTitle(updatedMilestone.title);
            } else if (field === 'description') {
                setDescription(updatedMilestone.description || "");
            } else if (field === 'status') {
                // The status is already updated in the UI by the Select
            } else if (field === 'startDate') {
                setStartDate(updatedMilestone.startDate);
            } else if (field === 'dueDate') {
                setDueDate(updatedMilestone.dueDate);
            }

            // Refresh the milestone data
            setTimeout(() => {
                onRefresh();
            }, 100);

            // Invalidate TanStack Query cache for board items if status, assignee, or reporter changed
            if ((field === 'status' || field === 'assigneeId' || field === 'reporterId') && effectiveBoardId) {
                queryClient.invalidateQueries({ queryKey: ['boardItems', { board: effectiveBoardId }] });
            }

            return true;
        } catch (error) {
            console.error(`Error updating ${field}:`, error);
            toast({
                title: 'Error',
                description: `Failed to update ${field}`,
                variant: 'destructive',
            });
            return false;
        }
    };

    // Save title changes
    const handleSaveTitle = async () => {
        if (!title.trim()) {
            toast({
                title: 'Error',
                description: 'Title cannot be empty',
                variant: 'destructive',
            });
            return;
        }

        setSavingTitle(true);
        try {
            const success = await saveMilestoneField('title', title);
            if (success) {
                setEditingTitle(false);
            }
        } finally {
            setSavingTitle(false);
        }
    };

    // Cancel title editing
    const handleCancelTitle = () => {
        setTitle(milestone?.title || "");
        setEditingTitle(false);
    };

    // Save description changes
    const handleSaveDescription = async () => {
        setSavingDescription(true);
        try {
            const success = await saveMilestoneField('description', description);
            if (success) {
                setEditingDescription(false);
            }
        } finally {
            setSavingDescription(false);
        }
    };

    // Cancel description editing
    const handleCancelDescription = () => {
        setDescription(milestone?.description || "");
        setEditingDescription(false);
    };

    // Handle status change
    const handleStatusChange = async (status: string) => {
        setSavingStatus(true);
        try {
            await saveMilestoneField('status', status);
        } finally {
            setSavingStatus(false);
        }
    };

    // Handle start date change
    const handleStartDateChange = async (date: Date | undefined) => {
        setStartDate(date);
        setSavingStartDate(true);
        try {
            await saveMilestoneField('startDate', date);
        } finally {
            setSavingStartDate(false);
        }
    };

    // Handle due date change
    const handleDueDateChange = async (date: Date | undefined) => {
        setDueDate(date);
        setSavingDueDate(true);
        try {
            await saveMilestoneField('dueDate', date);
        } finally {
            setSavingDueDate(false);
        }
    };

    // Handle assignee change
    const handleAssigneeChange = async (assigneeId: string | undefined) => {
        setSavingAssignee(true);
        try {
            await saveMilestoneField('assigneeId', assigneeId === "unassigned" ? null : assigneeId);
        } finally {
            setSavingAssignee(false);
        }
    };

    // Handle reporter change
    const handleReporterChange = async (reporterId: string | undefined) => {
        setSavingReporter(true);
        try {
            await saveMilestoneField('reporterId', reporterId === "none" ? null : reporterId);
        } finally {
            setSavingReporter(false);
        }
    };

    // Update state when milestone changes
    useEffect(() => {
        if (milestone) {
            setTitle(milestone.title);
            setDescription(milestone.description || "");
            setStartDate(milestone.startDate || undefined);
            setDueDate(milestone.dueDate || undefined);
        }
    }, [milestone]);

    if (error) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">{error}</p>
                {onClose && (
                    <Button variant="link" onClick={onClose}>Close</Button>
                )}
            </div>
        );
    }

    if (!milestone) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Milestone not found.</p>
                {onClose && (
                    <Button variant="link" onClick={onClose}>Close</Button>
                )}
            </div>
        );
    }

    // Timeline calculation
    const getTimelineInfo = () => {
        if (!milestone.startDate && !milestone.dueDate) {
            return <span className="text-muted-foreground">No dates set</span>;
        }

        const now = new Date();

        if (milestone.startDate && milestone.dueDate) {
            const start = new Date(milestone.startDate);
            const end = new Date(milestone.dueDate);

            if (now < start) {
                return <span>Starts in {formatDistanceToNow(start)}</span>;
            } else if (now > end) {
                return <span>Ended {formatDistanceToNow(end)} ago</span>;
            } else {
                return <span>In progress - ends in {formatDistanceToNow(end)}</span>;
            }
        } else if (milestone.startDate) {
            const start = new Date(milestone.startDate);
            if (now < start) {
                return <span>Starts in {formatDistanceToNow(start)}</span>;
            } else {
                return <span>Started {formatDistanceToNow(start)} ago</span>;
            }
        } else if (milestone.dueDate) {
            const end = new Date(milestone.dueDate);
            if (now > end) {
                return <span>Ended {formatDistanceToNow(end)} ago</span>;
            } else {
                return <span>Due in {formatDistanceToNow(end)}</span>;
            }
        }

        return null;
    };

    return (
        <div className="pt-6 space-y-8">
            <div className="space-y-4 bg-gradient-to-r from-background to-muted/30 p-6 rounded-xl border border-border/50 shadow-sm"
                style={{
                    borderColor: milestone.color ? `${milestone.color}50` : undefined,
                    backgroundColor: milestone.color ? `${milestone.color}10` : undefined
                }}>
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                        {editingTitle ? (
                            <div className="flex flex-col gap-2 w-full">
                                <div className="relative">
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="text-2xl font-bold py-2 px-3 h-auto border-primary/20 focus-visible:ring-primary/30"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSaveTitle();
                                            } else if (e.key === 'Escape') {
                                                handleCancelTitle();
                                            }
                                        }}
                                        placeholder="Milestone title"
                                        disabled={savingTitle}
                                    />
                                    {savingTitle && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleCancelTitle}
                                        disabled={savingTitle}
                                        className="h-8"
                                    >
                                        <X className="h-4 w-4 mr-1" />
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleSaveTitle}
                                        disabled={savingTitle}
                                        className="h-8"
                                    >
                                        {savingTitle ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Check className="h-4 w-4 mr-1" />
                                                Save
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div
                                className="group relative cursor-pointer"
                                onClick={() => setEditingTitle(true)}
                            >
                                <h1 className="text-2xl font-bold group-hover:text-primary transition-colors pr-8">
                                    {milestone.title}
                                </h1>
                                <PenLine className="h-4 w-4 absolute right-0 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground group-hover:text-primary" />
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline" className="px-2 border-indigo-200 bg-indigo-50 text-indigo-700">
                                <Calendar className="h-3 w-3 mr-1" />
                                Milestone
                            </Badge>
                            <span>Created on {formatDate(milestone.createdAt)}</span>
                        </div>
                    </div>

                    <div>
                        {getStatusBadge(milestone.status || "PLANNED")}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 space-y-6">
                    <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between py-3 bg-muted/30 border-b">
                            <CardTitle className="text-md">Description</CardTitle>
                            {!editingDescription && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingDescription(true)}
                                    className="h-8 w-8 p-0 rounded-full"
                                >
                                    <PenLine className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            <div>
                                {editingDescription ? (
                                    <div className="p-4 space-y-3 bg-muted/10">
                                        <div className="relative">
                                            <div className={savingDescription ? "opacity-50 pointer-events-none" : ""}>
                                                <MarkdownEditor
                                                    initialValue={description}
                                                    onChange={handleDescriptionChange}
                                                    placeholder="Add a description..."
                                                    minHeight="150px"
                                                    maxHeight="400px"
                                                    onAiImprove={handleAiImproveDescription}
                                                />
                                            </div>
                                            {savingDescription && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-end gap-2 mt-4">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleCancelDescription}
                                                disabled={savingDescription}
                                            >
                                                <X className="h-4 w-4 mr-1" />
                                                Cancel
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={handleSaveDescription}
                                                disabled={savingDescription}
                                            >
                                                {savingDescription ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Check className="h-4 w-4 mr-1" />
                                                        Save
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="p-4 prose prose-sm max-w-none dark:prose-invert hover:bg-muted/10 cursor-pointer transition-colors min-h-[120px]"
                                        onClick={() => setEditingDescription(true)}
                                    >
                                        {milestone.description ? (
                                            <MarkdownContent content={milestone.description} htmlContent={milestone.description} />
                                        ) : (
                                            <div className="flex items-center justify-center h-[100px] text-muted-foreground border border-dashed rounded-md bg-muted/5">
                                                <div className="text-center">
                                                    <PenLine className="h-5 w-5 mx-auto mb-2 opacity-70" />
                                                    <p className="italic text-muted-foreground">Click to add a description</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Epics linked to this milestone */}
                    {milestone.epics && milestone.epics.length > 0 && (
                        <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
                            <CardHeader className="py-3 bg-muted/30 border-b">
                                <CardTitle className="text-md">Epics</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <ul className="space-y-2">
                                    {milestone.epics.map((epic) => (
                                        <li key={epic.id}>
                                            <Link
                                                href={currentWorkspace ? `/${currentWorkspace.id}/epics/${epic.id}` : "#"}
                                                className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-md transition-colors"
                                            >
                                                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                                    <Star className="h-3 w-3 mr-1" />
                                                    Epic
                                                </Badge>
                                                <span className="text-sm">{epic.title}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
                        <CardHeader className="py-3 bg-muted/30 border-b">
                            <CardTitle className="text-md">Details</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div>
                                <p className="text-sm font-medium mb-1">Status</p>
                                <div className="relative">
                                    <StatusSelect
                                        value={milestone.status || "PLANNED"}
                                        onValueChange={handleStatusChange}
                                        boardId={effectiveBoardId || ""}
                                        disabled={savingStatus}
                                    />
                                    {savingStatus && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium mb-1">Assignee</p>
                                <div className="relative">
                                    <AssigneeSelect
                                        value={milestone.assignee?.id || undefined}
                                        onChange={handleAssigneeChange}
                                        workspaceId={milestone.workspaceId}
                                        disabled={savingAssignee}
                                    />
                                    {savingAssignee && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium mb-1">Reporter</p>
                                <div className="relative">
                                    <ReporterSelect
                                        value={milestone.reporter?.id || undefined}
                                        onChange={handleReporterChange}
                                        workspaceId={milestone.workspaceId}
                                        disabled={savingReporter}
                                    />
                                    {savingReporter && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium mb-1">Timeline</p>
                                <div className="p-3 border rounded-md">
                                    {getTimelineInfo()}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium mb-1">Start Date</p>
                                <div className="relative">
                                    <Input
                                        type="date"
                                        value={startDate ? format(startDate, "yyyy-MM-dd") : ""}
                                        onChange={(e) => {
                                            const date = e.target.value ? new Date(e.target.value) : undefined;
                                            handleStartDateChange(date);
                                        }}
                                        className="w-full"
                                        disabled={savingStartDate}
                                    />
                                    {savingStartDate && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium mb-1">Due Date</p>
                                <div className="relative">
                                    <Input
                                        type="date"
                                        value={dueDate ? format(dueDate, "yyyy-MM-dd") : ""}
                                        onChange={(e) => {
                                            const date = e.target.value ? new Date(e.target.value) : undefined;
                                            handleDueDateChange(date);
                                        }}
                                        className="w-full"
                                        disabled={savingDueDate}
                                    />
                                    {savingDueDate && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {milestone.taskBoard && (
                                <div>
                                    <p className="text-sm font-medium mb-1">Board</p>
                                    <Link
                                        href={currentWorkspace ? `/${currentWorkspace.id}/tasks?board=${milestone.taskBoard.id}` : "#"}
                                        className="flex items-center border rounded-md p-2 hover:bg-muted/20 transition-colors"
                                    >
                                        {milestone.taskBoard.name}
                                    </Link>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
} 