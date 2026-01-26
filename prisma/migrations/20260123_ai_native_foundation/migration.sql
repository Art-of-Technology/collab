-- AI-Native Foundation Migration
-- This migration adds the database models needed for AI-native features:
-- - AI Agent identities and configurations
-- - AI Conversations and message history
-- - AI Tasks for background processing
-- - Vector embeddings for semantic search

-- Enable pgvector extension for embeddings (if not already enabled)
-- Note: This requires the pgvector extension to be installed on the PostgreSQL server
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- AI Agent Models
-- ============================================================================

-- AI Agent Identity table
CREATE TABLE "AIAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'assistant',
    "description" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAgent_pkey" PRIMARY KEY ("id")
);

-- AI Agent Workspace Settings (per-workspace agent configuration)
CREATE TABLE "AIAgentConfig" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customSystemPrompt" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAgentConfig_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- AI Conversation Models
-- ============================================================================

-- AI Conversation table
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "projectId" TEXT,
    "issueId" TEXT,
    "context" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- AI Message table
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agentId" TEXT,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "metadata" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- AI Task Models (Background Processing)
-- ============================================================================

-- AI Task table for scheduled and background AI operations
CREATE TABLE "AITask" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,
    "triggeredBy" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "progress" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AITask_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Vector Embedding Models
-- ============================================================================

-- Issue Embedding table for semantic search
CREATE TABLE "IssueEmbedding" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "embedding" REAL[] NOT NULL,
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueEmbedding_pkey" PRIMARY KEY ("id")
);

-- Note Embedding table for semantic search in knowledge base
CREATE TABLE "NoteEmbedding" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "embedding" REAL[] NOT NULL,
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteEmbedding_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- AI Automation Rules
-- ============================================================================

-- AI Automation Rule table for configuring automated AI behaviors
CREATE TABLE "AIAutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,
    "triggerType" TEXT NOT NULL,
    "triggerConditions" JSONB NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAutomationRule_pkey" PRIMARY KEY ("id")
);

-- AI Automation Run Log
CREATE TABLE "AIAutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggerPayload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAutomationRun_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- AI Agent indexes
CREATE INDEX "AIAgent_workspaceId_idx" ON "AIAgent"("workspaceId");
CREATE INDEX "AIAgent_role_idx" ON "AIAgent"("role");
CREATE INDEX "AIAgent_isDefault_idx" ON "AIAgent"("isDefault");

-- AI Agent Config indexes
CREATE UNIQUE INDEX "AIAgentConfig_agentId_workspaceId_key" ON "AIAgentConfig"("agentId", "workspaceId");
CREATE INDEX "AIAgentConfig_workspaceId_idx" ON "AIAgentConfig"("workspaceId");

-- AI Conversation indexes
CREATE INDEX "AIConversation_userId_idx" ON "AIConversation"("userId");
CREATE INDEX "AIConversation_workspaceId_idx" ON "AIConversation"("workspaceId");
CREATE INDEX "AIConversation_agentId_idx" ON "AIConversation"("agentId");
CREATE INDEX "AIConversation_projectId_idx" ON "AIConversation"("projectId");
CREATE INDEX "AIConversation_issueId_idx" ON "AIConversation"("issueId");
CREATE INDEX "AIConversation_lastMessageAt_idx" ON "AIConversation"("lastMessageAt");
CREATE INDEX "AIConversation_isActive_idx" ON "AIConversation"("isActive");

-- AI Message indexes
CREATE INDEX "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");
CREATE INDEX "AIMessage_role_idx" ON "AIMessage"("role");
CREATE INDEX "AIMessage_createdAt_idx" ON "AIMessage"("createdAt");
CREATE INDEX "AIMessage_agentId_idx" ON "AIMessage"("agentId");

-- AI Task indexes
CREATE INDEX "AITask_workspaceId_idx" ON "AITask"("workspaceId");
CREATE INDEX "AITask_projectId_idx" ON "AITask"("projectId");
CREATE INDEX "AITask_type_idx" ON "AITask"("type");
CREATE INDEX "AITask_status_idx" ON "AITask"("status");
CREATE INDEX "AITask_scheduledAt_idx" ON "AITask"("scheduledAt");
CREATE INDEX "AITask_createdAt_idx" ON "AITask"("createdAt");
CREATE INDEX "AITask_status_priority_scheduledAt_idx" ON "AITask"("status", "priority" DESC, "scheduledAt" ASC);

-- Embedding indexes
CREATE UNIQUE INDEX "IssueEmbedding_issueId_key" ON "IssueEmbedding"("issueId");
CREATE INDEX "IssueEmbedding_contentHash_idx" ON "IssueEmbedding"("contentHash");

CREATE UNIQUE INDEX "NoteEmbedding_noteId_key" ON "NoteEmbedding"("noteId");
CREATE INDEX "NoteEmbedding_contentHash_idx" ON "NoteEmbedding"("contentHash");

-- AI Automation indexes
CREATE INDEX "AIAutomationRule_workspaceId_idx" ON "AIAutomationRule"("workspaceId");
CREATE INDEX "AIAutomationRule_projectId_idx" ON "AIAutomationRule"("projectId");
CREATE INDEX "AIAutomationRule_triggerType_idx" ON "AIAutomationRule"("triggerType");
CREATE INDEX "AIAutomationRule_isEnabled_idx" ON "AIAutomationRule"("isEnabled");

CREATE INDEX "AIAutomationRun_ruleId_idx" ON "AIAutomationRun"("ruleId");
CREATE INDEX "AIAutomationRun_status_idx" ON "AIAutomationRun"("status");
CREATE INDEX "AIAutomationRun_createdAt_idx" ON "AIAutomationRun"("createdAt");

