import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  checks.GOOGLE_CLIENT_ID = {
    ok: !!process.env.GOOGLE_CLIENT_ID,
    detail: process.env.GOOGLE_CLIENT_ID
      ? `Set (${process.env.GOOGLE_CLIENT_ID.slice(0, 12)}...)`
      : "MISSING",
  };

  checks.GOOGLE_CLIENT_SECRET = {
    ok: !!process.env.GOOGLE_CLIENT_SECRET,
    detail: process.env.GOOGLE_CLIENT_SECRET ? "Set" : "MISSING",
  };

  checks.NEXTAUTH_SECRET = {
    ok: !!process.env.NEXTAUTH_SECRET,
    detail: process.env.NEXTAUTH_SECRET ? "Set" : "MISSING",
  };

  checks.NEXTAUTH_URL = {
    ok: !!process.env.NEXTAUTH_URL,
    detail: process.env.NEXTAUTH_URL || "MISSING",
  };

  let dbOk = false;
  let dbDetail = "";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    dbDetail = "Connected";
  } catch (e: unknown) {
    dbDetail = `Failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  checks.DATABASE = { ok: dbOk, detail: dbDetail };

  let googleReachable = false;
  let googleDetail = "";
  try {
    const res = await fetch(
      "https://accounts.google.com/.well-known/openid-configuration",
      { signal: AbortSignal.timeout(5000) }
    );
    googleReachable = res.ok;
    googleDetail = `HTTP ${res.status}`;
  } catch (e: unknown) {
    googleDetail = `Unreachable: ${e instanceof Error ? e.message : String(e)}`;
  }
  checks.GOOGLE_OAUTH_ENDPOINT = { ok: googleReachable, detail: googleDetail };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json({ healthy: allOk, checks }, { status: allOk ? 200 : 503 });
}
