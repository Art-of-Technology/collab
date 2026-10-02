import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/request-session";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { COLLAB_ORIGIN, LINK_COOKIE, LINK_COOKIE_OPTIONS, LINK_SECONDS, maestroEnabled, sealIntent } from "@/lib/maestro-link";

export async function POST(request: NextRequest) {
  if (!maestroEnabled()) return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  if (request.headers.get("origin") !== COLLAB_ORIGIN) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const google = await prisma.account.findFirst({ where: { userId: session.user.id, provider: "google" }, select: { providerAccountId: true } });
  const linked = await prisma.account.findFirst({ where: { userId: session.user.id, provider: "maestro" }, select: { id: true } });
  if (!google || linked) return NextResponse.json({ error: "Link unavailable" }, { status: 409 });
  const response = NextResponse.json({ provider: "google" });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(LINK_COOKIE, await sealIntent({ userId: session.user.id, googleAccountId: google.providerAccountId, phase: "google", expires: Date.now() + LINK_SECONDS * 1000 }), { ...LINK_COOKIE_OPTIONS, maxAge: LINK_SECONDS });
  return response;
}
