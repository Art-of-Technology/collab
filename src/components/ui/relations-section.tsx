"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon, Plus, X } from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useState, useEffect } from "react";
import { AddEpicModal } from "@/components/modals/AddEpicModal";
import { AddStoryModal } from "@/components/modals/AddStoryModal";
import { AddParentTaskModal } from "@/components/modals/AddParentTaskModal";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";

interface RelationItemProps {
  title: string;
  type: 'milestone' | 'epic' | 'story' | 'task';
  issueKey?: string;
  status?: string;
  href: string;
  onRemove?: () => void;
  canRemove?: boolean;
}

function RelationItem({ title, type, issueKey, status, href, onRemove, canRemove = false }: RelationItemProps) {
  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'milestone':
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case 'epic':
        return "bg-purple-50 text-purple-700 border-purple-200";
      case 'story':
        return "bg-blue-50 text-blue-700 border-blue-200";
      case 'task':
        return "bg-gray-50 text-gray-700 border-gray-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    const statusColors = {
      'DONE': 'bg-green-500',
      'IN_PROGRESS': 'bg-blue-500', 
      'IN PROGRESS': 'bg-blue-500',
      'TODO': 'bg-gray-500',
      'BACKLOG': 'bg-gray-500',
    };
    
    const color = statusColors[status as keyof typeof statusColors] || 'bg-gray-500';
    
    return (
      <Badge className={`${color} text-white flex-shrink-0 ml-1`}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex items-center justify-between gap-2 text-sm p-2 bg-muted/20 rounded-md hover:bg-muted/30 transition-colors">
      <Link 
        href={href} 
        className="flex items-center gap-2 min-w-0 flex-1"
      >
        <Badge variant="outline" className={getBadgeStyle(type)}>
          {issueKey || type.charAt(0).toUpperCase() + type.slice(1)}
        </Badge>
        <span className="truncate">{title}</span>
        {getStatusBadge(status)}
      </Link>
      {canRemove && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

interface TaskRelationsProps {
  task: any;
  onUpdateRelations?: (updatedTask: any) => void;
  canEdit?: boolean;
}

export function TaskRelations({ task, onUpdateRelations, canEdit = true }: TaskRelationsProps) {
  const { currentWorkspace } = useWorkspace();
  const [showAddEpicModal, setShowAddEpicModal] = useState(false);
  const [showAddStoryModal, setShowAddStoryModal] = useState(false);
  const [showAddParentTaskModal, setShowAddParentTaskModal] = useState(false);
  
  // Confirmation modal states
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<{
    type: 'epic' | 'story' | 'parentTask';
    id: string;
    title: string;
  } | null>(null);
  
  // Local state to handle task updates
  const [localTask, setLocalTask] = useState(task);

  // Update local state when task prop changes
  useEffect(() => {
    setLocalTask(task);
  }, [task]);

  // Use local task data
  const currentTask = localTask;

  // Multiple epics handler
  const handleAddMultipleEpics = async (epicIds: string[]) => {
    try {
      console.log('Add multiple epics:', epicIds);
      
      // Create mock epics for all selected IDs
      const mockEpics = epicIds.map(epicId => ({
        id: epicId,
        title: epicId === "1" ? "User Authentication Epic" : 
               epicId === "2" ? "Payment System Epic" : 
               epicId === "3" ? "Mobile App Epic" : 
               "Performance Optimization Epic",
        status: "IN_PROGRESS"
      }));
      
      // Update both local state and parent callback - ADD all epics at once
      const currentEpics = currentTask.epics || [];
      const updatedEpics = [...currentEpics, ...mockEpics];
      const updatedTask = { ...currentTask, epics: updatedEpics };
      if (onUpdateRelations) {
        onUpdateRelations(updatedTask);
      }
      setLocalTask(updatedTask);
    } catch (error) {
      console.error("Failed to add multiple epics:", error);
    }
  };

  const handleAddEpic = async (epicId: string) => {
    await handleAddMultipleEpics([epicId]);
  };

  // Multiple stories handler
  const handleAddMultipleStories = async (storyIds: string[]) => {
    try {
      console.log('Add multiple stories:', storyIds);
      
      // Create mock stories for all selected IDs
      const mockStories = storyIds.map(storyId => ({
        id: storyId,
        title: storyId === "1" ? "User Registration Flow" : 
               storyId === "2" ? "Password Reset Feature" : 
               storyId === "3" ? "Social Login Integration" : 
               storyId === "4" ? "Email Verification" : 
               "Profile Management",
        status: "IN_PROGRESS"
      }));
      
      const currentStories = currentTask.stories || [];
      const updatedStories = [...currentStories, ...mockStories];
      const updatedTask = { ...currentTask, stories: updatedStories };
      if (onUpdateRelations) {
        onUpdateRelations(updatedTask);
      }
      setLocalTask(updatedTask);
    } catch (error) {
      console.error("Failed to add multiple stories:", error);
    }
  };

  const handleAddStory = async (storyId: string) => {
    await handleAddMultipleStories([storyId]);
  };

  // Multiple parent tasks handler
  const handleAddMultipleParentTasks = async (parentTaskIds: string[]) => {
    try {
      console.log('Add multiple parent tasks:', parentTaskIds);
      
      const mockParentTasks = parentTaskIds.map(parentTaskId => ({
        id: parentTaskId,
        title: parentTaskId === "1" ? "Setup Authentication System" : 
               parentTaskId === "2" ? "Design User Interface" : 
               parentTaskId === "3" ? "Implement Database Schema" : 
               parentTaskId === "4" ? "Create API Endpoints" : 
               parentTaskId === "5" ? "Write Unit Tests" : 
               "Deploy to Production",
        issueKey: `TSK-${parentTaskId}`,
        status: "IN_PROGRESS"
      }));
      
      const currentParentTasks = currentTask.parentTasks || [];
      const updatedParentTasks = [...currentParentTasks, ...mockParentTasks];
      const updatedTask = { ...currentTask, parentTasks: updatedParentTasks };
      if (onUpdateRelations) {
        onUpdateRelations(updatedTask);
      }
      setLocalTask(updatedTask);
    } catch (error) {
      console.error("Failed to add multiple parent tasks:", error);
    }
  };

  const handleAddParentTask = async (parentTaskId: string) => {
    await handleAddMultipleParentTasks([parentTaskId]);
  };

  // Confirmation handlers
  const handleConfirmDelete = () => {
    if (!confirmationAction) return;
    
    switch (confirmationAction.type) {
      case 'epic':
        performRemoveEpic(confirmationAction.id);
        break;
      case 'story':
        performRemoveStory(confirmationAction.id);
        break;
      case 'parentTask':
        performRemoveParentTask(confirmationAction.id);
        break;
    }
    
    setShowConfirmationModal(false);
    setConfirmationAction(null);
  };

  const handleCancelDelete = () => {
    setShowConfirmationModal(false);
    setConfirmationAction(null);
  };

  // Show confirmation modal before deletion
  const handleRemoveEpic = (epicId: string) => {
    const epic = currentTask.epics?.find((e: any) => e.id === epicId);
    setConfirmationAction({
      type: 'epic',
      id: epicId,
      title: epic?.title || 'Epic'
    });
    setShowConfirmationModal(true);
  };

  const handleRemoveStory = (storyId: string) => {
    const story = currentTask.stories?.find((s: any) => s.id === storyId);
    setConfirmationAction({
      type: 'story',
      id: storyId,
      title: story?.title || 'Story'
    });
    setShowConfirmationModal(true);
  };

  const handleRemoveParentTask = (parentTaskId: string) => {
    const parentTask = currentTask.parentTasks?.find((p: any) => p.id === parentTaskId);
    setConfirmationAction({
      type: 'parentTask',
      id: parentTaskId,
      title: parentTask?.title || 'Parent Task'
    });
    setShowConfirmationModal(true);
  };

  // Actual deletion functions (called after confirmation)
  const performRemoveEpic = async (epicId: string) => {
    try {
      console.log('Remove epic relation:', epicId);
      
      const updatedEpics = (currentTask.epics || []).filter((epic: any) => epic.id !== epicId);
      const updatedTask = { ...currentTask, epics: updatedEpics };
      if (onUpdateRelations) {
        onUpdateRelations(updatedTask);
      }
      setLocalTask(updatedTask);
    } catch (error) {
      console.error("Failed to remove epic:", error);
    }
  };

  const performRemoveStory = async (storyId: string) => {
    try {
      console.log('Remove story relation:', storyId);
      
      const updatedStories = (currentTask.stories || []).filter((story: any) => story.id !== storyId);
      const updatedTask = { ...currentTask, stories: updatedStories };
      if (onUpdateRelations) {
        onUpdateRelations(updatedTask);
      }
      setLocalTask(updatedTask);
    } catch (error) {
      console.error("Failed to remove story:", error);
    }
  };

  const performRemoveParentTask = async (parentTaskId: string) => {
    try {
      console.log('Remove parent task relation:', parentTaskId);
      
      const updatedParentTasks = (currentTask.parentTasks || []).filter((parentTask: any) => parentTask.id !== parentTaskId);
      const updatedTask = { ...currentTask, parentTasks: updatedParentTasks };
      if (onUpdateRelations) {
        onUpdateRelations(updatedTask);
      }
      setLocalTask(updatedTask);
    } catch (error) {
      console.error("Failed to remove parent task:", error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Milestone */}
          <div>
            <h4 className="text-sm font-medium mb-2">Milestone</h4>
            {currentTask.milestone ? (
              <RelationItem
                title={currentTask.milestone.title}
                type="milestone"
                href={currentWorkspace ? `/${currentWorkspace.id}/milestones/${currentTask.milestoneId}` : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No milestone linked
              </div>
            )}
          </div>

          {/* Epics */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-medium">Epics ({currentTask.epics?.length || 0})</h4>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAddEpicModal(true)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
            {currentTask.epics && currentTask.epics.length > 0 ? (
              <div className="space-y-2">
                {currentTask.epics.map((epic: any) => (
                  <RelationItem
                    key={epic.id}
                    title={epic.title}
                    type="epic"
                    status={epic.status}
                    href={currentWorkspace ? `/${currentWorkspace.id}/epics/${epic.id}` : "#"}
                    onRemove={() => handleRemoveEpic(epic.id)}
                    canRemove={canEdit}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No epics linked
              </div>
            )}
          </div>

          {/* Stories */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-medium">Stories ({currentTask.stories?.length || 0})</h4>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAddStoryModal(true)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
            {currentTask.stories && currentTask.stories.length > 0 ? (
              <div className="space-y-2">
                {currentTask.stories.map((story: any) => (
                  <RelationItem
                    key={story.id}
                    title={story.title}
                    type="story"
                    status={story.status}
                    href={currentWorkspace ? `/${currentWorkspace.id}/stories/${story.id}` : "#"}
                    onRemove={() => handleRemoveStory(story.id)}
                    canRemove={canEdit}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No stories linked
              </div>
            )}
          </div>

          {/* Parent Tasks */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-medium">Parent Tasks ({currentTask.parentTasks?.length || 0})</h4>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAddParentTaskModal(true)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
            {currentTask.parentTasks && currentTask.parentTasks.length > 0 ? (
              <div className="space-y-2">
                {currentTask.parentTasks.map((parentTask: any) => (
                  <RelationItem
                    key={parentTask.id}
                    title={parentTask.title}
                    type="task"
                    issueKey={parentTask.issueKey}
                    status={parentTask.status}
                    href={currentWorkspace ? `/${currentWorkspace.id}/tasks/${parentTask.id}` : "#"}
                    onRemove={() => handleRemoveParentTask(parentTask.id)}
                    canRemove={canEdit}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No parent tasks linked
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <AddEpicModal
        isOpen={showAddEpicModal}
        onClose={() => setShowAddEpicModal(false)}
        onAddEpic={handleAddEpic}
        onAddMultipleEpics={handleAddMultipleEpics}
        currentEpicIds={currentTask.epics?.map((epic: any) => epic.id) || []}
      />
      
      <AddStoryModal
        isOpen={showAddStoryModal}
        onClose={() => setShowAddStoryModal(false)}
        onAddStory={handleAddStory}
        onAddMultipleStories={handleAddMultipleStories}
        currentStoryIds={currentTask.stories?.map((story: any) => story.id) || []}
      />
      
      <AddParentTaskModal
        isOpen={showAddParentTaskModal}
        onClose={() => setShowAddParentTaskModal(false)}
        onAddParentTask={handleAddParentTask}
        onAddMultipleParentTasks={handleAddMultipleParentTasks}
        currentTaskId={currentTask.id}
        currentParentTaskIds={currentTask.parentTasks?.map((parentTask: any) => parentTask.id) || []}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmationModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Remove Relation"
        message={
          <div>
            Are you sure you want to remove the relation to{' '}
            <strong>"{confirmationAction?.title}"</strong>?
            <br />
            <br />
            This action cannot be undone.
          </div>
        }
        confirmText="Remove"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  );
}

// Other relation components remain the same...
interface EpicRelationsProps {
  epic: any;
}

export function EpicRelations({ epic }: EpicRelationsProps) {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Milestone */}
          <div>
            <h4 className="text-sm font-medium mb-2">Milestone</h4>
            {epic.milestone ? (
              <RelationItem
                title={epic.milestone.title}
                type="milestone"
                href={currentWorkspace ? `/${currentWorkspace.id}/milestones/${epic.milestoneId}` : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No milestone linked
              </div>
            )}
          </div>

          {/* Stories */}
          <div>
            <h4 className="text-sm font-medium mb-2">Stories ({epic.stories?.length || 0})</h4>
            {epic.stories && epic.stories.length > 0 ? (
              <div className="space-y-2">
                {epic.stories.map((story: any) => (
                  <RelationItem
                    key={story.id}
                    title={story.title}
                    type="story"
                    status={story.status}
                    href={currentWorkspace ? `/${currentWorkspace.id}/stories/${story.id}` : "#"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No stories linked
              </div>
            )}
          </div>

          {/* Tasks */}
          <div>
            <h4 className="text-sm font-medium mb-2">Tasks ({epic.tasks?.length || 0})</h4>
            {epic.tasks && epic.tasks.length > 0 ? (
              <div className="space-y-2">
                {epic.tasks.map((task: any) => (
                  <RelationItem
                    key={task.id}
                    title={task.title}
                    type="task"
                    issueKey={task.issueKey}
                    status={task.status}
                    href={currentWorkspace ? `/${currentWorkspace.id}/tasks/${task.id}` : "#"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No tasks linked
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StoryRelationsProps {
  story: any;
}

export function StoryRelations({ story }: StoryRelationsProps) {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Epic */}
          <div>
            <h4 className="text-sm font-medium mb-2">Epic</h4>
            {story.epic ? (
              <RelationItem
                title={story.epic.title}
                type="epic"
                href={currentWorkspace ? `/${currentWorkspace.id}/epics/${story.epicId}` : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No epic linked
              </div>
            )}
          </div>

          {/* Tasks */}
          <div>
            <h4 className="text-sm font-medium mb-2">Tasks ({story.tasks?.length || 0})</h4>
            {story.tasks && story.tasks.length > 0 ? (
              <div className="space-y-2">
                {story.tasks.map((task: any) => (
                  <RelationItem
                    key={task.id}
                    title={task.title}
                    type="task"
                    issueKey={task.issueKey}
                    status={task.status}
                    href={currentWorkspace ? `/${currentWorkspace.id}/tasks/${task.id}` : "#"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No tasks linked
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface MilestoneRelationsProps {
  milestone: any;
}

export function MilestoneRelations({ milestone }: MilestoneRelationsProps) {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Epics */}
          <div>
            <h4 className="text-sm font-medium mb-2">Epics ({milestone.epics?.length || 0})</h4>
            {milestone.epics && milestone.epics.length > 0 ? (
              <div className="space-y-2">
                {milestone.epics.map((epic: any) => (
                  <RelationItem
                    key={epic.id}
                    title={epic.title}
                    type="epic"
                    status={epic.status}
                    href={currentWorkspace ? `/${currentWorkspace.id}/epics/${epic.id}` : "#"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No epics linked
              </div>
            )}
          </div>

          {/* Stories (through epics) */}
          <div>
            <h4 className="text-sm font-medium mb-2">Stories</h4>
            {milestone.epics && milestone.epics.some((epic: any) => epic.stories?.length > 0) ? (
              <div className="space-y-2">
                {milestone.epics.flatMap((epic: any) => 
                  epic.stories?.map((story: any) => (
                    <RelationItem
                      key={story.id}
                      title={`${story.title} (via ${epic.title})`}
                      type="story"
                      status={story.status}
                      href={currentWorkspace ? `/${currentWorkspace.id}/stories/${story.id}` : "#"}
                    />
                  )) || []
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No stories linked
              </div>
            )}
          </div>

          {/* Tasks (through epics) */}
          <div>
            <h4 className="text-sm font-medium mb-2">Tasks</h4>
            {milestone.epics && milestone.epics.some((epic: any) => epic.tasks?.length > 0) ? (
              <div className="space-y-2">
                {milestone.epics.flatMap((epic: any) => 
                  epic.tasks?.map((task: any) => (
                    <RelationItem
                      key={task.id}
                      title={`${task.title} (via ${epic.title})`}
                      type="task"
                      issueKey={task.issueKey}
                      status={task.status}
                      href={currentWorkspace ? `/${currentWorkspace.id}/tasks/${task.id}` : "#"}
                    />
                  )) || []
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No tasks linked
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Main Relations component that renders the appropriate relations based on item type
interface RelationsSectionProps {
  itemType: 'task' | 'epic' | 'story' | 'milestone';
  itemData: any;
  onUpdateRelations?: (updatedItem: any) => void;
  canEdit?: boolean;
}

export function RelationsSection({ itemType, itemData, onUpdateRelations, canEdit = true }: RelationsSectionProps) {
  switch (itemType) {
    case 'task':
      return <TaskRelations task={itemData} onUpdateRelations={onUpdateRelations} canEdit={canEdit} />;
    case 'epic':
      return <EpicRelations epic={itemData} />;
    case 'story':
      return <StoryRelations story={itemData} />;
    case 'milestone':
      return <MilestoneRelations milestone={itemData} />;
    default:
      return null;
  }
}