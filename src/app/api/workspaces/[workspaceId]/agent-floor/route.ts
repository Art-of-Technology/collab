import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/request-session";
import { authOptions } from "@/lib/auth";
import { readAgentFloor } from "@/lib/agent-floor";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers },
    );
  const { workspaceId } = await params;
  try {
    const snapshot = await readAgentFloor(session.user.id, workspaceId);
    if (!snapshot)
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );
    return NextResponse.json(snapshot, { headers });
  } catch {
    return NextResponse.json(
      { error: "floor_unavailable" },
      { status: 503, headers },
    );
  }
}
