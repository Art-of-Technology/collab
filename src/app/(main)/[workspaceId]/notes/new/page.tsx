import { redirect } from "next/navigation";

// A Note is made in Context, with "New". An old link that named a project opens that project there.
export default async function NewNotePage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ projectId?: string | string[] }>;
}) {
  const { projectId } = await searchParams;
  const query = typeof projectId === "string" ? `?${new URLSearchParams({ project: projectId })}` : "";
  redirect(`/${(await params).workspaceId}/context${query}`);
}
