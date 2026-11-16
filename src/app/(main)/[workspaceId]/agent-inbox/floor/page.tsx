import { redirect } from "next/navigation";

// The floor is a tab of the Agents page now; its old address leads there.
export default async function OldAgentFloorPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  redirect(`/${encodeURIComponent((await params).workspaceId)}/agents/floor`);
}
