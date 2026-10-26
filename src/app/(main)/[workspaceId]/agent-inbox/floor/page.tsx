import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/request-session";
import { authOptions } from "@/lib/auth";
import { readAgentFloor } from "@/lib/agent-floor";
import { OrganisationFloor } from "@/components/agents/floor/OrganisationFloor";
export const dynamic = "force-dynamic";
export default async function AgentFloorPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { workspaceId } = await params;
  const snapshot = await readAgentFloor(session.user.id, workspaceId);
  if (!snapshot) notFound();
  return <OrganisationFloor initial={snapshot} />;
}
