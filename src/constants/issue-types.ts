import { 
  CheckSquare, 
  Circle, 
  GitBranch, 
  Bug, 
  Flag, 
  Square 
} from "lucide-react";

export type IssueType = "TASK" | "EPIC" | "STORY" | "BUG" | "MILESTONE" | "SUBTASK";

export const ISSUE_TYPE_CONFIG = {
  TASK: {
    label: "Task",
    icon: CheckSquare,
    color: "#6366f1",
    description: "A task that needs to be done"
  },
  STORY: {
    label: "Story",
    icon: Circle,
    color: "#22c55e",
    description: "A user story or feature"
  },
  EPIC: {
    label: "Epic",
    icon: GitBranch,
    color: "#a855f7",
    description: "A large body of work"
  },
  BUG: {
    label: "Bug",
    icon: Bug,
    color: "#ef4444",
    description: "A problem that needs fixing"
  },
  MILESTONE: {
    label: "Milestone",
    icon: Flag,
    color: "#f59e0b",
    description: "A significant point in development"
  },
  SUBTASK: {
    label: "Sub-task",
    icon: Square,
    color: "#6b7280",
    description: "A smaller task within a larger issue"
  }
} as const;

export const ISSUE_TYPE_OPTIONS: IssueType[] = ["TASK", "STORY", "EPIC", "BUG", "MILESTONE", "SUBTASK"];
