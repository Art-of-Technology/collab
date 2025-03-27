import { NextResponse } from "next/server";
import { hash } from "bcrypt";
import { prisma } from "@/lib/prisma";
import { generateRandomAvatar } from "@/lib/avatar-generator";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, role, team, currentFocus } = body;

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
        role: role || "developer",
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
      }
    });

    // Create a sanitized version without the password
    const { ...userWithoutPassword } = user;

    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}