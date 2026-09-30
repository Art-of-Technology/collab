import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LINK_COOKIE, maestroEnabled, readIntent } from "@/lib/maestro-link";
import LinkMaestro from "@/components/auth/LinkMaestro";

export const dynamic = "force-dynamic";

export default async function LinkMaestroPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!maestroEnabled()) return <p>Maestro linking is unavailable.</p>;
  const failed = (await searchParams).error === "AccessDenied";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const linked = await prisma.account.findFirst({ where: { userId: user.id, provider: "maestro" }, select: { id: true } });
  const intent = await readIntent((await cookies()).get(LINK_COOKIE)?.value);
  return <main className="mx-auto max-w-md p-8 space-y-6">
    <h1 className="text-2xl font-semibold">Connect Maestro</h1>
    {failed && !linked && <p role="alert">Account linking did not complete. Start again with your existing Google account.</p>}
    {linked ? <p>Maestro is connected to your existing Collab account.</p> : <LinkMaestro googleVerified={intent?.userId === user.id && intent.phase === "maestro" && !intent.state} />}
  </main>;
}
