import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { noteAccessWhere } from "@/lib/secrets/access";

/**
 * A Note's own address. A Note has no page: it opens in Context, where it is kept. This address stays
 * as the one a Note is linked by (in issues, in search results and in what agents are given), so it
 * finds where the Note is and sends the reader there. A Note the reader may not read is not looked
 * for; Context then says so itself.
 */
export default async function NotePage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const { workspaceId, id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const note = await prisma.note.findFirst({
    where: { AND: [{ id }, noteAccessWhere(user.id)] },
    select: { scope: true, authorId: true, projectId: true, folderId: true },
  });
  // A personal or shared Note is in no level's list: it is in the reader's own list of them.
  const view = note?.folderId ? null
    : note?.scope === "PERSONAL" && note.authorId === user.id ? "personal"
    : note?.scope === "SHARED" ? "shared" : null;
  const query = new URLSearchParams({
    ...(view && { view }),
    ...(!view && note?.projectId && { project: note.projectId }),
    ...(note?.folderId && { folder: note.folderId }),
    note: id,
  });
  redirect(`/${workspaceId}/context?${query}`);
}
