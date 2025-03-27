import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    return NextResponse.json({
      user
    });
  } catch (error) {
    console.error("[GET_CURRENT_USER_ERROR]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
} 