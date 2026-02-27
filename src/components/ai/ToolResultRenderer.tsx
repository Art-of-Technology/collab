"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Folder,
  Tag,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import {
  IssueCard,
  IssueList,
  UserWorkloadList,
  DynamicViewCard,
  type IssueData,
  type DynamicViewData,
} from "./InteractiveElements";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ToolResultRendererProps {
  toolName: string;
  content: string;
  isError?: boolean;
  toolUseId?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function tryParseJSON(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Normalize an issue object from MCP response into IssueData */
function normalizeIssue(raw: Record<string, unknown>): IssueData {
  return {
    key: (raw.key || raw.identifier || raw.issueKey || "") as string,
    title: (raw.title || raw.name || raw.summary || "") as string,
    status: (raw.status || raw.state || "") as string,
    priority: (raw.priority || "") as string,
    type: (raw.type || raw.issueType || "") as string,
    assignee: (raw.assignee || raw.assigneeName || "") as string,
    project: (raw.project || raw.projectName || "") as string,
  };
}

// ─── Sub-renderers ──────────────────────────────────────────────────────────

function ErrorResult({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
      <div className="text-sm text-red-300/90 leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}

function SuccessMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
      <div className="text-sm text-emerald-300/90 leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}

function LabelList({ labels }: { labels: Array<Record<string, unknown>> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label, i) => {
        const name = (label.name || label.label || `Label ${i + 1}`) as string;
        const color = (label.color || "") as string;
        return (
          <Badge
            key={`${name}-${i}`}
            className="h-5 px-2 text-[11px] font-medium leading-none border-0 rounded-md gap-1.5"
            style={{
              backgroundColor: color ? `${color}20` : undefined,
              color: color || undefined,
            }}
          >
            {color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            {!color && <Tag className="w-3 h-3 shrink-0 text-collab-500" />}
            {name}
          </Badge>
        );
      })}
    </div>
  );
}

function ProjectCard({ project }: { project: Record<string, unknown> }) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const name = (project.name || "Untitled Project") as string;
  const prefix = (project.prefix || project.key || "") as string;
  const description = (project.description || "") as string;
  const issueCount = project.issueCount as number | undefined;

  const handleClick = () => {
    if (currentWorkspace?.slug && (project.id || prefix)) {
      router.push(
        `/${currentWorkspace.slug}/projects/${prefix || project.id}`
      );
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left p-3 rounded-xl",
        "bg-collab-800 border border-collab-700",
        "hover:bg-collab-700 hover:border-collab-600",
        "transition-all cursor-pointer group"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-collab-900 border border-collab-700">
          <Folder className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-collab-50 truncate group-hover:text-white transition-colors">
              {name}
            </span>
            {prefix && (
              <Badge className="h-4 px-1.5 text-[10px] font-mono leading-none border-0 rounded-sm bg-collab-700 text-collab-400">
                {prefix}
              </Badge>
            )}
          </div>
          {description && (
            <p className="text-xs text-collab-500 truncate">{description}</p>
          )}
          {issueCount !== undefined && (
            <span className="text-[11px] text-collab-500 mt-1 block">
              {issueCount} issue{issueCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ProjectList({
  projects,
}: {
  projects: Array<Record<string, unknown>>;
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-collab-500 uppercase tracking-wider px-1">
        {projects.length} Project{projects.length !== 1 ? "s" : ""}
      </span>
      <div className="space-y-2">
        {projects.map((project, i) => (
          <motion.div
            key={(project.id as string) || `proj-${i}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.15 }}
          >
            <ProjectCard project={project} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function MemberCard({ member }: { member: Record<string, unknown> }) {
  const name = (member.name || member.displayName || "Unknown") as string;
  const email = (member.email || "") as string;
  const role = (member.role || "") as string;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-collab-800 border border-collab-700">
      <UserAvatar
        user={{ name }}
        size="lg"
        className="h-9 w-9 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-collab-50">{name}</div>
        {email && <div className="text-xs text-collab-500">{email}</div>}
      </div>
      {role && (
        <Badge className="h-5 px-2 text-[10px] font-medium leading-none border-0 rounded-md bg-collab-700 text-collab-400 capitalize">
          {role}
        </Badge>
      )}
    </div>
  );
}

function MemberList({
  members,
}: {
  members: Array<Record<string, unknown>>;
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-collab-500 uppercase tracking-wider px-1">
        {members.length} Member{members.length !== 1 ? "s" : ""}
      </span>
      <div className="space-y-1.5">
        {members.map((member, i) => (
          <MemberCard
            key={(member.id as string) || `member-${i}`}
            member={member}
          />
        ))}
      </div>
    </div>
  );
}

function ViewCard({ view }: { view: Record<string, unknown> }) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const name = (view.name || "Untitled View") as string;
  const displayType = (
    view.displayType ||
    view.type ||
    "LIST"
  ) as string;

  const handleClick = () => {
    if (currentWorkspace?.slug && view.id) {
      router.push(`/${currentWorkspace.slug}/views/${(view.slug as string) || (view.id as string)}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left p-3 rounded-xl",
        "bg-collab-800 border border-collab-700",
        "hover:bg-collab-700 hover:border-collab-600",
        "transition-all cursor-pointer group"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-collab-900 border border-collab-700">
          <Eye className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-collab-50 group-hover:text-white transition-colors">
            {name}
          </span>
          <Badge className="ml-2 h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm bg-collab-700 text-collab-400 capitalize">
            {displayType.toLowerCase()}
          </Badge>
        </div>
      </div>
    </button>
  );
}

function ViewList({ views }: { views: Array<Record<string, unknown>> }) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-collab-500 uppercase tracking-wider px-1">
        {views.length} View{views.length !== 1 ? "s" : ""}
      </span>
      <div className="space-y-2">
        {views.map((view, i) => (
          <ViewCard key={(view.id as string) || `view-${i}`} view={view} />
        ))}
      </div>
    </div>
  );
}

function GenericResult({
  toolName,
  content,
}: {
  toolName: string;
  content: string;
}) {
  const displayName = toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="rounded-lg bg-collab-800 border border-collab-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-collab-700">
        <FileText className="w-3.5 h-3.5 text-collab-500" />
        <span className="text-[10px] font-medium text-collab-500 uppercase tracking-wider">
          {displayName}
        </span>
      </div>
      <pre className="p-3 text-xs text-collab-400 font-mono leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-collab-600 scrollbar-track-transparent whitespace-pre-wrap break-words">
        {content}
      </pre>
    </div>
  );
}

// ─── Main Renderer ──────────────────────────────────────────────────────────

export default function ToolResultRenderer({
  toolName,
  content,
  isError,
}: ToolResultRendererProps) {
  const rendered = useMemo(() => {
    // Error results
    if (isError) {
      return <ErrorResult content={content} />;
    }

    const parsed = tryParseJSON(content);

    // Issue list tools
    if (
      /list_issues|search_issues|get_project_issues|filter_issues/i.test(
        toolName
      )
    ) {
      if (Array.isArray(parsed)) {
        const issues = parsed.map((item) =>
          normalizeIssue(item as Record<string, unknown>)
        );
        const valid = issues.filter((i) => i.key || i.title);
        if (valid.length > 0) return <IssueList issues={valid} />;
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.issues)) {
          const issues = (
            obj.issues as Array<Record<string, unknown>>
          ).map(normalizeIssue);
          if (issues.length > 0) return <IssueList issues={issues} />;
        }
      }
    }

    // Single issue tools
    if (/get_issue|create_issue|update_issue/i.test(toolName)) {
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const issue = normalizeIssue(parsed as Record<string, unknown>);
        if (issue.key || issue.title) {
          return <IssueCard data={issue} />;
        }
      }
      if (
        typeof content === "string" &&
        /created|updated|success/i.test(content)
      ) {
        return <SuccessMessage content={content} />;
      }
    }

    // Project tools
    if (/list_projects|get_projects/i.test(toolName)) {
      if (Array.isArray(parsed)) {
        return (
          <ProjectList
            projects={parsed as Array<Record<string, unknown>>}
          />
        );
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.projects)) {
          return (
            <ProjectList
              projects={obj.projects as Array<Record<string, unknown>>}
            />
          );
        }
      }
    }

    if (/get_project|create_project/i.test(toolName)) {
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return <ProjectCard project={parsed as Record<string, unknown>} />;
      }
    }

    // Label tools
    if (/list_labels|create_label|get_labels/i.test(toolName)) {
      if (Array.isArray(parsed)) {
        return (
          <LabelList labels={parsed as Array<Record<string, unknown>>} />
        );
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.labels)) {
          return (
            <LabelList
              labels={obj.labels as Array<Record<string, unknown>>}
            />
          );
        }
        if (obj.name) {
          return <LabelList labels={[obj]} />;
        }
      }
    }

    // Member tools
    if (
      /list_members|get_member|get_members|get_current_user/i.test(toolName)
    ) {
      if (Array.isArray(parsed)) {
        return (
          <MemberList
            members={parsed as Array<Record<string, unknown>>}
          />
        );
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.members)) {
          return (
            <MemberList
              members={obj.members as Array<Record<string, unknown>>}
            />
          );
        }
        if (obj.name || obj.displayName) {
          return <MemberCard member={obj} />;
        }
      }
    }

    // Build view tool
    if (/build_view/i.test(toolName)) {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'viewUrl' in (parsed as Record<string, unknown>)) {
        return <DynamicViewCard data={parsed as DynamicViewData} />;
      }
    }

    // View tools
    if (/list_views|create_view|get_views/i.test(toolName)) {
      if (Array.isArray(parsed)) {
        return (
          <ViewList views={parsed as Array<Record<string, unknown>>} />
        );
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.views)) {
          return (
            <ViewList
              views={obj.views as Array<Record<string, unknown>>}
            />
          );
        }
        if (obj.name) {
          return <ViewCard view={obj} />;
        }
      }
    }

    // Workload / report tools
    if (/workload|team_report|member_report/i.test(toolName)) {
      if (Array.isArray(parsed)) {
        const users = parsed.filter(
          (u): u is Record<string, unknown> =>
            typeof u === "object" && u !== null && "name" in u
        );
        if (users.length > 0) {
          return (
            <UserWorkloadList
              users={users.map((u) => ({
                id: u.id as string | undefined,
                name: (u.name || "Unknown") as string,
                email: u.email as string | undefined,
                totalActive: (u.totalActive ||
                  u.activeIssues ||
                  0) as number,
                overdue: u.overdue as number | undefined,
                byStatus: u.byStatus as
                  | Record<string, number>
                  | undefined,
                highPriority: u.highPriority as number | undefined,
                completedThisWeek: u.completedThisWeek as
                  | number
                  | undefined,
              }))}
            />
          );
        }
      }
    }

    // Mutation success (create, update, delete, bulk operations)
    if (/create_|update_|delete_|bulk_|assign_|move_/i.test(toolName)) {
      if (typeof content === "string" && content.length < 500) {
        return <SuccessMessage content={content} />;
      }
    }

    // Fallback: generic result display
    return <GenericResult toolName={toolName} content={content} />;
  }, [toolName, content, isError]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="my-1"
    >
      {rendered}
    </motion.div>
  );
}
