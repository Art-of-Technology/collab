import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MCP_APP_CONFIG = {
  name: 'Collab MCP Server',
  slug: 'collab-mcp',
  clientId: 'collab-mcp',
  publisherId: 'system', // System-owned app
  scopes: [
    'user:read',
    'workspace:read',
    'issues:read',
    'issues:write',
    'projects:read',
    'projects:write',
    'comments:read',
    'comments:write',
    'labels:read',
    'labels:write',
    'views:read',
  ],
};

async function setupMcpOAuthClient() {
  try {
    console.log('Setting up Collab MCP OAuth Client...\n');

    // Check if app already exists
    const existingApp = await prisma.app.findUnique({
      where: { slug: MCP_APP_CONFIG.slug },
      include: { oauthClient: true },
    });

    if (existingApp) {
      console.log(`App "${MCP_APP_CONFIG.name}" already exists (ID: ${existingApp.id})`);

      // Ensure it's marked as a system app
      if (!existingApp.isSystemApp) {
        await prisma.app.update({
          where: { id: existingApp.id },
          data: { isSystemApp: true, status: 'PUBLISHED' },
        });
        console.log('Updated app to be a system app');
      }

      // Ensure OAuth client exists
      if (!existingApp.oauthClient) {
        await prisma.appOAuthClient.create({
          data: {
            appId: existingApp.id,
            clientId: MCP_APP_CONFIG.clientId,
            clientType: 'public', // Public client (no secret needed for PKCE flow)
            tokenEndpointAuthMethod: 'none',
            redirectUris: [
              'http://127.0.0.1:19400/callback',
              'http://127.0.0.1:19401/callback',
              'http://127.0.0.1:19402/callback',
              'http://127.0.0.1:19403/callback',
              'http://127.0.0.1:19404/callback',
              'http://127.0.0.1:19405/callback',
              'http://127.0.0.1:19406/callback',
              'http://127.0.0.1:19407/callback',
              'http://127.0.0.1:19408/callback',
              'http://127.0.0.1:19409/callback',
              'http://localhost:19400/callback',
              'http://localhost:19401/callback',
              'http://localhost:19402/callback',
              'http://localhost:19403/callback',
              'http://localhost:19404/callback',
              'http://localhost:19405/callback',
              'http://localhost:19406/callback',
              'http://localhost:19407/callback',
              'http://localhost:19408/callback',
              'http://localhost:19409/callback',
            ],
            responseTypes: ['code'],
            grantTypes: ['authorization_code', 'refresh_token'],
          },
        });
        console.log('Created OAuth client');
      } else {
        console.log('OAuth client already exists');
      }

      console.log('\n✅ MCP OAuth Client is ready!');
      return;
    }

    // Create the app
    console.log('Creating new MCP app...');
    const app = await prisma.app.create({
      data: {
        name: MCP_APP_CONFIG.name,
        slug: MCP_APP_CONFIG.slug,
        publisherId: MCP_APP_CONFIG.publisherId,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        isSystemApp: true, // System app - available to all workspaces
      },
    });
    console.log(`Created app: ${app.name} (ID: ${app.id})`);

    // Create OAuth client
    console.log('Creating OAuth client...');
    const oauthClient = await prisma.appOAuthClient.create({
      data: {
        appId: app.id,
        clientId: MCP_APP_CONFIG.clientId,
        clientType: 'public', // Public client (no secret needed for PKCE flow)
        tokenEndpointAuthMethod: 'none',
        redirectUris: [
          // Support a range of ports for the localhost callback
          'http://127.0.0.1:19400/callback',
          'http://127.0.0.1:19401/callback',
          'http://127.0.0.1:19402/callback',
          'http://127.0.0.1:19403/callback',
          'http://127.0.0.1:19404/callback',
          'http://127.0.0.1:19405/callback',
          'http://127.0.0.1:19406/callback',
          'http://127.0.0.1:19407/callback',
          'http://127.0.0.1:19408/callback',
          'http://127.0.0.1:19409/callback',
          'http://localhost:19400/callback',
          'http://localhost:19401/callback',
          'http://localhost:19402/callback',
          'http://localhost:19403/callback',
          'http://localhost:19404/callback',
          'http://localhost:19405/callback',
          'http://localhost:19406/callback',
          'http://localhost:19407/callback',
          'http://localhost:19408/callback',
          'http://localhost:19409/callback',
        ],
        responseTypes: ['code'],
        grantTypes: ['authorization_code', 'refresh_token'],
      },
    });
    console.log(`Created OAuth client: ${oauthClient.clientId}`);

    // Create app scopes
    console.log('Creating app scopes...');
    for (const scope of MCP_APP_CONFIG.scopes) {
      await prisma.appScope.create({
        data: {
          appId: app.id,
          name: scope,
          description: getScopeDescription(scope),
        },
      });
    }
    console.log(`Created ${MCP_APP_CONFIG.scopes.length} scopes`);

    console.log('\n✅ MCP OAuth Client setup complete!');
    console.log('\nConfiguration:');
    console.log(`  App Name: ${MCP_APP_CONFIG.name}`);
    console.log(`  App Slug: ${MCP_APP_CONFIG.slug}`);
    console.log(`  Client ID: ${MCP_APP_CONFIG.clientId}`);
    console.log(`  Is System App: true`);
    console.log(`  Auth Method: PKCE (public client)`);

  } catch (error) {
    console.error('Error setting up MCP OAuth client:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    'user:read': 'Read your user profile',
    'workspace:read': 'Read workspace information',
    'issues:read': 'Read issues in workspace',
    'issues:write': 'Create and update issues',
    'projects:read': 'Read projects in workspace',
    'projects:write': 'Create and update projects',
    'comments:read': 'Read comments on issues',
    'comments:write': 'Create and update comments',
    'labels:read': 'Read labels in workspace',
    'labels:write': 'Create and update labels',
    'views:read': 'Read views in workspace',
  };
  return descriptions[scope] || scope;
}

// Run the script
setupMcpOAuthClient();
