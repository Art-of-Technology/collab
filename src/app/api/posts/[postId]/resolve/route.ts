import { NextResponse } from "next/server";
import { resolveBlockerPost } from "@/actions/post";

export async function PATCH(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const _params = await params;
    const { postId } = _params;

    const resolvedPost = await resolveBlockerPost(postId);

    return NextResponse.json(resolvedPost);
  } catch (error) {
    console.error("[POST_RESOLVE]", error);
    
    if (error instanceof Error) {
      if (error.message.includes("permission") || error.message.includes("access")) {
        return new NextResponse(error.message, { status: 403 });
      }
      if (error.message.includes("not found")) {
        return new NextResponse(error.message, { status: 404 });
      }
      if (error.message.includes("Only blocker posts")) {
        return new NextResponse(error.message, { status: 400 });
      }
      if (error.message.includes("Unauthorized")) {
        return new NextResponse(error.message, { status: 401 });
      }
    }
    
    return new NextResponse("Internal error", { status: 500 });
  }
} 