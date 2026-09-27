import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { NextResponse, type NextRequest } from 'next/server';
import { authMode } from '@/lib/gateway-identity';
import { getGatewaySession } from '@/lib/request-session';

const handler = NextAuth(authOptions);

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
