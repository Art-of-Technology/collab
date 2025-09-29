import { NextRequest, NextResponse } from "next/server";
import { toggleBoardItemCommentLike } from "@/actions/boardItemComment";

// Toggle like on a comment - now using the unified comment system
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    
    // Use the unified toggleBoardItemCommentLike function
    const result = await toggleBoardItemCommentLike('note', id, commentId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error toggling comment like:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
