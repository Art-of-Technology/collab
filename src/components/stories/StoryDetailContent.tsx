"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, Check, X, PenLine, Calendar as CalendarIcon, Star, BookOpen, User, Hash } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useWorkspaceMembers } from "@/hooks/queries/useWorkspace"; // Corrected import path
import { storyStatusOptions, storyPriorityOptions } from "@/constants/task";

// Format date helper
const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "N/A";
  return format(new Date(date), 'MMM d, yyyy');
};

export interface Story {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  points?: number | null;
  color?: string;
  startDate?: Date | null;
  dueDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  workspaceId: string;
  epicId?: string | null;
  epic?: {
    id: string;
    title: string;
  } | null;
  tasks?: Array<{ id: string; title: string; status: string; priority?: string }>; // Simplified Task type for display
  taskBoard?: {
    id: string;
    name: string;
  };
}

interface StoryDetailContentProps {
  story: Story | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose?: () => void;
}

export function StoryDetailContent({
  story,
  isLoading,
  error,
  onRefresh,
  onClose
}: StoryDetailContentProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(story?.title || "");
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [description, setDescription] = useState(story?.description || "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [savingStartDate, setSavingStartDate] = useState(false);
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(story?.startDate || undefined);
  const [dueDate, setDueDate] = useState<Date | undefined>(story?.dueDate || undefined);
  const [points, setPoints] = useState<number | undefined>(story?.points || undefined);
  
  const { toast } = useToast();
  const router = useRouter();

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

  const saveStoryField = async (field: string, value: any) => {
    if (!story?.id) return false;
    
    // Handle empty string for optional fields, convert to null
    if (field === 'points' && (value === '' || value === undefined)) {
      value = null;
    } else if (field === 'points') {
      value = Number(value); // Ensure points are saved as a number
      if (isNaN(value)) {
         toast({
           title: 'Error',
           description: 'Points must be a number.',
           variant: 'destructive',
         });
         return false;
      }
    }
    
    try {
      const response = await fetch(`/api/stories/${story.id}`, { // Assuming PATCH endpoint exists
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [field]: value }),
      });

      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ message: `Failed to update ${field}` }));
         throw new Error(errorData.message || `Failed to update ${field}`);
      }

      const updatedStory = await response.json();
      
      toast({
        title: 'Updated',
        description: `Story ${field} updated successfully`,
      });

      // Update local state based on the field
      if (field === 'title') {
        setTitle(updatedStory.title);
      } else if (field === 'description') {
        setDescription(updatedStory.description || "");
      } else if (field === 'points') {
        setPoints(updatedStory.points);
      }
      // Status, Priority, Start/Due Date are handled by Select/Popover
      
      // Refresh the story data
      setTimeout(() => {
        onRefresh();
      }, 100);

      return true;
    } catch (error: any) {
      console.error(`Error updating ${field}:`, error);
      toast({
        title: 'Error',
        description: error.message || `Failed to update ${field}`,
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
      const success = await saveStoryField('title', title);
      if (success) {
        setEditingTitle(false);
      }
    } finally {
      setSavingTitle(false);
    }
  };

  // Cancel title editing
  const handleCancelTitle = () => {
    setTitle(story?.title || "");
    setEditingTitle(false);
  };

  // Save description changes
  const handleSaveDescription = async () => {
    setSavingDescription(true);
    try {
      const success = await saveStoryField('description', description);
      if (success) {
        setEditingDescription(false);
      }
    } finally {
      setSavingDescription(false);
    }
  };

  // Cancel description editing
  const handleCancelDescription = () => {
    setDescription(story?.description || "");
    setEditingDescription(false);
  };

  // Handle status change
  const handleStatusChange = async (status: string) => {
    setSavingStatus(true);
    try {
      await saveStoryField('status', status);
    } finally {
      setSavingStatus(false);
    }
  };
  
  // Handle priority change
  const handlePriorityChange = async (priority: string) => {
    setSavingPriority(true);
    try {
      await saveStoryField('priority', priority);
    } finally {
      setSavingPriority(false);
    }
  };

  // Handle start date change
  const handleStartDateChange = async (date: Date | undefined) => {
    setStartDate(date); // Update local state immediately for responsiveness
    setSavingStartDate(true);
    try {
      await saveStoryField('startDate', date);
    } finally {
      setSavingStartDate(false);
    }
  };

  // Handle due date change
  const handleDueDateChange = async (date: Date | undefined) => {
    setDueDate(date); // Update local state immediately
    setSavingDueDate(true);
    try {
      await saveStoryField('dueDate', date);
    } finally {
      setSavingDueDate(false);
    }
  };
  
  // Handle points change
  const handlePointsChange = async (value: string) => {
    const numValue = value === '' ? undefined : Number(value);
    if (value !== '' && isNaN(numValue as number)) {
       toast({
         title: 'Invalid Input',
         description: 'Points must be a number.',
         variant: 'destructive',
       });
       return;
    }
    setPoints(numValue);
  };

  const handleSavePoints = async () => {
    setSavingPoints(true);
    try {
      await saveStoryField('points', points);
    } finally {
      setSavingPoints(false);
    }
  }

  // Update state when story changes
  useEffect(() => {
    if (story) {
      setTitle(story.title);
      setDescription(story.description || "");
      setStartDate(story.startDate || undefined);
      setDueDate(story.dueDate || undefined);
      setPoints(story.points ?? undefined);
    }
  }, [story]);

  if (isLoading) {
     return (
       <div className="flex justify-center items-center h-64">
         <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
       </div>
     );
  }

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

  if (!story) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Story not found.</p>
        {onClose && (
          <Button variant="link" onClick={onClose}>Close</Button>
        )}
      </div>
    );
  }

  // Calculate story status badge
  const getStatusBadge = (status: string | null) => {
    const currentStatus = storyStatusOptions.find(opt => opt.value === status);
    const statusColors: Record<string, string> = {
      'BACKLOG': 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
      'TODO': 'bg-gray-300 text-gray-800 dark:bg-gray-600 dark:text-gray-100',
      'IN_PROGRESS': 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100',
      'IN_REVIEW': 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-100',
      'DONE': 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100',
    };
    
    return (
      <Badge className={`${statusColors[status || 'BACKLOG'] || 'bg-gray-100 text-gray-800'} px-2 py-1 capitalize`}>
        {currentStatus?.label || status?.replace('_', ' ') || 'Backlog'}
      </Badge>
    );
  };
  
  // Calculate priority badge
  const getPriorityBadge = (priority: string | null) => {
    const currentPriority = storyPriorityOptions.find(opt => opt.value === priority);
    const priorityColors: Record<string, string> = {
      'LOW': 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100',
      'MEDIUM': 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100',
      'HIGH': 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100',
    };
    
    return (
      <Badge className={`${priorityColors[priority || 'MEDIUM'] || 'bg-gray-100 text-gray-800'} px-2 py-1 capitalize`}>
        {currentPriority?.label || priority || 'Medium'}
      </Badge>
    );
  };

  // Timeline calculation
  const getTimelineInfo = () => {
    if (!story.startDate && !story.dueDate) {
      return <span className="text-muted-foreground">No dates set</span>;
    }
    
    const now = new Date();
    
    if (story.startDate && story.dueDate) {
      const start = new Date(story.startDate);
      const end = new Date(story.dueDate);
      
      if (now < start) {
        return <span>Starts in {formatDistanceToNow(start)}</span>;
      } else if (now > end) {
        return <span>Ended {formatDistanceToNow(end)} ago</span>;
      } else {
        return <span>In progress - ends in {formatDistanceToNow(end)}</span>;
      }
    } else if (story.startDate) {
      const start = new Date(story.startDate);
      if (now < start) {
        return <span>Starts in {formatDistanceToNow(start)}</span>;
      } else {
        return <span>Started {formatDistanceToNow(start)} ago</span>;
      }
    } else if (story.dueDate) {
      const end = new Date(story.dueDate);
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
           style={{ borderColor: story.color ? `${story.color}50` : undefined, 
                   backgroundColor: story.color ? `${story.color}10` : undefined }}>
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
                    placeholder="Story title"
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
                  {story.title}
                </h1>
                <PenLine className="h-4 w-4 absolute right-0 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground group-hover:text-primary" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="px-2 border-blue-200 bg-blue-50 text-blue-700">
                <BookOpen className="h-3 w-3 mr-1" />
                Story
              </Badge>
              <span>Created on {formatDate(story.createdAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
             {getStatusBadge(story.status)}
             {getPriorityBadge(story.priority)}
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
                    {story.description ? (
                      <MarkdownContent content={story.description} />
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

          {/* Tasks linked to this story */}
          {story.tasks && story.tasks.length > 0 && (
            <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
              <CardHeader className="py-3 bg-muted/30 border-b">
                <CardTitle className="text-md">Tasks</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ul className="space-y-2">
                  {story.tasks.map((task) => (
                    <li key={task.id}>
                      <Link 
                        href={`/tasks/${task.id}`} // Assuming task detail page exists
                        className="flex items-center justify-between gap-2 p-2 hover:bg-muted/30 rounded-md transition-colors"
                      >
                         <span className="text-sm">{task.title}</span>
                         {/* Add task status/priority badges if needed */}
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
                  <Select
                    value={story.status}
                    onValueChange={handleStatusChange}
                    disabled={savingStatus}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{getStatusBadge(story.status)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {storyStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {getStatusBadge(option.value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                     value={story.priority}
                     onValueChange={handlePriorityChange}
                     disabled={savingPriority}
                   >
                     <SelectTrigger className="w-full">
                       <SelectValue>{getPriorityBadge(story.priority)}</SelectValue>
                     </SelectTrigger>
                     <SelectContent>
                       {storyPriorityOptions.map((option) => (
                         <SelectItem key={option.value} value={option.value}>
                           {getPriorityBadge(option.value)}
                         </SelectItem>
                       ))}
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
                 <p className="text-sm font-medium mb-1">Points</p>
                 <div className="relative flex items-center gap-2">
                   <Input 
                     type="number"
                     placeholder="-"
                     value={points === undefined ? '' : points}
                     onChange={(e) => handlePointsChange(e.target.value)}
                     onBlur={handleSavePoints} // Save on blur
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') handleSavePoints();
                     }}
                     className="w-20 h-9"
                     disabled={savingPoints}
                     min="0"
                   />
                    {savingPoints && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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

              {story.epic && (
                <div>
                  <p className="text-sm font-medium mb-1">Epic</p>
                  <Link 
                    href={`/epics/${story.epicId}`}
                    className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-md border transition-colors"
                  >
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                       <Star className="h-3 w-3 mr-1" />
                       Epic
                     </Badge>
                    <span className="text-sm">{story.epic.title}</span>
                  </Link>
                </div>
              )}

              {story.taskBoard && (
                <div>
                  <p className="text-sm font-medium mb-1">Board</p>
                  <Link 
                    href={`/tasks?board=${story.taskBoard.id}`}
                    className="flex items-center border rounded-md p-2 hover:bg-muted/20 transition-colors"
                  >
                    {story.taskBoard.name}
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
