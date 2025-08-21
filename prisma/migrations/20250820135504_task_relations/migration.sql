-- CreateEnum
CREATE TYPE "TrackUnit" AS ENUM ('HOURS', 'DAYS');

-- CreateEnum
CREATE TYPE "ExportMode" AS ENUM ('DO_NOT_EXPORT', 'EXPORT_WITH_PAY_CONDITION', 'EXPORT_WITH_CODE');

-- CreateEnum
CREATE TYPE "AccrualType" AS ENUM ('DOES_NOT_ACCRUE', 'HOURLY', 'FIXED', 'REGULAR_WORKING_HOURS');

-- CreateEnum
CREATE TYPE "RolloverType" AS ENUM ('ENTIRE_BALANCE', 'PARTIAL_BALANCE', 'NONE');

-- CreateEnum
CREATE TYPE "LeaveDuration" AS ENUM ('FULL_DAY', 'HALF_DAY');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TASK_START', 'TASK_PAUSE', 'TASK_STOP', 'TASK_COMPLETE', 'LUNCH_START', 'LUNCH_END', 'BREAK_START', 'BREAK_END', 'MEETING_START', 'MEETING_END', 'TRAVEL_START', 'TRAVEL_END', 'REVIEW_START', 'REVIEW_END', 'RESEARCH_START', 'RESEARCH_END', 'OFFLINE', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "UserStatusType" AS ENUM ('WORKING', 'LUNCH', 'BREAK', 'MEETING', 'TRAVEL', 'REVIEW', 'RESEARCH', 'OFFLINE', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "TaskAssigneeRole" AS ENUM ('ASSIGNEE', 'HELPER');

-- CreateEnum
CREATE TYPE "TaskAssigneeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IssueAssigneeRole" AS ENUM ('ASSIGNEE', 'HELPER');

-- CreateEnum
CREATE TYPE "IssueAssigneeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('UPDATE', 'BLOCKER', 'IDEA', 'QUESTION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PostPriority" AS ENUM ('normal', 'high', 'critical');

