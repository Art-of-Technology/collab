"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageSquare, Paperclip, CheckSquare, Bug, Sparkles, TrendingUp, Calendar, Star, BookOpen } from "lucide-react";
import { useTaskModal } from "@/context/TaskModalContext";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import React from "react";

export interface EnhancedTaskCardProps {
  id: string;
  title: string;
  type: string;
  priority?: string;
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
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
    name: string | null;
    image: string | null;
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
  commentCount?: number;
  attachmentCount?: number;
  issueKey?: string | null;
  isMilestone?: boolean;
  isEpic?: boolean;
  isStory?: boolean;
  milestoneTitle?: string;
  epicTitle?: string;
  storyTitle?: string;
  color?: string | null;
  entityType?: 'task' | 'milestone' | 'epic' | 'story';
  dueDate?: Date | string | null;
  _count?: any;
}

export default function EnhancedTaskCard({
  id,
  title,
  type,
  priority = 'medium',
  assignee = null,
  reporter = null,
  commentCount = 0,
  attachmentCount = 0,
  issueKey = null,
  isMilestone,
  isEpic,
  isStory,
  milestoneTitle,
  epicTitle,
  storyTitle,
  color,
  entityType = 'task',
  _count,
}: EnhancedTaskCardProps) {
  const { openTaskModal, openMilestoneModal, openEpicModal, openStoryModal } = useTaskModal();

  // Helper to render priority indicator
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-amber-500";
      case "low":
        return "bg-blue-500";
      default:
        return "bg-slate-400";
    }
  };

  // Determine the item type based on entityType or legacy props
  const itemType = entityType ||
    (isMilestone ? 'milestone' : isEpic ? 'epic' : isStory ? 'story' : 'task');

  // Get card styles based on item type
  const getCardStyles = () => {
    if (itemType === 'milestone' || isMilestone) {
      return {
        borderColor: color || "#6366F1",
        backgroundColor: `${color || "#6366F1"}10`,
        icon: <Calendar className="h-3.5 w-3.5 mr-1 text-indigo-500" />
      };
    }
    if (itemType === 'epic' || isEpic) {
      return {
        borderColor: color || "#8B5CF6",
        backgroundColor: `${color || "#8B5CF6"}10`,
        icon: <Star className="h-3.5 w-3.5 mr-1 text-purple-500" />
      };
    }
    if (itemType === 'story' || isStory) {
      return {
        borderColor: color || "#3B82F6",
        backgroundColor: `${color || "#3B82F6"}10`,
        icon: <BookOpen className="h-3.5 w-3.5 mr-1 text-blue-500" />
      };
    }
    return {
      borderColor: undefined,
      backgroundColor: undefined,
      icon: getTypeIcon(type)
    };
  };

  // Get type badge with icon
  const getTypeIcon = (type: string) => {
    // Ensure consistent uppercase formatting for types
    const normalizedType = type?.toUpperCase() || "TASK";

    switch (normalizedType) {
      case "TASK":
        return <CheckSquare className="h-3.5 w-3.5 mr-1 text-blue-500" />;
      case "BUG":
        return <Bug className="h-3.5 w-3.5 mr-1 text-red-500" />;
      case "FEATURE":
        return <Sparkles className="h-3.5 w-3.5 mr-1 text-green-500" />;
      case "IMPROVEMENT":
        return <TrendingUp className="h-3.5 w-3.5 mr-1 text-purple-500" />;
      case "MILESTONE":
        return <Calendar className="h-3.5 w-3.5 mr-1 text-indigo-500" />;
      case "EPIC":
        return <Star className="h-3.5 w-3.5 mr-1 text-purple-500" />;
      case "STORY":
        return <BookOpen className="h-3.5 w-3.5 mr-1 text-blue-500" />;
      default:
        return <CheckSquare className="h-3.5 w-3.5 mr-1 text-blue-500" />;
    }
  };

  const getTypeBadge = (type: string) => {
    // Ensure consistent uppercase formatting for types
    const normalizedType = type?.toUpperCase() || "TASK";

    const typeColors: Record<string, string> = {
      "TASK": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "BUG": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      "FEATURE": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "IMPROVEMENT": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      "MILESTONE": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      "EPIC": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      "STORY": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    };

    return (
      <Badge className={`${typeColors[normalizedType] || "bg-gray-100 text-gray-800"} px-1.5 py-0.5 flex items-center text-xs`}>
        {getTypeIcon(normalizedType)}
        <span>{normalizedType}</span>
      </Badge>
    );
  };

  // Get counts for different entity types
  const getEntityCounts = () => {
    if (!_count) return null;

    switch (itemType) {
      case 'milestone':
        return _count.epics > 0 ? (
          <div className="flex items-center text-xs">
            <Star className="h-3 w-3 mr-1" />
            {_count.epics}
          </div>
        ) : null;
      case 'epic':
        return _count.stories > 0 ? (
          <div className="flex items-center text-xs">
            <BookOpen className="h-3 w-3 mr-1" />
            {_count.stories}
          </div>
        ) : null;
      case 'story':
        return _count.tasks > 0 ? (
          <div className="flex items-center text-xs">
            <CheckSquare className="h-3 w-3 mr-1" />
            {_count.tasks}
          </div>
        ) : null;
      default:
        return null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();

    // Route to appropriate entity detail page based on type
    if (itemType === 'task') {
      openTaskModal(id);
    } else if (itemType === 'milestone') {
      openMilestoneModal(id);
    } else if (itemType === 'epic') {
      openEpicModal(id);
    } else if (itemType === 'story') {
      openStoryModal(id);
    }
  };

  const cardStyles = getCardStyles();

  // Helper component for rendering avatar with tooltip
  const AvatarWithTooltip = React.memo(({
    user,
    label
  }: {
    user: { 
      id: string; 
      name: string | null; 
      image: string | null; 
      useCustomAvatar?: boolean;
      avatarAccessory?: number;
      avatarBrows?: number;
      avatarEyes?: number;
      avatarEyewear?: number;
      avatarHair?: number;
      avatarMouth?: number;
      avatarNose?: number;
      avatarSkinTone?: number;
    },
    label: string
  }) => {
    // Use a stable key to prevent re-mounting
    const avatarKey = `${user.id}-${user.image}-${user.useCustomAvatar}`;
    
    if (user.useCustomAvatar) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-6 h-6 min-w-[1.5rem] min-h-[1.5rem]">
                <CustomAvatar user={user} size="sm" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{label}: {user.name || "Unknown"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              key={avatarKey}
              className="w-6 h-6 min-w-[1.5rem] min-h-[1.5rem] rounded-full overflow-hidden bg-muted flex-shrink-0"
              style={{
                backgroundImage: user.image ? `url(${user.image})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              }}
            >
              {!user.image && (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xs font-medium text-muted-foreground">
                    {user.name?.substring(0, 2)?.toUpperCase() || "U"}
                  </span>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}: {user.name || "Unknown"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  });

  // Add display name for debugging
  AvatarWithTooltip.displayName = 'AvatarWithTooltip';

  return (
    <div onClick={handleClick}>
      <Card
        className="overflow-hidden transition-all cursor-pointer border-l-4"
        style={{
          borderLeftColor: cardStyles.borderColor,
          backgroundColor: cardStyles.backgroundColor
        }}
      >
        <CardContent className="p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              {getTypeBadge(itemType === 'task' ? type : itemType.toUpperCase())}
              {itemType === 'task' && priority && (
                <div className={`h-2 w-2 rounded-full ${getPriorityColor(priority)}`} />
              )}
            </div>

            <div className="space-y-1">
              {issueKey && (
                <div className="text-xs font-medium text-muted-foreground">
                  {issueKey}
                </div>
              )}
              <h3 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">{title}</h3>

              {/* Show hierarchy relationship badges */}
              <div className="flex flex-wrap gap-1 pt-1">
                {milestoneTitle && itemType !== 'milestone' && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-indigo-50 text-indigo-700 border-indigo-200">
                    <Calendar className="h-2.5 w-2.5 mr-0.5" />
                    {milestoneTitle}
                  </Badge>
                )}
                {epicTitle && itemType !== 'epic' && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-purple-50 text-purple-700 border-purple-200">
                    <Star className="h-2.5 w-2.5 mr-0.5" />
                    {epicTitle}
                  </Badge>
                )}
                {storyTitle && itemType !== 'story' && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-blue-50 text-blue-700 border-blue-200">
                    <BookOpen className="h-2.5 w-2.5 mr-0.5" />
                    {storyTitle}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                {assignee && (
                  <AvatarWithTooltip user={assignee} label="Assignee" />
                )}
                {!assignee && (
                  <div className="h-6 w-6 min-h-[1.5rem] min-w-[1.5rem]" />
                )}
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                {getEntityCounts()}

                {itemType === 'task' && commentCount > 0 && (
                  <div className="flex items-center text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {commentCount}
                  </div>
                )}

                {itemType === 'task' && attachmentCount > 0 && (
                  <div className="flex items-center text-xs">
                    <Paperclip className="h-3 w-3 mr-1" />
                    {attachmentCount}
                  </div>
                )}

                {reporter && (
                  <AvatarWithTooltip user={reporter} label="Reporter" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 