import { NextResponse } from "next/server";
import { getPostActions } from "@/actions/post";

export async function GET(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const _params = await params;
    const { postId } = _params;

    const actions = await getPostActions(postId);

    return NextResponse.json(actions);
  } catch (error) {
    console.error("[POST_ACTIONS_GET]", error);
    
    if (error instanceof Error) {
      if (error.message.includes("access") || error.message.includes("permission")) {
        return new NextResponse(error.message, { status: 403 });
      }
      if (error.message.includes("not found")) {
        return new NextResponse(error.message, { status: 404 });
      }
      if (error.message.includes("Unauthorized")) {
        return new NextResponse(error.message, { status: 401 });
      }
    }
    
    return new NextResponse("Internal error", { status: 500 });
  }
} 