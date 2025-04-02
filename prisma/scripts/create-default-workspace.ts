import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting workspace initialization...');

  try {
    // Check if a default workspace already exists
    const existingWorkspace = await prisma.workspace.findFirst({
      where: { slug: 'default-workspace' },
    });

    if (existingWorkspace) {
      console.log(`Default workspace already exists: ${existingWorkspace.name} (${existingWorkspace.id})`);
      console.log('Checking for items not assigned to workspace...');
      
      // Update any remaining posts to be part of the default workspace
      const postUpdateCount = await prisma.post.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: existingWorkspace.id },
      });

      if (postUpdateCount.count > 0) {
        console.log(`Updated ${postUpdateCount.count} posts to be part of the default workspace`);
      }

      // Update any remaining tags to be part of the default workspace
      const tagUpdateCount = await prisma.tag.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: existingWorkspace.id },
      });

      if (tagUpdateCount.count > 0) {
        console.log(`Updated ${tagUpdateCount.count} tags to be part of the default workspace`);
      }

      // Update any remaining feature requests to be part of the default workspace
      const featureRequestUpdateCount = await prisma.featureRequest.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: existingWorkspace.id },
      });

      if (featureRequestUpdateCount.count > 0) {
        console.log(`Updated ${featureRequestUpdateCount.count} feature requests to be part of the default workspace`);
      }
      
      console.log('Workspace initialization completed successfully!');
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

    console.log(`Using user ${owner.name || owner.email} (${owner.id}) as workspace owner`);

    // Create the default workspace
    const defaultWorkspace = await prisma.workspace.create({
      data: {
        name: 'Default Workspace',
        slug: 'default-workspace',
        description: 'Default workspace containing all existing data',
        ownerId: owner.id,
      },
    });

    console.log(`Created default workspace: ${defaultWorkspace.name} (${defaultWorkspace.id})`);

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

    console.log(`Adding ${users.length} users as members to the default workspace...`);

    for (const user of users) {
      await prisma.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: defaultWorkspace.id,
          role: 'member',
        },
      });
    }

    // Update all existing posts to be part of the default workspace
    const postUpdateCount = await prisma.post.updateMany({
      where: {
        workspaceId: null,
      },
      data: {
        workspaceId: defaultWorkspace.id,
      },
    });

    console.log(`Updated ${postUpdateCount.count} posts to be part of the default workspace`);

    // Update all existing tags to be part of the default workspace
    const tagUpdateCount = await prisma.tag.updateMany({
      where: {
        workspaceId: null,
      },
      data: {
        workspaceId: defaultWorkspace.id,
      },
    });

    console.log(`Updated ${tagUpdateCount.count} tags to be part of the default workspace`);

    // Update all existing feature requests to be part of the default workspace
    const featureRequestUpdateCount = await prisma.featureRequest.updateMany({
      where: {
        workspaceId: null,
      },
      data: {
        workspaceId: defaultWorkspace.id,
      },
    });

    console.log(`Updated ${featureRequestUpdateCount.count} feature requests to be part of the default workspace`);

    console.log('Workspace initialization completed successfully!');
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