import NextAuth, { type AuthOptions } from "next-auth";
import { getToken } from "next-auth/jwt";
import { maestroEnabled, safeAuthLogger, readIntent, sealIntent, callbackIntent, guardedMaestroAdapter, LINK_COOKIE, LINK_COOKIE_OPTIONS, LINK_SECONDS, LINK_PATH, COLLAB_ORIGIN, type LinkPermit } from "@/lib/maestro-link";
import { prisma } from "@/lib/prisma";
import { CustomPrismaAdapter } from "@/lib/custom-prisma-adapter";
import { authOptions } from "@/lib/auth-options";
import { NextResponse, type NextRequest } from 'next/server';
import { authMode } from '@/lib/gateway-identity';
import { getGatewaySession } from '@/lib/request-session';

// Per-request state must never be stored in shared authOptions.
async function handler(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  const { nextauth: [action, provider] } = await context.params;
  const hasIntent = request.cookies.has(LINK_COOKIE);
  const intent = await readIntent(request.cookies.get(LINK_COOKIE)?.value);
  const token = hasIntent || provider === "maestro" ? await getToken({ req: request }) : null;
  let permit: LinkPermit | null = null;
  let googleCompleted = false;
  let maestroCompleted = false;
  const deny = () => {
    const response = NextResponse.redirect(new URL(hasIntent ? `${LINK_PATH}?error=AccessDenied` : "/login?error=AccessDenied", COLLAB_ORIGIN));
    response.cookies.set(LINK_COOKIE, "", { ...LINK_COOKIE_OPTIONS, maxAge: 0 });
    return response;
  };
  if (provider === "maestro" && !maestroEnabled()) return deny();
  const linking = hasIntent && (provider === "google" || provider === "maestro");
  if (linking && (!maestroEnabled() || !intent || intent.userId !== token?.sub || intent.phase !== provider)) return deny();
  if (linking && action === "signin" && (request.method !== "POST" || request.headers.get("origin") !== COLLAB_ORIGIN || intent?.state)) return deny();
  if (linking && action === "callback" && !callbackIntent(intent, token?.sub, provider, request.nextUrl.searchParams.get("state"))) return deny();
  const options: AuthOptions = {
    ...authOptions,
    adapter: provider === "maestro" ? guardedMaestroAdapter(prisma, CustomPrismaAdapter(prisma), () => permit) : authOptions.adapter,
    callbacks: {
      ...authOptions.callbacks,
      async signIn(args) {
        try {
          if (provider === "maestro") {
            if (args.account?.provider !== "maestro") return false;
            const subject = args.account.providerAccountId;
            const mapped = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: "maestro", providerAccountId: subject } } });
            if (mapped) return (!token?.sub || mapped.userId === token.sub) && !!await prisma.user.findUnique({ where: { id: mapped.userId }, select: { id: true } });
            if (!callbackIntent(intent, token?.sub, provider, request.nextUrl.searchParams.get("state"))) return false;
            const google = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: intent!.googleAccountId } } });
            if (!google || google.userId !== intent!.userId) return false;
            permit = { userId: intent!.userId, googleAccountId: intent!.googleAccountId, subject, expires: intent!.expires };
            return true;
          }
          if (linking) {
            if (args.account?.provider !== "google" || args.account.providerAccountId !== intent!.googleAccountId) return false;
            const google = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: args.account.providerAccountId } } });
            if (!google || google.userId !== intent!.userId) return false;
          }
          return authOptions.callbacks!.signIn!(args);
        } catch {
          safeAuthLogger.error();
          return false;
        }
      },
      async jwt(args) {
        const result = await authOptions.callbacks!.jwt!(args);
        // Only the completed, verified provider callback supplies account + user.
        if (linking && action === "callback" && args.account && args.user?.id === intent!.userId) {
          if (provider === "google" && args.account.provider === "google") googleCompleted = true;
          if (provider === "maestro" && args.account.provider === "maestro") maestroCompleted = true;
        }
        return result;
      },
    },
  };
  try {
    const response = await NextAuth(options)(request, context);
    if (linking && action === "signin") {
      const destination = response.headers.get("location") || (await response.clone().json().catch(() => null))?.url;
      const state = typeof destination === "string" ? new URL(destination).searchParams.get("state") : null;
      if (!state) return deny();
      response.headers.append("Set-Cookie", `${LINK_COOKIE}=${await sealIntent({ ...intent!, state })}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${LINK_SECONDS}`);
    }
    if (linking && action === "callback") {
      const location = response.headers.get("Location");
      const completed = response.status === 302 && !!location && new URL(location, COLLAB_ORIGIN).origin === COLLAB_ORIGIN && new URL(location, COLLAB_ORIGIN).pathname === LINK_PATH;
      if (googleCompleted && completed) {
        response.headers.append("Set-Cookie", `${LINK_COOKIE}=${await sealIntent({ ...intent!, phase: "maestro", state: undefined })}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${LINK_SECONDS}`);
        response.headers.set("Location", `${COLLAB_ORIGIN}${LINK_PATH}`);
      } else {
        response.headers.append("Set-Cookie", `${LINK_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
        response.headers.set("Location", `${COLLAB_ORIGIN}${LINK_PATH}${maestroCompleted && completed ? "" : "?error=AccessDenied"}`);
      }
    }
    return response;
  } catch {
    safeAuthLogger.error();
    return deny();
  }
}

type Context = { params: Promise<{ nextauth: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  const mode = authMode();
  const { nextauth } = await context.params;
  if (nextauth.length === 1 && nextauth[0] === 'mode') {
    return NextResponse.json({ authMode: mode }, { status: mode === 'invalid' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  }
  if (mode === 'nextauth') return handler(request, context);
  if (mode !== 'gateway') return NextResponse.json({}, { status: 503 });
  if (nextauth.length !== 1 || nextauth[0] !== 'session') return NextResponse.json({}, { status: 404 });
  const session = await getGatewaySession();
  return NextResponse.json(session ?? {}, { status: session ? 200 : 401, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: NextRequest, context: Context) {
  if (authMode() !== 'nextauth') return NextResponse.json({ error: 'Use the gateway session' }, { status: 403 });
  return handler(request, context);
}
