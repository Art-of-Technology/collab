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
import { AddMilestoneModal } from "@/components/modals/AddMilestoneModal";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { useRelationsApi } from "@/hooks/useRelationsApi";

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
  const relationsApi = useRelationsApi({ workspaceId: currentWorkspace?.id || '' });
  
  const [showAddEpicModal, setShowAddEpicModal] = useState(false);
  const [showAddStoryModal, setShowAddStoryModal] = useState(false);
  const [showAddParentTaskModal, setShowAddParentTaskModal] = useState(false);
  const [showAddMilestoneModal, setShowAddMilestoneModal] = useState(false);
  
  // Confirmation modal states
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<{
    type: 'epic' | 'story' | 'parentTask' | 'milestone';
    id: string;
    title: string;
  } | null>(null);
  
  // Relations state from API
  const [relations, setRelations] = useState<{
    epics: any[];
    stories: any[];
    milestones: any[];
    parentTasks: any[];
  }>({
    epics: [],
    stories: [],
    milestones: [],
    parentTasks: []
  });
  
  const [isLoading, setIsLoading] = useState(false);

  // Load relations when task changes
  useEffect(() => {
    if (task?.id && currentWorkspace?.id) {
      loadRelations();
    }
  }, [task?.id, currentWorkspace?.id]);

  const loadRelations = async () => {
    if (!task?.id || !currentWorkspace?.id) return;
    
    try {
      setIsLoading(true);
      const taskRelations = await relationsApi.getTaskRelations(task.id);
      setRelations(taskRelations);
    } catch (error) {
      console.error('Failed to load relations:', error);
      setRelations({ epics: [], stories: [], milestones: [], parentTasks: [] });
    } finally {
      setIsLoading(false);
    }
  };

  // Add handlers using real API
  const handleAddEpic = async (epicId: string) => {
    await handleAddMultipleEpics([epicId]);
  };

  const handleAddMultipleEpics = async (epicIds: string[]) => {
    try {
      for (const epicId of epicIds) {
        await relationsApi.addRelation(task.id, epicId, 'EPIC');
      }
      await loadRelations();
    } catch (error) {
      console.error("Failed to add epics:", error);
    }
  };

  const handleAddStory = async (storyId: string) => {
    await handleAddMultipleStories([storyId]);
  };

  const handleAddMultipleStories = async (storyIds: string[]) => {
    try {
      for (const storyId of storyIds) {
        await relationsApi.addRelation(task.id, storyId, 'STORY');
      }
      await loadRelations();
    } catch (error) {
      console.error("Failed to add stories:", error);
    }
  };

  const handleAddParentTask = async (parentTaskId: string) => {
    await handleAddMultipleParentTasks([parentTaskId]);
  };

  const handleAddMultipleParentTasks = async (parentTaskIds: string[]) => {
    try {
      for (const parentTaskId of parentTaskIds) {
        await relationsApi.addRelation(task.id, parentTaskId, 'PARENT_TASK');
      }
      await loadRelations();
    } catch (error) {
      console.error("Failed to add parent tasks:", error);
    }
  };

  const handleAddMilestone = async (milestoneId: string) => {
    await handleAddMultipleMilestones([milestoneId]);
  };

  const handleAddMultipleMilestones = async (milestoneIds: string[]) => {
    try {
      for (const milestoneId of milestoneIds) {
        await relationsApi.addRelation(task.id, milestoneId, 'MILESTONE');
      }
      await loadRelations();
    } catch (error) {
      console.error("Failed to add milestones:", error);
    }
  };

  // Remove handlers
  const handleRemoveEpic = (epicId: string) => {
    const epic = relations.epics.find((e: any) => e.id === epicId);
    setConfirmationAction({
      type: 'epic',
      id: epicId,
      title: epic?.title || 'Epic'
    });
    setShowConfirmationModal(true);
  };

  const handleRemoveStory = (storyId: string) => {
    const story = relations.stories.find((s: any) => s.id === storyId);
    setConfirmationAction({
      type: 'story',
      id: storyId,
      title: story?.title || 'Story'
    });
    setShowConfirmationModal(true);
  };

  const handleRemoveParentTask = (parentTaskId: string) => {
    const parentTask = relations.parentTasks.find((p: any) => p.id === parentTaskId);
    setConfirmationAction({
      type: 'parentTask',
      id: parentTaskId,
      title: parentTask?.title || 'Parent Task'
    });
    setShowConfirmationModal(true);
  };

  const handleRemoveMilestone = (milestoneId: string) => {
    const milestone = relations.milestones.find((m: any) => m.id === milestoneId);
    setConfirmationAction({
      type: 'milestone',
      id: milestoneId,
      title: milestone?.title || 'Milestone'
    });
    setShowConfirmationModal(true);
  };

  // Confirmation handlers
  const handleConfirmDelete = async () => {
    if (!confirmationAction) return;
    
    try {
      let relationType: 'EPIC' | 'STORY' | 'MILESTONE' | 'PARENT_TASK';
      switch (confirmationAction.type) {
        case 'epic':
          relationType = 'EPIC';
          break;
        case 'story':
          relationType = 'STORY';
          break;
        case 'parentTask':
          relationType = 'PARENT_TASK';
          break;
        case 'milestone':
          relationType = 'MILESTONE';
          break;
        default:
          return;
      }
      
      await relationsApi.removeRelation(task.id, confirmationAction.id, relationType);
      await loadRelations();
      
    } catch (error) {
      console.error("Failed to remove relation:", error);
    }
    
    setShowConfirmationModal(false);
    setConfirmationAction(null);
  };

  const handleCancelDelete = () => {
    setShowConfirmationModal(false);
    setConfirmationAction(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            Loading relations...
          </div>
        </CardContent>
      </Card>
    );
  }

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
          {/* Milestones */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-medium">Milestones ({relations.milestones?.length || 0})</h4>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAddMilestoneModal(true)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
            {relations.milestones && relations.milestones.length > 0 ? (
              <div className="space-y-2">
                {relations.milestones.map((milestone: any) => (
                  <RelationItem
                    key={milestone.id}
                    title={milestone.title}
                    type="milestone"
                    status={milestone.status}
                    href={currentWorkspace ? `/${currentWorkspace.id}/milestones/${milestone.id}` : "#"}
                    onRemove={() => handleRemoveMilestone(milestone.id)}
                    canRemove={canEdit}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No milestones linked
              </div>
            )}
          </div>

          {/* Epics */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-medium">Epics ({relations.epics?.length || 0})</h4>
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
            {relations.epics && relations.epics.length > 0 ? (
              <div className="space-y-2">
                {relations.epics.map((epic: any) => (
                  <RelationItem
                    key={epic.id}
                    title={epic.title}
                    type="epic"
                    issueKey={epic.issueKey}
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
              <h4 className="text-sm font-medium">Stories ({relations.stories?.length || 0})</h4>
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
            {relations.stories && relations.stories.length > 0 ? (
              <div className="space-y-2">
                {relations.stories.map((story: any) => (
                  <RelationItem
                    key={story.id}
                    title={story.title}
                    type="story"
                    issueKey={story.issueKey}
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
              <h4 className="text-sm font-medium">Parent Tasks ({relations.parentTasks?.length || 0})</h4>
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
            {relations.parentTasks && relations.parentTasks.length > 0 ? (
              <div className="space-y-2">
                {relations.parentTasks.map((parentTask: any) => (
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
        currentEpicIds={relations.epics?.map((epic: any) => epic.id) || []}
      />
      
      <AddStoryModal
        isOpen={showAddStoryModal}
        onClose={() => setShowAddStoryModal(false)}
        onAddStory={handleAddStory}
        onAddMultipleStories={handleAddMultipleStories}
        currentStoryIds={relations.stories?.map((story: any) => story.id) || []}
      />
      
      <AddParentTaskModal
        isOpen={showAddParentTaskModal}
        onClose={() => setShowAddParentTaskModal(false)}
        onAddParentTask={handleAddParentTask}
        onAddMultipleParentTasks={handleAddMultipleParentTasks}
        currentTaskId={task.id}
        currentParentTaskIds={relations.parentTasks?.map((parentTask: any) => parentTask.id) || []}
      />

      <AddMilestoneModal
        isOpen={showAddMilestoneModal}
        onClose={() => setShowAddMilestoneModal(false)}
        onAddMilestone={handleAddMilestone}
        onAddMultipleMilestones={handleAddMultipleMilestones}
        currentMilestoneIds={relations.milestones?.map((milestone: any) => milestone.id) || []}
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