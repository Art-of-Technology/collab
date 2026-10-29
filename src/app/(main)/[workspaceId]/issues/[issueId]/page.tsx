import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
import { findIssueByIdOrKey, getStandardIssueInclude } from "@/lib/issue-finder";
import { IssuePageClient } from "./IssuePageClient";

interface IssuePageProps {
  params: Promise<{ workspaceId: string; issueId: string }>;
  searchParams: Promise<{ view?: string; viewName?: string }>;
}

// Server-rendered: the issue arrives with the HTML instead of after a session → workspaces → issue client waterfall.
export default async function IssuePage({ params, searchParams }: IssuePageProps) {
  const [{ workspaceId: workspaceParam, issueId }, query] = await Promise.all([params, searchParams]);

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await prisma.workspace.findFirst({
    where: postWorkspaceAccessWhere(user.id, workspaceParam),
    select: { id: true },
  });
  if (!workspace) redirect("/welcome");

  const issue = await findIssueByIdOrKey(issueId, {
    workspaceId: workspace.id,
    userId: user.id,
    include: getStandardIssueInclude(user.id),
  });
  if (!issue) notFound();

  return (
    <IssuePageClient
      issueId={issueId}
      workspaceId={workspace.id}
      // Same JSON shape the /api/issues/:id route returns, so the client cache and the modal agree.
      initialIssue={JSON.parse(JSON.stringify(issue))}
      viewSlug={query.view ?? null}
      viewName={query.viewName ?? null}
    />
  );
}
