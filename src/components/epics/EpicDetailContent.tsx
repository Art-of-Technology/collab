"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, Check, X, PenLine, Calendar as CalendarIcon, Star, BookOpen } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { StatusSelect, getStatusBadge } from "../tasks/selectors/StatusSelect";
import { useWorkspace } from "@/context/WorkspaceContext";

// Format date helper
const formatDate = (date: Date | string) => {
    return format(new Date(date), 'MMM d, yyyy');
};

export interface Epic {
    id: string;
    title: string;
    description?: string | null;
    status: string | null;
    priority: string;
    color?: string;
    startDate?: Date | null;
    dueDate?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    workspaceId: string;
    milestoneId?: string | null;
    milestone?: {
        id: string;
        title: string;
    } | null;
    stories?: Array<{ id: string; title: string; }>;
    taskBoard?: {
        id: string;
        name: string;
    };
}

interface EpicDetailContentProps {
    epic: Epic | null;
    error: string | null;
    onRefresh: () => void;
    onClose?: () => void;
    boardId?: string;
}

export function EpicDetailContent({
    epic,
    error,
    onRefresh,
    onClose,
    boardId
}: EpicDetailContentProps) {
    const [editingTitle, setEditingTitle] = useState(false);
    const [title, setTitle] = useState(epic?.title || "");
    const [savingTitle, setSavingTitle] = useState(false);
    const [editingDescription, setEditingDescription] = useState(false);
    const [savingDescription, setSavingDescription] = useState(false);
    const [isImprovingDescription, setIsImprovingDescription] = useState(false);
    const [description, setDescription] = useState(epic?.description || "");
    const [savingStatus, setSavingStatus] = useState(false);
    const [savingPriority, setSavingPriority] = useState(false);
    const [savingStartDate, setSavingStartDate] = useState(false);
    const [savingDueDate, setSavingDueDate] = useState(false);
    const [startDate, setStartDate] = useState<Date | undefined>(epic?.startDate || undefined);
    const [dueDate, setDueDate] = useState<Date | undefined>(epic?.dueDate || undefined);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { currentWorkspace } = useWorkspace();

    const effectiveBoardId = epic?.taskBoard?.id || boardId;

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

    const saveEpicField = async (field: string, value: any) => {
        try {
            const response = await fetch(`/api/epics/${epic?.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ [field]: value }),
            });

            if (!response.ok) {
                throw new Error(`Failed to update ${field}`);
            }

            const updatedEpic = await response.json();

            toast({
                title: 'Updated',
                description: `Epic ${field} updated successfully`,
            });

            // Update local state based on the field
            if (field === 'title') {
                setTitle(updatedEpic.title);
            } else if (field === 'description') {
                setDescription(updatedEpic.description || "");
            } else if (field === 'status') {
                // The status is already updated in the UI by the Select
            } else if (field === 'priority') {
                // The priority is already updated in the UI by the Select
            } else if (field === 'startDate') {
                setStartDate(updatedEpic.startDate);
            } else if (field === 'dueDate') {
                setDueDate(updatedEpic.dueDate);
            }

            // Refresh the epic data
            setTimeout(() => {
                onRefresh();
            }, 100);

            // Invalidate TanStack Query cache for board items if status changed (to update kanban columns)
            if (field === 'status' && effectiveBoardId) {
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
            const success = await saveEpicField('title', title);
            if (success) {
                setEditingTitle(false);
            }
        } finally {
            setSavingTitle(false);
        }
    };

    // Cancel title editing
    const handleCancelTitle = () => {
        setTitle(epic?.title || "");
        setEditingTitle(false);
    };

    // Save description changes
    const handleSaveDescription = async () => {
        setSavingDescription(true);
        try {
            const success = await saveEpicField('description', description);
            if (success) {
                setEditingDescription(false);
            }
        } finally {
            setSavingDescription(false);
        }
    };

    // Cancel description editing
    const handleCancelDescription = () => {
        setDescription(epic?.description || "");
        setEditingDescription(false);
    };

    // Handle status change
    const handleStatusChange = async (status: string) => {
        setSavingStatus(true);
        try {
            await saveEpicField('status', status);
        } finally {
            setSavingStatus(false);
        }
    };

    // Handle priority change
    const handlePriorityChange = async (priority: string) => {
        setSavingPriority(true);
        try {
            await saveEpicField('priority', priority);
        } finally {
            setSavingPriority(false);
        }
    };

    // Handle start date change
    const handleStartDateChange = async (date: Date | undefined) => {
        setStartDate(date);
        setSavingStartDate(true);
        try {
            await saveEpicField('startDate', date);
        } finally {
            setSavingStartDate(false);
        }
    };

    // Handle due date change
    const handleDueDateChange = async (date: Date | undefined) => {
        setDueDate(date);
        setSavingDueDate(true);
        try {
            await saveEpicField('dueDate', date);
        } finally {
            setSavingDueDate(false);
        }
    };

    // Update state when epic changes
    useEffect(() => {
        if (epic) {
            setTitle(epic.title);
            setDescription(epic.description || "");
            setStartDate(epic.startDate || undefined);
            setDueDate(epic.dueDate || undefined);
        }
    }, [epic]);

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

    if (!epic) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Epic not found.</p>
                {onClose && (
                    <Button variant="link" onClick={onClose}>Close</Button>
                )}
            </div>
        );
    }
    // Calculate priority badge
    const getPriorityBadge = (priority: string) => {
        const normalizedPriority = priority?.toLowerCase() || 'medium';

        const priorityColors: Record<string, string> = {
            'low': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
            'medium': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
            'high': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
            'critical': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        };

        return (
            <Badge className={`${priorityColors[normalizedPriority] || 'bg-gray-100 text-gray-800'} px-2 py-1`}>
                {priority || 'Medium'}
            </Badge>
        );
    };

    // Timeline calculation
    const getTimelineInfo = () => {
        if (!epic.startDate && !epic.dueDate) {
            return <span className="text-muted-foreground">No dates set</span>;
        }

        const now = new Date();

        if (epic.startDate && epic.dueDate) {
            const start = new Date(epic.startDate);
            const end = new Date(epic.dueDate);

            if (now < start) {
                return <span>Starts in {formatDistanceToNow(start)}</span>;
            } else if (now > end) {
                return <span>Ended {formatDistanceToNow(end)} ago</span>;
            } else {
                return <span>In progress - ends in {formatDistanceToNow(end)}</span>;
            }
        } else if (epic.startDate) {
            const start = new Date(epic.startDate);
            if (now < start) {
                return <span>Starts in {formatDistanceToNow(start)}</span>;
            } else {
                return <span>Started {formatDistanceToNow(start)} ago</span>;
            }
        } else if (epic.dueDate) {
            const end = new Date(epic.dueDate);
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
                    borderColor: epic.color ? `${epic.color}50` : undefined,
                    backgroundColor: epic.color ? `${epic.color}10` : undefined
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
                                        placeholder="Epic title"
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
                                    {epic.title}
                                </h1>
                                <PenLine className="h-4 w-4 absolute right-0 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground group-hover:text-primary" />
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline" className="px-2 border-purple-200 bg-purple-50 text-purple-700">
                                <Star className="h-3 w-3 mr-1" />
                                Epic
                            </Badge>
                            <span>Created on {formatDate(epic.createdAt)}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {getStatusBadge(epic.status || "PLANNED")}
                        {getPriorityBadge(epic.priority)}
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
                                        {epic.description ? (
                                            <MarkdownContent content={epic.description} htmlContent={epic.description} />
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

                    {/* Stories linked to this epic */}
                    {epic.stories && epic.stories.length > 0 && (
                        <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
                            <CardHeader className="py-3 bg-muted/30 border-b">
                                <CardTitle className="text-md">Stories</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <ul className="space-y-2">
                                    {epic.stories.map((story) => (
                                        <li key={story.id}>
                                            <Link
                                                href={currentWorkspace ? `/${currentWorkspace.id}/stories/${story.id}` : "#"}
                                                className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-md transition-colors"
                                            >
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                    <BookOpen className="h-3 w-3 mr-1" />
                                                    Story
                                                </Badge>
                                                <span className="text-sm">{story.title}</span>
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
                                        value={epic.status || "PLANNED"}
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
                                <p className="text-sm font-medium mb-1">Priority</p>
                                <div className="relative">
                                    <Select
                                        value={epic.priority || "medium"}
                                        onValueChange={handlePriorityChange}
                                        disabled={savingPriority}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="low">{getPriorityBadge("low")}</SelectItem>
                                            <SelectItem value="medium">{getPriorityBadge("medium")}</SelectItem>
                                            <SelectItem value="high">{getPriorityBadge("high")}</SelectItem>
                                            <SelectItem value="critical">{getPriorityBadge("critical")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {savingPriority && (
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
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn(
                                                    "w-full justify-start text-left font-normal",
                                                    !startDate && "text-muted-foreground"
                                                )}
                                                disabled={savingStartDate}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {startDate ? format(startDate, "MMM d, yyyy") : "Set start date"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={startDate}
                                                onSelect={handleStartDateChange}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
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
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn(
                                                    "w-full justify-start text-left font-normal",
                                                    !dueDate && "text-muted-foreground"
                                                )}
                                                disabled={savingDueDate}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dueDate ? format(dueDate, "MMM d, yyyy") : "Set due date"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={dueDate}
                                                onSelect={handleDueDateChange}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    {savingDueDate && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {epic.milestone && (
                                <div>
                                    <p className="text-sm font-medium mb-1">Milestone</p>
                                    <Link
                                        href={currentWorkspace ? `/${currentWorkspace.id}/milestones/${epic.milestoneId}` : "#"}
                                        className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-md border transition-colors"
                                    >
                                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                            <CalendarIcon className="h-3 w-3 mr-1" />
                                            Milestone
                                        </Badge>
                                        <span className="text-sm">{epic.milestone.title}</span>
                                    </Link>
                                </div>
                            )}

                            {epic.taskBoard && (
                                <div>
                                    <p className="text-sm font-medium mb-1">Board</p>
                                    <Link
                                        href={currentWorkspace ? `/${currentWorkspace.id}/tasks?board=${epic.taskBoard.id}` : "#"}
                                        className="flex items-center border rounded-md p-2 hover:bg-muted/20 transition-colors"
                                    >
                                        {epic.taskBoard.name}
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