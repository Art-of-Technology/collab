import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {

  try {
    // Check if a default workspace already exists
    const existingWorkspace = await prisma.workspace.findFirst({
      where: { slug: 'default-workspace' },
    });

    if (existingWorkspace) {
      return;
    }

    // Find an admin user to be the owner of the default workspace
    let owner = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    // If no admin user exists, use the first user available
    if (!owner) {
      owner = await prisma.user.findFirst();

      if (!owner) {
        throw new Error('No users found in the database to assign as workspace owner');
      }
    }
    // Create the default workspace
    const defaultWorkspace = await prisma.workspace.create({
      data: {
        name: 'Weezboo',
        slug: 'weezboo',
        description: 'We are a team who are passionate about creating great products',
        ownerId: owner.id,
      },
    });
    // Add the owner as a member with 'owner' role
    await prisma.workspaceMember.create({
      data: {
        userId: owner.id,
        workspaceId: defaultWorkspace.id,
        role: 'owner',
      },
    });

    // Add all other users as members of the default workspace
    const users = await prisma.user.findMany({
      where: {
        id: {
          not: owner.id,
        },
      },
    });

    for (const user of users) {
      await prisma.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: defaultWorkspace.id,
          role: 'member',
        },
      });
    }
  } catch (error) {
    console.error('Workspace initialization failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  }); 