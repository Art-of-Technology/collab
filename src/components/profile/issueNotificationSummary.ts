// What a person's issue notification settings send, as one sentence under the cards.
// The view is declared here, not imported from the server library, so the client bundle stays free of server code.

export type CommentsChoice = "off" | "mentions" | "all";

export interface IssueNotificationChoices {
  mineAssigned: boolean;
  mineReported: boolean;
  mineFollowed: boolean;
  onStatus: boolean;
  onAssigned: boolean;
  onReactions: boolean;
  comments: CommentsChoice;
}

export interface IssueNotificationView extends IssueNotificationChoices {
  slack: {
    /** Already masked by the server; the full address never reaches the browser. */
    address: string | null;
    on: boolean;
    offAt: string | null;
    failedAt: string | null;
  };
}

export const CHOICE_KEYS: (keyof IssueNotificationChoices)[] = [
  "mineAssigned", "mineReported", "mineFollowed", "onStatus", "onAssigned", "onReactions", "comments",
];

export const WHICH_ISSUES_WARNING = "Status changes and “all comments” need at least one box ticked under “Which issues”.";

export function summaryLine(view: IssueNotificationView): { text: string; warn?: string } {
  const issues = [
    view.mineAssigned && "issues assigned to you",
    view.mineReported && "issues you reported",
    view.mineFollowed && "issues you follow",
  ].filter((part): part is string => Boolean(part));
  const events = [
    view.onStatus && "its status changes",
    view.comments === "all" && "someone comments on it",
  ].filter((part): part is string => Boolean(part));
  const warn = events.length > 0 && issues.length === 0 ? WHICH_ISSUES_WARNING : undefined;
  const withWarn = (text: string) => (warn ? { text, warn } : { text });

  if (!view.slack.address) return withWarn("Nothing is sent: no Slack address is saved.");
  if (!view.slack.on) return withWarn("Nothing is sent: Slack is switched off.");

  const anyIssue = [
    view.onAssigned && "an issue is assigned to you",
    view.comments !== "off" && "someone mentions you, on any issue",
    view.onReactions && "someone acks or likes a comment you wrote",
  ].filter((part): part is string => Boolean(part));
  const parts: string[] = [];
  if (anyIssue.length > 0) parts.push(anyIssue.join("; "));
  if (issues.length > 0 && events.length > 0) parts.push(`on ${issues.join(", ")}: ${events.join(", and ")}`);
  if (parts.length === 0) return withWarn("Nothing is sent: Slack is on, but nothing is ticked.");
  return withWarn(`With these settings: Slack gets a message when ${parts.join("; and ")}.`);
}
