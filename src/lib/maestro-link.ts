import { authMode } from "@/lib/gateway-identity";
import type { OAuthConfig } from "next-auth/providers/oauth";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import type { prisma as appPrisma } from "@/lib/prisma";
import { decode, encode } from "next-auth/jwt";

export const MAESTRO_ISSUER = "https://auth.maestro-connect.com";
export const COLLAB_ORIGIN = "https://collab.weez.boo";
export const LINK_PATH = "/account/link-maestro";
export const LINK_COOKIE = "__Host-collab-maestro-link";
export const LINK_SECONDS = 300;
export const LINK_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export function maestroEnabled() {
  return authMode() === "nextauth" && process.env.MAESTRO_ENABLED === "true" && process.env.NEXTAUTH_URL === COLLAB_ORIGIN &&
    !!process.env.MAESTRO_CLIENT_ID && !!process.env.NEXTAUTH_SECRET;
}

export function safeAuthRedirect(url: string, baseUrl: string) {
  try {
    const origin = new URL(baseUrl).origin;
    if (url.startsWith("//") || /[\\\x00-\x20]/.test(url)) return origin;
    const target = new URL(url, origin);
    if (target.origin !== origin || target.username || target.password || target.pathname.startsWith("/api/auth/")) return origin;
    return target.href;
  } catch { return baseUrl; }
}

// Never emit OAuth profiles, tokens, upstream payloads or database errors.
export const safeAuthLogger = {
  error() { console.error("AUTH_FAILED"); },
  warn() { console.warn("AUTH_WARNING"); },
  debug() {},
};

export function maestroProvider(): OAuthConfig<Record<string, unknown>> {
  return {
    id: "maestro", name: "Maestro", type: "oauth",
    // Fixed metadata deliberately avoids discovery's unchecked issuer substitution.
    // This provider ID must never be repointed to another issuer.
    issuer: MAESTRO_ISSUER,
    authorization: { url: `${MAESTRO_ISSUER}/api/auth/oauth2/authorize`, params: { scope: "openid profile email" } },
    token: `${MAESTRO_ISSUER}/api/auth/oauth2/token`,
    userinfo: `${MAESTRO_ISSUER}/api/auth/oauth2/userinfo`,
    jwks_endpoint: `${MAESTRO_ISSUER}/api/auth/jwks`,
    clientId: process.env.MAESTRO_CLIENT_ID!,
    client: { token_endpoint_auth_method: "none", id_token_signed_response_alg: "RS256" },
    idToken: true, checks: ["state", "pkce", "nonce"],
    allowDangerousEmailAccountLinking: false,
    profile(profile) {
      if (profile.iss !== MAESTRO_ISSUER || typeof profile.sub !== "string" || !profile.sub ||
          profile.email_verified !== true || typeof profile.email !== "string" || !profile.email) {
        throw new Error("Invalid Maestro identity");
      }
      return { id: profile.sub, email: profile.email, name: typeof profile.name === "string" ? profile.name : null, image: null };
    },
  };
}

export type LinkIntent = {
  userId: string;
  googleAccountId: string;
  phase: "google" | "maestro";
  expires: number;
  state?: string;
};

export async function sealIntent(intent: LinkIntent) {
  return encode({ secret: process.env.NEXTAUTH_SECRET!, salt: LINK_COOKIE, token: intent, maxAge: LINK_SECONDS });
}

export async function readIntent(value?: string): Promise<LinkIntent | null> {
  if (!value || !process.env.NEXTAUTH_SECRET) return null;
  try {
    const token = await decode({ secret: process.env.NEXTAUTH_SECRET, salt: LINK_COOKIE, token: value });
    if (!token || typeof token.userId !== "string" || !token.userId || typeof token.googleAccountId !== "string" || !token.googleAccountId ||
        (token.phase !== "google" && token.phase !== "maestro") || typeof token.expires !== "number" ||
        token.expires <= Date.now() || token.expires > Date.now() + LINK_SECONDS * 1000 ||
        (token.state !== undefined && (typeof token.state !== "string" || !token.state))) return null;
    return token as LinkIntent;
  } catch { return null; }
}

export function callbackIntent(intent: LinkIntent | null, userId: string | undefined, provider: string, state: string | null) {
  return !!intent && intent.expires > Date.now() && intent.userId === userId && intent.phase === provider &&
    typeof intent.state === "string" && !!state && intent.state === state;
}

// Request-local permit, set only after verified OAuth + intent authorization.
export type LinkPermit = { userId: string; googleAccountId: string; subject: string; expires: number };
export function guardedMaestroAdapter(prisma: typeof appPrisma, adapter: Adapter, permit: () => LinkPermit | null): Adapter {
  return {
    ...adapter,
    createUser: async () => { throw new Error("Maestro requires an existing linked account"); },
    async linkAccount(account: AdapterAccount) {
      const allowed = permit();
      if (account.provider !== "maestro" || !allowed || account.userId !== allowed.userId || account.providerAccountId !== allowed.subject) {
        throw new Error("Maestro link denied");
      }
      return prisma.$transaction(async tx => {
        // Serialize competing subjects for the same local user across processes.
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${allowed.userId} FOR UPDATE`;
        if (rows.length !== 1 || allowed.expires <= Date.now()) throw new Error("Maestro link denied");
        const google = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: allowed.googleAccountId } } });
        if (!google || google.userId !== allowed.userId) throw new Error("Maestro link denied");
        const existing = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: "maestro", providerAccountId: allowed.subject } } });
        if (existing && existing.userId !== allowed.userId) throw new Error("Maestro link denied");
        const other = await tx.account.findFirst({ where: { provider: "maestro", userId: allowed.userId, providerAccountId: { not: allowed.subject } } });
        if (other) throw new Error("Maestro link denied");
        if (existing) return existing as AdapterAccount;
        // No OAuth tokens are needed for subsequent login; retain only identity.
        return await tx.account.create({ data: { userId: allowed.userId, type: "oauth", provider: "maestro", providerAccountId: allowed.subject } }) as AdapterAccount;
      }, { isolationLevel: "ReadCommitted" });
    },
  };
}
