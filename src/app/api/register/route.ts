import { NextResponse } from "next/server";
import { authMode } from "@/lib/gateway-identity";
import { hash } from "bcrypt";
import { prisma } from "@/lib/prisma";
import { generateRandomAvatar } from "@/lib/avatar-generator";

export async function POST(req: Request) {
  if (authMode() !== "nextauth") return NextResponse.json({ message: "Registration is unavailable" }, { status: 403 });
  try {
    const body = await req.json();
    const { name, email, password, team, currentFocus } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if the email is already registered
    const existingUser = await prisma.user.findUnique({
      where: {
        email
      }
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "Email already registered" },
        { status: 400 }
      );
    }

    // Hash the password
    const hashedPassword = await hash(password, 12);
    
    // Generate random avatar configuration
    const randomAvatar = generateRandomAvatar();

    // Create the new user with random avatar
    const user = await prisma.user.create({
      data: {
        name,
        email,
        hashedPassword,
        // The global role is never taken from the request: the schema default applies.
        team,
        currentFocus,
        // Add avatar configuration
        avatarSkinTone: randomAvatar.avatarSkinTone,
        avatarEyes: randomAvatar.avatarEyes,
        avatarBrows: randomAvatar.avatarBrows,
        avatarMouth: randomAvatar.avatarMouth,
        avatarNose: randomAvatar.avatarNose,
        avatarHair: randomAvatar.avatarHair,
        avatarEyewear: randomAvatar.avatarEyewear,
        avatarAccessory: randomAvatar.avatarAccessory,
        useCustomAvatar: true // Enable custom avatar by default
      },
      select: { id: true, name: true, email: true }
    });

    // Note: We don't create workspaces automatically anymore
    // Users will be directed to welcome page to create workspace manually
    console.log(`✅ User registered successfully: ${user.email}`);

    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}