import { extractMentionUserIds } from "@/utils/mentions";
import { NotificationService, NotificationType } from "@/lib/notification-service";

/**
 * Tells the people a comment on an issue mentions, for every route a person's comment comes in through. The comment
 * is saved by then, so a failure is logged and never thrown.
 */
export async function notifyCommentMentions(
  author: { id: string; name?: string | null; email?: string | null },
  issue: { id: string; issueKey?: string | null },
  mentionSource: string
) {
  try {
    const mentionedUserIds = Array.from(new Set(extractMentionUserIds(mentionSource || "")));
    const recipients = mentionedUserIds.filter((id) => id && id !== author.id);

    if (recipients.length > 0) {
      const actorDisplayName = author.name || author.email || "Someone";
      const issueReference = issue.issueKey
        ? `#[${issue.issueKey}](${issue.id})`
        : `issue ${issue.id}`;

      const notificationContent = `@[${actorDisplayName}](${author.id}) mentioned you in a comment on ${issueReference}`;
      const canNotify = typeof NotificationService?.notifyUsers === "function";
      const notificationType = NotificationType?.ISSUE_MENTION;
      const notificationTypeSupported = typeof notificationType === "string"
        ? Object.values(NotificationType).includes(notificationType)
        : false;

      if (!canNotify || !notificationTypeSupported) {
        console.error("[ISSUE_COMMENTS_POST_NOTIFY] Notification service unavailable or unsupported type", {
          hasService: canNotify,
          hasType: notificationTypeSupported,
        });
      } else {
        await NotificationService.notifyUsers(
          recipients,
          notificationType,
          notificationContent,
          author.id,
          { issueId: issue.id }
        );
      }
    }
  } catch (notificationError) {
    console.error("[ISSUE_COMMENTS_POST_NOTIFY]", notificationError);
  }
}
