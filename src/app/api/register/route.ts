import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcrypt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateRandomAvatar } from "@/lib/avatar-generator";
import { withRateLimit, createRateLimiter } from "@/lib/rate-limit";

// Throttle signups per IP to blunt account-creation spam / abuse.
const registerRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 registration attempts per minute per IP
  message: "Too many registration attempts, please try again later.",
});

// Only accept safe, self-service fields from the public registration body.
// `role` is intentionally NOT accepted here: it is a privileged authorization
// field (UserRole includes SYSTEM_ADMIN) and must never be client-controlled.
// New users always get the schema default (DEVELOPER).
const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(128),
    team: z.string().trim().max(100).optional(),
    currentFocus: z.string().trim().max(255).optional(),
  })
  .strict();

export const POST = withRateLimit(async function (req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid registration data" },
        { status: 400 }
      );
    }

    const { name, email, password, team, currentFocus } = parsed.data;

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

    // Create the new user with random avatar.
    // `role` is deliberately omitted so Prisma applies the low-privilege
    // default (DEVELOPER); it must not be set from the request body.
    const user = await prisma.user.create({
      data: {
        name,
        email,
        hashedPassword,
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

    // Note: We don't create workspaces automatically anymore
    // Users will be directed to welcome page to create workspace manually

    // Never return the password hash to the client.
    const { hashedPassword: _hashedPassword, ...safeUser } = user;

    return NextResponse.json(safeUser);
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}, registerRateLimit);