import { NextRequest, NextResponse } from "next/server";
import { getNoteComments, addNoteComment } from "@/actions/boardItemComment";

// Get all comments for a note - now using the unified comment system
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Use the unified getNoteComments function
    const result = await getNoteComments(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching note comments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Create a new comment for a note - now using the unified comment system
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { message, parentId } = body;

    // Use the unified addNoteComment function
    const comment = await addNoteComment(id, message, parentId);
    return NextResponse.json(comment);
  } catch (error) {
    console.error("Error creating note comment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
