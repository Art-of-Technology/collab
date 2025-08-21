// app/api/sidebar/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { target, state } = await req.json() as {
      target: "desktop"; 
      state: "open" | "closed";
    };

    const res = NextResponse.json({ ok: true });

    if (target === "desktop") {
      res.cookies.set("sidebarDesktop", state, {
        path: "/",                   
        maxAge: 60 * 60 * 24 * 365,      // 1 year
        sameSite: "lax",
      });
    }

    return res;
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}