-- CreateEnum
CREATE TYPE "PostActionType" AS ENUM ('CREATED', 'EDITED', 'TYPE_CHANGED', 'PRIORITY_CHANGED', 'RESOLVED', 'REOPENED', 'DELETED', 'PINNED', 'UNPINNED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'DEVELOPER', 'PROJECT_MANAGER', 'HR', 'LEGAL', 'FINANCE', 'MARKETING', 'SALES', 'CUSTOMER_SUPPORT', 'QA_TESTER', 'DESIGNER', 'CONTENT_CREATOR', 'ANALYST', 'CONSULTANT', 'INTERN', 'GUEST');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'PROJECT_MANAGER', 'DESIGNER', 'QA_TESTER', 'CONTENT_CREATOR', 'ANALYST', 'HR', 'MARKETING', 'SALES', 'CUSTOMER_SUPPORT', 'MEMBER', 'VIEWER', 'GUEST');

-- CreateEnum
CREATE TYPE "BoardGenerationStatus" AS ENUM ('PENDING', 'GENERATING_MILESTONES', 'GENERATING_EPICS', 'GENERATING_STORIES', 'GENERATING_TASKS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('EPIC', 'STORY', 'MILESTONE', 'PARENT_TASK');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('CREATE_POST', 'EDIT_SELF_POST', 'EDIT_ANY_POST', 'DELETE_SELF_POST', 'DELETE_ANY_POST', 'COMMENT_ON_POST', 'EDIT_SELF_COMMENT', 'EDIT_ANY_COMMENT', 'DELETE_SELF_COMMENT', 'DELETE_ANY_COMMENT', 'REACT_TO_POST', 'REACT_TO_COMMENT', 'MENTION_USERS', 'VIEW_POSTS', 'BOOKMARK_POST', 'CREATE_TASK', 'EDIT_SELF_TASK', 'EDIT_ANY_TASK', 'DELETE_SELF_TASK', 'DELETE_ANY_TASK', 'ASSIGN_TASK', 'CHANGE_TASK_STATUS', 'COMMENT_ON_TASK', 'VIEW_TASKS', 'CREATE_BOARD', 'EDIT_BOARD', 'DELETE_BOARD', 'MANAGE_BOARD_SETTINGS', 'VIEW_BOARDS', 'CREATE_MILESTONE', 'EDIT_SELF_MILESTONE', 'EDIT_ANY_MILESTONE', 'DELETE_SELF_MILESTONE', 'DELETE_ANY_MILESTONE', 'VIEW_MILESTONES', 'CREATE_EPIC', 'EDIT_SELF_EPIC', 'EDIT_ANY_EPIC', 'DELETE_SELF_EPIC', 'DELETE_ANY_EPIC', 'VIEW_EPICS', 'CREATE_STORY', 'EDIT_SELF_STORY', 'EDIT_ANY_STORY', 'DELETE_SELF_STORY', 'DELETE_ANY_STORY', 'VIEW_STORIES', 'CREATE_FEATURE_REQUEST', 'EDIT_SELF_FEATURE_REQUEST', 'EDIT_ANY_FEATURE_REQUEST', 'DELETE_SELF_FEATURE_REQUEST', 'DELETE_ANY_FEATURE_REQUEST', 'VOTE_ON_FEATURE', 'COMMENT_ON_FEATURE', 'VIEW_FEATURES', 'SEND_MESSAGE', 'VIEW_MESSAGES', 'DELETE_SELF_MESSAGE', 'DELETE_ANY_MESSAGE', 'CREATE_NOTE', 'EDIT_SELF_NOTE', 'EDIT_ANY_NOTE', 'DELETE_SELF_NOTE', 'DELETE_ANY_NOTE', 'VIEW_NOTES', 'MANAGE_WORKSPACE_SETTINGS', 'MANAGE_WORKSPACE_MEMBERS', 'MANAGE_WORKSPACE_PERMISSIONS', 'VIEW_WORKSPACE_ANALYTICS', 'INVITE_MEMBERS', 'REMOVE_MEMBERS', 'CHANGE_MEMBER_ROLES', 'VIEW_MEMBER_LIST', 'MANAGE_INTEGRATIONS', 'EXPORT_DATA', 'IMPORT_DATA', 'VIEW_AUDIT_LOGS', 'MANAGE_NOTIFICATIONS', 'VIEW_REPORTS', 'PIN_POST', 'RESOLVE_BLOCKER', 'MANAGE_LEAVE');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('EPIC', 'STORY', 'TASK', 'DEFECT', 'MILESTONE', 'SUBTASK');

-- CreateEnum
CREATE TYPE "IssueRelationType" AS ENUM ('PARENT', 'CHILD', 'BLOCKS', 'BLOCKED_BY', 'RELATES_TO', 'DUPLICATES', 'DUPLICATED_BY');

-- CreateEnum
CREATE TYPE "ViewDisplayType" AS ENUM ('KANBAN', 'LIST', 'TABLE', 'CALENDAR', 'TIMELINE', 'GANTT', 'BOARD');

-- CreateEnum
CREATE TYPE "ViewVisibility" AS ENUM ('PERSONAL', 'WORKSPACE', 'SHARED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "hashedPassword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "team" TEXT,
    "currentFocus" TEXT,
    "expertise" TEXT[],
    "slackId" TEXT,
    "avatarAccessory" INTEGER DEFAULT 0,
    "avatarBrows" INTEGER DEFAULT 1,
    "avatarEyes" INTEGER DEFAULT 1,
    "avatarEyewear" INTEGER DEFAULT 0,
    "avatarHair" INTEGER DEFAULT 1,
    "avatarMouth" INTEGER DEFAULT 1,
    "avatarNose" INTEGER DEFAULT 1,
    "avatarSkinTone" INTEGER DEFAULT 1,
    "useCustomAvatar" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'DEVELOPER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "isAutomated" BOOLEAN NOT NULL DEFAULT false,
    "html" TEXT,
    "workspaceId" TEXT,
    "type" "PostType" NOT NULL,
    "priority" "PostPriority" NOT NULL DEFAULT 'normal',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "pinnedBy" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostAction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" "PostActionType" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workspaceId" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "postId" TEXT,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "featureRequestId" TEXT,
    "epicId" TEXT,
    "storyId" TEXT,
    "milestoneId" TEXT,
    "html" TEXT,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubIntegration" (
    "id" TEXT NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,

    CONSTRAINT "GitHubIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "html" TEXT,
    "workspaceId" TEXT,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureVote" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "featureRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureRequestComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureRequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dockEnabled" BOOLEAN NOT NULL DEFAULT true,
    "timeTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "workspaceId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "issuePrefix" TEXT NOT NULL,
    "nextIssueNumbers" JSONB NOT NULL DEFAULT '{"EPIC": 1, "STORY": 1, "TASK": 1, "DEFECT": 1, "MILESTONE": 1, "SUBTASK": 1}',

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskBoard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "issuePrefix" TEXT NOT NULL,
    "nextIssueNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TaskBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "IssueType" NOT NULL DEFAULT 'TASK',
    "statusId" TEXT,
    "statusValue" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "storyPoints" INTEGER,
    "parentId" TEXT,
    "assigneeId" TEXT,
    "reporterId" TEXT,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "columnId" TEXT,
    "dueDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "issueKey" TEXT,
    "position" INTEGER,
    "progress" INTEGER DEFAULT 0,
    "color" TEXT,
    "postId" TEXT,
    "status" TEXT,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "View" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "displayType" "ViewDisplayType" NOT NULL DEFAULT 'KANBAN',
    "filters" JSONB,
    "sorting" JSONB,
    "grouping" JSONB,
    "fields" JSONB,
    "layout" JSONB,
    "projectIds" TEXT[],
    "workspaceIds" TEXT[],
    "visibility" "ViewVisibility" NOT NULL DEFAULT 'PERSONAL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sharedWith" TEXT[],
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "View_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewIssuePosition" (
    "id" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewIssuePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "html" TEXT,
    "parentId" TEXT,

    CONSTRAINT "IssueComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueCommentReaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "iconName" TEXT,
    "order" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'status',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "iconName" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskColumn" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "description" TEXT,
    "iconName" TEXT,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "projectId" TEXT,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskBoardId" TEXT,

    CONSTRAINT "TaskColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "type" TEXT NOT NULL DEFAULT 'task',
    "storyPoints" INTEGER,
    "dueDate" TIMESTAMP(3),
    "columnId" TEXT,
    "taskBoardId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "reporterId" TEXT,
    "parentTaskId" TEXT,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "issueKey" TEXT,
    "position" INTEGER,
    "epicId" TEXT,
    "milestoneId" TEXT,
    "storyId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "html" TEXT,
    "parentId" TEXT,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCommentReaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "taskCommentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileType" TEXT,
    "taskId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLabel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardItemActivity" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "boardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "taskId" TEXT,

    CONSTRAINT "BoardItemActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "taskBoardId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "color" TEXT DEFAULT '#6366F1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "columnId" TEXT,
    "position" INTEGER,
    "issueKey" TEXT,
    "assigneeId" TEXT,
    "reporterId" TEXT,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "milestoneId" TEXT,
    "taskBoardId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "color" TEXT DEFAULT '#6366F1',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "issueKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "columnId" TEXT,
    "position" INTEGER,
    "assigneeId" TEXT,
    "reporterId" TEXT,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "type" TEXT NOT NULL DEFAULT 'user-story',
    "storyPoints" INTEGER,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "epicId" TEXT,
    "taskBoardId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "issueKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "color" TEXT DEFAULT '#3B82F6',
    "columnId" TEXT,
    "position" INTEGER,
    "assigneeId" TEXT,
    "reporterId" TEXT,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "featureRequestId" TEXT,
    "taskId" TEXT,
    "epicId" TEXT,
    "storyId" TEXT,
    "milestoneId" TEXT,
    "taskCommentId" TEXT,
    "leaveRequestId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "taskId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStatus" "UserStatusType" NOT NULL DEFAULT 'AVAILABLE',
    "currentTaskId" TEXT,
    "statusStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusText" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "autoEndAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "authorId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TaskAssigneeRole" NOT NULL DEFAULT 'ASSIGNEE',
    "status" "TaskAssigneeStatus" NOT NULL DEFAULT 'PENDING',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "totalTimeWorked" INTEGER NOT NULL DEFAULT 0,
    "lastWorkedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueAssignee" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "IssueAssigneeRole" NOT NULL DEFAULT 'HELPER',
    "status" "IssueAssigneeStatus" NOT NULL DEFAULT 'PENDING',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "totalTimeWorked" INTEGER NOT NULL DEFAULT 0,
    "lastWorkedAt" TIMESTAMP(3),

    CONSTRAINT "IssueAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#6366F1',
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardGenerationJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "projectType" TEXT,
    "teamSize" TEXT,
    "status" "BoardGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "boardData" JSONB,
    "boardId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskFollower" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostFollower" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardFollower" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueFollower" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewFollower" (
    "id" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_relations" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "relatedItemId" TEXT NOT NULL,
    "relatedItemType" "RelationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_relations" (
    "id" TEXT NOT NULL,
    "sourceIssueId" TEXT NOT NULL,
    "targetIssueId" TEXT NOT NULL,
    "relationType" "IssueRelationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "issue_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "duration" "LeaveDuration" NOT NULL,
    "notes" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "isPaid" BOOLEAN NOT NULL,
    "trackIn" "TrackUnit" NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "exportMode" "ExportMode" NOT NULL,
    "exportCode" TEXT,
    "workspaceId" TEXT NOT NULL,
    "accrualType" "AccrualType" NOT NULL,
    "deductsLeave" BOOLEAN NOT NULL DEFAULT true,
    "maxBalance" DOUBLE PRECISION,
    "rolloverType" "RolloverType",
    "rolloverAmount" DOUBLE PRECISION,
    "rolloverDate" TIMESTAMP(3),
    "allowOutsideLeaveYearRequest" BOOLEAN NOT NULL DEFAULT false,
    "useAverageWorkingHours" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalAccrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rollover" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastAccruedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskCreated" BOOLEAN NOT NULL DEFAULT true,
    "taskStatusChanged" BOOLEAN NOT NULL DEFAULT true,
    "taskAssigned" BOOLEAN NOT NULL DEFAULT true,
    "taskCommentAdded" BOOLEAN NOT NULL DEFAULT true,
    "taskPriorityChanged" BOOLEAN NOT NULL DEFAULT true,
    "taskDueDateChanged" BOOLEAN NOT NULL DEFAULT true,
    "taskColumnMoved" BOOLEAN NOT NULL DEFAULT false,
    "taskUpdated" BOOLEAN NOT NULL DEFAULT true,
    "taskDeleted" BOOLEAN NOT NULL DEFAULT true,
    "taskMentioned" BOOLEAN NOT NULL DEFAULT true,
    "boardTaskCreated" BOOLEAN NOT NULL DEFAULT true,
    "boardTaskStatusChanged" BOOLEAN NOT NULL DEFAULT true,
    "boardTaskAssigned" BOOLEAN NOT NULL DEFAULT false,
    "boardTaskCompleted" BOOLEAN NOT NULL DEFAULT true,
    "boardTaskDeleted" BOOLEAN NOT NULL DEFAULT true,
    "postCommentAdded" BOOLEAN NOT NULL DEFAULT true,
    "postUpdated" BOOLEAN NOT NULL DEFAULT true,
    "postResolved" BOOLEAN NOT NULL DEFAULT true,
    "leaveRequestStatusChanged" BOOLEAN NOT NULL DEFAULT true,
    "leaveRequestEdited" BOOLEAN NOT NULL DEFAULT true,
    "leaveRequestManagerAlert" BOOLEAN NOT NULL DEFAULT true,
    "leaveRequestHRAlert" BOOLEAN NOT NULL DEFAULT false,
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pushSubscription" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PostToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PostToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_UserConversations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserConversations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_IssueToLabel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_IssueToLabel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TaskToLabel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskToLabel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MilestoneToLabel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MilestoneToLabel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EpicToLabel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EpicToLabel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_StoryToLabel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StoryToLabel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_NoteToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_NoteToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "Post_workspaceId_idx" ON "Post"("workspaceId");

-- CreateIndex
CREATE INDEX "Post_resolvedAt_idx" ON "Post"("resolvedAt");

-- CreateIndex
CREATE INDEX "Post_resolvedById_idx" ON "Post"("resolvedById");

-- CreateIndex
CREATE INDEX "Post_isPinned_idx" ON "Post"("isPinned");

-- CreateIndex
CREATE INDEX "Post_workspaceId_isPinned_idx" ON "Post"("workspaceId", "isPinned");

-- CreateIndex
CREATE INDEX "Post_pinnedBy_idx" ON "Post"("pinnedBy");

-- CreateIndex
CREATE INDEX "PostAction_postId_idx" ON "PostAction"("postId");

-- CreateIndex
CREATE INDEX "PostAction_userId_idx" ON "PostAction"("userId");

-- CreateIndex
CREATE INDEX "PostAction_actionType_idx" ON "PostAction"("actionType");

-- CreateIndex
CREATE INDEX "PostAction_createdAt_idx" ON "PostAction"("createdAt");

-- CreateIndex
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_workspaceId_key" ON "Tag"("name", "workspaceId");

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Comment_epicId_idx" ON "Comment"("epicId");

-- CreateIndex
CREATE INDEX "Comment_storyId_idx" ON "Comment"("storyId");

-- CreateIndex
CREATE INDEX "Comment_milestoneId_idx" ON "Comment"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_authorId_postId_type_commentId_key" ON "Reaction"("authorId", "postId", "type", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_postId_userId_key" ON "Mention"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_postId_userId_key" ON "Bookmark"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "CommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "Conversation_createdAt_idx" ON "Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "FeatureRequest_authorId_idx" ON "FeatureRequest"("authorId");

-- CreateIndex
CREATE INDEX "FeatureRequest_workspaceId_idx" ON "FeatureRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "FeatureVote_userId_idx" ON "FeatureVote"("userId");

-- CreateIndex
CREATE INDEX "FeatureVote_featureRequestId_idx" ON "FeatureVote"("featureRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureVote_userId_featureRequestId_key" ON "FeatureVote"("userId", "featureRequestId");

-- CreateIndex
CREATE INDEX "FeatureRequestComment_userId_idx" ON "FeatureRequestComment"("userId");

-- CreateIndex
CREATE INDEX "FeatureRequestComment_featureRequestId_idx" ON "FeatureRequestComment"("featureRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_userId_workspaceId_key" ON "WorkspaceMember"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_email_workspaceId_key" ON "WorkspaceInvitation"("email", "workspaceId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_workspaceId_key" ON "Project"("name", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_workspaceId_key" ON "Project"("slug", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_issuePrefix_workspaceId_key" ON "Project"("issuePrefix", "workspaceId");

-- CreateIndex
CREATE INDEX "TaskBoard_workspaceId_idx" ON "TaskBoard"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskBoard_name_workspaceId_key" ON "TaskBoard"("name", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskBoard_slug_workspaceId_key" ON "TaskBoard"("slug", "workspaceId");

-- CreateIndex
CREATE INDEX "Issue_projectId_idx" ON "Issue"("projectId");

-- CreateIndex
CREATE INDEX "Issue_workspaceId_idx" ON "Issue"("workspaceId");

-- CreateIndex
CREATE INDEX "Issue_assigneeId_idx" ON "Issue"("assigneeId");

-- CreateIndex
CREATE INDEX "Issue_reporterId_idx" ON "Issue"("reporterId");

-- CreateIndex
CREATE INDEX "Issue_parentId_idx" ON "Issue"("parentId");

-- CreateIndex
CREATE INDEX "Issue_columnId_idx" ON "Issue"("columnId");

-- CreateIndex
CREATE INDEX "Issue_issueKey_idx" ON "Issue"("issueKey");

-- CreateIndex
CREATE INDEX "Issue_type_idx" ON "Issue"("type");

-- CreateIndex
CREATE INDEX "Issue_status_idx" ON "Issue"("status");

-- CreateIndex
CREATE INDEX "Issue_statusId_idx" ON "Issue"("statusId");

-- CreateIndex
CREATE INDEX "Issue_postId_idx" ON "Issue"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_issueKey_projectId_key" ON "Issue"("issueKey", "projectId");

-- CreateIndex
CREATE INDEX "View_workspaceId_idx" ON "View"("workspaceId");

-- CreateIndex
CREATE INDEX "View_ownerId_idx" ON "View"("ownerId");

-- CreateIndex
CREATE INDEX "View_visibility_idx" ON "View"("visibility");

-- CreateIndex
CREATE INDEX "View_isDefault_idx" ON "View"("isDefault");

-- CreateIndex
CREATE INDEX "View_isFavorite_idx" ON "View"("isFavorite");

-- CreateIndex
CREATE INDEX "View_slug_idx" ON "View"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "View_slug_workspaceId_key" ON "View"("slug", "workspaceId");

-- CreateIndex
CREATE INDEX "ViewIssuePosition_viewId_columnId_idx" ON "ViewIssuePosition"("viewId", "columnId");

-- CreateIndex
CREATE INDEX "ViewIssuePosition_issueId_idx" ON "ViewIssuePosition"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewIssuePosition_viewId_issueId_columnId_key" ON "ViewIssuePosition"("viewId", "issueId", "columnId");

-- CreateIndex
CREATE INDEX "IssueComment_issueId_idx" ON "IssueComment"("issueId");

-- CreateIndex
CREATE INDEX "IssueComment_authorId_idx" ON "IssueComment"("authorId");

-- CreateIndex
CREATE INDEX "IssueComment_parentId_idx" ON "IssueComment"("parentId");

-- CreateIndex
CREATE INDEX "IssueCommentReaction_commentId_idx" ON "IssueCommentReaction"("commentId");

-- CreateIndex
CREATE INDEX "IssueCommentReaction_authorId_idx" ON "IssueCommentReaction"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueCommentReaction_authorId_commentId_type_key" ON "IssueCommentReaction"("authorId", "commentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "StatusTemplate_name_key" ON "StatusTemplate"("name");

-- CreateIndex
CREATE INDEX "StatusTemplate_category_idx" ON "StatusTemplate"("category");

-- CreateIndex
CREATE INDEX "StatusTemplate_isDefault_idx" ON "StatusTemplate"("isDefault");

-- CreateIndex
CREATE INDEX "StatusTemplate_order_idx" ON "StatusTemplate"("order");

-- CreateIndex
CREATE INDEX "ProjectStatus_projectId_idx" ON "ProjectStatus"("projectId");

-- CreateIndex
CREATE INDEX "ProjectStatus_projectId_order_idx" ON "ProjectStatus"("projectId", "order");

-- CreateIndex
CREATE INDEX "ProjectStatus_templateId_idx" ON "ProjectStatus"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStatus_projectId_name_key" ON "ProjectStatus"("projectId", "name");

-- CreateIndex
CREATE INDEX "TaskColumn_projectId_idx" ON "TaskColumn"("projectId");

-- CreateIndex
CREATE INDEX "TaskColumn_taskBoardId_idx" ON "TaskColumn"("taskBoardId");

-- CreateIndex
CREATE INDEX "TaskColumn_templateId_idx" ON "TaskColumn"("templateId");

-- CreateIndex
CREATE INDEX "TaskColumn_projectId_order_idx" ON "TaskColumn"("projectId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TaskColumn_name_taskBoardId_key" ON "TaskColumn"("name", "taskBoardId");

-- CreateIndex
CREATE INDEX "Task_columnId_idx" ON "Task"("columnId");

-- CreateIndex
CREATE INDEX "Task_taskBoardId_idx" ON "Task"("taskBoardId");

-- CreateIndex
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Task_reporterId_idx" ON "Task"("reporterId");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- CreateIndex
CREATE INDEX "Task_postId_idx" ON "Task"("postId");

-- CreateIndex
CREATE INDEX "Task_issueKey_idx" ON "Task"("issueKey");

-- CreateIndex
CREATE INDEX "Task_storyId_idx" ON "Task"("storyId");

-- CreateIndex
CREATE INDEX "Task_epicId_idx" ON "Task"("epicId");

-- CreateIndex
CREATE INDEX "Task_milestoneId_idx" ON "Task"("milestoneId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "TaskComment_authorId_idx" ON "TaskComment"("authorId");

-- CreateIndex
CREATE INDEX "TaskComment_parentId_idx" ON "TaskComment"("parentId");

-- CreateIndex
CREATE INDEX "TaskCommentReaction_taskCommentId_idx" ON "TaskCommentReaction"("taskCommentId");

-- CreateIndex
CREATE INDEX "TaskCommentReaction_authorId_idx" ON "TaskCommentReaction"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCommentReaction_authorId_taskCommentId_type_key" ON "TaskCommentReaction"("authorId", "taskCommentId", "type");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "TaskAttachment_uploaderId_idx" ON "TaskAttachment"("uploaderId");

-- CreateIndex
CREATE INDEX "TaskLabel_workspaceId_idx" ON "TaskLabel"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLabel_name_workspaceId_key" ON "TaskLabel"("name", "workspaceId");

-- CreateIndex
CREATE INDEX "BoardItemActivity_itemId_itemType_idx" ON "BoardItemActivity"("itemId", "itemType");

-- CreateIndex
CREATE INDEX "BoardItemActivity_taskId_idx" ON "BoardItemActivity"("taskId");

-- CreateIndex
CREATE INDEX "BoardItemActivity_userId_idx" ON "BoardItemActivity"("userId");

-- CreateIndex
CREATE INDEX "BoardItemActivity_workspaceId_idx" ON "BoardItemActivity"("workspaceId");

-- CreateIndex
CREATE INDEX "BoardItemActivity_boardId_idx" ON "BoardItemActivity"("boardId");

-- CreateIndex
CREATE INDEX "BoardItemActivity_createdAt_idx" ON "BoardItemActivity"("createdAt");

-- CreateIndex
CREATE INDEX "BoardItemActivity_action_idx" ON "BoardItemActivity"("action");

-- CreateIndex
CREATE INDEX "Milestone_workspaceId_idx" ON "Milestone"("workspaceId");

-- CreateIndex
CREATE INDEX "Milestone_taskBoardId_idx" ON "Milestone"("taskBoardId");

-- CreateIndex
CREATE INDEX "Milestone_columnId_idx" ON "Milestone"("columnId");

-- CreateIndex
CREATE INDEX "Milestone_issueKey_idx" ON "Milestone"("issueKey");

-- CreateIndex
CREATE INDEX "Milestone_assigneeId_idx" ON "Milestone"("assigneeId");

-- CreateIndex
CREATE INDEX "Milestone_reporterId_idx" ON "Milestone"("reporterId");

-- CreateIndex
CREATE INDEX "Epic_workspaceId_idx" ON "Epic"("workspaceId");

-- CreateIndex
CREATE INDEX "Epic_taskBoardId_idx" ON "Epic"("taskBoardId");

-- CreateIndex
CREATE INDEX "Epic_milestoneId_idx" ON "Epic"("milestoneId");

-- CreateIndex
CREATE INDEX "Epic_issueKey_idx" ON "Epic"("issueKey");

-- CreateIndex
CREATE INDEX "Epic_columnId_idx" ON "Epic"("columnId");

-- CreateIndex
CREATE INDEX "Epic_assigneeId_idx" ON "Epic"("assigneeId");

-- CreateIndex
CREATE INDEX "Epic_reporterId_idx" ON "Epic"("reporterId");

-- CreateIndex
CREATE INDEX "Story_workspaceId_idx" ON "Story"("workspaceId");

-- CreateIndex
CREATE INDEX "Story_taskBoardId_idx" ON "Story"("taskBoardId");

-- CreateIndex
CREATE INDEX "Story_epicId_idx" ON "Story"("epicId");

-- CreateIndex
CREATE INDEX "Story_issueKey_idx" ON "Story"("issueKey");

-- CreateIndex
CREATE INDEX "Story_columnId_idx" ON "Story"("columnId");

-- CreateIndex
CREATE INDEX "Story_assigneeId_idx" ON "Story"("assigneeId");

-- CreateIndex
CREATE INDEX "Story_reporterId_idx" ON "Story"("reporterId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_postId_idx" ON "Notification"("postId");

-- CreateIndex
CREATE INDEX "Notification_commentId_idx" ON "Notification"("commentId");

-- CreateIndex
CREATE INDEX "Notification_taskCommentId_idx" ON "Notification"("taskCommentId");

-- CreateIndex
CREATE INDEX "Notification_taskId_idx" ON "Notification"("taskId");

-- CreateIndex
CREATE INDEX "Notification_featureRequestId_idx" ON "Notification"("featureRequestId");

-- CreateIndex
CREATE INDEX "Notification_epicId_idx" ON "Notification"("epicId");

-- CreateIndex
CREATE INDEX "Notification_storyId_idx" ON "Notification"("storyId");

-- CreateIndex
CREATE INDEX "Notification_milestoneId_idx" ON "Notification"("milestoneId");

-- CreateIndex
CREATE INDEX "Notification_leaveRequestId_idx" ON "Notification"("leaveRequestId");

-- CreateIndex
CREATE INDEX "UserEvent_userId_idx" ON "UserEvent"("userId");

-- CreateIndex
CREATE INDEX "UserEvent_taskId_idx" ON "UserEvent"("taskId");

-- CreateIndex
CREATE INDEX "UserEvent_eventType_idx" ON "UserEvent"("eventType");

-- CreateIndex
CREATE INDEX "UserEvent_startedAt_idx" ON "UserEvent"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserStatus_userId_key" ON "UserStatus"("userId");

-- CreateIndex
CREATE INDEX "UserStatus_userId_idx" ON "UserStatus"("userId");

-- CreateIndex
CREATE INDEX "UserStatus_currentStatus_idx" ON "UserStatus"("currentStatus");

-- CreateIndex
CREATE INDEX "Note_authorId_idx" ON "Note"("authorId");

-- CreateIndex
CREATE INDEX "Note_workspaceId_idx" ON "Note"("workspaceId");

-- CreateIndex
CREATE INDEX "Note_createdAt_idx" ON "Note"("createdAt");

-- CreateIndex
CREATE INDEX "Note_isFavorite_idx" ON "Note"("isFavorite");

-- CreateIndex
CREATE INDEX "NoteTag_authorId_idx" ON "NoteTag"("authorId");

-- CreateIndex
CREATE INDEX "NoteTag_workspaceId_idx" ON "NoteTag"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteTag_name_authorId_workspaceId_key" ON "NoteTag"("name", "authorId", "workspaceId");

-- CreateIndex
CREATE INDEX "TaskAssignee_taskId_idx" ON "TaskAssignee"("taskId");

-- CreateIndex
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

-- CreateIndex
CREATE INDEX "TaskAssignee_role_idx" ON "TaskAssignee"("role");

-- CreateIndex
CREATE INDEX "TaskAssignee_status_idx" ON "TaskAssignee"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_userId_key" ON "TaskAssignee"("taskId", "userId");

-- CreateIndex
CREATE INDEX "IssueAssignee_issueId_idx" ON "IssueAssignee"("issueId");

-- CreateIndex
CREATE INDEX "IssueAssignee_userId_idx" ON "IssueAssignee"("userId");

-- CreateIndex
CREATE INDEX "IssueAssignee_role_idx" ON "IssueAssignee"("role");

-- CreateIndex
CREATE INDEX "IssueAssignee_status_idx" ON "IssueAssignee"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IssueAssignee_issueId_userId_key" ON "IssueAssignee"("issueId", "userId");

-- CreateIndex
CREATE INDEX "CustomRole_workspaceId_idx" ON "CustomRole"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_name_workspaceId_key" ON "CustomRole"("name", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_workspaceId_role_permission_key" ON "RolePermission"("workspaceId", "role", "permission");

-- CreateIndex
CREATE INDEX "BoardGenerationJob_workspaceId_idx" ON "BoardGenerationJob"("workspaceId");

-- CreateIndex
CREATE INDEX "BoardGenerationJob_userId_idx" ON "BoardGenerationJob"("userId");

-- CreateIndex
CREATE INDEX "BoardGenerationJob_status_idx" ON "BoardGenerationJob"("status");

-- CreateIndex
CREATE INDEX "TaskFollower_taskId_idx" ON "TaskFollower"("taskId");

-- CreateIndex
CREATE INDEX "TaskFollower_userId_idx" ON "TaskFollower"("userId");

-- CreateIndex
CREATE INDEX "TaskFollower_createdAt_idx" ON "TaskFollower"("createdAt");

-- CreateIndex
CREATE INDEX "TaskFollower_taskId_createdAt_idx" ON "TaskFollower"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskFollower_taskId_userId_key" ON "TaskFollower"("taskId", "userId");

-- CreateIndex
CREATE INDEX "PostFollower_postId_idx" ON "PostFollower"("postId");

-- CreateIndex
CREATE INDEX "PostFollower_userId_idx" ON "PostFollower"("userId");

-- CreateIndex
CREATE INDEX "PostFollower_createdAt_idx" ON "PostFollower"("createdAt");

-- CreateIndex
CREATE INDEX "PostFollower_postId_createdAt_idx" ON "PostFollower"("postId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostFollower_postId_userId_key" ON "PostFollower"("postId", "userId");

-- CreateIndex
CREATE INDEX "BoardFollower_boardId_idx" ON "BoardFollower"("boardId");

-- CreateIndex
CREATE INDEX "BoardFollower_userId_idx" ON "BoardFollower"("userId");

-- CreateIndex
CREATE INDEX "BoardFollower_createdAt_idx" ON "BoardFollower"("createdAt");

-- CreateIndex
CREATE INDEX "BoardFollower_boardId_createdAt_idx" ON "BoardFollower"("boardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BoardFollower_boardId_userId_key" ON "BoardFollower"("boardId", "userId");

-- CreateIndex
CREATE INDEX "IssueFollower_issueId_idx" ON "IssueFollower"("issueId");

-- CreateIndex
CREATE INDEX "IssueFollower_userId_idx" ON "IssueFollower"("userId");

-- CreateIndex
CREATE INDEX "IssueFollower_createdAt_idx" ON "IssueFollower"("createdAt");

-- CreateIndex
CREATE INDEX "IssueFollower_issueId_createdAt_idx" ON "IssueFollower"("issueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IssueFollower_issueId_userId_key" ON "IssueFollower"("issueId", "userId");

-- CreateIndex
CREATE INDEX "ViewFollower_viewId_idx" ON "ViewFollower"("viewId");

-- CreateIndex
CREATE INDEX "ViewFollower_userId_idx" ON "ViewFollower"("userId");

-- CreateIndex
CREATE INDEX "ViewFollower_createdAt_idx" ON "ViewFollower"("createdAt");

-- CreateIndex
CREATE INDEX "ViewFollower_viewId_createdAt_idx" ON "ViewFollower"("viewId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ViewFollower_viewId_userId_key" ON "ViewFollower"("viewId", "userId");

-- CreateIndex
CREATE INDEX "task_relations_taskId_idx" ON "task_relations"("taskId");

-- CreateIndex
CREATE INDEX "task_relations_relatedItemId_relatedItemType_idx" ON "task_relations"("relatedItemId", "relatedItemType");

-- CreateIndex
CREATE UNIQUE INDEX "task_relations_taskId_relatedItemId_relatedItemType_key" ON "task_relations"("taskId", "relatedItemId", "relatedItemType");

-- CreateIndex
CREATE INDEX "issue_relations_sourceIssueId_idx" ON "issue_relations"("sourceIssueId");

-- CreateIndex
CREATE INDEX "issue_relations_targetIssueId_idx" ON "issue_relations"("targetIssueId");

-- CreateIndex
CREATE INDEX "issue_relations_relationType_idx" ON "issue_relations"("relationType");

-- CreateIndex
CREATE INDEX "issue_relations_sourceIssueId_relationType_idx" ON "issue_relations"("sourceIssueId", "relationType");

-- CreateIndex
CREATE INDEX "issue_relations_targetIssueId_relationType_idx" ON "issue_relations"("targetIssueId", "relationType");

-- CreateIndex
CREATE UNIQUE INDEX "issue_relations_sourceIssueId_targetIssueId_relationType_key" ON "issue_relations"("sourceIssueId", "targetIssueId", "relationType");

-- CreateIndex
CREATE INDEX "leave_requests_userId_idx" ON "leave_requests"("userId");

-- CreateIndex
CREATE INDEX "leave_requests_policyId_idx" ON "leave_requests"("policyId");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_requests_startDate_idx" ON "leave_requests"("startDate");

-- CreateIndex
CREATE INDEX "leave_requests_endDate_idx" ON "leave_requests"("endDate");

-- CreateIndex
CREATE INDEX "leave_requests_duration_idx" ON "leave_requests"("duration");

-- CreateIndex
CREATE INDEX "leave_policies_workspaceId_idx" ON "leave_policies"("workspaceId");

-- CreateIndex
CREATE INDEX "leave_policies_name_idx" ON "leave_policies"("name");

-- CreateIndex
CREATE INDEX "leave_policies_group_idx" ON "leave_policies"("group");

-- CreateIndex
CREATE INDEX "leave_policies_isPaid_idx" ON "leave_policies"("isPaid");

-- CreateIndex
CREATE INDEX "leave_policies_trackIn_idx" ON "leave_policies"("trackIn");

-- CreateIndex
CREATE INDEX "leave_policies_isHidden_idx" ON "leave_policies"("isHidden");

-- CreateIndex
CREATE INDEX "leave_policies_exportMode_idx" ON "leave_policies"("exportMode");

-- CreateIndex
CREATE INDEX "leave_balances_userId_idx" ON "leave_balances"("userId");

-- CreateIndex
CREATE INDEX "leave_balances_policyId_idx" ON "leave_balances"("policyId");

-- CreateIndex
CREATE INDEX "leave_balances_year_idx" ON "leave_balances"("year");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

-- CreateIndex
CREATE INDEX "_PostToTag_B_index" ON "_PostToTag"("B");

-- CreateIndex
CREATE INDEX "_UserConversations_B_index" ON "_UserConversations"("B");

-- CreateIndex
CREATE INDEX "_IssueToLabel_B_index" ON "_IssueToLabel"("B");

-- CreateIndex
CREATE INDEX "_TaskToLabel_B_index" ON "_TaskToLabel"("B");

-- CreateIndex
CREATE INDEX "_MilestoneToLabel_B_index" ON "_MilestoneToLabel"("B");

-- CreateIndex
CREATE INDEX "_EpicToLabel_B_index" ON "_EpicToLabel"("B");

-- CreateIndex
CREATE INDEX "_StoryToLabel_B_index" ON "_StoryToLabel"("B");

-- CreateIndex
CREATE INDEX "_NoteToTag_B_index" ON "_NoteToTag"("B");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_pinnedBy_fkey" FOREIGN KEY ("pinnedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAction" ADD CONSTRAINT "PostAction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAction" ADD CONSTRAINT "PostAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureVote" ADD CONSTRAINT "FeatureVote_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "FeatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureVote" ADD CONSTRAINT "FeatureVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequestComment" ADD CONSTRAINT "FeatureRequestComment_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "FeatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequestComment" ADD CONSTRAINT "FeatureRequestComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBoard" ADD CONSTRAINT "TaskBoard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ProjectStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewIssuePosition" ADD CONSTRAINT "ViewIssuePosition_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewIssuePosition" ADD CONSTRAINT "ViewIssuePosition_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "IssueComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueCommentReaction" ADD CONSTRAINT "IssueCommentReaction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueCommentReaction" ADD CONSTRAINT "IssueCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "IssueComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatus" ADD CONSTRAINT "ProjectStatus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatus" ADD CONSTRAINT "ProjectStatus_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StatusTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskColumn" ADD CONSTRAINT "TaskColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskColumn" ADD CONSTRAINT "TaskColumn_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StatusTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskColumn" ADD CONSTRAINT "TaskColumn_taskBoardId_fkey" FOREIGN KEY ("taskBoardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_taskBoardId_fkey" FOREIGN KEY ("taskBoardId") REFERENCES "TaskBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_taskCommentId_fkey" FOREIGN KEY ("taskCommentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardItemActivity" ADD CONSTRAINT "BoardItemActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardItemActivity" ADD CONSTRAINT "BoardItemActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardItemActivity" ADD CONSTRAINT "BoardItemActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_taskBoardId_fkey" FOREIGN KEY ("taskBoardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_taskBoardId_fkey" FOREIGN KEY ("taskBoardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_taskBoardId_fkey" FOREIGN KEY ("taskBoardId") REFERENCES "TaskBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "FeatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskCommentId_fkey" FOREIGN KEY ("taskCommentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStatus" ADD CONSTRAINT "UserStatus_currentTaskId_fkey" FOREIGN KEY ("currentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStatus" ADD CONSTRAINT "UserStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAssignee" ADD CONSTRAINT "IssueAssignee_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAssignee" ADD CONSTRAINT "IssueAssignee_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAssignee" ADD CONSTRAINT "IssueAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardGenerationJob" ADD CONSTRAINT "BoardGenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardGenerationJob" ADD CONSTRAINT "BoardGenerationJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostFollower" ADD CONSTRAINT "PostFollower_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostFollower" ADD CONSTRAINT "PostFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardFollower" ADD CONSTRAINT "BoardFollower_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardFollower" ADD CONSTRAINT "BoardFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueFollower" ADD CONSTRAINT "IssueFollower_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueFollower" ADD CONSTRAINT "IssueFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewFollower" ADD CONSTRAINT "ViewFollower_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewFollower" ADD CONSTRAINT "ViewFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_sourceIssueId_fkey" FOREIGN KEY ("sourceIssueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_targetIssueId_fkey" FOREIGN KEY ("targetIssueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "leave_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "leave_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreferences" ADD CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserConversations" ADD CONSTRAINT "_UserConversations_A_fkey" FOREIGN KEY ("A") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserConversations" ADD CONSTRAINT "_UserConversations_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssueToLabel" ADD CONSTRAINT "_IssueToLabel_A_fkey" FOREIGN KEY ("A") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssueToLabel" ADD CONSTRAINT "_IssueToLabel_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskToLabel" ADD CONSTRAINT "_TaskToLabel_A_fkey" FOREIGN KEY ("A") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskToLabel" ADD CONSTRAINT "_TaskToLabel_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MilestoneToLabel" ADD CONSTRAINT "_MilestoneToLabel_A_fkey" FOREIGN KEY ("A") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MilestoneToLabel" ADD CONSTRAINT "_MilestoneToLabel_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EpicToLabel" ADD CONSTRAINT "_EpicToLabel_A_fkey" FOREIGN KEY ("A") REFERENCES "Epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EpicToLabel" ADD CONSTRAINT "_EpicToLabel_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoryToLabel" ADD CONSTRAINT "_StoryToLabel_A_fkey" FOREIGN KEY ("A") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoryToLabel" ADD CONSTRAINT "_StoryToLabel_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NoteToTag" ADD CONSTRAINT "_NoteToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NoteToTag" ADD CONSTRAINT "_NoteToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "NoteTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