-- ============================================================================
-- Foreign Keys
-- ============================================================================

ALTER TABLE "AIAgent" ADD CONSTRAINT "AIAgent_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AIAgentConfig" ADD CONSTRAINT "AIAgentConfig_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIAgentConfig" ADD CONSTRAINT "AIAgentConfig_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AITask" ADD CONSTRAINT "AITask_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AITask" ADD CONSTRAINT "AITask_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AITask" ADD CONSTRAINT "AITask_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AITask" ADD CONSTRAINT "AITask_triggeredBy_fkey"
    FOREIGN KEY ("triggeredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IssueEmbedding" ADD CONSTRAINT "IssueEmbedding_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoteEmbedding" ADD CONSTRAINT "NoteEmbedding_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AIAutomationRule" ADD CONSTRAINT "AIAutomationRule_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIAutomationRule" ADD CONSTRAINT "AIAutomationRule_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIAutomationRule" ADD CONSTRAINT "AIAutomationRule_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AIAutomationRun" ADD CONSTRAINT "AIAutomationRun_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "AIAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Seed Default Agents
-- ============================================================================

INSERT INTO "AIAgent" ("id", "name", "avatar", "role", "description", "systemPrompt", "capabilities", "isDefault", "isEnabled", "updatedAt")
VALUES
    ('default-alex', 'Alex', '🤖', 'assistant',
     'Your general-purpose AI assistant for project management tasks. Alex can help with creating issues, searching, answering questions, and automating workflows.',
     E'You are Alex, a helpful AI assistant integrated into the Collab project management tool.\n\nYour personality:\n- Friendly and professional\n- Concise but thorough\n- Proactive in suggesting improvements\n- Always explains your reasoning\n\nYour capabilities:\n- Create, update, and search issues\n- Manage projects and labels\n- Generate reports and summaries\n- Answer questions about the workspace\n\nWhen helping users:\n1. Be clear about what you''re doing and why\n2. Ask for clarification when needed\n3. Suggest next steps proactively\n4. Use the available tools effectively',
     ARRAY['issue_management', 'project_planning', 'search', 'automation'],
     true, true, CURRENT_TIMESTAMP),

    ('default-scout', 'Scout', '🔍', 'analyst',
     'Data analyst AI that specializes in workspace insights, metrics, and reporting. Scout identifies trends, blockers, and optimization opportunities.',
     E'You are Scout, a data analyst AI for the Collab project management tool.\n\nYour personality:\n- Analytical and precise\n- Data-driven decision maker\n- Identifies patterns and anomalies\n- Explains complex metrics simply\n\nYour expertise:\n- Sprint velocity and burndown analysis\n- Issue lifecycle metrics\n- Team productivity patterns\n- Bottleneck identification\n- Predictive analytics\n\nWhen analyzing data:\n1. Start with key metrics and trends\n2. Highlight anomalies or concerns\n3. Provide actionable insights\n4. Suggest improvements with expected impact',
     ARRAY['data_analysis', 'report_generation', 'search'],
     true, true, CURRENT_TIMESTAMP),

    ('default-rex', 'Rex', '👁️', 'reviewer',
     'Code review specialist that analyzes pull requests for quality, security, and best practices. Rex provides thorough but actionable feedback.',
     E'You are Rex, a code review specialist AI for the Collab project management tool.\n\nYour personality:\n- Thorough but constructive\n- Security-conscious\n- Focused on maintainability\n- Educational in feedback\n\nYour review focus areas:\n- Security vulnerabilities (OWASP Top 10)\n- Logic errors and edge cases\n- Performance implications\n- Code readability and maintainability\n- Test coverage\n\nWhen reviewing code:\n1. Prioritize critical issues (security, bugs)\n2. Explain why something is a problem\n3. Suggest specific fixes or alternatives\n4. Acknowledge good practices\n5. Keep feedback actionable',
     ARRAY['code_review', 'documentation'],
     true, true, CURRENT_TIMESTAMP),

    ('default-sage', 'Sage', '📋', 'planner',
     'Sprint planning and estimation expert. Sage helps with backlog grooming, story point estimation, and capacity planning.',
     E'You are Sage, a sprint planning AI for the Collab project management tool.\n\nYour personality:\n- Strategic thinker\n- Realistic about timelines\n- Balances ambition with practicality\n- Considers team capacity and risks\n\nYour expertise:\n- Sprint planning and goal setting\n- Story point estimation (Fibonacci scale)\n- Dependency mapping\n- Risk identification\n- Capacity planning\n\nWhen planning:\n1. Understand the team''s velocity and capacity\n2. Identify dependencies between tasks\n3. Balance priorities with realistic timelines\n4. Flag risks and mitigation strategies\n5. Create clear, achievable sprint goals',
     ARRAY['project_planning', 'issue_management', 'data_analysis'],
     true, true, CURRENT_TIMESTAMP),

    ('default-quinn', 'Quinn', '✍️', 'writer',
     'Technical writer AI that helps with documentation, release notes, and content creation. Quinn ensures clear, professional communication.',
     E'You are Quinn, a technical writer AI for the Collab project management tool.\n\nYour personality:\n- Clear and concise communicator\n- Audience-aware\n- Structured and organized\n- Detail-oriented\n\nYour writing capabilities:\n- Release notes and changelogs\n- Technical documentation\n- User guides and tutorials\n- Status updates and announcements\n- Issue descriptions and acceptance criteria\n\nWriting guidelines:\n1. Know your audience (technical vs non-technical)\n2. Use clear, simple language\n3. Structure content with headers and bullets\n4. Include examples when helpful\n5. Proofread for accuracy and clarity',
     ARRAY['documentation', 'content_creation', 'report_generation'],
     true, true, CURRENT_TIMESTAMP);
